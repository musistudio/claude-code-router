import assert from "node:assert/strict";
import test from "node:test";
import { codexAppUsageInjectionScript, codexNativeUsageData, codexUsageMeterMath, readCodexAppUsage } from "@ccr/core/agents/codex/app-usage.ts";

const profile = { id: "codex", agent: "codex", enabled: true, model: "DeepSeek/chat", name: "Codex" };
const config = {
  Providers: [
    { name: "DeepSeek", models: ["chat"], api_key: "must-not-reach-renderer" },
    { name: "Coding Plan", models: ["coder"] }
  ],
  profile: { enabled: true, profiles: [profile] },
  virtualModelProfiles: []
};
const meter = (overrides = {}) => ({ id: "balance", kind: "balance", label: "Balance", remaining: 0, unit: "CNY", ...overrides });
const snapshot = (meters, overrides = {}) => ({ provider: "DeepSeek", meters, status: "ok", source: "http-json", updatedAt: "2026-11-17T00:00:00Z", ...overrides });

test("Codex sidebar queries the default or selected model's provider and strips connector diagnostics", async () => {
  const queried = [];
  const read = async provider => {
    queried.push(provider);
    return [snapshot([meter()], { provider, message: "secret diagnostic", errors: [{ message: "secret URL" }] })];
  };
  const initial = await readCodexAppUsage(config, profile, undefined, read);
  assert.equal(initial.provider, "DeepSeek");
  assert.equal(initial.snapshots[0].meters[0].remaining, 0);
  const selected = await readCodexAppUsage(config, profile, "Coding Plan/coder", read);
  assert.equal(selected.provider, "Coding Plan");
  assert.deepEqual(queried, ["DeepSeek", "Coding Plan"]);
  assert.doesNotMatch(JSON.stringify([initial, selected]), /secret|must-not-reach-renderer/);
});

test("unknown, disallowed and disabled models never query an unrelated supplier", async () => {
  const read = async () => { assert.fail("must not fetch accounts"); };
  assert.equal((await readCodexAppUsage(config, profile, "Missing/chat", read)).provider, undefined);
  const restricted = { ...profile, availableModels: ["DeepSeek/chat"] };
  assert.equal((await readCodexAppUsage(config, restricted, "Coding Plan/coder", read)).provider, undefined);
  assert.equal((await readCodexAppUsage(config, { ...profile, enabled: false }, undefined, read)).enabled, false);
  assert.equal((await readCodexAppUsage({ ...config, profile: { enabled: false } }, profile, undefined, read)).enabled, false);
});

test("virtual models show their underlying provider's allowance", async () => {
  const virtualConfig = {
    ...config,
    virtualModelProfiles: [{ enabled: true, key: "thinking", match: { exactAliases: ["thinking"] }, baseModel: { mode: "fixed", fixedModel: "Coding Plan/coder" } }]
  };
  const usage = await readCodexAppUsage(virtualConfig, profile, "Fusion/thinking", async provider => {
    assert.equal(provider, "Coding Plan");
    return [];
  });
  assert.equal(usage.provider, "Coding Plan");
});

test("remaining amounts retain zero and debt, derive quota correctly, and never invent missing limits", () => {
  const { remaining, percent, primary } = codexUsageMeterMath();
  assert.equal(remaining(meter()), 0);
  assert.equal(remaining(meter({ remaining: -2 })), -2);
  assert.equal(remaining(meter({ remaining: undefined, limit: 200, used: 46 })), 154);
  assert.equal(percent(meter({ remaining: undefined, limit: 200, used: 46 })), 77);
  assert.equal(percent(meter({ remaining: 77, unit: "%" })), 77);
  assert.equal(percent(meter({ remaining: 0, limit: 200 })), 0);
  assert.equal(percent(meter({ remaining: 10, limit: 0 })), undefined);
  assert.equal(percent(meter({ remaining: -1, limit: 100 })), 0);
  assert.equal(percent(meter({ remaining: 200, limit: 100 })), 100);
  assert.equal(percent(meter()), undefined);
  assert.equal(remaining(meter({ remaining: NaN })), undefined);
  const quota = meter({ id: "weekly", kind: "quota", remaining: 77, limit: 100, unit: "%" });
  const balance = meter({ remaining: 12 });
  assert.equal(primary([snapshot([quota, balance])]), balance);
  assert.equal(primary([snapshot([quota])]), quota);
  assert.equal(primary([snapshot([meter({ remaining: undefined })])]), undefined);
  assert.equal(primary([snapshot([balance]), snapshot([meter({ remaining: 100 })])]), balance);
});

