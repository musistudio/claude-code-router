import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { compileCoreGatewayConfig } from "@ccr/core/gateway/core-runtime/config-compiler.ts";
import { rawTraceSyncHeader, rawTraceSyncPath } from "@ccr/core/gateway/internal/shared.ts";

test("core gateway disables the full-trace billing webhook without disabling raw-trace observability", async () => {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-generated-config.json" });
  config.gateway.host = "0.0.0.0";
  config.gateway.port = 4567;
  config.observability.requestLogs = true;
  const previousRawTraceEnabled = process.env.CCR_RAW_TRACE_ENABLED;
  process.env.CCR_RAW_TRACE_ENABLED = "1";

  try {
    const compiled = await compileCoreGatewayConfig(
      config,
      "raw-trace-token",
      "billing-usage-token",
      "core-auth-token"
    );

    assert.deepEqual(compiled.billingWebhook, { enabled: false });
    assert.deepEqual(compiled.billingQueue, { enabled: false });
    assert.deepEqual(compiled.billing, { enabled: true });
    assert.equal(compiled.rawTrace?.enabled, true);
    assert.deepEqual(compiled.rawTrace?.sync, {
      enabled: true,
      endpoint: `http://127.0.0.1:4567${rawTraceSyncPath}`,
      headers: { [rawTraceSyncHeader]: "raw-trace-token" },
      timeoutMs: 5_000
    });
  } finally {
    if (previousRawTraceEnabled === undefined) {
      delete process.env.CCR_RAW_TRACE_ENABLED;
    } else {
      process.env.CCR_RAW_TRACE_ENABLED = previousRawTraceEnabled;
    }
  }
});
