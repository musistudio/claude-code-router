import { MessageContent, TextContent, UnifiedChatRequest, UnifiedMessage } from "../types/llm";
import { Transformer, TransformerContext } from "../types/transformer";

/**
 * Mistral Transformer for Claude Code Router
 * 
 * Transforms Anthropic-style requests to Mistral's OpenAI-compatible API format.
 * Handles the key differences:
 * - Removes `cache_control` fields (not supported by Mistral)
 * - Removes `$schema` from tool parameters (not supported by Mistral)
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
    // Process messages - mutate directly for consistency with other transformers
    if (Array.isArray(request.messages)) {
      request.messages.forEach((msg) => {
        this.transformMessage(msg);
      });
    }

    // Ensure stream is set (Mistral defaults to non-streaming)
    if (request.stream === undefined) {
      request.stream = true;
    }

    // Handle tool_choice conversion
    if (request.tool_choice) {
      request.tool_choice = this.transformToolChoice(request.tool_choice);
    }

    // Remove $schema from tool function parameters if present
    if (Array.isArray(request.tools)) {
      request.tools.forEach((tool) => {
        if (tool?.function?.parameters?.$schema) {
          delete tool.function.parameters.$schema;
        }
      });
    }

    return request;
  }

  /**
   * Transform a single message to Mistral-compatible format (mutates in place)
   */
  private transformMessage(msg: UnifiedMessage): void {
    // Handle array content - flatten to string and remove cache_control
    if (Array.isArray(msg.content)) {
      const contentArray = msg.content as MessageContent[];
      
      // Check if there are any image contents
      const hasImages = contentArray.some(
        (part) => part.type === "image_url"
      );

      if (hasImages) {
        // Keep as array but clean up cache_control
        msg.content = contentArray.map((part) => {
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
        
        msg.content = textParts.join("\n");
      }
    }

    // Remove cache_control from message level
    if ((msg as any).cache_control) {
      delete (msg as any).cache_control;
    }
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
      // Note: "any" is valid for Mistral but not in UnifiedChatRequest type
      return "any";
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
