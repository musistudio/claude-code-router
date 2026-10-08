import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  importOpenCodeProvider,
  opencodeCandidates,
  opencodeCatalogProtocolModels,
  removeOpenCodeProviderAccountConfig
} from "@ccr/core/agents/local-providers/opencode.ts";
import { localAgentProviderApiKey } from "@ccr/core/agents/local-providers/shared.ts";
import { OPENCODE_PUBLIC_FREETIER_PLUGIN_SUFFIX } from "@ccr/core/agents/local-providers/opencode-freetier.ts";

test("OpenCode local provider imports Zen models using each model's native protocol", async () => {
  await withOpenCodeHome(async (home) => {
    writeOpenCodeAuth(home, {
      opencode: {
        key: "opencode-zen-key",
        type: "api"
      }
    });
    writeOpenCodeModels(home, {
      api: "https://opencode.ai/zen/v1",
      models: {
        "gpt-current": {
          name: "GPT Current",
          provider: { npm: "@ai-sdk/openai" }
        },
        "claude-current": {
          name: "Claude Current",
          provider: { npm: "@ai-sdk/anthropic" }
        },
        "chat-current": {
          name: "Chat Current"
        },
        "gemini-current": {
          name: "Gemini Current",
          provider: { npm: "@ai-sdk/google" }
        },
        "gpt-deprecated": {
          name: "GPT Deprecated",
          provider: { npm: "@ai-sdk/openai" },
          status: "deprecated"
        }
      },
      name: "OpenCode Zen",
      npm: "@ai-sdk/openai-compatible"
    });
    writeOpenCodeConfig(home, `{
      // OpenCode accepts JSONC and trailing commas.
      "model": "opencode/gpt-current",
      "provider": {
        "opencode": {
          "name": "OpenCode Local",
          "options": {
            "baseURL": "https://opencode.example/v1",
          },
          "models": {
            "custom-chat": { "name": "Custom Chat", },
            "custom-chat-alias": { "id": "custom-chat-target", "name": "Custom Chat Alias", },
          },
        },
      },
    }`);

    const candidates = opencodeCandidates();
    assert.equal(candidates.length, 4);
    assert.ok(candidates.every((candidate) => candidate.kind === "opencode"));
    assert.ok(candidates.every((candidate) => candidate.importable));
    assert.ok(candidates.every((candidate) => candidate.status === "available"));

    const responses = candidateForProtocol(candidates, "openai_responses");
    const anthropic = candidateForProtocol(candidates, "anthropic_messages");
    const chat = candidateForProtocol(candidates, "openai_chat_completions");
    const gemini = candidateForProtocol(candidates, "gemini_generate_content");
    assert.deepEqual(responses.models, ["gpt-current"]);
    assert.deepEqual(responses.modelDisplayNames, { "gpt-current": "GPT Current" });
    assert.deepEqual(anthropic.models, ["claude-current"]);
    assert.deepEqual(chat.models, ["chat-current", "custom-chat", "custom-chat-target"]);
    assert.deepEqual(chat.modelDisplayNames, {
      "chat-current": "Chat Current",
      "custom-chat": "Custom Chat",
      "custom-chat-target": "Custom Chat Alias"
    });
    assert.deepEqual(gemini.models, ["gemini-current"]);
    assert.ok(!responses.models.includes("gpt-deprecated"));

    const result = importOpenCodeProvider(responses, [responses.name]);
    assert.equal(result.provider.name, `${responses.name} 2`);
    assert.equal(result.provider.baseUrl, "https://opencode.example/v1");
    assert.equal(result.provider.protocol, "openai_responses");
    assert.equal(result.provider.apiKey, localAgentProviderApiKey);
    assert.deepEqual(result.provider.models, ["gpt-current"]);
    assert.equal(result.provider.account, undefined);
    assert.equal(result.providerPlugins.length, 2);
    assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer opencode-zen-key");
    assert.equal(result.providerPlugins[0].key, "ccr-local-agent-__CCR_PROVIDER_NAME_SLUG__-opencode-openai-responses-api-key");
    assert.equal(result.providerPlugins[1].providerName, "__CCR_PROVIDER_INTERNAL_NAME__");

    const anthropicResult = importOpenCodeProvider(anthropic, []);
    assert.equal(anthropicResult.providerPlugins[0].auth.headers["x-api-key"], "opencode-zen-key");
    assert.deepEqual(anthropicResult.providerPlugins[0].auth.removeHeaders, ["authorization"]);

    const geminiResult = importOpenCodeProvider(gemini, []);
    assert.equal(geminiResult.providerPlugins[0].auth.headers["x-goog-api-key"], "opencode-zen-key");
    assert.equal(geminiResult.providerPlugins[0].auth.query.key, "opencode-zen-key");
  });
});

