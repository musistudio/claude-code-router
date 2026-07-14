import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "../../packages/core/src/config/default-config.ts";
import { CONFIGDIR } from "../../packages/core/src/config/constants.ts";
import { applyProfileConfig, cleanupGeneratedBinBackups, resolveGrokSourceHome, restoreInactiveGlobalProfileConfigs, restoreGlobalProfileConfigsOnExit } from "../../packages/core/src/profiles/service.ts";

test("Grok profile source home follows profile and process environment overrides", () => {
  const previous = {
    GROK_CONFIG_DIR: process.env.GROK_CONFIG_DIR,
    GROK_HOME: process.env.GROK_HOME,
    GROK_STORAGE_DIR: process.env.GROK_STORAGE_DIR
  };
  try {
    process.env.GROK_HOME = "/tmp/process-grok-home";
    process.env.GROK_STORAGE_DIR = "/tmp/process-grok-storage";
    process.env.GROK_CONFIG_DIR = "/tmp/process-grok-config";
    assert.equal(resolveGrokSourceHome({ env: {} }), path.resolve("/tmp/process-grok-home"));
    assert.equal(resolveGrokSourceHome({ env: { GROK_HOME: "/tmp/profile-grok-home" } }), path.resolve("/tmp/profile-grok-home"));
    assert.equal(resolveGrokSourceHome({ env: { GROK_STORAGE_DIR: "/tmp/profile-grok-storage" } }), path.resolve("/tmp/profile-grok-storage"));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("profile service cleans stale generated bin backups only", () => {
  const configDir = mkdtempSync(path.join(os.tmpdir(), "ccr-generated-bin-cleanup-"));
  try {
    const binDir = path.join(configDir, "bin");
    mkdirSync(binDir, { recursive: true });
    const deletedFiles = [
      "ccr-claude-code-api-key-default.ccr-backup-2026-01-01T00-00-00-000Z",
      "ccr-claude-code-wrapper-default.ccr-original",
      "ccr-codex-cli-stdio-default.ccr-original-missing",
      "ccr-codex-cli-middleware.js.ccr-backup-2026-01-01T00-00-00-000Z",
      "toolhub-mcp.js.ccr-backup-2026-01-01T00-00-00-000Z"
    ];
    const keptFiles = [
      "custom-tool.ccr-backup-2026-01-01T00-00-00-000Z",
      "notes.txt"
    ];
    for (const file of [...deletedFiles, ...keptFiles]) {
      writeFileSync(path.join(binDir, file), "old");
    }

    assert.equal(cleanupGeneratedBinBackups(configDir), deletedFiles.length);
    for (const file of deletedFiles) {
      assert.equal(existsSync(path.join(binDir, file)), false);
    }
    for (const file of keptFiles) {
      assert.equal(existsSync(path.join(binDir, file)), true);
    }
  } finally {
    rmSync(configDir, { force: true, recursive: true });
  }
});

test("profile service can exclude ZCode from automatic synchronization", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-zcode-auto-sync-"));
  try {
    const configFile = path.join(root, ".zcode", "cli", "config.json");
    const original = `${JSON.stringify({
      model: { main: "builtin:zai/glm-5" },
      provider: { "builtin:zai": { name: "Z.AI" } }
    }, null, 2)}\n`;
    mkdirSync(path.dirname(configFile), { recursive: true });
    writeFileSync(configFile, original);

    const config = createDefaultAppConfig({
      generatedConfigFile: path.join(CONFIGDIR, "gateway.config.json")
    });
    config.profile.profiles = [
      {
        agent: "zcode",
        cliMiddleware: true,
        codexCliPath: "",
        codexHome: "",
        configFile,
        configFormat: "separate_profile_files",
        enabled: true,
        env: {},
        id: "zcode",
        model: "Provider/model",
        name: "ZCode",
        providerId: "claude-code-router",
        providerName: "Claude Code Router",
        scope: "global",
        showAllSessions: false,
        surface: "app"
      }
    ];

    const result = await applyProfileConfig(config, { excludeAgents: ["zcode"] });

    assert.equal(result.enabled, false);
    assert.deepEqual(result.clients, []);
    assert.equal(readFileSync(configFile, "utf8"), original);
    assert.equal(existsSync(path.join(root, ".zcode", "v2", "config.json")), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("profile service overwrites generated bin files without creating backups", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "generated-bin-test";
  const commandExtension = process.platform === "win32" ? ".cmd" : "";
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { recursive: true });
  const generatedFiles = [
    path.join(binDir, `ccr-claude-code-api-key-${profileId}${commandExtension}`),
    path.join(binDir, `ccr-claude-code-wrapper-${profileId}${commandExtension}`),
    path.join(binDir, "ccr-codex-cli-middleware.js"),
    path.join(binDir, "toolhub-mcp.js")
  ];
  for (const file of generatedFiles) {
    writeFileSync(file, "old generated content\n");
    writeFileSync(`${file}.ccr-backup-2026-01-01T00-00-00-000Z`, "old backup\n");
    writeFileSync(`${file}.ccr-original`, "old original\n");
  }

  const config = createDefaultAppConfig({
    generatedConfigFile: path.join(CONFIGDIR, "gateway.config.json")
  });
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }
  ];
  config.preferredProvider = "Provider";
  config.toolHub = {
    ...config.toolHub,
    enabled: true,
    llm: {
      ...config.toolHub.llm,
      apiKey: "resolver-key",
      baseUrl: "https://example.test/v1",
      model: "model"
    },
    mcpServers: [
      {
        command: "node",
        name: "backend",
        transport: "stdio"
      }
    ]
  };
  config.APIKEY = "ccr-profile-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "ccr-profile-test",
      name: "Profile: Generated Bin Test"
    }
  ];
  config.profile.profiles = [
    {
      agent: "claude-code",
      enabled: true,
      env: {},
      id: profileId,
      model: "Provider/model",
      name: "Generated Bin Test",
      scope: "ccr",
      settingsFile: "~/.claude/settings.json",
      smallFastModel: "",
      surface: "auto"
    }
  ];

  const result = await applyProfileConfig(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].ok, true);
  for (const file of generatedFiles) {
    assert.notEqual(readFileSync(file, "utf8"), "old generated content\n");
  }
  const toolHubMcpConfigFile = path.join(CONFIGDIR, "profiles", profileId, "claude", "toolhub-mcp.json");
  const toolHubMcpConfig = JSON.parse(readFileSync(toolHubMcpConfigFile, "utf8"));
  const toolHubMcpServerEnv = toolHubMcpConfig.mcpServers["ccr-toolhub"].env;
  assert.equal(toolHubMcpServerEnv.TOOLHUB_OPENAI_API_KEY, "ccr-profile-test");
  assert.equal(toolHubMcpServerEnv.TOOLHUB_OPENAI_BASE_URL, `http://127.0.0.1:${config.gateway.port}/v1`);
  assert.equal(toolHubMcpServerEnv.TOOLHUB_OPENAI_MODEL, "Provider/model");
  const backupEntries = readdirSync(binDir).filter((entry) =>
    (
      entry.startsWith(`ccr-claude-code-api-key-${profileId}`) ||
      entry.startsWith(`ccr-claude-code-wrapper-${profileId}`) ||
      entry.startsWith("ccr-codex-cli-middleware.js") ||
      entry.startsWith("toolhub-mcp.js")
    ) && entry.includes(".ccr-")
  );
  assert.deepEqual(backupEntries, []);
});

