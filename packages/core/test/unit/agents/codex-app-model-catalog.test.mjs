import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  codexDesktopAppName,
  codexSharedChatGptAuthEnvForTest,
  findInstalledCodexAppExecutable,
  removeLegacyCodexVirtualAuthMarker,
  writeCodexCompatibleAppModelCatalog
} from "@ccr/core/agents/codex/app-launch.ts";

test("ChatGPT app launch bridges an existing shared Codex login without copying it", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-chatgpt-shared-auth-"));
  const authFile = path.join(root, "auth.json");
  const previousCcr = process.env.CCR_CODEX_CHATGPT_AUTH_FILE;
  const previousCodexl = process.env.CODEXL_CODEX_CHATGPT_AUTH_FILE;
  try {
    writeFileSync(authFile, JSON.stringify({ auth_mode: "chatgpt", tokens: { access_token: "token" } }));
    process.env.CCR_CODEX_CHATGPT_AUTH_FILE = authFile;
    delete process.env.CODEXL_CODEX_CHATGPT_AUTH_FILE;

    assert.deepEqual(codexSharedChatGptAuthEnvForTest(), {
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
