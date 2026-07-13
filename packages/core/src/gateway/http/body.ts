import { parseJsonObject } from "@ccr/core/gateway/http/io";

export function parseJsonObjectSafe(buffer: Buffer | undefined): Record<string, unknown> | undefined {
  if (!buffer || buffer.byteLength === 0) {
    return undefined;
  }
  try {
    return parseJsonObject(buffer);
  } catch {
    return undefined;
  }
}

export function serializeJsonBodyWithModel(body: Record<string, unknown>, model: string): Buffer {
  return Buffer.from(`${JSON.stringify({ ...body, model })}\n`, "utf8");
}
