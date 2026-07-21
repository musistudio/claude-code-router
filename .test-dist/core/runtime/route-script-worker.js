"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// packages/core/src/routing/route-script-worker.ts
var import_node_fs = require("node:fs");
var import_node_os = __toESM(require("node:os"));
var import_node_path = __toESM(require("node:path"));
var import_node_vm = __toESM(require("node:vm"));
var import_node_worker_threads = require("node:worker_threads");
var maxFileBytes = 1024 * 1024;
var maxFetchBodyBytes = 256 * 1024;
var maxFetchResponseBytes = 1024 * 1024;
var maxResultBytes = 64 * 1024;
var maxDirectoryEntries = 256;
var queue = Promise.resolve();
import_node_worker_threads.parentPort?.postMessage({ type: "ready" });
import_node_worker_threads.parentPort?.on("message", (message) => {
  queue = queue.then(async () => {
    const response = await evaluateRequest(message);
    import_node_worker_threads.parentPort?.postMessage(response);
  }).catch((error) => {
    import_node_worker_threads.parentPort?.postMessage(failureResponse(message.requestId, performance.now(), formatError(error)));
  });
});
async function evaluateRequest(request) {
  const startedAt = performance.now();
  try {
    const context = import_node_vm.default.createContext(/* @__PURE__ */ Object.create(null), {
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
    const invocation = new import_node_vm.default.Script(routeInvocationSource, {
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
function compileScript(source, requestId, context) {
  return import_node_vm.default.compileFunction(
    `"use strict";
return (async () => {
${source}
})();`,
    ["input", "api"],
    {
      filename: `route-script-${requestId}.js`,
      parsingContext: context
    }
  );
}
var routeInvocationSource = `(() => {
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
function createRouteScriptBridge(deadline) {
  const methods = {
    "fetch": (url, options) => controlledFetch(String(url), options, deadline),
    "fs.exists": async (file) => {
      const value = String(file);
      try {
        await import_node_fs.promises.access(resolveScriptPath(value));
        return true;
      } catch {
        return false;
      }
    },
    "fs.list": async (directory) => {
      const target = resolveScriptPath(String(directory));
      const entries = await import_node_fs.promises.readdir(target, { withFileTypes: true });
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
      const value = await import_node_fs.promises.stat(target);
      return {
        isDirectory: value.isDirectory(),
        isFile: value.isFile(),
        modifiedAt: value.mtime.toISOString(),
        size: value.size
      };
    },
    "fs.writeJson": async (file, value) => writeTextFile(String(file), `${JSON.stringify(value, null, 2)}
`),
    "fs.writeText": async (file, value) => writeTextFile(String(file), String(value))
  };
  return Object.freeze({
    invoke: async (method, encodedArguments) => {
      if (typeof method !== "string" || typeof encodedArguments !== "string" || !Object.hasOwn(methods, method)) {
        throw new Error("Unsupported route script capability call.");
      }
      const parsed = JSON.parse(encodedArguments);
      if (!Array.isArray(parsed)) throw new Error("Route script capability arguments must be an array.");
      const value = await methods[method](...parsed);
      return JSON.stringify({ value });
    }
  });
}
function routeScriptEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter((entry) => typeof entry[1] === "string"));
}
async function controlledFetch(rawUrl, rawOptions, deadline) {
  assertHttpUrl(rawUrl);
  const options = isRecord(rawOptions) ? rawOptions : {};
  const method = typeof options.method === "string" ? options.method.toUpperCase() : "GET";
  const body = typeof options.body === "string" ? options.body : void 0;
  if (body !== void 0 && Buffer.byteLength(body, "utf8") > maxFetchBodyBytes) {
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
function normalizeFetchHeaders(value) {
  if (!isRecord(value)) return void 0;
  const headers = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (typeof headerValue === "string") headers[key] = headerValue;
  }
  return headers;
}
async function readResponseBody(response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxFetchResponseBytes) {
    await response.body?.cancel();
    throw new Error(`Fetch response exceeds ${maxFetchResponseBytes} bytes.`);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
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
async function readTextFile(file) {
  const target = resolveScriptPath(file);
  const stat = await import_node_fs.promises.stat(target);
  if (!stat.isFile()) throw new Error(`"${file}" is not a file.`);
  if (stat.size > maxFileBytes) throw new Error(`File exceeds ${maxFileBytes} bytes.`);
  return await import_node_fs.promises.readFile(target, "utf8");
}
async function writeTextFile(file, value) {
  if (Buffer.byteLength(value, "utf8") > maxFileBytes) throw new Error(`File exceeds ${maxFileBytes} bytes.`);
  const target = resolveScriptPath(file);
  await import_node_fs.promises.writeFile(target, value, "utf8");
}
function resolveScriptPath(file) {
  if (typeof file !== "string" || !file.trim() || file.includes("\0")) {
    throw new Error("A valid filesystem path is required.");
  }
  if (file === "~") return import_node_path.default.resolve(import_node_os.default.homedir());
  if (file.startsWith("~/") || file.startsWith("~\\")) {
    return import_node_path.default.resolve(import_node_os.default.homedir(), file.slice(2));
  }
  return import_node_path.default.resolve(file);
}
function assertHttpUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL "${rawUrl}".`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:" || url.username || url.password || !url.hostname) {
    throw new Error("Only HTTP(S) URLs without embedded credentials are supported.");
  }
}
function serializeResult(value) {
  if (value === void 0) return void 0;
  const encoded = JSON.stringify(value);
  if (encoded === void 0) throw new Error("Script result must be JSON serializable.");
  if (Buffer.byteLength(encoded, "utf8") > maxResultBytes) {
    throw new Error(`Script result exceeds ${maxResultBytes} bytes.`);
  }
  return JSON.parse(encoded);
}
async function withDeadline(promise, deadline) {
  const remainingMs = Math.max(1, deadline - Date.now());
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(timeoutError()), remainingMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function successResponse(requestId, startedAt, result) {
  return {
    durationMs: Math.max(0, performance.now() - startedAt),
    requestId,
    ...result === void 0 ? {} : { result },
    status: "ok",
    type: "response"
  };
}
function failureResponse(requestId, startedAt, error, timeout = false) {
  return {
    durationMs: Math.max(0, performance.now() - startedAt),
    error,
    requestId,
    status: timeout ? "timeout" : "error",
    type: "response"
  };
}
function timeoutError() {
  const error = new Error("Route script execution timed out.");
  error.name = "RouteScriptTimeoutError";
  return error;
}
function isTimeoutError(error) {
  const name = error instanceof Error ? error.name : isRecord(error) && typeof error.name === "string" ? error.name : "";
  const message = error instanceof Error ? error.message : isRecord(error) && typeof error.message === "string" ? error.message : String(error);
  return name === "RouteScriptTimeoutError" || message.includes("Script execution timed out");
}
function formatError(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (isRecord(error) && typeof error.message === "string") {
    return `${typeof error.name === "string" ? error.name : "Error"}: ${error.message}`;
  }
  return String(error);
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
