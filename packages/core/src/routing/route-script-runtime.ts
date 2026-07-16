import { createHash } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import {
  ROUTER_SCRIPT_API_VERSION,
  ROUTER_SCRIPT_MAX_TIMEOUT_MS,
  ROUTER_SCRIPT_MAX_SOURCE_BYTES,
  type RouteScriptValidationResult,
  type RouterRule,
  type RouterRuleScript
} from "@ccr/core/contracts/app";
import type { RouteScriptInput } from "@ccr/core/routing/route-script-context";
import type {
  ResolvedRouteScript,
  RouteScriptWorkerRequest,
  RouteScriptWorkerResponse
} from "@ccr/core/routing/route-script-worker-protocol";

const defaultWorkerCount = 2;
const maxPendingRequests = 64;
const circuitFailureThreshold = 3;
const circuitWindowMs = 60_000;
const circuitOpenMs = 30_000;
const workerOldGenerationMb = 64;
const workerYoungGenerationMb = 16;

export type RouteScriptExecutionResult = {
  durationMs: number;
  error?: string;
  status: "circuit-open" | "error" | "ok" | "queue-full" | "timeout";
  value?: unknown;
};

export type RouteScriptRuntimeOptions = {
  workerCount?: number;
  workerFile?: string;
};

export type RouteScriptExecutionOptions = {
  circuitBreaker?: boolean;
};

type PendingRequest = {
  reject: (error: Error) => void;
  resolve: (response: RouteScriptWorkerResponse) => void;
  timer: NodeJS.Timeout;
};

type CircuitState = {
  failures: number[];
  openUntil: number;
};

export class RouteScriptRuntime {
  private readonly circuitStates = new Map<string, CircuitState>();
  private nextRequestId = 0;
  private readonly slots: RouteScriptWorkerSlot[];
  private readonly validationCache = new Map<string, RouteScriptValidationResult>();

  constructor(options: RouteScriptRuntimeOptions = {}) {
    const workerCount = Math.max(1, Math.min(4, Math.trunc(options.workerCount ?? defaultWorkerCount)));
    const workerFile = options.workerFile ?? resolveRouteScriptWorkerFile();
    this.slots = Array.from({ length: workerCount }, () => new RouteScriptWorkerSlot(workerFile));
  }

  async prepare(rules: readonly RouterRule[]): Promise<Map<string, string>> {
    const errors = new Map<string, string>();
    await Promise.all(rules.filter((rule) => rule.enabled && rule.type === "script" && rule.script).map(async (rule) => {
      const result = await this.validate(rule.script!);
      if (!result.ok) errors.set(rule.id, result.diagnostics[0]?.message ?? "Script validation failed.");
    }));
    return errors;
  }

  async validate(script: RouterRuleScript): Promise<RouteScriptValidationResult> {
    const basicError = basicScriptError(script);
    if (basicError) return { diagnostics: [{ code: "script-source-invalid", message: basicError }], ok: false };
    let resolved: ResolvedRouteScript;
    try {
      resolved = await resolveRouteScript(script);
    } catch (error) {
      return { diagnostics: [{ code: "script-source-invalid", message: formatError(error) }], ok: false };
    }
    const hash = routeScriptHash(resolved);
    const cached = this.validationCache.get(hash);
    if (cached) return cached;
    try {
      const response = await this.nextSlot().rpc({
        requestId: ++this.nextRequestId,
        script: resolved,
        type: "validate"
      }, 1_000);
      const result: RouteScriptValidationResult = response.status === "ok"
        ? { diagnostics: [], ok: true }
        : {
            diagnostics: [{
              code: response.status === "timeout" ? "script-timeout" : "script-source-invalid",
              message: response.error ?? "Script validation failed."
            }],
            ok: false
          };
      this.validationCache.set(hash, result);
      return result;
    } catch (error) {
      return {
        diagnostics: [{ code: "script-runtime-error", message: formatError(error) }],
        ok: false
      };
    }
  }

