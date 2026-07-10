import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import agentConsolePlugin from "../../marketplace/plugins/agent-console/index.cjs";

const DEFAULT_LAUNCHER_BUNDLE_ID = "com.claudecoderouter.plugin.agent-console.launcher";

test("Agent Console catalog uses model ids for display names and model-specific reasoning levels", async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-agent-console-home-"));
  try {
    await withHome(home, async () => {
      const pluginDataDir = path.join(home, "plugin-data");
      await agentConsolePlugin.setup(createPluginContext({
        config: {
          Providers: [
            {
              modelDescriptions: {
                "glm-4.5": "性能强劲，但是速度很慢",
                "glm-4-air": "性能一般，速度快"
              },
              models: ["glm-4.5", "glm-4-air", "glm-5.2"],
              name: "Zhipu AI (China) - Coding Plan"
            },
            {
              models: ["z-ai/glm-5.2"],
              name: "OpenRouter"
            },
            {
              models: ["gpt-5.5", "gpt-5.6"],
              name: "Codex API"
            },
            {
              models: ["gpt-5.5", "gpt-5.6"],
              name: "uuroute"
            }
          ]
        },
        pluginConfig: { bridgePort: 34567, launch: false, systemLauncher: false },
        pluginDataDir,
        routes: []
      }));

      const runtimeConfig = JSON.parse(readFileSync(path.join(pluginDataDir, "ccr-runtime-config.json"), "utf8"));
      const catalog = JSON.parse(readFileSync(path.join(pluginDataDir, "ccr-codex-model-catalog.json"), "utf8"));

      assert.equal(runtimeConfig.models[0].displayName, "Zhipu AI (China) - Coding Plan/glm-4.5");
      assert.ok(runtimeConfig.codex.command.endsWith(process.platform === "win32" ? "ccr-agent-console-codex.cmd" : "ccr-agent-console-codex"));
      assert.ok(existsSync(runtimeConfig.codex.command));
      assert.equal(runtimeConfig.codex.env.CODEX_HOME, path.join(pluginDataDir, "codex-home"));
      assert.equal(runtimeConfig.codex.env.CCR_CODEX_MODEL_PROVIDER, "claude-code-router");
      assert.equal(runtimeConfig.codex.env.CCR_CODEX_REMOTE_FRONTEND_MODE, "app");
      assert.ok(existsSync(path.join(pluginDataDir, "bin", "ccr-codex-cli-middleware.js")));
      assert.match(readFileSync(path.join(pluginDataDir, "codex-home", "config.toml"), "utf8"), /model_provider = "claude-code-router"/);
      assert.match(readFileSync(path.join(pluginDataDir, "codex-home", "config.toml"), "utf8"), /model_catalog_json = /);
      assert.match(readFileSync(path.join(pluginDataDir, "codex-home", "config.toml"), "utf8"), /\[model_providers\."claude-code-router"\]/);
      assert.match(readFileSync(path.join(pluginDataDir, "codex-home", "config.toml"), "utf8"), /wire_api = "responses"/);
      assert.ok(runtimeConfig.claudeCode.command.endsWith(process.platform === "win32" ? "ccr-agent-console-claude-code.cmd" : "ccr-agent-console-claude-code"));
      assert.ok(existsSync(runtimeConfig.claudeCode.command));
      assert.equal(runtimeConfig.claudeCode.env.ANTHROPIC_BASE_URL, "http://127.0.0.1:3456");
      assert.equal(runtimeConfig.claudeCode.env.CLAUDE_AGENT_API_BASE_URL, "http://127.0.0.1:3456");
      assert.equal(runtimeConfig.claudeCode.env.CLAUDE_CONFIG_DIR, path.join(pluginDataDir, "claude-code", "claude"));
      assert.equal(runtimeConfig.claudeCode.env.CCR_CLAUDE_CODE_WRAPPER, "1");
      assert.equal(runtimeConfig.claudeCode.env.CCR_REAL_CLAUDE_CODE_BIN, "claude");
      assert.equal(runtimeConfig.claudeCode.env.CCR_REMOTE_SYNC_PROFILE_ID, "agent-console-claude-code");
      assert.ok(existsSync(path.join(pluginDataDir, "bin", process.platform === "win32" ? "ccr-agent-console-claude-code-api-key.cmd" : "ccr-agent-console-claude-code-api-key")));
      const claudeSettings = JSON.parse(readFileSync(path.join(pluginDataDir, "claude-code", "claude", "settings.json"), "utf8"));
      assert.equal(claudeSettings.env.ANTHROPIC_BASE_URL, "http://127.0.0.1:3456");
      assert.equal(claudeSettings.env.CLAUDE_CONFIG_DIR, path.join(pluginDataDir, "claude-code", "claude"));
      assert.equal(claudeSettings.env.CCR_CLAUDE_CODE_MODEL, "Zhipu AI (China) - Coding Plan/glm-4.5");
      assert.match(readFileSync(runtimeConfig.claudeCode.command, "utf8"), /CCR_CLAUDE_CODE_WRAPPER/);
      const runtimeToggleReasoningModel = runtimeConfig.models.find((item) => item.model === "Zhipu AI (China) - Coding Plan/glm-4.5");
      const runtimeBasicModel = runtimeConfig.models.find((item) => item.model === "Zhipu AI (China) - Coding Plan/glm-4-air");
      const runtimeZhipuEffortReasoningModel = runtimeConfig.models.find((item) => item.model === "Zhipu AI (China) - Coding Plan/glm-5.2");
      const runtimeEffortReasoningModel = runtimeConfig.models.find((item) => item.model === "OpenRouter/z-ai/glm-5.2");
      const runtimeOpenAiReasoningModel = runtimeConfig.models.find((item) => item.model === "Codex API/gpt-5.5");
      const runtimeOpenAiLatestReasoningModel = runtimeConfig.models.find((item) => item.model === "Codex API/gpt-5.6");
      const runtimeGatewayReasoningModel = runtimeConfig.models.find((item) => item.model === "uuroute/gpt-5.5");
      const runtimeGatewayLatestReasoningModel = runtimeConfig.models.find((item) => item.model === "uuroute/gpt-5.6");
      const toggleReasoningModel = catalog.models.find((item) => item.slug === "Zhipu AI (China) - Coding Plan/glm-4.5");
      const basicModel = catalog.models.find((item) => item.slug === "Zhipu AI (China) - Coding Plan/glm-4-air");
      const zhipuEffortReasoningModel = catalog.models.find((item) => item.slug === "Zhipu AI (China) - Coding Plan/glm-5.2");
      const effortReasoningModel = catalog.models.find((item) => item.slug === "OpenRouter/z-ai/glm-5.2");
      const openAiReasoningModel = catalog.models.find((item) => item.slug === "Codex API/gpt-5.5");
      const openAiLatestReasoningModel = catalog.models.find((item) => item.slug === "Codex API/gpt-5.6");
      const gatewayReasoningModel = catalog.models.find((item) => item.slug === "uuroute/gpt-5.5");
      const gatewayLatestReasoningModel = catalog.models.find((item) => item.slug === "uuroute/gpt-5.6");

      assert.ok(runtimeToggleReasoningModel);
      assert.ok(runtimeBasicModel);
      assert.ok(runtimeZhipuEffortReasoningModel);
      assert.ok(runtimeEffortReasoningModel);
      assert.ok(runtimeOpenAiReasoningModel);
      assert.ok(runtimeOpenAiLatestReasoningModel);
      assert.ok(runtimeGatewayReasoningModel);
      assert.ok(runtimeGatewayLatestReasoningModel);
      assert.ok(toggleReasoningModel);
      assert.ok(basicModel);
      assert.ok(zhipuEffortReasoningModel);
      assert.ok(effortReasoningModel);
      assert.ok(openAiReasoningModel);
      assert.ok(openAiLatestReasoningModel);
      assert.ok(gatewayReasoningModel);
      assert.ok(gatewayLatestReasoningModel);
      assert.deepEqual(runtimeToggleReasoningModel.supportedReasoningEfforts, []);
      assert.deepEqual(runtimeToggleReasoningModel.supportedSpeeds, []);
      assert.deepEqual(runtimeBasicModel.supportedReasoningEfforts, []);
      assert.deepEqual(runtimeBasicModel.supportedSpeeds, []);
      assert.deepEqual(runtimeZhipuEffortReasoningModel.supportedReasoningEfforts, ["high", "xhigh"]);
      assert.equal(runtimeZhipuEffortReasoningModel.defaultReasoningEffort, undefined);
      assert.equal(runtimeZhipuEffortReasoningModel.contextWindowTokens, 1048576);
      assert.equal(runtimeZhipuEffortReasoningModel.context_window_tokens, 1048576);
      assert.deepEqual(runtimeZhipuEffortReasoningModel.supportedSpeeds, []);
      assert.deepEqual(runtimeEffortReasoningModel.supportedReasoningEfforts, ["xhigh", "high"]);
      assert.equal(runtimeEffortReasoningModel.defaultReasoningEffort, "high");
      assert.equal(runtimeEffortReasoningModel.contextWindowTokens, 1048576);
      assert.deepEqual(runtimeEffortReasoningModel.supportedSpeeds, []);
      assert.deepEqual(runtimeOpenAiReasoningModel.supportedReasoningEfforts, ["minimal", "low", "medium", "high"]);
      assert.equal(runtimeOpenAiReasoningModel.defaultReasoningEffort, "medium");
      assert.deepEqual(runtimeOpenAiReasoningModel.supportedSpeeds, []);
      assert.deepEqual(runtimeOpenAiLatestReasoningModel.supportedReasoningEfforts, ["minimal", "low", "medium", "high", "xhigh"]);
      assert.equal(runtimeOpenAiLatestReasoningModel.defaultReasoningEffort, "medium");
      assert.deepEqual(runtimeOpenAiLatestReasoningModel.supportedSpeeds, []);
      assert.deepEqual(runtimeGatewayReasoningModel.supportedReasoningEfforts, ["minimal", "low", "medium", "high"]);
      assert.equal(runtimeGatewayReasoningModel.defaultReasoningEffort, "medium");
      assert.equal(runtimeGatewayReasoningModel.contextWindowTokens, 1050000);
      assert.deepEqual(runtimeGatewayReasoningModel.supportedSpeeds, []);
      assert.deepEqual(runtimeGatewayLatestReasoningModel.supportedReasoningEfforts, ["minimal", "low", "medium", "high", "xhigh"]);
      assert.equal(runtimeGatewayLatestReasoningModel.defaultReasoningEffort, "medium");
      assert.equal(runtimeGatewayLatestReasoningModel.contextWindowTokens, 128000);
      assert.deepEqual(runtimeGatewayLatestReasoningModel.supportedSpeeds, []);
      assert.equal(toggleReasoningModel.display_name, toggleReasoningModel.slug);
      assert.equal(basicModel.display_name, basicModel.slug);
      assert.equal(zhipuEffortReasoningModel.display_name, zhipuEffortReasoningModel.slug);
      assert.equal(effortReasoningModel.display_name, effortReasoningModel.slug);
      assert.equal(openAiReasoningModel.display_name, openAiReasoningModel.slug);
      assert.equal(openAiLatestReasoningModel.display_name, openAiLatestReasoningModel.slug);
      assert.equal(gatewayReasoningModel.display_name, gatewayReasoningModel.slug);
      assert.equal(gatewayLatestReasoningModel.display_name, gatewayLatestReasoningModel.slug);
      assert.equal(gatewayReasoningModel.apply_patch_tool_type, "freeform");
      assert.equal(gatewayReasoningModel.context_window, 1050000);
      assert.deepEqual(gatewayReasoningModel.input_modalities, ["text", "image"]);
      assert.equal(gatewayReasoningModel.max_context_window, 1050000);
      assert.equal(gatewayReasoningModel.support_verbosity, true);
      assert.deepEqual(gatewayReasoningModel.truncation_policy, { mode: "tokens", limit: 10000 });
      assert.equal(toggleReasoningModel.default_reasoning_level, null);
      assert.equal(toggleReasoningModel.defaultReasoningEffort, null);
      assert.deepEqual(toggleReasoningModel.supportedReasoningEfforts, []);
      assert.deepEqual(toggleReasoningModel.supported_reasoning_levels, []);
      assert.equal(toggleReasoningModel.supports_reasoning_summaries, true);
      assert.equal(zhipuEffortReasoningModel.default_reasoning_level, null);
      assert.equal(zhipuEffortReasoningModel.defaultReasoningEffort, null);
      assert.equal(zhipuEffortReasoningModel.context_window, 1048576);
      assert.equal(zhipuEffortReasoningModel.max_context_window, 1048576);
      assert.deepEqual(zhipuEffortReasoningModel.supportedReasoningEfforts.map((level) => level.reasoningEffort), ["high", "xhigh"]);
      assert.deepEqual(zhipuEffortReasoningModel.supported_reasoning_levels.map((level) => level.effort), ["high", "xhigh"]);
      assert.equal(zhipuEffortReasoningModel.supports_reasoning_summaries, true);
      assert.equal(effortReasoningModel.default_reasoning_level, "high");
      assert.equal(effortReasoningModel.defaultReasoningEffort, "high");
      assert.equal(effortReasoningModel.context_window, 1048576);
      assert.equal(effortReasoningModel.max_context_window, 1048576);
      assert.deepEqual(effortReasoningModel.supportedReasoningEfforts.map((level) => level.reasoningEffort), ["xhigh", "high"]);
      assert.deepEqual(effortReasoningModel.supported_reasoning_levels.map((level) => level.effort), ["xhigh", "high"]);
      assert.equal(effortReasoningModel.supports_reasoning_summaries, true);
      assert.equal(openAiReasoningModel.default_reasoning_level, "medium");
      assert.equal(openAiReasoningModel.defaultReasoningEffort, "medium");
      assert.deepEqual(openAiReasoningModel.supportedReasoningEfforts.map((level) => level.reasoningEffort), ["minimal", "low", "medium", "high"]);
      assert.deepEqual(openAiReasoningModel.supported_reasoning_levels.map((level) => level.effort), ["minimal", "low", "medium", "high"]);
      assert.equal(openAiReasoningModel.supports_reasoning_summaries, true);
      assert.equal(openAiLatestReasoningModel.default_reasoning_level, "medium");
      assert.equal(openAiLatestReasoningModel.defaultReasoningEffort, "medium");
      assert.deepEqual(openAiLatestReasoningModel.supportedReasoningEfforts.map((level) => level.reasoningEffort), ["minimal", "low", "medium", "high", "xhigh"]);
      assert.deepEqual(openAiLatestReasoningModel.supported_reasoning_levels.map((level) => level.effort), ["minimal", "low", "medium", "high", "xhigh"]);
      assert.equal(openAiLatestReasoningModel.supports_reasoning_summaries, true);
      assert.equal(gatewayReasoningModel.default_reasoning_level, "medium");
      assert.equal(gatewayReasoningModel.defaultReasoningEffort, "medium");
      assert.deepEqual(gatewayReasoningModel.supportedReasoningEfforts.map((level) => level.reasoningEffort), ["minimal", "low", "medium", "high"]);
      assert.deepEqual(gatewayReasoningModel.supported_reasoning_levels.map((level) => level.effort), ["minimal", "low", "medium", "high"]);
      assert.equal(gatewayReasoningModel.supports_reasoning_summaries, true);
      assert.equal(gatewayLatestReasoningModel.default_reasoning_level, "medium");
      assert.equal(gatewayLatestReasoningModel.defaultReasoningEffort, "medium");
      assert.deepEqual(gatewayLatestReasoningModel.supportedReasoningEfforts.map((level) => level.reasoningEffort), ["minimal", "low", "medium", "high", "xhigh"]);
      assert.deepEqual(gatewayLatestReasoningModel.supported_reasoning_levels.map((level) => level.effort), ["minimal", "low", "medium", "high", "xhigh"]);
      assert.equal(gatewayLatestReasoningModel.supports_reasoning_summaries, true);
      assert.equal(basicModel.default_reasoning_level, null);
      assert.equal(basicModel.defaultReasoningEffort, null);
      assert.deepEqual(basicModel.supportedReasoningEfforts, []);
      assert.deepEqual(basicModel.supported_reasoning_levels, []);
      assert.equal(basicModel.supports_reasoning_summaries, false);
    });
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
});

