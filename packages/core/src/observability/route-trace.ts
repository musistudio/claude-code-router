import type {
  RequestRouteTrace,
  RequestRouteTraceChange,
  RequestRouteTraceDecision,
  RequestRouteTraceHop,
  RequestRouteTraceOutcome,
  RequestRouteTracePhase,
  RequestRouteTraceTarget
} from "@ccr/core/contracts/app";

export type RouteTraceObservation = {
  attempt?: number;
  changes?: readonly RequestRouteTraceChange[];
  decision?: RequestRouteTraceDecision;
  durationMs?: number;
  kind?: RequestRouteTraceHop["kind"];
  name: string;
  outcome?: RequestRouteTraceOutcome;
  phase: RequestRouteTracePhase;
  startedAtMs?: number;
  status?: RequestRouteTraceHop["status"];
  target?: RequestRouteTraceTarget;
};

export type RouteTraceObserver = {
  capture: (observation: RouteTraceObservation) => void;
};

const maxArrayItems = 16;
const maxChangesPerHop = 64;
const maxDepth = 6;
const maxHops = 64;
const maxObjectEntries = 32;
const maxPreviewBytes = 2 * 1024;
const maxStringChars = 1_024;
const maxTraceBytes = 256 * 1024;
const redactedDisplayValue = "[redacted]";
const truncatedDisplayValue = "[truncated]";
const sensitiveNames = /(?:^|[-_.])(authorization|cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|password|secret|proxy[-_]?authorization)(?:$|[-_.])/i;

type PreviewBudget = {
  remaining: number;
  truncated: boolean;
};

/**
 * Records route events supplied by the code that performs each mutation.
 *
 * This recorder deliberately never snapshots, parses, or compares request
 * bodies. Mutation sites must report their own paths and values through
 * `changes`, which keeps the tracing cost proportional to the reported
 * changes instead of the total request size and hop count.
 */
export class RequestRouteTraceRecorder implements RouteTraceObserver {
  private readonly attempts = new Set<number>();
  private estimatedBytes = 0;
  private finished?: RequestRouteTrace;
  private readonly hops: RequestRouteTraceHop[] = [];
  private sealed = false;
  private truncated = false;

  constructor(private readonly startedAtMs: number) {}

  captureIngress(): void {
    if (this.finished || this.hops.length > 0) {
      return;
    }
    this.pushHop({
      changes: [],
      durationMs: 0,
      kind: "snapshot",
      name: "request.ingress",
      phase: "ingress",
      seq: 0,
      startedOffsetMs: 0,
      status: "ok"
    });
  }

  capture(observation: RouteTraceObservation): void {
    if (this.finished || this.sealed || this.hops.length >= maxHops) {
      this.truncated = true;
      this.sealed = true;
      return;
    }

    const reportedChanges = observation.changes ?? [];
    const changes = reportedChanges
      .slice(0, maxChangesPerHop)
      .map(sanitizeReportedChange);
    const changesTruncated = reportedChanges.length > changes.length || changes.some((change) => change.truncated);
    if (observation.attempt !== undefined) {
      this.attempts.add(observation.attempt);
    }

    const observationStartedAtMs = observation.startedAtMs ?? Date.now();
    const hop: RequestRouteTraceHop = {
      ...(observation.attempt === undefined ? {} : { attempt: observation.attempt }),
      changes,
      ...(observation.decision ? { decision: boundedObservationValue(observation.decision) } : {}),
      durationMs: Math.max(0, Math.round(observation.durationMs ?? 0)),
      kind: observation.kind ?? (changes.length > 0 ? "mutation" : "decision"),
      name: observation.name,
      ...(observation.outcome ? { outcome: boundedObservationValue(observation.outcome) } : {}),
      phase: observation.phase,
      seq: this.hops.length,
      startedOffsetMs: Math.max(0, Math.round(observationStartedAtMs - this.startedAtMs)),
      status: observation.status ?? (changes.length > 0 ? "ok" : "noop"),
      ...(observation.target ? { target: boundedObservationValue(observation.target) } : {}),
      ...(changesTruncated ? { truncated: true } : {})
    };
    if (changesTruncated) {
      this.truncated = true;
    }
    this.pushHop(hop);
  }

  finish(): RequestRouteTrace {
    if (this.finished) {
      return this.finished;
    }
    this.finished = {
      attemptCount: this.attempts.size,
      complete: true,
      hopCount: this.hops.length,
      hops: this.hops,
      truncated: this.truncated,
      version: 2
    };
    return this.finished;
  }

