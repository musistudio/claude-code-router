import { MessageContent, UnifiedChatRequest } from "@/types/llm";
import { Transformer } from "../types/transformer";

export class CleanThinkingInMessageTransformer implements Transformer {
  name = "cleanThinkingInMessage";
  logger?: any;

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    this.logger?.debug(`[${this.name}] Cleaning thinking content from messages`);
    
    if (Array.isArray(request.messages)) {
      var messages = request.messages.map((msg) => {
        if (!!msg.thinking){
          delete msg.thinking;
        }
        return msg;
      });
      request.messages = messages;
    }
    return request;
  }
}
