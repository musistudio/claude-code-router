import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  codexDesktopAppName,
  codexSharedChatGptAuthEnvForTest,
  findInstalledCodexAppExecutable,
  findInstalledWorkbuddyAppExecutable,
  removeLegacyCodexVirtualAuthMarker,
  writeCodexCompatibleAppModelCatalog
} from "@ccr/core/agents/codex/app-launch.ts";

test("ChatGPT app launch shares explicit or default Codex login when available", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-chatgpt-shared-auth-"));
  const defaultAuthDir = path.join(root, ".codex");
  const defaultAuthFile = path.join(defaultAuthDir, "auth.json");
  const authFile = path.join(root, "auth.json");
  const previousCcr = process.env.CCR_CODEX_CHATGPT_AUTH_FILE;
  const previousCodexl = process.env.CODEXL_CODEX_CHATGPT_AUTH_FILE;
  try {
    writeFileSync(authFile, JSON.stringify({ auth_mode: "chatgpt", tokens: { access_token: "token" } }));
    mkdirSync(defaultAuthDir, { recursive: true });
    writeFileSync(defaultAuthFile, JSON.stringify({ auth_mode: "chatgpt", tokens: { access_token: "default-token" } }));
    delete process.env.CCR_CODEX_CHATGPT_AUTH_FILE;
    delete process.env.CODEXL_CODEX_CHATGPT_AUTH_FILE;
    assert.deepEqual(codexSharedChatGptAuthEnvForTest(root), {
      CCR_CODEX_CHATGPT_AUTH_FILE: defaultAuthFile,
      CODEXL_CODEX_CHATGPT_AUTH_FILE: defaultAuthFile
    });

    process.env.CCR_CODEX_CHATGPT_AUTH_FILE = authFile;
    assert.deepEqual(codexSharedChatGptAuthEnvForTest(root), {
      CCR_CODEX_CHATGPT_AUTH_FILE: authFile,
      CODEXL_CODEX_CHATGPT_AUTH_FILE: authFile
    });
  } finally {
    if (previousCcr === undefined) delete process.env.CCR_CODEX_CHATGPT_AUTH_FILE;
    else process.env.CCR_CODEX_CHATGPT_AUTH_FILE = previousCcr;
    if (previousCodexl === undefined) delete process.env.CODEXL_CODEX_CHATGPT_AUTH_FILE;
    else process.env.CODEXL_CODEX_CHATGPT_AUTH_FILE = previousCodexl;
    rmSync(root, { force: true, recursive: true });
  }
});

test("ChatGPT model catalog write includes patch bridge capabilities", () => {
  const configDir = mkdtempSync(path.join(os.tmpdir(), "ccr-codex-app-catalog-"));
  try {
    const config = {
      Providers: [
        { name: "DeepSeek", type: "openai_chat_completions", models: ["deepseek-v4-flash"] }
      ],
      Router: {
        builtInRules: {
          "claude-code": { enabled: true },
          codex: { enabled: true }
        },
        fallback: { mode: "off", models: [], retryCount: 1 },
        rules: []
      }
    };
    const profile = {
      agent: "codex",
      enabled: true,
      id: "codex-main",
      model: "DeepSeek/deepseek-v4-flash",
      name: "Codex Main",
      providerId: "openai-codex",
      scope: "ccr",
      surface: "app"
    };

    const result = writeCodexCompatibleAppModelCatalog(configDir, profile, config);
    assert.equal(result.changed, true);
    assert.equal(path.basename(result.file), "ccr-codex-model-catalog.json");
    assert.equal(
      result.userDataDir,
      path.join(configDir, "profiles", "codex-main", "codex", ".claude-code-router", "codex-app-user-data", "codex-main")
    );

    const catalog = JSON.parse(readFileSync(result.file, "utf8"));
    const model = catalog.models.find((item) => item.slug === "DeepSeek/deepseek-v4-flash");
    assert.ok(model);
    assert.equal(model.apply_patch_tool_type, "freeform");

    const second = writeCodexCompatibleAppModelCatalog(configDir, profile, config);
    assert.equal(second.changed, false);
    assert.equal(second.file, result.file);
  } finally {
    rmSync(configDir, { force: true, recursive: true });
  }
});