test("OpenCode local provider imports Go separately from Zen using provider catalog metadata", async () => {
  await withOpenCodeHome(async (home) => {
    const goChatModels = Object.fromEntries(Array.from({ length: 25 }, (_, index) => [
      `go-chat-${index + 1}`,
      { name: `Go Chat ${index + 1}` }
    ]));
    writeOpenCodeAuth(home, {
      opencode: {
        key: "opencode-zen-key",
        type: "api"
      },
      "opencode-go": {
        key: "opencode-go-key",
        type: "api"
      }
    });
    writeOpenCodeCatalog(home, {
      opencode: {
        api: "https://opencode.ai/zen/v1",
        models: {
          "shared-model": {
            name: "Zen Shared Model",
            provider: { npm: "@ai-sdk/openai" }
          }
        },
        name: "OpenCode Zen",
        npm: "@ai-sdk/openai-compatible"
      },
      "opencode-go": {
        api: "https://opencode.ai/zen/go/v1",
        models: {
          ...goChatModels,
          "shared-model": {
            name: "Go Shared Model",
            provider: { npm: "@ai-sdk/anthropic" }
          },
          "go-chat": {
            name: "Go Chat",
            provider: { npm: "@ai-sdk/openai-compatible" }
          },
          "go-responses": {
            name: "Go Responses",
            provider: { npm: "@ai-sdk/openai" }
          }
        },
        name: "OpenCode Go",
        npm: "@ai-sdk/openai-compatible"
      }
    });

    const candidates = opencodeCandidates();
    assert.equal(candidates.length, 8);

    const zenResponses = candidateForId(candidates, "opencode-api-openai-responses");
    assert.deepEqual(zenResponses.models, ["shared-model"]);
    assert.deepEqual(zenResponses.modelDisplayNames, { "shared-model": "Zen Shared Model" });

    const goAnthropic = candidateForId(candidates, "opencode-go-api-anthropic-messages");
    const goChat = candidateForId(candidates, "opencode-go-api-openai-chat-completions");
    const goResponses = candidateForId(candidates, "opencode-go-api-openai-responses");
    assert.deepEqual(goAnthropic.models, ["shared-model"]);
    assert.deepEqual(goAnthropic.modelDisplayNames, { "shared-model": "Go Shared Model" });
    assert.equal(goChat.models.length, 26);
    assert.equal(goChat.models.at(-1), "go-chat");
    assert.equal(goChat.modelDisplayNames["go-chat-25"], "Go Chat 25");
    assert.equal(goChat.modelDisplayNames["go-chat"], "Go Chat");
    assert.deepEqual(goResponses.models, ["go-responses"]);
    assert.deepEqual(goResponses.modelDisplayNames, { "go-responses": "Go Responses" });
    assert.ok(goAnthropic.name.startsWith("OpenCode Go"));

    const goResult = importOpenCodeProvider(goAnthropic, []);
    assert.equal(goResult.provider.baseUrl, "https://opencode.ai/zen/go/v1");
    assert.equal(goResult.provider.protocol, "anthropic_messages");
    assert.deepEqual(goResult.provider.models, ["shared-model"]);
    assert.deepEqual(goResult.provider.modelDisplayNames, { "shared-model": "Go Shared Model" });
    assert.equal(goResult.providerPlugins[0].auth.headers["x-api-key"], "opencode-go-key");
    assert.ok(goResult.providerPlugins[0].key.endsWith("-opencode-go-anthropic-messages-api-key"));
    assert.ok(goResult.providerPlugins[1].key.endsWith("-opencode-go-anthropic-messages-api-key-internal"));
    assert.equal(goResult.provider.account?.enabled, true);
    const goUsageConnector = goResult.provider.account?.connectors?.[0];
    assert.equal(goUsageConnector?.type, "http-json");
    assert.equal(goUsageConnector?.endpoint, "https://opencode.ai/zen/go/v1/usage");
    assert.equal(goUsageConnector?.auth, "provider-api-key");
    assert.deepEqual(goUsageConnector?.mapping?.meters.map((meter) => meter.id), [
      "opencode_go_5h",
      "opencode_go_weekly",
      "opencode_go_monthly"
    ]);

    const goChatResult = importOpenCodeProvider(goChat, []);
    assert.equal(goChatResult.provider.models.length, 26);
    assert.equal(goChatResult.provider.models.at(-1), "go-chat");
    assert.equal(goChatResult.provider.modelDisplayNames["go-chat-25"], "Go Chat 25");
    assert.equal(goChatResult.provider.account?.connectors?.[0]?.endpoint, "https://opencode.ai/zen/go/v1/usage");

    const zenResult = importOpenCodeProvider(zenResponses, []);
    assert.equal(zenResult.provider.baseUrl, "https://opencode.ai/zen/v1");
    assert.equal(zenResult.providerPlugins[0].auth.headers.authorization, "Bearer opencode-zen-key");
    assert.ok(zenResult.providerPlugins[0].key.endsWith("-opencode-openai-responses-api-key"));
    assert.equal(zenResult.provider.account, undefined);
  });
});

