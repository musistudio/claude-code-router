import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import test from "node:test";
import { createDefaultAppConfig } from "../../packages/core/src/config/default-config.ts";
import {
  appendContextArchiveToolOutputsForTest,
  contextArchiveFunctionCallsForTest,
  parseContextArchiveToolResponseBodyForTest,
  prepareContextArchiveToolContinuationRequestForTest
} from "../../packages/core/src/gateway/service.ts";
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

function archiveCredentialsFromText(text) {
  const archiveId = text.match(/Archive id:\s*(arc_[A-Za-z0-9_-]+)/)?.[1];
  const sessionToken = text.match(/Archive session token:\s*([A-Za-z0-9_-]+)/)?.[1];
  assert.ok(archiveId, "expected archive id in compact handoff text");
  assert.ok(sessionToken, "expected archive session token in compact handoff text");
  return { archiveId, sessionToken };
}

function claudeAutoCompactPrompt() {
  return [
    "CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.",
    "",
    "- Do NOT use Read, Bash, Grep, Glob, Edit, Write, or ANY other tool.",
    "- You already have all the context you need in the conversation above.",
    "- Your entire response must be plain text: an <analysis> block followed by a <summary> block.",
    "",
    "Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.",
    "This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context."
  ].join("\n");
}

function sseJsonPayloads(raw) {
  const payloads = [];
  for (const block of raw.split(/\n\n+/)) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n");
    if (data && data !== "[DONE]") {
      payloads.push(JSON.parse(data));
    }
  }
  return payloads;
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

test("managed compact profile enables archive only for that profile API key", async () => {
  const config = testConfig({ enabled: false });
  config.APIKEYS = [
    { id: "profile:managed-compact", key: "managed-key", name: "Managed Compact" },
    { id: "profile:plain-profile", key: "plain-key", name: "Plain Profile" }
  ];
  config.profile.profiles = [
    {
      agent: "claude-code",
      enabled: true,
      env: {},
      id: "managed-compact",
      managedCompact: true,
      model: "test/model",
      name: "Managed Compact",
      scope: "ccr",
      settingsFile: "~/.claude/settings.json",
      smallFastModel: "",
      surface: "auto"
    },
    {
      agent: "claude-code",
      enabled: true,
      env: {},
      id: "plain-profile",
      managedCompact: false,
      model: "test/model",
      name: "Plain Profile",
      scope: "ccr",
      settingsFile: "~/.claude/settings.json",
      smallFastModel: "",
      surface: "auto"
    }
  ];
  const body = Buffer.from(JSON.stringify({
    messages: [
      { content: "Historical decision: use SQLite.", role: "user" },
      { content: "Create a compact handoff.", role: "user" }
    ],
    model: "test-model"
  }));
  const input = {
    body,
    config,
    headers: compactHeaders("managed-session"),
    method: "POST",
    path: "/v1/chat/completions",
    protocol: "openai_chat_completions",
    requestId: "managed-request"
  };

  assert.equal(await prepareContextArchiveRequest(input), undefined);
  assert.equal(await prepareContextArchiveRequest({ ...input, apiKey: { id: "profile:plain-profile" } }), undefined);

  const result = await prepareContextArchiveRequest({ ...input, apiKey: { id: "profile:managed-compact" } });
  assert.ok(result);
  assert.equal(result.config.contextArchive.enabled, true);
  assert.equal(result.config.contextArchive.mcpEnabled, true);
  assert.match(result.diagnostic, /^compact-handoff:managed-session:1:arc_/);

  const globallyEnabled = {
    ...config,
    contextArchive: {
      ...config.contextArchive,
      enabled: true
    }
  };
  assert.equal(await prepareContextArchiveRequest({
    ...input,
    apiKey: { id: "profile:plain-profile" },
    config: globallyEnabled
  }), undefined);
  assert.ok(await prepareContextArchiveRequest({
    ...input,
    config: globallyEnabled,
    requestId: "managed-request-global"
  }));
});

