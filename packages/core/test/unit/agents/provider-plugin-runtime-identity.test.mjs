import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { codexDefaultBaseUrl } from "@ccr/core/agents/local-providers/service.ts";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { compileCoreGatewayConfig } from "@ccr/core/gateway/core-runtime/config-compiler.ts";
import { prepareGatewayUpstreamAttemptForTest } from "@ccr/core/gateway/upstream/executor.ts";

test("provider plugins use compiled runtime and capability identities", async () => {
  const unchangedPlugin = { key: "unscoped-plugin" };
  const config = createDefaultAppConfig();
  config.providerPlugins = [
    {
      key: "single-protocol-plugin",
      providerName: "single-provider::anthropic_messages"
    },
    {
      key: "single-protocol-display-name-plugin",
      providerName: "Single Provider"
    },
    {
      key: "multi-protocol-plugin",
      providerName: "Multi Provider::openai_responses"
    },
    {
      key: "external-plugin",
      providerName: "External Provider"
    },
    unchangedPlugin
  ];
  config.Providers = [
    {
      api_base_url: "https://single.example.test/v1",
      id: "single-provider",
      models: ["single-model"],
      name: "Single Provider",
      type: "anthropic_messages"
    },
    {
      api_base_url: "https://multi.example.test/v1",
      capabilities: [
        { baseUrl: "https://multi.example.test/anthropic", type: "anthropic_messages" },
        { baseUrl: "https://multi.example.test/responses", type: "openai_responses" }
      ],
      id: "multi-provider",
      models: ["multi-model"],
      name: "Multi Provider",
      type: "anthropic_messages"
    }
  ];

  const compiled = await compileCoreGatewayConfig(
    config,
    "raw-trace-token",
    "billing-usage-token",
    "core-auth-token"
  );
  const [runtimePlugin, displayNamePlugin, capabilityPlugin, unmatchedPlugin, unscopedPlugin] = compiled.providerPlugins;

  assert.equal(runtimePlugin.providerName, "single-provider");
  assert.equal(displayNamePlugin.providerName, "single-provider");
  assert.equal(capabilityPlugin.providerName, "multi-provider::openai_responses");
  assert.equal(unmatchedPlugin.providerName, "External Provider");
  assert.equal(unscopedPlugin, unchangedPlugin);
});

test("Codex OAuth plugins retain the default base URL after runtime identity normalization", async () => {
  const config = createDefaultAppConfig();
  config.providerPlugins = [
    {
      codexOauth: {},
      key: "ccr-local-agent-codex-api-codex-oauth",
      providerName: "Codex API"
    }
  ];
  config.Providers = [
    {
      api_base_url: "https://configured.example.test/v1",
      id: "codex-api",
      models: ["gpt-5-codex"],
      name: "Codex API",
      type: "openai_responses"
    }
  ];

  const compiled = await compileCoreGatewayConfig(
    config,
    "raw-trace-token",
    "billing-usage-token",
    "core-auth-token"
  );

  assert.equal(compiled.providerPlugins[0].providerName, "codex-api");
  assert.equal(compiled.providers[0].baseurl, codexDefaultBaseUrl);
});

test("Codex OAuth plugins prefer live login credentials over imported snapshots", async (t) => {
  const home = useTemporaryCodexHome(t, "ccr-codex-runtime-live-credentials-");
  fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(home, ".codex", "auth.json"), JSON.stringify({
    tokens: {
      access_token: "access-live",
      account_id: "acct-live",
      refresh_token: "refresh-live"
    }
  }));

  const config = createDefaultAppConfig();
  config.providerPlugins = [{
    codexOauth: {
      accessToken: "access-imported",
      accountId: "acct-imported",
      refreshToken: "refresh-imported"
    },
    key: "ccr-local-agent-codex-api-codex-oauth",
    providerName: "Codex API"
  }];
  config.Providers = [{
    api_base_url: codexDefaultBaseUrl,
    api_key: "ccr-local-agent-login",
    id: "codex-api",
    models: ["gpt-5.5"],
    name: "Codex API",
    type: "openai_responses"
  }];

  const compiled = await compileCoreGatewayConfig(
    config,
    "raw-trace-token",
    "billing-usage-token",
    "core-auth-token"
  );
  const codexPlugin = compiled.providerPlugins.find((item) => item.key === "ccr-local-agent-codex-api-codex-oauth");

  assert.equal(codexPlugin.codexOauth.accessToken, "access-live");
  assert.equal(codexPlugin.codexOauth.refreshToken, "refresh-live");
  assert.equal(codexPlugin.codexOauth.accountId, "acct-live");
});

