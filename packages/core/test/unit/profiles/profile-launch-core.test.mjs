import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  buildProfileLaunchPlan,
  ccrManagedProfileDir,
  defaultProfileOpenSurface,
  findProfileForOpen,
  profileOpenCommand,
  profileOpenSurfaces,
  resolveClaudeCodeSettingsFile,
  resolveCodexConfigFile,
  resolveOpenCodeConfigFile,
  resolveProfileOpenSurface,
  shouldAutoStartProfileGateway
} from "@ccr/core/profiles/launch-core.ts";

const claudeProfile = {
  agent: "claude-code",
  enabled: true,
  id: "claude-main",
  model: "provider,model",
  name: "Claude Main",
  scope: "ccr",
  smallFastModel: "provider,small",
  surface: "auto"
};

const codexProfile = {
  agent: "codex",
  enabled: true,
  id: "codex-main",
  model: "provider,model",
  name: "Codex Main",
  providerId: "openai-codex",
  scope: "ccr",
  surface: "auto"
};

const grokProfile = {
  agent: "grok",
  enabled: true,
  id: "grok-main",
  model: "provider,model",
  name: "Grok Main",
  scope: "ccr",
  surface: "cli"
};

const kimiProfile = {
  agent: "kimi",
  enabled: true,
  id: "kimi-main",
  model: "provider,model",
  name: "Kimi Main",
  scope: "ccr",
  surface: "cli"
};

const openCodeProfile = {
  agent: "opencode",
  enabled: true,
  id: "opencode-main",
  model: "provider,model",
  name: "OpenCode Main",
  providerId: "claude-code-router",
  scope: "ccr",
  surface: "auto"
};

test("findProfileForOpen resolves enabled profiles and reports ambiguous names", () => {
  const config = {
    profile: {
      profiles: [
        claudeProfile,
        { ...claudeProfile, enabled: false, id: "disabled", name: "Disabled" },
        { ...codexProfile, id: "duplicate-a", name: "Duplicate Name" },
        { ...codexProfile, id: "duplicate-b", name: "duplicate name" }
      ]
    }
  };

  assert.equal(findProfileForOpen(config, "claude-main").id, "claude-main");
  assert.equal(findProfileForOpen(config, "claude main").id, "claude-main");
  assert.throws(() => findProfileForOpen(config, "duplicate name"), /ambiguous/);
  assert.throws(() => findProfileForOpen(config, "Disabled"), /not found or is disabled/);
});

test("profile open surfaces enforce agent capabilities", () => {
  assert.deepEqual(profileOpenSurfaces(claudeProfile), ["cli", "app"]);
  assert.deepEqual(profileOpenSurfaces({ ...claudeProfile, surface: "cli" }), ["cli"]);
  assert.deepEqual(profileOpenSurfaces({ ...codexProfile, agent: "zcode" }), ["app"]);
  assert.deepEqual(profileOpenSurfaces(grokProfile), ["cli"]);
  assert.deepEqual(profileOpenSurfaces(kimiProfile), ["cli"]);
  assert.deepEqual(profileOpenSurfaces(openCodeProfile), ["cli", "app"]);
  assert.equal(resolveProfileOpenSurface(codexProfile, "app"), "app");
  assert.throws(() => resolveProfileOpenSurface({ ...claudeProfile, surface: "cli" }, "app"), /does not support APP/);
  assert.throws(() => resolveProfileOpenSurface(grokProfile, "app"), /does not support APP/);
  assert.throws(() => resolveProfileOpenSurface(kimiProfile, "app"), /does not support APP/);
});

test("default profile command surface is CLI unless the agent is app-only", () => {
  assert.equal(defaultProfileOpenSurface(claudeProfile), "cli");
  assert.equal(defaultProfileOpenSurface(codexProfile), "cli");
  assert.equal(defaultProfileOpenSurface({ ...codexProfile, surface: "app" }), "cli");
  assert.equal(defaultProfileOpenSurface({ ...codexProfile, agent: "zcode" }), "app");
});

test("Grok and Kimi CLI start a temporary CCR gateway when none is already running", () => {
  assert.equal(shouldAutoStartProfileGateway(grokProfile, "cli"), true);
  assert.equal(shouldAutoStartProfileGateway(kimiProfile, "cli"), true);
  assert.equal(shouldAutoStartProfileGateway(codexProfile, "cli"), false);
  assert.equal(shouldAutoStartProfileGateway(claudeProfile, "app"), false);
});

