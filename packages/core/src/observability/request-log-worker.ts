import { closeSync, fstatSync, openSync, readSync, realpathSync } from "node:fs";
import { resolve as pathResolve, sep as pathSep } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { parentPort, workerData } from "node:worker_threads";
import { RAW_TRACE_SPOOL_DIR } from "@ccr/core/config/constants";
import {
  RequestLogStore,
  type RequestLogRawTraceFile,
  type RequestLogRecordInput,
  type RequestLogStoreWriteCommand
} from "@ccr/core/observability/request-log-store";
import { resolveRawTraceBodyLimit } from "@ccr/core/observability/request-log-limits";
import { compactBase64ImagePayloads } from "@ccr/core/observability/request-log-body";
import { preloadUsagePriceCatalog } from "@ccr/core/models/pricing-service";

type WorkerConfiguration = {
  dbFile: string;
  mode: "query" | "writer";
  rawTraceSpoolDir?: string;
};

type WorkerMessage = {
  args?: unknown[];
  batchId?: number;
  commands?: RequestLogStoreWriteCommand[];
  method?: string;
  requestId?: number;
  revision?: number;
  type: "batch" | "request";
};

const configuration = workerData as WorkerConfiguration;
const store = new RequestLogStore(configuration.dbFile);
let chain = Promise.resolve();
let pricingBackfillActive = false;
let pricingRefreshPromise: Promise<void> | undefined;
let queryRevision = -1;
let shuttingDown = false;

void store.initialize().then(() => {
  parentPort?.postMessage({ type: "ready" });
  parentPort?.on("message", (message: WorkerMessage) => {
    chain = chain.then(() => handleMessage(message)).catch((error) => {
      const detail = formatError(error);
      if (message.type === "batch") {
        parentPort?.postMessage({ batchId: message.batchId, error: detail, type: "batch-error" });
      } else {
        parentPort?.postMessage({ error: detail, requestId: message.requestId, type: "response" });
      }
    });
  });
}).catch((error) => {
  throw error;
});

async function handleMessage(message: WorkerMessage): Promise<void> {
  if (message.type === "batch") {
    if (configuration.mode !== "writer") throw new Error("Query worker cannot process writes.");
    const commands = message.commands ?? [];
    const result = await store.writeBatch(commands.map(reviveCommand));
    parentPort?.postMessage({ batchId: message.batchId, type: "ack" });
    if (result.pricingRefreshNeeded) schedulePricingRefresh();
    return;
  }

  const args = message.args ?? [];
  if (configuration.mode === "query" && message.revision !== undefined && message.revision !== queryRevision) {
    queryRevision = message.revision;
    store.invalidateAnalysisCache();
  }
  let result: unknown;
  switch (message.method) {
    case "analyze":
      result = await store.analyze(args[0] as Parameters<RequestLogStore["analyze"]>[0]);
      break;
    case "flush":
      await store.checkpoint();
      result = true;
      break;
    case "getDetail":
      result = await store.getDetail(args[0] as Parameters<RequestLogStore["getDetail"]>[0]);
      break;
    case "getTracePayload":
      result = await store.getTracePayload(args[0] as Parameters<RequestLogStore["getTracePayload"]>[0]);
      break;
    case "list":
      result = await store.list(args[0] as Parameters<RequestLogStore["list"]>[0]);
      break;
    case "shutdown":
      shuttingDown = true;
      await store.close();
      result = true;
      break;
    default:
      throw new Error(`Unknown request log worker method: ${message.method ?? ""}`);
  }
  parentPort?.postMessage({ requestId: message.requestId, result, type: "response" });
  if (message.method === "shutdown") parentPort?.close();
}

function schedulePricingRefresh(): void {
  if (shuttingDown || pricingRefreshPromise) return;
  pricingRefreshPromise = preloadUsagePriceCatalog()
    .then(() => {
      if (shuttingDown) return;
      schedulePricingBackfillPage();
    })
    .catch((error) => {
      console.warn(`[request-log] Failed to refresh pricing catalog: ${formatError(error)}`);
    })
    .finally(() => {
      pricingRefreshPromise = undefined;
    });
}

function schedulePricingBackfillPage(beforeId?: number): void {
  if (shuttingDown || (pricingBackfillActive && beforeId === undefined)) return;
  pricingBackfillActive = true;
  chain = chain.then(async () => {
    if (shuttingDown) {
      pricingBackfillActive = false;
      return;
    }
    const page = await store.backfillMissingUsageCostsPage({ beforeId });
    if (page.updated > 0) parentPort?.postMessage({ type: "maintenance", updated: page.updated });
    if (page.nextBeforeId === undefined) {
      pricingBackfillActive = false;
      return;
    }
    // Yield between pages so normal log writes already queued by the parent can
    // run before the next maintenance batch.
    setImmediate(() => schedulePricingBackfillPage(page.nextBeforeId));
  }).catch((error) => {
    pricingBackfillActive = false;
    console.warn(`[request-log] Failed to backfill usage costs: ${formatError(error)}`);
  });
}

