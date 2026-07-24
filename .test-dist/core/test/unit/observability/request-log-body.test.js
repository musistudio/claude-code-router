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

// packages/core/test/unit/observability/request-log-body.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_test = __toESM(require("node:test"), 1);

// packages/core/src/observability/request-log-body.ts
var base64ImageCompactionThresholdBytes = 16 * 1024;
var base64Marker = Buffer.from(";base64,");
var dataImagePrefix = Buffer.from("data:image/");
var genericDataKey = Buffer.from('"data"');
var base64EncodingMarker = Buffer.from('"base64"');
var inlineDataParentKeys = [Buffer.from("inline_data"), Buffer.from("inlineData")];
var imageDataKeys = [
  Buffer.from('"b64_json"'),
  Buffer.from('"image_base64"'),
  Buffer.from('"imageBase64"')
];
var imageMimeMarker = Buffer.from("image/");
function compactBase64ImagePayloads(input) {
  const ranges = findBase64ImageRanges(input);
  if (ranges.length === 0) {
    return { buffer: input, compacted: false, imageCount: 0, omittedBytes: 0 };
  }
  const chunks = [];
  let cursor = 0;
  let outputBytes = 0;
  let omittedBytes = 0;
  for (const range of ranges) {
    const prefix = input.subarray(cursor, range.start);
    const encodedBytes = range.end - range.start;
    const decodedBytes = approximateDecodedBytes(input, range);
    const replacement = Buffer.from(
      `[base64 image omitted from log; encoded_bytes=${encodedBytes}; decoded_bytes~=${decodedBytes}]`
    );
    chunks.push(prefix, replacement);
    outputBytes += prefix.byteLength + replacement.byteLength;
    omittedBytes += encodedBytes;
    cursor = range.end;
  }
  const suffix = input.subarray(cursor);
  chunks.push(suffix);
  outputBytes += suffix.byteLength;
  return {
    buffer: Buffer.concat(chunks, outputBytes),
    compacted: true,
    imageCount: ranges.length,
    omittedBytes
  };
}
function findBase64ImageRanges(input) {
  const candidates = [
    ...findDataImageUrlRanges(input),
    ...imageDataKeys.flatMap((key) => findJsonStringValueRanges(input, key, false)),
    ...findJsonStringValueRanges(input, genericDataKey, true)
  ].sort((left, right) => left.start - right.start || left.end - right.end);
  const ranges = [];
  for (const candidate of candidates) {
    const previous = ranges.at(-1);
    if (previous && candidate.start < previous.end) continue;
    ranges.push(candidate);
  }
  return ranges;
}
function findDataImageUrlRanges(input) {
  const ranges = [];
  let cursor = 0;
  while (cursor < input.byteLength) {
    const prefix = input.indexOf(dataImagePrefix, cursor);
    if (prefix < 0) break;
    const marker = input.indexOf(base64Marker, prefix + dataImagePrefix.byteLength);
    if (marker < 0 || marker - prefix > 192) {
      cursor = prefix + dataImagePrefix.byteLength;
      continue;
    }
    const start = marker + base64Marker.byteLength;
    const end = scanBase64End(input, start);
    if (end - start >= base64ImageCompactionThresholdBytes) ranges.push({ end, start });
    cursor = Math.max(end, start + 1);
  }
  return ranges;
}
function findJsonStringValueRanges(input, key, requireImageContext) {
  const ranges = [];
  let cursor = 0;
  while (cursor < input.byteLength) {
    const keyIndex = input.indexOf(key, cursor);
    if (keyIndex < 0) break;
    cursor = keyIndex + key.byteLength;
    const start = jsonStringValueStart(input, cursor);
    if (start === void 0) continue;
    const end = scanBase64End(input, start);
    if (requireImageContext && !hasImageContext(input, keyIndex, end)) continue;
    if (end - start >= base64ImageCompactionThresholdBytes) ranges.push({ end, start });
    cursor = Math.max(cursor, end);
  }
  return ranges;
}
function hasImageContext(input, keyIndex, valueEnd) {
  const objectStart = input.lastIndexOf(123, keyIndex);
  if (objectStart < 0) return false;
  const objectEnd = findContainingObjectEnd(input, valueEnd);
  const hasMime = containsBefore(input, imageMimeMarker, objectStart, keyIndex) || containsBefore(input, imageMimeMarker, valueEnd, objectEnd);
  const hasImageEncoding = containsBefore(input, base64EncodingMarker, objectStart, keyIndex) || containsBefore(input, base64EncodingMarker, valueEnd, objectEnd) || objectParentKeyMatches(input, objectStart, inlineDataParentKeys);
  return hasMime && hasImageEncoding;
}
function findContainingObjectEnd(input, valueEnd) {
  let depth = 1;
  let inString = false;
  let escaped = false;
  for (let cursor = Math.min(input.byteLength, valueEnd + 1); cursor < input.byteLength; cursor += 1) {
    const byte = input[cursor];
    if (inString) {
      if (escaped) escaped = false;
      else if (byte === 92) escaped = true;
      else if (byte === 34) inString = false;
      continue;
    }
    if (byte === 34) inString = true;
    else if (byte === 123) depth += 1;
    else if (byte === 125 && --depth === 0) return cursor + 1;
  }
  return input.byteLength;
}
function objectParentKeyMatches(input, objectStart, keys) {
  let cursor = skipWhitespaceBackward(input, objectStart - 1);
  if (input[cursor] !== 58) return false;
  cursor = skipWhitespaceBackward(input, cursor - 1);
  if (input[cursor] !== 34) return false;
  const keyEnd = cursor;
  cursor -= 1;
  while (cursor >= 0 && input[cursor] !== 34) cursor -= 1;
  if (cursor < 0) return false;
  const key = input.subarray(cursor + 1, keyEnd);
  return keys.some((candidate) => key.equals(candidate));
}
function containsBefore(input, marker, start, end) {
  const index = input.indexOf(marker, start);
  return index >= 0 && index < end;
}
function jsonStringValueStart(input, start) {
  let cursor = skipWhitespace(input, start);
  if (input[cursor] !== 58) return void 0;
  cursor = skipWhitespace(input, cursor + 1);
  return input[cursor] === 34 ? cursor + 1 : void 0;
}
function skipWhitespace(input, start) {
  let cursor = start;
  while (cursor < input.byteLength) {
    const byte = input[cursor];
    if (byte !== 32 && byte !== 9 && byte !== 10 && byte !== 13) break;
    cursor += 1;
  }
  return cursor;
}
function skipWhitespaceBackward(input, start) {
  let cursor = start;
  while (cursor >= 0) {
    const byte = input[cursor];
    if (byte !== 32 && byte !== 9 && byte !== 10 && byte !== 13) break;
    cursor -= 1;
  }
  return cursor;
}
function scanBase64End(input, start) {
  const closingQuote = input.indexOf(34, start);
  const end = closingQuote >= 0 ? closingQuote : input.byteLength;
  if (end <= start || !isProbablyBase64Range(input, start, end)) return start;
  return end;
}
function isProbablyBase64Range(input, start, end) {
  const sampleBytes = 64;
  const firstEnd = Math.min(end, start + sampleBytes);
  for (let index = start; index < firstEnd; index += 1) {
    if (!isBase64Byte(input[index])) return false;
  }
  const lastStart = Math.max(firstEnd, end - sampleBytes);
  for (let index = lastStart; index < end; index += 1) {
    if (!isBase64Byte(input[index])) return false;
  }
  return true;
}
function isBase64Byte(byte) {
  return byte >= 65 && byte <= 90 || byte >= 97 && byte <= 122 || byte >= 48 && byte <= 57 || byte === 43 || byte === 47 || byte === 61 || byte === 45 || byte === 95;
}
function approximateDecodedBytes(input, range) {
  let padding = 0;
  if (input[range.end - 1] === 61) padding += 1;
  if (input[range.end - 2] === 61) padding += 1;
  return Math.max(0, Math.floor((range.end - range.start) * 3 / 4) - padding);
}

