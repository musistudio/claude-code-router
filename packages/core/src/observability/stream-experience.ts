import { EventEmitter } from "node:events";
import { performance } from "node:perf_hooks";
import { StringDecoder } from "node:string_decoder";
import { Transform } from "node:stream";
import type { GatewayProviderProtocol, RequestStreamMetrics, StreamSpeedSampleStatus } from "@ccr/core/contracts/app";

const liveRateWindowMs = 2_000;
const maxRecordedGaps = 1_024;

type SemanticFragmentKind = "reasoning" | "text" | "tool";

type SemanticFragment = {
  kind: SemanticFragmentKind;
  text: string;
};

type TokenRateSample = {
  atMs: number;
  tokens: number;
};

type ActiveTokenStream = {
  firstTokenAtMs?: number;
  samples: TokenRateSample[];
};

export type LiveTokenRateSnapshot = {
  activeRequests: number;
  tokensPerSecond: number;
};

export type StreamExperienceSnapshot = {
  active: boolean;
  estimatedOutputTokens: number;
  firstSignalAtMs?: number;
  firstTextAtMs?: number;
  lastSignalAtMs?: number;
  maxInterEventGapMs?: number;
  p95InterEventGapMs?: number;
  reasoningObserved: boolean;
  streamEndAtMs?: number;
  textObserved: boolean;
  toolObserved: boolean;
};

export type StreamExperienceMeter = {
  finish: () => void;
  snapshot: () => StreamExperienceSnapshot;
  stream: Transform;
};

export class LiveTokenRateTracker {
  private readonly active = new Map<string, ActiveTokenStream>();

  constructor(private readonly windowMs = liveRateWindowMs) {}

  start(requestId: string): void {
    this.active.set(requestId, { samples: [] });
  }

  record(requestId: string, tokens: number, atMs = monotonicNowMs()): void {
    const stream = this.active.get(requestId);
    if (!stream || !Number.isFinite(tokens) || tokens <= 0) {
      return;
    }
    stream.firstTokenAtMs ??= atMs;
    stream.samples.push({ atMs, tokens });
    this.prune(stream, atMs);
  }

  finish(requestId: string): void {
    this.active.delete(requestId);
  }

  clear(): void {
    this.active.clear();
  }

  snapshot(atMs = monotonicNowMs()): LiveTokenRateSnapshot {
    let tokensPerSecond = 0;
    for (const stream of this.active.values()) {
      this.prune(stream, atMs);
      if (stream.firstTokenAtMs === undefined || stream.samples.length === 0) {
        continue;
      }
      const tokenCount = stream.samples.reduce((total, sample) => total + sample.tokens, 0);
      const elapsedMs = Math.max(250, Math.min(this.windowMs, atMs - stream.firstTokenAtMs));
      tokensPerSecond += tokenCount * 1_000 / elapsedMs;
    }
    return {
      activeRequests: this.active.size,
      tokensPerSecond: Number.isFinite(tokensPerSecond) ? Math.max(0, tokensPerSecond) : 0
    };
  }

  private prune(stream: ActiveTokenStream, atMs: number): void {
    const cutoff = atMs - this.windowMs;
    while (stream.samples.length > 0 && stream.samples[0].atMs < cutoff) {
      stream.samples.shift();
    }
  }
}

const liveTokenRateTracker = new LiveTokenRateTracker();
const externalLiveTokenRates = new Map<string, LiveTokenRateSnapshot>();
const liveTokenRateEvents = new EventEmitter();

export function getLiveTokenRateSnapshot(): LiveTokenRateSnapshot {
  const local = liveTokenRateTracker.snapshot();
  let activeRequests = local.activeRequests;
  let tokensPerSecond = local.tokensPerSecond;
  for (const snapshot of externalLiveTokenRates.values()) {
    activeRequests += snapshot.activeRequests;
    tokensPerSecond += snapshot.tokensPerSecond;
  }
  return {
    activeRequests,
    tokensPerSecond: Number.isFinite(tokensPerSecond) ? Math.max(0, tokensPerSecond) : 0
  };
}

