import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import test from "node:test";

test("ToolHub MCP runtime source keeps a shebang for direct MCP Inspector execution", () => {
  const source = readFileSync(path.join(process.cwd(), "packages", "core", "src", "mcp", "toolhub-mcp.ts"), "utf8");
  assert.equal(source.startsWith("#!/usr/bin/env node\n"), true);
});

test("built ToolHub MCP runtime accepts newline JSON stdio used by MCP Inspector", async (t) => {
  const runtime = path.join(process.cwd(), "packages", "electron", "dist", "main", "toolhub-mcp.js");
  if (!existsSync(runtime)) {
    t.skip("ToolHub MCP runtime has not been built.");
    return;
  }

  const child = spawn(process.execPath, [runtime], {
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
    }, 8000);

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
            assert.deepEqual(toolNames, ["tool_hub.resolve", "tool_hub.invoke"]);
            const resolveTool = message.result.tools.find((tool) => tool.name === "tool_hub.resolve");
            assert.match(resolveTool.description, /MUST be called before answering/);
            assert.match(resolveTool.description, /external services.*business APIs.*orders.*coupons.*stores.*accounts/);
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

test("built ToolHub MCP runtime waits for local CCR resolver readiness", async (t) => {
  const runtime = path.join(process.cwd(), "packages", "electron", "dist", "main", "toolhub-mcp.js");
  if (!existsSync(runtime)) {
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

  const reserved = createServer();
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

  const child = spawn(process.execPath, [runtime], {
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
        task: "我想查询麦当劳这个月有什么优惠活动"
      }
    }
  });
  const response = await reader.nextMessage(2, 12_000).catch((error) => {
    error.message += ` stderr: ${stderr.join("")}`;
    throw error;
  });
  assert.equal(response.error, undefined);
  assert.deepEqual(response.result.selectedToolNames, ["mcp.mcd_mcp.campaign-calendar"]);
  assert.deepEqual(response.result.structuredContent.selectedToolNames, ["mcp.mcd_mcp.campaign-calendar"]);
  assert.equal(response.result.content[0].type, "text");
  assert.match(response.result.content[0].text, /mcp\.mcd_mcp\.campaign-calendar/);
});

function writeJsonLine(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
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
    nextMessage(id, timeoutMs = 8000) {
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

function createMcpHttpServer() {
  return createServer(async (request, response) => {
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
          serverInfo: { name: "mcd-mcp", version: "1.0.0" }
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
          tools: [
            {
              description: "查询麦当劳中国当月的营销活动日历，返回进行中、往期和未来日期的活动。",
              inputSchema: { type: "object" },
              name: "campaign-calendar"
            }
          ]
        }
      }));
      return;
    }
    response.end(JSON.stringify({ id: payload.id, jsonrpc: "2.0", result: {} }));
  });
}

function createDelayedResolverServer() {
  return createServer(async (request, response) => {
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
  await once(server, "listening");
}

async function closeServer(server) {
  if (!server.listening) {
    return;
  }
  server.close();
  await once(server, "close");
}
