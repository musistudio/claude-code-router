import assert from "node:assert/strict";
import http from "node:http";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin.ts";
import { GatewayRequestPipeline } from "@ccr/core/gateway/request/pipeline.ts";
import {
  clientSafeTransportCode,
  createSseBoundaryTracker,
  terminalErrorFrame
} from "@ccr/core/gateway/request/sse-terminal.ts";

// A real SSE parser over the bytes the client would receive. Assertions look at
// dispatched events, not substrings: the whole defect is a frame that reaches
// the socket but is absorbed into a neighbouring event, so only a parser can
// tell delivery from absence.
function parseSseEvents(text) {
  const events = [];
  let name = "";
  let data = [];
  let pending = "";
  const dispatch = () => {
    if (data.length === 0 && !name) {
      return;
    }
    events.push({ data: data.join("\n"), event: name || undefined });
    name = "";
    data = [];
  };
  const noteLine = (line) => {
    if (line === "") {
      dispatch();
      return;
    }
    if (line.startsWith(":")) {
      return;
    }
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    const rawValue = separator === -1 ? "" : line.slice(separator + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    if (field === "event") {
      name = value.trim();
    } else if (field === "data") {
      data.push(value);
    }
  };
  for (const rawLine of text.split("\n")) {
    pending = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    noteLine(pending);
  }
  // The unterminated tail is NOT dispatched: an SSE client only dispatches on a
  // blank line, which is exactly why a frame appended to it is invisible.
  return events;
}

function eventPayloads(events) {
  return events.map((event) => {
    if (event.data === "[DONE]") {
      return { event: event.event, done: true };
    }
    try {
      return { event: event.event, payload: JSON.parse(event.data) };
    } catch {
      return { event: event.event, raw: event.data };
    }
  });
}

async function withTruncatedUpstream(events, run) {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(events);
    setTimeout(() => request.socket.resetAndDestroy(), 50);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    return await run(url);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

function createCapturingResponse() {
  const chunks = [];
  const response = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(Buffer.from(chunk));
      done();
    }
  });
  response.writeHead = () => response;
  return { body: () => Buffer.concat(chunks).toString("utf8"), response };
}

const options = { timeout: 5_000 };

function createRoutingConfig(provider) {
  return {
    CUSTOM_ROUTER_PATH: "",
    Providers: [provider],
    Router: {
      builtInRules: {
        "claude-code": { enabled: false },
        codex: { enabled: false }
      },
      fallback: { mode: "off", models: [], retryCount: 0 },
      rules: []
    },
    contextArchive: {
      enabled: false,
      mcpEnabled: false
    },
    observability: {
      agentAnalysis: false,
      requestLogs: false
    },
    preferredProvider: provider.name,
    profile: {
      enabled: false,
      profiles: []
    },
    toolHub: { enabled: false },
    virtualModelProfiles: []
  };
}

async function proxyTruncatedStream(input) {
  const config = createRoutingConfig(input.provider);
  const plugin = new ClaudeCodeRouterPlugin(config);
  const pipeline = new GatewayRequestPipeline({
    getBrowserWebSearchMcpIntegration: () => undefined,
    getConfig: () => config,
    getCoreAuthToken: () => "test-core-token",
    getPlugin: () => plugin,
    getStatus: () => ({ coreEndpoint: "http://127.0.0.1:3457", endpoint: "http://127.0.0.1:3456" })
  });
  const originalFetch = globalThis.fetch;
  try {
    return await withTruncatedUpstream(input.events, async (url) => {
      globalThis.fetch = (target, init) => {
        if (String(target).includes("/__ccr/route")) {
          return Promise.reject(new Error("core gateway route endpoint is not running"));
        }
        return originalFetch(url, { method: "POST", signal: init?.signal });
      };
      const request = Readable.from([JSON.stringify(input.body)]);
      request.method = "POST";
      request.url = input.path;
      request.headers = {
        "content-type": "application/json",
        "user-agent": "claude-code/1.0"
      };
      const capture = createCapturingResponse();
      const settled = new Promise((resolve) => capture.response.once("close", resolve));
      await pipeline.proxyRequest(request, capture.response, input.path);
      await Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 2_000))]);
      const body = capture.body();
      return {
        ...capture,
        body: () => body,
        events: parseSseEvents(body),
        finished: capture.response.writableFinished
      };
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const anthropicProvider = {
  capabilities: [{ baseUrl: "http://127.0.0.1:9/v1/messages", type: "anthropic_messages" }],
  models: ["claude-test"],
  name: "test-anthropic"
};