export function onLiveTokenRateChanged(listener: (snapshot: LiveTokenRateSnapshot) => void): () => void {
  liveTokenRateEvents.on("change", listener);
  return () => liveTokenRateEvents.off("change", listener);
}

export function setExternalLiveTokenRateSnapshot(sourceId: string, snapshot?: LiveTokenRateSnapshot): void {
  if (!sourceId.trim()) {
    return;
  }
  if (!snapshot) {
    externalLiveTokenRates.delete(sourceId);
  } else {
    externalLiveTokenRates.set(sourceId, {
      activeRequests: nonNegativeInteger(snapshot.activeRequests),
      tokensPerSecond: nonNegativeNumber(snapshot.tokensPerSecond)
    });
  }
  emitLiveRateChanged();
}

export function monotonicNowMs(): number {
  return performance.now();
}

export function createStreamExperienceMeter(input: {
  contentType?: string;
  liveRateTracker?: LiveTokenRateTracker;
  now?: () => number;
  onChunk?: (chunk: Buffer) => void;
  onLiveRateActivity?: (urgent: boolean) => void;
  protocol?: GatewayProviderProtocol;
  publishLiveRate?: boolean;
  requestId?: string;
}): StreamExperienceMeter {
  const parser = new StreamExperienceParser(input.contentType, input.protocol, input.now ?? monotonicNowMs);
  const requestId = input.requestId;
  const publishLiveRate = Boolean(input.publishLiveRate && requestId && parser.active);
  const rateTracker = input.liveRateTracker ?? liveTokenRateTracker;
  const publishesGlobalRate = rateTracker === liveTokenRateTracker;
  let finished = false;

  if (publishLiveRate && requestId) {
    rateTracker.start(requestId);
    if (publishesGlobalRate) {
      emitLiveRateChanged();
    }
    input.onLiveRateActivity?.(true);
  }

  const finish = () => {
    if (finished) {
      return;
    }
    finished = true;
    parser.finish();
    if (publishLiveRate && requestId) {
      rateTracker.finish(requestId);
      if (publishesGlobalRate) {
        emitLiveRateChanged();
      }
      input.onLiveRateActivity?.(true);
    }
  };

  const stream = new Transform({
    transform(chunk: Buffer | string, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      try {
        input.onChunk?.(buffer);
        const estimatedTokens = parser.append(buffer);
        if (publishLiveRate && requestId && estimatedTokens > 0) {
          rateTracker.record(requestId, estimatedTokens);
          input.onLiveRateActivity?.(false);
        }
      } catch {
        // Metrics are fail-open: malformed provider events must never interrupt forwarding.
      }
      callback(null, buffer);
    },
    flush(callback) {
      finish();
      callback();
    }
  });
  stream.once("close", finish);

  return {
    finish,
    snapshot: () => parser.snapshot(),
    stream
  };
}

