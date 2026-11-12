import { isRecord, stringValue } from "@ccr/core/gateway/internal/value";

const defaultVisionImageTokens = 1000;
const minVisionImageTokens = 85;
const maxVisionImageTokens = 1600;
const maxVisionDimensionPx = 1568;
const maxHeaderBase64Chars = 5464;

export function calculateTokenCount(messages: unknown, system: unknown, tools: unknown): number {
  return countMessageTokens(messages) + countSystemTokens(system) + countToolTokens(tools);
}

function countMessageTokens(messages: unknown): number {
  if (!Array.isArray(messages)) {
    return 0;
  }
  return messages.reduce((total, message) => total + countUnknownTokens(message), 0);
}

function countSystemTokens(system: unknown): number {
  return countUnknownTokens(system);
}

function countToolTokens(tools: unknown): number {
  if (!Array.isArray(tools)) {
    return 0;
  }
  return tools.reduce((total, tool) => total + countUnknownTokens(tool), 0);
}

function countUnknownTokens(value: unknown): number {
  if (typeof value === "string") {
    return estimateTextTokens(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return 1;
  }

  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countUnknownTokens(item), 0);
  }

  if (!isRecord(value)) {
    return 0;
  }

  const imageTokens = estimateImageBlockTokens(value);
  if (imageTokens !== undefined) {
    return imageTokens;
  }

  let total = 0;
  for (const [key, item] of Object.entries(value)) {
    total += estimateTextTokens(key);
    total += countUnknownTokens(item);
  }
  return total;
}

function estimateImageBlockTokens(block: Record<string, unknown>): number | undefined {
  const type = stringValue(block.type)?.toLowerCase();

  if (type === "image" && isRecord(block.source)) {
    const data = stringValue(block.source.data);
    if (data) {
      return estimateBase64ImageTokens(data);
    }
    if (stringValue(block.source.url)) {
      return defaultVisionImageTokens;
    }
  }

  if (type === "image_url" || type === "input_image") {
    const rawUrl = typeof block.image_url === "string"
      ? block.image_url
      : isRecord(block.image_url)
        ? stringValue(block.image_url.url)
        : undefined;
    if (rawUrl) {
      return estimateImageUrlTokens(rawUrl);
    }
  }

  const inlineData = isRecord(block.inlineData)
    ? block.inlineData
    : isRecord(block.inline_data)
      ? block.inline_data
      : undefined;
  if (inlineData) {
    const mimeType = (stringValue(inlineData.mimeType) ?? stringValue(inlineData.mime_type))?.toLowerCase();
    const data = stringValue(inlineData.data);
    if (data && (!mimeType || mimeType.startsWith("image/"))) {
      return estimateBase64ImageTokens(data);
    }
  }

  return undefined;
}

function estimateImageUrlTokens(url: string): number {
  const trimmed = url.trim();
  if (!trimmed.toLowerCase().startsWith("data:image/")) {
    return defaultVisionImageTokens;
  }
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex < 0) {
    return defaultVisionImageTokens;
  }
  return estimateBase64ImageTokens(trimmed.slice(commaIndex + 1));
}

function estimateBase64ImageTokens(base64Data: string): number {
  const compact = base64Data.slice(0, maxHeaderBase64Chars).replace(/\s+/g, "");
  const alignedLength = compact.length - (compact.length % 4);
  if (alignedLength < 16) {
    return defaultVisionImageTokens;
  }

  const header = Buffer.from(compact.slice(0, alignedLength), "base64");
  const dimensions = readImageDimensions(header);
  if (!dimensions) {
    return defaultVisionImageTokens;
  }

  const longestEdge = Math.max(dimensions.width, dimensions.height);
  const scale = longestEdge > maxVisionDimensionPx ? maxVisionDimensionPx / longestEdge : 1;
  const scaledWidth = Math.max(1, Math.round(dimensions.width * scale));
  const scaledHeight = Math.max(1, Math.round(dimensions.height * scale));
  const estimated = Math.ceil((scaledWidth * scaledHeight) / 750);
  return Math.max(minVisionImageTokens, Math.min(maxVisionImageTokens, estimated));
}

function readImageDimensions(header: Buffer): { width: number; height: number } | undefined {
  // PNG: 8-byte signature followed by IHDR chunk with 4-byte width & height at offset 16.
  if (
    header.length >= 24 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47
  ) {
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : undefined;
  }

  // GIF87a / GIF89a: 2-byte little-endian width & height at offset 6.
  if (
    header.length >= 10 &&
    header[0] === 0x47 &&
    header[1] === 0x49 &&
    header[2] === 0x46
  ) {
    const width = header.readUInt16LE(6);
    const height = header.readUInt16LE(8);
    return width > 0 && height > 0 ? { width, height } : undefined;
  }

  // WebP: RIFF....WEBP followed by VP8 / VP8L / VP8X.
  if (
    header.length >= 30 &&
    header.toString("ascii", 0, 4) === "RIFF" &&
    header.toString("ascii", 8, 12) === "WEBP"
  ) {
    const chunk = header.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
      const width = 1 + header.readUIntLE(24, 3);
      const height = 1 + header.readUIntLE(27, 3);
      return width > 0 && height > 0 ? { width, height } : undefined;
    }
    if (chunk === "VP8L" && header[20] === 0x2f) {
      const bits = header.readUInt32LE(21);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      return width > 0 && height > 0 ? { width, height } : undefined;
    }
    if (chunk === "VP8 " && header[23] === 0x9d && header[24] === 0x01 && header[25] === 0x2a) {
      const width = header.readUInt16LE(26) & 0x3fff;
      const height = header.readUInt16LE(28) & 0x3fff;
      return width > 0 && height > 0 ? { width, height } : undefined;
    }
  }

  // JPEG: scan segments up to header length for SOF0..SOF3 / SOF5..SOF7 / SOF9..SOF11 / SOF13..SOF15.
  if (header.length >= 4 && header[0] === 0xff && header[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < header.length) {
      if (header[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (offset < header.length && header[offset] === 0xff) {
        offset += 1;
      }
      if (offset + 7 >= header.length) {
        break;
      }
      const marker = header[offset];
      offset += 1;
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        continue;
      }
      if (offset + 2 > header.length) {
        break;
      }
      const segmentLength = header.readUInt16BE(offset);
      if (segmentLength < 2) {
        break;
      }
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        if (offset + 7 <= header.length) {
          const height = header.readUInt16BE(offset + 3);
          const width = header.readUInt16BE(offset + 5);
          return width > 0 && height > 0 ? { width, height } : undefined;
        }
        break;
      }
      offset += segmentLength;
    }
  }

  return undefined;
}

function estimateTextTokens(text: string): number {
  const asciiWords = text.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g)?.length ?? 0;
  const cjkChars = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  return Math.max(1, Math.ceil((asciiWords + cjkChars) * 1.15));
}
