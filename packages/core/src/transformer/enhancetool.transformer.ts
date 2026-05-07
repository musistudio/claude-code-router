import { Transformer } from "@/types/transformer";
import { parseToolArguments } from "@/utils/toolArgumentsParser";

export class EnhanceToolTransformer implements Transformer {
  name = "enhancetool";

  async transformResponseOut(response: Response): Promise<Response> {
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse = await response.json();
      if (jsonResponse?.choices?.[0]?.message?.tool_calls?.length) {
        // Handle non-streaming tool call argument parsing
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
      let buffer = ""; // used to buffer incomplete data

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
              this.logger?.error(
                `${e.message} ${
                  e.stack
                }  Tool call argument parsing failed: ${JSON.stringify(
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

            if (line.startsWith("data: ") && line.trim() !== "data: [DONE]") {
              const jsonStr = line.slice(6);
              try {
                const data = JSON.parse(jsonStr);

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

                // Handle finish_reason for tool_calls
                if (data.choices?.[0]?.finish_reason === "tool_calls" && currentToolCall.index !== undefined) {
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
                // If JSON parsing fails, it might be because the data is incomplete; pass the original line through
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
                // Process remaining data in the buffer
                if (buffer.trim()) {
                  processBuffer(buffer, controller, encoder);
                }
                break;
              }

              // Check if value is valid
              if (!value || value.length === 0) {
                continue;
              }

              let chunk;
              try {
                chunk = decoder.decode(value, { stream: true });
              } catch (decodeError) {
                this.logger?.warn("Failed to decode chunk", decodeError);
                continue;
              }

              if (chunk.length === 0) {
                continue;
              }

              buffer += chunk;

              // If the buffer is too large, process it to avoid memory leaks
              if (buffer.length > 1000000) {
                // 1MB limit
                this.logger?.warn(
                  "Buffer size exceeds limit, processing partial data"
                );
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  if (line.trim()) {
                    try {
                      processLine(line, {
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
                    } catch (error) {
                      this.logger?.error("Error processing line:", line, error);
                      // If parsing fails, pass the original line through
                      controller.enqueue(encoder.encode(line + "\n"));
                    }
                  }
                }
                continue;
              }

              // Process complete data lines in the buffer
              const lines = buffer.split("\n");
              buffer = lines.pop() || ""; // The last line might be incomplete; keep it in the buffer

              for (const line of lines) {
                if (!line.trim()) continue;

                try {
                  processLine(line, {
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
                } catch (error) {
                  this.logger?.error("Error processing line:", line, error);
                  // If parsing fails, pass the original line through
                  controller.enqueue(encoder.encode(line + "\n"));
                }
              }
            }
          } catch (error) {
            this.logger?.error("Stream error:", error);
            controller.error(error);
          } finally {
            try {
              reader.releaseLock();
            } catch (e) {
              this.logger?.error("Error releasing reader lock:", e);
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
