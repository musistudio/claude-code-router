import { UnifiedChatRequest, MessageContent, TextContent } from "../types/llm";
import { createSSEStreamReader, StreamContext, encodeSSEData, encodeSSELine } from "./stream";
import { stripMessagesCacheControl } from "./cacheControl";
import {
  buildThinkingChunk,
  extractReasoningText,
  cleanReasoningFields,
} from "./thinking";
import { normalizeToolParameters } from "./schema";

// Type definitions for Mistral API responses
interface MistralStreamChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      reasoning_content?: string;
      thinking?: { content?: string; signature?: string };
      tool_calls?: Array<{
        index: number;
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface MistralMessageContent {
  type: "thinking" | "text";
  text?: string;
  thinking?: any;
}

/**
 * Helper to flatten array content to strings and remove cache_control
 */
function transformMessage(msg: any): any {
  const clonedMsg = { ...msg };
  if (Array.isArray(clonedMsg.content)) {
    const contentArray = clonedMsg.content as MessageContent[];

    const hasImages = contentArray.some(
      (part) => (part as any).type === "image_url"
    );

    const hasThinking = contentArray.some(
      (part) => (part as any).type === "thinking"
    );

    if (hasImages || hasThinking) {
      clonedMsg.content = contentArray.map((part) => {
        if ((part as any).type === "text") {
          const { cache_control, ...rest } = part as TextContent;
          return rest;
        }
        return part;
      });
    } else {
      const textParts = contentArray
        .filter((part): part is TextContent => part.type === "text")
        .map((part) => part.text)
        .filter((text) => text && text.length > 0);

      clonedMsg.content = textParts.join("\n");
    }
  }

  if ((clonedMsg as any).cache_control) {
    delete (clonedMsg as any).cache_control;
  }

  return clonedMsg;
}

/**
 * Helper to transform tool_choice to Mistral-compatible format
 */
function transformToolChoice(toolChoice: UnifiedChatRequest["tool_choice"]): any {
  if (toolChoice === "auto" || toolChoice === "none") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    return "any";
  }

  if (typeof toolChoice === "object" && toolChoice.function?.name) {
    return {
      type: "function",
      function: { name: toolChoice.function.name },
    };
  }

  return toolChoice;
}

/**
 * Helper to transform reasoning parameter to Mistral's reasoning_effort format
 */
function transformReasoning(reasoning: any): string | undefined {
  if (reasoning.effort) {
    const effort = reasoning.effort.toLowerCase();
    if (effort === "low" || effort === "medium" || effort === "high") {
      return effort;
    }
  }

  if (reasoning.max_tokens) {
    const tokens = reasoning.max_tokens;
    if (tokens < 1000) return "low";
    if (tokens < 5000) return "medium";
    return "high";
  }

  return "medium";
}

const NON_REASONING = new Set([
  "mistral-small-2506",
  "mistral-medium-2505",
  "mistral-medium-2508",
]);

/**
 * Transform incoming request to Mistral-compatible format
 */
export function buildRequestBody(request: UnifiedChatRequest): Record<string, any> {
  const req = { ...request };

  // 1. Process messages
  if (Array.isArray(req.messages)) {
    req.messages = req.messages.map((msg) => transformMessage(msg));
  }

  // 2. Defaults
  if (req.stream === undefined) {
    req.stream = true;
  }

  // 3. Tool Choice
  if (req.tool_choice) {
    req.tool_choice = transformToolChoice(req.tool_choice);
  }

  // 4. Tool Cleanup - normalize schemas and remove $schema
  if (Array.isArray(req.tools)) {
    req.tools = req.tools.map((tool) => {
      if (tool?.function?.parameters) {
        return {
          ...tool,
          function: {
            ...tool.function,
            parameters: normalizeToolParameters(tool.function.parameters),
          },
        };
      }
      return tool;
    });
  }

  // 5. Reasoning conversion
  if (req.reasoning && req.model) {
    const modelId = req.model;
    const supportsReasoning =
      modelId.startsWith("magistral-") ||
      modelId.startsWith("labs-leanstral-") ||
      modelId === "mistral-vibe-cli-fast" ||
      (modelId.startsWith("mistral-small-") && !NON_REASONING.has(modelId)) ||
      (modelId.startsWith("mistral-medium-") && !NON_REASONING.has(modelId));

    if (supportsReasoning) {
      req.reasoning_effort = transformReasoning(req.reasoning);
    }
    delete req.reasoning;
  }

  return req;
}

/**
 * Transform a Mistral provider request back into a UnifiedChatRequest
 */
export async function transformRequestOut(request: any): Promise<UnifiedChatRequest> {
  return request as UnifiedChatRequest;
}