export function combineStreamExperienceMetrics(input: {
  client: StreamExperienceSnapshot;
  requestStartedAtMs: number;
  responseHeadersAtMs?: number;
  sampleStatus: StreamSpeedSampleStatus;
  upstream: StreamExperienceSnapshot;
  upstreamAttemptStartedAtMs?: number;
}): RequestStreamMetrics {
  const firstOutputAtMs = input.upstream.firstSignalAtMs;
  const lastOutputAtMs = input.upstream.lastSignalAtMs;
  const firstClientSignalAtMs = input.client.firstSignalAtMs;
  const clientEndAtMs = input.client.streamEndAtMs;

  return {
    ...(firstOutputAtMs !== undefined && lastOutputAtMs !== undefined
      ? { activeOutputMs: roundedDuration(lastOutputAtMs - firstOutputAtMs) }
      : {}),
    estimatedOutputTokens: input.upstream.estimatedOutputTokens,
    ...(input.client.maxInterEventGapMs !== undefined
      ? { maxInterEventGapMs: roundedDuration(input.client.maxInterEventGapMs) }
      : {}),
    ...(input.client.p95InterEventGapMs !== undefined
      ? { p95InterEventGapMs: roundedDuration(input.client.p95InterEventGapMs) }
      : {}),
    reasoningObserved: input.upstream.reasoningObserved,
    ...(input.responseHeadersAtMs !== undefined
      ? { responseHeadersMs: roundedDuration(input.responseHeadersAtMs - input.requestStartedAtMs) }
      : {}),
    sampleStatus: input.client.active && input.upstream.active ? input.sampleStatus : "unsupported_protocol",
    ...(clientEndAtMs !== undefined && input.client.lastSignalAtMs !== undefined
      ? { tailMs: roundedDuration(clientEndAtMs - input.client.lastSignalAtMs) }
      : {}),
    textObserved: input.upstream.textObserved,
    ...(firstClientSignalAtMs !== undefined
      ? { timeToFirstSignalMs: roundedDuration(firstClientSignalAtMs - input.requestStartedAtMs) }
      : {}),
    ...(input.client.firstTextAtMs !== undefined
      ? { timeToFirstTextMs: roundedDuration(input.client.firstTextAtMs - input.requestStartedAtMs) }
      : {}),
    toolObserved: input.upstream.toolObserved,
    ...(firstOutputAtMs !== undefined && input.upstreamAttemptStartedAtMs !== undefined
      ? { upstreamTimeToFirstSignalMs: roundedDuration(firstOutputAtMs - input.upstreamAttemptStartedAtMs) }
      : {})
  };
}

class StreamExperienceParser {
  readonly active: boolean;
  private currentEvent = "";
  private dataLines: string[] = [];
  private readonly decoder = new StringDecoder("utf8");
  private estimatedOutputTokens = 0;
  private firstSignalAtMs?: number;
  private firstTextAtMs?: number;
  private readonly gaps: number[] = [];
  private lastSignalAtMs?: number;
  private maxInterEventGapMs?: number;
  private pendingLine = "";
  private reasoningObserved = false;
  private readonly sse: boolean;
  private streamEndAtMs?: number;
  private textObserved = false;
  private readonly tokenEstimator = new StreamingTokenEstimator();
  private toolObserved = false;

  constructor(
    contentType: string | undefined,
    private readonly protocol: GatewayProviderProtocol | undefined,
    private readonly now: () => number
  ) {
    const normalizedContentType = contentType?.toLowerCase() ?? "";
    this.sse = normalizedContentType.includes("text/event-stream");
    this.active = this.sse ||
      normalizedContentType.includes("application/x-ndjson") ||
      normalizedContentType.includes("application/json-seq");
  }

  append(chunk: Buffer): number {
    if (!this.active) {
      return 0;
    }
    return this.processText(this.decoder.write(chunk));
  }

  finish(): void {
    if (this.streamEndAtMs !== undefined) {
      return;
    }
    if (this.active) {
      this.processText(this.decoder.end());
      if (this.pendingLine) {
        this.processLine(this.pendingLine.endsWith("\r") ? this.pendingLine.slice(0, -1) : this.pendingLine);
        this.pendingLine = "";
      }
      if (this.currentEvent || this.dataLines.length > 0) {
        this.flushEvent();
      }
    }
    this.streamEndAtMs = this.now();
  }

  snapshot(): StreamExperienceSnapshot {
    return {
      active: this.active,
      estimatedOutputTokens: this.estimatedOutputTokens,
      ...(this.firstSignalAtMs !== undefined ? { firstSignalAtMs: this.firstSignalAtMs } : {}),
      ...(this.firstTextAtMs !== undefined ? { firstTextAtMs: this.firstTextAtMs } : {}),
      ...(this.lastSignalAtMs !== undefined ? { lastSignalAtMs: this.lastSignalAtMs } : {}),
      ...(this.maxInterEventGapMs !== undefined ? { maxInterEventGapMs: this.maxInterEventGapMs } : {}),
      ...(this.gaps.length > 0 ? { p95InterEventGapMs: percentile(this.gaps, 0.95) } : {}),
      reasoningObserved: this.reasoningObserved,
      ...(this.streamEndAtMs !== undefined ? { streamEndAtMs: this.streamEndAtMs } : {}),
      textObserved: this.textObserved,
      toolObserved: this.toolObserved
    };
  }