  private pushHop(hop: RequestRouteTraceHop): void {
    const remaining = maxTraceBytes - this.estimatedBytes;
    if (remaining <= 0) {
      this.truncated = true;
      this.sealed = true;
      return;
    }

    let nextHop = hop;
    let hopBytes = jsonByteLength(nextHop);
    if (hopBytes > remaining && nextHop.changes.length > 0) {
      const retained: RequestRouteTraceChange[] = [];
      let retainedBytes = jsonByteLength({ ...nextHop, changes: [] });
      for (const change of nextHop.changes) {
        const changeBytes = jsonByteLength(change) + 1;
        if (retainedBytes + changeBytes > remaining) {
          break;
        }
        retained.push(change);
        retainedBytes += changeBytes;
      }
      nextHop = {
        ...nextHop,
        changes: retained,
        truncated: retained.length < nextHop.changes.length || nextHop.truncated
      };
      hopBytes = retainedBytes;
      if (nextHop.truncated) {
        this.truncated = true;
      }
    }

    if (hopBytes > remaining) {
      this.truncated = true;
      this.sealed = true;
      return;
    }
    this.hops.push(nextHop);
    this.estimatedBytes += hopBytes;
  }
}

function boundedObservationValue<T extends object>(value: T): T {
  return previewValue(value).value as T;
}

function sanitizeReportedChange(change: RequestRouteTraceChange): RequestRouteTraceChange {
  const path = normalizePath(change.path);
  const redacted = Boolean(change.redacted) || pathContainsSensitiveName(path);
  const before = change.before === undefined || redacted
    ? undefined
    : previewValue(change.scope === "url" ? sanitizeUrlValue(change.before) : change.before);
  const after = change.after === undefined || redacted
    ? undefined
    : previewValue(change.scope === "url" ? sanitizeUrlValue(change.after) : change.after);
  return {
    ...(change.after === undefined
      ? {}
      : { after: redacted ? redactedDisplayValue : after?.value }),
    ...(change.before === undefined
      ? {}
      : { before: redacted ? redactedDisplayValue : before?.value }),
    operation: change.operation,
    path,
    ...(redacted ? { redacted: true } : {}),
    scope: change.scope,
    ...((change.truncated || before?.truncated || after?.truncated) ? { truncated: true } : {})
  };
}

function sanitizeUrlValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    const url = new URL(value, "http://127.0.0.1");
    for (const key of [...url.searchParams.keys()]) {
      if (sensitiveNames.test(key) || /^(?:key|token)$/i.test(key)) {
        url.searchParams.set(key, redactedDisplayValue);
      }
    }
    return /^[a-z][a-z\d+.-]*:/i.test(value)
      ? url.toString()
      : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
}

function previewValue(value: unknown): { truncated: boolean; value: unknown } {
  const budget: PreviewBudget = { remaining: maxPreviewBytes, truncated: false };
  const preview = boundedPreview(value, budget, 0, new WeakSet());
  return {
    truncated: budget.truncated,
    value: preview ?? truncatedDisplayValue
  };
}

function boundedPreview(
  value: unknown,
  budget: PreviewBudget,
  depth: number,
  seen: WeakSet<object>,
  key?: string
): unknown {
  if (budget.remaining <= 0) {
    budget.truncated = true;
    return truncatedDisplayValue;
  }
  if (key && sensitiveNames.test(key)) {
    budget.remaining -= redactedDisplayValue.length;
    return redactedDisplayValue;
  }
  if (value === null) {
    budget.remaining -= 4;
    return null;
  }
  if (Buffer.isBuffer(value)) {
    budget.remaining -= 32;
    return { sizeBytes: value.byteLength, type: "buffer" };
  }
  if (typeof value === "string") {
    const output = value.length <= maxStringChars
      ? value
      : `${value.slice(0, maxStringChars)}…[${value.length - maxStringChars} chars truncated]`;
    budget.remaining -= Math.min(maxStringChars, output.length) * 2;
    if (output.length !== value.length) budget.truncated = true;
    return output;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    budget.remaining -= 16;
    return value;
  }
  if (typeof value === "bigint") {
    budget.remaining -= 32;
    return value.toString();
  }
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (depth >= maxDepth) {
    budget.truncated = true;
    return truncatedDisplayValue;
  }
  if (seen.has(value)) {
    budget.truncated = true;
    return "[circular]";
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const output = value
        .slice(0, maxArrayItems)
        .map((item) => boundedPreview(item, budget, depth + 1, seen));
      if (value.length > maxArrayItems) {
        output.push(`[${value.length - maxArrayItems} items omitted]`);
        budget.truncated = true;
      }
      return output;
    }

    const output: Record<string, unknown> = {};
    const record = value as Record<string, unknown>;
    let entryCount = 0;
    let omitted = false;
    for (const entryKey in record) {
      if (!Object.prototype.hasOwnProperty.call(record, entryKey)) {
        continue;
      }
      if (entryCount >= maxObjectEntries) {
        omitted = true;
        break;
      }
      output[entryKey] = boundedPreview(record[entryKey], budget, depth + 1, seen, entryKey);
      entryCount += 1;
      if (budget.remaining <= 0) break;
    }
    if (omitted) {
      output[truncatedDisplayValue] = "additional fields omitted";
      budget.truncated = true;
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

function pathContainsSensitiveName(path: string): boolean {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .some((part) => sensitiveNames.test(part));
}

function normalizePath(value: string): string {
  const path = value.trim();
  if (!path) return "/";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized.length <= maxStringChars
    ? normalized
    : `${normalized.slice(0, maxStringChars)}…`;
}

function jsonByteLength(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return maxTraceBytes;
  }
}
