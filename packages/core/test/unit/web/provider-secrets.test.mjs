import assert from "node:assert/strict";
import test from "node:test";
import { redactWebConfig, restoreWebConfigSecrets, restoreWebProbeSecrets, webSecretPlaceholder } from "@ccr/core/web/provider-secrets.ts";

test("masked provider probes use only unambiguous saved endpoint credentials", () => {
  const provider = { id: "first", name: "First", api_base_url: "https://provider.example/v1", api_key: "stored-secret", models: [] };
  const config = { Providers: [provider] };
  const masked = redactWebConfig(config);
  const reference = masked.Providers[0].api_key;
  assert.ok(reference.startsWith(webSecretPlaceholder));
  assert.equal(provider.api_key, "stored-secret", "redaction must not mutate runtime config");
  assert.equal(restoreWebProbeSecrets({ apiKey: reference, baseUrl: provider.api_base_url }, config).apiKey, "stored-secret");
  assert.throws(() => restoreWebProbeSecrets({ apiKey: reference, baseUrl: "https://unrelated.example" }, config), /saved provider/);
  assert.equal(restoreWebProbeSecrets({ apiKey: reference, baseUrl: provider.api_base_url }, { Providers: [provider, { ...provider, id: "second", api_key: "different-secret" }] }).apiKey, "stored-secret");
  assert.equal(restoreWebProbeSecrets({ apiKey: "new-secret", baseUrl: provider.api_base_url }, config).apiKey, "new-secret");
});

test("redacted secrets cannot move to a different provider or credential identity", () => {
  const config = { Providers: [{ id: "provider", name: "Provider", api_key: "provider-secret", credentials: [{ id: "credential", api_key: "credential-secret" }] }] };
  const masked = redactWebConfig(config);
  masked.Providers[0].credentials[0].id = "new-credential";
  assert.throws(() => restoreWebConfigSecrets(masked, config), /no matching saved value/);
  masked.Providers[0].credentials[0].id = "credential";
  masked.Providers[0].id = "new-provider";
  assert.throws(() => restoreWebConfigSecrets(masked, config), /no matching saved value/);
});

test("credential references distinguish multiple keys on the same endpoint", () => {
  const config = { Providers: [{ id: "provider", name: "Provider", api_base_url: "https://provider.example/v1", models: [], credentials: [{ id: "first", api_key: "first-key" }, { id: "second", api_key: "second-key" }], extraHeaders: { Authorization: ["header-one", "header-two"] } }] };
  const masked = redactWebConfig(config);
  const first = masked.Providers[0].credentials[0].api_key;
  const second = masked.Providers[0].credentials[1].api_key;
  assert.notEqual(first, second);
  assert.equal(restoreWebProbeSecrets({ apiKey: first, baseUrl: config.Providers[0].api_base_url }, config).apiKey, "first-key");
  assert.equal(restoreWebProbeSecrets({ apiKey: second, baseUrl: config.Providers[0].api_base_url }, config).apiKey, "second-key");
  assert.doesNotMatch(JSON.stringify(masked), /first-key|second-key|header-one|header-two/);
  assert.deepEqual(restoreWebConfigSecrets(masked, config), config);
});

test("account auth modes remain editable and connector header references restore", () => {
  const connector = { type: "http-json", endpoint: "https://provider.example/account", auth: "provider-api-key", headers: { Authorization: "Bearer account-secret" } };
  const config = { Providers: [{ id: "provider", name: "Provider", api_base_url: "https://provider.example/v1", models: [], account: { connectors: [connector] } }] };
  const masked = redactWebConfig(config);
  assert.equal(masked.Providers[0].account.connectors[0].auth, "provider-api-key");
  assert.deepEqual(restoreWebProbeSecrets({ baseUrl: config.Providers[0].api_base_url, connector: masked.Providers[0].account.connectors[0] }, config).connector, connector);
});
