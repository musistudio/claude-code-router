import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { compileCoreGatewayConfig } from "@ccr/core/gateway/core-runtime/config-compiler.ts";
import {
  createGatewayPlugin,
  isLocalAgentOauthProviderPlugin
} from "@ccr/core/gateway/core-runtime/local-agent-auth-provider-hook.ts";
import { virtualApplyPatchToolName } from "@ccr/core/gateway/internal/shared.ts";

test("Grok local agent auth hook refreshes live login state before authenticating upstream requests", async (t) => {
  await withGrokHome(t, async (grokHome) => {
    writeGrokAuth(grokHome, {
      expires_at: "2000-01-01T00:00:00Z",
      key: "expired-grok-access-token",
      oidc_client_id: "grok-client-id",
      oidc_issuer: "https://auth.x.ai",
      refresh_token: "grok-refresh-token"
    });

    const previousFetch = globalThis.fetch;
    const previousTokenEndpoint = process.env.GROK_OIDC_TOKEN_ENDPOINT;
    process.env.GROK_OIDC_TOKEN_ENDPOINT = "http://127.0.0.1/grok/oauth/token";
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), "http://127.0.0.1/grok/oauth/token");
      assert.equal(String(init?.body ?? ""), "client_id=grok-client-id&grant_type=refresh_token&refresh_token=grok-refresh-token");
      return new Response(JSON.stringify({
        access_token: "refreshed-grok-access-token",
        expires_in: 3600,
        refresh_token: "refreshed-grok-refresh-token"
      }), { headers: { "content-type": "application/json" }, status: 200 });
    };
    t.after(() => {
      globalThis.fetch = previousFetch;
      restoreEnv("GROK_OIDC_TOKEN_ENDPOINT", previousTokenEndpoint);
    });

    const [hook] = createGatewayPlugin({
      config: {
        providerPlugins: [grokOauthProviderPlugin()]
      }
    }).providerHooks;
    assert.equal(hook.key, "config:ccr-local-agent-grok-cli-api-grok-cli-oauth");

    const patch = "*** Begin Patch\n*** Add File: grok.txt\n+hi\n*** End Patch\n";
    const upstreamRequest = {
      body: {
        external_web_access: true,
        input: [
          { type: "custom_tool_call", call_id: "call_patch", name: "apply_patch", input: patch },
          { type: "custom_tool_call_output", call_id: "call_patch", output: "Success" }
        ],
        model: "wrong-model",
        parallel_tool_calls: true,
        tool_choice: "auto",
        tools: [
          { type: "function", name: "exec_command" },
          { type: "custom", name: "apply_patch", format: { type: "grammar", syntax: "lark", definition: "start: begin_patch" } },
          { type: "namespace", name: "multi_agent_v1" },
          { type: "web_search" }
        ]
      },
      headers: {
        "content-type": "application/json",
        "x-api-key": "client-key"
      },
      method: "POST",
      url: "https://cli-chat-proxy.grok.com/v1/responses"
    };
    const authResult = await hook.authenticate({
      model: "grok-4.5",
      upstreamRequest
    });

    assert.equal(authResult.ok, true);
    assert.equal(authResult.value.headers.authorization, "Bearer refreshed-grok-access-token");
    assert.equal(authResult.value.headers["x-api-key"], undefined);
    assert.equal(upstreamRequest.headers["x-api-key"], "client-key");

    const requestResult = await hook.transformRequest({
      model: "grok-4.5",
      upstreamRequest: authResult.value
    });
    assert.equal(requestResult.ok, true);
    assert.equal(requestResult.value.headers["x-grok-client-identifier"], "xai-grok-cli");
    assert.equal(requestResult.value.headers["x-grok-client-version"], "0.2.93");
    assert.equal(requestResult.value.headers["x-grok-model-override"], "grok-4.5");
    assert.equal(requestResult.value.body.external_web_access, undefined);
    assert.deepEqual(requestResult.value.body.tools.map((tool) => tool.type), ["function", "function"]);
    assert.equal(requestResult.value.body.tools[1].name, virtualApplyPatchToolName);
    assert.equal(requestResult.value.body.tools.some((tool) => tool.type === "custom" || tool.type === "namespace"), false);
    assert.equal(requestResult.value.body.tool_choice, "auto");
    assert.equal(requestResult.value.body.parallel_tool_calls, true);
    assert.match(requestResult.value.body.instructions, /When modifying files, call virtual_apply_patch/);
    assert.equal(requestResult.value.body.input[0].type, "function_call");
    assert.equal(requestResult.value.body.input[0].name, virtualApplyPatchToolName);
    assert.deepEqual(JSON.parse(requestResult.value.body.input[0].arguments), { patch });
    assert.equal(requestResult.value.body.input[1].type, "function_call_output");

    const persisted = JSON.parse(readFileSync(path.join(grokHome, "auth.json"), "utf8"));
    assert.equal(persisted["https://auth.x.ai::test-account"].key, "refreshed-grok-access-token");
  });
});

