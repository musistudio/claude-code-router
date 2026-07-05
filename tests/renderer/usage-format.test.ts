import assert from "node:assert/strict";
import test from "node:test";
import { formatLogTokenSummary } from "../../packages/ui/src/pages/home/shared/logs.ts";
import { formatCompactNumber } from "../../packages/ui/src/pages/home/shared/usage.ts";
import type { RequestLogEntry } from "../../packages/core/src/contracts/app.ts";

test("formatCompactNumber can be bound to the UI language locale", () => {
  assert.equal(formatCompactNumber(123456, "en-US"), "123.5K");
  assert.equal(formatCompactNumber(123456, "zh-CN"), "12.3万");
});

test("formatLogTokenSummary uses the provided locale for token counts", () => {
  const entry: RequestLogEntry = {
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    client: "test",
    costUsd: 0,
    createdAt: "2026-06-30T00:00:00.000Z",
    credentialChain: [],
    credentialSaturated: false,
    durationMs: 10,
    id: 1,
    inputTokens: 123456,
    isStream: false,
    method: "POST",
    model: "test-model",
    ok: true,
    outputTokens: 12000,
    path: "/v1/messages",
    provider: "test-provider",
    reasoningTokens: 0,
    requestBody: { encoding: "utf8", text: "" },
    requestHeaders: {},
    requestId: "req_test",
    retryAttempts: [],
    responseHeaders: {},
    statusCode: 200,
    totalTokens: 135456,
    url: "https://example.test/v1/messages"
  };
  const translate = (value: string) => value;

  assert.equal(formatLogTokenSummary(entry, translate, "en-US"), "123.5K 入  12K 出");
  assert.equal(formatLogTokenSummary(entry, translate, "zh-CN"), "12.3万 入  1.2万 出");
});
