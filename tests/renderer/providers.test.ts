import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newApiKeyUsageAccountConfig } from "../../packages/core/src/providers/new-api.ts";
import { geminiProviderPreset } from "../../packages/core/src/providers/presets/gemini/index.ts";
import { ProvidersView } from "../../packages/ui/src/pages/home/components/providers.tsx";
import {
  applyProviderProbeResult,
  createProviderDraft,
  providerDisplayIcon,
  providerAccountConnectorsTextWithNewApiUserBalanceTemplate,
  providerPresetIconUrls,
  providerProtocolOptions,
  providerProbeCandidates,
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