test("Agent Console React composer omits the floating status row", async () => {
  const chatSource = readFileSync(path.resolve("marketplace/plugins/agent-console/src/renderer/pages/home/components/chat.tsx"), "utf8");
  assert.doesNotMatch(chatSource, /chat-floating-status/);
  assert.doesNotMatch(chatSource, /chat\.statusReady/);

  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-agent-console-home-"));
  try {
    await withHome(home, async () => {
      const routes = [];
      await agentConsolePlugin.setup(createPluginContext({
        pluginConfig: { bridgePort: 34567, launch: false, systemLauncher: false },
        pluginDataDir: path.join(home, "plugin-data"),
        routes
      }));

      const preload = await readRendererRouteBody(routes, "/plugins/agent-console/__agent-console-preload.js");

      assert.doesNotMatch(preload, /agent-console-plugin-composer-surface-styles/);
      assert.doesNotMatch(preload, /\.chat-floating-status\{display:none!important/);
    });
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
});

test("Agent Console diff parts avoid duplicate paths and colorize unified diffs", () => {
  const chatSource = readFileSync(path.resolve("marketplace/plugins/agent-console/src/renderer/pages/home/components/chat.tsx"), "utf8");

  assert.match(chatSource, /function DiffContent/);
  assert.match(chatSource, /function getDiffPartTitle/);
  assert.match(chatSource, /duplicateTitles\.has\(title\) \? "Diff" : title/);
  assert.doesNotMatch(chatSource, /if \(part\.type === "diff"\) return part\.title \|\| part\.path \|\| "Diff";/);
  assert.match(chatSource, /line\.startsWith\("@@"\)/);
  assert.ok(chatSource.includes('line.startsWith("+")'));
  assert.ok(chatSource.includes('line.startsWith("-")'));
  assert.ok(chatSource.includes('line.startsWith("--- ")'));
  assert.ok(chatSource.includes('line.startsWith("+++ ")'));
});

test("Agent Console context window indicator only uses runtime usage", () => {
  const coreSource = readFileSync(path.resolve("marketplace/plugins/agent-console/src/renderer/pages/home/utils/core.ts"), "utf8");
  const chatSource = readFileSync(path.resolve("marketplace/plugins/agent-console/src/renderer/pages/home/components/chat.tsx"), "utf8");
  const docsSource = readFileSync(path.resolve("marketplace/plugins/agent-console/src/renderer/pages/home/plugins/docs/index.tsx"), "utf8");

  assert.doesNotMatch(coreSource, /usedTokens = hasUsageTokens \? usageTokens : estimatedTokens/);
  assert.doesNotMatch(coreSource, /source: hasUsageTokens \? "actual" : "estimated"/);
  assert.doesNotMatch(docsSource, /source: "estimated"/);
  assert.match(coreSource, /source: hasUsageTokens \? "actual" : "unknown"/);
  assert.match(coreSource, /const usedTokens = hasUsageTokens \? usageTokens : null/);
  assert.match(chatSource, /const usedLabel = hasRuntimeUsage \? formatTokenCount\(runtimeUsedTokens\) : t\("contextWindow\.unknown"\)/);
  assert.match(chatSource, /const percentLabel = hasRuntimeUsage && metrics\.limitTokens \? formatContextWindowPercent/);
});

test("Agent Console persists in-flight runs across renderer exits", () => {
  const appSource = readFileSync(path.resolve("marketplace/plugins/agent-console/src/renderer/pages/home/App.tsx"), "utf8");

  assert.match(appSource, /agentConsole\.pendingRunSnapshots\.v1/);
  assert.match(appSource, /function savePendingRunSnapshots/);
  assert.match(appSource, /function loadPendingRunSnapshots/);
  assert.match(appSource, /const persistPendingRunSnapshotForThread = useCallback/);
  assert.match(appSource, /persistPendingRunSnapshotForThread\(threadId\)/);
  assert.match(appSource, /persistPendingRunSnapshotForThread\(event\.threadId\)/);
  assert.match(appSource, /shouldDiscardRecoveredInFlightMessages\(historyMessages, inFlightMessages\)/);
  assert.match(appSource, /clearPendingRunStateForThread\(selectedThread\)/);
  assert.match(appSource, /hasPersistedAssistantReplacement/);
});

test("Agent Console macOS launcher defaults to the CCR Apps folder", { skip: process.platform !== "darwin" }, async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-agent-console-home-"));
  try {
    await withHome(home, async () => {
      const routes = [];
      await agentConsolePlugin.setup(createPluginContext({
        pluginConfig: { bridgePort: 34567, launch: false },
        pluginDataDir: path.join(home, "plugin-data"),
        routes
      }));

      const expectedLauncherPath = path.join(home, "Applications", "CCR Apps", "Agent Console.app");
      const status = readStatusPayload(routes);

      assert.equal(status.launcherInstalled, true);
      assert.equal(status.launcherPath, expectedLauncherPath);
      assert.ok(existsSync(path.join(expectedLauncherPath, "Contents", "MacOS", "AgentConsole")));
    });
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
});

test("Agent Console macOS launcher migrates the previous default app location", { skip: process.platform !== "darwin" }, async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-agent-console-home-"));
  try {
    await withHome(home, async () => {
      const legacyLauncherPath = path.join(home, "Applications", "Agent Console.app");
      writeLauncherInfoPlist(legacyLauncherPath);

      const routes = [];
      await agentConsolePlugin.setup(createPluginContext({
        pluginConfig: { bridgePort: 34567, launch: false },
        pluginDataDir: path.join(home, "plugin-data"),
        routes
      }));

      const expectedLauncherPath = path.join(home, "Applications", "CCR Apps", "Agent Console.app");
      const status = readStatusPayload(routes);

      assert.equal(status.launcherInstalled, true);
      assert.equal(status.launcherPath, expectedLauncherPath);
      assert.equal(existsSync(legacyLauncherPath), false);
      assert.ok(existsSync(path.join(expectedLauncherPath, "Contents", "MacOS", "AgentConsole")));
    });
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
});

test("Agent Console macOS launcher keeps an explicit launcherPath", { skip: process.platform !== "darwin" }, async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-agent-console-home-"));
  try {
    await withHome(home, async () => {
      const explicitLauncherPath = path.join(home, "Custom Launchers", "Console.app");
      const routes = [];
      await agentConsolePlugin.setup(createPluginContext({
        pluginConfig: {
          bridgePort: 34567,
          launch: false,
          launcherPath: explicitLauncherPath
        },
        pluginDataDir: path.join(home, "plugin-data"),
        routes
      }));

      const status = readStatusPayload(routes);

      assert.equal(status.launcherInstalled, true);
      assert.equal(status.launcherPath, explicitLauncherPath);
      assert.ok(existsSync(path.join(explicitLauncherPath, "Contents", "MacOS", "AgentConsole")));
    });
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
});

test("Agent Console macOS launcher is removed when the plugin is disabled", { skip: process.platform !== "darwin" }, async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-agent-console-home-"));
  try {
    await withHome(home, async () => {
      const routes = [];
      const registration = await agentConsolePlugin.setup(createPluginContext({
        pluginConfig: { bridgePort: 34567, launch: false },
        pluginDataDir: path.join(home, "plugin-data"),
        routes
      }));
      const launcherPath = path.join(home, "Applications", "CCR Apps", "Agent Console.app");

      assert.ok(existsSync(launcherPath));
      await registration.stop({ reason: "disabled" });
      assert.equal(existsSync(launcherPath), false);
    });
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
});

test("Agent Console macOS launcher is kept during a normal gateway stop", { skip: process.platform !== "darwin" }, async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-agent-console-home-"));
  try {
    await withHome(home, async () => {
      const routes = [];
      const registration = await agentConsolePlugin.setup(createPluginContext({
        pluginConfig: { bridgePort: 34567, launch: false },
        pluginDataDir: path.join(home, "plugin-data"),
        routes
      }));
      const launcherPath = path.join(home, "Applications", "CCR Apps", "Agent Console.app");

      assert.ok(existsSync(launcherPath));
      await registration.stop({ reason: "stop" });
      assert.ok(existsSync(launcherPath));
    });
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
});

test("Agent Console macOS launcher removal skips apps with a different bundle id", { skip: process.platform !== "darwin" }, async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-agent-console-home-"));
  try {
    await withHome(home, async () => {
      const routes = [];
      const registration = await agentConsolePlugin.setup(createPluginContext({
        pluginConfig: { bridgePort: 34567, launch: false },
        pluginDataDir: path.join(home, "plugin-data"),
        routes
      }));
      const launcherPath = path.join(home, "Applications", "CCR Apps", "Agent Console.app");
      writeLauncherInfoPlist(launcherPath, "com.example.other-launcher");

      await registration.stop({ reason: "disabled" });
      assert.ok(existsSync(launcherPath));
    });
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
});

async function withHome(home, run) {
  const previousHome = process.env.HOME;
  try {
    process.env.HOME = home;
    await run();
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
}

function writeLauncherInfoPlist(launcherPath, bundleId = DEFAULT_LAUNCHER_BUNDLE_ID) {
  const contentsDir = path.join(launcherPath, "Contents");
  mkdirSync(contentsDir, { recursive: true });
  writeFileSync(path.join(contentsDir, "Info.plist"), [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<plist version=\"1.0\">",
    "<dict>",
    "  <key>CFBundleIdentifier</key>",
    `  <string>${bundleId}</string>`,
    "</dict>",
    "</plist>",
    ""
  ].join("\n"), "utf8");
}

function createPluginContext({ config = {}, pluginConfig, pluginDataDir, routes }) {
  return {
    config,
    logger: {
      debug() {},
      info() {},
      warn() {}
    },
    paths: { pluginDataDir },
    pluginConfig,
    permissions: ["apps", "gateway-routes", "system-launcher", "trusted-code"],
    registerApp() {},
    registerGatewayRoute(route) {
      routes.push(route);
    }
  };
}

function readStatusPayload(routes) {
  const statusRoute = routes.find((route) => route.id === "agent-console-status");
  assert.ok(statusRoute, "Agent Console status route should be registered.");

  let payload;
  statusRoute.handler({}, {}, {
    sendJson(_response, statusCode, body) {
      assert.equal(statusCode, 200);
      payload = body;
    }
  });

  assert.ok(payload, "Agent Console status route should return a payload.");
  return payload;
}

async function readRendererRouteBody(routes, url) {
  const rendererRoute = routes.find((route) => route.id === "agent-console-renderer");
  assert.ok(rendererRoute, "Agent Console renderer route should be registered.");

  let body = "";
  await rendererRoute.handler({ method: "GET", url }, {
    end(chunk = "") {
      body += String(chunk);
    },
    writeHead() {}
  });

  return body;
}
