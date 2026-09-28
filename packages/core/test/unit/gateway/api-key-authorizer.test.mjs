import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { authorize, exchangeClaudeCodeWifToken, reserveApiKeyLimits, resolveApiKeyFromHeaders } from "@ccr/core/gateway/auth/api-key-authorizer.ts";

const authorizerSourceFile = path.join(
  process.cwd(),
  "packages",
  "core",
  "src",
  "gateway",
  "auth",
  "api-key-authorizer.ts"
);
const gatewayApiKey = "ccr-3f8a1c7d9e2b4056a1c7d9e2b4056f8a";

function configWithApiKeys(apiKeys) {
  const config = createDefaultAppConfig();
  config.APIKEYS = apiKeys;
  return config;
}

function createResponse() {
  const response = {
    payload: undefined,
    statusCode: undefined,
    end(chunk) {
      response.payload = JSON.parse(String(chunk));
    },
    writeHead(statusCode) {
      response.statusCode = statusCode;
    }
  };
  return response;
}

async function authorizeRequest(config, request) {
  const response = createResponse();
  const result = await authorize({ headers: {}, url: "/v1/messages", ...request }, response, config);
  return { response, result };
}

test("gateway authorization accepts the configured API key on every supported carrier", async () => {
  const config = configWithApiKeys([
    { createdAt: new Date(0).toISOString(), id: "primary", key: gatewayApiKey }
  ]);

  for (const request of [
    { headers: { authorization: `Bearer ${gatewayApiKey}` } },
    { headers: { "x-api-key": gatewayApiKey } },
    { headers: { "api-key": gatewayApiKey } },
    { headers: { "x-goog-api-key": gatewayApiKey } },
    { headers: { "x-mcp-key": gatewayApiKey } },
    { headers: { "x-codex-access-token": gatewayApiKey } },
    { url: `/__ccr/remote/status?api_key=${gatewayApiKey}` }
  ]) {
    const { response, result } = await authorizeRequest(config, request);

    assert.equal(result.ok, true);
    assert.equal(result.apiKey.id, "primary");
    assert.equal(response.statusCode, undefined);
  }
});

test("gateway authorization rejects near-miss tokens of any length without throwing", async () => {
  const config = configWithApiKeys([
    { createdAt: new Date(0).toISOString(), id: "primary", key: gatewayApiKey }
  ]);

  for (const token of [
    `X${gatewayApiKey.slice(1)}`,
    `${gatewayApiKey.slice(0, -1)}b`,
    gatewayApiKey.toUpperCase(),
    gatewayApiKey.slice(0, -1),
    `${gatewayApiKey}-extra`
  ]) {
    const { response, result } = await authorizeRequest(config, {
      headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(result.ok, false);
    assert.equal(response.statusCode, 401);
    assert.equal(response.payload.error.message, "Invalid API key.");
  }
});

test("gateway authorization separates a missing token from an expired key", async () => {
  const config = configWithApiKeys([
    {
      createdAt: new Date(0).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      id: "expired",
      key: gatewayApiKey
    }
  ]);

  const missing = await authorizeRequest(config, {});
  assert.equal(missing.result.ok, false);
  assert.equal(missing.response.statusCode, 401);
  assert.equal(missing.response.payload.error.message, "API key is missing.");

  const expired = await authorizeRequest(config, {
    headers: { authorization: `Bearer ${gatewayApiKey}` }
  });
  assert.equal(expired.result.ok, false);
  assert.equal(expired.response.statusCode, 401);
  assert.equal(expired.response.payload.error.message, "API key is expired.");
});

test("linked keys require an active profile across gateway authentication and WIF exchange", async () => {
  const key = { createdAt: new Date(0).toISOString(), id: "linked-key", key: "linked-profile-token", profileId: "work" };
  const config = configWithApiKeys([key]);
  const profile = { agent: "codex", enabled: true, id: "work", model: "Provider/model", name: "Work" };
  config.profile = { ...config.profile, enabled: true, profiles: [profile] };
  const headers = { authorization: `Bearer ${key.key}` };
  const wifBody = Buffer.from(JSON.stringify({ assertion: key.key, grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer" }));

  assert.equal((await authorizeRequest(config, { headers })).result.apiKey.profileId, "work");
  assert.equal((await resolveApiKeyFromHeaders(headers, config, { includePersisted: false })).id, key.id);
  assert.equal((await exchangeClaudeCodeWifToken(config, wifBody, { includePersisted: false })).statusCode, 200);

  for (const state of [
    { enabled: true, profiles: [{ ...profile, enabled: false }] },
    { enabled: false, profiles: [profile] },
    { enabled: true, profiles: [] }
  ]) {
    config.profile = { ...config.profile, ...state };
    const denied = await authorizeRequest(config, { headers });
    assert.equal(denied.result.ok, false);
    assert.equal(denied.response.statusCode, 403);
    assert.equal(await resolveApiKeyFromHeaders(headers, config, { includePersisted: false }), undefined);
    assert.equal((await exchangeClaudeCodeWifToken(config, wifBody, { includePersisted: false })).statusCode, 401);
  }
});

test("keys linked to the same profile keep independent request limits", () => {
  const keys = ["linked-limit-a", "linked-limit-b"].map((id) => ({
    createdAt: new Date(0).toISOString(), id, key: `${id}-token`, profileId: "work",
    limits: { maxRequests: 1, windowMs: 60_000 }
  }));
  const request = { method: "POST" };
  const body = Buffer.from('{"model":"Provider/model"}');
  assert.equal(reserveApiKeyLimits(keys[0], request, createResponse(), body), true);
  const denied = createResponse();
  assert.equal(reserveApiKeyLimits(keys[0], request, denied, body), false);
  assert.equal(denied.statusCode, 429);
  assert.equal(reserveApiKeyLimits(keys[1], request, createResponse(), body), true);
});

test("Claude Code WIF token exchange returns a bearer token for a configured profile key", async () => {
  const config = configWithApiKeys([
    { createdAt: new Date(0).toISOString(), id: "profile:claude", key: gatewayApiKey }
  ]);

  const result = await exchangeClaudeCodeWifToken(config, Buffer.from(JSON.stringify({
    assertion: gatewayApiKey,
    federation_rule_id: "ccr-local",
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    organization_id: "ccr-local"
  })));

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.payload, {
    access_token: gatewayApiKey,
    expires_in: 3600,
    token_type: "Bearer"
  });
});

test("Claude Code WIF token exchange rejects invalid assertions", async () => {
  const config = configWithApiKeys([
    { createdAt: new Date(0).toISOString(), id: "profile:claude", key: gatewayApiKey }
  ]);

  const result = await exchangeClaudeCodeWifToken(config, Buffer.from(new URLSearchParams({
    assertion: `${gatewayApiKey}-wrong`,
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer"
  }).toString()));

  assert.equal(result.statusCode, 401);
  assert.equal(result.payload.error, "invalid_grant");
});

// A constant-time comparison is behaviour-preserving by construction, so the
// tests above pass on both sides of the change and only prove there is no
// regression. The invariant itself is asserted on the module source, the same
// way test/architecture/gateway-service-architecture.test.mjs asserts that the
// config compiler never reaches for node:fs.
test("gateway API key matching never uses a short-circuiting equality check", () => {
  const source = readFileSync(authorizerSourceFile, "utf8");

  assert.match(source, /from "node:crypto"/);
  assert.match(source, /timingSafeEqual\(/);
  assert.doesNotMatch(source, /\.key\s*===/);
});