test("Codex local providers synthesize OAuth plugins when persisted plugins are missing", async (t) => {
  const home = useTemporaryCodexHome(t, "ccr-codex-runtime-missing-plugins-");
  fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(home, ".codex", "auth.json"), JSON.stringify({
    tokens: {
      access_token: "access-live",
      account_id: "acct-live-runtime",
      refresh_token: "refresh-live"
    }
  }));

  const config = createDefaultAppConfig();
  config.providerPlugins = [];
  config.Providers = [
    {
      api_base_url: codexDefaultBaseUrl,
      api_key: "ccr-local-agent-login",
      id: "codex-api",
      models: ["gpt-5.5"],
      name: "Codex API",
      type: "openai_responses"
    }
  ];

  const compiled = await compileCoreGatewayConfig(
    config,
    "raw-trace-token",
    "billing-usage-token",
    "core-auth-token"
  );
  const codexPlugins = compiled.providerPlugins.filter((item) => String(item.key).includes("codex-oauth"));

  assert.equal(compiled.providers[0].baseurl, codexDefaultBaseUrl);
  assert.equal(codexPlugins.length, 1);
  assert.equal(codexPlugins[0].providerName, "codex-api");
  assert.equal(codexPlugins[0].codexOauth.refreshToken, "refresh-live");
});

test("Codex local provider fallback respects disabled OAuth plugins", async (t) => {
  const home = useTemporaryCodexHome(t, "ccr-codex-runtime-disabled-plugin-");
  fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(home, ".codex", "auth.json"), JSON.stringify({
    tokens: {
      access_token: "access-live",
      refresh_token: "refresh-live"
    }
  }));

  const config = createDefaultAppConfig();
  config.providerPlugins = [{
    codexOauth: {
      refreshToken: "refresh-disabled"
    },
    enabled: false,
    key: "ccr-local-agent-codex-api-codex-oauth",
    providerName: "Codex API"
  }];
  config.Providers = [
    {
      api_base_url: codexDefaultBaseUrl,
      api_key: "ccr-local-agent-login",
      id: "codex-api",
      models: ["gpt-5.5"],
      name: "Codex API",
      type: "openai_responses"
    }
  ];

  const compiled = await compileCoreGatewayConfig(
    config,
    "raw-trace-token",
    "billing-usage-token",
    "core-auth-token"
  );
  const codexPlugins = compiled.providerPlugins.filter((item) => String(item.key).includes("codex-oauth"));

  assert.equal(codexPlugins.length, 0);
});

test("credential-free fallback headers use the provider runtime identity", () => {
  const provider = {
    api_base_url: "https://api.example.test",
    id: "provider-runtime-test",
    models: ["example-model"],
    name: "Display Provider",
    type: "anthropic_messages"
  };
  const config = {
    Providers: [provider],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 } },
    gateway: {}
  };

  const attempt = prepareGatewayUpstreamAttemptForTest({
    body: {
      messages: [{ content: "hi", role: "user" }],
      model: "Display Provider/example-model"
    },
    config,
    headers: {},
    method: "POST",
    path: "/v1/messages"
  });

  assert.equal(attempt.headers["x-target-provider"], "provider-runtime-test");
});

function useTemporaryCodexHome(t, prefix) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const previousHome = process.env.CCR_INTERNAL_HOME_DIR;
  process.env.CCR_INTERNAL_HOME_DIR = home;
  t.after(() => {
    if (previousHome === undefined) {
      delete process.env.CCR_INTERNAL_HOME_DIR;
    } else {
      process.env.CCR_INTERNAL_HOME_DIR = previousHome;
    }
  });
  return home;
}
