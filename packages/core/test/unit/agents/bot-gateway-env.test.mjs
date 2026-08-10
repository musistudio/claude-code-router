import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { botGatewayProfileEnv } from "@ccr/core/agents/bot-gateway/env.ts";
import { materializeBotGatewayStdioRunnerPath } from "@ccr/core/agents/bot-gateway/qr-login-service.ts";
import { botGatewaySdkImportSpecifier } from "@ccr/core/agents/bot-gateway/sdk-import.ts";

function botGateway(overrides = {}) {
  return {
    acknowledgeEvents: true,
    args: ["--stdio"],
    authType: "token",
    autoStartIntegration: true,
    command: "bot-gateway",
    createIntegration: true,
    credentials: { sendMode: "legacy", token: "secret", webhookUrl: "https://old.example.com" },
    cwd: "/tmp",
    enabled: true,
    forwardAllAgentMessages: true,
    handoff: {
      enabled: true,
      idleSeconds: 45,
      phoneBluetoothTargets: ["bt-phone"],
      phoneWifiTargets: ["wifi-phone"],
      screenLock: false,
      userIdle: true
    },
    integrationConfig: { sendMode: "webhook", team: "T1", transport: "http" },
    integrationId: "integration-1",
    platform: "slack",
    pollIntervalMs: 2500,
    requestTimeoutMs: 600000,
    sourceDir: "",
    startupTimeoutMs: 15000,
    stateDir: "",
    tenantId: "tenant-1",
    ...overrides
  };
}

const profile = {
  agent: "codex",
  botConfigId: "saved-bot",
  enabled: true,
  id: "codex-main",
  model: "provider,model",
  name: "Codex Main",
  surface: "app"
};

test("botGatewayProfileEnv disables bot gateway outside app surface", () => {
  const env = botGatewayProfileEnv({ botConfigs: [], botGateway: botGateway() }, profile, "cli");

  assert.deepEqual(env, {
    CCR_BOT_GATEWAY_ENABLED: "false",
    CODEXL_BOT_GATEWAY_ENABLED: "false"
  });
});

test("botGatewayProfileEnv merges saved config and normalizes websocket integration", () => {
  const env = botGatewayProfileEnv(
    {
      botConfigs: [
        {
          botGateway: botGateway({
            authType: "appsecret",
            credentials: { appId: "app-1", webhookSecret: "drop-me" },
            integrationConfig: { appId: "app-1", transport: "http" },
            platform: "lark",
            stateDir: "~/bot-state"
          }),
          id: "saved-bot",
          name: "Saved Bot"
        }
      ],
      botGateway: botGateway({ enabled: false, platform: "none" })
    },
    profile,
    "app"
  );

  assert.equal(env.CCR_BOT_GATEWAY_ENABLED, "true");
  assert.equal(env.CCR_BOT_GATEWAY_PLATFORM, "feishu");
  assert.equal(env.CCR_BOT_GATEWAY_AUTH_TYPE, "app_secret");
  assert.equal(env.CCR_BOT_GATEWAY_CREATE_INTEGRATION, "true");
  assert.equal(env.CCR_BOT_GATEWAY_STATE_DIR, `${process.env.HOME}/bot-state`);
  assert.equal(env.CCR_BOT_PROFILE_ID, "codex-main");
  assert.equal(env.CCR_BOT_PROFILE_NAME, "Codex Main");

  const credentials = JSON.parse(env.CCR_BOT_GATEWAY_CREDENTIALS_JSON);
  assert.deepEqual(credentials, { appId: "app-1", token: "secret" });

  const integrationConfig = JSON.parse(env.CCR_BOT_GATEWAY_CONFIG_JSON);
  assert.deepEqual(integrationConfig, { appId: "app-1", team: "T1", transport: "websocket" });
});

test("botGatewayProfileEnv disables create integration for QR login platforms", () => {
  const env = botGatewayProfileEnv(
    {
      botConfigs: [],
      botGateway: botGateway({
        authType: "qr",
        platform: "weixin"
      })
    },
    { ...profile, botConfigId: undefined },
    "app"
  );

  assert.equal(env.CCR_BOT_GATEWAY_PLATFORM, "weixin-ilink");
  assert.equal(env.CCR_BOT_GATEWAY_AUTH_TYPE, "qr_login");
  assert.equal(env.CCR_BOT_GATEWAY_CREATE_INTEGRATION, "false");
  assert.equal(JSON.parse(env.CCR_BOT_GATEWAY_CONFIG_JSON).transport, "websocket");
});

test("botGatewayProfileEnv defaults iMessage to local auth", () => {
  const env = botGatewayProfileEnv(
    {
      botConfigs: [],
      botGateway: botGateway({
        authType: "",
        credentials: {},
        integrationConfig: {},
        platform: "imessage"
      })
    },
    { ...profile, botConfigId: undefined },
    "app"
  );

  assert.equal(env.CCR_BOT_GATEWAY_PLATFORM, "imessage");
  assert.equal(env.CCR_BOT_GATEWAY_AUTH_TYPE, "local");
  assert.equal(JSON.parse(env.CCR_BOT_GATEWAY_CONFIG_JSON).transport, "websocket");
});

test("botGatewaySdkImportSpecifier converts Windows absolute paths before URL scheme detection", () => {
  const windowsPath = "C:\\Users\\macao\\AppData\\Local\\Programs\\Claude Code Router\\resources\\app.asar\\dist\\main\\bot-gateway-sdk\\dist\\index.js";

  assert.equal(
    botGatewaySdkImportSpecifier(windowsPath),
    "file:///C:/Users/macao/AppData/Local/Programs/Claude%20Code%20Router/resources/app.asar/dist/main/bot-gateway-sdk/dist/index.js"
  );
  assert.equal(botGatewaySdkImportSpecifier("file:///tmp/sdk/index.js"), "file:///tmp/sdk/index.js");
  assert.equal(botGatewaySdkImportSpecifier("@the-next-ai/bot-gateway-sdk"), "@the-next-ai/bot-gateway-sdk");
});

test("materializeBotGatewayStdioRunnerPath copies bundled runner out of app.asar paths", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-bot-runner-"));
  const source = path.join(dir, "resources", "app.asar", "dist", "main", "bot-gateway-sdk", "bin", "bot-gateway-stdio.mjs");
  const configDir = path.join(dir, "config");
  mkdirSync(path.dirname(source), { recursive: true });
  writeFileSync(source, "#!/usr/bin/env node\n#!/usr/bin/env node\nconsole.log('ok');\n");

  const materialized = materializeBotGatewayStdioRunnerPath(source, configDir);

  assert.equal(materialized, path.join(configDir, "bot-gateway", "runners", "bot-gateway-stdio.mjs"));
  assert.notEqual(path.dirname(materialized), path.dirname(source));
  assert.equal(readFileSync(materialized, "utf8"), "#!/usr/bin/env node\nconsole.log('ok');\n");
});
