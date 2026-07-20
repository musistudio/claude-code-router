import assert from "node:assert/strict";
import test from "node:test";
import { formatLogTokenSummary, logRequestModel, logResponseModel } from "@ccr/ui/pages/home/shared/logs.ts";
import { formatCompactNumber, formatUsdCost as formatHomeUsdCost } from "@ccr/ui/pages/home/shared/usage.ts";
import { formatUsdCost as formatTrayUsdCost } from "@ccr/ui/pages/tray/shared.tsx";
import type { RequestLogEntry } from "@ccr/core/contracts/app.ts";

test("formatCompactNumber can be bound to the UI language locale", () => {
  assert.equal(formatCompactNumber(123456, "en-US"), "123.5K");
  assert.equal(formatCompactNumber(123456, "zh-CN"), "12.3万");
});

test("formatUsdCost formats large values without conflicting fraction digits", () => {
  assert.doesNotThrow(() => formatHomeUsdCost(100));
  assert.doesNotThrow(() => formatTrayUsdCost(100));
  assert.doesNotMatch(formatHomeUsdCost(123.45), /[.,]45/);
  assert.doesNotMatch(formatTrayUsdCost(123.45), /[.,]45/);
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

test("request log model summaries stay stable without list body text", () => {
  const entry: RequestLogEntry = {
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    client: "test",
    createdAt: "2026-07-20T00:00:00.000Z",
    credentialChain: [],
    credentialSaturated: false,
    durationMs: 10,
    id: 1,
    inputTokens: 0,
    isStream: true,
    method: "POST",
    model: "legacy-model",
    ok: true,
    outputTokens: 0,
    path: "/v1/messages",
    provider: "test-provider",
    reasoningTokens: 0,
    requestedModel: "request-model",
    requestBody: { encoding: "utf8", sizeBytes: 128, text: "", truncated: false },
    requestHeaders: {},
    requestId: "req_models",
    resolvedModel: "resolved-model",
    responseHeaders: {},
    responseModel: "response-model",
    retryAttempts: [],
    statusCode: 200,
    totalTokens: 0,
    url: "https://example.test/v1/messages"
  };

  assert.equal(logRequestModel(entry), "request-model");
  assert.equal(logResponseModel(entry), "response-model");
  assert.equal(logResponseModel({ ...entry, responseModel: "" }), "resolved-model");
});
