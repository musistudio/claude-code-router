import { Transformer } from "@/types/transformer";
import { parseToolArguments } from "@/utils/toolArgumentsParser";

export class EnhanceToolTransformer implements Transformer {
  name = "enhancetool";

  async transformResponseOut(response: Response): Promise<Response> {
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse = await response.json();
      if (jsonResponse?.choices?.[0]?.message?.tool_calls?.length) {
        // 处理非流式的工具调用参数解析
        for (const toolCall of jsonResponse.choices[0].message.tool_calls) {
          if (toolCall.function?.arguments) {
            toolCall.function.arguments = parseToolArguments(
              toolCall.function.arguments,
              this.logger
            );
          }
        }
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

      // Define interface for tool call tracking
      interface ToolCall {
        index?: number;
        name?: string;
        id?: string;
        arguments?: string;
      }

      let currentToolCall: ToolCall = {};

      let hasTextContent = false;
      let reasoningContent = "";
      let isReasoningComplete = false;
      let hasToolCall = false;
      let isStreamEnded = false;
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

          // Helper function to process completed tool calls
          const processCompletedToolCall = (
            data: any,
            controller: ReadableStreamDefaultController,
            encoder: TextEncoder
          ) => {
            let finalArgs = "";
            try {
              finalArgs = parseToolArguments(currentToolCall.arguments || "", this.logger);
            } catch (e: any) {
              console.error(
                `${e.message} ${
                  e.stack
                }  工具调用参数解析失败: ${JSON.stringify(
                  currentToolCall
                )}`
              );
              // Use original arguments if parsing fails
              finalArgs = currentToolCall.arguments || "";
            }

            const delta = {
              role: "assistant",
              tool_calls: [
                {
                  function: {
                    name: currentToolCall.name,
                    arguments: finalArgs,
                  },
                  id: currentToolCall.id,
                  index: currentToolCall.index,
                  type: "function",
                },
              ],
            };

            // Remove content field entirely to prevent extra null values
            const modifiedData = {
              ...data,
              choices: [
                {
                  ...data.choices[0],
                  delta,
                },
              ],
            };
            // Remove content field if it exists
            if (modifiedData.choices[0].delta.content !== undefined) {
              delete modifiedData.choices[0].delta.content;
            }

            const modifiedLine = `data: ${JSON.stringify(modifiedData)}\n\n`;
            controller.enqueue(encoder.encode(modifiedLine));
          };

          const processLine = (
            line: string,
            context: {
              controller: ReadableStreamDefaultController;
              encoder: TextEncoder;
              hasTextContent: () => boolean;
              setHasTextContent: (val: boolean) => void;
              reasoningContent: () => string;
              appendReasoningContent: (content: string) => void;
              isReasoningComplete: () => boolean;
              setReasoningComplete: (val: boolean) => void;
            }
          ) => {
            const { controller, encoder } = context;

            // 关键修复：全量停止信号检测（覆盖 Qwen/ChatML 及各种 Provider）
            const lowerLine = line.toLowerCase();
            const hasStopToken = 
              line.includes("<|im_end|>") || 
              line.includes("<|endoftext|>") || 
              line.includes("matched_stop\":248046") || 
              line.includes("matched_stop\":248044");
            
            // 如果收到 [DONE] 或 明确的停止 Token，或者在有工具调用时收到 finish_reason: stop
            if (line.trim() === "data: [DONE]" || hasStopToken) {
              if (currentToolCall.index !== undefined) {
                processCompletedToolCall({}, controller, encoder);
                currentToolCall = {};
              }
              // 如果不是 [DONE]，则补发一个 [DONE] 确保下游关闭
              if (line.trim() !== "data: [DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              }
              return true; // 表示需要终止整个读取循环
            }

            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6);
              try {
                const data = JSON.parse(jsonStr);
                
                // 关键修复：不再单纯依赖 matched_stop，只要 finish_reason 存在即认为该 Choice 结束
                const fr = data.choices?.[0]?.finish_reason;
                if (fr === "stop" || fr === "tool_calls" || fr === "length") {
                  if (currentToolCall.index !== undefined) {
                    processCompletedToolCall(data, controller, encoder);
                    currentToolCall = {};
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    return true; // 立即终止循环
                  }
                }

                // Handle tool calls in streaming mode
                if (data.choices?.[0]?.delta?.tool_calls?.length) {
                  const toolCallDelta = data.choices[0].delta.tool_calls[0];

                  // Initialize currentToolCall if this is the first chunk for this tool call
                  if (typeof currentToolCall.index === "undefined") {
                    currentToolCall = {
                      index: toolCallDelta.index,
                      name: toolCallDelta.function?.name || "",
                      id: toolCallDelta.id || "",
                      arguments: toolCallDelta.function?.arguments || ""
                    };
                    if (toolCallDelta.function?.arguments) {
                      toolCallDelta.function.arguments = ''
                    }
                    // Send the first chunk as-is
                    const modifiedLine = `data: ${JSON.stringify(data)}\n\n`;
                    controller.enqueue(encoder.encode(modifiedLine));
                    return;
                  }
                  // Accumulate arguments if this is a continuation of the current tool call
                  else if (currentToolCall.index === toolCallDelta.index) {
                    if (toolCallDelta.function?.arguments) {
                      currentToolCall.arguments += toolCallDelta.function.arguments;
                    }
                    // Don't send intermediate chunks that only contain arguments
                    return;
                  }
                  // If we have a different tool call index, process the previous one and start a new one
                  else {
                    // Process the completed tool call using helper function
                    processCompletedToolCall(data, controller, encoder);

                    // Start tracking the new tool call
                    currentToolCall = {
                      index: toolCallDelta.index,
                      name: toolCallDelta.function?.name || "",
                      id: toolCallDelta.id || "",
                      arguments: toolCallDelta.function?.arguments || ""
                    };
                    return;
                  }
                }

                // Handle finish_reason for tool_calls or stop
                const finishReason = data.choices?.[0]?.finish_reason;
                if ((finishReason === "tool_calls" || finishReason === "stop") && currentToolCall.index !== undefined) {
                  // Process the final tool call using helper function
                  processCompletedToolCall(data, controller, encoder);
                  currentToolCall = {};
                  return;
                }

                // Handle text content alongside tool calls
                if (
                  data.choices?.[0]?.delta?.tool_calls?.length &&
                  context.hasTextContent()
                ) {
                  if (typeof data.choices[0].index === "number") {
                    data.choices[0].index += 1;
                  } else {
                    data.choices[0].index = 1;
                  }
                }

                const modifiedLine = `data: ${JSON.stringify(data)}\n\n`;
                controller.enqueue(encoder.encode(modifiedLine));
              } catch (e) {
                // 如果JSON解析失败，可能是数据不完整，将原始行传递下去
                controller.enqueue(encoder.encode(line + "\n"));
              }
            } else {
              // Pass through non-data lines (like [DONE])
              controller.enqueue(encoder.encode(line + "\n"));
            }
          };

          try {
            while (true) {
              if (isStreamEnded) break;
              const { done, value } = await reader.read();
              if (done) {
                // 处理缓冲区中剩余的数据
                if (buffer.trim()) {
                  processBuffer(buffer, controller, encoder);
                }
                break;
              }

              // 检查value是否有效
              if (!value || value.length === 0) {
                continue;
              }

              let chunk;
              try {
                chunk = decoder.decode(value, { stream: true });
              } catch (decodeError) {
                console.warn("Failed to decode chunk", decodeError);
                continue;
              }

              if (chunk.length === 0) {
                continue;
              }

              buffer += chunk;

              // 如果缓冲区过大，进行处理避免内存泄漏
              if (buffer.length > 1000000) {
                // 1MB 限制
                console.warn(
                  "Buffer size exceeds limit, processing partial data"
                );
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  if (line.trim()) {
                    try {
                      const shouldStop = processLine(line, {
                        controller,
                        encoder,
                        hasTextContent: () => hasTextContent,
                        setHasTextContent: (val) => (hasTextContent = val),
                        reasoningContent: () => reasoningContent,
                        appendReasoningContent: (content) =>
                          (reasoningContent += content),
                        isReasoningComplete: () => isReasoningComplete,
                        setReasoningComplete: (val) =>
                          (isReasoningComplete = val),
                      });
                      if (shouldStop) {
                        isStreamEnded = true;
                        break;
                      }
                    } catch (error) {
                      console.error("Error processing line:", line, error);
                      // 如果解析失败，直接传递原始行
                      controller.enqueue(encoder.encode(line + "\n"));
                    }
                  }
                }
                continue;
              }

              // 处理缓冲区中完整的数据行
              const lines = buffer.split("\n");
              buffer = lines.pop() || ""; // 最后一行可能不完整，保留在缓冲区

              for (const line of lines) {
                if (!line.trim()) continue;

                try {
                  const shouldStop = processLine(line, {
                    controller,
                    encoder,
                    hasTextContent: () => hasTextContent,
                    setHasTextContent: (val) => (hasTextContent = val),
                    reasoningContent: () => reasoningContent,
                    appendReasoningContent: (content) =>
                      (reasoningContent += content),
                    isReasoningComplete: () => isReasoningComplete,
                    setReasoningComplete: (val) => (isReasoningComplete = val),
                  });
                  if (shouldStop) {
                    isStreamEnded = true;
                    break;
                  }
                } catch (error) {
                  console.error("Error processing line:", line, error);
                  // 如果解析失败，直接传递原始行
                  controller.enqueue(encoder.encode(line + "\n"));
                }
              }
            }

            // 关键修复：流读取循环正常结束，尝试刷新最后积攒的工具参数
            if (currentToolCall.index !== undefined) {
              processCompletedToolCall({}, controller, encoder);
              currentToolCall = {};
            }
          } catch (error) {
            console.error("Stream error:", error);
            // 发生错误时也尝试刷新工具调用，防止前端卡死
            if (currentToolCall.index !== undefined) {
              try { processCompletedToolCall({}, controller, encoder); } catch(e){}
            }
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
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return response;
  }
}
