import { Readable, Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { isRecord } from "@ccr/core/gateway/internal/value";

export type CacheUsageNormalization = {
  changed: boolean;
  value: unknown;
};

/**
 * DeepSeek-compatible chat endpoints can report prompt cache reads in the
 * top-level `prompt_cache_hit_tokens` usage field. Normalize that field to the
 * OpenAI-compatible shape consumed by the gateway's protocol adapters.
 *
 * A standard `prompt_tokens_details.cached_tokens` value always wins. Cache
 * usage cannot be reconstructed when the upstream omits both fields.
 */
export function normalizeDeepSeekCacheUsage(value: unknown): CacheUsageNormalization {
  if (!isRecord(value) || !isRecord(value.usage)) {
    return { changed: false, value };
  }

  const usage = value.usage;
  const promptTokenDetails = isRecord(usage.prompt_tokens_details)
    ? usage.prompt_tokens_details
    : undefined;
  if (nonNegativeTokenCount(promptTokenDetails?.cached_tokens) !== undefined) {
    return { changed: false, value };
  }

  const cacheReadTokens = nonNegativeTokenCount(usage.prompt_cache_hit_tokens);
  if (cacheReadTokens === undefined) {
    return { changed: false, value };
  }

  return {
    changed: true,
    value: {
      ...value,
      usage: {
        ...usage,
        prompt_tokens_details: {
          ...promptTokenDetails,
          cached_tokens: cacheReadTokens
        }
      }
    }
  };
}

/** Rewrites cache usage in an OpenAI-compatible SSE response without buffering it. */
export function normalizeDeepSeekCacheUsageStream(response: Response): Response | undefined {
  if (!response.body || !response.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) {
    return undefined;
  }

  const source = Readable.fromWeb(response.body as unknown as Parameters<typeof Readable.fromWeb>[0]);
  const normalized = source.pipe(new CacheUsageSseTransform());
  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(Readable.toWeb(normalized) as ReadableStream<Uint8Array>, {
    headers,
    status: response.status,
    statusText: response.statusText
  });
}

class CacheUsageSseTransform extends Transform {
  private readonly decoder = new StringDecoder("utf8");
  private pending = "";

  override _transform(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    try {
      this.pending += typeof chunk === "string" ? chunk : this.decoder.write(chunk);
      this.flushCompleteEvents();
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  override _flush(callback: (error?: Error | null) => void): void {
    try {
      this.pending += this.decoder.end();
      if (this.pending) this.push(rewriteSseEvent(this.pending));
      this.pending = "";
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private flushCompleteEvents(): void {
    while (true) {
      const delimiter = /\r?\n\r?\n/.exec(this.pending);
      if (!delimiter || delimiter.index === undefined) return;
      const end = delimiter.index + delimiter[0].length;
      this.push(rewriteSseEvent(this.pending.slice(0, delimiter.index)) + delimiter[0]);
      this.pending = this.pending.slice(end);
    }
  }
}

function rewriteSseEvent(event: string): string {
  const lines = event.split(/\r?\n/);
  const dataIndexes: number[] = [];
  const dataParts: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^data:(?: )?(.*)$/.exec(lines[index] ?? "");
    if (!match) continue;
    dataIndexes.push(index);
    dataParts.push(match[1] ?? "");
  }
  if (dataIndexes.length === 0) return event;

  const data = dataParts.join("\n").trim();
  if (!data || data === "[DONE]") return event;

  try {
    const transformed = normalizeDeepSeekCacheUsage(JSON.parse(data));
    if (!transformed.changed) return event;
    const firstDataIndex = dataIndexes[0];
    const remainingDataIndexes = new Set(dataIndexes.slice(1));
    return lines
      .filter((_, index) => !remainingDataIndexes.has(index))
      .map((line, index) => index === firstDataIndex ? `data: ${JSON.stringify(transformed.value)}` : line)
      .join("\n");
  } catch {
    return event;
  }
}

function nonNegativeTokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined;
}