test("profile service injects ToolHub MCP into Codex config", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "codex-toolhub-test";
  const config = createDefaultAppConfig({
    generatedConfigFile: path.join(CONFIGDIR, "gateway.config.json")
  });
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }
  ];
  config.preferredProvider = "Provider";
  config.toolHub = {
    ...config.toolHub,
    enabled: true,
    llm: {
      ...config.toolHub.llm,
      apiKey: "resolver-key",
      baseUrl: "https://example.test/v1",
      model: "model"
    },
    mcpServers: [
      {
        command: "node",
        name: "backend",
        transport: "stdio"
      }
    ]
  };
  config.APIKEY = "ccr-codex-profile-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "ccr-codex-profile-test",
      name: "Profile: Codex ToolHub Test"
    }
  ];
  config.profile.profiles = [
    {
      agent: "codex",
      cliMiddleware: false,
      codexCliPath: "",
      codexHome: "",
      configFile: "",
      configFormat: "legacy",
      enabled: true,
      env: {},
      id: profileId,
      model: "Provider/model",
      name: "Codex ToolHub Test",
      providerId: "claude-code-router",
      providerName: "Claude Code Router",
      scope: "ccr",
      showAllSessions: false,
      surface: "auto"
    }
  ];

  const result = await applyProfileConfig(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].ok, true);

  const configFile = path.join(CONFIGDIR, "profiles", profileId, "codex", "config.toml");
  const content = readFileSync(configFile, "utf8");
  assert.match(content, /# BEGIN CCR managed ToolHub MCP/);
  assert.match(content, /\[mcp_servers\.ccr-toolhub\]/);
  assert.equal(content.includes(`command = ${JSON.stringify(process.execPath)}`), true);
  assert.equal(content.includes(`args = [${JSON.stringify(path.join(CONFIGDIR, "bin", "toolhub-mcp.js"))}]`), true);
  assert.match(content, /\[mcp_servers\.ccr-toolhub\.env\]/);
  assert.match(content, /TOOLHUB_OPENAI_API_KEY = "ccr-codex-profile-test"/);
  assert.match(content, new RegExp(`TOOLHUB_OPENAI_BASE_URL = "http://127\\.0\\.0\\.1:${config.gateway.port}/v1"`));
  assert.match(content, /TOOLHUB_OPENAI_MODEL = "Provider\/model"/);
});

