import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { parentPort } from "node:worker_threads";
import type {
  RouteScriptWorkerRequest,
  RouteScriptWorkerResponse
} from "@ccr/core/routing/route-script-worker-protocol";

const maxFileBytes = 1024 * 1024;
const maxFetchBodyBytes = 256 * 1024;
const maxFetchResponseBytes = 1024 * 1024;
const maxResultBytes = 64 * 1024;
const maxDirectoryEntries = 256;

let queue = Promise.resolve();

parentPort?.postMessage({ type: "ready" });
parentPort?.on("message", (message: RouteScriptWorkerRequest) => {
  queue = queue
    .then(async () => {
      const response = await evaluateRequest(message);
      parentPort?.postMessage(response);
    })
    .catch((error) => {
      parentPort?.postMessage(failureResponse(message.requestId, performance.now(), formatError(error)));
    });
});

async function evaluateRequest(request: RouteScriptWorkerRequest): Promise<RouteScriptWorkerResponse> {
  const startedAt = performance.now();
  try {
    const context = vm.createContext(Object.create(null), {
      codeGeneration: { strings: false, wasm: false },
      name: `route-script-${request.requestId}`
    });
    const route = compileScript(request.script.source, request.requestId, context);
    if (request.type === "validate") return successResponse(request.requestId, startedAt);
    if (!request.input) return failureResponse(request.requestId, startedAt, "Script input is required.");

    const deadline = Date.now() + request.script.timeoutMs;
    Object.assign(context, {
      __routeBridge: createRouteScriptBridge(deadline),
      __routeEnvironmentJson: JSON.stringify(routeScriptEnvironment()),
      __routeFunction: route,
      __routeInputJson: JSON.stringify(request.input)
    });

    const invocation = new vm.Script(routeInvocationSource, {
      filename: `route-script-${request.requestId}.js`
    });
    const synchronousBudget = Math.max(1, request.script.timeoutMs);
    const pendingResult = invocation.runInContext(context, { timeout: synchronousBudget });
    const result = await withDeadline(Promise.resolve(pendingResult), deadline);
    return successResponse(request.requestId, startedAt, serializeResult(result));
  } catch (error) {
    return failureResponse(
      request.requestId,
      startedAt,
      formatError(error),
      isTimeoutError(error)
    );
  }
}

function compileScript(source: string, requestId: number, context: vm.Context): Function {
  return vm.compileFunction(
    `"use strict";\nreturn (async () => {\n${source}\n})();`,
    ["input", "api"],
    {
      filename: `route-script-${requestId}.js`,
      parsingContext: context
    }
  );
}

const routeInvocationSource = `(() => {
  "use strict";
  const bridge = globalThis.__routeBridge;
  const environmentJson = globalThis.__routeEnvironmentJson;
  const inputJson = globalThis.__routeInputJson;
  const route = globalThis.__routeFunction;
  delete globalThis.__routeBridge;
  delete globalThis.__routeEnvironmentJson;
  delete globalThis.__routeFunction;
  delete globalThis.__routeInputJson;

  const deepFreeze = (value) => {
    if ((typeof value === "object" || typeof value === "function") && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const nested of Object.values(value)) deepFreeze(nested);
    }
    return value;
  };
  const call = async (method, args) => {
    try {
      const encoded = await bridge.invoke(method, JSON.stringify(args));
      return JSON.parse(encoded).value;
    } catch (error) {
      const message = error && typeof error.message === "string" ? error.message : String(error);
      throw new Error(message);
    }
  };
  const environment = deepFreeze(JSON.parse(environmentJson));
  const hash = (value) => {
    const text = String(value);
    let output = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      output ^= text.charCodeAt(index);
      output = Math.imul(output, 16777619);
    }
    return output >>> 0;
  };
  const api = deepFreeze({
    env: (name) => {
      const key = String(name);
      return Object.hasOwn(environment, key) ? environment[key] : undefined;
    },
    fetch: (url, options) => call("fetch", [url, options]),
    fs: {
      exists: (file) => call("fs.exists", [file]),
      list: (directory) => call("fs.list", [directory]),
      readJson: (file) => call("fs.readJson", [file]),
      readText: (file) => call("fs.readText", [file]),
      stat: (file) => call("fs.stat", [file]),
      writeJson: (file, value) => call("fs.writeJson", [file, value]),
      writeText: (file, value) => call("fs.writeText", [file, value])
    },
    hash
  });
  const input = deepFreeze(JSON.parse(inputJson));
  return route(input, api);
})()`;

function createRouteScriptBridge(deadline: number): Readonly<Record<string, unknown>> {
  const methods: Record<string, (...args: unknown[]) => unknown> = {
    "fetch": (url, options) => controlledFetch(String(url), options, deadline),
    "fs.exists": async (file) => {
      const value = String(file);
      try {
        await fs.access(resolveScriptPath(value));
        return true;
      } catch {
        return false;
      }
    },
    "fs.list": async (directory) => {
      const target = resolveScriptPath(String(directory));
      const entries = await fs.readdir(target, { withFileTypes: true });
      if (entries.length > maxDirectoryEntries) {
        throw new Error(`Directory contains more than ${maxDirectoryEntries} entries.`);
      }
      return entries.map((entry) => ({
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        isSymbolicLink: entry.isSymbolicLink(),
        name: entry.name
      }));
    },
    "fs.readJson": async (file) => JSON.parse(await readTextFile(String(file))),
    "fs.readText": async (file) => readTextFile(String(file)),
    "fs.stat": async (file) => {
      const target = resolveScriptPath(String(file));
      const value = await fs.stat(target);
      return {
        isDirectory: value.isDirectory(),
        isFile: value.isFile(),
        modifiedAt: value.mtime.toISOString(),
        size: value.size
      };
    },
    "fs.writeJson": async (file, value) => writeTextFile(String(file), `${JSON.stringify(value, null, 2)}\n`),
    "fs.writeText": async (file, value) => writeTextFile(String(file), String(value))
  };
  return Object.freeze({
    invoke: async (method: unknown, encodedArguments: unknown) => {
      if (typeof method !== "string" || typeof encodedArguments !== "string" || !Object.hasOwn(methods, method)) {
        throw new Error("Unsupported route script capability call.");
      }
      const parsed = JSON.parse(encodedArguments) as unknown;
      if (!Array.isArray(parsed)) throw new Error("Route script capability arguments must be an array.");
      const value = await methods[method](...parsed);
      return JSON.stringify({ value });
    }
  });
}

