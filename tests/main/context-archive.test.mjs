import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "../../packages/core/src/config/default-config.ts";
import {
  CONTEXT_ARCHIVE_MCP_PATH,
  contextArchiveMcpServer,
  contextArchiveService,
  prepareContextArchiveRequest
} from "../../packages/core/src/gateway/context-archive.ts";

function testConfig(contextArchiveOverrides = {}) {
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
      handoffMaxCharacters: 12000,
      maxEntries: 200,
      maxSearchResults: 4,
      retainRecentItems: 2,
      triggerTokenLimit: 1,
      ...contextArchiveOverrides
    }
  };
}

test("context archive compacts OpenAI chat requests and preserves searchable pruned history", async () => {
  contextArchiveService.clear();
  const config = testConfig();
  const body = {
    messages: [
      { role: "system", content: "You are a coding agent." },
      { role: "user", content: "Historical decision: use SQLite for the archive index, not a JSON file." },
      { role: "assistant", content: "Acknowledged. I will use SQLite." },
      { role: "user", content: "Recent request: continue implementation." },
      { role: "assistant", content: "Working on it." }
    ],
    model: "test-model"
  };

  const result = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(body)),
    config,
    headers: { "x-session-id": "session-a" },
    method: "POST",
    path: "/v1/chat/completions",
    protocol: "openai_chat_completions",
    requestId: "request-a"
  });

  assert.ok(result);
  assert.match(result.diagnostic, /^compacted:session-a:/);
  const compacted = JSON.parse(result.body.toString("utf8"));
  assert.equal(compacted.messages[0].role, "system");
  assert.match(compacted.messages[1].content, /CCR CONTEXT HANDOFF/);
  assert.match(compacted.messages[1].content, /ccr_history_search/);
  assert.equal(compacted.messages.at(-1).content, "Working on it.");

  const search = await contextArchiveService.search({
    prompt: "Which storage was chosen for the archive index?",
    sessionId: "session-a"
  }, config.contextArchive);
  assert.equal(search.evidence.length > 0, true);
  assert.match(search.answer, /SQLite/);
});

test("context archive adapts Codex compact requests without pruning the client payload", async () => {
  contextArchiveService.clear();
  const config = testConfig({ triggerTokenLimit: 999999 });
  const body = {
    instructions: "You are Codex.",
    input: [
      {
        content: [
          {
            text: "Historical decision: the archive search should use a radix index for quick prefix lookup.",
            type: "input_text"
          }
        ],
        role: "user",
        type: "message"
      },
      {
        content: [
          {
            text: "Please summarize the conversation so far for context compaction. Include decisions and next steps.",
            type: "input_text"
          }
        ],
        role: "user",
        type: "message"
      }
    ],
    model: "gpt-5-codex"
  };

  const result = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(body)),
    config,
    headers: { "user-agent": "codex-cli/1.0", "x-codex-session-id": "codex-s1" },
    method: "POST",
    path: "/v1/responses",
    protocol: "openai_responses",
    requestId: "request-codex-compact"
  });

  assert.ok(result);
  assert.match(result.diagnostic, /^client-compact:codex:codex-s1:/);
  const prepared = JSON.parse(result.body.toString("utf8"));
  assert.equal(prepared.input.length, body.input.length);
  assert.match(prepared.instructions, /Archived history access/);
  assert.match(prepared.instructions, /ccr_history_search/);
  assert.match(prepared.instructions, /codex-s1/);

  const search = await contextArchiveService.search({
    prompt: "Which index was chosen for archive search?",
    sessionId: "codex-s1"
  }, config.contextArchive);
  assert.match(search.answer, /radix index/);
});