const chatProvider = {
  capabilities: [{ baseUrl: "http://127.0.0.1:9/v1/chat/completions", type: "openai_chat_completions" }],
  models: ["chat-test"],
  name: "test-chat"
};

const responsesProvider = {
  capabilities: [{ baseUrl: "http://127.0.0.1:9/v1/responses", type: "openai_responses" }],
  models: ["responses-test"],
  name: "test-responses"
};

const requestBodies = {
  anthropic_messages: {
    body: { max_tokens: 64, messages: [{ content: "hello", role: "user" }], model: "test-anthropic/claude-test", stream: true },
    path: "/v1/messages",
    provider: anthropicProvider
  },
  openai_chat_completions: {
    body: { messages: [{ content: "hello", role: "user" }], model: "test-chat/chat-test", stream: true },
    path: "/v1/chat/completions",
    provider: chatProvider
  },
  openai_responses: {
    body: { input: "hello", model: "test-responses/responses-test", stream: true },
    path: "/v1/responses",
    provider: responsesProvider
  }
};

// Each protocol's terminal frame, as a parsed client sees it: the event name it
// is delivered under, how the payload names the failure, and the terminator that
// ends the stream deliberately.
const terminalShape = {
  anthropic_messages: {
    eventName: "error",
    isTerminal: (payload) => payload.type === "error",
    terminators: 0
  },
  openai_chat_completions: {
    eventName: undefined,
    isTerminal: (payload) => payload.error?.type === "api_error",
    terminators: 1
  },
  openai_responses: {
    eventName: "response.failed",
    isTerminal: (payload) => payload.type === "response.failed",
    terminators: 1
  }
};

function terminalEntries(events, protocol) {
  const shape = terminalShape[protocol];
  return eventPayloads(events).filter((entry) => entry.payload && shape.isTerminal(entry.payload));
}

function assertTerminalDelivered(events, protocol) {
  const shape = terminalShape[protocol];
  const payloads = eventPayloads(events);
  const terminal = terminalEntries(events, protocol);
  assert.equal(terminal.length, 1, `${protocol}: exactly one terminal error event must be dispatched`);
  assert.equal(terminal[0].event, shape.eventName, `${protocol}: terminal event name`);
  assert.equal(
    payloads.filter((entry) => entry.done === true).length,
    shape.terminators,
    `${protocol}: the protocol's own terminator count`
  );
  // The generic sentence is the only message text; nothing from the source error.
  const message =
    terminal[0].payload.error?.message ?? terminal[0].payload.response?.error?.message ?? terminal[0].payload.message;
  assert.match(message, /^Upstream stream failed before the response completed/);
}

// Truncation positions, per protocol: after a dispatched event, at the blank
// line that would dispatch, and mid-line mid-event.
const truncationFixtures = {
  anthropic_messages: [
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"live"},"index":0}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"live"},"index":0}\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_del'
  ],
  openai_chat_completions: [
    'data: {"choices":[{"delta":{"content":"live"},"index":0}]}\n\n',
    'data: {"choices":[{"delta":{"content":"live"},"index":0}]}\n',
    'data: {"choices":[{"delta":{"content":"li'
  ],
  openai_responses: [
    'event: response.created\ndata: {"type":"response.created","response":{"id":"resp_test"}}\n\n',
    'event: response.created\ndata: {"type":"response.created","response":{"id":"resp_test"}}\n',
    'event: response.created\ndata: {"type":"response.created","resp'
  ]
};

const positionNames = ["after a dispatched event", "at the undelivered blank line", "mid-line mid-event"];

for (const protocol of Object.keys(truncationFixtures)) {
  for (const [index, events] of truncationFixtures[protocol].entries()) {
    test(`${protocol}: truncation ${positionNames[index]} still dispatches a separate terminal`, options, async () => {
      const truncated = await proxyTruncatedStream({ ...requestBodies[protocol], events });
      assertTerminalDelivered(truncated.events, protocol);
      // The truncated fragment may be dispatched once so the tail can be closed,
      // but the terminal must stay its own event: at most one unparseable entry,
      // never one carrying the terminal text.
      const unparseable = eventPayloads(truncated.events).filter((entry) => entry.raw !== undefined);
      assert.ok(unparseable.length <= 1, `${protocol}: at most one truncated fragment is dispatched`);
      for (const entry of unparseable) {
        assert.doesNotMatch(entry.raw, /Upstream stream failed before the response completed/);
      }
      assert.equal(truncated.finished, true, "the client response must end instead of losing its socket");
    });
  }
}

