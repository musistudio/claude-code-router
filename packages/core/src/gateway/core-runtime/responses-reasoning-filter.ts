import { isRecord, stringValue } from "@ccr/core/gateway/internal/value";

type UpstreamRequest = {
  body?: unknown;
  bodyEncoding?: "bytes" | "form" | "json" | "none" | "text";
  headers?: Record<string, string>;
  method?: string;
  url: string;
};

export type ResponsesReasoningFilterInput = {
  sourceAdapterKey?: string;
  sourceProvider?: string;
  targetProviderConfig?: {
    type?: string;
  };
  upstreamRequest: UpstreamRequest;
};

/**
 * Drops non-replayable `reasoning` input items from outbound OpenAI Responses
 * bodies. The Anthropic conversion turns `thinking` history blocks into
 * `reasoning` items that carry a fabricated id and plain text but no
 * `encrypted_content`, and Responses upstreams reject those with HTTP 400,
 * which silently pushes the request onto the fallback model. Only converted
 * Anthropic/Claude Code requests are filtered: a native `/v1/responses` client
 * owns its own input items, where `encrypted_content` is optional and dropping
 * an item would silently discard conversation state the caller supplied.
 * `redacted_thinking` history keeps its `encrypted_content` and survives the
 * filter, as do other protocols and non-JSON bodies.
 */
export function dropNonReplayableReasoningItems(input: ResponsesReasoningFilterInput): UpstreamRequest {
  const upstreamRequest = input.upstreamRequest;
  const providerType = input.targetProviderConfig?.type?.trim().toLowerCase();
  if (providerType !== "openai_responses") {
    return upstreamRequest;
  }
  const sourceKey = input.sourceAdapterKey?.trim().toLowerCase();
  const sourceProvider = input.sourceProvider?.trim().toLowerCase();
  if (sourceKey !== "anthropic_messages" && sourceProvider !== "anthropic") {
    return upstreamRequest;
  }
  const body = upstreamRequest.body;
  if ((upstreamRequest.bodyEncoding ?? "json") !== "json" || !isRecord(body) || !Array.isArray(body.input)) {
    return upstreamRequest;
  }

  const replayable = body.input.filter(isReplayableResponsesInputItem);
  if (replayable.length === body.input.length) {
    return upstreamRequest;
  }
  return {
    ...upstreamRequest,
    body: { ...body, input: replayable }
  };
}

/**
 * Within an Anthropic conversion, a Responses input item is replayable unless
 * it is a `reasoning` item without a non-empty `encrypted_content` string:
 * every such item was fabricated by the converter from a `thinking` block.
 * Non-record items are left alone so the upstream keeps authority over shapes
 * this filter does not understand.
 */
export function isReplayableResponsesInputItem(item: unknown): boolean {
  if (!isRecord(item) || item.type !== "reasoning") {
    return true;
  }
  return stringValue(item.encrypted_content) !== undefined;
}
