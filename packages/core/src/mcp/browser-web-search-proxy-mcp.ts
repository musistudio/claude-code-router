const targetUrl = process.env.BROWSER_WEB_SEARCH_MCP_URL?.trim();
const requestTimeoutMs = clampInteger(Number(process.env.BROWSER_WEB_SEARCH_PROXY_TIMEOUT_MS), 1_000, 600_000, 120_000);

let stdinBuffer = Buffer.alloc(0);

if (!targetUrl) {
  process.stderr.write("BROWSER_WEB_SEARCH_MCP_URL is required.\n");
  process.exit(1);
}

process.stdin.on("data", (chunk: Buffer | string) => {
  stdinBuffer = Buffer.concat([stdinBuffer, typeof chunk === "string" ? Buffer.from(chunk) : chunk]);
  void drainFrames();
});

process.stdin.on("end", () => {
  process.exit(0);
});

async function drainFrames(): Promise<void> {
  while (true) {
    const headerEnd = stdinBuffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) {
      return;
    }

    const headerText = stdinBuffer.slice(0, headerEnd).toString("utf8");
    const contentLength = readContentLength(headerText);
    if (contentLength === undefined || contentLength < 0) {
      stdinBuffer = Buffer.alloc(0);
      writeFrame(jsonRpcError(null, -32600, "Invalid MCP frame header."));
      return;
    }

    const payloadStart = headerEnd + 4;
    const payloadEnd = payloadStart + contentLength;
    if (stdinBuffer.length < payloadEnd) {
      return;
    }

    const body = stdinBuffer.slice(payloadStart, payloadEnd).toString("utf8");
    stdinBuffer = stdinBuffer.slice(payloadEnd);
    await forwardPayload(body);
  }
}

async function forwardPayload(body: string): Promise<void> {
  const requestId = readJsonRpcId(body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(targetUrl!, {
      body,
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      },
      method: "POST",
      signal: controller.signal
    });

    if (response.status === 204) {
      return;
    }

    const text = await response.text();
    if (!response.ok) {
      writeFrame(jsonRpcError(requestId, -32603, text || `In-app browser MCP returned HTTP ${response.status}.`));
      return;
    }
    if (text.trim()) {
      writeRawFrame(text);
    }
  } catch (error) {
    writeFrame(jsonRpcError(requestId, -32603, formatError(error)));
  } finally {
    clearTimeout(timeout);
  }
}

function readContentLength(headerText: string): number | undefined {
  for (const line of headerText.split(/\r?\n/)) {
    const match = /^content-length\s*:\s*(\d+)\s*$/i.exec(line);
    if (match) {
      return Number(match[1]);
    }
  }
  return undefined;
}

function readJsonRpcId(body: string): null | number | string {
  try {
    const payload = JSON.parse(body) as unknown;
    if (isRecord(payload)) {
      return isJsonRpcId(payload.id) ? payload.id : null;
    }
    if (Array.isArray(payload)) {
      const first = payload.find((item) => isRecord(item) && isJsonRpcId(item.id));
      return isRecord(first) && isJsonRpcId(first.id) ? first.id : null;
    }
  } catch {
    // The upstream MCP endpoint will return the parse error for valid JSON-RPC framing.
  }
  return null;
}

function isJsonRpcId(value: unknown): value is null | number | string {
  return value === null || typeof value === "number" || typeof value === "string";
}

function jsonRpcError(id: null | number | string, code: number, message: string): Record<string, unknown> {
  return {
    error: {
      code,
      message
    },
    id,
    jsonrpc: "2.0"
  };
}

function writeFrame(payload: Record<string, unknown>): void {
  writeRawFrame(JSON.stringify(payload));
}

function writeRawFrame(body: string): void {
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "AbortError" ? "In-app browser MCP proxy request timed out." : error.message;
  }
  return String(error);
}
