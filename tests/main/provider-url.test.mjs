import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeProviderBaseUrl,
  parseProviderBaseUrl,
  providerBaseUrlForProtocol,
  providerUrlWithDefaultScheme
} from "../../packages/core/src/providers/url.ts";

test("provider URL parsing strips endpoint paths and unsafe URL parts", () => {
  const parsed = parseProviderBaseUrl("https://user:secret@api.example.com/v1/chat/completions?token=secret#section");

  assert.equal(parsed.normalizedInputBaseUrl, "https://api.example.com/v1");
  assert.equal(parsed.rootBaseUrl, "https://api.example.com");
  assert.equal(providerBaseUrlForProtocol(parsed, "openai_chat_completions"), "https://api.example.com/v1");
  assert.equal(providerBaseUrlForProtocol(parsed, "openai_responses"), "https://api.example.com/v1");
  assert.equal(providerBaseUrlForProtocol(parsed, "anthropic_messages"), "https://api.example.com");
  assert.equal(providerBaseUrlForProtocol(parsed, "gemini_generate_content"), "https://api.example.com");
  assert.equal(providerBaseUrlForProtocol(parsed, "gemini_interactions"), "https://api.example.com");
});

test("provider URL parsing handles local and Gemini endpoint variants", () => {
  const parsed = parseProviderBaseUrl("localhost:8787/v1beta/models/gemini-2.5-pro:generateContent");

  assert.equal(parsed.normalizedInputBaseUrl, "http://localhost:8787/v1beta");
  assert.equal(parsed.rootBaseUrl, "http://localhost:8787");
  assert.equal(parsed.geminiBaseUrl, "http://localhost:8787");
});

test("provider URL parsing preserves versioned Vertex bypass bases for Gemini", () => {
  const parsed = parseProviderBaseUrl("https://api.qnaigc.com/bypass/vertex/v1/models/gemini-pro:generateContent");

  assert.equal(parsed.normalizedInputBaseUrl, "https://api.qnaigc.com/bypass/vertex/v1");
  assert.equal(parsed.rootBaseUrl, "https://api.qnaigc.com/bypass/vertex");
  assert.equal(parsed.geminiBaseUrl, "https://api.qnaigc.com/bypass/vertex/v1");
  assert.equal(
    normalizeProviderBaseUrl("https://api.qnaigc.com/bypass/vertex/v1", "gemini_generate_content"),
    "https://api.qnaigc.com/bypass/vertex/v1"
  );
});

test("provider URL parsing preserves nested versioned Gemini bases", () => {
  const parsed = parseProviderBaseUrl("https://opencode.ai/zen/v1/models/gemini-3-flash:generateContent");

  assert.equal(parsed.normalizedInputBaseUrl, "https://opencode.ai/zen/v1");
  assert.equal(parsed.rootBaseUrl, "https://opencode.ai/zen");
  assert.equal(parsed.geminiBaseUrl, "https://opencode.ai/zen/v1");
  assert.equal(
    normalizeProviderBaseUrl("https://opencode.ai/zen/v1", "gemini_generate_content"),
    "https://opencode.ai/zen/v1"
  );
});

test("provider URL parsing handles Gemini Interactions endpoint variants", () => {
  const parsed = parseProviderBaseUrl("localhost:8787/v1/interactions/interaction-123/cancel");

  assert.equal(parsed.normalizedInputBaseUrl, "http://localhost:8787/v1");
  assert.equal(parsed.rootBaseUrl, "http://localhost:8787");
  assert.equal(parsed.geminiBaseUrl, "http://localhost:8787");
  assert.equal(
    normalizeProviderBaseUrl("localhost:8787/v1beta/interactions", "gemini_interactions"),
    "http://localhost:8787"
  );
});

test("provider URL normalization chooses protocol-specific bases", () => {
  assert.equal(providerUrlWithDefaultScheme("127.0.0.1:3456/v1"), "http://127.0.0.1:3456/v1");
  assert.equal(providerUrlWithDefaultScheme("api.example.com/v1"), "https://api.example.com/v1");
  assert.equal(
    normalizeProviderBaseUrl("api.example.com/v1/messages", "anthropic_messages"),
    "https://api.example.com"
  );
  assert.equal(
    normalizeProviderBaseUrl("api.example.com/v1/chat/completions", "openai_chat_completions"),
    "https://api.example.com/v1"
  );
});