test("a truncation at the undelivered blank line does not duplicate [DONE]", options, async () => {
  const truncated = await proxyTruncatedStream({
    ...requestBodies.openai_chat_completions,
    events: 'data: {"choices":[{"delta":{"content":"live"},"index":0}]}\n'
  });
  assertTerminalDelivered(truncated.events, "openai_chat_completions");
});

test("a fully dispatched terminal is never followed by a second one", options, async () => {
  const truncated = await proxyTruncatedStream({
    ...requestBodies.openai_chat_completions,
    events: 'data: {"choices":[{"delta":{"content":"live"},"index":0}]}\n\ndata: [DONE]\n\n'
  });
  const payloads = eventPayloads(truncated.events);
  assert.equal(payloads.filter((entry) => entry.done === true).length, 1, "no duplicate [DONE]");
  assert.equal(
    terminalEntries(truncated.events, "openai_chat_completions").length,
    0,
    "a delivered terminal suppresses the error frame"
  );
});

test("a terminal field without its blank line was never delivered, so a frame is still sent", options, async () => {
  // `data: [DONE]\n` alone is a field line: the client's parser buffers it and
  // dispatches nothing. Treating it as an already-visible terminal would leave
  // the client with a bare EOF.
  const truncated = await proxyTruncatedStream({
    ...requestBodies.openai_chat_completions,
    events: 'data: {"choices":[{"delta":{"content":"live"},"index":0}]}\n\ndata: [DONE]\n'
  });
  assertTerminalDelivered(truncated.events, "openai_chat_completions");
});

test("an anthropic message_stop without its blank line does not suppress the frame", options, async () => {
  const truncated = await proxyTruncatedStream({
    ...requestBodies.anthropic_messages,
    events: 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n'
  });
  assertTerminalDelivered(truncated.events, "anthropic_messages");
});

test("an anthropic message_stop that was dispatched suppresses the frame", options, async () => {
  const truncated = await proxyTruncatedStream({
    ...requestBodies.anthropic_messages,
    events: 'event: message_stop\ndata: {"type":"message_stop"}\n\n'
  });
  const payloads = eventPayloads(truncated.events);
  assert.equal(payloads.filter((entry) => entry.event === "error").length, 0);
  assert.equal(truncated.finished, false, "without a frame to send the socket stays the failure signal");
});

// Disclosure: the client text is the generic sentence plus, at most, an
// allowlisted transport token. Source text — a credentialed URL, a signed
// query, an internal address — never reaches it.
const secretBearingMessages = [
  'connect ECONNREFUSED 10.4.19.7:8443',
  "getaddrinfo ENOTFOUND internal-router.corp.example",
  "request to https://user:hunter2@provider.example/v1/messages failed: 403",
  "signed url expired: https://cdn.example/obj?sig=SECRETSIGNATURE&exp=1&oken=SK_live_abc123",
  "Authorization: Bearer sk-live-9f8e7d6c5b4a39281706"
];

for (const message of secretBearingMessages) {
  test(`disclosure: "${message.slice(0, 28)}…" never reaches the client frame`, () => {
    const frame = Buffer.from(terminalErrorFrame({ transportCode: message }, "anthropic_messages")).toString("utf8");
    assert.match(frame, /Upstream stream failed before the response completed/);
    for (const secret of ["10.4.19.7", "internal-router", "hunter2", "SECRETSIGNATURE", "sk-live-9f8e7d6c5b4a39281706", "sig="]) {
      assert.doesNotMatch(frame, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `leaked ${secret}`);
    }
    // The unknown token is not silently promoted either.
    assert.doesNotMatch(frame, /\(.*ECONNREFUSED.*\)/);
  });
}

test("disclosure: an allowlisted transport phase is the only identity the client sees", () => {
  for (const protocol of ["anthropic_messages", "openai_chat_completions", "openai_responses"]) {
    const frame = Buffer.from(terminalErrorFrame({ transportCode: "response_body" }, protocol)).toString("utf8");
    assert.match(frame, /\(response_body\)/, `${protocol}: the phase token is disclosed`);
    assert.doesNotMatch(frame, /ECONNREFUSED|10\.4\.19\.7|https?:/);
  }
});

