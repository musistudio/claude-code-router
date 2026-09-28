import assert from "node:assert/strict";
import test from "node:test";
import { getProviderCatalogModels } from "@ccr/core/providers/model-catalog.ts";

function countUrlParsing(run) {
  const OriginalURL = globalThis.URL;
  let count = 0;
  globalThis.URL = class extends OriginalURL {
    constructor(...args) { super(...args); count++; }
  };
  try {
    return run(() => count);
  } finally {
    globalThis.URL = OriginalURL;
  }
}

test("#1775 repeated lookups for 46 providers do not rescan URL catalogs, including misses", () => {
  const requests = Array.from({ length: 46 }, (_, index) => ({
    baseUrl: `https://cache-${index}.example.test/v1`, name: `cache-${index}`
  }));
  countUrlParsing((count) => {
    const expected = requests.map(getProviderCatalogModels);
    const warmCount = count();
    assert.ok(warmCount > 0);
    for (let repeat = 0; repeat < 10; repeat++) {
      requests.forEach((request, index) => assert.deepEqual(getProviderCatalogModels({ ...request }), expected[index]));
    }
    assert.equal(count(), warmCount);
  });
});

test("#1775 all identity inputs invalidate the catalog lookup, including in-place edits", () => {
  const request = { baseUrl: "https://identity.example.test/v1", name: "unrecognized" };
  assert.equal(getProviderCatalogModels(request).provider, undefined);
  request.providerIds = ["openai"];
  assert.equal(getProviderCatalogModels(request).provider, "openai");
  request.providerIds[0] = "anthropic";
  assert.equal(getProviderCatalogModels(request).provider, "anthropic");
  request.providerIds = [];
  request.providerPresetId = "kimi-coding";
  assert.equal(getProviderCatalogModels(request).provider, "kimi-for-coding");
  request.providerPresetId = "";
  request.baseUrl = "https://api.openai.com/v1";
  assert.equal(getProviderCatalogModels(request).provider, "openai");
  request.baseUrl = "https://identity.example.test/v1";
  request.name = "Anthropic";
  assert.equal(getProviderCatalogModels(request).provider, "anthropic");
});

test("#1775 arbitrary catalog queries have bounded cache retention", () => {
  const first = { name: "eviction-first", baseUrl: "https://eviction.example.test/first" };
  getProviderCatalogModels(first);
  for (let index = 0; index < 513; index++) {
    getProviderCatalogModels({ name: `eviction-${index}`, baseUrl: `https://eviction.example.test/${index}` });
  }
  countUrlParsing((count) => {
    getProviderCatalogModels(first);
    assert.ok(count() > 0, "oldest query should have been evicted");
  });
});
