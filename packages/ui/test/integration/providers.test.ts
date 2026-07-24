import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newApiKeyUsageAccountConfig } from "@ccr/core/providers/new-api.ts";
import { geminiProviderPreset } from "@ccr/core/providers/presets/gemini/index.ts";
import { moonshotGlobalProviderPreset } from "@ccr/core/providers/presets/moonshot/index.ts";
import { qiniuAiProviderPreset } from "@ccr/core/providers/presets/qiniu-ai/index.ts";
import { AddProviderDialog, AddProviderForm, ProvidersView, uniqueProviderProbeProtocolRows } from "@ccr/ui/pages/home/components/providers.tsx";
import {
  applyProviderProbeResult,
  createProviderConfigFromDeepLink,
  createProviderCredentialDraft,
  createProviderDraft,
  createProviderDraftFromProvider,
  createProviderInstallLinkFromDraft,
  customProviderPresetId,
  FieldGroup,
  localAgentProviderIconUrls,
  providerCapabilitiesForProtocols,
  providerCapabilitiesForSave,
  providerCapabilityBaseUrlForProtocol,
  providerConnectivityApiKeyFromDraft,
  providerDisplayIcon,
  providerAccountConnectorsTextWithNewApiUserBalanceTemplate,
  providerGlobalBaseUrlForProbe,
  providerPresetIconUrls,
  providerProtocolOptions,
  providerProbeCandidates,
  providerSelectableProtocolsFromProbe,
  setProviderPresets
} from "@ccr/ui/pages/home/shared/index.tsx";
import { installBrowserGlobals } from "../fixtures/index.ts";

installBrowserGlobals();

test("composite field groups do not label their nested controls", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      FieldGroup,
      { label: "Models" },
      React.createElement("input", { "aria-label": "Search models" }),
      React.createElement("button", { type: "button" }, "Model settings")
    )
  );

  assert.match(html, /^<div/);
  assert.doesNotMatch(html, /^<label/);
  assert.match(html, /Search models/);
  assert.match(html, /Model settings/);
});

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

test("multi-endpoint presets probe only each endpoint's declared protocols", () => {
  setProviderPresets([qiniuAiProviderPreset]);
  const draft = {
    ...createProviderDraft([]),
    presetId: "qiniu-ai"
  };

  const candidates = providerProbeCandidates(draft);

  assert.equal(candidates.length, qiniuAiProviderPreset.endpoints.length);
  assert.deepEqual(
    candidates.map((candidate) => [candidate.baseUrl, candidate.protocols]),
    qiniuAiProviderPreset.endpoints.map((endpoint) => [endpoint.baseUrl, endpoint.protocols])
  );
});

test("custom providers probe generic image and video generation protocols", () => {
  const draft = {
    ...createProviderDraft([]),
    baseUrl: "https://gateway.example/v1"
  };

  const candidates = providerProbeCandidates(draft);

  assert.deepEqual(candidates[0].protocols.slice(-2), [
    "openai_image_generations",
    "openai_video_generations"
  ]);
});

test("provider save drops capabilities from the previous base URL", () => {
  const current = [{
    baseUrl: "https://new.example/v1",
    source: "detected" as const,
    type: "openai_chat_completions" as const
  }];
  const previous = [
    {
      baseUrl: "https://old.example/v1",
      source: "detected" as const,
      type: "openai_chat_completions" as const
    },
    {
      baseUrl: "https://old-media.example/v1",
      source: "detected" as const,
      type: "openai_image_generations" as const
    }
  ];

  assert.deepEqual(
    providerCapabilitiesForSave(current, previous, "https://old.example/v1", "https://new.example/v1"),
    current
  );
});

