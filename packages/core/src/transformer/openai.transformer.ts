import { Transformer } from "@/types/transformer";
import { UnifiedChatRequest } from "@/types/llm";

export class OpenAITransformer implements Transformer {
  name = "OpenAI";
  endPoint = "/v1/chat/completions";

  async transformRequestIn(
    request: UnifiedChatRequest
  ): Promise<UnifiedChatRequest> {
    if (request.thinking?.type === "enabled") {
      (request as any).enable_thinking = true;
    } else if (request.enable_thinking === undefined && !request.thinking) {
      (request as any).enable_thinking = false;
    }
    return request;
  }
}
