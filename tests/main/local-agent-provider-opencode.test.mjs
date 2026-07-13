import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  importOpenCodeProvider,
  opencodeCandidates,
  removeOpenCodeProviderAccountConfig
} from "../../packages/core/src/agents/local-providers/opencode.ts";
import { localAgentProviderApiKey } from "../../packages/core/src/agents/local-providers/shared.ts";

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
    assert.equal(chatResult.providerPlugins[0].auth.headers.authorization, "Bearer public");
    assert.deepEqual(chatResult.provider.models, ["chat-free"]);
    assert.equal(chatResult.provider.account, undefined);

    const anthropicResult = importOpenCodeProvider(candidateForProtocol(candidates, "anthropic_messages"), []);
    assert.equal(anthropicResult.providerPlugins[0].auth.headers["x-api-key"], "public");
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
    assert.ok(candidates.every((candidate) => candidate.status === "missing"));
    assert.ok(candidates.every((candidate) => !candidate.importable));
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

async function withOpenCodeHome(run) {
  const environmentNames = [
    "CCR_INTERNAL_HOME_DIR",
    "CCR_OPENCODE_TEST_KEY",
    "OPENCODE_API_KEY",
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
  const directory = path.join(home, ".cache", "opencode");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "models.json"), JSON.stringify({ opencode: provider }, null, 2));
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
