import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newApiKeyUsageAccountConfig } from "../../packages/core/src/providers/new-api.ts";
import { geminiProviderPreset } from "../../packages/core/src/providers/presets/gemini/index.ts";
import { moonshotGlobalProviderPreset } from "../../packages/core/src/providers/presets/moonshot/index.ts";
import { ProvidersView } from "../../packages/ui/src/pages/home/components/providers.tsx";
import {
  applyProviderProbeResult,
  createProviderConfigFromDeepLink,
  createProviderDraft,
  createProviderInstallLinkFromDraft,
  providerCapabilitiesForProtocols,
  providerCapabilityBaseUrlForProtocol,
  providerDisplayIcon,
  providerAccountConnectorsTextWithNewApiUserBalanceTemplate,
  providerGlobalBaseUrlForProbe,
  providerPresetIconUrls,
  providerProtocolOptions,
  providerProbeCandidates,
  providerSelectableProtocolsFromProbe,
  setProviderPresets
} from "../../packages/ui/src/pages/home/shared/index.tsx";
import { installBrowserGlobals } from "./fixtures.ts";

installBrowserGlobals();

test("Gemini preset keeps full protocol probing candidates", () => {
  setProviderPresets([geminiProviderPreset]);
  const draft = {
    ...createProviderDraft([]),
    presetId: "gemini"
  };

  const candidates = providerProbeCandidates(draft);

  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].protocols, providerProtocolOptions.map((option) => option.value));
  assert.deepEqual(candidates[0].declaredProtocols, ["gemini_generate_content", "gemini_interactions"]);
});

test("provider probe result drops unavailable selected protocols", () => {
  const draft = {
    ...createProviderDraft([]),
    baseUrl: "https://generativelanguage.googleapis.com",
    protocol: "gemini_generate_content",
    selectedProtocols: providerProtocolOptions.map((option) => option.value)
  };

  const next = applyProviderProbeResult(draft, {
    capabilities: [],
    detectedProtocol: "gemini_generate_content",
    models: [],
    normalizedBaseUrl: draft.baseUrl,
    protocols: providerProtocolOptions.map((option) => ({
      endpoint: draft.baseUrl,
      message: "HTTP 404",
      protocol: option.value,
      status: 404,
      supported: false
    }))
  });

  assert.deepEqual(next.selectedProtocols, []);
});

test("provider probe result keeps only supported selected protocols", () => {
  const draft = {
    ...createProviderDraft([]),
    baseUrl: "https://generativelanguage.googleapis.com",
    protocol: "gemini_generate_content",
    selectedProtocols: providerProtocolOptions.map((option) => option.value)
  };

  const next = applyProviderProbeResult(draft, {
    capabilities: [],
    detectedProtocol: "gemini_generate_content",
    models: [],
    normalizedBaseUrl: draft.baseUrl,
    protocols: providerProtocolOptions.map((option) => ({
      endpoint: draft.baseUrl,
      message: option.value === "gemini_generate_content" ? "HTTP 400: contents is not specified" : "HTTP 404",
      protocol: option.value,
      status: option.value === "gemini_generate_content" ? 400 : 404,
      supported: option.value === "gemini_generate_content"
    }))
  });

  assert.deepEqual(next.selectedProtocols, ["gemini_generate_content"]);
});

test("provider probe result applies detected New API key quota account connector", () => {
  const draft = {
    ...createProviderDraft([]),
    accountEnabled: false,
    baseUrl: "https://gateway.example/v1",
    protocol: "openai_chat_completions"
  };
  const account = newApiKeyUsageAccountConfig("https://gateway.example/v1");

  const next = applyProviderProbeResult(draft, {
    account,
    detectedProvider: "new-api",
    detectedProtocol: "openai_chat_completions",
    models: [],
    normalizedBaseUrl: draft.baseUrl,
    protocols: [
      {
        detectedProvider: "new-api",
        endpoint: "https://gateway.example/v1/chat/completions",
        message: "HTTP 401",
        protocol: "openai_chat_completions",
        status: 401,
        supported: true
      }
    ]
  });

  assert.equal(next.accountEnabled, true);
  assert.equal(next.accountMode, "raw");
  const connectors = JSON.parse(next.accountConnectorsText);
  assert.equal(connectors.length, 1);
  assert.equal(connectors[0].endpoint, "https://gateway.example/api/usage/token/");
  assert.equal(connectors[0].parser, "new-api-key-usage");
  assert.equal(connectors[0].mapping.meters[0].id, "new_api_key_quota");
  assert.equal(connectors[0].mapping.meters[0].kind, "quota");
  assert.equal(connectors[0].mapping.meters[0].remaining, "$.data.total_available");
});

