/**
 * DeepSeek request adapter.
 *
 * Adapts the outbound request body for DeepSeek upstreams on the Anthropic
 * protocol. The wire body is Anthropic-shaped (`model`, `max_tokens`,
 * `thinking`, `messages`), so this feature operates on that shape:
 *
 * - reasoning-effort passthrough: DeepSeek's Anthropic endpoint accepts a
 *   top-level `reasoning_effort` field. Pass through one the client sent
 *   directly (it is not a standard Anthropic field, but DeepSeek and
 *   OpenRouter-hosted DeepSeek read it). We do not invent an effort from
 *   `thinking.budget_tokens` - the Anthropic-native DeepSeek endpoint ignores
 *   it, and mapping a budget to an effort level is guesswork.
 * - NOTHINK_BELOW: below a max_tokens threshold DeepSeek refuses the request
 *   or burns budget on thinking. We disable thinking entirely (`thinking:
 *   {type:"disabled"}`) instead of truncating max_tokens, preserving user
 *   intent. This survives on the anthropic_messages protocol (the executor
 *   only strips `thinking` for OpenAI protocols).
 * - placeholder thinking: on routes that drop thinking blocks, inject a
 *   placeholder thinking block into outbound assistant messages so message
 *   history stays well-formed. Only applied while thinking stays enabled.
 *
 * Gated to DeepSeek upstreams by model identity: the provider part of the
 * routed model selector is `deepseek`, or the model name is a known DeepSeek
 * family id (which covers OpenRouter-hosted `deepseek/deepseek-v4-*` selectors
 * whose provider part is `openrouter`).
 */
import { stringValue } from "@ccr/core/gateway/internal/value";
import { serializeJsonBody, takeJsonObject } from "@ccr/core/gateway/http/body";
import { parseProviderModelSelector } from "@ccr/core/routing/model-registry";

const DEEPSEEK_PROVIDER_ID = "deepseek";
const DEEPSEEK_FAMILY_PREFIXES = [
  "deepseek-v4",
  "deepseek-v3",
  "deepseek-r1",
  "deepseek-reasoner",
  "deepseek-chat",
];

const NOTHINK_BELOW = 8192;
// DeepSeek 400s on an assistant history that is missing a thinking block for a
// tool_use message. It does not validate the signature, so a placeholder block
// is enough. The shape mirrors cc-ds4's proven placeholder (a content block,
// not a top-level message.thinking field).
const PLACEHOLDER = { type: "thinking", thinking: "(elided)", signature: "ccr-deepseek-adapter" };

export type DeepSeekRequestAdapterPreparation = {
  body: Buffer;
  diagnostic: string;
};

export function prepareDeepSeekRequestAdapter(input: {
  body?: Buffer;
  config: unknown;
  headers: unknown;
  method: string;
  path: string;
  routedModel?: string;
}): DeepSeekRequestAdapterPreparation | undefined {
  if ((input.method || "GET").toUpperCase() !== "POST") {
    return undefined;
  }

  if (!input.body || input.body.byteLength === 0) {
    return undefined;
  }
  let body: Record<string, unknown>;
  try {
    body = takeJsonObject(input.body);
  } catch {
    return undefined;
  }

  // Gate on the routed model if available, else the body model. The routed
  // selector may be absent when no route matched (default routing) even though
  // the client sent a DeepSeek model directly.
  const model = stringValue(body.model) || input.routedModel;
  if (!isDeepSeekModel(input.routedModel) && !isDeepSeekModel(model)) {
    return undefined;
  }

  const changes: string[] = [];
  const maxTokens = body.max_tokens;
  const disableThinking =
    typeof maxTokens !== "number" || maxTokens <= NOTHINK_BELOW;

  // Reasoning-effort handling. A client-sent top-level `reasoning_effort` is
  // passed through as-is (the DeepSeek / OpenRouter-hosted DeepSeek field).
  // When thinking is disabled, effort is meaningless without thinking and the
  // wire should not carry a contradictory pair, so drop it.
  if (disableThinking && body.reasoning_effort !== undefined) {
    delete body.reasoning_effort;
    changes.push("effort-removed");
  }

  if (disableThinking) {
    body.thinking = { type: "disabled" };
    body.enable_thinking = false;
    changes.push("thinking-disabled");
  }

  // Placeholder thinking injection. Only meaningful while thinking is on; a
  // disabled-thinking request does not need a well-formed thinking history.
  // Mirrors cc-ds4: inject a content block at content[0] only into assistant
  // messages that carry a tool_use block but no thinking block (DeepSeek 400s
  // on a history where that is missing). The endpoint does not validate the
  // signature, so a placeholder is enough.
  if (!disableThinking && Array.isArray(body.messages)) {
    for (const message of body.messages) {
      if (!isRecord(message) || message.role !== "assistant") {
        continue;
      }
      const content = message.content;
      if (!Array.isArray(content)) {
        continue;
      }
      const kinds = new Set(
        content
          .filter(isRecord)
          .map((part) => part.type)
      );
      if (kinds.has("tool_use") && !kinds.has("thinking")) {
        content.unshift({ ...PLACEHOLDER });
        changes.push("placeholder-thinking");
      }
    }
  }

  if (changes.length === 0) {
    return undefined;
  }

  return {
    body: serializeJsonBody(body),
    diagnostic: changes.join(","),
  };
}

function isDeepSeekModel(model: string | undefined): boolean {
  if (!model) {
    return false;
  }
  const parsed = parseProviderModelSelector(model);
  if (parsed) {
    return (
      parsed.provider.toLowerCase() === DEEPSEEK_PROVIDER_ID ||
      isDeepSeekFamily(parsed.model)
    );
  }
  return isDeepSeekFamily(model);
}

function isDeepSeekFamily(model: string): boolean {
  const normalized = model.toLowerCase();
  return DEEPSEEK_FAMILY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
