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
    system: "You are Claude Code."
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
  assert.match(prepared.system, /Archived history access/);
  assert.match(prepared.system, /ccr_history_search/);
  assert.match(prepared.system, /claude-s1/);

  const search = await contextArchiveService.search({
    prompt: "What test command passed?",
    sessionId: "claude-s1"
  }, config.contextArchive);
  assert.match(search.answer, /npm run test:main/);
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