test("ChatGPT model catalog write includes latest reasoning effort aliases", () => {
  const configDir = mkdtempSync(path.join(os.tmpdir(), "ccr-codex-app-catalog-"));
  try {
    const config = {
      Providers: [
        {
          modelMetadata: {
            "gpt-5-codex": {
              defaultReasoningLevel: "high",
              supportedReasoningLevels: [
                { description: "Low", effort: "low" },
                { description: "High", effort: "high" }
              ],
              supportsReasoningSummaries: true
            }
          },
          models: ["gpt-5-codex"],
          name: "Codex API",
          type: "openai_responses"
        }
      ]
    };
    const profile = {
      agent: "codex",
      enabled: true,
      id: "codex-main",
      model: "Codex API/gpt-5-codex",
      name: "Codex Main",
      providerId: "openai-codex",
      scope: "ccr",
      surface: "app"
    };

    const result = writeCodexCompatibleAppModelCatalog(configDir, profile, config);
    const catalog = JSON.parse(readFileSync(result.file, "utf8"));
    const model = catalog.models.find((item) => item.slug === "Codex API/gpt-5-codex");

    assert.ok(model);
    assert.equal(model.displayName, "Codex API/gpt-5-codex");
    assert.equal(model.defaultReasoningEffort, "high");
    assert.equal(model.default_reasoning_effort, "high");
    assert.deepEqual(model.supportedReasoningEfforts.map((level) => level.reasoningEffort), ["low", "high"]);
    assert.deepEqual(model.supported_reasoning_efforts, ["low", "high"]);
  } finally {
    rmSync(configDir, { force: true, recursive: true });
  }
});

test("ChatGPT model catalog write gives gateway GPT models reasoning effort fallbacks", () => {
  const configDir = mkdtempSync(path.join(os.tmpdir(), "ccr-codex-app-catalog-"));
  try {
    const config = {
      Providers: [
        {
          models: ["gpt-5.5", "gpt-5.6"],
          name: "uuroute",
          type: "openai_responses"
        }
      ]
    };
    const profile = {
      agent: "codex",
      enabled: true,
      id: "codex-main",
      model: "uuroute/gpt-5.6",
      name: "Codex Main",
      providerId: "openai-codex",
      scope: "ccr",
      surface: "app"
    };

    const result = writeCodexCompatibleAppModelCatalog(configDir, profile, config);
    const catalog = JSON.parse(readFileSync(result.file, "utf8"));
    const baseModel = catalog.models.find((item) => item.slug === "uuroute/gpt-5.5");
    const latestModel = catalog.models.find((item) => item.slug === "uuroute/gpt-5.6");

    assert.ok(baseModel);
    assert.equal(baseModel.defaultReasoningEffort, "medium");
    assert.deepEqual(baseModel.supportedReasoningEfforts.map((level) => level.reasoningEffort), ["minimal", "low", "medium", "high"]);
    assert.deepEqual(baseModel.supported_reasoning_efforts, ["minimal", "low", "medium", "high"]);
    assert.ok(latestModel);
    assert.equal(latestModel.defaultReasoningEffort, "medium");
    assert.deepEqual(latestModel.supportedReasoningEfforts.map((level) => level.reasoningEffort), ["minimal", "low", "medium", "high", "xhigh"]);
    assert.deepEqual(latestModel.supported_reasoning_efforts, ["minimal", "low", "medium", "high", "xhigh"]);
  } finally {
    rmSync(configDir, { force: true, recursive: true });
  }
});

