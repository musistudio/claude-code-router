import { LLMProvider, UnifiedChatRequest } from "@/types/llm";
import { Transformer, TransformerContext } from "@/types/transformer";
import { sendUnifiedRequest } from "@/utils/request";

function buildStreamResponse(payload: any): Response {
  const encoder = new TextEncoder();
  const message = payload?.choices?.[0]?.message || {};
  const content = message.content || "";
  const id = payload?.id || `chatcmpl_${Date.now()}`;
  const model = payload?.model || "";
  const created = payload?.created || Math.floor(Date.now() / 1000);

  const chunks = [
    {
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [
        {
          index: 0,
          delta: { role: "assistant" },
          finish_reason: null,
        },
      ],
    },
    {
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [
        {
          index: 0,
          delta: { content },
          finish_reason: null,
        },
      ],
    },
    {
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "stop",
        },
      ],
    },
  ];

  const stream = new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      });
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

export class KimiTransformer implements Transformer {
  name = "kimi";

  async transformRequestIn(request: UnifiedChatRequest): Promise<Record<string, any>> {
    const hasWebSearch = Array.isArray(request.tools)
      && request.tools.some((tool) => tool.function?.name === "web_search");

    if (!hasWebSearch) {
      return request;
    }

    const nextRequest: any = { ...request };
    const normalTools = (request.tools || []).filter(
      (tool) => tool.function?.name !== "web_search"
    );

    nextRequest.tools = [
      ...normalTools,
      {
        type: "builtin_function",
        function: {
          name: "$web_search",
        },
      },
    ];

    nextRequest.thinking = { type: "disabled" };
    nextRequest.enable_thinking = false;
    nextRequest.__kimi_web_search = true;

    return nextRequest;
  }

  async sendRequest(
    request: Record<string, any>,
    provider: LLMProvider,
    config: Record<string, any>,
    context: TransformerContext,
  ): Promise<Response> {
    const rawRequest: any = { ...request };
    const useWebSearch = rawRequest.__kimi_web_search === true;
    delete rawRequest.__kimi_web_search;

    if (!useWebSearch) {
      return sendUnifiedRequest(
        new URL(provider.baseUrl),
        rawRequest as UnifiedChatRequest,
        config,
        context,
        this.logger,
      );
    }

    const wantsStream = rawRequest.stream === true;
    const firstRequest: any = { ...rawRequest, stream: false };

    const firstResponse = await sendUnifiedRequest(
      new URL(provider.baseUrl),
      firstRequest as UnifiedChatRequest,
      config,
      context,
      this.logger,
    );

    if (!firstResponse.ok) {
      return firstResponse;
    }

    const firstJson = await firstResponse.json();
    const firstChoice = firstJson?.choices?.[0];
    const toolCalls = firstChoice?.message?.tool_calls || [];
    const hasBuiltinSearchCalls = toolCalls.some(
      (toolCall: any) => toolCall?.function?.name === "$web_search"
    );

    if (!hasBuiltinSearchCalls) {
      return wantsStream
        ? buildStreamResponse(firstJson)
        : new Response(JSON.stringify(firstJson), {
            status: firstResponse.status,
            statusText: firstResponse.statusText,
            headers: { "Content-Type": "application/json" },
          });
    }

    const secondRequest: any = {
      ...firstRequest,
      messages: [
        ...(firstRequest.messages || []),
        firstChoice.message,
        ...toolCalls.map((toolCall: any) => ({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolCall.function.arguments,
        })),
      ],
    };

    const secondResponse = await sendUnifiedRequest(
      new URL(provider.baseUrl),
      secondRequest as UnifiedChatRequest,
      config,
      context,
      this.logger,
    );

    if (!secondResponse.ok) {
      return secondResponse;
    }

    const secondJson = await secondResponse.json();

    return wantsStream
      ? buildStreamResponse(secondJson)
      : new Response(JSON.stringify(secondJson), {
          status: secondResponse.status,
          statusText: secondResponse.statusText,
          headers: { "Content-Type": "application/json" },
        });
  }
}
