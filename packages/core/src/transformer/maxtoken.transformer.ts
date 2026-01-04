import { UnifiedChatRequest } from "../types/llm";
import { Transformer, TransformerOptions } from "../types/transformer";

export class MaxTokenTransformer implements Transformer {
  static TransformerName = "maxtoken";
  max_tokens: number;

  constructor(private readonly options?: TransformerOptions) {
    this.max_tokens = this.options?.max_tokens;
  }

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    if (request.max_tokens && request.max_tokens > this.max_tokens) {
      request.max_tokens = this.max_tokens;
    }
    return request;
  }
}
