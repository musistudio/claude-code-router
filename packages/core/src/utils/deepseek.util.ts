import { createHash } from "node:crypto";
import { LLMProvider, UnifiedChatRequest, UnifiedMessage } from "@/types/llm";
import { TransformerContext } from "@/types/transformer";

type ToolCallLike = NonNullable<UnifiedMessage["tool_calls"]>[number];

type MessageLike = Pick<
  UnifiedMessage,
  "role" | "content" | "thinking" | "tool_calls" | "tool_call_id" | "reasoning_content"
> & {
  name?: string;
};

type RequestContextState = {
  enabled: true;
  namespace: string;
  requestScope: string;
};

type CacheEntry = {
  reasoning: string;
  createdAt: number;
};

type AssistantResponseRecorder = {
  content: string;
  reasoning: string;
  toolCalls: Map<number, ToolCallLike>;
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 4096;
const CONTEXT_KEY = "__ccrDeepseekReasoning";

class ReasoningContentCache {
  private readonly cache = new Map<string, CacheEntry>();

  get(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
      this.cache.delete(key);
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.reasoning;
  }

  put(key: string, reasoning: string): void {
    if (!reasoning) return;
    this.cache.delete(key);
    this.cache.set(key, {
      reasoning,
      createdAt: Date.now(),
    });
    this.prune();
  }

  private prune(): void {
    for (const [key, entry] of this.cache) {
      if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
        this.cache.delete(key);
      }
    }

    while (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      this.cache.delete(oldestKey);
    }
  }
}

const reasoningCache = new ReasoningContentCache();

function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSort);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = stableSort((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }

  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableSort(value));
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeContent(content: MessageLike["content"]): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item) {
          return String((item as { text?: string }).text || "");
        }
        return stableStringify(item);
      })
      .join("");
  }
  return stableStringify(content);
}

function normalizeToolCall(toolCall: ToolCallLike | Record<string, unknown>) {
  const functionData = (toolCall as any).function ?? {};
  const argumentsValue =
    typeof functionData.arguments === "string"
      ? functionData.arguments
      : stableStringify(functionData.arguments ?? "");

  return {
    id: (toolCall as any).id || "",
    type: (toolCall as any).type || "function",
    function: {
      name: functionData.name || "",
      arguments: argumentsValue,
    },
  };
}