// Regression for musistudio/claude-code-router#1628: the imported plugin's
// auth.headers carry a token snapshot from import time, but the hook must
// resolve the current on-disk token on every call so a rotation picked up by
// the interactive Claude Code CLI is honored without a gateway restart.
test("Claude Code local agent auth hook re-reads the on-disk access token on every request", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async (home) => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityFailure(async () => {
        writeClaudeCredentials(home, {
          accessToken: "stale-imported-access-token",
          refreshToken: "stale-refresh-token"
        });

        const [hook] = createGatewayPlugin({
          config: {
            providerPlugins: [claudeCodeOauthProviderPlugin()]
          }
        }).providerHooks;
        assert.equal(hook.key, "config:ccr-local-agent-claude-code-api-claude-code-oauth");

        const upstreamRequest = {
          headers: {
            "content-type": "application/json",
            "x-api-key": "client-key"
          },
          method: "POST",
          url: "https://api.anthropic.com/v1/messages"
        };

        const staleAuth = await hook.authenticate({ upstreamRequest });
        assert.equal(staleAuth.ok, true);
        assert.equal(staleAuth.value.headers.authorization, "Bearer stale-imported-access-token");
        assert.equal(staleAuth.value.headers["x-api-key"], undefined);
        assert.equal(upstreamRequest.headers["x-api-key"], "client-key");

        // Simulate the interactive Claude Code CLI rotating the shared token
        // family on disk -- no gateway restart, no re-import.
        writeClaudeCredentials(home, {
          accessToken: "rotated-access-token",
          refreshToken: "rotated-refresh-token"
        });

        const rotatedAuth = await hook.authenticate({ upstreamRequest });
        assert.equal(rotatedAuth.ok, true);
        assert.equal(rotatedAuth.value.headers.authorization, "Bearer rotated-access-token");
        assert.equal(rotatedAuth.value.headers["anthropic-beta"], "oauth-2025-04-20");
      });
    });
  });
});

test("Grok local agent request hook removes unsupported Responses tools and stale tool choice", () => {
  const [hook] = createGatewayPlugin({
    config: {
      providerPlugins: [grokOauthProviderPlugin()]
    }
  }).providerHooks;
  const requestResult = hook.transformRequest({
    model: "grok-4.5",
    upstreamRequest: {
      body: {
        parallel_tool_calls: true,
        tool_choice: { type: "tool", name: "multi_agent_v1" },
        tools: [
          { type: "namespace", name: "multi_agent_v1" },
          { type: "function", name: "exec_command" }
        ]
      },
      headers: {},
      method: "POST",
      url: "https://cli-chat-proxy.grok.com/v1/responses"
    }
  });

  assert.equal(requestResult.ok, true);
  assert.deepEqual(requestResult.value.body.tools, [{ type: "function", name: "exec_command" }]);
  assert.equal(requestResult.value.body.tool_choice, undefined);
  assert.equal(requestResult.value.body.parallel_tool_calls, true);
});

test("core gateway config installs the local agent dynamic auth runtime hook when OAuth plugins are present", async () => {
  const config = createDefaultAppConfig();
  config.providerPlugins = [grokOauthProviderPlugin()];
  config.Providers = [
    {
      api_base_url: "https://cli-chat-proxy.grok.com/v1",
      api_key: "ccr-local-agent-login",
      id: "grok-cli-api",
      models: ["grok-4.5"],
      name: "Grok CLI API",
      type: "openai_responses"
    }
  ];

  const compiled = await compileCoreGatewayConfig(
    config,
    "raw-trace-token",
    "billing-usage-token",
    "core-auth-token"
  );
  const plugins = Array.isArray(compiled.plugins) ? compiled.plugins : [];
  const localAgentAuthPlugin = plugins.find((plugin) => plugin.key === "ccr-local-agent-auth-provider-hooks");

  assert.ok(localAgentAuthPlugin);
  assert.match(localAgentAuthPlugin.modulePath, /local-agent-auth-provider-hook\.js$/);
});

test("core gateway config removes Grok unsupported Responses options through declarative request transforms", async (t) => {
  await withGrokHome(t, async (grokHome) => {
    writeGrokAuth(grokHome, {
      expires_at: "2099-01-01T00:00:00Z",
      key: "live-grok-access-token",
      oidc_client_id: "grok-client-id",
      oidc_issuer: "https://auth.x.ai",
      refresh_token: "grok-refresh-token"
    });
    const plugin = grokOauthProviderPlugin();
    plugin.request.bodyRemove = ["metadata"];

    const config = createDefaultAppConfig();
    config.providerPlugins = [plugin];
    config.Providers = [
      {
        api_base_url: "https://cli-chat-proxy.grok.com/v1",
        api_key: "ccr-local-agent-login",
        id: "grok-cli-api",
        models: ["grok-4.5"],
        name: "Grok CLI API",
        type: "openai_responses"
      }
    ];

    const compiled = await compileCoreGatewayConfig(
      config,
      "raw-trace-token",
      "billing-usage-token",
      "core-auth-token"
    );
    const providerPlugins = Array.isArray(compiled.providerPlugins) ? compiled.providerPlugins : [];
    const grokPlugin = providerPlugins.find((value) => value.key === "ccr-local-agent-grok-cli-api-grok-cli-oauth");

    assert.ok(grokPlugin);
    assert.deepEqual(grokPlugin.request.bodyRemove, ["metadata", "external_web_access"]);
  });
});