test("compact stores an immutable full request and appends one handoff task", async () => {
  const config = testConfig();
  const body = {
    context_management: { edits: [{ reason: "compact", type: "compact_20260112" }] },
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
  assert.equal(forwarded.max_tokens, 2048);
  assert.equal(forwarded.context_management, undefined);
  assert.equal(forwarded.response_format, undefined);
  assert.equal(forwarded.tools, undefined);
  assert.equal(forwarded.tool_choice, undefined);
  assert.equal(forwarded.stream, true);
  assert.match(forwarded.messages.at(-1).content, /CCR compact handoff task/);
  assert.match(forwarded.messages.at(-1).content, /ccr_history_ask/);
  assert.match(forwarded.messages.at(-1).content, /mcp__ccr-context-archive__ccr_history_ask/);
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

test("latest archive token searches parent generations when the current compact snapshot is insufficient", async () => {
  const config = testConfig();
  const firstBody = {
    messages: [{ content: "Generation one hidden marker: PEARL-LINEAGE-01.", role: "user" }],
    model: "test-model"
  };
  const secondBody = {
    messages: [{ content: "Generation two compact summary omitted the hidden marker but continued the task.", role: "user" }],
    model: "test-model"
  };
  const first = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(firstBody)),
    config,
    headers: compactHeaders("lineage-search"),
    method: "POST",
    path: "/v1/chat/completions",
    protocol: "openai_chat_completions",
    requestId: "lineage-search-1"
  });
  const second = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(secondBody)),
    config,
    headers: compactHeaders("lineage-search"),
    method: "POST",
    path: "/v1/chat/completions",
    protocol: "openai_chat_completions",
    requestId: "lineage-search-2"
  });
  assert.ok(first);
  assert.ok(second);
  ready(first, config, { providerProtocol: "openai_chat_completions" });
  ready(second, config, { providerProtocol: "openai_chat_completions" });

  const replay = mockReplay([{
    answer: "The generation one hidden marker is PEARL-LINEAGE-01.",
    needle: "PEARL-LINEAGE-01",
    question: "What was the generation one hidden marker?"
  }]);
  const output = await contextArchiveService.ask({
    archiveId: second.record.archiveId,
    sessionToken: archiveToken(JSON.parse(second.body.toString("utf8"))),
    task: "What was the generation one hidden marker?"
  }, config.contextArchive, replay.executor);

  assert.match(output.answer, /PEARL-LINEAGE-01/);
  assert.equal(output.archiveId, second.record.archiveId);
  assert.equal(output.generation, 2);
  assert.equal(output.sourceArchiveId, first.record.archiveId);
  assert.equal(output.sourceGeneration, 1);
  assert.deepEqual(output.searchedGenerations, [2, 1]);
  assert.equal(replay.calls.length, 2);
  assert.equal(replay.calls[0].input.snapshot.archiveId, second.record.archiveId);
  assert.equal(replay.calls[1].input.snapshot.archiveId, first.record.archiveId);
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

test("Anthropic compact continuation injects the archive tool for Claude Code", () => {
  const config = testConfig();
  const toolName = "mcp__ccr-context-archive__ccr_history_ask";
  const handoff = [
    "CCR ARCHIVED HISTORY ACCESS",
    "Archive id: arc_anthropic_test",
    "Archive session token: token_anthropic_test"
  ].join("\n");
  const result = prepareContextArchiveToolContinuationRequestForTest({
    body: Buffer.from(JSON.stringify({
      messages: [
        { content: "Retained tail.", role: "user" },
        { content: [{ text: handoff, type: "text" }], role: "user" }
      ],
      model: "claude-test",
      system: "You are Claude Code.",
      tool_choice: { type: "none" },
      tools: [{ input_schema: { type: "object" }, name: "Read" }]
    })),
    config,
    method: "POST",
    path: "/v1/messages",
    protocol: "anthropic_messages"
  });

  assert.ok(result);
  assert.equal(result.archiveId, "arc_anthropic_test");
  assert.equal(result.sessionToken, "token_anthropic_test");
  assert.equal(result.toolName, toolName);
  assert.deepEqual(result.acceptedToolNames.sort(), ["ccr_history_ask", toolName].sort());
  const forwarded = JSON.parse(result.body.toString("utf8"));
  assert.deepEqual(forwarded.tool_choice, { type: "auto" });
  assert.ok(forwarded.tools.some((tool) => tool.name === "Read"));
  assert.ok(forwarded.tools.some((tool) => tool.name === toolName));
  assert.match(JSON.stringify(forwarded.system), /CCR context archive is available/);
});

