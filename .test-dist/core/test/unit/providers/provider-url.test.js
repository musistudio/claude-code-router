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

// packages/core/test/unit/providers/provider-url.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_test = __toESM(require("node:test"), 1);

// packages/core/src/providers/url.ts
function parseProviderBaseUrl(value) {
  const raw = value.trim();
  if (!raw) {
    throw new Error("Base URL is required.");
  }
  const url = new URL(providerUrlWithDefaultScheme(raw));
  url.username = "";
  url.password = "";
  url.hash = "";
  url.search = "";
  url.pathname = stripProviderEndpointPath(url.pathname);
  url.pathname = stripNestedProviderApiVersion(url.pathname);
  const normalizedInputBaseUrl = compactProviderUrl(url);
  const rootBaseUrl = stripProviderApiVersion(normalizedInputBaseUrl);
  const anthropicBaseUrl = rootBaseUrl;
  const anthropicBaseUrlCandidates = shouldProbeAnthropicPrefixFallback(anthropicBaseUrl) ? uniqueProviderUrls([anthropicBaseUrl, appendProviderPathSegment(anthropicBaseUrl, "anthropic")]) : [anthropicBaseUrl];
  const openaiBaseUrl = normalizedInputBaseUrl;
  const openaiBaseUrlCandidates = shouldProbeOpenAiV1Fallback(openaiBaseUrl) ? uniqueProviderUrls([openaiBaseUrl, ensureProviderApiVersion(rootBaseUrl, "v1")]) : [openaiBaseUrl];
  return {
    anthropicBaseUrl,
    anthropicBaseUrlCandidates,
    geminiBaseUrl: providerGeminiBaseUrl(normalizedInputBaseUrl, rootBaseUrl),
    normalizedInputBaseUrl,
    openaiBaseUrl,
    openaiBaseUrlCandidates,
    raw,
    rootBaseUrl
  };
}
function normalizeProviderBaseUrl(value, protocol) {
  const raw = value.trim();
  if (!raw) {
    return "";
  }
  try {
    const parsed = parseProviderBaseUrl(raw);
    return protocol ? providerBaseUrlForProtocol(parsed, protocol) : parsed.normalizedInputBaseUrl;
  } catch {
    return normalizeProviderBaseUrlText(raw, protocol);
  }
}
function providerBaseUrlForProtocol(parsed, protocol) {
  if (protocol === "openai_responses" || protocol === "openai_chat_completions") {
    return parsed.openaiBaseUrl;
  }
  if (protocol === "anthropic_messages") {
    return parsed.anthropicBaseUrl;
  }
  return parsed.geminiBaseUrl;
}
function providerUrlWithDefaultScheme(value) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value;
  }
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(value)) {
    return `http://${value}`;
  }
  return `https://${value}`;
}
function compactProviderUrl(url) {
  const value = url.toString();
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
function stripProviderEndpointPath(pathname) {
  const pathnameWithoutSlash = pathname.replace(/\/+$/, "") || "/";
  const rules = [
    [/\/v1\/chat\/completions$/i, "/v1"],
    [/\/chat\/completions$/i, ""],
    [/\/v1\/responses$/i, "/v1"],
    [/\/responses$/i, ""],
    [/\/v1\/messages$/i, "/v1"],
    [/\/messages$/i, ""],
    [/\/v1beta\/models\/[^/]+:(generateContent|streamGenerateContent)$/i, "/v1beta"],
    [/\/v1\/models\/[^/]+:(generateContent|streamGenerateContent)$/i, "/v1"],
    [/\/v1beta\/interactions(?:\/[^/]+(?:\/cancel)?)?$/i, "/v1beta"],
    [/\/v1\/interactions(?:\/[^/]+(?:\/cancel)?)?$/i, "/v1"],
    [/\/interactions(?:\/[^/]+(?:\/cancel)?)?$/i, ""],
    [/\/v1beta\/models$/i, "/v1beta"],
    [/\/v1\/models$/i, "/v1"],
    [/\/models$/i, ""]
  ];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(pathnameWithoutSlash)) {
      const next = pathnameWithoutSlash.replace(pattern, replacement);
      return next || "/";
    }
  }
  return pathnameWithoutSlash;
}
function stripProviderApiVersion(value) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/(v1|v1beta)$/i, "") || "/";
  return compactProviderUrl(url);
}
function providerGeminiBaseUrl(normalizedInputBaseUrl, rootBaseUrl) {
  return isVersionedVertexBypassBaseUrl(normalizedInputBaseUrl) || isNestedVersionedGeminiBaseUrl(normalizedInputBaseUrl) ? normalizedInputBaseUrl : rootBaseUrl;
}
function isVersionedVertexBypassBaseUrl(value) {
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").map((segment) => segment.trim().toLowerCase()).filter(Boolean);
    return segments.includes("bypass") && segments.includes("vertex") && /^(v1|v1beta)$/.test(segments[segments.length - 1] ?? "");
  } catch {
    return false;
  }
}
function isNestedVersionedGeminiBaseUrl(value) {
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").map((segment) => segment.trim().toLowerCase()).filter(Boolean);
    return segments.length > 1 && /^(v1|v1beta)$/.test(segments[segments.length - 1] ?? "");
  } catch {
    return false;
  }
}
function stripNestedProviderApiVersion(pathname) {
  return pathname.replace(/(\/v[0-9][a-z0-9-]*)\/v1$/i, "$1") || "/";
}
function shouldProbeOpenAiV1Fallback(value) {
  const url = new URL(value);
  const pathname = url.pathname.replace(/\/+$/, "");
  return !/\/v[0-9][a-z0-9-]*$/i.test(pathname);
}
function shouldProbeAnthropicPrefixFallback(value) {
  const url = new URL(value);
  const segments = url.pathname.split("/").map((segment) => segment.trim().toLowerCase()).filter(Boolean);
  return !segments.includes("anthropic");
}
function ensureProviderApiVersion(value, version) {
  const url = new URL(value);
  const pathname = url.pathname.replace(/\/+$/, "");
  if (new RegExp(`/${version}$`, "i").test(pathname)) {
    return compactProviderUrl(url);
  }
  url.pathname = `${pathname}/${version}`.replace(/\/{2,}/g, "/");
  return compactProviderUrl(url);
}
function appendProviderPathSegment(value, segment) {
  const url = new URL(value);
  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = `${pathname}/${segment}`.replace(/\/{2,}/g, "/");
  return compactProviderUrl(url);
}
function uniqueProviderUrls(values) {
  return values.filter((value, index) => values.indexOf(value) === index);
}
function normalizeProviderBaseUrlText(value, protocol) {
  const normalized = value.trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  if (protocol === "openai_chat_completions") {
    return normalized.replace(/\/chat\/completions$/i, "").replace(/\/responses$/i, "");
  }
  if (protocol === "openai_responses") {
    return normalized.replace(/\/responses$/i, "").replace(/\/chat\/completions$/i, "");
  }
  if (protocol === "anthropic_messages") {
    return normalized.replace(/\/v1\/messages$/i, "").replace(/\/messages$/i, "").replace(/\/v1$/i, "");
  }
  if (protocol === "gemini_generate_content" || protocol === "gemini_interactions") {
    return normalized.replace(/\/v1beta\/models\/[^/]+:(generateContent|streamGenerateContent)$/i, "").replace(/\/v1\/models\/[^/]+:(generateContent|streamGenerateContent)$/i, "").replace(/\/v1beta\/interactions(?:\/[^/]+(?:\/cancel)?)?$/i, "").replace(/\/v1\/interactions(?:\/[^/]+(?:\/cancel)?)?$/i, "").replace(/\/interactions(?:\/[^/]+(?:\/cancel)?)?$/i, "").replace(/\/v1beta\/models$/i, "").replace(/\/v1\/models$/i, "").replace(/\/v1beta$/i, "").replace(/\/v1$/i, "");
  }
  return normalized;
}

