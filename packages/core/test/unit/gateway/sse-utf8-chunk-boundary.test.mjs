import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { codexMultiAgentBridgeResponseStream } from "@ccr/core/gateway/features/codex-multi-agent-bridge.ts";
import { codexApplyPatchBridgeResponseStream } from "@ccr/core/gateway/features/codex-patch-bridge.ts";
import { hostedWebSearchProtocolResponseStream } from "@ccr/core/gateway/features/hosted-web-search/index.ts";

const sseHeaders = () => new Headers({ "content-type": "text/event-stream" });

const webSearchRecords = [{
  engine: "test",
  query: "北京天气",
  results: [{ content: "多云", snippet: "多云", title: "天气", url: "https://example.test/weather" }],
  searchUrl: "https://example.test/search"
}];

function hostedWebSearchContext(protocol) {
  return {
    maxUses: 1,
    protocol,
    queryHint: "北京天气",
    records: webSearchRecords,
    requestId: "req-utf8",
    sinceMs: 0,
    toolName: "web_search"
  };
}

async function streamText(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Feeds `text` through `makeStream` once per interior byte offset of the first
// multi-byte character, so at least one chunk boundary always lands inside it.
async function assertSurvivesEveryByteSplit(makeStream, text, marker) {
  const bytes = Buffer.from(text, "utf8");
  const markerBytes = Buffer.from(marker, "utf8");
  const markerStart = bytes.indexOf(markerBytes);
  assert.ok(markerStart >= 0, "marker must be present in the event");
  assert.ok(markerBytes.length > 1, "marker must be a multi-byte character");

  for (let offset = 1; offset < markerBytes.length; offset += 1) {
    const splitAt = markerStart + offset;
    const output = await streamText(makeStream(
      Readable.from([bytes.subarray(0, splitAt), bytes.subarray(splitAt)])
    ));
    assert.equal(
      output.includes("�"),
      false,
      `split at byte ${splitAt} produced U+FFFD: ${JSON.stringify(output)}`
    );
    assert.equal(output, text, `split at byte ${splitAt} changed the event`);
  }
}

test("Codex multi-agent bridge SSE keeps multi-byte characters split across chunks", async () => {
  await assertSurvivesEveryByteSplit(
    (input) => codexMultiAgentBridgeResponseStream(input, sseHeaders()),
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"北京今天多云"}\n\n',
    "北"
  );
});

test("Codex apply_patch bridge SSE keeps multi-byte characters split across chunks", async () => {
  await assertSurvivesEveryByteSplit(
    (input) => codexApplyPatchBridgeResponseStream(input, sseHeaders()),
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"北京今天多云"}\n\n',
    "北"
  );
});

test("Hosted web search Anthropic SSE keeps multi-byte characters split across chunks", async () => {
  await assertSurvivesEveryByteSplit(
    (input) => hostedWebSearchProtocolResponseStream(
      input,
      sseHeaders(),
      hostedWebSearchContext("anthropic_messages"),
      undefined
    ),
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"北京今天多云"}}\n\n',
    "北"
  );
});

test("Hosted web search OpenAI Responses SSE keeps multi-byte characters split across chunks", async () => {
  await assertSurvivesEveryByteSplit(
    (input) => hostedWebSearchProtocolResponseStream(
      input,
      sseHeaders(),
      hostedWebSearchContext("openai_responses"),
      undefined
    ),
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","output_index":0,"delta":"北京今天多云"}\n\n',
    "北"
  );
});

test("Codex bridges keep emoji surrogate pairs split across chunks", async () => {
  const event = 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"done 🎉"}\n\n';
  await assertSurvivesEveryByteSplit(
    (input) => codexMultiAgentBridgeResponseStream(input, sseHeaders()),
    event,
    "🎉"
  );
  await assertSurvivesEveryByteSplit(
    (input) => codexApplyPatchBridgeResponseStream(input, sseHeaders()),
    event,
    "🎉"
  );
});
