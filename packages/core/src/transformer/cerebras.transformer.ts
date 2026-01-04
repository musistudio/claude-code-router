import { LLMProvider, UnifiedChatRequest, UnifiedMessage } from "@/types/llm";
import { Transformer } from "@/types/transformer";


/**
 * Transformer class for Cerebras
 */
export class CerebrasTransformer implements Transformer {
  name = "cerebras";

  /**
   * Transform the request from Claude Code format to Cerebras format
   * @param request - The incoming request
   * @param provider - The LLM provider information
   * @returns The transformed request
   */
  async transformRequestIn(
    request: UnifiedChatRequest,
    provider: LLMProvider
  ): Promise<Record<string, unknown>> {
    // Deep clone the request to avoid modifying the original
    const transformedRequest = JSON.parse(JSON.stringify(request));

    if (transformedRequest.reasoning) {
      delete transformedRequest.reasoning;
    } else {
      transformedRequest.disable_reasoning = false
    }
    
    return {
      body: transformedRequest,
      config: {
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    };
  }

  async transformResponseOut(response: Response): Promise<Response> {
    
    return response;
  }
}