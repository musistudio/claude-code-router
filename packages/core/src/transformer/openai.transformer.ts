import { UnifiedChatRequest } from "@/types/llm";
import { Transformer } from "@/types/transformer";

export class OpenAITransformer implements Transformer {
  name = "OpenAI";
  endPoint = "/v1/chat/completions";

  async transformRequestIn(
    request: UnifiedChatRequest
  ): Promise<UnifiedChatRequest> {
    if (request.reasoning?.effort && request.reasoning.effort !== "none") {
      (request as any).reasoning_effort = request.reasoning.effort;
    }
    delete request.reasoning;
    delete (request as any).thinking;
    delete (request as any).enable_thinking;
    return request;
  }
}
