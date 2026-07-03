import assert from "node:assert/strict";
import test from "node:test";
import { geminiProviderPreset } from "../../src/main/presets/gemini/index.ts";
import {
  createProviderDraft,
  providerProtocolOptions,
  providerProbeCandidates,
  setProviderPresets
} from "../../src/renderer/pages/home/shared/index.tsx";

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