test("provider probe keeps anthropic prefix on the protocol capability", () => {
  const draft = {
    ...createProviderDraft([]),
    baseUrl: "https://gateway.example",
    protocol: "anthropic_messages",
    selectedProtocols: ["anthropic_messages"]
  };
  const anthropicCapability = {
    baseUrl: "https://gateway.example/anthropic",
    endpoint: "https://gateway.example/anthropic/v1/messages",
    source: "detected" as const,
    type: "anthropic_messages" as const
  };
  const probe = {
    capabilities: [anthropicCapability],
    detectedProtocol: "anthropic_messages" as const,
    models: [],
    normalizedBaseUrl: "https://gateway.example/anthropic",
    protocols: [
      {
        ...anthropicCapability,
        message: "HTTP 400: model is required",
        status: 400,
        supported: true
      }
    ]
  };

  const next = applyProviderProbeResult(draft, probe);

  assert.equal(next.baseUrl, "https://gateway.example");
  assert.equal(providerGlobalBaseUrlForProbe(draft.baseUrl, probe, ["anthropic_messages"]), "https://gateway.example");
  assert.equal(
    providerCapabilityBaseUrlForProtocol(draft.baseUrl, "anthropic_messages", probe),
    "https://gateway.example/anthropic"
  );
  assert.deepEqual(providerCapabilitiesForProtocols(draft.baseUrl, ["anthropic_messages"], probe), [anthropicCapability]);
});

test("provider capabilities prefer detected anthropic endpoint over preset root", () => {
  const probe = {
    capabilities: [
      {
        baseUrl: "https://gateway.example/anthropic",
        endpoint: "https://gateway.example/anthropic/v1/messages",
        source: "detected" as const,
        type: "anthropic_messages" as const
      }
    ],
    detectedProtocol: "anthropic_messages" as const,
    models: [],
    normalizedBaseUrl: "https://gateway.example/anthropic",
    protocols: []
  };

  const capabilities = providerCapabilitiesForProtocols(
    "https://gateway.example",
    ["anthropic_messages", "openai_chat_completions"],
    probe,
    [
      { baseUrl: "https://gateway.example", source: "preset" as const, type: "anthropic_messages" as const },
      { baseUrl: "https://gateway.example/v1", source: "preset" as const, type: "openai_chat_completions" as const }
    ]
  );

  assert.deepEqual(capabilities.map((capability) => [capability.type, capability.baseUrl]), [
    ["openai_chat_completions", "https://gateway.example/v1"],
    ["anthropic_messages", "https://gateway.example/anthropic"]
  ]);
  assert.equal(
    providerGlobalBaseUrlForProbe("https://gateway.example", probe, ["anthropic_messages", "openai_chat_completions"]),
    "https://gateway.example"
  );
});

test("provider global URL keeps Kimi Global OpenAI v1 when anthropic probe is detected", () => {
  const probe = {
    capabilities: [
      {
        baseUrl: "https://api.moonshot.ai/anthropic",
        endpoint: "https://api.moonshot.ai/anthropic/v1/messages",
        source: "detected" as const,
        type: "anthropic_messages" as const
      }
    ],
    detectedProtocol: "anthropic_messages" as const,
    models: [],
    normalizedBaseUrl: "https://api.moonshot.ai/anthropic",
    protocols: []
  };

  assert.equal(
    providerGlobalBaseUrlForProbe("https://api.moonshot.ai/v1", probe, ["openai_chat_completions"]),
    "https://api.moonshot.ai/v1"
  );
  assert.deepEqual(
    providerCapabilitiesForProtocols("https://api.moonshot.ai/v1", ["openai_chat_completions"], probe)
      .map((capability) => [capability.type, capability.baseUrl]),
    [["openai_chat_completions", "https://api.moonshot.ai/v1"]]
  );
});