  async execute(
    ruleId: string,
    script: RouterRuleScript,
    input: RouteScriptInput,
    options: RouteScriptExecutionOptions = {}
  ): Promise<RouteScriptExecutionResult> {
    const basicError = basicScriptError(script);
    if (basicError) return { durationMs: 0, error: basicError, status: "error" };
    let resolved: ResolvedRouteScript;
    try {
      resolved = await resolveRouteScript(script);
    } catch (error) {
      return { durationMs: 0, error: formatError(error), status: "error" };
    }
    const now = Date.now();
    const circuitKey = `${ruleId}\0${routeScriptHash(resolved)}`;
    const circuitBreakerEnabled = options.circuitBreaker !== false;
    const circuit = circuitBreakerEnabled ? this.circuitStates.get(circuitKey) : undefined;
    if (circuit?.openUntil && circuit.openUntil > now) {
      return { durationMs: 0, error: "Script circuit breaker is open.", status: "circuit-open" };
    }
    if (this.pendingCount() >= maxPendingRequests) {
      if (circuitBreakerEnabled) this.recordFailure(circuitKey, Date.now());
      return { durationMs: 0, error: "Script execution queue is full.", status: "queue-full" };
    }
    try {
      const response = await this.nextSlot().rpc({
        input,
        requestId: ++this.nextRequestId,
        script: resolved,
        type: "execute"
      }, resolved.timeoutMs + 250);
      if (response.status === "ok") {
        if (circuitBreakerEnabled) this.recordSuccess(circuitKey);
        return { durationMs: response.durationMs, status: "ok", value: response.result };
      }
      if (circuitBreakerEnabled) this.recordFailure(circuitKey, Date.now());
      return {
        durationMs: response.durationMs,
        error: response.error ?? "Script execution failed.",
        status: response.status
      };
    } catch (error) {
      if (circuitBreakerEnabled) this.recordFailure(circuitKey, Date.now());
      const message = formatError(error);
      return {
        durationMs: resolved.timeoutMs,
        error: message,
        status: message.toLowerCase().includes("timeout") ? "timeout" : "error"
      };
    }
  }

  async close(): Promise<void> {
    this.circuitStates.clear();
    await Promise.all(this.slots.map((slot) => slot.close()));
    this.circuitStates.clear();
  }

  private nextSlot(): RouteScriptWorkerSlot {
    return this.slots.reduce((best, slot) => slot.pendingCount < best.pendingCount ? slot : best, this.slots[0]);
  }

  private pendingCount(): number {
    return this.slots.reduce((total, slot) => total + slot.pendingCount, 0);
  }

  private recordSuccess(circuitKey: string): void {
    this.circuitStates.delete(circuitKey);
  }

  private recordFailure(circuitKey: string, now: number): void {
    const current = this.circuitStates.get(circuitKey) ?? { failures: [], openUntil: 0 };
    const failures = [...current.failures.filter((timestamp) => now - timestamp <= circuitWindowMs), now];
    this.circuitStates.set(circuitKey, {
      failures,
      openUntil: failures.length >= circuitFailureThreshold ? now + circuitOpenMs : 0
    });
  }
}

function resolveRouteScriptWorkerFile(): string {
  const candidates = [
    path.join(__dirname, "route-script-worker.js"),
    path.join(__dirname, "runtime", "route-script-worker.js"),
    path.resolve(__dirname, "../../runtime/route-script-worker.js"),
    path.resolve(__dirname, "../../../runtime/route-script-worker.js")
  ];
  return candidates.find(existsSync) ?? candidates[0];
}

class RouteScriptWorkerSlot {
  private generation = 0;
  private inFlightCount = 0;
  private pending = new Map<number, PendingRequest>();
  private ready?: Promise<void>;
  private turn = Promise.resolve();
  private worker?: Worker;

  constructor(private readonly workerFile: string) {}

  get pendingCount(): number {
    return this.inFlightCount;
  }

