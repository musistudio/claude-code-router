import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config";
import { configsEqual, createConfigSaveQueue, mergeSavedApiKeys, reconcileSavedConfig } from "@ccr/ui/pages/home/shared/config-persistence";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("failed provider writes leave the draft unchanged and can be retried once", async () => {
  const queue = createConfigSaveQueue();
  let draft = createDefaultAppConfig();
  const initial = draft;
  const candidate = { ...draft, Providers: [{ name: "New provider", models: ["demo"] }] };
  const firstWrite = deferred<typeof draft>();
  const failure = queue.run(() => firstWrite.promise, (saved) => { draft = saved; });
  assert.equal(draft, initial, "the candidate must stay outside the global draft while saving");
  const rejection = assert.rejects(failure, /storage unavailable/);
  firstWrite.reject(new Error("storage unavailable"));
  await rejection;
  assert.equal(draft, initial, "closing the failed form has no change to discard from global state");

  await queue.run(async () => candidate, (saved) => { draft = saved; });
  assert.deepEqual(draft.Providers.map((provider) => provider.name), ["New provider"]);
});

test("live tray token rate is opt-in and survives config reconciliation", () => {
  const base = createDefaultAppConfig();
  assert.equal(base.trayShowTokenRate, false);
  const draft = { ...base, trayShowTokenRate: true };
  const saved = structuredClone(base);
  const next = reconcileSavedConfig(base, draft, saved);
  assert.equal(next.trayShowTokenRate, true);
});

test("API key writes wait for configuration writes and their commit", async () => {
  const queue = createConfigSaveQueue();
  const write = deferred<number>();
  const events: string[] = [];
  const configWrite = queue.run(() => {
    events.push("config start");
    return write.promise;
  }, () => { events.push("config commit"); });
  const keyWrite = queue.run(async () => {
    events.push("keys start");
    return 2;
  }, () => { events.push("keys commit"); });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ["config start"]);
  write.resolve(1);
  await Promise.all([configWrite, keyWrite]);
  assert.deepEqual(events, ["config start", "config commit", "keys start", "keys commit"]);
});

test("a save response preserves newer settings while committing a provider addition", () => {
  const base = createDefaultAppConfig();
  const draft = structuredClone(base);
  draft.gateway.port = 4567;
  draft.Router.fallback.models = ["Second/new-model"];
  const saved = structuredClone(base);
  saved.Providers.push({ id: "new-provider", name: "New Provider", models: ["demo"] });
  saved.gateway.corePort = 4568;
  const next = reconcileSavedConfig(base, draft, saved);
  assert.equal(next.gateway.port, 4567);
  assert.equal(next.gateway.corePort, 4568);
  assert.equal(next.Providers[0].id, "new-provider");
  assert.deepEqual(next.Router.fallback.models, ["Second/new-model"]);
  assert.equal(base.Providers.length, 0);
});

test("reverting an in-flight setting survives its response", () => {
  const base = { ...createDefaultAppConfig(), launchAtLogin: true };
  const draft = { ...base, launchAtLogin: false };
  const next = reconcileSavedConfig(base, draft, structuredClone(base));
  assert.equal(next.launchAtLogin, false);
  assert.equal(reconcileSavedConfig(base, base, next), next);
});

test("a concurrent provider edit preserves a successfully saved provider addition", () => {
  const base = createDefaultAppConfig();
  base.Providers = [{ id: "existing", name: "Existing", models: ["demo"], api_key: "old-key" }];
  const draft = structuredClone(base);
  draft.Providers[0].api_key = "new-key";
  const saved = structuredClone(base);
  saved.Providers.push({ id: "added", name: "Added", models: ["other"] });
  const next = reconcileSavedConfig(base, draft, saved);
  assert.deepEqual(next.Providers.map((provider) => provider.id), ["existing", "added"]);
  assert.equal(next.Providers[0].api_key, "new-key");
});

test("entity deletion and reordering preserve unrelated additions from the server", () => {
  const base = createDefaultAppConfig();
  base.Providers = ["first", "second", "third"].map((id) => ({ id, name: id, models: ["demo"] }));
  const draft = structuredClone(base);
  draft.Providers = [draft.Providers[2], draft.Providers[0]];
  const saved = structuredClone(base);
  saved.Providers.push({ id: "new", name: "new", models: ["other"] });
  assert.deepEqual(reconcileSavedConfig(base, draft, saved).Providers.map((provider) => provider.id), ["third", "first", "new"]);
});

test("a key-only response never replaces unrelated unsaved settings", () => {
  const draft = createDefaultAppConfig();
  draft.gateway.port = 4567;
  draft.Router.fallback.models = ["Provider/unsaved-model"];
  const saved = createDefaultAppConfig();
  saved.APIKEYS = [{ id: "remaining-key", createdAt: "2026-09-08T00:00:00.000Z", key: "test-only-key" }];
  saved.APIKEY = saved.APIKEYS[0].key;
  const next = mergeSavedApiKeys(draft, saved);
  assert.equal(next.gateway.port, 4567);
  assert.deepEqual(next.Router.fallback.models, ["Provider/unsaved-model"]);
  assert.deepEqual(next.APIKEYS.map((key) => key.id), ["remaining-key"]);
  assert.equal(next.APIKEY, saved.APIKEY);
  assert.equal(configsEqual(next, saved), false);
});
