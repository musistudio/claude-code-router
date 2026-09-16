import assert from "node:assert/strict";
import test from "node:test";
import {
  combineStreamExperienceMetrics,
  createStreamExperienceMeter,
  getLiveTokenRateSnapshot,
  LiveTokenRateTracker,
  setExternalLiveTokenRateSnapshot
} from "@ccr/core/observability/stream-experience.ts";

test("stream experience meter parses fragmented Anthropic semantic events", async () => {
  const timestamps = [100, 350, 500];
  const meter = createStreamExperienceMeter({
    contentType: "text/event-stream",
    now: () => timestamps.shift() ?? 500,
    protocol: "anthropic_messages"
  });
  const body = [
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"分析"}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello world"}}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n'
  ].join("");
  const encoded = Buffer.from(body);

  await writeMeter(meter, [encoded.subarray(0, 17), encoded.subarray(17, 91), encoded.subarray(91)]);

  assert.deepEqual(meter.snapshot(), {
    active: true,
    estimatedOutputTokens: 4,
    firstSignalAtMs: 100,
    firstTextAtMs: 350,
    lastSignalAtMs: 350,
    maxInterEventGapMs: 250,
    p95InterEventGapMs: 250,
    reasoningObserved: true,
    streamEndAtMs: 500,
    textObserved: true,
    toolObserved: false
  });
});

test("stream experience meter supports OpenAI chat, Responses, and Gemini NDJSON", async () => {
  const cases = [
    {
      body: 'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
      contentType: "text/event-stream",
      protocol: "openai_chat_completions"
    },
    {
      body: 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hello"}\n\n',
      contentType: "text/event-stream",
      protocol: "openai_responses"
    },
    {
      body: '{"candidates":[{"content":{"parts":[{"text":"你好"}]}}]}\n',
      contentType: "application/x-ndjson",
      protocol: "gemini_generate_content"
    }
  ];

  for (const item of cases) {
    const meter = createStreamExperienceMeter({
      contentType: item.contentType,
      now: () => 100,
      protocol: item.protocol
    });
    await writeMeter(meter, [Buffer.from(item.body)]);
    const snapshot = meter.snapshot();
    assert.equal(snapshot.active, true, item.protocol);
    assert.equal(snapshot.textObserved, true, item.protocol);
    assert.equal(snapshot.firstTextAtMs, 100, item.protocol);
    assert.ok(snapshot.estimatedOutputTokens >= 1, item.protocol);
  }
});

test("live token rate sums concurrent active streams over the rolling window", () => {
  const tracker = new LiveTokenRateTracker(2_000);
  tracker.start("one");
  tracker.start("two");
  tracker.record("one", 10, 1_000);
  tracker.record("two", 20, 1_000);

  assert.deepEqual(tracker.snapshot(2_000), {
    activeRequests: 2,
    tokensPerSecond: 30
  });

  tracker.finish("one");
  assert.deepEqual(tracker.snapshot(2_000), {
    activeRequests: 1,
    tokensPerSecond: 20
  });

  assert.deepEqual(tracker.snapshot(3_100), {
    activeRequests: 1,
    tokensPerSecond: 0
  });
});

test("live token rate includes and clears child-runtime snapshots", () => {
  try {
    setExternalLiveTokenRateSnapshot("core-test", {
      activeRequests: 2,
      tokensPerSecond: 37.5
    });
    assert.deepEqual(getLiveTokenRateSnapshot(), {
      activeRequests: 2,
      tokensPerSecond: 37.5
    });
  } finally {
    setExternalLiveTokenRateSnapshot("core-test");
  }
  assert.deepEqual(getLiveTokenRateSnapshot(), {
    activeRequests: 0,
    tokensPerSecond: 0
  });
});

test("combined metrics keep client latency separate from upstream generation", () => {
  const metrics = combineStreamExperienceMetrics({
    client: {
      active: true,
      estimatedOutputTokens: 8,
      firstSignalAtMs: 250,
      firstTextAtMs: 300,
      lastSignalAtMs: 900,
      maxInterEventGapMs: 240,
      p95InterEventGapMs: 180,
      reasoningObserved: true,
      streamEndAtMs: 950,
      textObserved: true,
      toolObserved: false
    },
    requestStartedAtMs: 100,
    responseHeadersAtMs: 180,
    sampleStatus: "complete",
    upstream: {
      active: true,
      estimatedOutputTokens: 8,
      firstSignalAtMs: 220,
      lastSignalAtMs: 880,
      reasoningObserved: true,
      textObserved: true,
      toolObserved: false
    },
    upstreamAttemptStartedAtMs: 150
  });

  assert.equal(metrics.timeToFirstSignalMs, 150);
  assert.equal(metrics.timeToFirstTextMs, 200);
  assert.equal(metrics.upstreamTimeToFirstSignalMs, 70);
  assert.equal(metrics.activeOutputMs, 660);
  assert.equal(metrics.tailMs, 50);
  assert.equal(metrics.maxInterEventGapMs, 240);
});

async function writeMeter(meter, chunks) {
  meter.stream.resume();
  for (const chunk of chunks) {
    meter.stream.write(chunk);
  }
  await new Promise((resolve, reject) => {
    meter.stream.once("error", reject);
    meter.stream.end(resolve);
  });
}
