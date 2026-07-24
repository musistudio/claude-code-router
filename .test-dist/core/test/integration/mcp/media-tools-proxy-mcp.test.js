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

// packages/core/test/integration/mcp/media-tools-proxy-mcp.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_child_process = require("node:child_process");
var import_node_http = require("node:http");
var import_node_path = __toESM(require("node:path"), 1);
var import_node_test = __toESM(require("node:test"), 1);
(0, import_node_test.default)("media tools stdio proxy exposes its compiled catalog and forwards calls with CCR auth", async (t) => {
  const seen = { authorization: "", payload: void 0 };
  const server = (0, import_node_http.createServer)(async (request, response) => {
    seen.authorization = request.headers.authorization ?? "";
    seen.payload = JSON.parse(await consume(request));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      id: seen.payload.id,
      jsonrpc: "2.0",
      result: { content: [{ text: "generated", type: "text" }] }
    }));
  });
  try {
    await listen(server);
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES") {
      t.skip(`Local HTTP listen is unavailable: ${error.message}`);
      return;
    }
    throw error;
  }
  t.after(() => server.close());
  const address = server.address();
  import_strict.default.ok(address && typeof address === "object");
  const runtime = import_node_path.default.join(process.cwd(), ".test-dist", "core", "runtime", "media-tools-proxy-mcp.js");
  const child = (0, import_node_child_process.spawn)(process.execPath, [runtime], {
    env: {
      ...process.env,
      CCR_MEDIA_MCP_API_KEY: "ccr-profile-test",
      CCR_MEDIA_MCP_REQUEST_TIMEOUT_MS: "5000",
      CCR_MEDIA_MCP_TOOLS_JSON: JSON.stringify([{
        description: "Generate an image.",
        inputSchema: { properties: { prompt: { type: "string" } }, required: ["prompt"], type: "object" },
        name: "image_generate_glm_5_2v"
      }]),
      CCR_MEDIA_MCP_URL: `http://127.0.0.1:${address.port}/mcp`,
      ELECTRON_RUN_AS_NODE: "1"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(() => {
    if (!child.killed) child.kill();
  });
  const listed = await sendJsonRpc(child, { id: 1, jsonrpc: "2.0", method: "tools/list", params: {} });
  import_strict.default.deepEqual(listed.result.tools.map((tool) => tool.name), ["image_generate_glm_5_2v"]);
  const called = await sendJsonRpc(child, {
    id: 2,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: { prompt: "A blue cup" },
      name: "image_generate_glm_5_2v"
    }
  });
  import_strict.default.equal(called.result.content[0].text, "generated");
  import_strict.default.equal(seen.authorization, "Bearer ccr-profile-test");
  import_strict.default.equal(seen.payload.method, "tools/call");
  import_strict.default.equal(seen.payload.params.name, "image_generate_glm_5_2v");
});
function sendJsonRpc(child, payload) {
  return new Promise((resolve, reject) => {
    let stdout = Buffer.alloc(0);
    let stderr = "";
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
      child.off("error", onError);
    };
    const finish = (value) => {
      cleanup();
      resolve(value);
    };
    const fail = (error) => {
      cleanup();
      reject(error);
    };
    const onStdout = (chunk) => {
      stdout = Buffer.concat([stdout, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      const parsed = readJsonRpcFrame(stdout);
      if (parsed) finish(parsed);
    };
    const onStderr = (chunk) => {
      stderr += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    };
    const onExit = (code, signal) => fail(new Error(`media tools proxy exited before response: code=${code ?? ""} signal=${signal ?? ""} stderr=${stderr}`));
    const onError = (error) => fail(error);
    const timer = setTimeout(() => fail(new Error(`Timed out waiting for media tools proxy response. stderr=${stderr}`)), 5e3);
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("exit", onExit);
    child.once("error", onError);
    const message = Buffer.from(JSON.stringify(payload), "utf8");
    child.stdin.write(`Content-Length: ${message.byteLength}\r
\r
`);
    child.stdin.write(message);
  });
}
function readJsonRpcFrame(buffer) {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd < 0) return void 0;
  const header = buffer.subarray(0, headerEnd).toString("utf8");
  const match = header.match(/content-length:\s*(\d+)/i);
  if (!match) throw new Error(`Missing Content-Length in MCP response: ${header}`);
  const length = Number(match[1]);
  const bodyStart = headerEnd + 4;
  const bodyEnd = bodyStart + length;
  if (buffer.length < bodyEnd) return void 0;
  return JSON.parse(buffer.subarray(bodyStart, bodyEnd).toString("utf8"));
}
function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}
function consume(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.once("error", reject);
    request.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
