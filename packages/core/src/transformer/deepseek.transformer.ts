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
      let reasoningContent = "";
      let isReasoningComplete = false;
      let buffer = ""; // 用于缓冲不完整的数据

      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader();
          const processBuffer = (
            buffer: string,
            controller: ReadableStreamDefaultController,
            encoder: TextEncoder
          ) => {
            const lines = buffer.split("\n");
            for (const line of lines) {
              if (line.trim()) {
                controller.enqueue(encoder.encode(line + "\n"));
              }
            }
          };

          const processLine = (
            line: string,
            context: {
              controller: ReadableStreamDefaultController;
              encoder: TextEncoder;
              reasoningContent: () => string;
              appendReasoningContent: (content: string) => void;
              isReasoningComplete: () => boolean;
              setReasoningComplete: (val: boolean) => void;
            }
          ) => {
            const { controller, encoder } = context;

            if (
              line.startsWith("data: ") &&
              line.trim() !== "data: [DONE]"
            ) {
              try {
                const data = JSON.parse(line.slice(6));

                // Extract reasoning_content from delta
                const hasReasoning = !!data.choices?.[0]?.delta?.reasoning_content;
                const hasContent = !!data.choices?.[0]?.delta?.content;

                if (hasReasoning) {
                  context.appendReasoningContent(
                    data.choices[0].delta.reasoning_content
                  );
                  const thinkingChunk = {
                    ...data,
                    choices: [
                      {
                        ...data.choices[0],
                        delta: {
                          ...data.choices[0].delta,
                          thinking: {
                            content: data.choices[0].delta.reasoning_content,
                          },
                        },
                      },
                    ],
                  };
                  delete thinkingChunk.choices[0].delta.reasoning_content;
                  const thinkingLine = `data: ${JSON.stringify(
                    thinkingChunk
                  )}\n\n`;
                  controller.enqueue(encoder.encode(thinkingLine));

                  // If chunk also has content, send it as a separate content chunk
                  // (was previously lost because of early return)
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

                // Check if reasoning is complete (when delta has content but no reasoning_content)
                if (
                  data.choices?.[0]?.delta?.content &&
                  context.reasoningContent() &&
                  !context.isReasoningComplete()
                ) {
                  context.setReasoningComplete(true);
                  const signature = Date.now().toString();

                  // Create a new chunk with thinking block
                  const thinkingChunk = {
                    ...data,
                    choices: [
                      {
                        ...data.choices[0],
                        delta: {
                          ...data.choices[0].delta,
                          content: null,
                          thinking: {
                            content: context.reasoningContent(),
                            signature: signature,
                          },
                        },
                      },
                    ],
                  };
                  delete thinkingChunk.choices[0].delta.reasoning_content;
                  // Send the thinking chunk
                  const thinkingLine = `data: ${JSON.stringify(
                    thinkingChunk
                  )}\n\n`;
                  controller.enqueue(encoder.encode(thinkingLine));
                }

                // Send the modified chunk
                if (
                  data.choices?.[0]?.delta &&
                  Object.keys(data.choices[0].delta).length > 0
                ) {
                  if (context.isReasoningComplete()) {
                    data.choices[0].index++;
                  }
                  const modifiedLine = `data: ${JSON.stringify(data)}\n\n`;
                  controller.enqueue(encoder.encode(modifiedLine));
                }
              } catch (e) {
                // If JSON parsing fails, pass through the original line
                controller.enqueue(encoder.encode(line + "\n"));
              }
            } else {
              // Pass through non-data lines (like [DONE])
              controller.enqueue(encoder.encode(line + "\n"));
            }
          };

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                // 处理缓冲区中剩余的数据
                if (buffer.trim()) {
                  processBuffer(buffer, controller, encoder);
                }
                break;
              }

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;

              // 处理缓冲区中完整的数据行
              const lines = buffer.split("\n");
              buffer = lines.pop() || ""; // 最后一行可能不完整，保留在缓冲区

              for (const line of lines) {
                if (!line.trim()) continue;

                try {
                  processLine(line, {
                    controller,
                    encoder,
                    reasoningContent: () => reasoningContent,
                    appendReasoningContent: (content) =>
                      (reasoningContent += content),
                    isReasoningComplete: () => isReasoningComplete,
                    setReasoningComplete: (val) => (isReasoningComplete = val),
                  });
                } catch (error) {
                  console.error("Error processing line:", line, error);
                  // 如果解析失败，直接传递原始行
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
