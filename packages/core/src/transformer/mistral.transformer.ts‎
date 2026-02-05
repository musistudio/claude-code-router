import { MessageContent, TextContent, UnifiedChatRequest, UnifiedMessage } from "../types/llm";
import { Transformer, TransformerContext } from "../types/transformer";

/**
 * Mistral Transformer for Claude Code Router
 * 
 * Transforms Anthropic-style requests to Mistral's OpenAI-compatible API format.
 * Handles the key differences:
 * - Removes `cache_control` fields (not supported by Mistral)
 * - Flattens array content to strings where needed
 * - Ensures tool definitions match OpenAI function calling format
 */
export class MistralTransformer implements Transformer {
  name = "mistral";

  /**
   * Transform incoming request to Mistral-compatible format
   */
  async transformRequestIn(
    request: UnifiedChatRequest,
    _provider: any,
    _context: TransformerContext
  ): Promise<UnifiedChatRequest> {
    // Deep clone to avoid mutating original
    const transformedRequest = JSON.parse(JSON.stringify(request)) as UnifiedChatRequest;

    // Process messages
    if (Array.isArray(transformedRequest.messages)) {
      transformedRequest.messages = transformedRequest.messages.map((msg) => 
        this.transformMessage(msg)
      );
    }

    // Ensure stream is set (Mistral defaults to non-streaming)
    if (transformedRequest.stream === undefined) {
      transformedRequest.stream = true;
    }

    // Handle tool_choice conversion
    if (transformedRequest.tool_choice) {
      transformedRequest.tool_choice = this.transformToolChoice(transformedRequest.tool_choice);
    }

    return transformedRequest;
  }

  /**
   * Transform a single message to Mistral-compatible format
   */
  private transformMessage(msg: UnifiedMessage): UnifiedMessage {
    const transformed: UnifiedMessage = {
      role: msg.role,
      content: msg.content,
    };

    // Handle array content - flatten to string and remove cache_control
    if (Array.isArray(msg.content)) {
      const contentArray = msg.content as MessageContent[];
      
      // Check if there are any image contents
      const hasImages = contentArray.some(
        (part) => part.type === "image_url"
      );

      if (hasImages) {
        // Keep as array but clean up cache_control
        transformed.content = contentArray.map((part) => {
          if (part.type === "text") {
            const { cache_control, ...rest } = part as TextContent;
            return rest;
          }
          return part;
        });
      } else {
        // Flatten text content to a single string
        const textParts = contentArray
          .filter((part): part is TextContent => part.type === "text")
          .map((part) => part.text)
          .filter((text) => text && text.length > 0);
        
        transformed.content = textParts.join("\n");
      }
    }

    // Remove cache_control from message level
    if ((msg as any).cache_control) {
      delete (transformed as any).cache_control;
    }

    // Copy tool_calls if present
    if (msg.tool_calls) {
      transformed.tool_calls = msg.tool_calls;
    }

    // Copy tool_call_id if present (for tool response messages)
    if (msg.tool_call_id) {
      transformed.tool_call_id = msg.tool_call_id;
    }

    return transformed;
  }

  /**
   * Transform tool_choice to Mistral-compatible format
   */
  private transformToolChoice(
    toolChoice: UnifiedChatRequest["tool_choice"]
  ): UnifiedChatRequest["tool_choice"] {
    if (toolChoice === "auto" || toolChoice === "none") {
      return toolChoice;
    }
    
    if (toolChoice === "required") {
      // Mistral uses "any" instead of "required"
      return "any" as any;
    }

    // Handle object format
    if (typeof toolChoice === "object" && toolChoice.function?.name) {
      return {
        type: "function",
        function: { name: toolChoice.function.name },
      };
    }

    return toolChoice;
  }

  /**
   * Transform response back (usually passthrough for Mistral since it's OpenAI-compatible)
   */
  async transformResponseOut(
    response: Response,
    _context: TransformerContext
  ): Promise<Response> {
    // Mistral responses are already OpenAI-compatible, so we can pass them through
    // Only intervene if there are specific issues to handle
    return response;
  }
}