function routeScriptEnvironment(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

async function controlledFetch(
  rawUrl: string,
  rawOptions: unknown,
  deadline: number
): Promise<Record<string, unknown>> {
  assertHttpUrl(rawUrl);
  const options = isRecord(rawOptions) ? rawOptions : {};
  const method = typeof options.method === "string" ? options.method.toUpperCase() : "GET";
  const body = typeof options.body === "string" ? options.body : undefined;
  if (body !== undefined && Buffer.byteLength(body, "utf8") > maxFetchBodyBytes) {
    throw new Error(`Fetch request body exceeds ${maxFetchBodyBytes} bytes.`);
  }
  const headers = normalizeFetchHeaders(options.headers);
  const controller = new AbortController();
  const remainingMs = Math.max(1, deadline - Date.now());
  const timer = setTimeout(() => controller.abort(), remainingMs);
  try {
    const response = await fetch(rawUrl, {
      body,
      headers,
      method,
      redirect: "manual",
      signal: controller.signal
    });
    const responseBody = await readResponseBody(response);
    return {
      body: responseBody,
      headers: Object.fromEntries(response.headers.entries()),
      ok: response.ok,
      redirected: response.redirected,
      status: response.status,
      statusText: response.statusText,
      url: response.url
    };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeFetchHeaders(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (typeof headerValue === "string") headers[key] = headerValue;
  }
  return headers;
}

async function readResponseBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxFetchResponseBytes) {
    await response.body?.cancel();
    throw new Error(`Fetch response exceeds ${maxFetchResponseBytes} bytes.`);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxFetchResponseBytes) {
      await reader.cancel();
      throw new Error(`Fetch response exceeds ${maxFetchResponseBytes} bytes.`);
    }
    chunks.push(value);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(output);
}

async function readTextFile(file: string): Promise<string> {
  const target = resolveScriptPath(file);
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw new Error(`"${file}" is not a file.`);
  if (stat.size > maxFileBytes) throw new Error(`File exceeds ${maxFileBytes} bytes.`);
  return await fs.readFile(target, "utf8");
}

async function writeTextFile(file: string, value: string): Promise<void> {
  if (Buffer.byteLength(value, "utf8") > maxFileBytes) throw new Error(`File exceeds ${maxFileBytes} bytes.`);
  const target = resolveScriptPath(file);
  await fs.writeFile(target, value, "utf8");
}

function resolveScriptPath(file: string): string {
  if (typeof file !== "string" || !file.trim() || file.includes("\0")) {
    throw new Error("A valid filesystem path is required.");
  }
  if (file === "~") return path.resolve(os.homedir());
  if (file.startsWith("~/") || file.startsWith("~\\")) {
    return path.resolve(os.homedir(), file.slice(2));
  }
  return path.resolve(file);
}

function assertHttpUrl(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL "${rawUrl}".`);
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || !url.hostname) {
    throw new Error("Only HTTP(S) URLs without embedded credentials are supported.");
  }
}

function serializeResult(value: unknown): unknown {
  if (value === undefined) return undefined;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Script result must be JSON serializable.");
  if (Buffer.byteLength(encoded, "utf8") > maxResultBytes) {
    throw new Error(`Script result exceeds ${maxResultBytes} bytes.`);
  }
  return JSON.parse(encoded);
}

async function withDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remainingMs = Math.max(1, deadline - Date.now());
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(timeoutError()), remainingMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function successResponse(requestId: number, startedAt: number, result?: unknown): RouteScriptWorkerResponse {
  return {
    durationMs: Math.max(0, performance.now() - startedAt),
    requestId,
    ...(result === undefined ? {} : { result }),
    status: "ok",
    type: "response"
  };
}

function failureResponse(
  requestId: number,
  startedAt: number,
  error: string,
  timeout = false
): RouteScriptWorkerResponse {
  return {
    durationMs: Math.max(0, performance.now() - startedAt),
    error,
    requestId,
    status: timeout ? "timeout" : "error",
    type: "response"
  };
}

function timeoutError(): Error {
  const error = new Error("Route script execution timed out.");
  error.name = "RouteScriptTimeoutError";
  return error;
}

function isTimeoutError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : isRecord(error) && typeof error.name === "string" ? error.name : "";
  const message = error instanceof Error ? error.message : isRecord(error) && typeof error.message === "string" ? error.message : String(error);
  return name === "RouteScriptTimeoutError" || message.includes("Script execution timed out");
}

function formatError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (isRecord(error) && typeof error.message === "string") {
    return `${typeof error.name === "string" ? error.name : "Error"}: ${error.message}`;
  }
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
