import { UnifiedChatRequest } from "../types/llm";
import { Transformer } from "../types/transformer";

export class GlmTransformer implements Transformer {
  name = "glm";

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    if (request.max_tokens && request.max_tokens > 128000) {
      request.max_tokens = 128000;
    }

    if (request.stream && request.tools && request.tools.length > 0) {
      (request as any).tool_stream = true;
    }

    return request;
  }

  async transformResponseOut(response: Response, context?: any): Promise<Response> {
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse = await response.json();
      const msg = jsonResponse?.choices?.[0]?.message;

      if (!response.ok) {
        return new Response(JSON.stringify(jsonResponse), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }

      if (msg?.reasoning_content) {
        if (!msg.thinking) {
          msg.thinking = { content: msg.reasoning_content };
        }
        delete msg.reasoning_content;

        if (!msg.content || msg.content === "") {
          console.log(`[GlmTransformer] Non-streaming: reasoning_content (${msg.thinking.content.length} chars) -> thinking block`);
        }
      }
      console.log(`[GlmTransformer] Non-streaming: content="${String(msg?.content).substring(0, 50)}", hasThinking=${!!msg?.thinking}, model=${jsonResponse?.model}`);

      return new Response(JSON.stringify(jsonResponse), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } else if (response.headers.get("Content-Type")?.includes("stream")) {
      if (!response.body) {
        return response;
      }

      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";

      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader();

          const processLine = (
            line: string,
            controller: ReadableStreamDefaultController,
            encoder: TextEncoder
          ) => {
            if (
              line.startsWith("data: ") &&
              line.trim() !== "data: [DONE]"
            ) {
              try {
                const data = JSON.parse(line.slice(6));

                const hasReasoning = !!data.choices?.[0]?.delta?.reasoning_content;
                const hasContent = !!data.choices?.[0]?.delta?.content;

                if (hasReasoning) {
                  const thinkingChunk = {
                    ...data,
                    choices: [
                      {
                        ...data.choices[0],
                        delta: {
                          thinking: {
                            content: data.choices[0].delta.reasoning_content,
                          },
                        },
                      },
                    ],
                  };
                  const thinkingLine = `data: ${JSON.stringify(thinkingChunk)}\n\n`;
                  controller.enqueue(encoder.encode(thinkingLine));

                  if (hasContent) {
                    const contentChunk = {
                      ...data,
                      choices: [
                        {
                          ...data.choices[0],
                          delta: {
                            content: data.choices[0].delta.content,
                          },
                        },
                      ],
                    };
                    const contentLine = `data: ${JSON.stringify(contentChunk)}\n\n`;
                    controller.enqueue(encoder.encode(contentLine));
                  }
                  return;
                }

                if (
                  data.choices?.[0]?.delta &&
                  Object.keys(data.choices[0].delta).length > 0
                ) {
                  const modifiedLine = `data: ${JSON.stringify(data)}\n\n`;
                  controller.enqueue(encoder.encode(modifiedLine));
                }
              } catch (e) {
                controller.enqueue(encoder.encode(line + "\n"));
              }
            } else {
              controller.enqueue(encoder.encode(line + "\n"));
            }
          };

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                if (buffer.trim()) {
                  processLine(buffer, controller, encoder);
                }
                break;
              }

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;

              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.trim()) continue;

                try {
                  processLine(line, controller, encoder);
                } catch (error) {
                  console.error("Error processing line:", line, error);
                  controller.enqueue(encoder.encode(line + "\n"));
                }
              }
            }
          } catch (error) {
            console.error("Stream error:", error);
            controller.error(error);
          } finally {
            try {
              reader.releaseLock();
            } catch (e) {
              console.error("Error releasing reader lock:", e);
            }
            try { controller.close(); } catch {}
          }
        },
      });

      return new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "Content-Type": response.headers.get("Content-Type") || "text/plain",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return response;
  }
}
