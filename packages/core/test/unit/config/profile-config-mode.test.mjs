import assert from "node:assert/strict";
import test from "node:test";
import { parseProfileConfigs } from "@ccr/core/config/config.ts";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";

test("profile parser preserves valid inherited Claude Code configuration", () => {
  const profiles = parseProfileConfigs([
    {
      agent: "claude-code",
      claudeConfigMode: "inherit",
      enabled: true,
      id: "inherited-cli",
      model: "Provider/model",
      name: "Inherited CLI",
      scope: "ccr",
      settingsFile: "~/.claude/settings.json",
      surface: "cli"
    }
  ]);

  assert.equal(profiles?.length, 1);
  assert.equal(profiles?.[0].claudeConfigMode, "inherit");
});

test("profile parser normalizes Claude Code allowed models", () => {
  const profiles = parseProfileConfigs([
    {
      agent: "claude-code",
      allowedModels: [
        " opus ",
        "FABLE",
        "fable",
        " OpenAI/GPT-5.6-SOL ",
        "openai/gpt-5.6-sol",
        "",
        42
      ],
      enabled: true,
      id: "bounded-models",
      model: "OpenAI/gpt-5.6-sol",
      name: "Bounded Models",
      scope: "ccr",
      settingsFile: "~/.claude/settings.json",
      surface: "cli"
    },
    {
      agent: "codex",
      allowedModels: ["opus"],
      enabled: true,
      id: "unrelated-client",
      model: "gpt-5.6-sol",
      name: "Unrelated Client",
      scope: "ccr",
      surface: "cli"
    },
    {
      agent: "claude-code",
      allowedModels: ["opus"],
      enabled: true,
      id: "global-client",
      model: "opus",
      name: "Global Client",
      scope: "global",
      surface: "cli"
    },
    {
      agent: "claude-code",
      allowedModels: ["opus"],
      enabled: true,
      id: "app-client",
      model: "opus",
      name: "App Client",
      scope: "ccr",
      surface: "app"
    }
  ]);

  assert.deepEqual(profiles?.[0].allowedModels, [
    "opus",
    "FABLE",
    "OpenAI/GPT-5.6-SOL"
  ]);
  assert.equal(profiles?.[1].allowedModels, undefined);
  assert.equal(profiles?.[2].allowedModels, undefined);
  assert.equal(profiles?.[3].allowedModels, undefined);
});

test("default Claude Code profile uses isolated configuration", () => {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/gateway.config.json" });
  const profile = config.profile.profiles.find((item) => item.agent === "claude-code");

  assert.equal(profile?.claudeConfigMode, "isolated");
});

test("profile parser isolates unsupported inherited configuration combinations", () => {
  const base = {
    agent: "claude-code",
    enabled: true,
    model: "Provider/model",
    scope: "ccr",
    settingsFile: "~/.claude/settings.json",
    surface: "cli"
  };
  const profiles = parseProfileConfigs([
    { ...base, claudeConfigMode: "unknown", id: "unknown", name: "Unknown" },
    { ...base, claudeConfigMode: "inherit", id: "global", name: "Global", scope: "global" },
    { ...base, claudeConfigMode: "inherit", id: "auto", name: "Auto", surface: "auto" },
    { ...base, claudeConfigMode: "inherit", id: "app", name: "App", surface: "app" },
    { ...base, agent: "codex", claudeConfigMode: "inherit", id: "other", name: "Other" }
  ]);

  assert.deepEqual(
    profiles?.map((profile) => profile.claudeConfigMode),
    ["isolated", "isolated", "isolated", "isolated", undefined]
  );
});