test("profile service writes a Grok CLI wrapper that points model discovery and inference to CCR", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "grok-gateway-test";
  const sourceGrokHome = path.join(process.env.HOME, ".grok");
  mkdirSync(path.join(sourceGrokHome, "sessions"), { recursive: true });
  mkdirSync(path.join(sourceGrokHome, "skills"), { recursive: true });
  writeFileSync(path.join(sourceGrokHome, "auth.json"), "oauth credentials must not be shared");
  writeFileSync(path.join(sourceGrokHome, "config.toml"), "[ui]\ncompact_mode = false\n");
  const profileGrokHome = path.join(CONFIGDIR, "profiles", profileId, "grok");
  const profileGrokConfig = path.join(profileGrokHome, "config.toml");
  if (process.platform !== "win32") {
    mkdirSync(profileGrokHome, { recursive: true });
    symlinkSync(path.join(sourceGrokHome, "config.toml"), profileGrokConfig);
  }
  const config = createDefaultAppConfig({
    generatedConfigFile: path.join(CONFIGDIR, "gateway.config.json")
  });
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }
  ];
  config.preferredProvider = "Provider";
  config.APIKEY = "ccr-grok-profile-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "ccr-grok-profile-test",
      name: "Profile: Grok Gateway Test"
    }
  ];
  config.profile.profiles = [
    {
      agent: "grok",
      enabled: true,
      env: {
        CCR_GROK_BIN: "/custom/bin/grok",
        GROK_HOME: "~/.grok",
        GROK_MODELS_BASE_URL: "https://ignored.example/v1",
        USER_VALUE: "kept"
      },
      id: profileId,
      model: "Provider/model",
      name: "Grok Gateway Test",
      scope: "ccr",
      surface: "cli"
    }
  ];

  const result = await applyProfileConfig(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].client, "grok");
  assert.equal(result.clients[0].ok, true);

  const commandExtension = process.platform === "win32" ? ".cmd" : "";
  const wrapperFile = path.join(CONFIGDIR, "bin", `ccr-grok-cli-wrapper-${profileId}${commandExtension}`);
  const content = readFileSync(wrapperFile, "utf8");
  assert.match(content, new RegExp(`GROK_MODELS_BASE_URL.*http://127\\.0\\.0\\.1:${config.gateway.port}/v1`));
  assert.match(content, new RegExp(`GROK_MODELS_LIST_URL.*http://127\\.0\\.0\\.1:${config.gateway.port}/v1/models`));
  assert.match(content, /XAI_API_KEY.*ccr-grok-profile-test/);
  assert.match(content, /GROK_DEFAULT_MODEL.*Provider\/model/);
  assert.match(content, new RegExp(`GROK_HOME.*profiles.*${profileId}.*grok`));
  assert.match(content, /USER_VALUE.*kept/);
  assert.match(content, /NO_PROXY.*127\.0\.0\.1,localhost,::1/);
  assert.match(content, /\/custom\/bin\/grok/);
  assert.equal(content.includes("https://ignored.example/v1"), false);

  assert.equal(readFileSync(profileGrokConfig, "utf8"), "[ui]\ncompact_mode = false\n");
  assert.equal(lstatSync(profileGrokConfig).isSymbolicLink(), false);
  writeFileSync(profileGrokConfig, "[ui]\ncompact_mode = true\n");
  assert.equal(readFileSync(path.join(sourceGrokHome, "config.toml"), "utf8"), "[ui]\ncompact_mode = false\n");
  assert.equal(existsSync(path.join(profileGrokHome, "sessions")), true);
  assert.equal(existsSync(path.join(profileGrokHome, "skills")), true);
  assert.equal(existsSync(path.join(profileGrokHome, "auth.json")), false);
});

