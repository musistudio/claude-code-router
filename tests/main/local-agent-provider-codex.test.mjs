import assert from "node:assert/strict";
import test from "node:test";
import { codexProviderAccountConfig } from "../../src/main/local-agent-providers/codex.ts";

test("Codex provider account config includes manual reset meter", () => {
  const config = codexProviderAccountConfig();
  const usageConnector = config.connectors.find((connector) => connector.type === "http-json" && connector.endpoint.endsWith("/wham/usage"));
  assert.ok(usageConnector);

  const meters = usageConnector.mapping.meters;
  const manualResetMeter = meters.find((meter) => meter.id === "codex_manual_resets");
  assert.ok(manualResetMeter);
  assert.equal(manualResetMeter.label, "Manual resets");
  assert.equal(manualResetMeter.unit, "resets");
  assert.equal(manualResetMeter.window, "manual-reset");
  assert.ok(Array.isArray(manualResetMeter.remaining));
  assert.ok(manualResetMeter.remaining.includes("$.resetsAvailable"));
  assert.ok(manualResetMeter.remaining.includes("$.availableRateLimitResetCount"));
  assert.ok(manualResetMeter.remaining.includes("$.rate_limit.manual_resets.remaining"));
  assert.ok(Array.isArray(manualResetMeter.resetAt));
  assert.ok(manualResetMeter.resetAt.includes("$.resetExpires"));
  assert.ok(manualResetMeter.resetAt.includes("$.expires_at"));
  assert.ok(manualResetMeter.resetAt.includes("$.rate_limit.manual_resets.expires_at"));
  assert.ok(manualResetMeter.resetAt.includes("$.manual_resets.reset_at"));
});

test("Codex quota meters accept reset_at and resets_at usage shapes", () => {
  const config = codexProviderAccountConfig();
  const usageConnector = config.connectors.find((connector) => connector.type === "http-json" && connector.endpoint.endsWith("/wham/usage"));
  const primaryQuota = usageConnector.mapping.meters.find((meter) => meter.id === "codex_primary_quota");
  const secondaryQuota = usageConnector.mapping.meters.find((meter) => meter.id === "codex_secondary_quota");

  assert.ok(Array.isArray(primaryQuota.resetAt));
  assert.ok(primaryQuota.resetAt.includes("$.rate_limit.primary_window.reset_at"));
  assert.ok(primaryQuota.resetAt.includes("$.rate_limit.primary_window.resets_at"));
  assert.ok(primaryQuota.resetAt.includes("$.rate_limits.primary.resets_at"));
  assert.ok(Array.isArray(secondaryQuota.resetAt));
  assert.ok(secondaryQuota.resetAt.includes("$.rate_limit.secondary_window.reset_at"));
  assert.ok(secondaryQuota.resetAt.includes("$.rate_limit.secondary_window.resets_at"));
  assert.ok(secondaryQuota.resetAt.includes("$.rate_limits.secondary.resets_at"));
});