test("context archive adapts Claude Code compact requests without pruning messages", async () => {
  contextArchiveService.clear();
  const config = testConfig({ triggerTokenLimit: 999999 });
  const body = {
    messages: [
      {
        content: "Important result: npm run test:main passes after the context archive changes.",
        role: "assistant"
      },
      {
        content: "Summarize the conversation so far for handoff into a new context window.",
        role: "user"
      }
    ],
    model: "claude-sonnet-4-5",
    mcp_servers: [{ name: "filesystem" }],
    parallel_tool_calls: true,
    system: "You are Claude Code.",
    tool_choice: { type: "auto" },
    tools: [{ input_schema: { type: "object" }, name: "Write", type: "custom" }]
  };

  const result = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(body)),
    config,
    headers: { "user-agent": "claude-code/2.0", "x-claude-code-session-id": "claude-s1" },
    method: "POST",
    path: "/v1/messages",
    protocol: "anthropic_messages",
    requestId: "request-claude-compact"
  });

  assert.ok(result);
  assert.match(result.diagnostic, /^client-compact:claude-code:claude-s1:/);
  const prepared = JSON.parse(result.body.toString("utf8"));
  assert.equal(prepared.messages.length, body.messages.length);
  assert.equal(prepared.tools.length, body.tools.length);
  assert.deepEqual(prepared.tool_choice, body.tool_choice);
  assert.deepEqual(prepared.mcp_servers, body.mcp_servers);
  assert.equal(prepared.parallel_tool_calls, true);
  assert.match(prepared.system, /Archived history access/);
  assert.match(prepared.system, /ccr_history_search/);
  assert.match(prepared.system, /claude-s1/);

  const search = await contextArchiveService.search({
    prompt: "What test command passed?",
    sessionId: "claude-s1"
  }, config.contextArchive);
  assert.match(search.answer, /npm run test:main/);
});

test("context archive can replace Claude Code compact with CCR handoff and history search", async () => {
  contextArchiveService.clear();
  const config = testConfig({ claudeCodeCompact: true, retainRecentItems: 2, triggerTokenLimit: 999999 });
  const body = {
    messages: [
      {
        content: "Deep historical decision: use PostgreSQL for durable context archive storage.",
        role: "user"
      },
      {
        content: "Recent progress: added the Claude Code compact switch.",
        role: "assistant"
      },
      {
        content: "Summarize the conversation so far for handoff into a new context window.",
        role: "user"
      }
    ],
    model: "claude-sonnet-4-5",
    mcp_servers: [{ name: "filesystem" }],
    parallel_tool_calls: true,
    system: "You are Claude Code.",
    tool_choice: { type: "auto" },
    tools: [{ input_schema: { type: "object" }, name: "Write", type: "custom" }]
  };

  const result = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(body)),
    config,
    headers: { "user-agent": "claude-code/2.0", "x-claude-code-session-id": "claude-s3" },
    method: "POST",
    path: "/v1/messages",
    protocol: "anthropic_messages",
    requestId: "request-claude-compact-ccr"
  });

  assert.ok(result);
  assert.match(result.diagnostic, /^client-compact-ccr:claude-code:claude-s3:/);
  const prepared = JSON.parse(result.body.toString("utf8"));
  assert.equal(prepared.messages.length, 2);
  assert.equal(JSON.stringify(prepared.messages).includes("Deep historical decision"), false);
  assert.equal("mcp_servers" in prepared, false);
  assert.equal("parallel_tool_calls" in prepared, false);
  assert.equal("tool_choice" in prepared, false);
  assert.equal("tools" in prepared, false);
  assert.match(prepared.messages.at(-1).content, /Do not create, edit, or write files/);
  assert.match(prepared.messages.at(-1).content, /Do not call tools/);
  assert.match(prepared.system, /CCR detected this as a Claude Code context compaction request/);
  assert.match(prepared.system, /ccr_history_search/);
  assert.match(prepared.system, /claude-s3/);

  const search = await contextArchiveService.search({
    prompt: "Which durable context archive storage was chosen?",
    sessionId: "claude-s3"
  }, config.contextArchive);
  assert.match(search.answer, /PostgreSQL/);
});