test("profile service writes an OpenCode CLI wrapper and shared CLI/App config", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "opencode-gateway-test";
  const config = createDefaultAppConfig({
    generatedConfigFile: path.join(CONFIGDIR, "gateway.config.json")
  });
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }
  ];
  config.preferredProvider = "Provider";
  config.APIKEY = "ccr-opencode-profile-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "ccr-opencode-profile-test",
      name: "Profile: OpenCode Gateway Test"
    }
  ];
  config.profile.profiles = [
    {
      agent: "opencode",
      enabled: true,
      env: {
        CCR_OPENCODE_BIN: "/custom/bin/opencode",
        OPENCODE_CONFIG: "/ignored/opencode.json",
        USER_VALUE: "kept"
      },
      id: profileId,
      model: "Provider/model",
      name: "OpenCode Gateway Test",
      providerId: "claude-code-router",
      providerName: "Claude Code Router",
      scope: "ccr",
      surface: "auto"
    }
  ];

  const result = await applyProfileConfig(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].client, "opencode");
  assert.equal(result.clients[0].ok, true);

  const configFile = path.join(CONFIGDIR, "profiles", profileId, "opencode", "opencode.jsonc");
  const openCodeConfig = JSON.parse(readFileSync(configFile, "utf8"));
  assert.equal(openCodeConfig.model, "claude-code-router/Provider/model");
  assert.equal(openCodeConfig.small_model, openCodeConfig.model);
  assert.equal(openCodeConfig.provider["claude-code-router"].options.apiKey, "ccr-opencode-profile-test");
  assert.equal(openCodeConfig.provider["claude-code-router"].options.baseURL, `http://127.0.0.1:${config.gateway.port}/v1`);

  const commandExtension = process.platform === "win32" ? ".cmd" : "";
  const wrapperFile = path.join(CONFIGDIR, "bin", `ccr-opencode-wrapper-${profileId}${commandExtension}`);
  const wrapper = readFileSync(wrapperFile, "utf8");
  assert.match(wrapper, /OPENCODE_CONFIG/);
  assert.match(wrapper, /OPENCODE_CONFIG_CONTENT/);
  assert.match(wrapper, /USER_VALUE.*kept/);
  assert.match(wrapper, /custom[\\/]bin[\\/]opencode/);
  assert.equal(wrapper.includes("/ignored/opencode.json"), false);
});

test("profile service removes disabled and deleted OpenCode wrappers and API keys", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "opencode-cleanup-test";
  const config = createDefaultAppConfig({
    generatedConfigFile: path.join(CONFIGDIR, "gateway.config.json")
  });
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }
  ];
  config.preferredProvider = "Provider";
  config.APIKEY = "general-key";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "general-key",
      key: "general-key",
      name: "General key"
    },
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "opencode-profile-key",
      name: "Profile: OpenCode Cleanup Test"
    }
  ];
  const profile = {
    agent: "opencode",
    enabled: true,
    env: {},
    id: profileId,
    model: "Provider/model",
    name: "OpenCode Cleanup Test",
    providerId: "claude-code-router",
    providerName: "Claude Code Router",
    scope: "ccr",
    surface: "auto"
  };
  config.profile.profiles = [profile];
  const commandExtension = process.platform === "win32" ? ".cmd" : "";
  const wrapperFile = path.join(CONFIGDIR, "bin", `ccr-opencode-wrapper-${profileId}${commandExtension}`);

  await applyProfileConfig(config);
  assert.equal(existsSync(wrapperFile), true);

  profile.enabled = false;
  await applyProfileConfig(config);
  assert.equal(existsSync(wrapperFile), false);
  assert.deepEqual(config.APIKEYS.map((apiKey) => apiKey.id), ["general-key"]);

  profile.enabled = true;
  await applyProfileConfig(config);
  assert.equal(existsSync(wrapperFile), true);
  assert.ok(config.APIKEYS.some((apiKey) => apiKey.id === `profile:${profileId}`));

  config.profile.profiles = [];
  await applyProfileConfig(config);
  assert.equal(existsSync(wrapperFile), false);
  assert.deepEqual(config.APIKEYS.map((apiKey) => apiKey.id), ["general-key"]);
});

