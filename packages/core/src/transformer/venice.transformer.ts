import { LLMProvider, UnifiedChatRequest } from "../types/llm";
import { Transformer, TransformerContext } from "../types/transformer";

export class VeniceTransformer implements Transformer {
  static TransformerName = "Venice";

  async transformRequestIn(
    request: UnifiedChatRequest,
    _provider: LLMProvider,
    _context: TransformerContext
  ): Promise<UnifiedChatRequest> {
    const modified = { ...request } as any;

    const hasWebSearch = modified.tools?.some(
      (t: any) => t.function?.name === "web_search"
    );

    if (hasWebSearch) {
      modified.venice_parameters = {
        enable_web_search: "auto",
        enable_web_citations: true,
      };
      modified.tools = modified.tools.filter(
        (t: any) => t.function?.name !== "web_search"
      );
      if (modified.tools.length === 0) {
        modified.tools = undefined;
      }
    }

    return modified;
  }
}