// packages/core/test/unit/providers/provider-url.test.mjs
(0, import_node_test.default)("provider URL parsing strips endpoint paths and unsafe URL parts", () => {
  const parsed = parseProviderBaseUrl("https://user:secret@api.example.com/v1/chat/completions?token=secret#section");
  import_strict.default.equal(parsed.normalizedInputBaseUrl, "https://api.example.com/v1");
  import_strict.default.equal(parsed.rootBaseUrl, "https://api.example.com");
  import_strict.default.equal(providerBaseUrlForProtocol(parsed, "openai_chat_completions"), "https://api.example.com/v1");
  import_strict.default.equal(providerBaseUrlForProtocol(parsed, "openai_responses"), "https://api.example.com/v1");
  import_strict.default.equal(providerBaseUrlForProtocol(parsed, "anthropic_messages"), "https://api.example.com");
  import_strict.default.equal(providerBaseUrlForProtocol(parsed, "gemini_generate_content"), "https://api.example.com");
  import_strict.default.equal(providerBaseUrlForProtocol(parsed, "gemini_interactions"), "https://api.example.com");
});
(0, import_node_test.default)("provider URL parsing handles local and Gemini endpoint variants", () => {
  const parsed = parseProviderBaseUrl("localhost:8787/v1beta/models/gemini-2.5-pro:generateContent");
  import_strict.default.equal(parsed.normalizedInputBaseUrl, "http://localhost:8787/v1beta");
  import_strict.default.equal(parsed.rootBaseUrl, "http://localhost:8787");
  import_strict.default.equal(parsed.geminiBaseUrl, "http://localhost:8787");
});
(0, import_node_test.default)("provider URL parsing preserves versioned Vertex bypass bases for Gemini", () => {
  const parsed = parseProviderBaseUrl("https://api.qnaigc.com/bypass/vertex/v1/models/gemini-pro:generateContent");
  import_strict.default.equal(parsed.normalizedInputBaseUrl, "https://api.qnaigc.com/bypass/vertex/v1");
  import_strict.default.equal(parsed.rootBaseUrl, "https://api.qnaigc.com/bypass/vertex");
  import_strict.default.equal(parsed.geminiBaseUrl, "https://api.qnaigc.com/bypass/vertex/v1");
  import_strict.default.equal(
    normalizeProviderBaseUrl("https://api.qnaigc.com/bypass/vertex/v1", "gemini_generate_content"),
    "https://api.qnaigc.com/bypass/vertex/v1"
  );
});
(0, import_node_test.default)("provider URL parsing preserves nested versioned Gemini bases", () => {
  const parsed = parseProviderBaseUrl("https://opencode.ai/zen/v1/models/gemini-3-flash:generateContent");
  import_strict.default.equal(parsed.normalizedInputBaseUrl, "https://opencode.ai/zen/v1");
  import_strict.default.equal(parsed.rootBaseUrl, "https://opencode.ai/zen");
  import_strict.default.equal(parsed.geminiBaseUrl, "https://opencode.ai/zen/v1");
  import_strict.default.equal(
    normalizeProviderBaseUrl("https://opencode.ai/zen/v1", "gemini_generate_content"),
    "https://opencode.ai/zen/v1"
  );
});
(0, import_node_test.default)("provider URL parsing handles Gemini Interactions endpoint variants", () => {
  const parsed = parseProviderBaseUrl("localhost:8787/v1/interactions/interaction-123/cancel");
  import_strict.default.equal(parsed.normalizedInputBaseUrl, "http://localhost:8787/v1");
  import_strict.default.equal(parsed.rootBaseUrl, "http://localhost:8787");
  import_strict.default.equal(parsed.geminiBaseUrl, "http://localhost:8787");
  import_strict.default.equal(
    normalizeProviderBaseUrl("localhost:8787/v1beta/interactions", "gemini_interactions"),
    "http://localhost:8787"
  );
});
(0, import_node_test.default)("provider URL normalization chooses protocol-specific bases", () => {
  import_strict.default.equal(providerUrlWithDefaultScheme("127.0.0.1:3456/v1"), "http://127.0.0.1:3456/v1");
  import_strict.default.equal(providerUrlWithDefaultScheme("api.example.com/v1"), "https://api.example.com/v1");
  import_strict.default.equal(
    normalizeProviderBaseUrl("api.example.com/v1/messages", "anthropic_messages"),
    "https://api.example.com"
  );
  import_strict.default.equal(
    normalizeProviderBaseUrl("api.example.com/v1/chat/completions", "openai_chat_completions"),
    "https://api.example.com/v1"
  );
});
