import { isRecord, stringValue } from "@ccr/core/gateway/internal/value";

export type AnthropicReasoningResponseTransform = {
  changed: boolean;
  value: unknown;
};

/**
 * OpenAI-compatible reasoning providers can expose a streamed reasoning_details
 * entry for every token fragment. When the core gateway buffers that stream for
 * a non-streaming Anthropic client, each detail is formatted as its own thinking
 * block. Coalesce adjacent unsigned blocks back into the single logical block
 * that the streaming relay emits.
 *
 * Signed blocks remain separate because changing their text would invalidate the
 * provider signature.
 */
export function coalesceAnthropicReasoningResponse(
  value: unknown
): AnthropicReasoningResponseTransform {
  if (!isRecord(value) || value.type !== "message" || !Array.isArray(value.content)) {
    return { changed: false, value };
  }

  const content: unknown[] = [];
  let changed = false;
  for (const block of value.content) {
    const previous = content.at(-1);
    if (isUnsignedThinkingBlock(previous) && isUnsignedThinkingBlock(block)) {
      content[content.length - 1] = {
        ...previous,
        thinking: `${previous.thinking}${block.thinking}`
      };
      changed = true;
      continue;
    }
    content.push(block);
  }

  return changed
    ? { changed: true, value: { ...value, content } }
    : { changed: false, value };
}

function isUnsignedThinkingBlock(
  value: unknown
): value is Record<string, unknown> & { thinking: string } {
  return (
    isRecord(value) &&
    value.type === "thinking" &&
    typeof value.thinking === "string" &&
    !stringValue(value.signature)
  );
}