  private processText(text: string): number {
    let estimatedTokens = 0;
    this.pendingLine += text;
    while (true) {
      const newlineIndex = this.pendingLine.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }
      const rawLine = this.pendingLine.slice(0, newlineIndex);
      this.pendingLine = this.pendingLine.slice(newlineIndex + 1);
      estimatedTokens += this.processLine(rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine);
    }
    return estimatedTokens;
  }

  private processLine(line: string): number {
    if (!this.sse) {
      return line.trim() ? this.processPayload(line, "") : 0;
    }
    if (line === "") {
      return this.flushEvent();
    }
    if (line.startsWith(":")) {
      return 0;
    }
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    const rawValue = separator === -1 ? "" : line.slice(separator + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    if (field === "event") {
      this.currentEvent = value.trim();
      return 0;
    }
    if (field === "data") {
      this.dataLines.push(value);
      return 0;
    }
    return 0;
  }

  private flushEvent(): number {
    const data = this.dataLines.join("\n");
    const event = this.currentEvent;
    this.currentEvent = "";
    this.dataLines = [];
    if (!data || data.trim() === "[DONE]") {
      return 0;
    }
    return this.processPayload(data, event);
  }

  private processPayload(data: string, event: string): number {
    let payload: unknown;
    try {
      payload = JSON.parse(data) as unknown;
    } catch {
      return 0;
    }
    const fragments = semanticFragments(payload, event, this.protocol)
      .filter((item) => item.text.length > 0);
    if (fragments.length === 0) {
      return 0;
    }
    const atMs = this.now();
    this.firstSignalAtMs ??= atMs;
    if (this.lastSignalAtMs !== undefined && atMs > this.lastSignalAtMs) {
      const gap = atMs - this.lastSignalAtMs;
      this.maxInterEventGapMs = Math.max(this.maxInterEventGapMs ?? 0, gap);
      this.gaps.push(gap);
      if (this.gaps.length > maxRecordedGaps) {
        this.gaps.shift();
      }
    }
    this.lastSignalAtMs = atMs;
    for (const item of fragments) {
      if (item.kind === "text") {
        this.textObserved = true;
        if (/\S/u.test(item.text)) {
          this.firstTextAtMs ??= atMs;
        }
      } else if (item.kind === "reasoning") {
        this.reasoningObserved = true;
      } else {
        this.toolObserved = true;
      }
    }
    const estimatedTokens = this.tokenEstimator.add(fragments.map((item) => item.text).join(""));
    this.estimatedOutputTokens += estimatedTokens;
    return estimatedTokens;
  }
}

class StreamingTokenEstimator {
  private emittedTokens = 0;
  private weightedCharacters = 0;

  add(text: string): number {
    for (const character of text) {
      const codePoint = character.codePointAt(0) ?? 0;
      if (codePoint >= 0x3400 && codePoint <= 0x9fff) {
        this.weightedCharacters += 1;
      } else if (codePoint <= 0x7f) {
        this.weightedCharacters += 0.25;
      } else {
        this.weightedCharacters += 0.5;
      }
    }
    const nextTotal = Math.max(text.length > 0 ? 1 : 0, Math.floor(this.weightedCharacters));
    const delta = Math.max(0, nextTotal - this.emittedTokens);
    this.emittedTokens = nextTotal;
    return delta;
  }
}

