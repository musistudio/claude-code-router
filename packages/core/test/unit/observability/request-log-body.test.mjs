import assert from "node:assert/strict";
import test from "node:test";
import { compactBase64ImagePayloads } from "@ccr/core/observability/request-log-body.ts";

const largeBase64 = "A".repeat(64 * 1024);

test("request log body compaction replaces data URL images without parsing the JSON tree", () => {
  const input = Buffer.from(JSON.stringify({
    image_url: { url: `data:image/png;base64,${largeBase64}` },
    model: "vision-model"
  }));
  const compacted = compactBase64ImagePayloads(input);
  const parsed = JSON.parse(compacted.buffer.toString("utf8"));

  assert.equal(compacted.compacted, true);
  assert.equal(compacted.imageCount, 1);
  assert.equal(compacted.omittedBytes, largeBase64.length);
  assert.equal(parsed.model, "vision-model");
  assert.match(parsed.image_url.url, /^data:image\/png;base64,\[base64 image omitted from log;/);
  assert.ok(compacted.buffer.byteLength < 512);
});

test("request log body compaction recognizes Anthropic, Gemini, and OpenAI image payloads", () => {
  const input = Buffer.from(JSON.stringify({
    anthropic: {
      source: { data: largeBase64, media_type: "image/jpeg", type: "base64" }
    },
    gemini: {
      inline_data: { data: largeBase64, mime_type: "image/webp" }
    },
    openai: {
      b64_json: largeBase64
    }
  }));
  const compacted = compactBase64ImagePayloads(input);
  const parsed = JSON.parse(compacted.buffer.toString("utf8"));

  assert.equal(compacted.imageCount, 3);
  assert.match(parsed.anthropic.source.data, /^\[base64 image omitted from log;/);
  assert.match(parsed.gemini.inline_data.data, /^\[base64 image omitted from log;/);
  assert.match(parsed.openai.b64_json, /^\[base64 image omitted from log;/);
});

test("request log body compaction leaves small and non-image Base64 values untouched", () => {
  const input = Buffer.from(JSON.stringify({
    audio: { data: largeBase64, media_type: "audio/wav", type: "base64" },
    image: `data:image/png;base64,${"A".repeat(1024)}`
  }));
  const compacted = compactBase64ImagePayloads(input);

  assert.equal(compacted.compacted, false);
  assert.strictEqual(compacted.buffer, input);
});

test("request log body compaction does not borrow image context from an adjacent object", () => {
  const audioBase64 = "A".repeat(64 * 1024);
  const input = Buffer.from(JSON.stringify([
    { mime_type: "image/png", type: "base64" },
    { data: audioBase64, media_type: "audio/wav", type: "base64" }
  ]));
  const compacted = compactBase64ImagePayloads(input);

  assert.equal(compacted.compacted, false);
  assert.equal(JSON.parse(compacted.buffer.toString("utf8"))[1].data, audioBase64);
});
