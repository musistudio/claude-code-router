import { randomUUID } from "node:crypto";
import { UnifiedChatRequest, UnifiedMessage } from "@/types/llm";
import { Transformer } from "@/types/transformer";

function extractText(content: UnifiedMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part: any) => part?.type === "text" && typeof part?.text === "string")
    .map((part: any) => part.text)
    .join("\n")
    .trim();
}

function getLastUserQuery(messages: UnifiedMessage[] = []): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "user") continue;
    const text = extractText(msg.content);
    if (text) return text;
  }
  return "Continue.";
}

export class XiaomiMimoTransformer implements Transformer {
  name = "xiaomi-mimo";

  async transformRequestIn(
    request: UnifiedChatRequest,
    provider: any,
    context: any
  ): Promise<Record<string, any>> {
    const query = getLastUserQuery(request.messages || []);
    const conversationId =
      context?.req?.sessionId ||
      context?.req?.id ||
      randomUUID().toLowerCase();
    const model =
      request.model ||
      provider?.models?.[0] ||
      "mimo-v2.5";

    const body = {
      msgId: randomUUID().replace(/-/g, ""),
      conversationId: String(conversationId).toLowerCase(),
      query,
      isEditedQuery: false,
      modelConfig: {
        enableThinking: Boolean(request.reasoning?.enabled),
        webSearchStatus: "disabled",
        model,
      },
      multiMedias: [],
    };

    return {
      body,
      config: {
        headers: {
          // Xiaomi endpoint uses cookie-based auth.
          cookie: provider.apiKey,
          authorization: undefined,
          accept: "*/*",
          origin: "https://aistudio.xiaomimimo.com",
          referer: "https://aistudio.xiaomimimo.com/",
        },
      },
    };
  }

  async transformResponseOut(response: Response, context?: any): Promise<Response> {
    const contentType = response.headers.get("Content-Type") || "";
    if (!contentType.includes("text/event-stream")) {
      return response;
    }
    if (!response.body) return response;

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const created = Math.floor(Date.now() / 1000);
    const model =
      context?.req?.body?.model ||
      context?.req?.model ||
      "mimo-v2.5";
    const id = `chatcmpl-${randomUUID()}`;

    let buffer = "";
    let hasOutput = false;

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let idx: number;
            while ((idx = buffer.indexOf("\n\n")) !== -1) {
              const rawEvent = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);
              const lines = rawEvent.split("\n");
              const eventLine = lines.find((l) => l.startsWith("event:"));
              const dataLine = lines.find((l) => l.startsWith("data:"));
              if (!eventLine || !dataLine) continue;

              const event = eventLine.slice("event:".length).trim();
              const dataRaw = dataLine.slice("data:".length).trim();

              if (event === "message") {
                try {
                  const payload = JSON.parse(dataRaw);
                  const content = payload?.content ?? "";
                  if (typeof content === "string" && content.length > 0) {
                    hasOutput = true;
                    const chunk = {
                      id,
                      object: "chat.completion.chunk",
                      created,
                      model,
                      choices: [
                        {
                          index: 0,
                          delta: { content },
                          logprobs: null,
                          finish_reason: null,
                        },
                      ],
                    };
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
                    );
                  }
                } catch {
                  continue;
                }
              } else if (event === "finish") {
                const stop = {
                  id,
                  object: "chat.completion.chunk",
                  created,
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {},
                      logprobs: null,
                      finish_reason: hasOutput ? "stop" : "length",
                    },
                  ],
                };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(stop)}\n\n`)
                );
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              }
            }
          }
        } finally {
          try {
            reader.releaseLock();
          } catch {}
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }
}

