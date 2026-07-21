import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import test from "node:test";
import { createDefaultAppConfig } from "../../packages/core/src/config/default-config.ts";
import {
  CONTEXT_ARCHIVE_MCP_PATH,
  ContextArchiveService,
  contextArchiveHandoffResponseStream,
  contextArchiveMcpServer,
  contextArchiveService,
  finalizeContextArchiveRequest,
  prepareContextArchiveRequest
} from "../../packages/core/src/gateway/context-archive.ts";

function testConfig(overrides = {}) {
  const config = createDefaultAppConfig({
    generatedConfigFile: "/tmp/ccr-context-archive-test-gateway.json"
  });
  return {
    ...config,
    APIKEY: "local-test-key",
    APIKEYS: [{ id: "local", key: "local-test-key", name: "Local" }],
    contextArchive: {
      ...config.contextArchive,
      enabled: true,
      maxBytes: 16 * 1024 * 1024,
      maxSnapshotBytes: 4 * 1024 * 1024,
      maxSnapshots: 20,
      storagePath: join(tmpdir(), `ccr-context-archive-${randomUUID()}.sqlite`),
      ...overrides
    }
  };
}

function compactHeaders(sessionId, extra = {}) {
  return {
    "x-ccr-context-compact": "handoff",
    "x-session-id": sessionId,
    ...extra
  };
}

function archiveToken(preparedBody) {
  const match = JSON.stringify(preparedBody).match(/Archive session token:\s*([A-Za-z0-9_-]+)/);
  assert.ok(match, "expected archive session token in appended handoff task");
  return match[1];
}

function ready(result, config, route = {}) {
  finalizeContextArchiveRequest(result.record, {
    credentialChain: ["provider-openai_chat_completions-credential-primary"],
    credentialIds: ["primary"],
    logicalProvider: "provider",
    providerProtocol: "openai_chat_completions",
    routedModel: "test-model",
    ...route
  }, config);
}

function mockReplay(answers = []) {
  const calls = [];
  const executor = async (input) => {
    const payload = JSON.parse(input.body.toString("utf8"));
    const payloadText = allStrings(payload).join("\n");
    calls.push({ input, payload });
    const match = answers.find((candidate) => payloadText.includes(candidate.question) && payloadText.includes(candidate.needle));
    const answer = match?.answer ?? "The archived context is insufficient.";
    if (input.snapshot.protocol === "anthropic_messages") {
      return responseResult({ content: [{ text: answer, type: "text" }] });
    }
    if (input.snapshot.protocol === "openai_responses") {
      return responseResult({ output: [{ content: [{ text: answer, type: "output_text" }], role: "assistant", type: "message" }] });
    }
    return responseResult({ choices: [{ message: { content: answer, role: "assistant" } }] });
  };
  return { calls, executor };
}

function responseResult(body, statusCode = 200) {
  return {
    body: JSON.stringify(body),
    contentType: "application/json",
    statusCode
  };
}

function allStrings(value) {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(allStrings);
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(allStrings);
  }
  return [];
}

