import { MessageContent, TextContent, UnifiedChatRequest } from "@/types/llm";
import { Transformer } from "../types/transformer";

export class CleancacheTransformer implements Transformer {
  name = "cleancache";

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    if (Array.isArray(request.messages)) {
      request.messages.forEach((msg) => {
        if (Array.isArray(msg.content)) {
          (msg.content as MessageContent[]).forEach((item) => {
            if ((item as TextContent).cache_control) {
              delete (item as TextContent).cache_control;
            }
          });
        } else if (msg.cache_control) {
          delete msg.cache_control;
        }
      });
    }
    return request;
  }
}