test("ZCode app model catalog uses the public model context window", () => {
  const configDir = mkdtempSync(path.join(os.tmpdir(), "ccr-zcode-app-catalog-"));
  try {
    const config = {
      Providers: [{
        api_base_url: "https://chatgpt.com/backend-api/codex",
        modelMetadata: {
          "gpt-5.6-sol": {
            contextWindow: 272_000,
            maxContextWindow: 272_000
          }
        },
        models: ["gpt-5.6-sol"],
        name: "Codex API",
        type: "openai_responses"
      }],
      virtualModelProfiles: [{
        baseModel: { fixedModel: "Codex API/gpt-5.6-sol", mode: "fixed" },
        enabled: true,
        match: { exactAliases: ["catalog-context"], prefixes: [], suffixes: [] },
        materialization: { enabled: true, includeInGatewayModels: true }
      }]
    };
    const profile = {
      agent: "zcode",
      codexHome: configDir,
      enabled: true,
      id: "zcode-main",
      model: "Codex API/gpt-5.6-sol",
      name: "ZCode Main",
      providerId: "claude-code-router",
      scope: "global",
      surface: "app"
    };

    const result = writeCodexCompatibleAppModelCatalog(configDir, profile, config);
    const catalog = JSON.parse(readFileSync(result.file, "utf8"));
    const fusionModel = catalog.models.find((item) => item.slug === "Fusion/catalog-context");
    const model = catalog.models.find((item) => item.slug === "Codex API/gpt-5.6-sol");

    assert.equal(path.basename(result.file), "ccr-zcode-model-catalog.json");
    assert.equal(fusionModel.context_window, 1_050_000);
    assert.equal(fusionModel.max_context_window, 1_050_000);
    assert.equal(model.context_window, 1_050_000);
    assert.equal(model.max_context_window, 1_050_000);
  } finally {
    rmSync(configDir, { force: true, recursive: true });
  }
});

test("ChatGPT desktop app path override discovers the renamed executable", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-chatgpt-app-"));
  const previous = process.env.CHATGPT_APP_PATH;
  try {
    let configuredPath;
    let expectedExecutable;
    if (process.platform === "darwin") {
      configuredPath = path.join(root, "ChatGPT.app");
      const macosDir = path.join(configuredPath, "Contents", "MacOS");
      mkdirSync(macosDir, { recursive: true });
      expectedExecutable = path.join(macosDir, "ChatGPT");
      writeFileSync(expectedExecutable, "");
      writeFileSync(
        path.join(configuredPath, "Contents", "Info.plist"),
        "<plist><dict><key>CFBundleExecutable</key><string>ChatGPT</string></dict></plist>"
      );
    } else {
      expectedExecutable = path.join(root, process.platform === "win32" ? "ChatGPT.exe" : "chatgpt");
      configuredPath = expectedExecutable;
      writeFileSync(expectedExecutable, "");
    }

    process.env.CHATGPT_APP_PATH = configuredPath;
    const result = findInstalledCodexAppExecutable();
    assert.equal(codexDesktopAppName, "ChatGPT");
    assert.equal(result.executable, expectedExecutable);
    assert.equal(result.checked[0], configuredPath);
  } finally {
    if (previous === undefined) {
      delete process.env.CHATGPT_APP_PATH;
    } else {
      process.env.CHATGPT_APP_PATH = previous;
    }
    rmSync(root, { force: true, recursive: true });
  }
});

test("ChatGPT profile appPath overrides process env discovery", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-chatgpt-profile-app-"));
  const previous = process.env.CHATGPT_APP_PATH;
  try {
    const envExecutable = path.join(root, "env", "ChatGPT");
    mkdirSync(path.dirname(envExecutable), { recursive: true });
    writeFileSync(envExecutable, "");
    process.env.CHATGPT_APP_PATH = envExecutable;

    const profileExecutable = path.join(root, "profile", "ChatGPT");
    mkdirSync(path.dirname(profileExecutable), { recursive: true });
    writeFileSync(profileExecutable, "");

    withPlatform("linux", () => {
      const result = findInstalledCodexAppExecutable(profileExecutable);
      assert.equal(result.executable, profileExecutable);
      assert.equal(result.checked[0], profileExecutable);
    });
  } finally {
    if (previous === undefined) {
      delete process.env.CHATGPT_APP_PATH;
    } else {
      process.env.CHATGPT_APP_PATH = previous;
    }
    rmSync(root, { force: true, recursive: true });
  }
});