function toolCallIds(message: MessageLike): string[] {
  return (message.tool_calls || [])
    .map((toolCall) => toolCall.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

function toolCallSignature(toolCall: ToolCallLike): string {
  const normalized = normalizeToolCall(toolCall);
  return hash(
    stableStringify({
      ...normalized,
      id: undefined,
    })
  );
}

function messageSignature(message: MessageLike): string {
  return hash(
    stableStringify({
      content: normalizeContent(message.content),
      tool_calls: (message.tool_calls || []).map((toolCall) =>
        normalizeToolCall(toolCall)
      ),
    })
  );
}

function canonicalScopeMessage(message: MessageLike) {
  const canonical: Record<string, unknown> = {
    role: message.role,
    content: normalizeContent(message.content),
  };

  if (message.name) canonical.name = message.name;
  if (message.tool_call_id) canonical.tool_call_id = message.tool_call_id;
  if (message.tool_calls?.length) {
    canonical.tool_calls = message.tool_calls.map((toolCall) =>
      normalizeToolCall(toolCall)
    );
  }

  return canonical;
}

function conversationScope(messages: MessageLike[], namespace: string): string {
  const scopeMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => canonicalScopeMessage(message));

  return hash(
    stableStringify({
      namespace,
      messages: scopeMessages,
    })
  );
}

function getMessageReasoning(message: MessageLike): string | undefined {
  if (
    typeof message.reasoning_content === "string" &&
    message.reasoning_content.length > 0
  ) {
    return message.reasoning_content;
  }

  if (
    typeof message.thinking?.content === "string" &&
    message.thinking.content.length > 0
  ) {
    return message.thinking.content;
  }

  return undefined;
}

function storeAssistantReasoning(message: MessageLike, scope: string): number {
  if (message.role !== "assistant") return 0;

  const reasoning = getMessageReasoning(message);
  if (!reasoning) return 0;

  const keys = [ `scope:${scope}:signature:${messageSignature(message)}` ];
  keys.push(
    ...toolCallIds(message).map((toolCallId) => `scope:${scope}:tool_call:${toolCallId}`)
  );
  keys.push(
    ...(message.tool_calls || []).map(
      (toolCall) => `scope:${scope}:tool_call_signature:${toolCallSignature(toolCall)}`
    )
  );

  keys.forEach((key) => reasoningCache.put(key, reasoning));
  return keys.length;
}

function lookupReasoning(message: MessageLike, scope: string): string | undefined {
  const bySignature = reasoningCache.get(
    `scope:${scope}:signature:${messageSignature(message)}`
  );
  if (bySignature) return bySignature;

  for (const toolCallId of toolCallIds(message)) {
    const byId = reasoningCache.get(`scope:${scope}:tool_call:${toolCallId}`);
    if (byId) return byId;
  }

  for (const toolCall of message.tool_calls || []) {
    const byToolSignature = reasoningCache.get(
      `scope:${scope}:tool_call_signature:${toolCallSignature(toolCall)}`
    );
    if (byToolSignature) return byToolSignature;
  }

  return undefined;
}

export function assistantNeedsReasoningForToolContext(
  message: MessageLike,
  priorMessages: MessageLike[]
): boolean {
  if (message.tool_calls?.length) return true;

  for (let i = priorMessages.length - 1; i >= 0; i--) {
    const prior = priorMessages[i];
    if (prior.role === "tool") return true;
    if (prior.role === "user" || prior.role === "system") return false;
  }

  return false;
}

export function isDeepSeekThinkingRequest(
  request: Pick<
    UnifiedChatRequest,
    "model" | "thinking" | "enable_thinking" | "reasoning"
  >,
  provider?: Pick<LLMProvider, "name" | "baseUrl">
): boolean {
  const model = String(request.model || "").toLowerCase();
  const providerName = String(provider?.name || "").toLowerCase();
  const providerBaseUrl = String(provider?.baseUrl || "").toLowerCase();
  const targetsDeepSeek =
    model.includes("deepseek") ||
    providerName.includes("deepseek") ||
    providerBaseUrl.includes("deepseek");

  const thinkingEnabled =
    request.enable_thinking === true ||
    request.thinking?.type === "enabled" ||
    request.reasoning?.enabled === true ||
    typeof request.reasoning?.effort === "string" ||
    typeof request.reasoning?.max_tokens === "number";

  return targetsDeepSeek && thinkingEnabled;
}

export function buildReasoningCacheNamespace(
  request: Pick<
    UnifiedChatRequest,
    "model" | "thinking" | "enable_thinking" | "reasoning"
  >,
  provider?: Pick<LLMProvider, "name" | "baseUrl">
): string {
  return hash(
    stableStringify({
      provider: provider?.name || "",
      baseUrl: provider?.baseUrl || "",
      model: request.model || "",
      thinking: request.thinking || null,
      enable_thinking: request.enable_thinking || false,
      reasoning: request.reasoning || null,
    })
  );
}

export function prepareReasoningReplay(
  request: UnifiedChatRequest,
  provider: Pick<LLMProvider, "name" | "baseUrl"> | undefined,
  context?: TransformerContext
): { restoredFromCache: number; restoredFromThinking: number } {
  if (!isDeepSeekThinkingRequest(request, provider)) {
    if (context?.req) {
      delete (context.req as any)[CONTEXT_KEY];
    }
    return { restoredFromCache: 0, restoredFromThinking: 0 };
  }

  const namespace = buildReasoningCacheNamespace(request, provider);
  const priorMessages: MessageLike[] = [];
  let restoredFromCache = 0;
  let restoredFromThinking = 0;

  for (const message of request.messages as MessageLike[]) {
    if (message.role === "assistant") {
      const scope = conversationScope(priorMessages, namespace);
      const needsReasoning = assistantNeedsReasoningForToolContext(
        message,
        priorMessages
      );

      if (needsReasoning) {
        const currentReasoning =
          typeof message.reasoning_content === "string" &&
          message.reasoning_content.length > 0
            ? message.reasoning_content
            : undefined;

        if (!currentReasoning) {
          const inlineReasoning =
            typeof message.thinking?.content === "string" &&
            message.thinking.content.length > 0
              ? message.thinking.content
              : undefined;

          if (inlineReasoning) {
            message.reasoning_content = inlineReasoning;
            restoredFromThinking++;
          } else {
            const restored = lookupReasoning(message, scope);
            if (restored) {
              message.reasoning_content = restored;
              restoredFromCache++;
            }
          }
        }
      }

      storeAssistantReasoning(message, scope);
    }

    priorMessages.push(message);
  }

  if (context?.req) {
    (context.req as any)[CONTEXT_KEY] = {
      enabled: true,
      namespace,
      requestScope: conversationScope(request.messages as MessageLike[], namespace),
    } satisfies RequestContextState;
  }

  return { restoredFromCache, restoredFromThinking };
}

function getRequestContextState(
  context?: TransformerContext
): RequestContextState | undefined {
  return (context?.req as any)?.[CONTEXT_KEY];
}

export function hasDeepSeekReasoningContext(context?: TransformerContext): boolean {
  return getRequestContextState(context)?.enabled === true;
}

export function recordReasoningResponseMessage(
  message: MessageLike | null | undefined,
  context?: TransformerContext
): number {
  if (!message) return 0;

  const state = getRequestContextState(context);
  if (!state) return 0;

  return storeAssistantReasoning(message, state.requestScope);
}

export function createAssistantResponseRecorder(): AssistantResponseRecorder {
  return {
    content: "",
    reasoning: "",
    toolCalls: new Map<number, ToolCallLike>(),
  };
}

export function appendAssistantResponseDelta(
  recorder: AssistantResponseRecorder,
  delta: {
    content?: unknown;
    reasoning_content?: unknown;
    tool_calls?: Array<Record<string, any>>;
  }
): void {
  if (!delta) return;

  if (typeof delta.reasoning_content === "string") {
    recorder.reasoning += delta.reasoning_content;
  }

  if (typeof delta.content === "string") {
    recorder.content += delta.content;
  }

  if (Array.isArray(delta.tool_calls)) {
    delta.tool_calls.forEach((toolCallDelta, fallbackIndex) => {
      const index =
        typeof toolCallDelta.index === "number" ? toolCallDelta.index : fallbackIndex;
      const current = recorder.toolCalls.get(index) || {
        id: "",
        type: "function",
        function: {
          name: "",
          arguments: "",
        },
      };

      if (typeof toolCallDelta.id === "string" && toolCallDelta.id.length > 0) {
        current.id = toolCallDelta.id;
      }
      if (typeof toolCallDelta.type === "string" && toolCallDelta.type.length > 0) {
        current.type = toolCallDelta.type as "function";
      }

      const nextFunction = toolCallDelta.function || {};
      if (typeof nextFunction.name === "string" && nextFunction.name.length > 0) {
        current.function.name += nextFunction.name;
      }
      if (
        typeof nextFunction.arguments === "string" &&
        nextFunction.arguments.length > 0
      ) {
        current.function.arguments += nextFunction.arguments;
      }

      recorder.toolCalls.set(index, current);
    });
  }
}

export function buildAssistantResponseMessage(
  recorder: AssistantResponseRecorder
): MessageLike | null {
  if (!recorder.reasoning) return null;

  const toolCalls = Array.from(recorder.toolCalls.entries())
    .sort(([left], [right]) => left - right)
    .map(([, toolCall]) => toolCall)
    .filter(
      (toolCall) =>
        typeof toolCall.id === "string" &&
        toolCall.id.length > 0 &&
        typeof toolCall.function?.name === "string" &&
        toolCall.function.name.length > 0
    );

  if (!recorder.content && toolCalls.length === 0) {
    return null;
  }

  return {
    role: "assistant",
    content: recorder.content || null,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    reasoning_content: recorder.reasoning,
  };
}
