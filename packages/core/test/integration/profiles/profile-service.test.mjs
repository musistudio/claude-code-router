import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { CONFIGDIR } from "@ccr/core/config/constants.ts";
import { applyProfileConfig, cleanupGeneratedBinBackups, resolveGrokSourceHome, resolveKimiSourceHome, restoreInactiveGlobalProfileConfigs, restoreGlobalProfileConfigsOnExit } from "@ccr/core/profiles/service.ts";

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

test("Kimi profile source home follows profile and process environment overrides", () => {
  const previous = process.env.KIMI_CODE_HOME;
  try {
    process.env.KIMI_CODE_HOME = "/tmp/process-kimi-home";
    assert.equal(resolveKimiSourceHome({ env: {} }), path.resolve("/tmp/process-kimi-home"));
    assert.equal(resolveKimiSourceHome({ env: { KIMI_CODE_HOME: "/tmp/profile-kimi-home" } }), path.resolve("/tmp/profile-kimi-home"));
    assert.equal(resolveKimiSourceHome({ env: { CCR_KIMI_SOURCE_HOME: "/tmp/profile-kimi-source" } }), path.resolve("/tmp/profile-kimi-source"));
  } finally {
    if (previous === undefined) {
      delete process.env.KIMI_CODE_HOME;
    } else {
      process.env.KIMI_CODE_HOME = previous;
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
  config.contextArchive = {
    ...config.contextArchive,
    enabled: true
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
      fableModel: "Provider/fable",
      haikuModel: "Provider/haiku",
      id: profileId,
      model: "Provider/model",
      name: "Generated Bin Test",
      opusModel: "Provider/opus",
      scope: "ccr",
      settingsFile: "~/.claude/settings.json",
      sonnetModel: "Provider/sonnet",
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
  const contextArchiveMcpServer = toolHubMcpConfig.mcpServers["ccr-context-archive"];
  assert.equal(toolHubMcpServerEnv.TOOLHUB_OPENAI_API_KEY, "ccr-profile-test");
  assert.equal(toolHubMcpServerEnv.TOOLHUB_OPENAI_BASE_URL, `http://127.0.0.1:${config.gateway.port}/v1`);
  assert.equal(toolHubMcpServerEnv.TOOLHUB_OPENAI_MODEL, "Provider/model");
  assert.equal(contextArchiveMcpServer, undefined);
  const settingsFile = path.join(CONFIGDIR, "profiles", profileId, "claude", "settings.json");
  const settings = JSON.parse(readFileSync(settingsFile, "utf8"));
  assert.equal(settings.env.ANTHROPIC_MODEL, "Provider/model");
  assert.equal(settings.env.ANTHROPIC_DEFAULT_FABLE_MODEL, "Provider/fable");
  assert.equal(settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL, "Provider/opus");
  assert.equal(settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL, "Provider/sonnet");
  assert.equal(settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL, "Provider/haiku");
  assert.equal(settings.env.ANTHROPIC_SMALL_FAST_MODEL, undefined);
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

test("Codex profile launcher bypasses middleware for Browser and Computer Use helpers", { skip: process.platform === "win32" || !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-browser-helper-bypass-"));
  const profileId = "browser-helper-bypass-test";
  try {
    const fakeCodex = path.join(root, "real-codex");
    writeFileSync(fakeCodex, [
      "#!/bin/sh",
      "printf '%s|%s|%s|cli_path=%s\\n' \"$1\" \"$2\" \"$3\" \"${CODEX_CLI_PATH:-}\"",
      ""
    ].join("\n"));
    chmodSync(fakeCodex, 0o700);

    const config = createDefaultAppConfig({
      generatedConfigFile: path.join(CONFIGDIR, "gateway.config.json")
    });
    config.APIKEY = "ccr-browser-helper-test";
    config.APIKEYS = [{
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: config.APIKEY,
      name: "Profile: Browser Helper Bypass"
    }];
    config.Providers = [{
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }];
    config.profile.profiles = [{
      agent: "codex",
      cliMiddleware: true,
      codexCliPath: fakeCodex,
      codexHome: "",
      configFile: "",
      configFormat: "separate_profile_files",
      enabled: true,
      env: {},
      id: profileId,
      model: "Provider/model",
      name: "Browser Helper Bypass",
      providerId: "claude-code-router",
      providerName: "Claude Code Router",
      scope: "ccr",
      showAllSessions: false,
      surface: "app"
    }];

    const applied = await applyProfileConfig(config);
    assert.equal(applied.clients[0].ok, true);
    const launcher = path.join(CONFIGDIR, "bin", `ccr-codex-cli-stdio-${profileId}`);
    const content = readFileSync(launcher, "utf8");
    assert.ok(content.includes("CCR_BUNDLED_CODEX_CLI_PATH"));
    assert.ok(content.includes("app-server' ] && [ \"${2:-}\" = '--listen'"));

    const result = spawnSync(launcher, ["app-server", "--listen", "stdio://"], {
      encoding: "utf8",
      env: {
        ...process.env,
        CCR_BUNDLED_CODEX_CLI_PATH: "",
        CCR_REAL_CODEX_CLI_PATH: "",
        CODEXL_BUNDLED_CODEX_CLI_PATH: "",
        CODEXL_REAL_CODEX_CLI_PATH: "",
        CODEX_CLI_PATH: launcher
      }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "app-server|--listen|stdio://|cli_path=\n");

    const sandboxResult = spawnSync(launcher, ["sandbox"], {
      encoding: "utf8",
      env: {
        ...process.env,
        CCR_BUNDLED_CODEX_CLI_PATH: "",
        CCR_REAL_CODEX_CLI_PATH: "",
        CODEXL_BUNDLED_CODEX_CLI_PATH: "",
        CODEXL_REAL_CODEX_CLI_PATH: "",
        CODEX_CLI_PATH: launcher
      }
    });
    assert.equal(sandboxResult.status, 0, sandboxResult.stderr);
    assert.equal(sandboxResult.stdout, "sandbox|||cli_path=\n");
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
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
  assert.match(content, /# CCR configured model = "Provider\/model"/);
  assert.match(content, /\[mcp_servers\.ccr-toolhub\]/);
  assert.equal(content.includes(`command = ${JSON.stringify(process.execPath)}`), true);
  assert.equal(content.includes(`args = [${JSON.stringify(path.join(CONFIGDIR, "bin", "toolhub-mcp.js"))}]`), true);
  assert.match(content, /\[mcp_servers\.ccr-toolhub\.env\]/);
  assert.match(content, /TOOLHUB_OPENAI_API_KEY = "ccr-codex-profile-test"/);
  assert.match(content, new RegExp(`TOOLHUB_OPENAI_BASE_URL = "http://127\\.0\\.0\\.1:${config.gateway.port}/v1"`));
  assert.match(content, /TOOLHUB_OPENAI_MODEL = "Provider\/model"/);

  const separateProfileFile = path.join(path.dirname(configFile), "claude-code-router.config.toml");
  const initialSeparateProfile = readFileSync(separateProfileFile, "utf8");
  assert.equal(initialSeparateProfile.includes("model_reasoning_effort"), false);

  const codexEditedConfig = content
    .replace(
      'model = "Provider/model"',
      'model = "User/selected-in-codex"\nmodel_reasoning_effort = "max"'
    )
    .replace(
      "# END CCR managed ToolHub MCP",
      [
        "[desktop]",
        'followUpQueueMode = "steer"',
        "",
        '[plugins."browser@openai-bundled"]',
        "enabled = false",
        "",
        "[features]",
        "js_repl = true",
        "# END CCR managed ToolHub MCP"
      ].join("\n")
    );
  writeFileSync(configFile, codexEditedConfig);
  writeFileSync(
    separateProfileFile,
    initialSeparateProfile
      .replace('model = "Provider/model"', 'model = "User/selected-in-cli"')
      .replace(/\s*$/, '\nmodel_reasoning_effort = "ultra"\n')
  );

  await applyProfileConfig(config);

  const preservedConfig = readFileSync(configFile, "utf8");
  assert.match(preservedConfig, /model = "User\/selected-in-codex"/);
  assert.match(preservedConfig, /model_reasoning_effort = "max"/);
  assert.match(preservedConfig, /\[desktop\]\nfollowUpQueueMode = "steer"/);
  assert.match(preservedConfig, /\[plugins\."browser@openai-bundled"\]\nenabled = false/);
  assert.match(preservedConfig, /\[features\]\njs_repl = true/);
  assert.equal((preservedConfig.match(/\[mcp_servers\.ccr-toolhub\]/g) ?? []).length, 1);
  assert.equal((preservedConfig.match(/# BEGIN CCR managed ToolHub MCP/g) ?? []).length, 1);

  const preservedSeparateProfile = readFileSync(separateProfileFile, "utf8");
  assert.match(preservedSeparateProfile, /model = "User\/selected-in-cli"/);
  assert.match(preservedSeparateProfile, /model_reasoning_effort = "ultra"/);

  config.Providers[0].models.push("model-2");
  config.profile.profiles[0].model = "Provider/model-2";
  await applyProfileConfig(config);

  const explicitlyUpdatedConfig = readFileSync(configFile, "utf8");
  assert.match(explicitlyUpdatedConfig, /model = "Provider\/model-2"/);
  assert.match(explicitlyUpdatedConfig, /model_reasoning_effort = "max"/);
  assert.match(explicitlyUpdatedConfig, /\[desktop\]\nfollowUpQueueMode = "steer"/);
  const explicitlyUpdatedSeparateProfile = readFileSync(separateProfileFile, "utf8");
  assert.match(explicitlyUpdatedSeparateProfile, /model = "Provider\/model-2"/);
  assert.match(explicitlyUpdatedSeparateProfile, /model_reasoning_effort = "ultra"/);
});

test("profile service injects Context Archive MCP for managed Claude Code profile", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "managed-compact-claude";
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
  config.contextArchive = {
    ...config.contextArchive,
    enabled: false
  };
  config.APIKEY = "ccr-managed-claude-profile-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "ccr-managed-claude-profile-test",
      name: "Profile: Managed Compact Claude"
    }
  ];
  config.profile.profiles = [
    {
      agent: "claude-code",
      enabled: true,
      env: {},
      id: profileId,
      managedCompact: true,
      model: "Provider/model",
      name: "Managed Compact Claude",
      scope: "ccr",
      settingsFile: "~/.claude/settings.json",
      smallFastModel: "",
      surface: "auto"
    }
  ];

  const result = await applyProfileConfig(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].ok, true);
  const mcpConfigFile = path.join(CONFIGDIR, "profiles", profileId, "claude", "toolhub-mcp.json");
  const mcpConfig = JSON.parse(readFileSync(mcpConfigFile, "utf8"));
  assert.deepEqual(Object.keys(mcpConfig.mcpServers), ["ccr-context-archive"]);
  assert.equal(mcpConfig.mcpServers["ccr-context-archive"].type, "http");
  assert.equal(mcpConfig.mcpServers["ccr-context-archive"].url, `http://127.0.0.1:${config.gateway.port}/__ccr/context-archive/mcp`);
  assert.equal(mcpConfig.mcpServers["ccr-context-archive"].headers.Authorization, "Bearer ccr-managed-claude-profile-test");
});

test("profile service injects Context Archive MCP for managed Codex profile", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "managed-compact-codex";
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
  config.contextArchive = {
    ...config.contextArchive,
    enabled: false
  };
  config.APIKEY = "ccr-managed-codex-profile-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "ccr-managed-codex-profile-test",
      name: "Profile: Managed Compact Codex"
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
      managedCompact: true,
      model: "Provider/model",
      name: "Managed Compact Codex",
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
  assert.doesNotMatch(content, /# BEGIN CCR managed ToolHub MCP/);
  assert.match(content, /# BEGIN CCR managed Context Archive MCP/);
  assert.match(content, /\[mcp_servers\.ccr-context-archive\]/);
  assert.match(content, new RegExp(`url = "http://127\\.0\\.0\\.1:${config.gateway.port}/__ccr/context-archive/mcp"`));
  assert.match(content, /http_headers = \{ Authorization = "Bearer ccr-managed-codex-profile-test" \}/);
  assert.match(content, /startup_timeout_sec = 10/);
  assert.match(content, /tool_timeout_sec = 60/);
});

test("profile service injects Context Archive MCP for managed Claude Code without ToolHub", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "context-archive-mcp-only";
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
  config.contextArchive = {
    ...config.contextArchive,
    enabled: true
  };
  config.APIKEY = "ccr-context-archive-profile-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "ccr-context-archive-profile-test",
      name: "Profile: Context Archive MCP Test"
    }
  ];
  config.profile.profiles = [
    {
      agent: "claude-code",
      enabled: true,
      env: {},
      id: profileId,
      managedCompact: true,
      model: "Provider/model",
      name: "Context Archive MCP Test",
      scope: "ccr",
      settingsFile: "~/.claude/settings.json",
      smallFastModel: "",
      surface: "auto"
    }
  ];

  const result = await applyProfileConfig(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].ok, true);
  const mcpConfigFile = path.join(CONFIGDIR, "profiles", profileId, "claude", "toolhub-mcp.json");
  const mcpConfig = JSON.parse(readFileSync(mcpConfigFile, "utf8"));
  assert.deepEqual(Object.keys(mcpConfig.mcpServers), ["ccr-context-archive"]);
  assert.equal(mcpConfig.mcpServers["ccr-context-archive"].type, "http");
  assert.equal(mcpConfig.mcpServers["ccr-context-archive"].headers.Authorization, "Bearer ccr-context-archive-profile-test");
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

test("profile service writes a multi-model Kimi CLI home that points inference to CCR", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "kimi-gateway-test";
  const sourceKimiHome = path.join(process.env.CCR_INTERNAL_HOME_DIR, ".kimi-code");
  const sourceKimiConfig = path.join(sourceKimiHome, "config.toml");
  mkdirSync(path.join(sourceKimiHome, "sessions"), { recursive: true });
  mkdirSync(path.join(sourceKimiHome, "skills"), { recursive: true });
  writeFileSync(sourceKimiConfig, [
    'default_model = "original/model"',
    "telemetry = false",
    "",
    '[providers."original"]',
    'type = "openai"',
    'api_key = "original-key"',
    "",
    '[models."original/model"]',
    'provider = "original"',
    'model = "model"',
    "max_context_size = 8192",
    "",
    "[thinking]",
    "enabled = false",
    ""
  ].join("\n"));
  const config = createDefaultAppConfig({
    generatedConfigFile: path.join(CONFIGDIR, "gateway.config.json")
  });
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      modelDisplayNames: { fast: "Fast Model" },
      modelMetadata: {
        fast: {
          capabilities: { imageInput: true },
          defaultReasoningLevel: "high",
          supportedReasoningLevels: [
            { description: "Fast", effort: "low" },
            { description: "Thorough", effort: "high" }
          ]
        },
        model: { maxContextWindow: 200000 }
      },
      models: ["model", "fast", "gpt-5.6-sol", "gpt-5.5-pro", "legacy-extra"],
      name: "Provider"
    },
    {
      api_base_url: "https://generativelanguage.googleapis.com",
      api_key: "gemini-key",
      models: ["gemini-2.5-pro"],
      name: "Custom Gemini"
    },
    {
      api_base_url: "https://api.deepseek.com",
      api_key: "deepseek-key",
      models: ["deepseek-v4-flash"],
      name: "DeepSeek"
    },
    {
      api_base_url: "https://open.bigmodel.cn/api/coding/paas/v4",
      api_key: "zhipu-key",
      models: ["glm-5.2"],
      name: "Zhipu Coding"
    }
  ];
  config.preferredProvider = "Provider";
  config.virtualModelProfiles = [{
    baseModel: { fixedModel: "Provider/gpt-5.6-sol", mode: "fixed" },
    enabled: true,
    match: { exactAliases: ["catalog-context"], prefixes: [], suffixes: [] },
    materialization: { enabled: true, includeInGatewayModels: true }
  }];
  config.APIKEY = "ccr-kimi-profile-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "ccr-kimi-profile-test",
      name: "Profile: Kimi Gateway Test"
    }
  ];
  config.profile.profiles = [
    {
      agent: "kimi",
      availableModels: ["Provider/model", "Provider/fast"],
      enabled: true,
      env: {
        CCR_KIMI_BIN: "/custom/bin/kimi",
        KIMI_MODEL_BASE_URL: "https://ignored.example/v1",
        USER_VALUE: "kept"
      },
      id: profileId,
      model: "Provider/model",
      name: "Kimi Gateway Test",
      scope: "ccr",
      surface: "cli"
    }
  ];

  const result = await applyProfileConfig(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].client, "kimi");
  assert.equal(result.clients[0].ok, true);

  const commandExtension = process.platform === "win32" ? ".cmd" : "";
  const wrapperFile = path.join(CONFIGDIR, "bin", `ccr-kimi-cli-wrapper-${profileId}${commandExtension}`);
  const content = readFileSync(wrapperFile, "utf8");
  const profileKimiHome = path.join(CONFIGDIR, "profiles", profileId, "kimi");
  const profileConfigContent = readFileSync(path.join(profileKimiHome, "config.toml"), "utf8");
  assert.match(content, new RegExp(`KIMI_CODE_HOME.*profiles.*${profileId}.*kimi`));
  assert.match(content, /KIMI_MODEL_NAME/);
  assert.match(content, /USER_VALUE.*kept/);
  assert.match(content, /NO_PROXY.*127\.0\.0\.1,localhost,::1/);
  assert.match(content, /\/custom\/bin\/kimi/);
  assert.equal(content.includes("https://ignored.example/v1"), false);
  assert.match(profileConfigContent, /default_model = "Provider\/model"/);
  assert.match(profileConfigContent, /\[providers\."claude-code-router"\]/);
  assert.match(profileConfigContent, new RegExp(`base_url = "http://127\\.0\\.0\\.1:${config.gateway.port}/v1"`));
  assert.match(profileConfigContent, /api_key = "ccr-kimi-profile-test"/);
  assert.match(profileConfigContent, /\[models\."Provider\/model"\]/);
  assert.match(profileConfigContent, /\[models\."Provider\/fast"\]/);
  assert.equal(profileConfigContent.includes('[models."Provider/legacy-extra"]'), false);
  assert.match(profileConfigContent, /max_context_size = 200000/);
  assert.match(profileConfigContent, /\[models\."Provider\/model"\][\s\S]*?capabilities = \["tool_use"\]/);
  assert.match(profileConfigContent, /\[models\."Provider\/fast"\][\s\S]*?capabilities = \["tool_use", "image_in", "thinking"\]\nsupport_efforts = \["low", "high"\]\ndefault_effort = "high"/);
  assert.match(profileConfigContent, /display_name = "Provider \/ Fast Model"/);
  assert.match(profileConfigContent, /telemetry = false/);
  assert.match(profileConfigContent, /\[thinking\]/);
  assert.equal(profileConfigContent.includes("original-key"), false);
  assert.equal(readFileSync(sourceKimiConfig, "utf8").includes("original-key"), true);
  assert.equal(existsSync(path.join(profileKimiHome, "sessions")), true);
  assert.equal(existsSync(path.join(profileKimiHome, "skills")), true);

  delete config.profile.profiles[0].availableModels;
  config.profile.profiles[0].model = "";
  const legacyResult = await applyProfileConfig(config);
  assert.equal(legacyResult.clients[0].ok, true);
  const legacyProfileConfigContent = readFileSync(path.join(profileKimiHome, "config.toml"), "utf8");
  assert.match(legacyProfileConfigContent, /default_model = "Provider\/model"/);
  assert.match(legacyProfileConfigContent, /\[models\."Provider\/model"\]/);
  assert.match(legacyProfileConfigContent, /\[models\."Provider\/fast"\]/);
  assert.match(legacyProfileConfigContent, /\[models\."Provider\/gpt-5\.6-sol"\]\nprovider = "claude-code-router"\nmodel = "Provider\/gpt-5\.6-sol"\nmax_context_size = 1050000\ncapabilities = \["tool_use", "image_in", "thinking"\]/);
  assert.match(legacyProfileConfigContent, /\[models\."Provider\/gpt-5\.5-pro"\][\s\S]*?capabilities = \["tool_use", "image_in", "always_thinking"\]/);
  assert.match(legacyProfileConfigContent, /\[models\."Provider\/legacy-extra"\]/);
  assert.match(legacyProfileConfigContent, /\[models\."Custom Gemini\/gemini-2\.5-pro"\]\nprovider = "claude-code-router"\nmodel = "Custom Gemini\/gemini-2\.5-pro"\nmax_context_size = 1065535/);
  assert.match(legacyProfileConfigContent, /\[models\."DeepSeek\/deepseek-v4-flash"\]\nprovider = "claude-code-router"\nmodel = "DeepSeek\/deepseek-v4-flash"\nmax_context_size = 1050000\ncapabilities = \["tool_use", "thinking"\]/);
  assert.match(legacyProfileConfigContent, /\[models\."Zhipu Coding\/glm-5\.2"\]\nprovider = "claude-code-router"\nmodel = "Zhipu Coding\/glm-5\.2"\nmax_context_size = 1049000\ncapabilities = \["tool_use", "thinking"\]/);
  assert.match(legacyProfileConfigContent, /\[models\."Fusion\/catalog-context"\]\nprovider = "claude-code-router"\nmodel = "Fusion\/catalog-context"\nmax_context_size = 1050000\ncapabilities = \["tool_use", "image_in", "thinking"\]/);
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
