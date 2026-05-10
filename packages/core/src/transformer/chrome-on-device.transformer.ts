import { UnifiedChatRequest } from "@/types/llm";
import { Transformer } from "@/types/transformer";

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:3457";

export class ChromeOnDeviceTransformer implements Transformer {
  name = "chrome-on-device";

  async transformRequestIn(
    request: UnifiedChatRequest,
    provider: any,
    context?: any
  ): Promise<Record<string, any>> {
    // The model is text-only via Prompt API promptStreaming().
    // Tool definitions are converted to text instructions by the bridge.
    // We just need to route the request to the bridge.

    const bridgeUrl =
      process.env.CHROME_BRIDGE_URL ||
      provider?.baseUrl ||
      DEFAULT_BRIDGE_URL;

    // Ensure streaming in the original request body
    if (context?.req?.body) {
      context.req.body.stream = true;
    }

    return {
      body: {
        ...request,
        stream: true,
      },
      config: {
        url: `${bridgeUrl}/v1/chat/completions`,
        headers: {
          "Content-Type": "application/json",
        },
      },
    };
  }

  async transformResponseOut(response: Response): Promise<Response> {
    const contentType = response.headers.get("Content-Type") || "";

    if (contentType.includes("text/event-stream")) {
      return response;
    }

    if (!response.body) {
      return response;
    }

    // Bridge already emits Anthropic SSE — pass through
    return response;
  }
}
