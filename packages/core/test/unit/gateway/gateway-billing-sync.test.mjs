import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { compileCoreGatewayConfig } from "@ccr/core/gateway/core-runtime/config-compiler.ts";
import { rawTraceSyncHeader, rawTraceSyncPath } from "@ccr/core/gateway/internal/shared.ts";
import { publicGatewayAuthTokens } from "@ccr/core/gateway/core-runtime/supervisor.ts";

test("core gateway disables the full-trace billing webhook without disabling raw-trace observability", async () => {
  const config = createDefaultAppConfig();
  config.gateway.host = "0.0.0.0";
  config.gateway.port = 4567;
  config.observability.requestLogs = true;

  const compiled = await compileCoreGatewayConfig(
    config,
    "raw-trace-token",
    "billing-usage-token",
    "core-auth-token"
  );

  assert.deepEqual(compiled.billingWebhook, { enabled: false });
  assert.deepEqual(compiled.billingQueue, { enabled: false });
  assert.deepEqual(compiled.billing, { enabled: true });
  const upstreamHeaderSanitizer = compiled.plugins?.at(-1);
  assert.equal(upstreamHeaderSanitizer?.enabled, true);
  assert.equal(upstreamHeaderSanitizer?.key, "ccr-upstream-header-sanitizer");
  assert.match(upstreamHeaderSanitizer?.modulePath, /upstream-header-sanitizer\.js$/);
  assert.equal(compiled.rawTrace?.enabled, true);
  assert.deepEqual(compiled.rawTrace?.sync, {
    enabled: true,
    endpoint: `http://127.0.0.1:4567${rawTraceSyncPath}`,
    headers: { [rawTraceSyncHeader]: "raw-trace-token" },
    timeoutMs: 5_000
  });
});

test("core gateway public mode listens on the public gateway endpoint and accepts user API keys", async () => {
  const config = createDefaultAppConfig();
  config.gateway.host = "127.0.0.1";
  config.gateway.port = 4567;
  config.gateway.coreHost = "127.0.0.1";
  config.gateway.corePort = 4568;
  config.APIKEY = "client-key";
  config.APIKEYS = [{ createdAt: new Date(0).toISOString(), id: "client", key: "client-key" }];

  const compiled = await compileCoreGatewayConfig(
    config,
    "raw-trace-token",
    "billing-usage-token",
    "core-auth-token",
    undefined,
    undefined,
    {
      publicGatewayMode: true,
      runtimeHost: config.gateway.host,
      runtimePort: config.gateway.port
    }
  );

  assert.equal(compiled.host, "127.0.0.1");
  assert.equal(compiled.port, 4567);
  assert.equal(compiled.auth.staticApiKeys.keyHeader, "authorization");
  assert.deepEqual(compiled.auth.staticApiKeys.keys, ["core-auth-token", "client-key"]);
  assert.deepEqual(publicGatewayAuthTokens(config, "core-auth-token"), ["core-auth-token", "client-key"]);
  assert.equal(compiled.rawTrace.enabled, true);
  assert.equal(compiled.rawTrace.mode, "body_redacted");
});

test("Codex OAuth providers remove unsupported Responses request fields", async () => {
  const config = createDefaultAppConfig();
  config.providerPlugins = [{
    codexOauth: {},
    enabled: true,
    key: "ccr-local-agent-codex-oauth-test",
    providerName: "Codex API::openai_responses",
    request: {
      bodyRemove: ["custom-field"]
    }
  }];

  const compiled = await compileCoreGatewayConfig(
    config,
    "raw-trace-token",
    "billing-usage-token",
    "core-auth-token"
  );
  const plugin = compiled.providerPlugins.find((item) => item.key === "ccr-local-agent-codex-oauth-test");

  assert.deepEqual(plugin.request.bodyRemove, ["custom-field", "max_output_tokens", "stop"]);
});