test("context archive replacement trims dangling Claude Code tool tails before compacting", async () => {
  contextArchiveService.clear();
  const config = testConfig({ claudeCodeCompact: true, retainRecentItems: 12, triggerTokenLimit: 999999 });
  const body = {
    messages: [
      {
        content: "Recent implementation context: inspect the gateway compact path.",
        role: "user"
      },
      {
        content: [
          { text: "I will inspect the files.", type: "text" },
          { id: "call_1", input: { command: "rg compact" }, name: "Bash", type: "tool_use" }
        ],
        role: "assistant"
      },
      {
        content: [
          {
            cache_control: { type: "ephemeral" },
            content: "packages/core/src/gateway/context-archive.ts: compactBody",
            tool_use_id: "call_1",
            type: "tool_result"
          }
        ],
        role: "user"
      }
    ],
    model: "claude-sonnet-4-5",
    system: "You are Claude Code.",
    tool_choice: { type: "auto" },
    tools: [{ input_schema: { type: "object" }, name: "Bash", type: "custom" }]
  };

  const result = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(body)),
    config,
    headers: {
      "user-agent": "claude-code/2.0",
      "x-claude-code-session-id": "claude-tool-tail",
      "x-ccr-context-compact": "compact"
    },
    method: "POST",
    path: "/v1/messages",
    protocol: "anthropic_messages",
    requestId: "request-claude-tool-tail"
  });

  assert.ok(result);
  assert.match(result.diagnostic, /^client-compact-ccr:claude-code:claude-tool-tail:/);
  const prepared = JSON.parse(result.body.toString("utf8"));
  assert.equal(prepared.messages.at(-1).role, "user");
  assert.match(prepared.messages.at(-1).content, /plain assistant message text/);
  assert.equal("tool_choice" in prepared, false);
  assert.equal("tools" in prepared, false);
  assert.equal(JSON.stringify(prepared.messages).includes("tool_result"), false);
  assert.match(prepared.system, /packages\/core\/src\/gateway\/context-archive\.ts/);
});

test("context archive detects Claude Code compact context-management edits", async () => {
  contextArchiveService.clear();
  const config = testConfig({ claudeCodeCompact: true, triggerTokenLimit: 999999 });
  const body = {
    context_management: {
      edits: [{ type: "compact_20260112" }]
    },
    messages: [
      { content: "Recent work: keep CCR compact replacement enabled for slash compact.", role: "user" }
    ],
    model: "claude-sonnet-4-5",
    system: "You are Claude Code."
  };

  const result = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(body)),
    config,
    headers: { "user-agent": "claude-code/2.0", "x-claude-code-session-id": "claude-struct-compact" },
    method: "POST",
    path: "/v1/messages",
    protocol: "anthropic_messages",
    requestId: "request-claude-struct-compact"
  });

  assert.ok(result);
  assert.match(result.diagnostic, /^client-compact-ccr:claude-code:claude-struct-compact:/);
});

test("context archive ignores non-compact context-management edits", async () => {
  contextArchiveService.clear();
  const config = testConfig({ claudeCodeCompact: true, triggerTokenLimit: 999999 });
  const body = {
    context_management: {
      edits: [{ keep: "all", type: "clear_thinking_20251015" }]
    },
    messages: [
      { content: "普通请求,不应该被当成 slash compact。", role: "user" }
    ],
    model: "claude-sonnet-4-5",
    system: "You are Claude Code."
  };

  const result = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(body)),
    config,
    headers: { "user-agent": "claude-code/2.0", "x-claude-code-session-id": "claude-clear-thinking" },
    method: "POST",
    path: "/v1/messages",
    protocol: "anthropic_messages",
    requestId: "request-claude-clear-thinking"
  });

  assert.ok(result);
  assert.match(result.diagnostic, /^archived:claude-clear-thinking:/);
  assert.deepEqual(JSON.parse(result.body.toString("utf8")), body);
});