test("OpenCode Go credentials without usable models are reported as locked and actionable", async () => {
  await withOpenCodeHome(async () => {
    process.env.OPENCODE_GO_API_KEY = "go-env-key";

    const candidates = opencodeCandidates();
    const goChat = candidateForId(candidates, "opencode-go-api-openai-chat-completions");
    assert.equal(goChat.status, "locked");
    assert.equal(goChat.importable, false);
    assert.match(goChat.detail, /no OpenCode Go models were detected/);
    assert.equal(goChat.sourceFile, "env:OPENCODE_GO_API_KEY");
  });

  await withOpenCodeHome(async (home) => {
    writeOpenCodeAuth(home, {
      "opencode-go": {
        key: "opencode-go-key",
        type: "api"
      }
    });
    writeOpenCodeCatalog(home, {
      "opencode-go": {
        api: "https://opencode.ai/zen/go/v1",
        models: {},
        name: "OpenCode Go",
        npm: "@ai-sdk/openai-compatible"
      }
    });

    const candidates = opencodeCandidates();
    const goChat = candidateForId(candidates, "opencode-go-api-openai-chat-completions");
    assert.equal(goChat.status, "locked");
    assert.equal(goChat.importable, false);
    assert.match(goChat.detail, /no OpenCode Go models were detected/);
    assert.equal(goChat.detail.includes("OpenCode Go credential"), true);
  });
});

test("OpenCode Go can be discovered from configured provider metadata", async () => {
  await withOpenCodeHome(async (home) => {
    process.env.CCR_OPENCODE_GO_TEST_KEY = "configured-go-key";
    writeOpenCodeConfig(home, `{
      "model": "opencode-go/go-configured",
      "provider": {
        "opencode-go": {
          "name": "Configured OpenCode Go",
          "options": {
            "apiKey": "{env:CCR_OPENCODE_GO_TEST_KEY}"
          },
          "models": {
            "go-configured": {
              "name": "Go Configured",
              "provider": { "npm": "@ai-sdk/openai-compatible" }
            }
          }
        }
      }
    }`);

    const candidates = opencodeCandidates();
    const goChat = candidateForId(candidates, "opencode-go-api-openai-chat-completions");
    assert.deepEqual(goChat.models, ["go-configured"]);
    assert.deepEqual(goChat.modelDisplayNames, { "go-configured": "Go Configured" });
    assert.ok(goChat.name.startsWith("Configured OpenCode Go"));

    const result = importOpenCodeProvider(goChat, []);
    assert.equal(result.provider.baseUrl, "https://opencode.ai/zen/go/v1");
    assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer configured-go-key");
  });
});