test("provider save keeps explicit secondary media origins when the base URL is unchanged", () => {
  const current = [{
    baseUrl: "https://chat.example/v1",
    source: "detected" as const,
    type: "openai_chat_completions" as const
  }];
  const media = [{
    baseUrl: "https://media.example/v1",
    source: "preset" as const,
    type: "openai_image_generations" as const
  }];

  assert.deepEqual(
    providerCapabilitiesForSave(current, media, "https://chat.example/v1/", "https://chat.example/v1"),
    [...current, ...media]
  );
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

test("provider draft restores manual protocol detection mode", () => {
  const draft = createProviderDraftFromProvider({
    api_base_url: "https://local.example/v1",
    capabilities: [{
      baseUrl: "https://local.example/v1",
      source: "preset",
      type: "openai_chat_completions"
    }],
    models: ["custom-model"],
    name: "Local OpenAI",
    protocolDetectionMode: "manual",
    type: "openai_chat_completions"
  });

  assert.equal(draft.protocolDetectionMode, "manual");
  assert.deepEqual(draft.selectedProtocols, ["openai_chat_completions"]);
});

test("edit provider dialog keeps advanced settings collapsed by default", () => {
  const draft = {
    ...createProviderDraft([]),
    baseUrl: "https://local.example/v1",
    modelsText: "custom-model",
    name: "Local OpenAI",
    protocolDetectionMode: "manual" as const,
    selectedProtocols: ["openai_chat_completions" as const]
  };
  const html = renderToStaticMarkup(
    React.createElement(AddProviderDialog, {
      canSubmit: true,
      draft,
      error: "",
      mode: "edit",
      onChange: () => undefined,
      onClose: () => undefined,
      onSubmit: async () => true,
      probeLoading: false,
      providers: []
    })
  );

  assert.ok(html.indexOf("Credential pool") < html.indexOf("Advanced settings"));
  assert.match(html, /lucide-chevron-right[\s\S]*?Advanced settings/);
  assert.match(html, /<button[^>]*aria-expanded="false"[^>]*>[\s\S]*?lucide-chevron-right[\s\S]*?Advanced settings/);
  assert.doesNotMatch(html, /Detection mode/);
  assert.doesNotMatch(html, /Auto detect protocols/);
  assert.doesNotMatch(html, /Auto detect protocols info/);
  assert.doesNotMatch(html, /OpenAI Chat/);
  assert.doesNotMatch(html, /Selected/);
  assert.doesNotMatch(html, /No protocol detection yet/);
});

test("edit provider dialog hides API endpoint input for preset providers", () => {
  setProviderPresets([geminiProviderPreset]);
  const endpoint = geminiProviderPreset.endpoints[0]?.baseUrl ?? "";
  const draft = {
    ...createProviderDraft([]),
    apiKey: "sk-test",
    baseUrl: endpoint,
    modelsText: "gemini-1.5-pro",
    name: "Google Gemini",
    presetId: geminiProviderPreset.id
  };
  const html = renderToStaticMarkup(
    React.createElement(AddProviderDialog, {
      canSubmit: true,
      draft,
      error: "",
      mode: "edit",
      onChange: () => undefined,
      onClose: () => undefined,
      onSubmit: async () => true,
      probeLoading: false,
      providers: []
    })
  );

  assert.match(html, /Google Gemini/);
  assert.ok(endpoint);
  assert.equal((html.match(new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length, 2);
  assert.doesNotMatch(html, /<label[^>]*>API endpoint<\/label>/);
});

test("edit provider dialog hides the setup progress overview", () => {
  const draft = {
    ...createProviderDraft([]),
    apiKey: "sk-test",
    baseUrl: "https://api.example/v1",
    modelsText: "model-a\nmodel-b",
    name: "Example",
    presetId: customProviderPresetId
  };
  const html = renderToStaticMarkup(
    React.createElement(AddProviderDialog, {
      canSubmit: true,
      draft,
      error: "",
      mode: "edit",
      onChange: () => undefined,
      onClose: () => undefined,
      onSubmit: async () => true,
      probeLoading: false,
      providers: []
    })
  );

  assert.match(html, /Edit Provider/);
  assert.match(html, /Choose provider/);
  assert.match(html, /Add credentials/);
  assert.match(html, /Pick models/);
  assert.match(html, /Verify connection/);
  assert.match(html, />Save</);
  assert.doesNotMatch(html, /aria-current="step"/);
  assert.doesNotMatch(html, />Done</);
  assert.doesNotMatch(html, />In progress</);
  assert.doesNotMatch(html, />Pending</);
});

test("AddProviderDialog progressively reveals provider setup steps", () => {
  const draft = {
    ...createProviderDraft([]),
    apiKey: "sk-test",
    baseUrl: "https://api.example/v1",
    modelsText: "test-model",
    name: "Example",
    presetId: customProviderPresetId
  };
  const html = renderToStaticMarkup(
    React.createElement(AddProviderDialog, {
      canSubmit: true,
      draft,
      error: "",
      mode: "add",
      onChange: () => undefined,
      onCheck: async () => ({ failed: [], passed: [], results: [] }),
      onClose: () => undefined,
      onSubmit: async () => true,
      probe: {
        capabilities: [],
        detectedProtocol: "openai_chat_completions" as const,
        models: [],
        normalizedBaseUrl: draft.baseUrl,
        protocols: [{
          endpoint: draft.baseUrl,
          protocol: "openai_chat_completions" as const,
          status: 200,
          supported: true
        }]
      },
      probeLoading: false,
      providers: []
    })
  );

  assert.match(html, /Choose provider/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /h-0\.5 bg-border/);
  assert.match(html, /aria-valuenow="1"/);
  assert.match(html, /items-center justify-center/);
  assert.match(html, /sm:h-\[min\(760px,calc\(100dvh-3rem\)\)\]/);
  assert.match(html, /sm:w-\[min\(1040px,calc\(100vw-3rem\)\)\]/);
  assert.doesNotMatch(html, /max-w-\[760px\]/);
  assert.doesNotMatch(html, /max-w-\[1040px\]/);
  assert.match(html, />1 \/ 4</);
  assert.match(html, />Next</);
  assert.doesNotMatch(html, />Cancel<\/button>/);
  assert.doesNotMatch(html, /Add credentials/);
  assert.doesNotMatch(html, /Select models/);
  assert.doesNotMatch(html, /Verify connection/);
  assert.doesNotMatch(html, /type="password"/);
  assert.doesNotMatch(html, /placeholder="Model name"/);
  assert.doesNotMatch(html, /Protocols detected/);
  assert.doesNotMatch(html, /Not verified yet/);
});

test("AddProviderDialog keeps Next available while provider probing runs", () => {
  const draft = {
    ...createProviderDraft([]),
    baseUrl: "https://api.example/v1",
    name: "Example",
    presetId: customProviderPresetId
  };
  const html = renderToStaticMarkup(
    React.createElement(AddProviderDialog, {
      canSubmit: false,
      draft,
      error: "",
      mode: "add",
      onChange: () => undefined,
      onClose: () => undefined,
      onSubmit: async () => true,
      probeLoading: true,
      providers: []
    })
  );
  const nextButton = html.match(/<button[^>]*>Next<svg/)?.[0] ?? "";

  assert.ok(nextButton);
  assert.doesNotMatch(nextButton, /\sdisabled(?:=|\s|>)/);
});

test("AddProviderForm renders API key visibility toggle", () => {
  const draft = {
    ...createProviderDraft([]),
    apiKey: "sk-test",
    name: "Example",
    presetId: customProviderPresetId
  };
  const html = renderToStaticMarkup(
    React.createElement(AddProviderForm, {
      activeStep: "credentials",
      draft,
      error: "",
      mode: "add",
      onChange: () => undefined,
      probeLoading: false,
      providers: []
    })
  );

  assert.match(html, /type="password"/);
  assert.match(html, /aria-label="Show API key"/);
  assert.match(html, /aria-pressed="false"/);
});

test("AddProviderForm shows preset endpoint under the selected provider name", () => {
  setProviderPresets([geminiProviderPreset]);
  const endpoint = geminiProviderPreset.endpoints[0]?.baseUrl ?? "";
  const draft = {
    ...createProviderDraft([]),
    baseUrl: endpoint,
    name: "Google Gemini",
    presetId: geminiProviderPreset.id
  };
  const html = renderToStaticMarkup(
    React.createElement(AddProviderForm, {
      activeStep: "provider",
      draft,
      error: "",
      mode: "add",
      onChange: () => undefined,
      probeLoading: false,
      providers: []
    })
  );

  assert.match(html, /Google Gemini/);
  assert.ok(endpoint);
  assert.equal((html.match(new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length, 2);
});

test("AddProviderForm lets users choose credential pool in credentials step", () => {
  const draft = {
    ...createProviderDraft([]),
    credentialMode: "pool" as const,
    credentials: [{
      ...createProviderCredentialDraft(0),
      apiKey: "sk-pool",
      name: "Primary pool key"
    }],
    name: "Example",
    presetId: customProviderPresetId
  };
  const html = renderToStaticMarkup(
    React.createElement(AddProviderForm, {
      activeStep: "credentials",
      draft,
      error: "",
      mode: "add",
      onChange: () => undefined,
      probeLoading: false,
      providers: []
    })
  );

  assert.match(html, /role="tablist"/);
  assert.match(html, /API key/);
  assert.match(html, /Credential pool/);
  assert.match(html, /Pool keys/);
  assert.match(html, /Primary pool key/);
  assert.match(html, /aria-selected="true"[^>]*>[\s\S]*Credential pool/);
  assert.match(html, /data-state="active"[^>]*>[\s\S]*Credential pool/);
  assert.match(html, /aria-selected="true" class="[^"]*border-primary\/65 bg-primary\/10 text-primary/);
  assert.match(html, /aria-selected="true" class="[^"]*flex-col[^"]*items-start[^"]*whitespace-normal/);
  assert.doesNotMatch(html, /bottom-2 left-0 top-2 w-0\.5/);
  assert.doesNotMatch(html, /Show credential settings/);
});

test("AddProviderForm stacks connection statuses with protocol detection guidance", () => {
  const draft = {
    ...createProviderDraft([]),
    apiKey: "sk-test",
    baseUrl: "https://api.example/v1",
    modelsText: "test-model",
    name: "Example",
    presetId: customProviderPresetId
  };
  const html = renderToStaticMarkup(
    React.createElement(AddProviderForm, {
      activeStep: "verify",
      draft,
      error: "",
      mode: "add",
      onChange: () => undefined,
      onCheck: async () => undefined,
      probe: {
        capabilities: [],
        detectedProtocol: "openai_chat_completions" as const,
        models: ["test-model"],
        normalizedBaseUrl: draft.baseUrl,
        protocols: [{
          endpoint: draft.baseUrl,
          protocol: "openai_chat_completions" as const,
          status: 200,
          supported: true
        }]
      },
      probeLoading: false,
      providers: []
    })
  );

  assert.match(html, /Protocols detected/);
  assert.match(html, /Compatible API protocols were found automatically\. You can turn off auto detection in Advanced settings and select protocols manually\./);
  assert.match(html, /Not verified yet/);
  assert.match(html, /Optional\. Check Connection sends a real model request and may consume provider credits\./);
  assert.doesNotMatch(html, /Run Check Connection before relying on this provider\./);
  assert.match(html, /Not verified yet[\s\S]*<button[^>]*>[\s\S]*Check Connection/);
  assert.ok(html.indexOf("Protocols detected") < html.indexOf("Not verified yet"));
  assert.match(html, /grid grid-cols-1 gap-2/);
  assert.doesNotMatch(html, /grid grid-cols-1 gap-2 sm:grid-cols-2/);
  assert.doesNotMatch(html, /Protocol detection checks compatibility; connection verification confirms a real model request succeeds\./);
});

test("AddProviderForm renders a two-column model picker", () => {
  const draft = {
    ...createProviderDraft([]),
    modelDisplayNames: {
      "model-a": "Model A"
    },
    modelsText: "custom-model",
    name: "Example",
    presetId: customProviderPresetId,
    selectedModels: ["model-a"]
  };
  const html = renderToStaticMarkup(
    React.createElement(AddProviderForm, {
      activeStep: "models",
      draft,
      error: "",
      mode: "add",
      onChange: () => undefined,
      probe: {
        capabilities: [],
        detectedProtocol: "openai_chat_completions" as const,
        models: ["model-a", "model-b"],
        normalizedBaseUrl: "https://api.example/v1",
        protocols: []
      },
      probeLoading: false,
      providers: []
    })
  );

  assert.match(html, /Pick models/);
  assert.match(html, /Provider models/);
  assert.match(html, /Added models/);
  assert.match(html, /Search provider models/);
  assert.match(html, /Search added models/);
  assert.match(html, /Custom model/);
  assert.match(html, /Model A/);
  assert.match(html, /model-b/);
  assert.match(html, /custom-model/);
  assert.match(html, /overflow-y-auto/);
  assert.doesNotMatch(html, /overscroll-contain/);
  assert.doesNotMatch(html, /placeholder="Custom model"/);
  assert.doesNotMatch(html, /Select models/);
});

test("AddProviderForm keeps edit model lists scrollable without blocking dialog scroll chaining", () => {
  const draft = {
    ...createProviderDraft([]),
    apiKey: "sk-test",
    baseUrl: "https://api.example/v1",
    modelsText: "model-a\nmodel-b",
    name: "Example",
    presetId: customProviderPresetId
  };
  const html = renderToStaticMarkup(
    React.createElement(AddProviderForm, {
      draft,
      error: "",
      mode: "edit",
      onChange: () => undefined,
      probe: {
        capabilities: [],
        detectedProtocol: "openai_chat_completions" as const,
        models: ["model-a", "model-b", "model-c"],
        normalizedBaseUrl: "https://api.example/v1",
        protocols: []
      },
      probeLoading: false,
      providers: []
    })
  );

  assert.match(html, /Pick models/);
  assert.match(html, /Provider models/);
  assert.match(html, /Added models/);
  assert.match(html, /overflow-y-auto/);
  assert.match(html, /lg:h-\[min\(500px,calc\(100dvh-300px\)\)\]/);
  assert.doesNotMatch(html, /overscroll-contain/);
});

test("AddProviderForm shows skeleton rows while provider models load", () => {
  const draft = {
    ...createProviderDraft([]),
    apiKey: "sk-test",
    baseUrl: "https://api.example/v1",
    name: "Example",
    presetId: customProviderPresetId
  };
  const html = renderToStaticMarkup(
    React.createElement(AddProviderForm, {
      activeStep: "models",
      draft,
      error: "",
      mode: "add",
      onChange: () => undefined,
      probeLoading: true,
      providers: []
    })
  );

  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Loading provider models/);
  assert.match(html, /provider-skeleton-shimmer/);
  assert.doesNotMatch(html, /Custom model/);
  assert.doesNotMatch(html, /No models added/);
  assert.doesNotMatch(html, /No provider models/);
});

test("provider connectivity API key follows selected credential mode", () => {
  const draft = {
    ...createProviderDraft([]),
    apiKey: "sk-single",
    credentials: [{
      ...createProviderCredentialDraft(0),
      apiKey: "sk-pool",
      name: "Pool key"
    }]
  };

  assert.equal(providerConnectivityApiKeyFromDraft(draft), "sk-single");
  assert.equal(providerConnectivityApiKeyFromDraft({ ...draft, credentialMode: "pool" }), "sk-pool");
});

test("provider probe keeps catalog model defaults separate from user overrides", () => {
  const draft = {
    ...createProviderDraft([]),
    baseUrl: "https://api.example.com/v1",
    modelMetadata: {
      "model-a": { contextWindow: 64000 }
    }
  };

  const next = applyProviderProbeResult(draft, {
    catalogModelMetadata: {
      "model-a": {
        capabilities: { imageInput: true },
        contextWindow: 128000,
        pricing: { inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 8 }
      }
    },
    models: [],
    normalizedBaseUrl: draft.baseUrl,
    protocols: []
  });

  assert.equal(next.modelMetadata?.["model-a"]?.contextWindow, 64000);
  assert.equal(next.modelMetadata?.["model-a"]?.pricing, undefined);
  assert.equal(next.catalogModelMetadata?.["model-a"]?.contextWindow, 128000);
  assert.equal(next.catalogModelMetadata?.["model-a"]?.capabilities?.imageInput, true);
});

test("provider protocol details keep failed endpoint rows unavailable", () => {
  const rows = uniqueProviderProbeProtocolRows([
    {
      baseUrl: "https://api.example.com",
      endpoint: "https://api.example.com/chat/completions",
      message: "HTTP 404",
      protocol: "openai_chat_completions" as const,
      status: 404,
      supported: false
    },
    {
      baseUrl: "https://api.example.com/v1",
      endpoint: "https://api.example.com/v1/chat/completions",
      message: "HTTP 400: model is required",
      protocol: "openai_chat_completions" as const,
      status: 400,
      supported: true
    }
  ]);

  assert.deepEqual(rows.map((item) => item.endpoint), [
    "https://api.example.com/chat/completions",
    "https://api.example.com/v1/chat/completions"
  ]);
  assert.deepEqual(rows.map((item) => item.supported), [false, true]);
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
  assert.equal(
    providerDisplayIcon({
      api_base_url: "https://cli-chat-proxy.grok.com/v1",
      api_key: "ccr-local-agent-login",
      icon: "/assets/grok-old.svg",
      models: [],
      name: "Grok CLI API",
      type: "openai_responses"
    }),
    localAgentProviderIconUrls.grok
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
      removeProvider: () => undefined,
      setProviderEnabled: () => undefined
    })
  );

  assert.match(html, /Custom Provider/);
  assert.match(html, /src="https:\/\/custom\.example\/icon\.png"/);
});

test("ProvidersView puts provider enabled state in actions and hides disabled models", () => {
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
            api_base_url: "https://ready.example/v1",
            api_key: "sk-ready",
            models: ["ready-model"],
            name: "Ready Provider",
            type: "openai_chat_completions"
          }
        },
        {
          index: 1,
          provider: {
            api_base_url: "https://empty.example/v1",
            api_key: "sk-empty",
            enabled: false,
            models: ["disabled-model"],
            name: "Disabled Provider",
            type: "openai_chat_completions"
          }
        }
      ],
      removeProvider: () => undefined,
      setProviderEnabled: () => undefined
    })
  );

  assert.doesNotMatch(html, /Status/);
  assert.match(html, /Endpoint/);
  assert.match(html, /Account Usage/);
  assert.doesNotMatch(html, /Usable/);
  assert.match(html, /Disabled Provider/);
  assert.match(html, /Enable provider Disabled Provider/);
  assert.doesNotMatch(html, /disabled-model/);
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