test("Anthropic archive tool calls are converted into tool results for continuation", () => {
  const toolName = "mcp__ccr-context-archive__ccr_history_ask";
  const response = {
    content: [
      {
        id: "toolu_json",
        input: { archive_id: "arc_json", session_token: "token_json", task: "Find marker A." },
        name: toolName,
        type: "tool_use"
      }
    ],
    role: "assistant",
    type: "message"
  };
  const calls = contextArchiveFunctionCallsForTest(response, "anthropic_messages");
  assert.deepEqual(calls, [{
    arguments: JSON.stringify({ archive_id: "arc_json", session_token: "token_json", task: "Find marker A." }),
    callId: "toolu_json",
    name: toolName
  }]);

  const next = appendContextArchiveToolOutputsForTest(
    Buffer.from(JSON.stringify({ messages: [{ content: "Need exact marker.", role: "user" }], model: "claude-test" })),
    response,
    [{ call_id: "toolu_json", output: JSON.stringify({ answer: "Marker A is SQLite." }), type: "function_call_output" }],
    "anthropic_messages"
  );
  assert.ok(next);
  const forwarded = JSON.parse(next.toString("utf8"));
  assert.equal(forwarded.messages.at(-2).role, "assistant");
  assert.deepEqual(forwarded.messages.at(-2).content, response.content);
  assert.equal(forwarded.messages.at(-1).role, "user");
  assert.deepEqual(forwarded.messages.at(-1).content, [{
    content: JSON.stringify({ answer: "Marker A is SQLite." }),
    tool_use_id: "toolu_json",
    type: "tool_result"
  }]);
});

test("Anthropic streaming archive tool calls are parsed from SSE deltas", () => {
  const toolName = "mcp__ccr-context-archive__ccr_history_ask";
  const raw = [
    'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_sse","type":"message","role":"assistant","content":[]}}',
    `event: content_block_start\ndata: ${JSON.stringify({
      content_block: { id: "toolu_sse", input: {}, name: toolName, type: "tool_use" },
      index: 0,
      type: "content_block_start"
    })}`,
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"archive_id\\":\\"arc_sse\\","}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"session_token\\":\\"token_sse\\",\\"task\\":\\"Find SSE marker.\\"}"}}',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null}}',
    'event: message_stop\ndata: {"type":"message_stop"}'
  ].join("\n\n");
  const parsed = parseContextArchiveToolResponseBodyForTest(Buffer.from(raw), "text/event-stream", "anthropic_messages");
  assert.ok(parsed);
  const calls = contextArchiveFunctionCallsForTest(parsed, "anthropic_messages");
  assert.deepEqual(calls, [{
    arguments: JSON.stringify({ archive_id: "arc_sse", session_token: "token_sse", task: "Find SSE marker." }),
    callId: "toolu_sse",
    name: toolName
  }]);
});

test("Responses streaming archive tool calls are parsed from SSE deltas", () => {
  const raw = [
    'event: response.output_item.added\ndata: {"type":"response.output_item.added","output_index":0,"item":{"id":"fc_sse","call_id":"call_sse","type":"function_call","name":"ccr_history_ask","arguments":""}}',
    'event: response.function_call_arguments.delta\ndata: {"type":"response.function_call_arguments.delta","output_index":0,"item_id":"fc_sse","delta":"{\\"archive_id\\":\\"arc_sse\\","}',
    'event: response.function_call_arguments.delta\ndata: {"type":"response.function_call_arguments.delta","output_index":0,"item_id":"fc_sse","delta":"\\"session_token\\":\\"token_sse\\",\\"task\\":\\"Find Responses marker.\\"}"}',
    'event: response.function_call_arguments.done\ndata: {"type":"response.function_call_arguments.done","output_index":0,"item_id":"fc_sse","arguments":"{\\"archive_id\\":\\"arc_sse\\",\\"session_token\\":\\"token_sse\\",\\"task\\":\\"Find Responses marker.\\"}"}',
    'event: response.output_item.done\ndata: {"type":"response.output_item.done","output_index":0,"item":{"id":"fc_sse","call_id":"call_sse","type":"function_call","name":"ccr_history_ask","arguments":"{\\"archive_id\\":\\"arc_sse\\",\\"session_token\\":\\"token_sse\\",\\"task\\":\\"Find Responses marker.\\"}"}}',
    'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_sse","status":"completed"}}'
  ].join("\n\n");
  const parsed = parseContextArchiveToolResponseBodyForTest(Buffer.from(raw), "text/event-stream", "openai_responses");
  assert.ok(parsed);
  const calls = contextArchiveFunctionCallsForTest(parsed, "openai_responses");
  assert.deepEqual(calls, [{
    arguments: JSON.stringify({ archive_id: "arc_sse", session_token: "token_sse", task: "Find Responses marker." }),
    callId: "call_sse",
    name: "ccr_history_ask"
  }]);
});