test("OpenCode Go accepts the shared catalog API key with a Go-specific override", async () => {
  await withOpenCodeHome(async (home) => {
    writeOpenCodeCatalog(home, {
      "opencode-go": {
        api: "https://opencode.ai/zen/go/v1",
        env: ["OPENCODE_API_KEY"],
        models: {
          "go-chat": {
            name: "Go Chat",
            provider: { npm: "@ai-sdk/openai-compatible" }
          }
        },
        name: "OpenCode Go",
        npm: "@ai-sdk/openai-compatible"
      }
    });
    process.env.OPENCODE_API_KEY = "shared-opencode-key";

    const sharedCandidate = candidateForId(opencodeCandidates(), "opencode-go-api-openai-chat-completions");
    assert.equal(sharedCandidate.sourceFile, "env:OPENCODE_API_KEY");
    assert.equal(
      importOpenCodeProvider(sharedCandidate, []).providerPlugins[0].auth.headers.authorization,
      "Bearer shared-opencode-key"
    );

    process.env.OPENCODE_GO_API_KEY = "go-specific-key";
    const overrideCandidate = candidateForId(opencodeCandidates(), "opencode-go-api-openai-chat-completions");
    assert.equal(overrideCandidate.sourceFile, "env:OPENCODE_GO_API_KEY");
    assert.equal(
      importOpenCodeProvider(overrideCandidate, []).providerPlugins[0].auth.headers.authorization,
      "Bearer go-specific-key"
    );
  });
});

test("OpenCode local provider resolves API keys from OpenCode JSONC config", async () => {
  await withOpenCodeHome(async (home) => {
    process.env.CCR_OPENCODE_TEST_KEY = "configured-opencode-key";
    writeOpenCodeConfig(home, `{
      "provider": {
        "opencode": {
          "options": { "apiKey": "{env:CCR_OPENCODE_TEST_KEY}" },
        },
      },
    }`);

    const candidates = opencodeCandidates();
    assert.ok(candidates.every((candidate) => candidate.importable));
    assert.ok(candidates.every((candidate) => candidate.sourceFile?.endsWith("opencode.jsonc")));
    assert.deepEqual(candidateForProtocol(candidates, "openai_responses").models, ["gpt-5.2"]);

    const result = importOpenCodeProvider(candidateForProtocol(candidates, "openai_chat_completions"), []);
    assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer configured-opencode-key");
  });
});

test("OpenCode local provider imports public free models without a login", async () => {
  await withOpenCodeHome(async (home) => {
    writeOpenCodeModels(home, {
      api: "https://opencode.ai/zen/v1",
      models: {
        "chat-free": {
          cost: { input: 0, output: 0 },
          name: "Chat Free"
        },
        "chat-paid": {
          cost: { input: 1, output: 2 },
          name: "Chat Paid"
        },
        "chat-output-paid": {
          cost: { input: 0, output: 1 },
          name: "Chat Output Paid"
        },
        "chat-cache-paid": {
          cost: { cache_read: 1, input: 0, output: 0 },
          name: "Chat Cache Paid"
        },
        "chat-deprecated-free": {
          cost: { input: 0, output: 0 },
          name: "Chat Deprecated Free",
          status: "deprecated"
        },
        "anthropic-free": {
          cost: { input: 0, output: 0 },
          name: "Anthropic Free",
          provider: { npm: "@ai-sdk/anthropic" }
        }
      },
      name: "OpenCode Zen",
      npm: "@ai-sdk/openai-compatible"
    });

    const candidates = opencodeCandidates();
    const available = candidates.filter((candidate) => candidate.status === "available");
    assert.equal(available.length, 2);
    assert.deepEqual(candidateForProtocol(candidates, "openai_chat_completions").models, ["chat-free"]);
    assert.deepEqual(candidateForProtocol(candidates, "anthropic_messages").models, ["anthropic-free"]);
    assert.ok(available.every((candidate) => candidate.name.startsWith("OpenCode Public")));
    assert.ok(available.every((candidate) => candidate.detail.includes("No login is required")));

    const chatResult = importOpenCodeProvider(candidateForProtocol(candidates, "openai_chat_completions"), []);
    assertPublicFreeTierPlugins(chatResult.providerPlugins);
    assert.equal(chatResult.provider.apiKey, "public");
    assert.deepEqual(chatResult.provider.models, ["chat-free"]);
    assert.equal(chatResult.provider.account, undefined);

    const anthropicResult = importOpenCodeProvider(candidateForProtocol(candidates, "anthropic_messages"), []);
    assertPublicFreeTierPlugins(anthropicResult.providerPlugins);
    assert.equal(anthropicResult.provider.apiKey, "public");
  });
});

