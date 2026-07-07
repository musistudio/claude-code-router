import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import test from "node:test";

test("Fusion vision MCP sends the injected core gateway API key", async (t) => {
  const seen = {
    authorization: "",
    body: undefined,
    path: ""
  };
  const server = http.createServer(async (request, response) => {
    seen.authorization = request.headers.authorization ?? "";
    seen.path = request.url ?? "";
    const body = await readRequestBody(request);
    seen.body = JSON.parse(body);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      choices: [
        {
          message: {
            content: "vision ok"
          }
        }
      ]
    }));
  });

  try {
    await listen(server);
  } catch (error) {
    if (isLocalListenUnavailable(error)) {
      t.skip(`Local HTTP listen is unavailable: ${formatError(error)}`);
      return;
    }
    throw error;
  }
  t.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const child = spawn(process.execPath, [path.join(process.cwd(), "dist", "tests", "main", "fusion-vision-mcp.js")], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      FUSION_BUILTIN_TOOL_KIND: "vision",
      FUSION_TOOL_NAME: "vision_understand_glm_5_2v",
      VISION_GATEWAY_API_KEY: "core-token",
      VISION_GATEWAY_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
      VISION_MODEL: "provider-zhipu-ai-china---coding-plan-d63a2c4b21::openai_chat_completions::cred:test-1/glm-5v-turbo"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(() => {
    if (!child.killed) {
      child.kill();
    }
  });

  const response = await sendJsonRpc(child, {
    id: 1,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: {
        imageBase64: "iVBORw0KGgo=",
        mimeType: "image/png",
        prompt: "Describe this image."
      },
      name: "vision_understand_glm_5_2v"
    }
  });

  assert.equal(response.error, undefined);
  assert.equal(response.result?.isError, undefined);
  assert.equal(response.result?.content?.[0]?.text, "vision ok");
  assert.equal(seen.authorization, "Bearer core-token");
  assert.equal(seen.path, "/v1/chat/completions");
  assert.equal(seen.body?.model, "provider-zhipu-ai-china---coding-plan-d63a2c4b21::openai_chat_completions::cred:test-1/glm-5v-turbo");
  assert.equal(seen.body?.messages?.[0]?.content?.[1]?.type, "image_url");
});

function listen(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      server.off("error", onError);
      server.off("listening", onListening);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, "127.0.0.1");
  });
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on("error", reject);
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

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
      if (!parsed) {
        return;
      }
      finish(parsed.value);
    };
    const onStderr = (chunk) => {
      stderr += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    };
    const onExit = (code, signal) => {
      fail(new Error(`fusion-vision MCP exited before response: code=${code ?? ""} signal=${signal ?? ""} stderr=${stderr}`));
    };
    const onError = (error) => fail(error);
    const timer = setTimeout(() => fail(new Error(`Timed out waiting for fusion-vision MCP response. stderr=${stderr}`)), 5000);

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("exit", onExit);
    child.once("error", onError);

    const message = Buffer.from(JSON.stringify(payload), "utf8");
    child.stdin.write(`Content-Length: ${message.byteLength}\r\n\r\n`);
    child.stdin.write(message);
  });
}

function readJsonRpcFrame(buffer) {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd < 0) {
    return undefined;
  }
  const header = buffer.subarray(0, headerEnd).toString("utf8");
  const match = header.match(/content-length:\s*(\d+)/i);
  if (!match) {
    throw new Error(`Missing Content-Length in MCP response: ${header}`);
  }
  const length = Number(match[1]);
  const bodyStart = headerEnd + 4;
  const bodyEnd = bodyStart + length;
  if (buffer.length < bodyEnd) {
    return undefined;
  }
  return {
    rest: buffer.subarray(bodyEnd),
    value: JSON.parse(buffer.subarray(bodyStart, bodyEnd).toString("utf8"))
  };
}

function isLocalListenUnavailable(error) {
  return error && typeof error === "object" && (error.code === "EPERM" || error.code === "EACCES");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