async function streamText(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

test("compact stores an immutable full request and appends one handoff task", async () => {
  const config = testConfig();
  const body = {
    max_tokens: 777,
    messages: [
      { content: "Historical decision: use SQLite.", role: "user" },
      { content: "Acknowledged.", role: "assistant" },
      { content: "Create a compact handoff.", role: "user" }
    ],
    model: "test-model",
    response_format: { type: "json_object" },
    stream: true,
    tool_choice: "auto",
    tools: [{ function: { name: "read_file" }, type: "function" }]
  };
  const original = Buffer.from(JSON.stringify(body));

  const result = await prepareContextArchiveRequest({
    body: original,
    config,
    headers: compactHeaders("session-a"),
    method: "POST",
    path: "/v1/chat/completions",
    protocol: "openai_chat_completions",
    requestId: "request-a"
  });

  assert.ok(result);
  assert.match(result.diagnostic, /^compact-handoff:session-a:1:arc_/);
  const snapshot = contextArchiveService.getSnapshot(result.record.archiveId, config.contextArchive);
  assert.ok(snapshot);
  assert.deepEqual(snapshot.body, original);
  assert.equal(snapshot.bodySha256.length > 20, true);
  assert.equal(snapshot.status, "pending");

  const forwarded = JSON.parse(result.body.toString("utf8"));
  assert.deepEqual(forwarded.messages.slice(0, body.messages.length), body.messages);
  assert.equal(forwarded.messages.length, body.messages.length + 1);
  assert.equal(forwarded.model, body.model);
  assert.equal(forwarded.max_tokens, body.max_tokens);
  assert.deepEqual(forwarded.response_format, body.response_format);
  assert.deepEqual(forwarded.tools, body.tools);
  assert.deepEqual(forwarded.tool_choice, body.tool_choice);
  assert.equal(forwarded.stream, true);
  assert.match(forwarded.messages.at(-1).content, /CCR compact handoff task/);
  assert.match(forwarded.messages.at(-1).content, /ccr_history_ask/);
});

test("history ask replays the exact snapshot with only one appended natural-language task", async () => {
  const config = testConfig();
  const body = {
    messages: [
      { content: "Decision marker: retry with exponential backoff.", role: "user" },
      { content: "Noted.", role: "assistant" },
      { content: "Compact now.", role: "user" }
    ],
    model: "test-model",
    temperature: 0.37
  };
  const result = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(body)),
    config,
    headers: compactHeaders("session-replay"),
    method: "POST",
    path: "/v1/chat/completions",
    protocol: "openai_chat_completions",
    requestId: "request-replay"
  });
  assert.ok(result);
  ready(result, config, { providerProtocol: "openai_chat_completions" });
  const token = archiveToken(JSON.parse(result.body.toString("utf8")));
  const replay = mockReplay([{
    answer: "The retry policy uses exponential backoff.",
    needle: "exponential backoff",
    question: "What retry policy was selected?"
  }]);

  const output = await contextArchiveService.ask({
    archiveId: result.record.archiveId,
    sessionToken: token,
    task: "What retry policy was selected?"
  }, config.contextArchive, replay.executor);

  assert.match(output.answer, /exponential backoff/);
  assert.equal(output.archiveId, result.record.archiveId);
  assert.equal(output.generation, 1);
  assert.equal(replay.calls.length, 1);
  assert.deepEqual(replay.calls[0].payload.messages.slice(0, body.messages.length), body.messages);
  assert.equal(replay.calls[0].payload.messages.length, body.messages.length + 1);
  assert.equal(replay.calls[0].payload.temperature, body.temperature);
  assert.match(replay.calls[0].payload.messages.at(-1).content, /What retry policy was selected\?/);
});

test("each compact generation remains independently addressable", async () => {
  const config = testConfig();
  const firstBody = {
    messages: [{ content: "Generation one chose PostgreSQL.", role: "user" }],
    model: "test-model"
  };
  const secondBody = {
    messages: [{ content: "Generation two chose SQLite.", role: "user" }],
    model: "test-model"
  };
  const first = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(firstBody)), config, headers: compactHeaders("lineage"), method: "POST",
    path: "/v1/chat/completions", protocol: "openai_chat_completions", requestId: "lineage-1"
  });
  const second = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(secondBody)), config, headers: compactHeaders("lineage"), method: "POST",
    path: "/v1/chat/completions", protocol: "openai_chat_completions", requestId: "lineage-2"
  });
  assert.ok(first);
  assert.ok(second);
  ready(first, config, { providerProtocol: "openai_chat_completions" });
  ready(second, config, { providerProtocol: "openai_chat_completions" });
  assert.equal(first.record.generation, 1);
  assert.equal(second.record.generation, 2);
  const secondSnapshot = contextArchiveService.getSnapshot(second.record.archiveId, config.contextArchive);
  assert.equal(secondSnapshot?.parentArchiveId, first.record.archiveId);

  const replay = mockReplay([
    { answer: "Generation one chose PostgreSQL.", needle: "PostgreSQL", question: "Which database?" },
    { answer: "Generation two chose SQLite.", needle: "SQLite", question: "Which database?" }
  ]);
  const firstAnswer = await contextArchiveService.ask({
    archiveId: first.record.archiveId,
    sessionToken: archiveToken(JSON.parse(first.body.toString("utf8"))),
    task: "Which database?"
  }, config.contextArchive, replay.executor);
  const secondAnswer = await contextArchiveService.ask({
    archiveId: second.record.archiveId,
    sessionToken: archiveToken(JSON.parse(second.body.toString("utf8"))),
    task: "Which database?"
  }, config.contextArchive, replay.executor);
  assert.match(firstAnswer.answer, /PostgreSQL/);
  assert.match(secondAnswer.answer, /SQLite/);
});