function reviveCommand(command: RequestLogStoreWriteCommand): RequestLogStoreWriteCommand {
  if (command.kind === "raw-trace-update") {
    const input = { ...command.input };
    const maxBodyBytes = resolveRawTraceBodyLimit(command.rawTraceFiles?.maxBodyBytes);
    if (command.rawTraceFiles?.requestBody) {
      const body = readRawTraceBody(command.rawTraceFiles.requestBody, maxBodyBytes);
      if (body) {
        input.requestBodyContentType = body.contentType ?? input.requestBodyContentType;
        input.requestBodySizeBytes = body.sizeBytes;
        input.requestBodyTruncated = body.truncated;
        if (shouldApplyRawTraceBodyText(body)) input.requestBodyText = body.text;
      }
    }
    if (command.rawTraceFiles?.responseBody) {
      const body = readRawTraceBody(command.rawTraceFiles.responseBody, maxBodyBytes);
      if (body) {
        input.responseBodyContentType = body.contentType ?? input.responseBodyContentType;
        input.responseBodySizeBytes = body.sizeBytes;
        input.responseBodyTruncated = body.truncated;
        if (shouldApplyRawTraceBodyText(body)) input.responseBodyText = body.text;
      }
    }
    return {
      input,
      kind: "raw-trace-update",
      sequence: command.sequence
    };
  }
  const input = command.input as RequestLogRecordInput & { requestBody: Buffer | Uint8Array };
  return {
    ...command,
    input: {
      ...input,
      requestBody: Buffer.isBuffer(input.requestBody) ? input.requestBody : Buffer.from(input.requestBody)
    }
  };
}

function readRawTraceBody(
  file: RequestLogRawTraceFile,
  maxBodyBytes: number
): (RequestLogRawTraceFile & { text: string }) | undefined {
  let descriptor: number | undefined;
  try {
    const filePath = verifiedRawTracePath(file.filePath);
    descriptor = openSync(filePath, "r");
    const storedBytes = fstatSync(descriptor).size;
    const captureBytes = Math.min(storedBytes, maxBodyBytes);
    const buffer = Buffer.allocUnsafe(captureBytes);
    let offset = 0;
    while (offset < captureBytes) {
      const bytesRead = readSync(descriptor, buffer, offset, captureBytes - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const captured = offset === buffer.byteLength ? buffer : buffer.subarray(0, offset);
    const compacted = compactBase64ImagePayloads(captured);
    return {
      ...file,
      filePath,
      sizeBytes: Math.max(file.sizeBytes, storedBytes),
      text: new StringDecoder("utf8").write(compacted.buffer),
      truncated: Boolean(file.truncated) || compacted.compacted ||
        offset < Math.max(file.sizeBytes, storedBytes)
    };
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function shouldApplyRawTraceBodyText(body: RequestLogRawTraceFile & { text: string }): boolean {
  if (!body.truncated) return true;
  const contentType = body.contentType?.split(";", 1)[0].trim().toLowerCase() ?? "";
  const firstContentIndex = skipJsonWhitespace(body.text, 0);
  const firstContent = body.text.charCodeAt(firstContentIndex);
  const jsonLike = contentType === "application/json" || contentType.endsWith("+json") ||
    firstContent === 0x7b || firstContent === 0x5b;
  if (!jsonLike) return true;
  return isCompleteJsonContainer(body.text, firstContentIndex);
}

function isCompleteJsonContainer(value: string, start: number): boolean {
  const first = value.charCodeAt(start);
  if (first !== 0x7b && first !== 0x5b) return false;
  const stack: number[] = [first];
  let escaped = false;
  let inString = false;
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value.charCodeAt(index);
    if (inString) {
      if (escaped) escaped = false;
      else if (character === 0x5c) escaped = true;
      else if (character === 0x22) inString = false;
      continue;
    }
    if (character === 0x22) {
      inString = true;
      continue;
    }
    if (character === 0x7b || character === 0x5b) {
      stack.push(character);
      continue;
    }
    if (character !== 0x7d && character !== 0x5d) continue;
    const open = stack.pop();
    if ((character === 0x7d && open !== 0x7b) || (character === 0x5d && open !== 0x5b)) return false;
    if (stack.length === 0) return skipJsonWhitespace(value, index + 1) === value.length;
  }
  return false;
}

function skipJsonWhitespace(value: string, start: number): number {
  let index = start;
  while (index < value.length) {
    const character = value.charCodeAt(index);
    if (character !== 0x20 && character !== 0x09 && character !== 0x0a && character !== 0x0d) break;
    index += 1;
  }
  return index;
}

function verifiedRawTracePath(value: string): string {
  const spoolDirectory = realpathSync(configuration.rawTraceSpoolDir ?? RAW_TRACE_SPOOL_DIR);
  const candidate = realpathSync(pathResolve(value));
  if (candidate === spoolDirectory || !candidate.startsWith(`${spoolDirectory}${pathSep}`)) {
    throw new Error(`Raw trace path is outside the configured spool directory: ${value}`);
  }
  return candidate;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack || error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "") || undefined
    : undefined;
}
