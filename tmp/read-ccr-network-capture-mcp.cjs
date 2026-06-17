"use strict";

const http = require("node:http");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const { app, safeStorage } = require("electron");
const initSqlJs = require("sql.js");

const requireFromHere = createRequire(__filename);
const apiKeysDbFile = "/Users/jinhuilee/Library/Application Support/claude-code-router/api-keys.sqlite";
const outputFile = "/private/tmp/ccr-network-capture-mcp.json";
const wasmFile = requireFromHere.resolve("sql.js/dist/sql-wasm.wasm");

app.setName("claude-code-router");
app.setPath("userData", "/Users/jinhuilee/Library/Application Support/claude-code-router");

function decryptApiKey(value, encryption) {
  try {
    if (encryption === "electron-safe-storage") {
      return safeStorage.decryptString(Buffer.from(value, "base64")).trim();
    }
    return String(value || "").trim();
  } catch {
    return "";
  }
}

function postMcp(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload));
    const request = http.request(
      {
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-length": body.length,
          "content-type": "application/json"
        },
        host: "127.0.0.1",
        method: "POST",
        path: "/mcp",
        port: 3456,
        timeout: 10000
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            body: text ? JSON.parse(text) : null,
            statusCode: response.statusCode
          });
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("Timed out calling CCR MCP.")));
    request.on("error", reject);
    request.end(body);
  });
}

async function main() {
  await app.whenReady();
  const SQL = await initSqlJs({ locateFile: () => wasmFile });
  const database = new SQL.Database(fs.readFileSync(apiKeysDbFile));
  const rows = database.exec("SELECT encrypted_key, encryption FROM api_keys ORDER BY rowid")[0]?.values || [];
  database.close();

  if (rows.length === 0) {
    throw new Error("No API key found.");
  }

  const candidates = rows.map((row) => decryptApiKey(row[0], row[1])).filter(Boolean);
  let apiKey = "";
  let status;
  for (const candidate of candidates) {
    const candidateStatus = await postMcp(candidate, {
      id: 1,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {},
        name: "network_capture_status"
      }
    });
    if (candidateStatus.statusCode !== 401) {
      apiKey = candidate;
      status = candidateStatus;
      break;
    }
  }

  if (!apiKey || !status) {
    throw new Error("No usable API key found.");
  }

  status = await postMcp(apiKey, {
    id: 1,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: {},
      name: "network_capture_status"
    }
  });
  const list = await postMcp(apiKey, {
    id: 2,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: {
        includeBodies: false,
        limit: 20,
        query: "claude.ai"
      },
      name: "network_capture_list"
    }
  });

  fs.writeFileSync(
    outputFile,
    `${JSON.stringify(
      {
        list,
        status
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  app.quit();
}

main().catch((error) => {
  fs.writeFileSync(
    outputFile,
    `${JSON.stringify(
      {
        error: error instanceof Error ? error.stack || error.message : String(error)
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  app.exit(1);
});