test("provider global URL always follows the typed endpoint instead of probe endpoint", () => {
  const probe = {
    capabilities: [
      {
        baseUrl: "https://gateway.example/v1",
        endpoint: "https://gateway.example/v1/chat/completions",
        source: "detected" as const,
        type: "openai_chat_completions" as const
      },
      {
        baseUrl: "https://gateway.example/anthropic",
        endpoint: "https://gateway.example/anthropic/v1/messages",
        source: "detected" as const,
        type: "anthropic_messages" as const
      }
    ],
    detectedProtocol: "openai_chat_completions" as const,
    models: [],
    normalizedBaseUrl: "https://gateway.example/v1",
    protocols: []
  };

  assert.equal(
    providerGlobalBaseUrlForProbe("https://gateway.example", probe, ["openai_chat_completions", "anthropic_messages"]),
    "https://gateway.example"
  );
});

test("Kimi Global preset keeps OpenAI Chat when probe detects anthropic fallback", () => {
  setProviderPresets([moonshotGlobalProviderPreset]);
  const draft = {
    ...createProviderDraft([]),
    baseUrl: "https://api.moonshot.ai/v1",
    presetId: "moonshot-global",
    protocol: "openai_chat_completions",
    selectedProtocols: ["openai_chat_completions"]
  };
  const probe = {
    capabilities: [
      {
        baseUrl: "https://api.moonshot.ai/anthropic",
        endpoint: "https://api.moonshot.ai/anthropic/v1/messages",
        source: "detected" as const,
        type: "anthropic_messages" as const
      },
      {
        baseUrl: "https://api.moonshot.ai/v1",
        source: "preset" as const,
        type: "openai_chat_completions" as const
      }
    ],
    detectedProtocol: "anthropic_messages" as const,
    models: [],
    normalizedBaseUrl: "https://api.moonshot.ai/anthropic",
    protocols: [
      {
        endpoint: "https://api.moonshot.ai/anthropic/v1/messages",
        message: "HTTP 400: model is required",
        protocol: "anthropic_messages" as const,
        status: 400,
        supported: true
      }
    ]
  };

  const next = applyProviderProbeResult(draft, probe);

  assert.equal(next.baseUrl, "https://api.moonshot.ai/v1");
  assert.equal(next.protocol, "openai_chat_completions");
  assert.deepEqual(next.selectedProtocols, ["openai_chat_completions", "anthropic_messages"]);
  assert.deepEqual(providerSelectableProtocolsFromProbe(probe), ["openai_chat_completions", "anthropic_messages"]);

  const installLink = createProviderInstallLinkFromDraft({
    ...next,
    modelsText: "kimi-k2.7-code",
    name: "Kimi API (Global)"
  }, probe);
  const payload = providerInstallLinkPayload(installLink);
  assert.equal(payload.protocol, "openai_chat_completions");
  assert.equal(payload.baseUrl, "https://api.moonshot.ai/v1");
});

test("Kimi Global deep link explicit OpenAI protocol wins over anthropic probe", () => {
  const probe = {
    capabilities: [
      {
        baseUrl: "https://api.moonshot.ai/anthropic",
        endpoint: "https://api.moonshot.ai/anthropic/v1/messages",
        source: "detected" as const,
        type: "anthropic_messages" as const
      }
    ],
    detectedProtocol: "anthropic_messages" as const,
    models: [],
    normalizedBaseUrl: "https://api.moonshot.ai/anthropic",
    protocols: []
  };

  const provider = createProviderConfigFromDeepLink({
    baseUrl: "https://api.moonshot.ai/v1",
    models: ["kimi-k2.7-code"],
    name: "Kimi API (Global)",
    protocol: "openai_chat_completions"
  }, [], probe);

  assert.equal(provider.type, "openai_chat_completions");
  assert.equal(provider.api_base_url, "https://api.moonshot.ai/v1");
  assert.deepEqual(provider.capabilities?.map((capability) => [capability.type, capability.baseUrl]), [
    ["openai_chat_completions", "https://api.moonshot.ai/v1"]
  ]);
});