test("OpenCode local provider locks malformed credentials instead of importing public models", async () => {
  await withOpenCodeHome(async (home) => {
    writeOpenCodeAuth(home, {
      opencode: {
        type: "api"
      }
    });
    writeOpenCodeModels(home, {
      api: "https://opencode.ai/zen/v1",
      models: {
        "chat-free": {
          cost: { input: 0, output: 0 },
          name: "Chat Free"
        }
      },
      name: "OpenCode Zen",
      npm: "@ai-sdk/openai-compatible"
    });

    const candidates = opencodeCandidates();
    assert.ok(candidates.every((candidate) => candidate.status === "locked"));
    assert.ok(candidates.every((candidate) => !candidate.importable));
    assert.ok(candidates.every((candidate) => candidate.detail.includes("no usable API key")));

    assert.throws(
      () => importOpenCodeProvider(candidateForProtocol(candidates, "openai_chat_completions"), []),
      /OpenCode CLI API key was not found/
    );
  });
});

test("OpenCode local provider preserves nested Zen base URL for Gemini imports", async () => {
  await withOpenCodeHome(async (home) => {
    writeOpenCodeAuth(home, {
      opencode: {
        key: "opencode-zen-key",
        type: "api"
      }
    });
    writeOpenCodeModels(home, {
      api: "https://opencode.ai/zen/v1",
      models: {
        "gemini-current": {
          name: "Gemini Current",
          provider: { npm: "@ai-sdk/google" }
        }
      },
      name: "OpenCode Zen",
      npm: "@ai-sdk/openai-compatible"
    });

    const result = importOpenCodeProvider(candidateForProtocol(opencodeCandidates(), "gemini_generate_content"), []);
    assert.equal(result.provider.baseUrl, "https://opencode.ai/zen/v1");
    assert.equal(result.provider.protocol, "gemini_generate_content");
  });
});

test("OpenCode local provider stays hidden without a login or cached public models", async () => {
  await withOpenCodeHome(async () => {
    const candidates = opencodeCandidates();
    assert.equal(candidates.length, 4);
    assert.ok(candidates.every((candidate) => candidate.status === "missing"));
    assert.ok(candidates.every((candidate) => !candidate.importable));
    assert.ok(candidates.every((candidate) => !candidate.id.startsWith("opencode-go-")));
  });
});

test("OpenCode catalog protocol lookup separates families and protocols", async () => {
  await withOpenCodeHome(async (home) => {
    writeOpenCodeAuth(home, {
      "opencode-go": { key: "opencode-go-key", type: "api" },
      opencode: { key: "opencode-zen-key", type: "api" }
    });
    writeOpenCodeCatalog(home, {
      opencode: {
        api: "https://opencode.ai/zen/v1",
        models: {
          "zen-anthropic": { name: "Zen Anthropic", provider: { npm: "@ai-sdk/anthropic" } },
          "zen-chat": { name: "Zen Chat", provider: { npm: "@ai-sdk/openai-compatible" } },
          "zen-responses": { name: "Zen Responses", provider: { npm: "@ai-sdk/openai" } }
        },
        name: "OpenCode Zen",
        npm: "@ai-sdk/openai-compatible"
      },
      "opencode-go": {
        api: "https://opencode.ai/zen/go/v1",
        models: {
          "go-anthropic": { name: "Go Anthropic", provider: { npm: "@ai-sdk/anthropic" } },
          "go-chat": { name: "Go Chat", provider: { npm: "@ai-sdk/openai-compatible" } },
          "go-responses": { name: "Go Responses", provider: { npm: "@ai-sdk/openai" } }
        },
        name: "OpenCode Go",
        npm: "@ai-sdk/openai-compatible"
      }
    });

    assert.deepEqual(opencodeCatalogProtocolModels("https://opencode.ai/zen/go/v1", ["openai_responses"]), ["go-responses"]);
    assert.deepEqual(opencodeCatalogProtocolModels("https://opencode.ai/zen/go/v1/", ["openai_responses"]), ["go-responses"]);
    assert.deepEqual(opencodeCatalogProtocolModels("https://opencode.ai/zen/go", ["openai_responses"]), ["go-responses"]);
    assert.deepEqual(opencodeCatalogProtocolModels("https://opencode.ai/zen/go/", ["openai_responses"]), ["go-responses"]);
    assert.deepEqual(opencodeCatalogProtocolModels("https://opencode.ai/zen/go/v1", ["anthropic_messages"]), ["go-anthropic"]);
    assert.deepEqual(opencodeCatalogProtocolModels("https://opencode.ai/zen/go/v1", ["openai_chat_completions"]), ["go-chat"]);
    assert.deepEqual(opencodeCatalogProtocolModels("https://opencode.ai/zen/v1", ["openai_responses"]), ["zen-responses"]);
    assert.deepEqual(opencodeCatalogProtocolModels("https://opencode.ai/zen", ["openai_responses"]), ["zen-responses"]);
    assert.deepEqual(opencodeCatalogProtocolModels("https://opencode.ai/zen/v1", ["anthropic_messages"]), ["zen-anthropic"]);
    assert.equal(opencodeCatalogProtocolModels("https://example.test/v1", ["openai_responses"]), undefined);
  });
});