test("context archive does not re-trigger Claude Code compact from existing CCR summary", async () => {
  contextArchiveService.clear();
  const config = testConfig({ claudeCodeCompact: true, triggerTokenLimit: 999999 });
  const body = {
    context_management: {
      edits: [{ keep: "all", type: "clear_thinking_20251015" }]
    },
    messages: [
      {
        content: [
          {
            text: [
              "该项目是 Claude Code 的核心代码库。",
              "Archived history access:",
              "- Archive session id: claude-existing-summary",
              "- Tool call: ccr_history_search({ \"prompt\": \"specific historical detail to recover\", \"deep\": false, \"session_id\": \"claude-existing-summary\" })",
              "When you produce the compacted summary for the next context window, include this section."
            ].join("\n"),
            type: "text"
          },
          {
            text: "现在始终会有压缩的信息",
            type: "text"
          }
        ],
        role: "user"
      }
    ],
    model: "claude-sonnet-4-5",
    system: "You are Claude Code."
  };

  const result = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(body)),
    config,
    headers: { "user-agent": "claude-code/2.0", "x-claude-code-session-id": "claude-existing-summary" },
    method: "POST",
    path: "/v1/messages",
    protocol: "anthropic_messages",
    requestId: "request-claude-existing-summary"
  });

  assert.ok(result);
  assert.match(result.diagnostic, /^archived:claude-existing-summary:/);
  assert.deepEqual(JSON.parse(result.body.toString("utf8")), body);
});

test("context archive does not treat generic summary prompts as client compact requests", async () => {
  contextArchiveService.clear();
  const config = testConfig({ triggerTokenLimit: 999999 });
  const body = {
    messages: [
      { content: "Please summarize the conversation so far for context compaction.", role: "user" }
    ],
    model: "test-model"
  };

  const result = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(body)),
    config,
    headers: { "user-agent": "generic-openai-client/1.0", "x-session-id": "generic-s1" },
    method: "POST",
    path: "/v1/chat/completions",
    protocol: "openai_chat_completions",
    requestId: "request-generic-summary"
  });

  assert.ok(result);
  assert.match(result.diagnostic, /^archived:generic-s1:/);
  assert.deepEqual(JSON.parse(result.body.toString("utf8")), body);
});

test("context archive does not treat unrelated Claude Code compact wording as context compaction", async () => {
  contextArchiveService.clear();
  const config = testConfig({ triggerTokenLimit: 999999 });
  const body = {
    messages: [
      { content: "We are benchmarking context archive compression efficiency and retrieval quality.", role: "assistant" },
      { content: "Please set the UI density option to compact.", role: "user" }
    ],
    model: "claude-sonnet-4-5"
  };

  const result = await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(body)),
    config,
    headers: { "user-agent": "claude-code/2.0", "x-claude-code-session-id": "claude-s2" },
    method: "POST",
    path: "/v1/messages",
    protocol: "anthropic_messages",
    requestId: "request-claude-unrelated-compact"
  });

  assert.ok(result);
  assert.match(result.diagnostic, /^archived:claude-s2:/);
  assert.deepEqual(JSON.parse(result.body.toString("utf8")), body);
});

test("context archive deep search expands neighboring evidence", async () => {
  contextArchiveService.clear();
  const config = testConfig();
  const body = {
    messages: [
      { role: "user", content: "First note: alpha marker belongs to the retry policy discussion." },
      { role: "assistant", content: "Neighbor note: the retry policy uses exponential backoff." },
      { role: "user", content: "Recent request." }
    ],
    model: "test-model"
  };

  await prepareContextArchiveRequest({
    body: Buffer.from(JSON.stringify(body)),
    config,
    headers: { "x-session-id": "session-b" },
    method: "POST",
    path: "/v1/chat/completions",
    protocol: "openai_chat_completions",
    requestId: "request-b"
  });

  const shallow = await contextArchiveService.search({ prompt: "alpha marker", sessionId: "session-b" }, config.contextArchive);
  const deep = await contextArchiveService.search({ deep: true, prompt: "alpha marker", sessionId: "session-b" }, config.contextArchive);

  assert.equal(shallow.evidence.length > 0, true);
  assert.equal(deep.evidence.length >= shallow.evidence.length, true);
  assert.match(deep.answer, /exponential backoff|alpha marker/);
});

test("context archive MCP server points at the built-in gateway endpoint", () => {
  const config = testConfig();
  const server = contextArchiveMcpServer(config, "http://127.0.0.1:3456", "local-test-key");

  assert.ok(server);
  assert.equal(server.name, "ccr-context-archive");
  assert.equal(server.transport, "streamable-http");
  assert.equal(server.apiKey, "local-test-key");
  assert.equal(server.url, `http://127.0.0.1:3456${CONTEXT_ARCHIVE_MCP_PATH}`);
});
