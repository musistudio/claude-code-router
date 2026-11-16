import { isRecord, stringValue } from "@ccr/core/gateway/internal/value";

export type AnthropicToolResultImageTransform = {
  changed: boolean;
  hoistedImageCount: number;
  value: Record<string, unknown>;
};

/**
 * Anthropic `/v1/messages` allows `tool_result.content` to include `{ type: "image" }`
 * blocks (for example when Claude Code's `Read` tool or an MCP screenshot tool reads
 * an image). Cross-protocol gateway conversion flattens `tool_result.content` to a
 * plain string:
 * - Image-only tool results fall back to `JSON.stringify(...)`, turning each Base64
 *   image into hundreds of thousands of raw text tokens and blinding vision models.
 * - Mixed text + image tool results keep only text and silently drop the image.
 *
 * For non-Anthropic targets, hoist `image` blocks out of `tool_result.content` into
 * sibling top-level user `{ type: "image" }` blocks and leave a concise correlation
 * note in `tool_result.content` so downstream Gemini (`inlineData`) and OpenAI
 * (`image_url` / `input_image`) adapters send native multimodal image inputs.
 */
export function hoistAnthropicToolResultImages(
  body: Record<string, unknown>
): AnthropicToolResultImageTransform {
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { changed: false, hoistedImageCount: 0, value: body };
  }

  let changed = false;
  let totalHoistedImages = 0;
  const nextMessages = body.messages.map((message) => {
    const transformed = transformUserMessageToolResultImages(message);
    if (!transformed.changed) {
      return message;
    }
    changed = true;
    totalHoistedImages += transformed.hoistedImageCount;
    return transformed.message;
  });

  if (!changed) {
    return { changed: false, hoistedImageCount: 0, value: body };
  }

  return {
    changed: true,
    hoistedImageCount: totalHoistedImages,
    value: {
      ...body,
      messages: nextMessages
    }
  };
}

function transformUserMessageToolResultImages(
  message: unknown
): { changed: boolean; hoistedImageCount: number; message: unknown } {
  if (
    !isRecord(message) ||
    stringValue(message.role)?.toLowerCase() !== "user" ||
    !Array.isArray(message.content)
  ) {
    return { changed: false, hoistedImageCount: 0, message };
  }

  if (!message.content.some(hasHoistableToolResultImage)) {
    return { changed: false, hoistedImageCount: 0, message };
  }

  const nextContent: unknown[] = [];
  let messageImageIndex = 0;
  let hoistedImageCount = 0;

  for (const block of message.content) {
    if (isAnthropicImageBlock(block)) {
      messageImageIndex += 1;
      nextContent.push(block);
      continue;
    }

    if (!hasHoistableToolResultImage(block)) {
      nextContent.push(block);
      continue;
    }

    const toolUseId =
      stringValue(block.tool_use_id) ??
      stringValue(block.tool_call_id) ??
      stringValue(block.id) ??
      "unknown";
    const remainingBlocks: unknown[] = [];
    const hoistedBlocks: Array<Record<string, unknown>> = [];

    for (const item of block.content) {
      if (isAnthropicImageBlock(item)) {
        hoistedBlocks.push({
          type: "image",
          source: item.source
        });
      } else {
        remainingBlocks.push(item);
      }
    }

    const firstIndex = messageImageIndex + 1;
    const lastIndex = messageImageIndex + hoistedBlocks.length;
    messageImageIndex = lastIndex;
    hoistedImageCount += hoistedBlocks.length;

    const correlationNote = hoistedBlocks.length === 1
      ? `[Image returned by tool call ${toolUseId} is attached in this user message as image #${firstIndex}.]`
      : `[${hoistedBlocks.length} images returned by tool call ${toolUseId} are attached in this user message as images #${firstIndex}-#${lastIndex}.]`;

    nextContent.push({
      ...block,
      content: [
        ...remainingBlocks,
        {
          type: "text",
          text: correlationNote
        }
      ]
    });
    nextContent.push(...hoistedBlocks);
  }

  return {
    changed: true,
    hoistedImageCount,
    message: {
      ...message,
      content: nextContent
    }
  };
}

function hasHoistableToolResultImage(
  block: unknown
): block is Record<string, unknown> & { content: unknown[] } {
  return (
    isRecord(block) &&
    stringValue(block.type) === "tool_result" &&
    Array.isArray(block.content) &&
    block.content.some(isAnthropicImageBlock)
  );
}

function isAnthropicImageBlock(
  value: unknown
): value is Record<string, unknown> & { source: Record<string, unknown> } {
  if (!isRecord(value) || stringValue(value.type) !== "image" || !isRecord(value.source)) {
    return false;
  }

  const url = stringValue(value.source.url);
  if (url && /^(?:https?:\/\/|data:image\/)/i.test(url)) {
    return true;
  }

  const data = stringValue(value.source.data);
  if (!data) {
    return false;
  }

  const rawMediaType = value.source.media_type;
  if (rawMediaType === undefined || rawMediaType === null || rawMediaType === "") {
    return true;
  }

  const mediaType = stringValue(rawMediaType)?.toLowerCase();
  return Boolean(mediaType && mediaType.startsWith("image/"));
}
