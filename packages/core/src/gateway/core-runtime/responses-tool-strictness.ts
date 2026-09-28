import { isRecord } from "@ccr/core/gateway/internal/value";

type UpstreamRequest = {
  body?: unknown;
  bodyEncoding?: "bytes" | "form" | "json" | "none" | "text";
  headers?: Record<string, string>;
  method?: string;
  url: string;
};

export type ResponsesToolStrictnessInput = {
  sourceAdapterKey?: string;
  sourceProvider?: string;
  targetProviderConfig?: {
    type?: string;
  };
  upstreamRequest: UpstreamRequest;
};

/**
 * OpenAI Responses treats omitted `strict` as "try to make this schema strict".
 * Claude Code tools leave `strict` unset, so optional fields get forced on.
 * Only converted Anthropic/Claude Code requests are stamped. Native
 * `/v1/responses` pass-through keeps omitted `strict` as API semantics.
 * Explicit boolean strictness is left alone. Other protocols pass through.
 */
export function applyResponsesToolStrictness(input: ResponsesToolStrictnessInput): UpstreamRequest {
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
  if ((upstreamRequest.bodyEncoding ?? "json") !== "json" || !isRecord(body) || !Array.isArray(body.tools)) {
    return upstreamRequest;
  }

  const tools = stampTools(body.tools);
  if (tools === body.tools) {
    return upstreamRequest;
  }
  return {
    ...upstreamRequest,
    body: {
      ...body,
      tools
    }
  };
}

function stampTools(tools: unknown[]): unknown[] {
  let changed = false;
  const next = tools.map((tool) => {
    const stamped = stampTool(tool);
    if (stamped !== tool) {
      changed = true;
    }
    return stamped;
  });
  return changed ? next : tools;
}

function stampTool(tool: unknown): unknown {
  if (!isRecord(tool)) {
    return tool;
  }
  if (tool.type === "namespace" && Array.isArray(tool.tools)) {
    const nested = stampTools(tool.tools);
    if (nested === tool.tools) {
      return tool;
    }
    return {
      ...tool,
      tools: nested
    };
  }
  if (tool.type !== "function" || typeof tool.strict === "boolean") {
    return tool;
  }
  return {
    ...tool,
    strict: false
  };
}