test("local agent OAuth plugin detector only matches managed OAuth imports", () => {
  assert.equal(isLocalAgentOauthProviderPlugin(grokOauthProviderPlugin()), true);
  assert.equal(isLocalAgentOauthProviderPlugin({
    key: "ccr-local-agent-grok-cli-api-grok-cli-api-key"
  }), false);
  assert.equal(isLocalAgentOauthProviderPlugin({
    key: "external-grok-cli-oauth"
  }), false);
});

function grokOauthProviderPlugin() {
  return {
    auth: {
      headers: {
        authorization: "Bearer imported-stale-token"
      },
      removeHeaders: ["x-api-key"],
      strict: true
    },
    key: "ccr-local-agent-grok-cli-api-grok-cli-oauth",
    providerName: "Grok CLI API",
    request: {
      headers: {
        "x-grok-client-identifier": "xai-grok-cli",
        "x-grok-client-version": "0.2.93",
        "x-grok-model-override": "{{ model }}"
      },
      strict: true
    }
  };
}

function claudeCodeOauthProviderPlugin() {
  return {
    auth: {
      headers: {
        authorization: "Bearer stale-imported-access-token",
        "anthropic-beta": "oauth-2025-04-20"
      },
      removeHeaders: ["x-api-key"],
      strict: true
    },
    key: "ccr-local-agent-claude-code-api-claude-code-oauth",
    providerName: "Claude Code API"
  };
}

async function withClaudeCodeHome(run) {
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-claude-code-hook-test-"));
  const previousHome = process.env.HOME;
  process.env.HOME = home;
  try {
    await run(home);
  } finally {
    restoreEnv("HOME", previousHome);
    rmSync(home, { force: true, recursive: true });
  }
}

async function withPlatform(platform, run) {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform
  });
  try {
    await run();
  } finally {
    Object.defineProperty(process, "platform", descriptor);
  }
}

// Forces the macOS Keychain lookup to miss so the scan falls back to the file
// credentials this test controls, regardless of the host's real Keychain state.
async function withFakeSecurityFailure(run) {
  await withFakeSecurityScript("exit 44\n", run);
}

async function withFakeSecurityScript(body, run) {
  const binDir = mkdtempSync(path.join(os.tmpdir(), "ccr-claude-code-security-bin-"));
  const securityPath = path.join(binDir, "security");
  const previousPath = process.env.PATH;
  const previousUser = process.env.USER;
  writeFileSync(securityPath, `#!/bin/sh\n${body}`);
  chmodSync(securityPath, 0o755);
  process.env.PATH = `${binDir}${path.delimiter}${previousPath ?? ""}`;
  process.env.USER = "ccr-test-user";
  try {
    await run();
  } finally {
    restoreEnv("PATH", previousPath);
    restoreEnv("USER", previousUser);
    rmSync(binDir, { force: true, recursive: true });
  }
}

function writeClaudeCredentials(home, credentials) {
  const directory = path.join(home, ".claude");
  const credentialFile = path.join(directory, ".credentials.json");
  mkdirSync(directory, { recursive: true });
  writeFileSync(credentialFile, JSON.stringify(credentials, null, 2));
  return credentialFile;
}

async function withGrokHome(t, run) {
  const previousGrokHome = process.env.GROK_HOME;
  const previousGrokAuthFile = process.env.GROK_AUTH_FILE;
  const previousGrokCliVersion = process.env.GROK_CLI_VERSION;
  const grokHome = mkdtempSync(path.join(os.tmpdir(), "ccr-grok-hook-test-"));
  process.env.GROK_HOME = grokHome;
  process.env.GROK_CLI_VERSION = "0.2.93";
  delete process.env.GROK_AUTH_FILE;
  try {
    await run(grokHome);
  } finally {
    restoreEnv("GROK_HOME", previousGrokHome);
    restoreEnv("GROK_AUTH_FILE", previousGrokAuthFile);
    restoreEnv("GROK_CLI_VERSION", previousGrokCliVersion);
    rmSync(grokHome, { force: true, recursive: true });
  }
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function writeGrokAuth(grokHome, auth) {
  writeFileSync(path.join(grokHome, "auth.json"), JSON.stringify({
    "https://auth.x.ai::test-account": auth
  }, null, 2));
}