test("disclosure: the closed set rejects every non-phase token", () => {
  assert.equal(clientSafeTransportCode("response_body"), "response_body");
  assert.equal(clientSafeTransportCode(" RESPONSE_HEADERS "), "response_headers");
  assert.equal(clientSafeTransportCode("fetch"), undefined, "a pre-headers phase is meaningless here");
  assert.equal(clientSafeTransportCode("ECONNREFUSED"), undefined);
  assert.equal(clientSafeTransportCode("https://signed.example/x?sig=1"), undefined);
  assert.equal(clientSafeTransportCode(undefined), undefined);
});

test("a protocol without an in-band error event yields no frame", () => {
  assert.equal(terminalErrorFrame({ transportCode: "connect" }, "gemini_generate_content").byteLength, 0);
  assert.equal(terminalErrorFrame({ transportCode: "connect" }, undefined).byteLength, 0);
});

// The boundary tracker is the shared owner of "is this a real event start".
test("boundary: a clean event boundary needs no repair", () => {
  const tracker = createSseBoundaryTracker();
  tracker.append('data: {"a":1}\n\n');
  assert.deepEqual(tracker.repair(), { bytes: "", openEvent: false, partialLine: false, pendingTerminator: false });
});

test("boundary: a partial line needs a terminator and a dispatch", () => {
  const tracker = createSseBoundaryTracker();
  tracker.append('data: {"a":');
  assert.deepEqual(tracker.repair(), { bytes: "\n\n", openEvent: true, partialLine: true, pendingTerminator: false });
});

test("boundary: a terminated field line still needs the dispatch blank line", () => {
  const tracker = createSseBoundaryTracker();
  tracker.append('data: {"a":1}\n');
  assert.deepEqual(tracker.repair(), { bytes: "\n", openEvent: true, partialLine: false, pendingTerminator: false });
});

test("boundary: a lone trailing newline after a dispatch is still clean", () => {
  const tracker = createSseBoundaryTracker();
  tracker.append('data: {"a":1}\n\n\n');
  assert.deepEqual(tracker.repair(), { bytes: "", openEvent: false, partialLine: false, pendingTerminator: false });
});

test("boundary: a multibyte character split across chunks is one character", () => {
  const tracker = createSseBoundaryTracker();
  const bytes = Buffer.from('data: "héllo"\n\n', "utf8");
  const split = bytes.indexOf(Buffer.from("é", "utf8")) + 1;
  tracker.append(bytes.subarray(0, split));
  tracker.append(bytes.subarray(split));
  assert.deepEqual(tracker.repair(), { bytes: "", openEvent: false, partialLine: false, pendingTerminator: false });
});

test("boundary: a split multibyte tail is still a partial line", () => {
  const tracker = createSseBoundaryTracker();
  const bytes = Buffer.from('data: "hé', "utf8");
  tracker.append(bytes.subarray(0, bytes.length - 1));
  const repair = tracker.repair();
  assert.equal(repair.partialLine, true);
  assert.equal(repair.openEvent, true);
});

test("boundary: an undelivered [DONE] line is reported as the pending terminator", () => {
  const tracker = createSseBoundaryTracker();
  tracker.append("data: [DONE]\n");
  const repair = tracker.repair();
  assert.equal(repair.pendingTerminator, true, "the repair will dispatch it, so it must not be repeated");
  assert.equal(repair.bytes, "\n");
});

test("boundary: an unterminated [DONE] tail is still the pending terminator", () => {
  const tracker = createSseBoundaryTracker();
  tracker.append("data: [DONE]");
  const repair = tracker.repair();
  assert.equal(repair.pendingTerminator, true);
  assert.equal(repair.bytes, "\n\n");
});

test("boundary: an undelivered [DONE] after a dispatch resets to no pending terminator", () => {
  const tracker = createSseBoundaryTracker();
  tracker.append("data: [DONE]\n\n");
  assert.equal(tracker.repair().pendingTerminator, false);
  assert.equal(tracker.repair().bytes, "");
});

test("boundary: a truncated content tail is not mistaken for a terminator", () => {
  const tracker = createSseBoundaryTracker();
  tracker.append('data: {"choices":[{"delta":{"content":"li');
  assert.equal(tracker.repair().pendingTerminator, false);
});
