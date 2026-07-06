import assert from "node:assert/strict";
import test from "node:test";
import { geminiProviderPreset } from "../../packages/core/src/providers/presets/gemini/index.ts";
import {
  applyProviderProbeResult,
  createProviderDraft,
  providerProtocolOptions,
  providerProbeCandidates,
  setProviderPresets
} from "../../packages/ui/src/pages/home/shared/index.tsx";

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
