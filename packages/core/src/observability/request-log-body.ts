export type RequestLogBodyCompaction = {
  buffer: Buffer;
  compacted: boolean;
  imageCount: number;
  omittedBytes: number;
};

const base64ImageCompactionThresholdBytes = 16 * 1024;
const base64Marker = Buffer.from(";base64,");
const dataImagePrefix = Buffer.from("data:image/");
const genericDataKey = Buffer.from('"data"');
const base64EncodingMarker = Buffer.from('"base64"');
const inlineDataParentKeys = [Buffer.from("inline_data"), Buffer.from("inlineData")];
const imageDataKeys = [
  Buffer.from('"b64_json"'),
  Buffer.from('"image_base64"'),
  Buffer.from('"imageBase64"')
];
const imageMimeMarker = Buffer.from("image/");

type Base64Range = {
  end: number;
  start: number;
};

/**
 * Replaces large inline Base64 image payloads with small JSON-safe descriptors.
 * The scan works on bytes instead of JSON.parse/stringify so a large image does
 * not create another full JavaScript string/object graph on the request path.
 */
export function compactBase64ImagePayloads(input: Buffer): RequestLogBodyCompaction {
  const ranges = findBase64ImageRanges(input);
  if (ranges.length === 0) {
    return { buffer: input, compacted: false, imageCount: 0, omittedBytes: 0 };
  }

  const chunks: Buffer[] = [];
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

function findBase64ImageRanges(input: Buffer): Base64Range[] {
  const candidates = [
    ...findDataImageUrlRanges(input),
    ...imageDataKeys.flatMap((key) => findJsonStringValueRanges(input, key, false)),
    ...findJsonStringValueRanges(input, genericDataKey, true)
  ].sort((left, right) => left.start - right.start || left.end - right.end);
  const ranges: Base64Range[] = [];
  for (const candidate of candidates) {
    const previous = ranges.at(-1);
    if (previous && candidate.start < previous.end) continue;
    ranges.push(candidate);
  }
  return ranges;
}

function findDataImageUrlRanges(input: Buffer): Base64Range[] {
  const ranges: Base64Range[] = [];
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

function findJsonStringValueRanges(input: Buffer, key: Buffer, requireImageContext: boolean): Base64Range[] {
  const ranges: Base64Range[] = [];
  let cursor = 0;
  while (cursor < input.byteLength) {
    const keyIndex = input.indexOf(key, cursor);
    if (keyIndex < 0) break;
    cursor = keyIndex + key.byteLength;
    const start = jsonStringValueStart(input, cursor);
    if (start === undefined) continue;
    const end = scanBase64End(input, start);
    if (requireImageContext && !hasImageContext(input, keyIndex, end)) continue;
    if (end - start >= base64ImageCompactionThresholdBytes) ranges.push({ end, start });
    cursor = Math.max(cursor, end);
  }
  return ranges;
}

function hasImageContext(input: Buffer, keyIndex: number, valueEnd: number): boolean {
  const objectStart = input.lastIndexOf(0x7b, keyIndex);
  if (objectStart < 0) return false;
  const objectEnd = findContainingObjectEnd(input, valueEnd);
  const hasMime = containsBefore(input, imageMimeMarker, objectStart, keyIndex) ||
    containsBefore(input, imageMimeMarker, valueEnd, objectEnd);
  const hasImageEncoding = containsBefore(input, base64EncodingMarker, objectStart, keyIndex) ||
    containsBefore(input, base64EncodingMarker, valueEnd, objectEnd) ||
    objectParentKeyMatches(input, objectStart, inlineDataParentKeys);
  return hasMime && hasImageEncoding;
}

function findContainingObjectEnd(input: Buffer, valueEnd: number): number {
  let depth = 1;
  let inString = false;
  let escaped = false;
  for (let cursor = Math.min(input.byteLength, valueEnd + 1); cursor < input.byteLength; cursor += 1) {
    const byte = input[cursor];
    if (inString) {
      if (escaped) escaped = false;
      else if (byte === 0x5c) escaped = true;
      else if (byte === 0x22) inString = false;
      continue;
    }
    if (byte === 0x22) inString = true;
    else if (byte === 0x7b) depth += 1;
    else if (byte === 0x7d && --depth === 0) return cursor + 1;
  }
  return input.byteLength;
}

function objectParentKeyMatches(input: Buffer, objectStart: number, keys: Buffer[]): boolean {
  let cursor = skipWhitespaceBackward(input, objectStart - 1);
  if (input[cursor] !== 0x3a) return false;
  cursor = skipWhitespaceBackward(input, cursor - 1);
  if (input[cursor] !== 0x22) return false;
  const keyEnd = cursor;
  cursor -= 1;
  while (cursor >= 0 && input[cursor] !== 0x22) cursor -= 1;
  if (cursor < 0) return false;
  const key = input.subarray(cursor + 1, keyEnd);
  return keys.some((candidate) => key.equals(candidate));
}

function containsBefore(input: Buffer, marker: Buffer, start: number, end: number): boolean {
  const index = input.indexOf(marker, start);
  return index >= 0 && index < end;
}

function jsonStringValueStart(input: Buffer, start: number): number | undefined {
  let cursor = skipWhitespace(input, start);
  if (input[cursor] !== 0x3a) return undefined;
  cursor = skipWhitespace(input, cursor + 1);
  return input[cursor] === 0x22 ? cursor + 1 : undefined;
}

function skipWhitespace(input: Buffer, start: number): number {
  let cursor = start;
  while (cursor < input.byteLength) {
    const byte = input[cursor];
    if (byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) break;
    cursor += 1;
  }
  return cursor;
}

function skipWhitespaceBackward(input: Buffer, start: number): number {
  let cursor = start;
  while (cursor >= 0) {
    const byte = input[cursor];
    if (byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) break;
    cursor -= 1;
  }
  return cursor;
}

function scanBase64End(input: Buffer, start: number): number {
  const closingQuote = input.indexOf(0x22, start);
  const end = closingQuote >= 0 ? closingQuote : input.byteLength;
  if (end <= start || !isProbablyBase64Range(input, start, end)) return start;
  return end;
}

function isProbablyBase64Range(input: Buffer, start: number, end: number): boolean {
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

function isBase64Byte(byte: number): boolean {
  return (byte >= 0x41 && byte <= 0x5a) ||
    (byte >= 0x61 && byte <= 0x7a) ||
    (byte >= 0x30 && byte <= 0x39) ||
    byte === 0x2b || byte === 0x2f || byte === 0x3d || byte === 0x2d || byte === 0x5f;
}

function approximateDecodedBytes(input: Buffer, range: Base64Range): number {
  let padding = 0;
  if (input[range.end - 1] === 0x3d) padding += 1;
  if (input[range.end - 2] === 0x3d) padding += 1;
  return Math.max(0, Math.floor((range.end - range.start) * 3 / 4) - padding);
}
