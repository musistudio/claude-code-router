import assert from "node:assert/strict";
import test from "node:test";
import {
  createGatewayPlugin,
  sanitizeUpstreamProviderHeaders
} from "@ccr/core/gateway/core-runtime/upstream-header-sanitizer.ts";

test("provider boundary removes CCR-owned headers and preserves provider headers", () => {
  assert.deepEqual(sanitizeUpstreamProviderHeaders({
    authorization: "Bearer provider-token",
    "X-Auth-API-Key-ID": "profile:claude",
    "x-auth-sub": "profile:claude",
    "x-auth-token": "provider-specific-token",
    "x-ccr-core-auth": "core-secret",
    "X-CCR-Route-Reason": "rule:claude",
    "x-client-request-id": "request-1"
  }), {
    authorization: "Bearer provider-token",
    "x-auth-token": "provider-specific-token",
    "x-client-request-id": "request-1"
  });
});

test("gateway sanitizer hook runs on the final upstream request shape", async () => {
  const [hook] = createGatewayPlugin().providerHooks;
  const upstreamRequest = {
    body: { model: "provider-model" },
    headers: {
      "content-type": "application/json",
      "x-ccr-provider-credential-id": "credential-id",
      "x-auth-api-key-id": "profile:codex"
    },
    method: "POST",
    url: "https://provider.example/v1/responses"
  };

  const result = await hook.transformRequest({ upstreamRequest });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    ...upstreamRequest,
    headers: { "content-type": "application/json" }
  });
  assert.equal(upstreamRequest.headers["x-ccr-provider-credential-id"], "credential-id");
});