test("archive token grants access only to its exact archive", async () => {
  const config = testConfig();
  const make = (requestId, text) => prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify({ messages: [{ content: text, role: "user" }], model: "test-model" })),
    config,
    headers: compactHeaders("token-scope"),
    method: "POST",
    path: "/v1/chat/completions",
    protocol: "openai_chat_completions",
    requestId
  });
  const first = await make("token-1", "first archive");
  const second = await make("token-2", "second archive");
  assert.ok(first);
  assert.ok(second);
  ready(first, config, { providerProtocol: "openai_chat_completions" });
  ready(second, config, { providerProtocol: "openai_chat_completions" });

  await assert.rejects(() => contextArchiveService.ask({
    archiveId: second.record.archiveId,
    sessionToken: archiveToken(JSON.parse(first.body.toString("utf8"))),
    task: "What was archived?"
  }, config.contextArchive, mockReplay().executor), /ARCHIVE_ACCESS_DENIED/);
});

test("snapshots survive a new service instance", async () => {
  const config = testConfig();
  const body = { messages: [{ content: "Persistent fact: cobalt.", role: "user" }], model: "test-model" };
  const firstService = new ContextArchiveService();
  const created = firstService.createSnapshot({
    body: Buffer.from(JSON.stringify(body)),
    config: config.contextArchive,
    headers: compactHeaders("persistent-session"),
    method: "POST",
    path: "/v1/chat/completions",
    protocol: "openai_chat_completions",
    requestId: "persistent-request",
    sessionId: "persistent-session"
  });
  firstService.finalize(created.record, { providerProtocol: "openai_chat_completions", routedModel: "test-model" }, config.contextArchive);

  const restartedService = new ContextArchiveService();
  const replay = mockReplay([{ answer: "The persistent fact is cobalt.", needle: "cobalt", question: "What is the persistent fact?" }]);
  const answer = await restartedService.ask({
    archiveId: created.record.archiveId,
    sessionToken: created.sessionToken,
    task: "What is the persistent fact?"
  }, config.contextArchive, replay.executor);
  assert.match(answer.answer, /cobalt/);
  firstService.close();
  restartedService.close();
});

test("retention removes whole oldest snapshots without overwriting newer generations", async () => {
  const config = testConfig({ maxSnapshots: 2 });
  const records = [];
  for (let index = 1; index <= 3; index += 1) {
    const result = await prepareContextArchiveRequest({
      body: Buffer.from(JSON.stringify({ messages: [{ content: `Generation ${index}`, role: "user" }], model: "test-model" })),
      config,
      headers: compactHeaders("retention-session"),
      method: "POST",
      path: "/v1/chat/completions",
      protocol: "openai_chat_completions",
      requestId: `retention-${index}`
    });
    assert.ok(result);
    records.push(result.record);
  }
  assert.equal(contextArchiveService.getSnapshot(records[0].archiveId, config.contextArchive), undefined);
  assert.equal(contextArchiveService.getSnapshot(records[1].archiveId, config.contextArchive)?.generation, 2);
  assert.equal(contextArchiveService.getSnapshot(records[2].archiveId, config.contextArchive)?.generation, 3);
});

test("OpenAI Responses and Anthropic use protocol-native appended messages", async () => {
  for (const scenario of [
    {
      body: { input: [{ content: [{ text: "Responses fact", type: "input_text" }], role: "user", type: "message" }], model: "gpt-test" },
      path: "/v1/responses",
      protocol: "openai_responses"
    },
    {
      body: { messages: [{ content: "Anthropic fact", role: "user" }], model: "claude-test", system: "You are a coding agent." },
      path: "/v1/messages",
      protocol: "anthropic_messages"
    }
  ]) {
    const config = testConfig();
    const result = await prepareContextArchiveRequest({
      body: Buffer.from(JSON.stringify(scenario.body)),
      config,
      headers: compactHeaders(`session-${scenario.protocol}`),
      method: "POST",
      path: scenario.path,
      protocol: scenario.protocol,
      requestId: `request-${scenario.protocol}`
    });
    assert.ok(result);
    ready(result, config, { providerProtocol: scenario.protocol });
    const prepared = JSON.parse(result.body.toString("utf8"));
    if (scenario.protocol === "openai_responses") {
      assert.deepEqual(prepared.input.slice(0, scenario.body.input.length), scenario.body.input);
      assert.equal(prepared.input.length, scenario.body.input.length + 1);
    } else {
      assert.deepEqual(prepared.messages.slice(0, scenario.body.messages.length), scenario.body.messages);
      assert.equal(prepared.messages.length, scenario.body.messages.length + 1);
      assert.equal(prepared.system, scenario.body.system);
    }
  }
});

