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
              models: ["gpt-5.5"],
              name: "Codex API"
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
      const runtimeToggleReasoningModel = runtimeConfig.models.find((item) => item.model === "Zhipu AI (China) - Coding Plan/glm-4.5");
      const runtimeBasicModel = runtimeConfig.models.find((item) => item.model === "Zhipu AI (China) - Coding Plan/glm-4-air");
      const runtimeZhipuEffortReasoningModel = runtimeConfig.models.find((item) => item.model === "Zhipu AI (China) - Coding Plan/glm-5.2");
      const runtimeEffortReasoningModel = runtimeConfig.models.find((item) => item.model === "OpenRouter/z-ai/glm-5.2");
      const runtimeOpenAiReasoningModel = runtimeConfig.models.find((item) => item.model === "Codex API/gpt-5.5");
      const toggleReasoningModel = catalog.models.find((item) => item.slug === "Zhipu AI (China) - Coding Plan/glm-4.5");
      const basicModel = catalog.models.find((item) => item.slug === "Zhipu AI (China) - Coding Plan/glm-4-air");
      const zhipuEffortReasoningModel = catalog.models.find((item) => item.slug === "Zhipu AI (China) - Coding Plan/glm-5.2");
      const effortReasoningModel = catalog.models.find((item) => item.slug === "OpenRouter/z-ai/glm-5.2");
      const openAiReasoningModel = catalog.models.find((item) => item.slug === "Codex API/gpt-5.5");

      assert.ok(runtimeToggleReasoningModel);
      assert.ok(runtimeBasicModel);
      assert.ok(runtimeZhipuEffortReasoningModel);
      assert.ok(runtimeEffortReasoningModel);
      assert.ok(runtimeOpenAiReasoningModel);
      assert.ok(toggleReasoningModel);
      assert.ok(basicModel);
      assert.ok(zhipuEffortReasoningModel);
      assert.ok(effortReasoningModel);
      assert.ok(openAiReasoningModel);
      assert.deepEqual(runtimeToggleReasoningModel.supportedReasoningEfforts, []);
      assert.deepEqual(runtimeToggleReasoningModel.supportedSpeeds, []);
      assert.deepEqual(runtimeBasicModel.supportedReasoningEfforts, []);
      assert.deepEqual(runtimeBasicModel.supportedSpeeds, []);
      assert.deepEqual(runtimeZhipuEffortReasoningModel.supportedReasoningEfforts, ["high", "xhigh"]);
      assert.equal(runtimeZhipuEffortReasoningModel.defaultReasoningEffort, undefined);
      assert.deepEqual(runtimeZhipuEffortReasoningModel.supportedSpeeds, []);
      assert.deepEqual(runtimeEffortReasoningModel.supportedReasoningEfforts, ["xhigh", "high"]);
      assert.equal(runtimeEffortReasoningModel.defaultReasoningEffort, "high");
      assert.deepEqual(runtimeEffortReasoningModel.supportedSpeeds, []);
      assert.deepEqual(runtimeOpenAiReasoningModel.supportedReasoningEfforts, ["minimal", "low", "medium", "high"]);
      assert.equal(runtimeOpenAiReasoningModel.defaultReasoningEffort, "medium");
      assert.deepEqual(runtimeOpenAiReasoningModel.supportedSpeeds, []);
      assert.equal(toggleReasoningModel.display_name, toggleReasoningModel.slug);
      assert.equal(basicModel.display_name, basicModel.slug);
      assert.equal(zhipuEffortReasoningModel.display_name, zhipuEffortReasoningModel.slug);
      assert.equal(effortReasoningModel.display_name, effortReasoningModel.slug);
      assert.equal(openAiReasoningModel.display_name, openAiReasoningModel.slug);
      assert.equal(toggleReasoningModel.default_reasoning_level, null);
      assert.deepEqual(toggleReasoningModel.supported_reasoning_levels, []);
      assert.equal(toggleReasoningModel.supports_reasoning_summaries, true);
      assert.equal(zhipuEffortReasoningModel.default_reasoning_level, null);
      assert.deepEqual(zhipuEffortReasoningModel.supported_reasoning_levels.map((level) => level.effort), ["high", "xhigh"]);
      assert.equal(zhipuEffortReasoningModel.supports_reasoning_summaries, true);
      assert.equal(effortReasoningModel.default_reasoning_level, "high");
      assert.deepEqual(effortReasoningModel.supported_reasoning_levels.map((level) => level.effort), ["xhigh", "high"]);
      assert.equal(effortReasoningModel.supports_reasoning_summaries, true);
      assert.equal(openAiReasoningModel.default_reasoning_level, "medium");
      assert.deepEqual(openAiReasoningModel.supported_reasoning_levels.map((level) => level.effort), ["minimal", "low", "medium", "high"]);
      assert.equal(openAiReasoningModel.supports_reasoning_summaries, true);
      assert.equal(basicModel.default_reasoning_level, null);
      assert.deepEqual(basicModel.supported_reasoning_levels, []);
      assert.equal(basicModel.supports_reasoning_summaries, false);
    });
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
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