test("OpenCode removes the previously generated local account usage connector", () => {
  const provider = removeOpenCodeProviderAccountConfig({
    account: {
      connectors: [
        {
          message: "Local usage from CCR history. OpenCode does not expose cloud balance through its API.",
          type: "local-estimate",
          windows: [
            { id: "opencode_monthly_spend", label: "CCR monthly spend", unit: "USD", window: "monthly" },
            { id: "opencode_monthly_tokens", label: "CCR monthly tokens", unit: "tokens", window: "monthly" },
            { id: "opencode_monthly_requests", label: "CCR monthly requests", unit: "requests", window: "monthly" }
          ]
        }
      ],
      enabled: true
    },
    api_key: localAgentProviderApiKey,
    models: ["gpt-5.2"],
    name: "OpenCode Zen (Responses)",
    protocol: "openai_responses"
  });
  assert.equal(provider.account, undefined);
});

function candidateForProtocol(candidates, protocol) {
  const candidate = candidates.find((item) => item.protocol === protocol);
  assert.ok(candidate, `Expected OpenCode candidate for ${protocol}`);
  return candidate;
}

function candidateForId(candidates, id) {
  const candidate = candidates.find((item) => item.id === id);
  assert.ok(candidate, `Expected OpenCode candidate ${id}`);
  return candidate;
}

function assertPublicFreeTierPlugins(providerPlugins) {
  assert.equal(providerPlugins.length, 2);
  for (const plugin of providerPlugins) {
    assert.ok(plugin.key.includes(OPENCODE_PUBLIC_FREETIER_PLUGIN_SUFFIX));
    assert.equal(plugin.auth, undefined);
  }
  assert.deepEqual(
    providerPlugins.map((plugin) => plugin.key),
    [
      "ccr-local-agent-__CCR_PROVIDER_NAME_SLUG__-opencode-public-freetier",
      "ccr-local-agent-__CCR_PROVIDER_NAME_SLUG__-opencode-public-freetier-internal"
    ]
  );
  assert.deepEqual(
    providerPlugins.map((plugin) => plugin.providerName),
    ["__CCR_PROVIDER_NAME__", "__CCR_PROVIDER_INTERNAL_NAME__"]
  );
}

async function withOpenCodeHome(run) {
  const environmentNames = [
    "CCR_INTERNAL_HOME_DIR",
    "CCR_OPENCODE_GO_TEST_KEY",
    "CCR_OPENCODE_TEST_KEY",
    "OPENCODE_API_KEY",
    "OPENCODE_GO_API_KEY",
    "OPENCODE_AUTH_CONTENT",
    "OPENCODE_CONFIG",
    "OPENCODE_CONFIG_CONTENT"
  ];
  const previousEnvironment = Object.fromEntries(environmentNames.map((name) => [name, process.env[name]]));
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-opencode-test-"));
  process.env.CCR_INTERNAL_HOME_DIR = home;
  for (const name of environmentNames.slice(1)) {
    delete process.env[name];
  }
  try {
    await run(home);
  } finally {
    for (const name of environmentNames) {
      restoreEnv(name, previousEnvironment[name]);
    }
    rmSync(home, { force: true, recursive: true });
  }
}

function writeOpenCodeAuth(home, auth) {
  const directory = path.join(home, ".local", "share", "opencode");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "auth.json"), JSON.stringify(auth, null, 2));
}

function writeOpenCodeModels(home, provider) {
  writeOpenCodeCatalog(home, { opencode: provider });
}

function writeOpenCodeCatalog(home, catalog) {
  const directory = path.join(home, ".cache", "opencode");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "models.json"), JSON.stringify(catalog, null, 2));
}

function writeOpenCodeConfig(home, content) {
  const directory = path.join(home, ".config", "opencode");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "opencode.jsonc"), content);
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
