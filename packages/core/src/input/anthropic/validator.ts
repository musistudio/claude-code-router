/**
 * Anthropic Request Validator
 *
 * Validates incoming Anthropic-format requests against the Anthropic Messages API
 * specification. Supports all content block types including thinking and
 * redacted_thinking blocks introduced by Claude Code CLI 2.1.x
 * (interleaved-thinking + redact-thinking).
 *
 * @see https://docs.anthropic.com/en/api/messages
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  data?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  source?: unknown;
  [key: string]: unknown;
}

interface AnthropicMessage {
  role: string;
  content: string | ContentBlock[];
  [key: string]: unknown;
}

interface SystemMessage {
  type: string;
  text: string;
  [key: string]: unknown;
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  [key: string]: unknown;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: SystemMessage[];
  tools?: AnthropicTool[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  [key: string]: unknown;
}

/**
 * Validates an Anthropic-format request.
 *
 * @throws {ValidationError} if the request is invalid
 * @returns `true` if validation passes
 */
export function validateAnthropicRequest(request: unknown): true {
  if (!request || typeof request !== "object") {
    throw new ValidationError("Request must be an object");
  }

  const req = request as AnthropicRequest;

  // Required fields
  if (!req.model || typeof req.model !== "string") {
    throw new ValidationError("Model is required and must be a string");
  }

  if (!req.messages || !Array.isArray(req.messages)) {
    throw new ValidationError("Messages are required and must be an array");
  }

  if (req.messages.length === 0) {
    throw new ValidationError("At least one message is required");
  }

  // Validate messages
  for (let i = 0; i < req.messages.length; i++) {
    const message = req.messages[i];
    if (!message || typeof message !== "object") {
      throw new ValidationError(`Message at index ${i} must be an object`);
    }
    if (!message.role || typeof message.role !== "string") {
      throw new ValidationError(`Message at index ${i} must have a role`);
    }
    if (!["user", "assistant", "system"].includes(message.role)) {
      throw new ValidationError(
        `Invalid role "${message.role}" at message index ${i}`
      );
    }
    if (message.content === undefined || message.content === null) {
      throw new ValidationError(`Message at index ${i} must have content`);
    }
    if (
      typeof message.content !== "string" &&
      !Array.isArray(message.content)
    ) {
      throw new ValidationError(
        `Message content at index ${i} must be string or array`
      );
    }
    if (Array.isArray(message.content)) {
      validateContentBlocks(message.content, i);
    }
  }

  // Optional system validation
  if (req.system !== undefined) {
    if (!Array.isArray(req.system)) {
      throw new ValidationError("System must be an array");
    }
    for (let i = 0; i < req.system.length; i++) {
      const systemMsg = req.system[i];
      if (!systemMsg || typeof systemMsg !== "object") {
        throw new ValidationError(
          `System message at index ${i} must be an object`
        );
      }
      if (systemMsg.type !== "text") {
        throw new ValidationError(
          `System message at index ${i} must have type "text"`
        );
      }
      if (!systemMsg.text || typeof systemMsg.text !== "string") {
        throw new ValidationError(
          `System message at index ${i} must have text field`
        );
      }
    }
  }

  // Optional tools validation
  if (req.tools !== undefined) {
    if (!Array.isArray(req.tools)) {
      throw new ValidationError("Tools must be an array");
    }
    for (let i = 0; i < req.tools.length; i++) {
      const tool = req.tools[i];
      if (!tool || typeof tool !== "object") {
        throw new ValidationError(`Tool at index ${i} must be an object`);
      }
      if (!tool.name || typeof tool.name !== "string") {
        throw new ValidationError(`Tool at index ${i} must have a name`);
      }
      if (!tool.description || typeof tool.description !== "string") {
        throw new ValidationError(
          `Tool at index ${i} must have a description`
        );
      }
      if (!tool.input_schema || typeof tool.input_schema !== "object") {
        throw new ValidationError(`Tool at index ${i} must have input_schema`);
      }
    }
  }

  // Optional numeric fields
  if (req.max_tokens !== undefined) {
    if (typeof req.max_tokens !== "number" || req.max_tokens <= 0) {
      throw new ValidationError("max_tokens must be a positive number");
    }
  }
  if (req.temperature !== undefined) {
    if (
      typeof req.temperature !== "number" ||
      req.temperature < 0 ||
      req.temperature > 1
    ) {
      throw new ValidationError(
        "temperature must be a number between 0 and 1"
      );
    }
  }
  if (req.stream !== undefined && typeof req.stream !== "boolean") {
    throw new ValidationError("stream must be a boolean");
  }

  return true;
}

/**
 * Validates content blocks within a message.
 * Supports all Anthropic content block types including thinking blocks.
 */
function validateContentBlocks(
  content: ContentBlock[],
  messageIndex: number
): void {
  for (let i = 0; i < content.length; i++) {
    const block = content[i];
    if (!block || typeof block !== "object") {
      throw new ValidationError(
        `Content block at index ${i} in message ${messageIndex} must be an object`
      );
    }
    if (!block.type || typeof block.type !== "string") {
      throw new ValidationError(
        `Content block at index ${i} in message ${messageIndex} must have a type`
      );
    }

    switch (block.type) {
      case "text":
        if (!block.text || typeof block.text !== "string") {
          throw new ValidationError(
            `Text block at index ${i} in message ${messageIndex} must have text field`
          );
        }
        break;

      case "tool_use":
        if (!block.id || typeof block.id !== "string") {
          throw new ValidationError(
            `Tool use block at index ${i} in message ${messageIndex} must have id`
          );
        }
        if (!block.name || typeof block.name !== "string") {
          throw new ValidationError(
            `Tool use block at index ${i} in message ${messageIndex} must have name`
          );
        }
        if (block.input === undefined) {
          throw new ValidationError(
            `Tool use block at index ${i} in message ${messageIndex} must have input`
          );
        }
        break;

      case "tool_result":
        if (!block.tool_use_id || typeof block.tool_use_id !== "string") {
          throw new ValidationError(
            `Tool result block at index ${i} in message ${messageIndex} must have tool_use_id`
          );
        }
        if (block.content === undefined) {
          throw new ValidationError(
            `Tool result block at index ${i} in message ${messageIndex} must have content`
          );
        }
        break;

      case "image":
        if (!block.source || typeof block.source !== "object") {
          throw new ValidationError(
            `Image block at index ${i} in message ${messageIndex} must have source`
          );
        }
        break;

      case "thinking":
        if (!block.thinking || typeof block.thinking !== "string") {
          throw new ValidationError(
            `Thinking block at index ${i} in message ${messageIndex} must have thinking field`
          );
        }
        break;

      case "redacted_thinking":
        if (!block.data || typeof block.data !== "string") {
          throw new ValidationError(
            `Redacted thinking block at index ${i} in message ${messageIndex} must have data field`
          );
        }
        break;

      // Pass-through for newer block types we don't need to validate deeply
      case "server_tool_use":
      case "web_search_tool_result":
      case "container_upload":
        break;

      default:
        // Unknown block types are allowed (forward-compatible)
        break;
    }
  }
}
