import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { importKimiProvider, kimiCandidates } from "@ccr/core/agents/local-providers/kimi.ts";

test("Kimi CLI OAuth login is discovered from inline TOML and imported", async () => {
  await withKimiHome(async (kimiHome) => {
    writeFileSync(path.join(kimiHome, "config.toml"), `
default_model = "kimi-code/k3"

[providers."managed:kimi-code"]
type = "kimi"
base_url = "https://api.kimi.com/coding/v1"
api_key = ""
oauth = { storage = "file", key = "oauth/kimi-code" }

[models."kimi-code/k3"]
provider = "managed:kimi-code"
model = "k3"
display_name = "K3"
max_context_size = 1048576
support_efforts = ["max"]
default_effort = "max"
`);
    mkdirSync(path.join(kimiHome, "credentials"), { recursive: true });
    writeFileSync(path.join(kimiHome, "credentials", "kimi-code.json"), JSON.stringify({
      access_token: "kimi-access-token",
      expires_at: 32503680000,
      expires_in: 3600,
      refresh_token: "kimi-refresh-token",
      scope: "openid",
      token_type: "Bearer"
    }));

    const [candidate] = kimiCandidates();
    assert.equal(candidate.kind, "kimi");
    assert.equal(candidate.status, "available");
    assert.equal(candidate.importable, true);
    assert.equal(candidate.protocol, "openai_chat_completions");
    assert.deepEqual(candidate.models, ["k3"]);
    assert.deepEqual(candidate.modelDisplayNames, { k3: "K3" });
    assert.deepEqual(candidate.modelMetadata, {
      k3: {
        contextWindow: 1048576,
        defaultReasoningLevel: "max",
        maxContextWindow: 1048576,
        supportedReasoningLevels: [{ description: "max", effort: "max" }]
      }
    });

    const result = await importKimiProvider(candidate, []);
    assert.equal(result.provider.name, "Kimi CLI OAuth");
    assert.equal(result.provider.baseUrl, "https://api.kimi.com/coding/v1");
    assert.equal(result.provider.apiKey, "ccr-local-agent-login");
    assert.equal(result.provider.account?.enabled, true);
    assert.equal(result.providerPlugins.length, 2);
    assert.match(result.providerPlugins[0].key, /kimi-cli-oauth$/);
    assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer kimi-access-token");
    assert.deepEqual(result.providerPlugins[0].kimiOauth, { key: "oauth/kimi-code" });
    assert.equal(result.providerPlugins[0].request.headers["User-Agent"], "kimi-code-cli/0.27.0-test");
    assert.equal(result.providerPlugins[0].request.headers["X-Msh-Platform"], "kimi_code_cli");
    assert.ok(result.providerPlugins[0].request.headers["X-Msh-Device-Id"]);
    assert.equal(result.providerPlugins[1].providerName, "__CCR_PROVIDER_INTERNAL_NAME__");
  });
});

test("Kimi CLI API key provider supports custom names and env sub-tables", async () => {
  await withKimiHome(async (kimiHome) => {
    writeFileSync(path.join(kimiHome, "config.toml"), `
[providers.production]
type = "kimi"
base_url = ""
api_key = ""

[providers.production.env]
KIMI_API_KEY = "kimi-api-key"
KIMI_BASE_URL = "https://proxy.example.test/v1/"

[models.production]
provider = "production"
model = "kimi-custom"
`);

    const [candidate] = kimiCandidates();
    assert.equal(candidate.id, "kimi-cli-production");
    assert.equal(candidate.importable, true);
    assert.deepEqual(candidate.models, ["kimi-custom"]);

    const result = await importKimiProvider(candidate, []);
    assert.equal(result.provider.name, "Kimi CLI · production");
    assert.equal(result.provider.baseUrl, "https://proxy.example.test/v1");
    assert.match(result.providerPlugins[0].key, /kimi-cli-api-key$/);
    assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer kimi-api-key");
  });
});

test("Kimi CLI OAuth import refreshes and atomically persists an expired token", async (t) => {
  await withKimiHome(async (kimiHome) => {
    writeFileSync(path.join(kimiHome, "config.toml"), `
[providers."managed:kimi-code"]
type = "kimi"
base_url = "https://api.kimi.com/coding/v1"
oauth = { storage = "file", key = "oauth/kimi-code", oauth_host = "http://127.0.0.1" }
`);
    const credentialsDir = path.join(kimiHome, "credentials");
    mkdirSync(credentialsDir, { recursive: true });
    const credentialFile = path.join(credentialsDir, "kimi-code.json");
    writeFileSync(credentialFile, JSON.stringify({
      access_token: "expired-token",
      expires_at: 1,
      expires_in: 3600,
      refresh_token: "refresh-token"
    }));

    const previousFetch = globalThis.fetch;
    let requestBody = "";
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), "http://127.0.0.1/api/oauth/token");
      requestBody = String(init?.body ?? "");
      assert.equal(init?.headers?.["X-Msh-Platform"], "kimi_code_cli");
      return new Response(JSON.stringify({
        access_token: "refreshed-access-token",
        expires_in: 7200,
        refresh_token: "refreshed-refresh-token",
        token_type: "Bearer"
      }), { headers: { "content-type": "application/json" }, status: 200 });
    };
    t.after(() => {
      globalThis.fetch = previousFetch;
    });

    const [candidate] = kimiCandidates();
    assert.equal(candidate.importable, true);
    const result = await importKimiProvider(candidate, []);
    assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer refreshed-access-token");
    assert.equal(requestBody, "client_id=17e5f671-d194-4dfb-9706-5516cb48c098&grant_type=refresh_token&refresh_token=refresh-token");

    const persisted = JSON.parse(readFileSync(credentialFile, "utf8"));
    assert.equal(persisted.access_token, "refreshed-access-token");
    assert.equal(persisted.refresh_token, "refreshed-refresh-token");
    assert.equal(persisted.expires_in, 7200);
  });
});

async function withKimiHome(run) {
  const kimiHome = mkdtempSync(path.join(os.tmpdir(), "ccr-kimi-provider-"));
  const previous = {
    KIMI_CODE_BASE_URL: process.env.KIMI_CODE_BASE_URL,
    KIMI_CODE_HOME: process.env.KIMI_CODE_HOME,
    KIMI_CODE_OAUTH_HOST: process.env.KIMI_CODE_OAUTH_HOST,
    KIMI_CODE_VERSION: process.env.KIMI_CODE_VERSION,
    KIMI_OAUTH_HOST: process.env.KIMI_OAUTH_HOST
  };
  process.env.KIMI_CODE_HOME = kimiHome;
  process.env.KIMI_CODE_VERSION = "0.27.0-test";
  delete process.env.KIMI_CODE_BASE_URL;
  delete process.env.KIMI_CODE_OAUTH_HOST;
  delete process.env.KIMI_OAUTH_HOST;
  try {
    await run(kimiHome);
  } finally {
    restoreEnv("KIMI_CODE_BASE_URL", previous.KIMI_CODE_BASE_URL);
    restoreEnv("KIMI_CODE_HOME", previous.KIMI_CODE_HOME);
    restoreEnv("KIMI_CODE_OAUTH_HOST", previous.KIMI_CODE_OAUTH_HOST);
    restoreEnv("KIMI_CODE_VERSION", previous.KIMI_CODE_VERSION);
    restoreEnv("KIMI_OAUTH_HOST", previous.KIMI_OAUTH_HOST);
    rmSync(kimiHome, { force: true, recursive: true });
  }
}

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