test("compact handoff strips protocol-specific tool and schema constraints", async () => {
  const config = testConfig();
  const result = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify({
      input: [{ content: [{ text: "Responses fact", type: "input_text" }], role: "user", type: "message" }],
      max_output_tokens: 128,
      metadata: { ccr_context_compact: true, keep: "yes" },
      model: "gpt-test",
      parallel_tool_calls: true,
      text: { format: { name: "handoff", schema: { type: "object" }, type: "json_schema" } },
      tool_choice: "auto",
      tools: [{ name: "read_file", type: "function" }]
    })),
    config,
    headers: { "x-session-id": "responses-sanitize" },
    method: "POST",
    path: "/v1/responses",
    protocol: "openai_responses",
    requestId: "responses-sanitize"
  });

  assert.ok(result);
  const forwarded = JSON.parse(result.body.toString("utf8"));
  assert.equal(forwarded.tools, undefined);
  assert.equal(forwarded.tool_choice, undefined);
  assert.equal(forwarded.parallel_tool_calls, undefined);
  assert.equal(forwarded.metadata.ccr_context_compact, undefined);
  assert.equal(forwarded.metadata.keep, "yes");
  assert.deepEqual(forwarded.text.format, { type: "text" });
  assert.equal(forwarded.max_output_tokens, 2048);
  assert.equal(forwarded.input.length, 2);
  assert.match(forwarded.input.at(-1).content[0].text, /CCR compact handoff task/);
});

test("Codex /responses/compact prepares a Responses handoff and Codex compact JSON response", async () => {
  const config = testConfig();
  const body = {
    client_metadata: { session_id: "codex-session" },
    input: [
      { content: [{ text: "Keep this decision.", type: "input_text" }], role: "user", type: "message" }
    ],
    model: "gpt-5-codex",
    parallel_tool_calls: true,
    tools: [{ name: "apply_patch", type: "custom" }]
  };
  const original = Buffer.from(JSON.stringify(body));
  const result = await prepareContextArchiveRequest({
    body: original,
    config,
    headers: { "user-agent": "codex-test" },
    method: "POST",
    path: "/v1/responses/compact",
    protocol: "openai_responses",
    requestId: "codex-compact"
  });

  assert.ok(result);
  assert.equal(result.upstreamPath, "/v1/responses");
  assert.equal(result.responseMode, "codex_responses_compact_json");
  assert.equal(result.responseContentType, "application/json; charset=utf-8");
  const snapshot = contextArchiveService.getSnapshot(result.record.archiveId, config.contextArchive);
  assert.ok(snapshot);
  assert.equal(snapshot.path, "/v1/responses");
  assert.deepEqual(snapshot.body, original);

  const forwarded = JSON.parse(result.body.toString("utf8"));
  assert.equal(forwarded.tools, undefined);
  assert.equal(forwarded.parallel_tool_calls, undefined);
  assert.equal(forwarded.client_metadata.session_id, "codex-session");
  assert.equal(forwarded.input.length, 2);
  assert.match(forwarded.input.at(-1).content[0].text, /CCR compact handoff task/);

  const transformed = await streamText(contextArchiveHandoffResponseStream(
    Readable.from([JSON.stringify({ output: [{ content: [{ text: "Handoff summary", type: "output_text" }], role: "assistant", type: "message" }] })]),
    result.record,
    "openai_responses",
    "application/json",
    result.responseMode
  ));
  const compact = JSON.parse(transformed);
  assert.equal(compact.output.length, 1);
  assert.equal(compact.output[0].type, "compaction");
  assert.match(compact.output[0].encrypted_content, /Handoff summary/);
  assert.match(compact.output[0].encrypted_content, /Archive id: arc_/);
});