/**
 * Transform response back — convert Mistral's content-array thinking format
 * to the delta.thinking / delta.content shape expected by @musistudio/llms.
 */
export async function transformResponseOut(
  response: Response,
  providerName: string,
  logger?: any
): Promise<Response> {
  const contentType = response.headers.get("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    const jsonResponse = await response.json();
    logger?.debug({ response: jsonResponse }, `${providerName} response:`);

    const choice = jsonResponse.choices?.[0];
    if (choice?.message) {
      const message = choice.message;
      let thinkingText = "";

      if (message.reasoning_content) {
        const rc = message.reasoning_content;
        thinkingText += typeof rc === "string" ? rc : (typeof rc?.text === "string" ? rc.text : JSON.stringify(rc));
        delete message.reasoning_content;
      }

      if (Array.isArray(message.content)) {
        let plainText = "";
        for (const block of message.content) {
          if (block.type === "thinking") {
            const parts = Array.isArray(block.thinking) ? block.thinking : [block.thinking];
            thinkingText += parts.map((p: any) => {
              if (typeof p === "string") return p;
              if (p && typeof p.text === "string") return p.text;
              return JSON.stringify(p);
            }).join("");
          } else if (block.type === "text") {
            plainText += typeof block.text === "string" ? block.text : JSON.stringify(block.text ?? "");
          }
        }
        message.content = plainText;
      }

      if (thinkingText) {
        jsonResponse.thinking = { content: thinkingText };
      }
    }

    return new Response(JSON.stringify(jsonResponse), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } else if (contentType.includes("stream")) {
    if (!response.body) return response;

    return createSSEStreamReader(response, (line: string, ctx: StreamContext) => {
      if (!line.trim()) {
        ctx.controller.enqueue(encodeSSELine(line, ctx.encoder));
        return;
      }

      if (!line.startsWith("data:") || line.trim() === "data: [DONE]") {
        ctx.controller.enqueue(encodeSSELine(line, ctx.encoder));
        return;
      }

      try {
        const rawDataStr = line.slice(5).trim();
        const data = JSON.parse(rawDataStr);

        const delta = data.choices?.[0]?.delta;
        if (!delta) {
          ctx.controller.enqueue(encodeSSELine(line, ctx.encoder));
          return;
        }

        const reasoningText = extractReasoningText(delta);

        if (reasoningText) {
          const thinkingChunk = buildThinkingChunk(data, { content: reasoningText });
          cleanReasoningFields(thinkingChunk.choices[0].delta);

          // Handle content array thinking format
          const deltaContent = delta.content;
          if (Array.isArray(deltaContent)) {
            let arrThinkingText = "";
            const plainText = deltaContent
              .filter((b: any) => b.type === "text")
              .map((b: any) => typeof b.text === "string" ? b.text : JSON.stringify(b.text ?? ""))
              .join("");

            for (const block of deltaContent) {
              if (block.type === "thinking") {
                const parts = Array.isArray(block.thinking) ? block.thinking : [block.thinking];
                arrThinkingText += parts.map((p: any) => {
                  if (typeof p === "string") return p;
                  if (p && typeof p.text === "string") return p.text;
                  return JSON.stringify(p);
                }).join("");
              }
            }

            delete thinkingChunk.choices[0].delta.content;
            if (arrThinkingText || reasoningText) {
              thinkingChunk.choices[0].delta.thinking = { content: arrThinkingText || reasoningText };
            }
            if (plainText) thinkingChunk.choices[0].delta.content = plainText;
          }

          ctx.controller.enqueue(encodeSSEData(JSON.stringify(thinkingChunk), ctx.encoder));
          return;
        }

        // Handle content array thinking format without reasoning_content
        if (Array.isArray(delta.content)) {
          let thinkingFromArr = "";
          const plainText = delta.content
            .filter((b: any) => b.type === "text")
            .map((b: any) => typeof b.text === "string" ? b.text : JSON.stringify(b.text ?? ""))
            .join("");

          for (const block of delta.content) {
            if (block.type === "thinking") {
              const parts = Array.isArray(block.thinking) ? block.thinking : [block.thinking];
              thinkingFromArr += parts.map((p: any) => {
                if (typeof p === "string") return p;
                if (p && typeof p.text === "string") return p.text;
                return JSON.stringify(p);
              }).join("");
            }
          }

          delete delta.content;
          if (thinkingFromArr) delta.thinking = { content: thinkingFromArr };
          if (plainText) delta.content = plainText;
        }

        ctx.controller.enqueue(encodeSSEData(JSON.stringify(data), ctx.encoder));
      } catch {
        ctx.controller.enqueue(encodeSSELine(line, ctx.encoder));
      }
    });
  }

  return response;
}
