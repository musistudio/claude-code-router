import { UnifiedChatRequest } from "../types/llm";
import { Transformer } from "../types/transformer";

export class DeepseekTransformer implements Transformer {
  name = "deepseek";

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    if (request.max_tokens && request.max_tokens > 8192) {
      request.max_tokens = 8192; // DeepSeek has a max token limit of 8192
    }
    return request;
  }

  async transformResponseOut(response: Response, context?: any): Promise<Response> {
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse = await response.json();
      const msg = jsonResponse?.choices?.[0]?.message;

      if (!response.ok) {
        // Upstream error — pass through as-is so error handler can process it
        return new Response(JSON.stringify(jsonResponse), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
      
      // Map DeepSeek's reasoning_content to thinking block for non-streaming responses.
      // When reasoning_content is present alongside content, reasoning_content goes to thinking
      // and content stays as the actual response text.
      if (msg?.reasoning_content) {
        if (!msg.thinking) {
          msg.thinking = { content: msg.reasoning_content };
        }
        delete msg.reasoning_content;

        // If content is empty after moving reasoning_content to thinking, this was a
        // reasoning-only response (v4-flash sometimes does this) — keep content empty
        // and let downstream AnthropicTransformer handle it.
        if (!msg.content || msg.content === "") {
          console.log(`[DeepseekTransformer] Non-streaming: reasoning_content (${msg.thinking.content.length} chars) -> thinking block`);
        }
      }
      console.log(`[DeepseekTransformer] Non-streaming: content="${String(msg?.content).substring(0, 50)}", hasThinking=${!!msg?.thinking}, model=${jsonResponse?.model}`);

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
            controller.close();
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