  async rpc(request: RouteScriptWorkerRequest, timeoutMs: number): Promise<RouteScriptWorkerResponse> {
    const generation = this.generation;
    const previousTurn = this.turn;
    let releaseTurn!: () => void;
    this.turn = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    this.inFlightCount += 1;
    try {
      await previousTurn;
      if (generation !== this.generation) throw new Error("Route script runtime closed.");
      await this.ensureReady();
      const worker = this.worker;
      if (!worker) throw new Error("Route script worker is unavailable.");
      return await new Promise<RouteScriptWorkerResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(request.requestId);
          reject(new Error("Route script worker did not respond before the hard timeout."));
          this.failWorker(new Error("Route script worker hard timeout."));
        }, timeoutMs);
        timer.unref?.();
        this.pending.set(request.requestId, { reject, resolve, timer });
        try {
          worker.postMessage(request);
        } catch (error) {
          clearTimeout(timer);
          this.pending.delete(request.requestId);
          reject(error);
        }
      });
    } finally {
      this.inFlightCount -= 1;
      releaseTurn();
    }
  }

  async close(): Promise<void> {
    this.generation += 1;
    const pendingTurn = this.turn;
    const worker = this.worker;
    this.worker = undefined;
    this.ready = undefined;
    this.rejectPending(new Error("Route script runtime closed."));
    if (worker) await worker.terminate().catch(() => undefined);
    await pendingTurn;
  }

  private ensureReady(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      const worker = new Worker(this.workerFile, {
        resourceLimits: {
          maxOldGenerationSizeMb: workerOldGenerationMb,
          maxYoungGenerationSizeMb: workerYoungGenerationMb,
          stackSizeMb: 4
        }
      });
      this.worker = worker;
      worker.unref();
      let becameReady = false;
      const startupError = (error: Error) => reject(error);
      worker.once("error", startupError);
      worker.on("message", (message: RouteScriptWorkerResponse | { type: "ready" }) => {
        if (message.type === "ready") {
          becameReady = true;
          worker.off("error", startupError);
          resolve();
          return;
        }
        const pending = this.pending.get(message.requestId);
        if (!pending) return;
        this.pending.delete(message.requestId);
        clearTimeout(pending.timer);
        pending.resolve(message);
      });
      worker.on("error", (error) => this.failWorker(error));
      worker.on("exit", (code) => {
        if (!becameReady) {
          reject(new Error(`Route script worker exited before becoming ready with code ${code}.`));
          return;
        }
        if (worker === this.worker && code !== 0) this.failWorker(new Error(`Route script worker exited with code ${code}.`));
      });
    }).catch((error) => {
      this.failWorker(error instanceof Error ? error : new Error(String(error)));
      throw error;
    });
    return this.ready;
  }

  private failWorker(error: Error): void {
    const worker = this.worker;
    this.worker = undefined;
    this.ready = undefined;
    this.rejectPending(error);
    if (worker) void worker.terminate().catch(() => undefined);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function routeScriptHash(script: ResolvedRouteScript): string {
  return createHash("sha256")
    .update(JSON.stringify({
      source: script.source,
      timeoutMs: script.timeoutMs
    }))
    .digest("hex");
}

function basicScriptError(script: RouterRuleScript): string | undefined {
  if (script.apiVersion !== ROUTER_SCRIPT_API_VERSION || script.language !== "javascript") {
    return "Unsupported route script API or language.";
  }
  const file = script.file?.trim();
  const source = script.source;
  if (!file && source === undefined) {
    return "A local JavaScript file is required.";
  }
  if (file && !/\.(?:cjs|js|mjs)$/i.test(file)) {
    return "Route script file must use a .js, .mjs, or .cjs extension.";
  }
  if (!file && source !== undefined) {
    const bytes = Buffer.byteLength(source, "utf8");
    if (!source.trim() || bytes > ROUTER_SCRIPT_MAX_SOURCE_BYTES) {
      return `Script source must be between 1 and ${ROUTER_SCRIPT_MAX_SOURCE_BYTES} bytes.`;
    }
  }
  if (!Number.isInteger(script.timeoutMs) || script.timeoutMs < 10 || script.timeoutMs > ROUTER_SCRIPT_MAX_TIMEOUT_MS) {
    return `Script timeout must be between 10 and ${ROUTER_SCRIPT_MAX_TIMEOUT_MS} ms.`;
  }
  return undefined;
}

async function resolveRouteScript(script: RouterRuleScript): Promise<ResolvedRouteScript> {
  const file = script.file?.trim();
  if (!file) {
    return { source: script.source ?? "", timeoutMs: script.timeoutMs };
  }
  const resolvedFile = resolveScriptFilePath(file);
  let stat;
  try {
    stat = await fs.stat(resolvedFile);
  } catch (error) {
    throw new Error(`Unable to read route script file "${resolvedFile}": ${formatError(error)}`);
  }
  if (!stat.isFile()) throw new Error(`Route script path "${resolvedFile}" is not a file.`);
  if (stat.size > ROUTER_SCRIPT_MAX_SOURCE_BYTES) {
    throw new Error(`Route script file exceeds ${ROUTER_SCRIPT_MAX_SOURCE_BYTES} bytes.`);
  }
  const source = await fs.readFile(resolvedFile, "utf8");
  const bytes = Buffer.byteLength(source, "utf8");
  if (!source.trim() || bytes > ROUTER_SCRIPT_MAX_SOURCE_BYTES) {
    throw new Error(`Route script file must contain between 1 and ${ROUTER_SCRIPT_MAX_SOURCE_BYTES} bytes.`);
  }
  return { source, timeoutMs: script.timeoutMs };
}

function resolveScriptFilePath(file: string): string {
  if (file.includes("\0")) throw new Error("Route script file path is invalid.");
  if (file === "~") return path.resolve(os.homedir());
  if (file.startsWith("~/") || file.startsWith("~\\")) {
    return path.resolve(os.homedir(), file.slice(2));
  }
  return path.resolve(file);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