test("provider deep link config saves anthropic probe prefix as capability URL", () => {
  const probe = {
    capabilities: [
      {
        baseUrl: "https://gateway.example/anthropic",
        endpoint: "https://gateway.example/anthropic/v1/messages",
        source: "detected" as const,
        type: "anthropic_messages" as const
      }
    ],
    detectedProtocol: "anthropic_messages" as const,
    models: [],
    normalizedBaseUrl: "https://gateway.example/anthropic",
    protocols: []
  };

  const provider = createProviderConfigFromDeepLink({
    baseUrl: "https://gateway.example",
    models: ["claude-test"],
    name: "Gateway",
    protocol: "anthropic_messages"
  }, [], probe);

  assert.equal(provider.api_base_url, "https://gateway.example");
  assert.deepEqual(provider.capabilities?.map((capability) => [capability.type, capability.baseUrl]), [
    ["anthropic_messages", "https://gateway.example/anthropic"]
  ]);
});

test("provider display icon prefers custom icons and falls back to preset icons", () => {
  setProviderPresets([geminiProviderPreset]);

  assert.equal(
    providerDisplayIcon({
      api_base_url: "https://custom.example/v1",
      icon: "https://custom.example/icon.png",
      models: [],
      name: "Custom Provider",
      type: "openai_chat_completions"
    }),
    "https://custom.example/icon.png"
  );
  assert.equal(
    providerDisplayIcon({
      api_base_url: "https://generativelanguage.googleapis.com",
      models: [],
      name: "Google Gemini",
      type: "gemini_generate_content"
    }),
    providerPresetIconUrls.gemini
  );
});

test("ProvidersView renders configured provider icons in the list", () => {
  const iconUrl = "https://custom.example/icon.png";
  const html = renderToStaticMarkup(
    React.createElement(ProvidersView, {
      accountSnapshots: [],
      addProvider: () => undefined,
      editProvider: () => undefined,
      notify: () => undefined,
      providers: [
        {
          index: 0,
          provider: {
            api_base_url: "https://custom.example/v1",
            icon: iconUrl,
            models: ["custom-model"],
            name: "Custom Provider",
            type: "openai_chat_completions"
          }
        }
      ],
      removeProvider: () => undefined
    })
  );

  assert.match(html, /Custom Provider/);
  assert.match(html, /src="https:\/\/custom\.example\/icon\.png"/);
});

test("New API user balance template adds configurable user self connector", () => {
  const account = newApiKeyUsageAccountConfig("https://gateway.example/v1");
  const text = providerAccountConnectorsTextWithNewApiUserBalanceTemplate(
    JSON.stringify(account.connectors ?? [], null, 2),
    "https://gateway.example/v1",
    "42"
  );
  const connectors = JSON.parse(text);

  assert.equal(connectors.length, 2);
  assert.equal(connectors[0].parser, "new-api-key-usage");
  assert.equal(connectors[1].endpoint, "https://gateway.example/api/user/self");
  assert.equal(connectors[1].parser, "new-api-user-self");
  assert.equal(connectors[1].headers.Authorization, "Bearer <new-api-access-token>");
  assert.equal(connectors[1].headers["New-Api-User"], "42");
  assert.equal(connectors[1].mapping.meters[0].id, "new_api_user_balance");
});

function providerInstallLinkPayload(link) {
  const url = new URL(link);
  const payload = url.searchParams.get("payload");
  assert.ok(payload);
  const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, "=").replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