test("Codex Responses compaction trigger prepares a compact SSE response item", async () => {
  const config = testConfig();
  const body = {
    input: [
      { content: [{ text: "Earlier user request.", type: "input_text" }], role: "user", type: "message" },
      { type: "compaction_trigger" }
    ],
    model: "gpt-5-codex",
    stream: true,
    tools: [{ name: "apply_patch", type: "custom" }]
  };
  const result = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(body)),
    config,
    headers: { "user-agent": "codex-test" },
    method: "POST",
    path: "/v1/responses",
    protocol: "openai_responses",
    requestId: "codex-compact-v2"
  });

  assert.ok(result);
  assert.equal(result.upstreamPath, undefined);
  assert.equal(result.responseMode, "codex_responses_compaction_sse");
  assert.equal(result.responseContentType, "text/event-stream; charset=utf-8");
  const forwarded = JSON.parse(result.body.toString("utf8"));
  assert.equal(forwarded.tools, undefined);
  assert.equal(forwarded.input.some((item) => item.type === "compaction_trigger"), false);
  assert.equal(forwarded.input.length, 2);
  assert.match(forwarded.input.at(-1).content[0].text, /CCR compact handoff task/);

  const upstreamSse = [
    "event: response.output_text.delta",
    'data: {"type":"response.output_text.delta","delta":"SSE handoff","output_index":0,"content_index":0,"item_id":"msg_1"}',
    "",
    "event: response.completed",
    'data: {"type":"response.completed","response":{"id":"resp_upstream"}}',
    ""
  ].join("\n");
  const transformed = await streamText(contextArchiveHandoffResponseStream(
    Readable.from([upstreamSse]),
    result.record,
    "openai_responses",
    "text/event-stream",
    result.responseMode
  ));
  assert.match(transformed, /event: response.output_item.done/);
  assert.match(transformed, /"type":"compaction"/);
  assert.match(transformed, /SSE handoff/);
  assert.match(transformed, /Archive id: arc_/);
  assert.match(transformed, /event: response.completed/);

  ready(result, config, { providerProtocol: "openai_responses" });
  const replay = mockReplay([{
    answer: "The earlier request was preserved.",
    needle: "Earlier user request.",
    question: "What was the earlier request?"
  }]);
  const output = await contextArchiveService.ask({
    archiveId: result.record.archiveId,
    sessionToken: archiveToken(forwarded),
    task: "What was the earlier request?"
  }, config.contextArchive, replay.executor);
  assert.match(output.answer, /earlier request/);
  assert.equal(replay.calls[0].payload.input.some((item) => item.type === "compaction_trigger"), false);
});

test("Codex CLI compaction item exposes archive access that can recall omitted context", async () => {
  const config = testConfig();
  const preservedMarker = "ORCHID-9000";
  const body = {
    input: [
      { content: [{ text: `Deploy key marker: ${preservedMarker}.`, type: "input_text" }], role: "user", type: "message" },
      { content: [{ text: "Keep going after the compact.", type: "input_text" }], role: "user", type: "message" },
      { type: "compaction_trigger" }
    ],
    model: "gpt-5-codex",
    stream: true,
    tools: [{ name: "apply_patch", type: "custom" }]
  };
  const result = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(body)),
    config,
    headers: { "user-agent": "codex-cli-test" },
    method: "POST",
    path: "/v1/responses",
    protocol: "openai_responses",
    requestId: "codex-compact-recall"
  });

  assert.ok(result);
  assert.equal(result.responseMode, "codex_responses_compaction_sse");
  ready(result, config, { providerProtocol: "openai_responses" });
  const upstreamSse = [
    "event: response.output_text.delta",
    'data: {"type":"response.output_text.delta","delta":"Codex summary intentionally omits the deploy key.","output_index":0,"content_index":0,"item_id":"msg_1"}',
    "",
    "event: response.completed",
    'data: {"type":"response.completed","response":{"id":"resp_upstream"}}',
    ""
  ].join("\n");
  const transformed = await streamText(contextArchiveHandoffResponseStream(
    Readable.from([upstreamSse]),
    result.record,
    "openai_responses",
    "text/event-stream",
    result.responseMode
  ));
  const compactionEvent = sseJsonPayloads(transformed).find((payload) => payload.type === "response.output_item.done");
  assert.ok(compactionEvent, "expected Codex compact SSE output item");
  assert.equal(compactionEvent.item.type, "compaction");
  assert.match(compactionEvent.item.encrypted_content, /CCR ARCHIVED HISTORY ACCESS/);
  assert.doesNotMatch(compactionEvent.item.encrypted_content, new RegExp(preservedMarker));
  const credentials = archiveCredentialsFromText(compactionEvent.item.encrypted_content);
  assert.equal(credentials.archiveId, result.record.archiveId);

  const replay = mockReplay([{
    answer: `The deploy key marker is ${preservedMarker}.`,
    needle: preservedMarker,
    question: "What deploy key marker was preserved?"
  }]);
  const output = await contextArchiveService.ask({
    archiveId: credentials.archiveId,
    sessionToken: credentials.sessionToken,
    task: "What deploy key marker was preserved?"
  }, config.contextArchive, replay.executor);

  assert.match(output.answer, new RegExp(preservedMarker));
  assert.equal(replay.calls.length, 1);
  assert.equal(replay.calls[0].payload.input.some((item) => item.type === "compaction_trigger"), false);
  assert.match(allStrings(replay.calls[0].payload).join("\n"), new RegExp(preservedMarker));
});

