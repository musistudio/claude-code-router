import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { importOpenCodeProvider, opencodeCandidates } from "@ccr/core/agents/local-providers/opencode.ts";
import { parseProvidersForTest } from "@ccr/core/config/config.ts";
import { createGatewayPlugin } from "@ccr/core/gateway/core-runtime/upstream-header-sanitizer.ts";
import { toCoreGatewayProviders } from "@ccr/core/providers/runtime-topology.ts";

test("OpenCode Go local import compiles to the Go endpoint and forwards the Claude session", () => {
  const environmentNames = [
    "CCR_INTERNAL_HOME_DIR",
    "OPENCODE_API_KEY",
    "OPENCODE_GO_API_KEY",
    "OPENCODE_AUTH_CONTENT",
    "OPENCODE_CONFIG",
    "OPENCODE_CONFIG_CONTENT"
  ];
  const previousEnvironment = Object.fromEntries(environmentNames.map((name) => [name, process.env[name]]));
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-opencode-go-integration-"));
  process.env.CCR_INTERNAL_HOME_DIR = home;
  for (const name of environmentNames.slice(1)) {
    delete process.env[name];
  }
  try {
    const dataDirectory = path.join(home, ".local", "share", "opencode");
    const cacheDirectory = path.join(home, ".cache", "opencode");
    mkdirSync(dataDirectory, { recursive: true });
    mkdirSync(cacheDirectory, { recursive: true });
    writeFileSync(path.join(dataDirectory, "auth.json"), JSON.stringify({
      "opencode-go": { key: "opencode-go-key", type: "api" }
    }));
    writeFileSync(path.join(cacheDirectory, "models.json"), JSON.stringify({
      "opencode-go": {
        api: "https://opencode.ai/zen/go/v1",
        models: {
          "go-anthropic": {
            name: "Go Anthropic",
            provider: { npm: "@ai-sdk/anthropic" }
          }
        },
        name: "OpenCode Go",
        npm: "@ai-sdk/openai-compatible"
      }
    }));

    const candidate = opencodeCandidates().find((item) => item.id === "opencode-go-api-anthropic-messages");
    assert.ok(candidate);
    const imported = importOpenCodeProvider(candidate, []);
    const [provider] = parseProvidersForTest([imported.provider]);
    const [compiled] = toCoreGatewayProviders(provider);
    assert.equal(imported.provider.baseUrl, "https://opencode.ai/zen/go/v1");
    assert.equal(compiled.baseurl, "https://opencode.ai/zen/go");
    assert.equal(compiled.type, "anthropic_messages");
    assert.deepEqual(provider.models, ["go-anthropic"]);
    assert.deepEqual(provider.modelDisplayNames, { "go-anthropic": "Go Anthropic" });

    const [headerHook] = createGatewayPlugin().providerHooks;
    const transformed = headerHook.transformRequest({
      config: { anthropicBaseUrl: "https://api.anthropic.com" },
      request: {
        id: "request-1",
        headers: { "x-claude-code-session-id": "claude-session-1" }
      },
      targetProviderConfig: compiled,
      upstreamRequest: {
        body: {},
        headers: { "x-api-key": "opencode-go-key" },
        method: "POST",
        url: "https://api.anthropic.com/v1/messages"
      }
    }).value;
    assert.equal(transformed.url, "https://opencode.ai/zen/go/v1/messages");
    assert.equal(transformed.headers["x-opencode-session"], "claude-session-1");

    const metadataTransformed = headerHook.transformRequest({
      config: { anthropicBaseUrl: "https://api.anthropic.com" },
      request: {
        body: { metadata: { user_id: "conversation-2" } },
        headers: {},
        id: "request-2"
      },
      targetProviderConfig: compiled,
      upstreamRequest: {
        body: {},
        headers: { "x-api-key": "opencode-go-key" },
        method: "POST",
        url: "https://api.anthropic.com/v1/messages"
      }
    }).value;
    assert.equal(metadataTransformed.url, "https://opencode.ai/zen/go/v1/messages");
    assert.equal(metadataTransformed.headers["x-opencode-session"], "conversation-2");
  } finally {
    for (const name of environmentNames) {
      restoreEnvironment(name, previousEnvironment[name]);
    }
    rmSync(home, { force: true, recursive: true });
  }
});

function restoreEnvironment(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
