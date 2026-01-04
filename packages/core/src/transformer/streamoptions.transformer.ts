import { UnifiedChatRequest } from "../types/llm";
import { Transformer, TransformerOptions } from "../types/transformer";

export class StreamOptionsTransformer implements Transformer {
  name = "streamoptions";

  async transformRequestIn(
    request: UnifiedChatRequest
  ): Promise<UnifiedChatRequest> {
    if (!request.stream) return request;
    request.stream_options = {
      include_usage: true,
    };
    return request;
  }
}
