import type { GatewayProviderProtocol } from "@ccr/core/contracts/app";
import { parseJsonObjectSafe, serializeJsonBody } from "@ccr/core/gateway/http/body";
import { isRecord, stringValue } from "@ccr/core/gateway/internal/value";

/**
 * Cross-protocol fallback body translation (issue #1615).
 *
 * When a request arrives on one protocol (e.g. `/v1/messages`, Anthropic) but the
 * fallback target resolves to a provider speaking a different protocol (e.g.
 * `openai_chat_completions`), the body is currently forwarded unchanged with only the
 * `model` field rewritten — the upstream rejects it with HTTP 400. These helpers translate
 * the request body between the Anthropic messages format and the OpenAI chat completions
 * format so a cross-protocol fallback actually works.
 *
 * Only the protocol pair that covers the common fallback scenarios is implemented
 * (`anthropic_messages` <-> `openai_chat_completions`). Other pairs (openai_responses,
 * gemini, ...) fall through unchanged. Translation is defensive: any structure it cannot
 * map is carried over or dropped conservatively, and it never throws — on failure the
 * original body is returned so the fallback degrades to today's behavior instead of crashing.
 */

export function translateBodyForProtocol(
  body: Buffer | undefined,
  clientProtocol: GatewayProviderProtocol | undefined,
  targetProtocol: GatewayProviderProtocol | undefined
): Buffer | undefined {
  if (!body || !clientProtocol || !targetProtocol || clientProtocol === targetProtocol) {
    return body;
  }
  try {
    const parsedBody = parseJsonObjectSafe(body);
    if (!parsedBody) {
      return body;
    }
    let translated: Record<string, unknown> | undefined;
    if (clientProtocol === "anthropic_messages" && targetProtocol === "openai_chat_completions") {
      translated = anthropicToOpenAiChat(parsedBody);
    } else if (clientProtocol === "openai_chat_completions" && targetProtocol === "anthropic_messages") {
      translated = openAiChatToAnthropic(parsedBody);
    }
    return translated ? serializeJsonBody(translated) : body;
  } catch {
    // Never let a translation failure break a fallback attempt.
    return body;
  }
}

function anthropicToOpenAiChat(body: Record<string, unknown>): Record<string, unknown> | undefined {
  // Copy everything through and only replace the fields whose shape differs between
  // protocols. This preserves incidental fields (stream, stream_options, temperature,
  // max_tokens, ...) that callers may rely on even when the body is not a canonical
  // Anthropic request (e.g. already-OpenAI-shaped bodies arriving via /v1/messages).
  const next: Record<string, unknown> = { ...body };
  delete next.system;
  delete next.messages;
  delete next.stop_sequences;
  delete next.tools;

  const messages: unknown[] = [];
  if (body.system !== undefined) {
    const systemText = contentToText(body.system);
    if (systemText !== undefined) {
      messages.push({ role: "system", content: systemText });
    }
  }
  if (Array.isArray(body.messages)) {
    for (const message of body.messages) {
      const converted = anthropicMessageToOpenAi(message);
      if (converted) {
        messages.push(converted);
      }
    }
  }
  if (Array.isArray(body.messages)) {
    next.messages = messages;
  }
  if (Array.isArray(body.stop_sequences)) {
    next.stop = body.stop_sequences;
  }
  const tools = anthropicToolsToOpenAi(body.tools);
  if (tools) {
    next.tools = tools;
  }
  return next;
}

function anthropicMessageToOpenAi(message: unknown): Record<string, unknown> | undefined {
  if (!isRecord(message)) {
    return undefined;
  }
  const role = stringValue(message.role);
  if (role === "user") {
    const content = message.content;
    // Anthropic tool results travel inside user messages; OpenAI uses a dedicated "tool"
    // role. A tool_result is emitted as its own OpenAI tool message.
    const toolResults = anthropicToolResultsToOpenAi(content);
    if (toolResults.length > 0) {
      return toolResults[0];
    }
    const text = contentToText(content);
    const openAi: Record<string, unknown> = { role: "user" };
    if (text !== undefined) {
      openAi.content = text;
    } else {
      const blocks = anthropicUserBlocksToOpenAi(content);
      if (blocks) {
        openAi.content = blocks;
      } else if (typeof content === "string") {
        openAi.content = content;
      }
    }
    return openAi;
  }
  if (role === "assistant") {
    const openAi: Record<string, unknown> = { role: "assistant" };
    const content = message.content;
    const text = contentToText(content);
    if (text !== undefined) {
      openAi.content = text;
    }
    const toolCalls = anthropicToolUseToOpenAi(content);
    if (toolCalls.length > 0) {
      openAi.tool_calls = toolCalls;
    }
    return openAi;
  }
  return undefined;
}

function anthropicToolResultsToOpenAi(content: unknown): unknown[] {
  if (!Array.isArray(content)) {
    return [];
  }
  const messages: unknown[] = [];
  for (const block of content) {
    if (isRecord(block) && block.type === "tool_result" && stringValue(block.tool_use_id)) {
      messages.push({
        role: "tool",
        tool_call_id: stringValue(block.tool_use_id),
        content: contentToText(block.content) ?? ""
      });
    }
  }
  return messages;
}

function anthropicUserBlocksToOpenAi(content: unknown): unknown[] | undefined {
  if (!Array.isArray(content)) {
    return undefined;
  }
  const blocks: unknown[] = [];
  let hasContent = false;
  for (const block of content) {
    if (!isRecord(block)) {
      continue;
    }
    if (block.type === "image" && isRecord(block.source)) {
      const imageUrl = anthropicImageToDataUrl(block.source);
      if (imageUrl) {
        blocks.push({ type: "image_url", image_url: { url: imageUrl } });
        hasContent = true;
      }
    }
  }
  return hasContent ? blocks : undefined;
}

