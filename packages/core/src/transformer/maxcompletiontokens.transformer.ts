import { UnifiedChatRequest } from "../types/llm";
import { Transformer } from "../types/transformer";

export class MaxCompletionTokens implements Transformer {
  static TransformerName = "maxcompletiontokens";

  async transformRequestIn(
    request: UnifiedChatRequest
  ): Promise<UnifiedChatRequest> {
    if (request.max_tokens) {
      request.max_completion_tokens = request.max_tokens;
      delete request.max_tokens;
    }
    return request;
  }
}
