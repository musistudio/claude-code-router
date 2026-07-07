type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type JsonRpcRequest = {
  id?: null | number | string;
  jsonrpc?: string;
  method?: string;
  params?: unknown;
};

type JsonRpcResponse =
  | {
      id: null | number | string;
      jsonrpc: "2.0";
      result: JsonValue;
    }
  | {
      error: {
        code: number;
        data?: JsonValue;
        message: string;
      };
      id: null | number | string;
      jsonrpc: "2.0";
    };

type McpTool = {
  description: string;
  inputSchema: JsonValue;
  name: string;
  unavailableMessage?: string;
};

type ToolCallResult = {
  content: Array<{ text: string; type: "text" }>;
  isError?: boolean;
};

const protocolVersion = "2024-11-05";
const tools = readFallbackTools();
const toolNames = new Set(tools.map((tool) => tool.name));

let inputBuffer = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
  drainInputBuffer().catch((error) => {
    writeJsonRpc(jsonRpcError(null, -32603, formatError(error)));
  });
});

process.stdin.resume();

async function drainInputBuffer(): Promise<void> {
  while (true) {
    const headerEnd = inputBuffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) {
      return;
    }

    const headerText = inputBuffer.subarray(0, headerEnd).toString("utf8");
    const lengthMatch = headerText.match(/content-length:\s*(\d+)/i);
    if (!lengthMatch) {
      inputBuffer = inputBuffer.subarray(headerEnd + 4);
      writeJsonRpc(jsonRpcError(null, -32600, "Missing Content-Length header."));
      continue;
    }

    const contentLength = Number(lengthMatch[1]);
    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + contentLength;
    if (inputBuffer.length < messageEnd) {
      return;
    }

    const message = inputBuffer.subarray(messageStart, messageEnd).toString("utf8");
    inputBuffer = inputBuffer.subarray(messageEnd);
    let payload: unknown;
    try {
      payload = JSON.parse(message) as unknown;
    } catch (error) {
      writeJsonRpc(jsonRpcError(null, -32700, `Invalid JSON-RPC request: ${formatError(error)}`));
      continue;
    }

    const response = await handleJsonRpcRequest(payload);
    if (response) {
      writeJsonRpc(response);
    }
  }
}

async function handleJsonRpcRequest(payload: unknown): Promise<JsonRpcResponse | undefined> {
  if (!isRecord(payload)) {
    return jsonRpcError(null, -32600, "JSON-RPC request must be an object.");
  }

  const request = payload as JsonRpcRequest;
  const id = request.id ?? null;
  if (request.id === undefined && request.method?.startsWith("notifications/")) {
    return undefined;
  }
  if (request.jsonrpc !== "2.0" || !request.method) {
    return jsonRpcError(id, -32600, "Invalid JSON-RPC 2.0 request.");
  }

  try {
    switch (request.method) {
      case "initialize":
        return jsonRpcResult(id, {
          capabilities: {
            tools: {}
          },
          protocolVersion,
          serverInfo: {
            name: "ccr-fusion-tool-fallback",
            title: "CCR Fusion Tool Fallback",
            version: "1.0.0"
          }
        });
      case "ping":
        return jsonRpcResult(id, {});
      case "tools/list":
        return jsonRpcResult(id, { tools: tools as unknown as JsonValue });
      case "tools/call":
        return jsonRpcResult(id, callTool(request.params) as unknown as JsonValue);
      default:
        return jsonRpcError(id, -32601, `Unsupported MCP method: ${request.method}`);
    }
  } catch (error) {
    return jsonRpcError(id, -32603, formatError(error));
  }
}

function callTool(params: unknown): ToolCallResult {
  const name = isRecord(params) && typeof params.name === "string" ? params.name.trim() : "";
  const toolLabel = name || "unknown";
  const tool = tools.find((item) => item.name === toolLabel);
  const knownSuffix = toolNames.has(toolLabel) ? "" : " The requested tool was not in the fallback catalog.";
  return {
    content: [{
      text: tool?.unavailableMessage ||
        `Fusion MCP tool "${toolLabel}" is temporarily unavailable. ` +
        "CCR registered a fallback definition because the real MCP server did not provide the tool during discovery. " +
        `Check the Fusion MCP server logs and retry.${knownSuffix}`,
      type: "text"
    }],
    isError: true
  };
}

function readFallbackTools(): McpTool[] {
  const raw = env("FUSION_FALLBACK_TOOLS_JSON");
  if (!raw) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }

  const seen = new Set<string>();
  const result: McpTool[] = [];
  for (const item of parsed) {
    if (!isRecord(item)) {
      continue;
    }
    const name = readString(item.name);
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    result.push({
      description:
        readString(item.description) ||
        `Fallback registration for Fusion MCP tool "${name}". The real MCP server should handle successful calls.`,
      inputSchema: isRecord(item.inputSchema) ? item.inputSchema as JsonValue : objectSchema({}),
      name,
      unavailableMessage: readString(item.unavailableMessage)
    });
  }
  return result;
}

function objectSchema(properties: Record<string, JsonValue>, required: string[] = []): JsonValue {
  return {
    additionalProperties: true,
    properties,
    ...(required.length ? { required } : {}),
    type: "object"
  };
}

function jsonRpcResult(id: null | number | string, result: JsonValue): JsonRpcResponse {
  return {
    id,
    jsonrpc: "2.0",
    result
  };
}

function jsonRpcError(id: null | number | string, code: number, message: string): JsonRpcResponse {
  return {
    error: {
      code,
      message
    },
    id,
    jsonrpc: "2.0"
  };
}

function writeJsonRpc(response: JsonRpcResponse): void {
  const text = JSON.stringify(response);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(text, "utf8")}\r\n\r\n${text}`);
}

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
