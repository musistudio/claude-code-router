import { UnifiedChatRequest } from "../types/llm";
import { Transformer } from "../types/transformer";

const V4_MODELS = ["deepseek-v4-pro", "deepseek-v4-flash"];
const V4_MAX_TOKENS = 384000;

export class DeepseekTransformer implements Transformer {
  name = "deepseek";

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    const modelId = request.model || "";
    const isV4 = V4_MODELS.some((m) => modelId.includes(m));

    if (isV4) {
      if (request.max_tokens && request.max_tokens > V4_MAX_TOKENS) {
        request.max_tokens = V4_MAX_TOKENS;
      }
      if (request.reasoning) {
        if (request.reasoning.effort && request.reasoning.effort !== "none") {
          const effortMap: Record<string, string> = { low: "low", medium: "medium", high: "high" };
          (request as any).reasoning_effort = effortMap[request.reasoning.effort] || "high";
        }
      }
    } else {
      if (request.max_tokens && request.max_tokens > 8192) {
        request.max_tokens = 8192;
      }
    }

    // Extract reasoning_content from thinking fields on assistant messages
    for (const msg of request.messages) {
      if (msg.role === "assistant") {
        if ((msg as any).thinking?.content && !(msg as any).reasoning_content) {
          (msg as any).reasoning_content = (msg as any).thinking.content;
        }
        if (!(msg as any).reasoning_content && Array.isArray(msg.content)) {
          const thinkingBlocks = (msg.content as any[]).filter(
              (c: any) => c.type === "thinking" && c.thinking
          );
          if (thinkingBlocks.length > 0) {
            (msg as any).reasoning_content = thinkingBlocks.map((b: any) => b.thinking).join("\n");
          }
        }
        delete (msg as any).thinking;
      }
    }

    // When thinking mode is active, all assistant messages must have reasoning_content
    const hasThinking = (request as any).reasoning_effort || request.reasoning?.effort || request.reasoning?.enabled;
    if (hasThinking) {
      for (const msg of request.messages) {
        if (msg.role === "assistant" && (msg as any).reasoning_content === undefined) {
          (msg as any).reasoning_content = null;
        }
      }
    }

    delete (request as any).thinking;
    delete (request as any).reasoning;
    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse = await response.json();
      if (jsonResponse.choices?.[0]?.message?.reasoning_content) {
        jsonResponse.choices[0].message.thinking = {
          content: jsonResponse.choices[0].message.reasoning_content,
          signature: Date.now().toString(),
        };
        delete jsonResponse.choices[0].message.reasoning_content;
      }
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
                if (data.choices?.[0]?.delta?.reasoning_content) {
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

                if (data.choices[0]?.delta?.reasoning_content) {
                  delete data.choices[0].delta.reasoning_content;
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