// packages/core/test/unit/observability/request-log-body.test.mjs
var largeBase64 = "A".repeat(64 * 1024);
(0, import_node_test.default)("request log body compaction replaces data URL images without parsing the JSON tree", () => {
  const input = Buffer.from(JSON.stringify({
    image_url: { url: `data:image/png;base64,${largeBase64}` },
    model: "vision-model"
  }));
  const compacted = compactBase64ImagePayloads(input);
  const parsed = JSON.parse(compacted.buffer.toString("utf8"));
  import_strict.default.equal(compacted.compacted, true);
  import_strict.default.equal(compacted.imageCount, 1);
  import_strict.default.equal(compacted.omittedBytes, largeBase64.length);
  import_strict.default.equal(parsed.model, "vision-model");
  import_strict.default.match(parsed.image_url.url, /^data:image\/png;base64,\[base64 image omitted from log;/);
  import_strict.default.ok(compacted.buffer.byteLength < 512);
});
(0, import_node_test.default)("request log body compaction recognizes Anthropic, Gemini, and OpenAI image payloads", () => {
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
  import_strict.default.equal(compacted.imageCount, 3);
  import_strict.default.match(parsed.anthropic.source.data, /^\[base64 image omitted from log;/);
  import_strict.default.match(parsed.gemini.inline_data.data, /^\[base64 image omitted from log;/);
  import_strict.default.match(parsed.openai.b64_json, /^\[base64 image omitted from log;/);
});
(0, import_node_test.default)("request log body compaction leaves small and non-image Base64 values untouched", () => {
  const input = Buffer.from(JSON.stringify({
    audio: { data: largeBase64, media_type: "audio/wav", type: "base64" },
    image: `data:image/png;base64,${"A".repeat(1024)}`
  }));
  const compacted = compactBase64ImagePayloads(input);
  import_strict.default.equal(compacted.compacted, false);
  import_strict.default.strictEqual(compacted.buffer, input);
});
(0, import_node_test.default)("request log body compaction does not borrow image context from an adjacent object", () => {
  const audioBase64 = "A".repeat(64 * 1024);
  const input = Buffer.from(JSON.stringify([
    { mime_type: "image/png", type: "base64" },
    { data: audioBase64, media_type: "audio/wav", type: "base64" }
  ]));
  const compacted = compactBase64ImagePayloads(input);
  import_strict.default.equal(compacted.compacted, false);
  import_strict.default.equal(JSON.parse(compacted.buffer.toString("utf8"))[1].data, audioBase64);
});