test("buildProfileLaunchPlan creates CCR-managed launcher paths", () => {
  const configDir = path.join(path.sep, "tmp", "ccr-config");
  const codexPlan = buildProfileLaunchPlan(configDir, codexProfile, "app");
  const claudePlan = buildProfileLaunchPlan(configDir, claudeProfile, "cli", ["--debug"]);
  const grokPlan = buildProfileLaunchPlan(configDir, grokProfile, "cli", ["--debug"]);
  const kimiPlan = buildProfileLaunchPlan(configDir, kimiProfile, "cli", ["--debug"]);
  const openCodePlan = buildProfileLaunchPlan(configDir, openCodeProfile, "cli", ["--debug"]);

  assert.equal(codexPlan.surface, "app");
  assert.deepEqual(codexPlan.args, ["app"]);
  assert.equal(path.basename(codexPlan.command), process.platform === "win32" ? "ccr-codex-cli-stdio-codex-main.cmd" : "ccr-codex-cli-stdio-codex-main");
  assert.equal(codexPlan.env.CCR_PROFILE_SURFACE, "app");

  assert.equal(claudePlan.surface, "cli");
  assert.deepEqual(claudePlan.args, ["--debug"]);
  assert.equal(path.basename(claudePlan.command), process.platform === "win32" ? "ccr-claude-code-wrapper-claude-main.cmd" : "ccr-claude-code-wrapper-claude-main");
  assert.equal(claudePlan.env.CCR_PROFILE_SURFACE, "cli");
  assert.match(claudePlan.env.CLAUDE_CONFIG_DIR, /claude$/);
  assert.equal(claudePlan.env.ANTHROPIC_MODEL, "provider/model");
  assert.equal(claudePlan.env.CCR_CLAUDE_CODE_MODEL, "provider/model");
  assert.equal(claudePlan.env.CODEXL_CLAUDE_CODE_MODEL, "provider/model");
  assert.equal(claudePlan.env.ANTHROPIC_SMALL_FAST_MODEL, "provider/small");

  assert.equal(grokPlan.surface, "cli");
  assert.deepEqual(grokPlan.args, ["--debug"]);
  assert.equal(path.basename(grokPlan.command), process.platform === "win32" ? "ccr-grok-cli-wrapper-grok-main.cmd" : "ccr-grok-cli-wrapper-grok-main");
  assert.equal(grokPlan.env.CCR_PROFILE_SURFACE, "cli");

  assert.equal(kimiPlan.surface, "cli");
  assert.deepEqual(kimiPlan.args, ["--debug"]);
  assert.equal(path.basename(kimiPlan.command), process.platform === "win32" ? "ccr-kimi-cli-wrapper-kimi-main.cmd" : "ccr-kimi-cli-wrapper-kimi-main");
  assert.equal(kimiPlan.env.CCR_PROFILE_SURFACE, "cli");

  assert.equal(openCodePlan.surface, "cli");
  assert.deepEqual(openCodePlan.args, ["--debug"]);
  assert.equal(path.basename(openCodePlan.command), process.platform === "win32" ? "ccr-opencode-wrapper-opencode-main.cmd" : "ccr-opencode-wrapper-opencode-main");
  assert.match(openCodePlan.env.OPENCODE_CONFIG, /opencode[\\/]opencode\.jsonc$/);
  assert.throws(() => buildProfileLaunchPlan(configDir, openCodeProfile, "app"), /OpenCode App profiles/);

  assert.throws(() => buildProfileLaunchPlan(configDir, claudeProfile, "app"), /Claude App opening/);
});

test("inherited Claude Code profile launches from the existing config directory", () => {
  const configDir = path.join(path.sep, "tmp", "ccr-config");
  const settingsFile = path.join(path.sep, "home", "user", ".claude", "settings.json");
  const plan = buildProfileLaunchPlan(
    configDir,
    {
      ...claudeProfile,
      claudeConfigMode: "inherit",
      settingsFile,
      surface: "cli"
    },
    "cli",
    ["--debug"]
  );

  assert.equal(plan.env.CLAUDE_CONFIG_DIR, path.dirname(settingsFile));
  assert.deepEqual(plan.args, ["--debug"]);
});

test("profile config paths honor CCR, custom, and global scopes", () => {
  const configDir = path.join(path.sep, "tmp", "ccr-config");
  const customProfile = { ...codexProfile, id: "Custom Profile", scope: "custom" };
  const globalCodex = { ...codexProfile, codexHome: "~/codex-home", scope: "global" };

  assert.equal(
    ccrManagedProfileDir(configDir, customProfile),
    path.join(configDir, "profiles", "custom-profile", "custom")
  );
  assert.equal(
    resolveClaudeCodeSettingsFile(configDir, claudeProfile),
    path.join(configDir, "profiles", "claude-main", "claude", "settings.json")
  );
  assert.equal(
    resolveCodexConfigFile(configDir, customProfile),
    path.join(configDir, "profiles", "custom-profile", "custom", "codex", "config.toml")
  );
  assert.equal(resolveCodexConfigFile(configDir, globalCodex), path.join(process.env.HOME, "codex-home", "config.toml"));
  assert.equal(
    resolveOpenCodeConfigFile(configDir, openCodeProfile),
    path.join(configDir, "profiles", "opencode-main", "opencode", "opencode.jsonc")
  );
});

test("profileOpenCommand quotes profile references for shell usage", () => {
  const cliCommand = profileOpenCommand(claudeProfile, "cli", "ccr", "Claude Main");
  const appCommand = profileOpenCommand(codexProfile, "app", "ccr", "Codex Main");

  assert.match(cliCommand, /Claude/);
  assert.match(cliCommand, /Main/);
  assert.equal(cliCommand.endsWith(" cli"), false);
  assert.match(appCommand, / app$/);
});
