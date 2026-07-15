import { parseJsonObject } from "@ccr/core/gateway/http/io";

type ParsedJsonObjectCacheEntry =
  | { error: unknown }
  | { value: Record<string, unknown> };

const parsedJsonObjectCache = new WeakMap<Buffer, ParsedJsonObjectCacheEntry>();

/**
 * Parses an immutable request buffer once and reuses the parsed object for the
 * rest of that buffer's lifetime. Callers must not mutate the returned object.
 */
export function parseJsonObjectCached(buffer: Buffer): Record<string, unknown> {
  const cached = parsedJsonObjectCache.get(buffer);
  if (cached) {
    if ("error" in cached) {
      throw cached.error;
    }
    return cached.value;
  }

  try {
    const value = parseJsonObject(buffer);
    parsedJsonObjectCache.set(buffer, { value });
    return value;
  } catch (error) {
    parsedJsonObjectCache.set(buffer, { error });
    throw error;
  }
}

/**
 * Transfers the cached object to a caller that intends to mutate it. Removing
 * the entry keeps later reads of the original buffer consistent with its bytes.
 */
export function takeJsonObject(buffer: Buffer): Record<string, unknown> {
  const value = parseJsonObjectCached(buffer);
  parsedJsonObjectCache.delete(buffer);
  return value;
}

export function parseJsonObjectSafe(buffer: Buffer | undefined): Record<string, unknown> | undefined {
  if (!buffer || buffer.byteLength === 0) {
    return undefined;
  }
  try {
    return parseJsonObjectCached(buffer);
  } catch {
    return undefined;
  }
}

/** Releases a parsed object before its buffer crosses a long-lived boundary. */
export function releaseJsonObject(buffer: Buffer | undefined): void {
  if (buffer) {
    parsedJsonObjectCache.delete(buffer);
  }
}

/** Serializes an object and seeds the parse cache for the immutable result. */
export function serializeJsonBody(body: Record<string, unknown>): Buffer {
  const buffer = Buffer.from(`${JSON.stringify(body)}\n`, "utf8");
  parsedJsonObjectCache.set(buffer, { value: body });
  return buffer;
}

export function serializeJsonBodyWithModel(body: Record<string, unknown>, model: string): Buffer {
  return serializeJsonBody({ ...body, model });
}
