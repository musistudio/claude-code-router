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

// packages/core/test/integration/mcp/toolhub-mcp-runtime.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_child_process = require("node:child_process");
var import_node_events = require("node:events");
var import_node_fs = require("node:fs");
var import_node_http = require("node:http");
var import_node_path = __toESM(require("node:path"), 1);
var import_node_test = __toESM(require("node:test"), 1);
(0, import_node_test.default)("ToolHub MCP runtime source keeps a shebang for direct MCP Inspector execution", () => {
  const source = (0, import_node_fs.readFileSync)(import_node_path.default.join(process.cwd(), "packages", "core", "src", "mcp", "toolhub-mcp.ts"), "utf8");
  import_strict.default.equal(source.startsWith("#!/usr/bin/env node\n"), true);
});
(0, import_node_test.default)("built ToolHub MCP runtime accepts newline JSON stdio used by MCP Inspector", async (t) => {
  const runtime = toolHubRuntimePath();
  if (!(0, import_node_fs.existsSync)(runtime)) {
    t.skip("ToolHub MCP runtime has not been built.");
    return;
  }
  const child = (0, import_node_child_process.spawn)(process.execPath, [runtime], {
    env: {
      ...process.env,
      TOOLHUB_MCP_SERVERS_JSON: "[]"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const stderr = [];
  let stdout = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out waiting for ToolHub MCP newline response. stderr: ${stderr.join("")}`));
    }, 8e3);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.stderr.on("data", (chunk) => stderr.push(chunk.toString("utf8")));
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      let newline = stdout.indexOf("\n");
      while (newline >= 0) {
        const line = stdout.slice(0, newline).trim();
        stdout = stdout.slice(newline + 1);
        if (line) {
          const message = JSON.parse(line);
          if (message.id === 2) {
            clearTimeout(timer);
            const toolNames = message.result.tools.map((tool) => tool.name);
            import_strict.default.deepEqual(toolNames, ["tool_hub.resolve", "tool_hub.invoke"]);
            const resolveTool = message.result.tools.find((tool) => tool.name === "tool_hub.resolve");
            import_strict.default.match(resolveTool.description, /MUST be called before answering/);
            import_strict.default.match(resolveTool.description, /external services.*business APIs.*orders.*coupons.*stores.*accounts/);
            import_strict.default.match(resolveTool.description, /executionPlanJs/);
            child.kill();
            resolve();
            return;
          }
        }
        newline = stdout.indexOf("\n");
      }
    });
    writeJsonLine(child, {
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "inspector-like-test", version: "1.0.0" },
        protocolVersion: "2024-11-05"
      }
    });
    writeJsonLine(child, {
      id: 2,
      jsonrpc: "2.0",
      method: "tools/list",
      params: {}
    });
  });
});
(0, import_node_test.default)("built ToolHub MCP runtime waits for local CCR resolver readiness", async (t) => {
  const runtime = toolHubRuntimePath();
  if (!(0, import_node_fs.existsSync)(runtime)) {
    t.skip("ToolHub MCP runtime has not been built.");
    return;
  }
  const backend = createMcpHttpServer();
  try {
    await listen(backend);
  } catch (error) {
    backend.close();
    t.skip(`Local HTTP listen is unavailable: ${error.message}`);
    return;
  }
  const backendPort = backend.address().port;
  t.after(() => backend.close());
  const reserved = (0, import_node_http.createServer)();
  try {
    await listen(reserved);
  } catch (error) {
    t.skip(`Local HTTP listen is unavailable: ${error.message}`);
    return;
  }
  const resolverPort = reserved.address().port;
  await closeServer(reserved);
  const resolver = createDelayedResolverServer();
  const startResolverTimer = setTimeout(() => {
    resolver.listen(resolverPort, "127.0.0.1");
  }, 600);
  t.after(() => {
    clearTimeout(startResolverTimer);
    resolver.close();
  });
  const child = (0, import_node_child_process.spawn)(process.execPath, [runtime], {
    env: {
      ...process.env,
      TOOLHUB_MCP_SERVERS_JSON: JSON.stringify([
        {
          name: "mcd-mcp",
          transport: "streamable-http",
          url: `http://127.0.0.1:${backendPort}/mcp`
        }
      ]),
      TOOLHUB_OPENAI_API_KEY: "test-key",
      TOOLHUB_OPENAI_BASE_URL: `http://127.0.0.1:${resolverPort}/v1`,
      TOOLHUB_OPENAI_MODEL: "resolver-model",
      TOOLHUB_REQUEST_TIMEOUT_MS: "10000"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(() => child.kill());
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(chunk.toString("utf8")));
  const reader = jsonLineReader(child);
  writeJsonLine(child, {
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      capabilities: {},
      clientInfo: { name: "resolver-readiness-test", version: "1.0.0" },
      protocolVersion: "2024-11-05"
    }
  });
  await reader.nextMessage(1);
  writeJsonLine(child, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  });
  writeJsonLine(child, {
    id: 2,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "tool_hub.resolve",
      arguments: {
        constraints: { maxTools: 10 },
        task: "\u6211\u60F3\u67E5\u8BE2\u9EA6\u5F53\u52B3\u8FD9\u4E2A\u6708\u6709\u4EC0\u4E48\u4F18\u60E0\u6D3B\u52A8"
      }
    }
  });
  const response = await reader.nextMessage(2, 12e3).catch((error) => {
    error.message += ` stderr: ${stderr.join("")}`;
    throw error;
  });
  import_strict.default.equal(response.error, void 0);
  import_strict.default.deepEqual(response.result.selectedToolNames, ["mcp.mcd_mcp.campaign-calendar"]);
  import_strict.default.deepEqual(response.result.structuredContent.selectedToolNames, ["mcp.mcd_mcp.campaign-calendar"]);
  import_strict.default.match(response.result.executionPlanInstructions, /Promise\.all/);
  import_strict.default.match(response.result.executionPlanJs, /await callTool\("mcp\.mcd_mcp\.campaign-calendar"/);
  import_strict.default.equal(response.result.workflowSketch, response.result.executionPlanJs);
  import_strict.default.match(response.result.structuredContent.executionPlanJs, /mcp\.mcd_mcp\.campaign-calendar/);
  import_strict.default.equal(response.result.content[0].type, "text");
  import_strict.default.match(response.result.content[0].text, /mcp\.mcd_mcp\.campaign-calendar/);
});
(0, import_node_test.default)("built ToolHub MCP runtime expands browser automation bundles with handoff tools", async (t) => {
  const runtime = toolHubRuntimePath();
  if (!(0, import_node_fs.existsSync)(runtime)) {
    t.skip("ToolHub MCP runtime has not been built.");
    return;
  }
  const backend = createMcpHttpServer({
    serverName: "ccr-browser-automation",
    tools: [
      {
        description: "Open a URL or attach an existing CCR built-in browser tab and create an automation session.",
        inputSchema: { type: "object" },
        name: "browser_session_open"
      },
      {
        description: "Request human intervention for the current browser task.",
        inputSchema: { type: "object" },
        name: "browser_handoff_request"
      },
      {
        description: "Read the current browser human handoff status.",
        inputSchema: { type: "object" },
        name: "browser_handoff_status"
      },
      {
        description: "Wait until the user clicks Done or Hide on the current browser handoff toolbar.",
        inputSchema: { type: "object" },
        name: "browser_handoff_wait"
      }
    ]
  });
  try {
    await listen(backend);
  } catch (error) {
    backend.close();
    t.skip(`Local HTTP listen is unavailable: ${error.message}`);
    return;
  }
  const backendPort = backend.address().port;
  t.after(() => backend.close());
  const resolver = createFixedResolverServer(["mcp.ccr_browser_automation.browser_session_open"]);
  try {
    await listen(resolver);
  } catch (error) {
    resolver.close();
    t.skip(`Local HTTP listen is unavailable: ${error.message}`);
    return;
  }
  const resolverPort = resolver.address().port;
  t.after(() => resolver.close());
  const child = (0, import_node_child_process.spawn)(process.execPath, [runtime], {
    env: {
      ...process.env,
      TOOLHUB_MCP_SERVERS_JSON: JSON.stringify([
        {
          name: "ccr-browser-automation",
          transport: "streamable-http",
          url: `http://127.0.0.1:${backendPort}/mcp`
        }
      ]),
      TOOLHUB_OPENAI_API_KEY: "test-key",
      TOOLHUB_OPENAI_BASE_URL: `http://127.0.0.1:${resolverPort}/v1`,
      TOOLHUB_OPENAI_MODEL: "resolver-model",
      TOOLHUB_REQUEST_TIMEOUT_MS: "10000"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(() => child.kill());
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(chunk.toString("utf8")));
  const reader = jsonLineReader(child);
  writeJsonLine(child, {
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      capabilities: {},
      clientInfo: { name: "browser-handoff-bundle-test", version: "1.0.0" },
      protocolVersion: "2024-11-05"
    }
  });
  await reader.nextMessage(1);
  writeJsonLine(child, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  });
  writeJsonLine(child, {
    id: 2,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "tool_hub.resolve",
      arguments: {
        constraints: { maxTools: 10 },
        task: "\u6253\u5F00 Gmail\uFF0C\u5982\u679C\u9700\u8981\u767B\u5F55\u5C31\u8BA9\u7528\u6237\u63A5\u7BA1"
      }
    }
  });
  const response = await reader.nextMessage(2, 12e3).catch((error) => {
    error.message += ` stderr: ${stderr.join("")}`;
    throw error;
  });
  import_strict.default.equal(response.error, void 0);
  import_strict.default.deepEqual(response.result.selectedToolNames, [
    "mcp.ccr_browser_automation.browser_session_open",
    "mcp.ccr_browser_automation.browser_handoff_request",
    "mcp.ccr_browser_automation.browser_handoff_status",
    "mcp.ccr_browser_automation.browser_handoff_wait"
  ]);
  import_strict.default.match(response.result.tsDefinitions, /browser_handoff_wait/);
});
(0, import_node_test.default)("built ToolHub MCP runtime deterministically resolves Chrome login import tools", async (t) => {
  const runtime = toolHubRuntimePath();
  if (!(0, import_node_fs.existsSync)(runtime)) {
    t.skip("ToolHub MCP runtime has not been built.");
    return;
  }
  const backend = createMcpHttpServer({
    serverName: "ccr-browser-automation",
    tools: [
      {
        description: "Ask the user to confirm importing Chrome cookies and localStorage into CCR's in-app browser.",
        inputSchema: { type: "object" },
        name: "browser_chrome_login_import"
      },
      {
        description: "Read the status of a Chrome login import job.",
        inputSchema: { type: "object" },
        name: "browser_chrome_login_import_status"
      }
    ]
  });
  try {
    await listen(backend);
  } catch (error) {
    backend.close();
    t.skip(`Local HTTP listen is unavailable: ${error.message}`);
    return;
  }
  const backendPort = backend.address().port;
  t.after(() => backend.close());
  const resolver = createFixedResolverServer([]);
  try {
    await listen(resolver);
  } catch (error) {
    resolver.close();
    t.skip(`Local HTTP listen is unavailable: ${error.message}`);
    return;
  }
  const resolverPort = resolver.address().port;
  t.after(() => resolver.close());
  const child = (0, import_node_child_process.spawn)(process.execPath, [runtime], {
    env: {
      ...process.env,
      TOOLHUB_MCP_SERVERS_JSON: JSON.stringify([
        {
          name: "ccr-browser-automation",
          transport: "streamable-http",
          url: `http://127.0.0.1:${backendPort}/mcp`
        }
      ]),
      TOOLHUB_OPENAI_API_KEY: "test-key",
      TOOLHUB_OPENAI_BASE_URL: `http://127.0.0.1:${resolverPort}/v1`,
      TOOLHUB_OPENAI_MODEL: "resolver-model",
      TOOLHUB_REQUEST_TIMEOUT_MS: "10000"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(() => child.kill());
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(chunk.toString("utf8")));
  const reader = jsonLineReader(child);
  writeJsonLine(child, {
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      capabilities: {},
      clientInfo: { name: "chrome-login-import-test", version: "1.0.0" },
      protocolVersion: "2024-11-05"
    }
  });
  await reader.nextMessage(1);
  writeJsonLine(child, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  });
  writeJsonLine(child, {
    id: 2,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "tool_hub.resolve",
      arguments: {
        constraints: { maxTools: 10 },
        task: "\u628A Chrome \u91CC github.com \u7684\u767B\u5F55\u6001\u5BFC\u5165 CCR in-app browser"
      }
    }
  });
  const response = await reader.nextMessage(2, 12e3).catch((error) => {
    error.message += ` stderr: ${stderr.join("")}`;
    throw error;
  });
  import_strict.default.equal(response.error, void 0);
  import_strict.default.deepEqual(response.result.selectedToolNames, [
    "mcp.ccr_browser_automation.browser_chrome_login_import",
    "mcp.ccr_browser_automation.browser_chrome_login_import_status"
  ]);
  import_strict.default.match(response.result.tsDefinitions, /browser_chrome_login_import/);
});
(0, import_node_test.default)("built ToolHub MCP runtime does not add CCR handoff tools for non-CCR browser tools", async (t) => {
  const runtime = toolHubRuntimePath();
  if (!(0, import_node_fs.existsSync)(runtime)) {
    t.skip("ToolHub MCP runtime has not been built.");
    return;
  }
  const externalBrowser = createMcpHttpServer({
    serverName: "playwright",
    tools: [
      {
        description: "Navigate a browser page in an external automation backend.",
        inputSchema: { type: "object" },
        name: "navigate",
        tags: ["browser"]
      }
    ]
  });
  try {
    await listen(externalBrowser);
  } catch (error) {
    externalBrowser.close();
    t.skip(`Local HTTP listen is unavailable: ${error.message}`);
    return;
  }
  const externalBrowserPort = externalBrowser.address().port;
  t.after(() => externalBrowser.close());
  const ccrBrowser = createMcpHttpServer({
    serverName: "ccr-browser-automation",
    tools: [
      {
        description: "Request human intervention for the current browser task.",
        inputSchema: { type: "object" },
        name: "browser_handoff_request"
      },
      {
        description: "Read the current browser human handoff status.",
        inputSchema: { type: "object" },
        name: "browser_handoff_status"
      },
      {
        description: "Wait until the user clicks Done or Hide on the current browser handoff toolbar.",
        inputSchema: { type: "object" },
        name: "browser_handoff_wait"
      }
    ]
  });
  try {
    await listen(ccrBrowser);
  } catch (error) {
    ccrBrowser.close();
    t.skip(`Local HTTP listen is unavailable: ${error.message}`);
    return;
  }
  const ccrBrowserPort = ccrBrowser.address().port;
  t.after(() => ccrBrowser.close());
  const resolver = createFixedResolverServer(["mcp.playwright.navigate"]);
  try {
    await listen(resolver);
  } catch (error) {
    resolver.close();
    t.skip(`Local HTTP listen is unavailable: ${error.message}`);
    return;
  }
  const resolverPort = resolver.address().port;
  t.after(() => resolver.close());
  const child = (0, import_node_child_process.spawn)(process.execPath, [runtime], {
    env: {
      ...process.env,
      TOOLHUB_MCP_SERVERS_JSON: JSON.stringify([
        {
          name: "playwright",
          transport: "streamable-http",
          url: `http://127.0.0.1:${externalBrowserPort}/mcp`
        },
        {
          name: "ccr-browser-automation",
          transport: "streamable-http",
          url: `http://127.0.0.1:${ccrBrowserPort}/mcp`
        }
      ]),
      TOOLHUB_OPENAI_API_KEY: "test-key",
      TOOLHUB_OPENAI_BASE_URL: `http://127.0.0.1:${resolverPort}/v1`,
      TOOLHUB_OPENAI_MODEL: "resolver-model",
      TOOLHUB_REQUEST_TIMEOUT_MS: "10000"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(() => child.kill());
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(chunk.toString("utf8")));
  const reader = jsonLineReader(child);
  writeJsonLine(child, {
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      capabilities: {},
      clientInfo: { name: "external-browser-tag-test", version: "1.0.0" },
      protocolVersion: "2024-11-05"
    }
  });
  await reader.nextMessage(1);
  writeJsonLine(child, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  });
  writeJsonLine(child, {
    id: 2,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "tool_hub.resolve",
      arguments: {
        constraints: { maxTools: 10 },
        task: "Use the external Playwright browser to navigate a page."
      }
    }
  });
  const response = await reader.nextMessage(2, 12e3).catch((error) => {
    error.message += ` stderr: ${stderr.join("")}`;
    throw error;
  });
  import_strict.default.equal(response.error, void 0);
  import_strict.default.deepEqual(response.result.selectedToolNames, ["mcp.playwright.navigate"]);
});
(0, import_node_test.default)("built ToolHub MCP runtime keeps resolve cache scoped by task", async (t) => {
  const runtime = toolHubRuntimePath();
  if (!(0, import_node_fs.existsSync)(runtime)) {
    t.skip("ToolHub MCP runtime has not been built.");
    return;
  }
  const backend = createMcpHttpServer({
    serverName: "multi-mcp",
    tools: [
      {
        description: "\u67E5\u8BE2\u6307\u5B9A\u57CE\u5E02\u7684\u5929\u6C14\u9884\u62A5\u3002",
        inputSchema: { type: "object" },
        name: "weather-forecast"
      },
      {
        description: "\u67E5\u8BE2\u9EA6\u5F53\u52B3\u4E2D\u56FD\u5F53\u6708\u7684\u8425\u9500\u6D3B\u52A8\u65E5\u5386\u3002",
        inputSchema: { type: "object" },
        name: "campaign-calendar"
      }
    ]
  });
  try {
    await listen(backend);
  } catch (error) {
    backend.close();
    t.skip(`Local HTTP listen is unavailable: ${error.message}`);
    return;
  }
  const backendPort = backend.address().port;
  t.after(() => backend.close());
  const resolver = createTaskAwareResolverServer();
  try {
    await listen(resolver);
  } catch (error) {
    resolver.close();
    t.skip(`Local HTTP listen is unavailable: ${error.message}`);
    return;
  }
  const resolverPort = resolver.address().port;
  t.after(() => resolver.close());
  const child = (0, import_node_child_process.spawn)(process.execPath, [runtime], {
    env: {
      ...process.env,
      TOOLHUB_MCP_SERVERS_JSON: JSON.stringify([
        {
          name: "multi-mcp",
          transport: "streamable-http",
          url: `http://127.0.0.1:${backendPort}/mcp`
        }
      ]),
      TOOLHUB_OPENAI_API_KEY: "test-key",
      TOOLHUB_OPENAI_BASE_URL: `http://127.0.0.1:${resolverPort}/v1`,
      TOOLHUB_OPENAI_MODEL: "resolver-model",
      TOOLHUB_REQUEST_TIMEOUT_MS: "10000"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(() => child.kill());
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(chunk.toString("utf8")));
  const reader = jsonLineReader(child);
  writeJsonLine(child, {
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      capabilities: {},
      clientInfo: { name: "resolve-cache-test", version: "1.0.0" },
      protocolVersion: "2024-11-05"
    }
  });
  await reader.nextMessage(1);
  writeJsonLine(child, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  });
  writeJsonLine(child, {
    id: 2,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "tool_hub.resolve",
      arguments: {
        task: "\u67E5\u8BE2\u5317\u4EAC\u4ECA\u5929\u7684\u5929\u6C14"
      }
    }
  });
  const first = await reader.nextMessage(2, 12e3).catch((error) => {
    error.message += ` stderr: ${stderr.join("")}`;
    throw error;
  });
  import_strict.default.equal(first.error, void 0);
  import_strict.default.deepEqual(first.result.selectedToolNames, ["mcp.multi_mcp.weather-forecast"]);
  writeJsonLine(child, {
    id: 3,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "tool_hub.resolve",
      arguments: {
        task: "\u67E5\u8BE2\u9EA6\u5F53\u52B3\u8FD9\u4E2A\u6708\u6709\u4EC0\u4E48\u4F18\u60E0\u6D3B\u52A8"
      }
    }
  });
  const second = await reader.nextMessage(3, 12e3).catch((error) => {
    error.message += ` stderr: ${stderr.join("")}`;
    throw error;
  });
  import_strict.default.equal(second.error, void 0);
  import_strict.default.equal(second.result.alreadyResolved, void 0);
  import_strict.default.deepEqual(second.result.selectedToolNames, ["mcp.multi_mcp.campaign-calendar"]);
});
function toolHubRuntimePath() {
  return import_node_path.default.join(process.cwd(), ".test-dist", "core", "runtime", "toolhub-mcp.js");
}
function writeJsonLine(child, message) {
  child.stdin.write(`${JSON.stringify(message)}
`);
}
function jsonLineReader(child) {
  let stdout = "";
  const messages = [];
  const waiters = [];
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
    let newline = stdout.indexOf("\n");
    while (newline >= 0) {
      const line = stdout.slice(0, newline).trim();
      stdout = stdout.slice(newline + 1);
      if (line) {
        messages.push(JSON.parse(line));
      }
      newline = stdout.indexOf("\n");
    }
    flushWaiters();
  });
  function flushWaiters() {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      const messageIndex = messages.findIndex((message) => message.id === waiter.id);
      if (messageIndex >= 0) {
        const [message] = messages.splice(messageIndex, 1);
        clearTimeout(waiter.timer);
        waiters.splice(index, 1);
        waiter.resolve(message);
      }
    }
  }
  return {
    nextMessage(id, timeoutMs = 8e3) {
      const existingIndex = messages.findIndex((message) => message.id === id);
      if (existingIndex >= 0) {
        const [message] = messages.splice(existingIndex, 1);
        return Promise.resolve(message);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex((waiter) => waiter.id === id);
          if (index >= 0) {
            waiters.splice(index, 1);
          }
          reject(new Error(`Timed out waiting for JSON-RPC response ${id}.`));
        }, timeoutMs);
        waiters.push({ id, resolve, timer });
      });
    }
  };
}
function createMcpHttpServer(options = {}) {
  const serverName = options.serverName ?? "mcd-mcp";
  const tools = options.tools ?? [
    {
      description: "\u67E5\u8BE2\u9EA6\u5F53\u52B3\u4E2D\u56FD\u5F53\u6708\u7684\u8425\u9500\u6D3B\u52A8\u65E5\u5386\uFF0C\u8FD4\u56DE\u8FDB\u884C\u4E2D\u3001\u5F80\u671F\u548C\u672A\u6765\u65E5\u671F\u7684\u6D3B\u52A8\u3002",
      inputSchema: { type: "object" },
      name: "campaign-calendar"
    }
  ];
  return (0, import_node_http.createServer)(async (request, response) => {
    const payload = await readJsonBody(request);
    response.setHeader("content-type", "application/json");
    response.setHeader("mcp-session-id", "test-session");
    if (payload.method === "initialize") {
      response.end(JSON.stringify({
        id: payload.id,
        jsonrpc: "2.0",
        result: {
          capabilities: { tools: {} },
          protocolVersion: "2024-11-05",
          serverInfo: { name: serverName, version: "1.0.0" }
        }
      }));
      return;
    }
    if (payload.method === "notifications/initialized") {
      response.statusCode = 204;
      response.end();
      return;
    }
    if (payload.method === "tools/list") {
      response.end(JSON.stringify({
        id: payload.id,
        jsonrpc: "2.0",
        result: {
          tools
        }
      }));
      return;
    }
    response.end(JSON.stringify({ id: payload.id, jsonrpc: "2.0", result: {} }));
  });
}
function createTaskAwareResolverServer() {
  return (0, import_node_http.createServer)(async (request, response) => {
    if (request.method === "GET" && request.url === "/v1/models") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [], object: "list" }));
      return;
    }
    if (request.method === "POST" && request.url === "/v1/chat/completions") {
      const payload = await readJsonBody(request);
      const query = readResolverQuery(payload);
      const toolName = /天气|weather/i.test(query) ? "mcp.multi_mcp.weather-forecast" : "mcp.multi_mcp.campaign-calendar";
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "ok",
                toolNames: [toolName]
              })
            }
          }
        ],
        id: "chatcmpl-test",
        object: "chat.completion"
      }));
      return;
    }
    response.statusCode = 404;
    response.end("not found");
  });
}
function createFixedResolverServer(toolNames) {
  return (0, import_node_http.createServer)(async (request, response) => {
    if (request.method === "GET" && request.url === "/v1/models") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [], object: "list" }));
      return;
    }
    if (request.method === "POST" && request.url === "/v1/chat/completions") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "ok",
                toolNames
              })
            }
          }
        ],
        id: "chatcmpl-fixed-test",
        object: "chat.completion"
      }));
      return;
    }
    response.statusCode = 404;
    response.end("not found");
  });
}
function readResolverQuery(payload) {
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user" || typeof message.content !== "string") {
      continue;
    }
    try {
      const parsed = JSON.parse(message.content);
      if (typeof parsed.query === "string") {
        return parsed.query;
      }
    } catch {
      return message.content;
    }
  }
  return "";
}
function createDelayedResolverServer() {
  return (0, import_node_http.createServer)(async (request, response) => {
    if (request.method === "GET" && request.url === "/v1/models") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [], object: "list" }));
      return;
    }
    if (request.method === "POST" && request.url === "/v1/chat/completions") {
      await readJsonBody(request);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "ok",
                toolNames: ["mcp.mcd_mcp.campaign-calendar"]
              })
            }
          }
        ],
        id: "chatcmpl-test",
        object: "chat.completion"
      }));
      return;
    }
    response.statusCode = 404;
    response.end("not found");
  });
}
async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString("utf8");
  }
  return body.trim() ? JSON.parse(body) : {};
}
async function listen(server) {
  server.listen(0, "127.0.0.1");
  await (0, import_node_events.once)(server, "listening");
}
async function closeServer(server) {
  if (!server.listening) {
    return;
  }
  server.close();
  await (0, import_node_events.once)(server, "close");
}
