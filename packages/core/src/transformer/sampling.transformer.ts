import { UnifiedChatRequest } from "../types/llm";
import { Transformer, TransformerOptions } from "../types/transformer";

export class SamplingTransformer implements Transformer {
  static TransformerName = "sampling";

  max_tokens: number;
  temperature: number;
  top_p: number;
  top_k: number;
  repetition_penalty: number;

  constructor(private readonly options?: TransformerOptions) {
    this.max_tokens = this.options?.max_tokens;
    this.temperature = this.options?.temperature;
    this.top_p = this.options?.top_p;
    this.top_k = this.options?.top_k;
    this.repetition_penalty = this.options?.repetition_penalty;
  }

  async transformRequestIn(
    request: UnifiedChatRequest
  ): Promise<UnifiedChatRequest> {
    if (request.max_tokens && request.max_tokens > this.max_tokens) {
      request.max_tokens = this.max_tokens;
    }
    if (typeof this.temperature !== "undefined") {
      request.temperature = this.temperature;
    }
    if (typeof this.top_p !== "undefined") {
      request.top_p = this.top_p;
    }
    if (typeof this.top_k !== "undefined") {
      request.top_k = this.top_k;
    }
    if (typeof this.repetition_penalty !== "undefined") {
      request.repetition_penalty = this.repetition_penalty;
    }
    return request;
  }
}