test("Claude Code auto compact handoff exposes archive access that can recall omitted context", async () => {
  const config = testConfig();
  const preservedMarker = "BLUE-LANTERN-42";
  const body = {
    context_management: { edits: [{ keep: "all", type: "clear_thinking_20251015" }] },
    max_tokens: 32000,
    messages: [
      { content: `Project codename marker: ${preservedMarker}.`, role: "user" },
      { content: "Noted for the implementation handoff.", role: "assistant" },
      { content: [{ text: claudeAutoCompactPrompt(), type: "text" }], role: "user" }
    ],
    model: "claude-test",
    tools: []
  };
  const result = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(body)),
    config,
    headers: { "user-agent": "claude-code/2.1.211", "x-session-id": "claude-auto-recall" },
    method: "POST",
    path: "/v1/messages",
    protocol: "anthropic_messages",
    requestId: "claude-auto-recall"
  });

  assert.ok(result);
  ready(result, config, { providerProtocol: "anthropic_messages" });
  const transformed = await streamText(contextArchiveHandoffResponseStream(
    Readable.from([JSON.stringify({
      content: [{ text: "Claude summary intentionally omits the project codename.", type: "text" }],
      role: "assistant"
    })]),
    result.record,
    "anthropic_messages",
    "application/json",
    result.responseMode
  ));
  const compactResponse = JSON.parse(transformed);
  const compactText = compactResponse.content.map((item) => item.text ?? "").join("\n");
  assert.match(compactText, /CCR ARCHIVED HISTORY ACCESS/);
  assert.match(compactText, /mcp__ccr-context-archive__ccr_history_ask/);
  assert.doesNotMatch(compactText, new RegExp(preservedMarker));
  const credentials = archiveCredentialsFromText(compactText);
  assert.equal(credentials.archiveId, result.record.archiveId);

  const replay = mockReplay([{
    answer: `The project codename marker is ${preservedMarker}.`,
    needle: preservedMarker,
    question: "What is the project codename marker?"
  }]);
  const output = await contextArchiveService.ask({
    archiveId: credentials.archiveId,
    sessionToken: credentials.sessionToken,
    task: "What is the project codename marker?"
  }, config.contextArchive, replay.executor);

  assert.match(output.answer, new RegExp(preservedMarker));
  assert.equal(replay.calls.length, 1);
  assert.deepEqual(replay.calls[0].payload.context_management, body.context_management);
  assert.match(allStrings(replay.calls[0].payload).join("\n"), new RegExp(preservedMarker));
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

  const auto = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify({
      context_management: { edits: [{ keep: "all", type: "clear_thinking_20251015" }] },
      max_tokens: 32000,
      messages: [
        { content: "Earlier user request.", role: "user" },
        { content: "Earlier assistant answer.", role: "assistant" },
        { content: [{ text: claudeAutoCompactPrompt(), type: "text" }], role: "user" }
      ],
      model: "claude-test",
      tools: []
    })),
    config,
    headers: { "x-session-id": "claude-auto" },
    method: "POST",
    path: "/v1/messages",
    protocol: "anthropic_messages",
    requestId: "claude-auto"
  });
  assert.ok(auto);
  assert.match(auto.diagnostic, /^compact-handoff:claude-auto:/);
  const forwarded = JSON.parse(auto.body.toString("utf8"));
  assert.equal(forwarded.tools, undefined);
  assert.deepEqual(forwarded.context_management, { edits: [{ keep: "all", type: "clear_thinking_20251015" }] });
  assert.match(forwarded.messages.at(-1).content, /CCR compact handoff task/);
  assert.match(forwarded.messages.at(-1).content, /mcp__ccr-context-archive__ccr_history_ask/);
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