test("profile service clears stale Claude Code ToolHub artifacts when no gateway models are available", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "stale-toolhub-no-models";
  const settingsFile = path.join(CONFIGDIR, "profiles", profileId, "claude", "settings.json");
  const toolHubMcpConfigFile = path.join(CONFIGDIR, "profiles", profileId, "claude", "toolhub-mcp.json");
  const staleSettingsFile = path.join(CONFIGDIR, "profiles", "old-claude-code", "claude", "settings.json");
  const staleToolHubMcpConfigFile = path.join(CONFIGDIR, "profiles", "old-claude-code", "claude", "toolhub-mcp.json");
  mkdirSync(path.dirname(settingsFile), { recursive: true });
  mkdirSync(path.dirname(toolHubMcpConfigFile), { recursive: true });
  mkdirSync(path.dirname(staleSettingsFile), { recursive: true });
  writeFileSync(settingsFile, `${JSON.stringify({
    env: {
      CCR_CLAUDE_CODE_MCP_CONFIG: toolHubMcpConfigFile,
      CODEXL_CLAUDE_CODE_MCP_CONFIG: toolHubMcpConfigFile,
      ENABLE_TOOL_SEARCH: "true",
      USER_VALUE: "kept"
    },
    theme: "dark"
  }, null, 2)}\n`);
  writeFileSync(toolHubMcpConfigFile, `${JSON.stringify({
    mcpServers: {
      "ccr-toolhub": {
        args: [path.join(CONFIGDIR, "bin", "toolhub-mcp.js")],
        command: "node",
        env: {
          TOOLHUB_OPENAI_BASE_URL: "https://api.deepseek.com",
          TOOLHUB_OPENAI_MODEL: "deepseek-v4-flash"
        }
      }
    }
  }, null, 2)}\n`);
  writeFileSync(staleSettingsFile, `${JSON.stringify({
    env: {
      CCR_CLAUDE_CODE_MCP_CONFIG: staleToolHubMcpConfigFile,
      ENABLE_TOOL_SEARCH: "true",
      USER_VALUE: "old-kept"
    }
  }, null, 2)}\n`);
  writeFileSync(staleToolHubMcpConfigFile, "{}\n");

  const config = createDefaultAppConfig({
    generatedConfigFile: path.join(CONFIGDIR, "gateway.config.json")
  });
  config.Providers = [];
  config.virtualModelProfiles = [];
  config.profile.profiles = [
    {
      agent: "claude-code",
      enabled: true,
      env: {},
      id: profileId,
      model: "",
      name: "Claude Code",
      scope: "ccr",
      settingsFile,
      smallFastModel: "",
      surface: "auto"
    }
  ];

  const result = await applyProfileConfig(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].ok, false);
  assert.equal(existsSync(toolHubMcpConfigFile), false);
  assert.equal(existsSync(staleToolHubMcpConfigFile), false);
  const settings = JSON.parse(readFileSync(settingsFile, "utf8"));
  assert.deepEqual(settings.env, {
    ENABLE_TOOL_SEARCH: "true",
    USER_VALUE: "kept"
  });
  const staleSettings = JSON.parse(readFileSync(staleSettingsFile, "utf8"));
  assert.deepEqual(staleSettings.env, {
    ENABLE_TOOL_SEARCH: "true",
    USER_VALUE: "old-kept"
  });
});