test("WorkBuddy AI app path override discovers the Electron executable", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-workbuddy-app-"));
  try {
    let configuredPath;
    let expectedExecutable;
    if (process.platform === "darwin") {
      configuredPath = path.join(root, "WorkBuddy AI.app");
      const macosDir = path.join(configuredPath, "Contents", "MacOS");
      mkdirSync(macosDir, { recursive: true });
      expectedExecutable = path.join(macosDir, "Electron");
      writeFileSync(expectedExecutable, "");
      writeFileSync(
        path.join(configuredPath, "Contents", "Info.plist"),
        "<plist><dict><key>CFBundleExecutable</key><string>Electron</string></dict></plist>"
      );
    } else {
      expectedExecutable = path.join(root, process.platform === "win32" ? "WorkBuddyAI.exe" : "workbuddy-ai");
      configuredPath = expectedExecutable;
      writeFileSync(expectedExecutable, "");
    }

    const result = findInstalledWorkbuddyAppExecutable(configuredPath);
    assert.equal(result.executable, expectedExecutable);
    assert.equal(result.checked[0], configuredPath);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("WorkBuddy AI app profile writes the virtual desktop auth session", () => {
  const configDir = mkdtempSync(path.join(os.tmpdir(), "ccr-workbuddy-app-auth-"));
  try {
    const profile = {
      agent: "workbuddy",
      enabled: true,
      id: "workbuddy-main",
      model: "Codex API/gpt-5-codex",
      name: "WorkBuddy Main",
      providerId: "claude-code-router",
      scope: "ccr",
      surface: "app"
    };

    const workbuddyConfig = {
      gateway: {
        enabled: true,
        host: "0.0.0.0",
        mode: "process",
        port: 48765
      },
      Providers: [{
        modelMetadata: {
          "gpt-5-codex": {
            contextWindow: 272_000,
            defaultReasoningLevel: "medium",
            supportedReasoningLevels: [
              { description: "Medium", effort: "medium" },
              { description: "High", effort: "high" }
            ],
            supportsReasoningSummaries: true
          }
        },
        models: ["gpt-5-codex"],
        name: "Codex API",
        type: "openai_responses"
      }]
    };
    const result = writeCodexCompatibleAppModelCatalog(configDir, profile, workbuddyConfig);

    assert.equal(path.basename(result.file), "ccr-workbuddy-model-catalog.json");
    assert.ok(result.workbuddyModelsConfig);
    assert.equal(path.basename(result.workbuddyModelsConfig.file), "models.json");
    assert.equal(result.workbuddyModelsConfig.model, "Codex API/gpt-5-codex");
    const modelsConfig = JSON.parse(readFileSync(result.workbuddyModelsConfig.file, "utf8"));
    assert.deepEqual(modelsConfig.availableModels, ["Codex API/gpt-5-codex"]);
    assert.equal(modelsConfig.models.length, 1);
    assert.equal(modelsConfig.models[0].id, "Codex API/gpt-5-codex");
    assert.equal(modelsConfig.models[0].vendor, "Codex API");
    assert.equal(modelsConfig.models[0].url, "http://127.0.0.1:48765/v1");
    assert.equal(modelsConfig.models[0].apiKey, "${CCR_PROFILE_API_KEY}");
    assert.equal(modelsConfig.models[0].supportsToolCall, true);
    assert.equal(modelsConfig.models[0].supportsReasoning, true);
    assert.equal(modelsConfig.models[0].maxInputTokens, 272_000);
    assert.deepEqual(modelsConfig.models[0].reasoning.supportedEfforts, ["medium", "high"]);

    assert.ok(result.workbuddyVirtualAuth);
    assert.equal(path.basename(result.workbuddyVirtualAuth.authFile), "workbuddy-desktop-ai.info");
    assert.ok(result.workbuddyVirtualAuth.authFile.includes(path.join("CodeBuddyExtension", "Data", "Public", "auth")));
    assert.equal(existsSync(result.workbuddyVirtualAuth.authFile), true);

    const session = JSON.parse(readFileSync(result.workbuddyVirtualAuth.authFile, "utf8"));
    assert.equal(session.auth.accessToken, "ccr-local-profile");
    assert.equal(session.auth.domain, "www.workbuddy.ai");
    assert.equal(session.auth.refreshToken, "");
    assert.ok(Date.now() - session.auth.lastRefreshTime < 5_000);
    assert.equal(session.account.uid, "ccr-local-profile");
    assert.equal(session.account.nickname, "WorkBuddy Main");
    assert.equal(session.account.type, "personal");
    assert.deepEqual(session.accounts, [session.account]);
    assert.deepEqual(session.allAccounts, [session.account]);

    const second = writeCodexCompatibleAppModelCatalog(configDir, profile, workbuddyConfig);
    assert.equal(second.workbuddyModelsConfig.changed, false);
  } finally {
    rmSync(configDir, { force: true, recursive: true });
  }
});

test("WorkBuddy AI app profile writes every allowed model to models.json", () => {
  const configDir = mkdtempSync(path.join(os.tmpdir(), "ccr-workbuddy-app-models-"));
  try {
    const profile = {
      agent: "workbuddy",
      availableModels: ["Codex API/gpt-5-codex", "Codex API/gpt-5.1-codex"],
      enabled: true,
      id: "workbuddy-main",
      model: "Codex API/gpt-5-codex",
      name: "WorkBuddy Main",
      providerId: "claude-code-router",
      scope: "ccr",
      surface: "app"
    };

    const result = writeCodexCompatibleAppModelCatalog(configDir, profile, {
      Providers: [{
        models: ["gpt-5-codex", "gpt-5.1-codex", "gpt-4.1"],
        name: "Codex API",
        type: "openai_responses"
      }]
    });

    const modelsConfig = JSON.parse(readFileSync(result.workbuddyModelsConfig.file, "utf8"));
    assert.deepEqual(modelsConfig.availableModels, ["Codex API/gpt-5-codex", "Codex API/gpt-5.1-codex"]);
    assert.deepEqual(modelsConfig.models.map((item) => item.id), ["Codex API/gpt-5-codex", "Codex API/gpt-5.1-codex"]);
    assert.deepEqual(modelsConfig.models.map((item) => item.name), ["Codex API/gpt-5-codex", "Codex API/gpt-5.1-codex"]);
    assert.deepEqual(modelsConfig.models.map((item) => item.isDefault), [true, false]);
  } finally {
    rmSync(configDir, { force: true, recursive: true });
  }
});

test("WorkBuddy AI app profile writes every catalog model when the allowlist is unrestricted", () => {
  const configDir = mkdtempSync(path.join(os.tmpdir(), "ccr-workbuddy-app-unrestricted-models-"));
  try {
    const profile = {
      agent: "workbuddy",
      enabled: true,
      id: "workbuddy-main",
      model: "Codex API/gpt-5-codex",
      name: "WorkBuddy Main",
      providerId: "claude-code-router",
      scope: "ccr",
      surface: "app"
    };

    const result = writeCodexCompatibleAppModelCatalog(configDir, profile, {
      Providers: [{
        models: ["gpt-5-codex", "gpt-5.1-codex", "gpt-4.1"],
        name: "Codex API",
        type: "openai_responses"
      }]
    });

    const modelsConfig = JSON.parse(readFileSync(result.workbuddyModelsConfig.file, "utf8"));
    assert.deepEqual(modelsConfig.availableModels, ["Codex API/gpt-5-codex", "Codex API/gpt-5.1-codex", "Codex API/gpt-4.1"]);
    assert.deepEqual(modelsConfig.models.map((item) => item.isDefault), [true, false, false]);
  } finally {
    rmSync(configDir, { force: true, recursive: true });
  }
});

function withPlatform(platform, callback) {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform
  });
  try {
    return callback();
  } finally {
    Object.defineProperty(process, "platform", descriptor);
  }
}

test("ChatGPT migration removes only the exact legacy CCR auth marker", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-chatgpt-auth-migration-"));
  const authFile = path.join(root, "auth.json");
  try {
    writeFileSync(authFile, JSON.stringify({
      auth_mode: "apikey",
      OPENAI_API_KEY: "ccr-local-profile"
    }));
    assert.equal(removeLegacyCodexVirtualAuthMarker(root), true);
    assert.equal(existsSync(authFile), false);

    const realAuth = { auth_mode: "chatgpt", tokens: { access_token: "preserve-me" } };
    writeFileSync(authFile, JSON.stringify(realAuth));
    assert.equal(removeLegacyCodexVirtualAuthMarker(root), false);
    assert.deepEqual(JSON.parse(readFileSync(authFile, "utf8")), realAuth);

    const customApiKey = { auth_mode: "apikey", OPENAI_API_KEY: "user-key" };
    writeFileSync(authFile, JSON.stringify(customApiKey));
    assert.equal(removeLegacyCodexVirtualAuthMarker(root), false);
    assert.deepEqual(JSON.parse(readFileSync(authFile, "utf8")), customApiKey);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
