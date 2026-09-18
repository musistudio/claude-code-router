import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeDeepSeekCacheUsage,
  normalizeDeepSeekCacheUsageStream
} from "@ccr/core/gateway/features/opencode-cache-usage.ts";

test("#1791 normalizes DeepSeek-native cache hits without overriding standard usage", () => {
  const native = {
    choices: [],
    usage: {
      prompt_cache_hit_tokens: 800,
      prompt_cache_miss_tokens: 200,
      prompt_tokens: 1000,
      prompt_tokens_details: {}
    }
  };
  const normalized = normalizeDeepSeekCacheUsage(native);
  assert.equal(normalized.changed, true);
  assert.equal(normalized.value.usage.prompt_tokens_details.cached_tokens, 800);
  assert.deepEqual(native.usage.prompt_tokens_details, {});

  const standard = {
    usage: {
      prompt_cache_hit_tokens: 800,
      prompt_tokens_details: { cached_tokens: 700 }
    }
  };
  assert.deepEqual(normalizeDeepSeekCacheUsage(standard), {
    changed: false,
    value: standard
  });

  for (const value of [
    { usage: { prompt_tokens_details: {} } },
    { usage: { prompt_cache_hit_tokens: -1 } },
    { usage: { prompt_cache_hit_tokens: "800" } },
    { usage: null }
  ]) {
    assert.equal(normalizeDeepSeekCacheUsage(value).changed, false);
  }
});

test("#1791 normalizes DeepSeek-native cache hits in split SSE chunks", async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("data: {\"choices\":[],\"usage\":{\"prompt_tokens\":1000,"));
      controller.enqueue(encoder.encode("\"prompt_cache_hit_tokens\":800,\"prompt_tokens_details\":{}}}\n\n"));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });
  const response = new Response(body, {
    headers: {
      "content-length": "1",
      "content-type": "text/event-stream"
    }
  });

  const normalized = normalizeDeepSeekCacheUsageStream(response);
  assert.ok(normalized);
  assert.equal(normalized.headers.has("content-length"), false);
  const text = await normalized.text();
  const firstPayload = JSON.parse(text.split("\n")[0].slice("data: ".length));
  assert.equal(firstPayload.usage.prompt_tokens_details.cached_tokens, 800);
  assert.match(text, /data: \[DONE\]/);
});

test("#1791 leaves non-SSE responses untouched", () => {
  const response = new Response("{}", { headers: { "content-type": "application/json" } });
  assert.equal(normalizeDeepSeekCacheUsageStream(response), undefined);
});