function semanticFragments(payload: unknown, eventName: string, protocol: GatewayProviderProtocol | undefined): SemanticFragment[] {
  if (!isRecord(payload)) {
    return [];
  }
  if (protocol === "anthropic_messages") {
    return anthropicFragments(payload);
  }
  if (protocol === "openai_chat_completions") {
    return openAiChatFragments(payload);
  }
  if (protocol === "openai_responses") {
    return openAiResponsesFragments(payload, eventName);
  }
  if (protocol === "gemini_generate_content" || protocol === "gemini_interactions") {
    return geminiFragments(payload);
  }
  return [
    ...anthropicFragments(payload),
    ...openAiChatFragments(payload),
    ...openAiResponsesFragments(payload, eventName),
    ...geminiFragments(payload)
  ];
}

function anthropicFragments(payload: Record<string, unknown>): SemanticFragment[] {
  const delta = isRecord(payload.delta) ? payload.delta : undefined;
  const contentBlock = isRecord(payload.content_block) ? payload.content_block : undefined;
  return compactFragments([
    fragment("text", readString(delta?.text)),
    fragment("reasoning", readString(delta?.thinking)),
    fragment("tool", readString(delta?.partial_json)),
    fragment("text", readString(contentBlock?.text)),
    fragment("reasoning", readString(contentBlock?.thinking)),
    fragment("tool", readString(contentBlock?.name))
  ]);
}

function openAiChatFragments(payload: Record<string, unknown>): SemanticFragment[] {
  const fragments: Array<SemanticFragment | undefined> = [];
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  for (const choice of choices) {
    if (!isRecord(choice) || !isRecord(choice.delta)) {
      continue;
    }
    const delta = choice.delta;
    fragments.push(fragment("text", readString(delta.content)));
    fragments.push(fragment("reasoning", readString(delta.reasoning_content)));
    fragments.push(fragment("reasoning", readString(delta.reasoning)));
    const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
    for (const toolCall of toolCalls) {
      const fn = isRecord(toolCall) && isRecord(toolCall.function) ? toolCall.function : undefined;
      fragments.push(fragment("tool", readString(fn?.name)));
      fragments.push(fragment("tool", readString(fn?.arguments)));
    }
  }
  return compactFragments(fragments);
}

function openAiResponsesFragments(payload: Record<string, unknown>, eventName: string): SemanticFragment[] {
  const type = (readString(payload.type) ?? eventName).toLowerCase();
  const delta = readString(payload.delta);
  if (!delta || !type.endsWith(".delta")) {
    return [];
  }
  if (type.includes("output_text") || type.includes("refusal")) {
    return [{ kind: "text", text: delta }];
  }
  if (type.includes("reasoning") || type.includes("summary_text")) {
    return [{ kind: "reasoning", text: delta }];
  }
  if (type.includes("function_call") || type.includes("tool")) {
    return [{ kind: "tool", text: delta }];
  }
  return [];
}

function geminiFragments(payload: Record<string, unknown>): SemanticFragment[] {
  const fragments: Array<SemanticFragment | undefined> = [];
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  for (const candidate of candidates) {
    const content = isRecord(candidate) && isRecord(candidate.content) ? candidate.content : undefined;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    for (const part of parts) {
      if (!isRecord(part)) {
        continue;
      }
      fragments.push(fragment(part.thought === true ? "reasoning" : "text", readString(part.text)));
      if (isRecord(part.functionCall)) {
        fragments.push(fragment("tool", readString(part.functionCall.name)));
        if (part.functionCall.args !== undefined) {
          fragments.push(fragment("tool", JSON.stringify(part.functionCall.args)));
        }
      }
    }
  }
  return compactFragments(fragments);
}

function fragment(kind: SemanticFragmentKind, text: string | undefined): SemanticFragment | undefined {
  return text === undefined ? undefined : { kind, text };
}

function compactFragments(fragments: Array<SemanticFragment | undefined>): SemanticFragment[] {
  return fragments.filter((item): item is SemanticFragment => item !== undefined);
}

function percentile(values: number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index] ?? 0;
}

function roundedDuration(value: number): number {
  return Math.max(0, Math.round(value));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function emitLiveRateChanged(): void {
  liveTokenRateEvents.emit("change", getLiveTokenRateSnapshot());
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function nonNegativeNumber(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