test("profile service restores managed global Claude settings when only CCR-scoped Claude profiles are active", () => {
  const previousHome = process.env.HOME;
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-profile-home-"));
  process.env.HOME = home;
  try {
    const settingsFile = path.join(home, ".claude", "settings.json");
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    const originalSettings = {
      env: {
        USER_VALUE: "kept"
      },
      theme: "dark"
    };
    writeFileSync(`${settingsFile}.ccr-backup-2026-01-01T00-00-00-000Z`, `${JSON.stringify(originalSettings, null, 2)}\n`);
    writeFileSync(settingsFile, `${JSON.stringify({
      apiKeyHelper: "/tmp/ccr-claude-code-api-key-claude-code",
      env: {
        ANTHROPIC_API_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_MODEL: "Fusion/GLM-5.2V",
        CLAUDE_AGENT_API_BASE_URL: "http://127.0.0.1:3456"
      }
    }, null, 2)}\n`);

    const statuses = restoreInactiveGlobalProfileConfigs([
      {
        agent: "claude-code",
        enabled: true,
        env: { CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1" },
        id: "claude-code-2",
        model: "Fusion/kimisearch",
        name: "Claude Code",
        scope: "ccr",
        settingsFile: "~/.claude/settings.json",
        smallFastModel: "",
        surface: "auto"
      }
    ]);

    const restored = JSON.parse(readFileSync(settingsFile, "utf8"));
    assert.equal(statuses.length, 1);
    assert.equal(statuses[0].client, "claude-code");
    assert.equal(statuses[0].ok, true);
    assert.equal(restored.env.USER_VALUE, "kept");
    assert.equal(restored.env.ANTHROPIC_MODEL, undefined);
    assert.equal(restored.env.CCR_CLAUDE_CODE_MODEL, undefined);
    assert.equal(restored.env.CODEXL_CLAUDE_CODE_MODEL, undefined);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    rmSync(home, { force: true, recursive: true });
  }
});

test("profile service keeps managed global Claude settings when a global Claude profile is active", () => {
  const previousHome = process.env.HOME;
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-profile-home-"));
  process.env.HOME = home;
  try {
    const settingsFile = path.join(home, ".claude", "settings.json");
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    writeFileSync(settingsFile, `${JSON.stringify({
      apiKeyHelper: "/tmp/ccr-claude-code-api-key-claude-code",
      env: {
        ANTHROPIC_API_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_MODEL: "Fusion/GLM-5.2V",
        CLAUDE_AGENT_API_BASE_URL: "http://127.0.0.1:3456"
      }
    }, null, 2)}\n`);

    const statuses = restoreInactiveGlobalProfileConfigs([
      {
        agent: "claude-code",
        enabled: true,
        env: {},
        id: "claude-code",
        model: "Fusion/GLM-5.2V",
        name: "Claude Code",
        scope: "global",
        settingsFile: "~/.claude/settings.json",
        smallFastModel: "",
        surface: "auto"
      }
    ]);

    const current = JSON.parse(readFileSync(settingsFile, "utf8"));
    assert.equal(statuses.length, 0);
    assert.equal(current.env.ANTHROPIC_MODEL, "Fusion/GLM-5.2V");
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    rmSync(home, { force: true, recursive: true });
  }
});

test("profile service restores global agent configs on exit", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-global-profile-exit-"));
  try {
    const claudeFile = path.join(root, "claude", "settings.json");
    const codexFile = path.join(root, "codex", "config.toml");
    const openCodeFile = path.join(root, "opencode", "opencode.jsonc");
    const zcodeFile = path.join(root, "zcode", "cli", "config.json");
    const zcodeRoot = path.dirname(path.dirname(zcodeFile));
    const zcodeV2File = path.join(zcodeRoot, "v2", "config.json");
    const zcodeCacheFile = path.join(zcodeRoot, "v2", "bots-model-cache.v2.json");
    const files = [claudeFile, codexFile, openCodeFile, zcodeFile, zcodeV2File, zcodeCacheFile];
    const originals = new Map(files.map((file, index) => [file, `original-${index}\n`]));
    const latestSnapshots = new Map(files.map((file, index) => [file, `latest-${index}\n`]));

    for (const [file, original] of originals) {
      mkdirSync(path.dirname(file), { recursive: true });
      if (file === zcodeCacheFile) {
        writeFileSync(`${file}.ccr-original-missing`, "");
      } else {
        writeFileSync(`${file}.ccr-original`, original);
      }
      writeFileSync(`${file}.ccr-backup-2026-07-11T00-00-00-000Z`, latestSnapshots.get(file));
    }
    writeFileSync(claudeFile, `${JSON.stringify({
      apiKeyHelper: "ccr-claude-code-api-key-test",
      env: {
        ANTHROPIC_API_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:3456",
        CLAUDE_AGENT_API_BASE_URL: "http://127.0.0.1:3456"
      }
    })}\n`);
    writeFileSync(codexFile, "# BEGIN CCR managed profile\nmodel = \"test\"\n# END CCR managed profile\n");
    writeFileSync(openCodeFile, `${JSON.stringify({
      model: "claude-code-router/test",
      provider: {
        "claude-code-router": {
          options: { headers: { "x-ccr-client": "opencode" } }
        }
      }
    })}\n`);
    for (const file of [zcodeFile, zcodeV2File]) {
      writeFileSync(file, `${JSON.stringify({ provider: { "claude-code-router": {} } })}\n`);
    }
    writeFileSync(zcodeCacheFile, `${JSON.stringify({ providers: [{ id: "claude-code-router" }] })}\n`);

    const statuses = restoreGlobalProfileConfigsOnExit([
      {
        agent: "claude-code", enabled: true, env: {}, id: "claude", model: "test", name: "Claude",
        scope: "global", settingsFile: claudeFile, smallFastModel: "", surface: "cli"
      },
      {
        agent: "codex", configFile: codexFile, enabled: true, env: {}, id: "codex", model: "test", name: "Codex",
        providerId: "claude-code-router", scope: "global", surface: "cli"
      },
      {
        agent: "opencode", configFile: openCodeFile, enabled: true, env: {}, id: "opencode", model: "test", name: "OpenCode",
        providerId: "claude-code-router", scope: "global", surface: "auto"
      },
      {
        agent: "zcode", configFile: zcodeFile, enabled: true, env: {}, id: "zcode", model: "test", name: "ZCode",
        providerId: "claude-code-router", scope: "global", surface: "app"
      }
    ], { manageMarker: false });

    assert.equal(statuses.length, 4);
    assert.equal(statuses.every((status) => status.ok), true);
    for (const [file, latest] of latestSnapshots) {
      assert.equal(readFileSync(file, "utf8"), latest);
    }

    writeFileSync(codexFile, "# BEGIN CCR managed profile\nmodel = \"test\"\n# END CCR managed profile\n");
    writeFileSync(openCodeFile, `${JSON.stringify({
      provider: { "claude-code-router": { options: { headers: { "x-ccr-client": "opencode" } } } }
    })}\n`);
    for (const file of [zcodeFile, zcodeV2File]) {
      writeFileSync(file, `${JSON.stringify({ provider: { "claude-code-router": {} } })}\n`);
    }
    writeFileSync(zcodeCacheFile, `${JSON.stringify({ providers: [{ id: "claude-code-router" }] })}\n`);
    const inactiveStatuses = restoreInactiveGlobalProfileConfigs([
      {
        agent: "codex", configFile: codexFile, enabled: false, env: {}, id: "codex", model: "test", name: "Codex",
        providerId: "claude-code-router", scope: "ccr", surface: "cli"
      },
      {
        agent: "opencode", configFile: openCodeFile, enabled: false, env: {}, id: "opencode", model: "test", name: "OpenCode",
        providerId: "claude-code-router", scope: "global", surface: "auto"
      },
      {
        agent: "zcode", configFile: zcodeFile, enabled: false, env: {}, id: "zcode", model: "test", name: "ZCode",
        providerId: "claude-code-router", scope: "ccr", surface: "app"
      }
    ]);
    assert.equal(inactiveStatuses.filter((status) => status.client === "codex").length, 1);
    assert.equal(inactiveStatuses.filter((status) => status.client === "opencode").length, 1);
    assert.equal(inactiveStatuses.filter((status) => status.client === "zcode").length, 3);
    for (const [file, latest] of latestSnapshots) {
      if (file !== claudeFile) {
        assert.equal(readFileSync(file, "utf8"), latest);
      }
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