test("desktop bootstrap is valid JavaScript and does not embed account secrets or require network/CSP bypasses", () => {
  const script = codexAppUsageInjectionScript({ model: profile.model, models: [profile.model] });
  assert.doesNotThrow(() => new Function(script));
  assert.doesNotMatch(script, /innerHTML|createElement|style\.|\.hidden|fetch\(|setBypassCSP|must-not-reach-renderer/);
});

test("official usage payload exposes supplier labels, real quota windows and separate balance rows", () => {
  const usage = { model: "DeepSeek/chat", provider: "DeepSeek", models: [], snapshots: [snapshot([
    meter({ remaining: 12.34 }),
    meter({ id: "weekly", kind: "quota", remaining: 77, used: 23, limit: 100, unit: "%", window: "weekly", resetAt: "2026-11-24T00:00:00Z" })
  ])] };
  const native = codexNativeUsageData(usage);
  assert.equal(native.ambient_usage.default.source.heading, "额度来源：DeepSeek");
  assert.equal(native.credits.balance, "12.34");
  assert.equal(native.rate_limit.primary_window.used_percent, 23);
  assert.equal(native.rate_limit.primary_window.limit_window_seconds, 604800);
  assert.equal(native.rate_limit.primary_window.reset_at, Date.parse("2026-11-24T00:00:00Z") / 1000);
  assert.equal(native.rate_limit.secondary_window, null);
  assert.equal(native.ambient_usage.default.menu.actions.length, 0);
  const daily = codexNativeUsageData({ ...usage, snapshots: [snapshot([meter({ kind: "quota", remaining: 10, limit: 20, window: "daily" })])] });
  assert.equal(daily.rate_limit.primary_window.limit_window_seconds, 86400);
  assert.equal(daily.rate_limit.secondary_window, null);
  const unknown = codexNativeUsageData({ ...usage, snapshots: [] });
  assert.equal(unknown.credits, null);
  assert.equal(unknown.rate_limit.primary_window, null);
});

test("usage details keep model names compact and omit unavailable windows without inventing a weekly quota", () => {
  const model = "Zhipu AI (China) - Coding Plan/glm-4.5-air";
  const native = codexNativeUsageData({ model, provider: "Zhipu AI (China) - Coding Plan", models: [model], snapshots: [snapshot([
    meter({ id: "5h", kind: "quota", label: "5h quota", remaining: 99, limit: 100, unit: "%", window: "5h", resetAt: "2026-11-17T10:26:29Z" }),
    meter({ id: "weekly", kind: "quota", label: "Weekly quota", remaining: undefined, window: "weekly" })
  ])] });
  const rows = native.ambient_usage.default.menu.rows;
  assert.equal(rows.find(row => row.label === "5小时额度").value.text, "剩余 99%");
  assert.equal(rows.some(row => /Weekly|每周|当前模型/.test(row.label)), false);
  assert.equal(rows.find(row => row.label === "模型").value.text, "glm-4.5-air");
  assert.equal(rows.find(row => row.label === "模型").hover.text, model);
  assert.doesNotMatch(rows.find(row => row.label === "更新").value.text, /2026|AM|PM/);
  assert.equal(native.rate_limit.primary_window.limit_window_seconds, 18000);
  assert.equal(native.rate_limit.secondary_window, null);
});