test("only explicit or structural compact signals create archives", async () => {
  const config = testConfig();
  const promptOnly = {
    messages: [{ content: "Please summarize the conversation for a new compact context.", role: "user" }],
    model: "test-model"
  };
  const ignored = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(promptOnly)),
    config,
    headers: { "user-agent": "claude-code/2.0", "x-session-id": "prompt-only" },
    method: "POST",
    path: "/v1/messages",
    protocol: "anthropic_messages",
    requestId: "prompt-only"
  });
  assert.equal(ignored, undefined);

  const structural = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify({
      context_management: { edits: [{ type: "compact_20260112" }] },
      messages: [{ content: "Structural compact.", role: "user" }],
      model: "claude-test"
    })),
    config,
    headers: { "x-session-id": "structural" },
    method: "POST",
    path: "/v1/messages",
    protocol: "anthropic_messages",
    requestId: "structural"
  });
  assert.ok(structural);
  assert.match(structural.diagnostic, /^compact-handoff:structural:/);
});

test("compact refuses unresolved tool-call boundaries instead of trimming them", async () => {
  const config = testConfig();
  await assert.rejects(() => prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify({
      messages: [{ content: "Inspecting.", role: "assistant", tool_calls: [{ function: { name: "read_file" }, id: "call_1", type: "function" }] }],
      model: "test-model"
    })),
    config,
    headers: compactHeaders("tool-boundary"),
    method: "POST",
    path: "/v1/chat/completions",
    protocol: "openai_chat_completions",
    requestId: "tool-boundary"
  }), /ARCHIVE_NOT_AT_TURN_BOUNDARY/);
});

test("history replay reports upstream and tool-call failures without fallback", async () => {
  const config = testConfig();
  const result = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify({ messages: [{ content: "Compact.", role: "user" }], model: "test-model" })),
    config,
    headers: compactHeaders("error-session"),
    method: "POST",
    path: "/v1/chat/completions",
    protocol: "openai_chat_completions",
    requestId: "error-request"
  });
  assert.ok(result);
  ready(result, config, { providerProtocol: "openai_chat_completions" });
  const input = {
    archiveId: result.record.archiveId,
    sessionToken: archiveToken(JSON.parse(result.body.toString("utf8"))),
    task: "What happened?"
  };
  await assert.rejects(() => contextArchiveService.ask(input, config.contextArchive, async () => responseResult({ error: "over context" }, 400)), /ARCHIVE_UPSTREAM_ERROR/);
  await assert.rejects(() => contextArchiveService.ask(input, config.contextArchive, async () => responseResult({
    choices: [{ message: { content: null, tool_calls: [{ function: { name: "read_file" }, type: "function" }] } }]
  })), /ARCHIVE_REPLAY_TOOL_REQUIRED/);
});

test("compact responses deterministically include archive access for JSON and SSE", async () => {
  const record = {
    archiveId: "arc_footer",
    footer: "CCR ARCHIVED HISTORY ACCESS\nArchive id: arc_footer\nArchive session token: footer-token",
    generation: 1,
    sessionId: "footer-session"
  };
  const anthropicJson = await streamText(contextArchiveHandoffResponseStream(
    Readable.from([JSON.stringify({ content: [{ text: "Handoff summary", type: "text" }], role: "assistant" })]),
    record,
    "anthropic_messages",
    "application/json"
  ));
  const parsed = JSON.parse(anthropicJson);
  assert.match(parsed.content.at(-1).text, /Archive id: arc_footer/);

  const openAiSse = [
    'data: {"id":"chatcmpl_1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Handoff summary"},"finish_reason":null}]}',
    '',
    'data: {"id":"chatcmpl_1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
    '',
    'data: [DONE]',
    ''
  ].join("\n");
  const transformedSse = await streamText(contextArchiveHandoffResponseStream(
    Readable.from([openAiSse]),
    record,
    "openai_chat_completions",
    "text/event-stream"
  ));
  assert.match(transformedSse, /Archive id: arc_footer/);
  assert.equal((transformedSse.match(/CCR ARCHIVED HISTORY ACCESS/g) ?? []).length, 1);
});

test("context archive MCP server points at the built-in gateway endpoint", () => {
  const config = testConfig();
  const server = contextArchiveMcpServer(config, "http://127.0.0.1:3456", "local-test-key");
  assert.ok(server);
  assert.equal(server.name, "ccr-context-archive");
  assert.equal(server.transport, "streamable-http");
  assert.equal(server.apiKey, "local-test-key");
  assert.equal(server.requestTimeoutMs, config.contextArchive.replayTimeoutMs);
  assert.equal(server.url, `http://127.0.0.1:3456${CONTEXT_ARCHIVE_MCP_PATH}`);
});