function anthropicToolUseToOpenAi(content: unknown): unknown[] {
  if (!Array.isArray(content)) {
    return [];
  }
  const calls: unknown[] = [];
  for (const block of content) {
    if (isRecord(block) && block.type === "tool_use") {
      calls.push({
        id: stringValue(block.id),
        type: "function",
        function: {
          name: stringValue(block.name),
          arguments: JSON.stringify(block.input ?? {})
        }
      });
    }
  }
  return calls;
}

function anthropicToolsToOpenAi(tools: unknown): unknown[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) {
    return undefined;
  }
  const converted: unknown[] = [];
  for (const tool of tools) {
    if (!isRecord(tool) || !stringValue(tool.name)) {
      continue;
    }
    converted.push({
      type: "function",
      function: {
        name: stringValue(tool.name),
        description: stringValue(tool.description),
        parameters: tool.input_schema ?? { type: "object", properties: {} }
      }
    });
  }
  return converted.length > 0 ? converted : undefined;
}

function openAiChatToAnthropic(body: Record<string, unknown>): Record<string, unknown> | undefined {
  // Copy everything through and only replace fields whose shape differs between protocols.
  const next: Record<string, unknown> = { ...body };
  delete next.messages;
  delete next.stop;
  delete next.tools;

  const messages: unknown[] = [];
  if (Array.isArray(body.messages)) {
    let pendingSystem: string | undefined;
    for (const message of body.messages) {
      if (!isRecord(message)) {
        continue;
      }
      const role = stringValue(message.role);
      if (role === "system") {
        pendingSystem = pendingSystem ?? contentToText(message.content);
        continue;
      }
      const anthropic = openAiMessageToAnthropic(message);
      if (anthropic) {
        messages.push(anthropic);
      }
    }
    if (pendingSystem !== undefined) {
      next.system = pendingSystem;
    }
  }
  if (Array.isArray(body.messages)) {
    next.messages = messages;
  }
  if (Array.isArray(body.stop)) {
    next.stop_sequences = body.stop;
  }
  const tools = openAiToolsToAnthropic(body.tools);
  if (tools) {
    next.tools = tools;
  }
  return next;
}

function openAiMessageToAnthropic(message: Record<string, unknown>): Record<string, unknown> | undefined {
  const role = stringValue(message.role);
  const content = message.content;

  if (role === "user") {
    const anthropic: Record<string, unknown> = { role: "user" };
    if (typeof content === "string") {
      anthropic.content = [{ type: "text", text: content }];
    } else if (Array.isArray(content)) {
      const blocks: unknown[] = [];
      for (const block of content) {
        if (isRecord(block)) {
          if (block.type === "text") {
            blocks.push({ type: "text", text: stringValue(block.text) ?? "" });
          } else if (block.type === "image_url" && isRecord(block.image_url)) {
            const source = dataUrlToAnthropicImage(stringValue(block.image_url.url));
            if (source) {
              blocks.push({ type: "image", source });
            }
          }
        }
      }
      if (blocks.length > 0) {
        anthropic.content = blocks;
      }
    }
    return anthropic;
  }

  if (role === "assistant") {
    const anthropic: Record<string, unknown> = { role: "assistant" };
    const blocks: unknown[] = [];
    if (typeof content === "string" && content) {
      blocks.push({ type: "text", text: content });
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (isRecord(block) && block.type === "text" && stringValue(block.text)) {
          blocks.push({ type: "text", text: stringValue(block.text) });
        }
      }
    }
    if (Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        if (isRecord(call) && isRecord(call.function)) {
          blocks.push({
            type: "tool_use",
            id: stringValue(call.id),
            name: stringValue(call.function.name),
            input: parseArguments(stringValue(call.function.arguments))
          });
        }
      }
    }
    if (blocks.length > 0) {
      anthropic.content = blocks;
    }
    return anthropic;
  }

  if (role === "tool") {
    return {
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: stringValue(message.tool_call_id),
        content: contentToText(content) ?? ""
      }]
    };
  }

  return undefined;
}

function openAiToolsToAnthropic(tools: unknown): unknown[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) {
    return undefined;
  }
  const converted: unknown[] = [];
  for (const tool of tools) {
    if (!isRecord(tool)) {
      continue;
    }
    const fn = isRecord(tool.function) ? tool.function : tool;
    if (!stringValue(fn.name)) {
      continue;
    }
    converted.push({
      name: stringValue(fn.name),
      description: stringValue(fn.description),
      input_schema: fn.parameters ?? { type: "object", properties: {} }
    });
  }
  return converted.length > 0 ? converted : undefined;
}

function contentToText(content: unknown): string | undefined {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (isRecord(block) && block.type === "text") {
        const text = stringValue(block.text);
        if (text) {
          parts.push(text);
        }
      }
    }
    return parts.length > 0 ? parts.join("\n") : undefined;
  }
  return undefined;
}

function anthropicImageToDataUrl(source: Record<string, unknown>): string | undefined {
  const type = stringValue(source.type);
  const mediaType = stringValue(source.media_type);
  const data = stringValue(source.data);
  if (type === "base64" && mediaType && data) {
    return `data:${mediaType};base64,${data}`;
  }
  if (type === "url" && stringValue(source.url)) {
    return stringValue(source.url);
  }
  return undefined;
}

function dataUrlToAnthropicImage(url: string | undefined): Record<string, unknown> | undefined {
  if (!url) {
    return undefined;
  }
  const match = /^data:([^;]+);base64,(.+)$/.exec(url);
  if (match) {
    return { type: "base64", media_type: match[1], data: match[2] };
  }
  return { type: "url", url };
}

function parseArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
