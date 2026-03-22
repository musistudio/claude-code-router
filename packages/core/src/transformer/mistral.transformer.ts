import { UnifiedChatRequest } from "@/types/llm";
import { Transformer, TransformerOptions } from "../types/transformer";

/**
 * Mistral models require that after a "tool" message, the next message must be
 * "assistant" or another "tool" — never "user". This transformer inserts a
 * synthetic assistant message between tool→user transitions to satisfy that
 * constraint.
 */
export class MistralTransformer implements Transformer {
  name = "mistral";

  constructor(private readonly options?: TransformerOptions) {}

  async transformRequestIn(
    request: UnifiedChatRequest
  ): Promise<UnifiedChatRequest> {
    const messages = request.messages;
    const fixed: typeof messages = [];

    for (let i = 0; i < messages.length; i++) {
      fixed.push(messages[i]);

      // If current message is "tool" and next message is "user", insert a
      // synthetic assistant message to bridge the gap.
      if (
        messages[i].role === "tool" &&
        i + 1 < messages.length &&
        messages[i + 1].role === "user"
      ) {
        fixed.push({
          role: "assistant",
          content: "",
        });
      }
    }

    request.messages = fixed;
    return request;
  }
}
