"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// packages/core/test/unit/usage/usage-normalization.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_test = __toESM(require("node:test"), 1);

// packages/core/src/usage/normalization.ts
function normalizeUsageInputTokens(usage, options = {}) {
  if (!usage) {
    return void 0;
  }
  const includesCacheTokens = inputIncludesCacheTokens(usage, options);
  if (!includesCacheTokens || usage.inputTokens === void 0) {
    return usage;
  }
  const cacheTokens = normalizeCount(usage.cacheReadTokens) + normalizeCount(usage.cacheWriteTokens);
  if (cacheTokens <= 0) {
    return usage;
  }
  return {
    ...usage,
    inputTokens: Math.max(0, normalizeCount(usage.inputTokens) - cacheTokens)
  };
}
function inputIncludesCacheTokens(usage, options) {
  const protocolValue = inputIncludesCacheTokensForProtocol(options.providerProtocol);
  if (protocolValue !== void 0) {
    return protocolValue;
  }
  if (usage.inputIncludesCacheTokens !== void 0) {
    return usage.inputIncludesCacheTokens;
  }
  if (options.usageHint?.inputIncludesCacheTokens !== void 0) {
    return options.usageHint.inputIncludesCacheTokens;
  }
  return inputIncludesCacheTokensForPath(options.path);
}
function inputIncludesCacheTokensForProtocol(protocol) {
  if (protocol === "anthropic_messages") {
    return false;
  }
  if (protocol === "openai_chat_completions" || protocol === "openai_responses" || protocol === "gemini_generate_content" || protocol === "gemini_interactions") {
    return true;
  }
  return void 0;
}
function inputIncludesCacheTokensForPath(path) {
  const normalized = path?.toLowerCase() ?? "";
  if (!normalized) {
    return void 0;
  }
  if (normalized.includes("/chat/completions") || normalized.includes("/responses") || normalized.includes(":generatecontent") || normalized.includes("/interactions")) {
    return true;
  }
  if (normalized.includes("/messages")) {
    return false;
  }
  return void 0;
}
function normalizeCount(value) {
  return value !== void 0 && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

// packages/core/test/unit/usage/usage-normalization.test.mjs
(0, import_node_test.default)("normalizeUsageInputTokens subtracts cache tokens for OpenAI-compatible protocols", () => {
  const usage = normalizeUsageInputTokens(
    {
      cacheReadTokens: 20,
      cacheWriteTokens: 5,
      inputTokens: 100,
      outputTokens: 12
    },
    { providerProtocol: "openai_chat_completions" }
  );
  import_strict.default.deepEqual(usage, {
    cacheReadTokens: 20,
    cacheWriteTokens: 5,
    inputTokens: 75,
    outputTokens: 12
  });
});
(0, import_node_test.default)("normalizeUsageInputTokens keeps Anthropic input tokens unchanged", () => {
  const usage = normalizeUsageInputTokens(
    {
      cacheReadTokens: 20,
      cacheWriteTokens: 5,
      inputTokens: 100
    },
    { providerProtocol: "anthropic_messages" }
  );
  import_strict.default.deepEqual(usage, {
    cacheReadTokens: 20,
    cacheWriteTokens: 5,
    inputTokens: 100
  });
});
(0, import_node_test.default)("normalizeUsageInputTokens falls back to path and usage hints", () => {
  import_strict.default.equal(
    normalizeUsageInputTokens(
      { cacheReadTokens: 8, inputTokens: 50 },
      { path: "/v1/responses" }
    )?.inputTokens,
    42
  );
  import_strict.default.equal(
    normalizeUsageInputTokens(
      { cacheReadTokens: 8, inputTokens: 50 },
      { usageHint: { inputIncludesCacheTokens: false } }
    )?.inputTokens,
    50
  );
});
