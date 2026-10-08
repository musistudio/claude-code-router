import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { compileCoreGatewayConfig } from "@ccr/core/gateway/core-runtime/config-compiler.ts";
import { createGatewayPlugin } from "@ccr/core/gateway/core-runtime/local-agent-auth-provider-hook.ts";
import {
  OPENCODE_PUBLIC_FREETIER_PLUGIN_SUFFIX,
  OPENCODE_PUBLIC_FREETIER_USER_AGENT_FALLBACK,
  applyOpenCodePublicFreeTierHeaders,
  formatOpenCodeId,
  isOpenCodePublicFreeTierPlugin,
  mintOpenCodeRequestId,
  mintOpenCodeSessionId,
  openCodeIdTimestampMs,
  openCodePublicFreeTierHeaders,
  openCodePublicFreeTierPlugin,
  openCodePublicFreeTierUserAgent,
  resetOpenCodePublicFreeTierState,
  withOpenCodePublicFreeTierTools
} from "@ccr/core/agents/local-providers/opencode-freetier.ts";

test("OpenCode free-tier session IDs embed a fresh descending timestamp", () => {
  resetOpenCodePublicFreeTierState();
  const id = mintOpenCodeSessionId();
  assert.match(id, /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
  assert.equal(id.length, 30);
  const timestamp = openCodeIdTimestampMs(id);
  assert.ok(timestamp !== undefined);
  assert.ok(Math.abs(timestamp - (Date.now() % 2 ** 36)) < 60_000);
});

test("OpenCode free-tier request IDs embed a fresh ascending timestamp", () => {
  resetOpenCodePublicFreeTierState();
  const id = mintOpenCodeRequestId();
  assert.match(id, /^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
  assert.equal(id.length, 30);
  const timestamp = openCodeIdTimestampMs(id);
  assert.ok(timestamp !== undefined);
  assert.ok(Math.abs(timestamp - (Date.now() % 2 ** 36)) < 60_000);
});

test("OpenCode free-tier IDs order by direction for identical timestamps", () => {
  const first = formatOpenCodeId("ses", "descending", 1789604300000, 1, "A".repeat(14));
  const second = formatOpenCodeId("ses", "descending", 1789604300000, 2, "A".repeat(14));
  assert.ok(first > second);

  const firstRequest = formatOpenCodeId("msg", "ascending", 1789604300000, 1, "A".repeat(14));
  const secondRequest = formatOpenCodeId("msg", "ascending", 1789604300000, 2, "A".repeat(14));
  assert.ok(firstRequest < secondRequest);

  assert.equal(openCodeIdTimestampMs(first), openCodeIdTimestampMs(firstRequest));
});

test("OpenCode free-tier IDs are unique across requests", () => {
  resetOpenCodePublicFreeTierState();
  const ids = new Set();
  for (let index = 0; index < 200; index += 1) {
    ids.add(mintOpenCodeSessionId());
    ids.add(mintOpenCodeRequestId());
  }
  assert.equal(ids.size, 400);
});

test("OpenCode free-tier timestamp decoder rejects malformed IDs", () => {
  assert.equal(openCodeIdTimestampMs("ses_short"), undefined);
  assert.equal(openCodeIdTimestampMs("ses_ZZZZZZZZZZZZAAAAAAAAAAAAAA"), undefined);
  assert.equal(openCodeIdTimestampMs("no-separator-at-all-0123456789abcdef"), undefined);
  assert.equal(openCodeIdTimestampMs(""), undefined);
});

test("OpenCode free-tier user agent prefers an explicit override", () => {
  const previousOverride = process.env.CCR_OPENCODE_USER_AGENT;
  process.env.CCR_OPENCODE_USER_AGENT = "opencode/9.9.9-test";
  resetOpenCodePublicFreeTierState();
  try {
    assert.equal(openCodePublicFreeTierUserAgent(), "opencode/9.9.9-test");
  } finally {
    restoreEnv("CCR_OPENCODE_USER_AGENT", previousOverride);
    resetOpenCodePublicFreeTierState();
  }
});

test("OpenCode free-tier user agent reads the installed CLI version", () => {
  const binDir = mkdtempSync(path.join(os.tmpdir(), "ccr-opencode-freetier-bin-"));
  writeFileSync(path.join(binDir, "opencode"), "#!/bin/sh\necho 'opencode version 7.8.9'\n");
  chmodSync(path.join(binDir, "opencode"), 0o755);
  const previousPath = process.env.PATH;
  const previousOverride = process.env.CCR_OPENCODE_USER_AGENT;
  process.env.PATH = `${binDir}${path.delimiter}${previousPath ?? ""}`;
  delete process.env.CCR_OPENCODE_USER_AGENT;
  resetOpenCodePublicFreeTierState();
  try {
    assert.equal(openCodePublicFreeTierUserAgent(), "opencode/7.8.9");
  } finally {
    restoreEnv("PATH", previousPath);
    restoreEnv("CCR_OPENCODE_USER_AGENT", previousOverride);
    resetOpenCodePublicFreeTierState();
    rmSync(binDir, { force: true, recursive: true });
  }
});

test("OpenCode free-tier user agent falls back without an installed CLI", () => {
  const binDir = mkdtempSync(path.join(os.tmpdir(), "ccr-opencode-freetier-empty-bin-"));
  const previousPath = process.env.PATH;
  const previousOverride = process.env.CCR_OPENCODE_USER_AGENT;
  process.env.PATH = binDir;
  delete process.env.CCR_OPENCODE_USER_AGENT;
  resetOpenCodePublicFreeTierState();
  try {
    assert.equal(openCodePublicFreeTierUserAgent(), OPENCODE_PUBLIC_FREETIER_USER_AGENT_FALLBACK);
  } finally {
    restoreEnv("PATH", previousPath);
    restoreEnv("CCR_OPENCODE_USER_AGENT", previousOverride);
    resetOpenCodePublicFreeTierState();
    rmSync(binDir, { force: true, recursive: true });
  }
});

test("OpenCode free-tier headers carry a fresh client fingerprint", () => {
  const previousOverride = process.env.CCR_OPENCODE_USER_AGENT;
  process.env.CCR_OPENCODE_USER_AGENT = "opencode/1.18.31";
  resetOpenCodePublicFreeTierState();
  try {
    const headers = openCodePublicFreeTierHeaders();
    assert.equal(headers["user-agent"], "opencode/1.18.31");
    assert.equal(headers["x-opencode-client"], "cli");
    assert.match(headers["x-opencode-session"], /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
    assert.match(headers["x-opencode-request"], /^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
  } finally {
    restoreEnv("CCR_OPENCODE_USER_AGENT", previousOverride);
    resetOpenCodePublicFreeTierState();
  }
});

test("OpenCode free-tier header application overwrites the client user agent but keeps auth", () => {
  const previousOverride = process.env.CCR_OPENCODE_USER_AGENT;
  process.env.CCR_OPENCODE_USER_AGENT = "opencode/1.18.31";
  resetOpenCodePublicFreeTierState();
  try {
    const input = {
      authorization: "Bearer public",
      "User-Agent": "claude-code/1.0",
      "x-custom": "keep"
    };
    const headers = applyOpenCodePublicFreeTierHeaders(input);
    assert.equal(headers["user-agent"], "opencode/1.18.31");
    assert.equal(headers["User-Agent"], undefined);
    assert.equal(headers.authorization, "Bearer public");
    assert.equal(headers["x-custom"], "keep");
    assert.match(headers["x-opencode-session"], /^ses_/);
    assert.match(headers["x-opencode-request"], /^msg_/);
    assert.equal(input["User-Agent"], "claude-code/1.0");
  } finally {
    restoreEnv("CCR_OPENCODE_USER_AGENT", previousOverride);
    resetOpenCodePublicFreeTierState();
  }
});

test("OpenCode free-tier plugin detector only matches managed public imports", () => {
  assert.equal(isOpenCodePublicFreeTierPlugin(openCodePublicFreeTierPlugin()), true);
  assert.equal(isOpenCodePublicFreeTierPlugin({
    key: "ccr-local-agent-opencode-public-Responses-OPENCODE-PUBLIC-FREETIER".toLowerCase(),
    providerName: "OpenCode Public"
  }), true);
  assert.equal(isOpenCodePublicFreeTierPlugin({
    key: "ccr-local-agent-grok-cli-api-grok-cli-oauth"
  }), false);
  assert.equal(isOpenCodePublicFreeTierPlugin({ key: "external-opencode-public-freetier" }), false);
  assert.equal(isOpenCodePublicFreeTierPlugin({}), false);
  assert.equal(isOpenCodePublicFreeTierPlugin(undefined), false);
});

test("OpenCode free-tier import plugin never overrides auth", () => {
  const plugin = openCodePublicFreeTierPlugin();
  assert.equal(
    plugin.key,
    `ccr-local-agent-__CCR_PROVIDER_NAME_SLUG__-${OPENCODE_PUBLIC_FREETIER_PLUGIN_SUFFIX}`
  );
  assert.equal(plugin.providerName, "__CCR_PROVIDER_NAME__");
  assert.equal(plugin.auth, undefined);
});

test("OpenCode free-tier import plugin carries a request section so the gateway keeps it for runtime hooks", () => {
  assert.deepEqual(openCodePublicFreeTierPlugin().request, { headers: { "x-opencode-client": "cli" } });
});

test("OpenCode free-tier internal import plugin gets a key distinct from the display one", () => {
  const internal = openCodePublicFreeTierPlugin("__CCR_PROVIDER_INTERNAL_NAME__", "-internal");

  assert.equal(internal.providerName, "__CCR_PROVIDER_INTERNAL_NAME__");
  assert.notEqual(internal.key, openCodePublicFreeTierPlugin().key);
  assert.equal(isOpenCodePublicFreeTierPlugin(internal), true);
});

test("OpenCode free-tier hook mints headers per request without touching auth", async () => {
  const previousOverride = process.env.CCR_OPENCODE_USER_AGENT;
  process.env.CCR_OPENCODE_USER_AGENT = "opencode/1.18.31";
  resetOpenCodePublicFreeTierState();
  try {
    const [hook] = createGatewayPlugin({
      config: {
        providerPlugins: [{
          key: "ccr-local-agent-opencode-public-chat-completions-opencode-public-freetier",
          providerName: "OpenCode Public (Chat Completions)"
        }]
      }
    }).providerHooks;
    assert.ok(hook);
    assert.equal(hook.authenticate, undefined);

    const first = await hook.transformRequest({
      model: "big-pickle",
      upstreamRequest: {
        headers: { authorization: "Bearer public", "user-agent": "some-client/1.0" },
        method: "POST",
        url: "https://opencode.ai/zen/v1/chat/completions"
      }
    });
    assert.equal(first.ok, true);
    assert.equal(first.value.headers.authorization, "Bearer public");
    assert.equal(first.value.headers["user-agent"], "opencode/1.18.31");
    assert.match(first.value.headers["x-opencode-session"], /^ses_/);

    const second = await hook.transformRequest({
      model: "big-pickle",
      upstreamRequest: { headers: {}, method: "POST", url: "https://opencode.ai/zen/v1/chat/completions" }
    });
    assert.equal(second.ok, true);
    assert.notEqual(second.value.headers["x-opencode-session"], first.value.headers["x-opencode-session"]);
    assert.notEqual(second.value.headers["x-opencode-request"], first.value.headers["x-opencode-request"]);
  } finally {
    restoreEnv("CCR_OPENCODE_USER_AGENT", previousOverride);
    resetOpenCodePublicFreeTierState();
  }
});

test("OpenCode free-tier tools append the required bash and read to chat completions requests", () => {
  const clientTool = { function: { name: "Bash", parameters: { type: "object" } }, type: "function" };
  const body = { model: "big-pickle", stream: true, tools: [clientTool] };

  const next = withOpenCodePublicFreeTierTools(body, "https://opencode.ai/zen/v1/chat/completions");

  assert.deepEqual(next.tools.map((tool) => tool.function.name), ["Bash", "bash", "read"]);
  assert.equal(next.tools[0], clientTool);
  assert.deepEqual(body.tools, [clientTool]);
});

test("OpenCode free-tier tools use the flat tool shape on the responses endpoint", () => {
  const next = withOpenCodePublicFreeTierTools({ input: "hi" }, "https://opencode.ai/zen/v1/responses");

  assert.deepEqual(next.tools.map((tool) => [tool.type, tool.name]), [["function", "bash"], ["function", "read"]]);
});

test("OpenCode free-tier tools keep requests that already declare bash and read untouched", () => {
  const body = {
    tools: [
      { function: { name: "read" }, type: "function" },
      { function: { name: "bash" }, type: "function" }
    ]
  };

  assert.equal(withOpenCodePublicFreeTierTools(body, "https://opencode.ai/zen/v1/chat/completions"), body);
});

test("OpenCode free-tier hook adds the required tools to the upstream body", async () => {
  const [hook] = createGatewayPlugin({
    config: {
      providerPlugins: [{
        key: "ccr-local-agent-opencode-public-chat-completions-opencode-public-freetier",
        providerName: "OpenCode Public (Chat Completions)"
      }]
    }
  }).providerHooks;

  const result = await hook.transformRequest({
    model: "big-pickle",
    upstreamRequest: {
      body: { model: "big-pickle", stream: true },
      headers: {},
      method: "POST",
      url: "https://opencode.ai/zen/v1/chat/completions"
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.body.tools.map((tool) => tool.function.name), ["bash", "read"]);
});

test("core gateway config installs the runtime hook for public free-tier plugins", async () => {
  const config = createDefaultAppConfig();
  config.providerPlugins = [{
    key: "ccr-local-agent-opencode-public-chat-completions-opencode-public-freetier",
    providerName: "OpenCode Public (Chat Completions)"
  }];
  config.Providers = [
    {
      api_base_url: "https://opencode.ai/zen/v1",
      api_key: "public",
      id: "opencode-public-chat-completions",
      models: ["big-pickle"],
      name: "OpenCode Public (Chat Completions)",
      type: "openai_chat_completions"
    }
  ];

  const compiled = await compileCoreGatewayConfig(
    config,
    "raw-trace-token",
    "billing-usage-token",
    "core-auth-token"
  );
  const plugins = Array.isArray(compiled.plugins) ? compiled.plugins : [];
  const freeTierHookPlugin = plugins.find((plugin) => plugin.key === "ccr-local-agent-auth-provider-hooks");
  assert.ok(freeTierHookPlugin);
});

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
