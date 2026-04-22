import { ChatCompletion } from "openai/resources";
import {
  LLMProvider,
  UnifiedChatRequest,
  UnifiedMessage,
  UnifiedTool,
} from "@/types/llm";
import {
  Transformer,
  TransformerContext,
  TransformerOptions,
} from "@/types/transformer";
import { v4 as uuidv4 } from "uuid";
import { getThinkLevel } from "@/utils/thinking";
import { createApiError } from "@/api/middleware";
import { formatBase64 } from "@/utils/image";

export class AnthropicTransformer implements Transformer {
  name = "Anthropic";
  endPoint = "/v1/messages";
  private useBearer: boolean;
  logger?: any;

  constructor(private readonly options?: TransformerOptions) {
    this.useBearer = this.options?.UseBearer ?? false;
  }

  async auth(request: any, provider: LLMProvider): Promise<any> {
    const headers: Record<string, string | undefined> = {};

    if (this.useBearer) {
      headers["authorization"] = `Bearer ${provider.apiKey}`;
      headers["x-api-key"] = undefined;
    } else {
      headers["x-api-key"] = provider.apiKey;
      headers["authorization"] = undefined;
    }

    return {
      body: request,
      config: {
        headers,
      },
    };
  }

  async transformRequestOut(
    request: Record<string, any>
  ): Promise<UnifiedChatRequest> {
    const messages: UnifiedMessage[] = [];

    if (request.system) {
      if (typeof request.system === "string") {
        messages.push({
          role: "system",
          content: request.system,
        });
      } else if (Array.isArray(request.system) && request.system.length) {
        const textParts = request.system
          .filter((item: any) => item.type === "text" && item.text)
          .map((item: any) => ({
            type: "text" as const,
            text: item.text,
            cache_control: item.cache_control,
          }));
        messages.push({
          role: "system",
          content: textParts,
        });
      }
    }

    const requestMessages = JSON.parse(JSON.stringify(request.messages || []));

    requestMessages?.forEach((msg: any) => {
      // Map 'developer' role to 'system' for better compatibility with models like Qwen
      const role = msg.role === "developer" ? "system" : msg.role;

      if (role === "user") {
        if (typeof msg.content === "string") {
          messages.push({
            role: "user",
            content: msg.content,
          });
        } else if (Array.isArray(msg.content)) {
          // 1. Handle Tool Results (Crucial for tool use working)
          const toolParts = msg.content.filter(
            (c: any) => c.type === "tool_result" && c.tool_use_id
          );
          if (toolParts.length) {
            toolParts.forEach((tool: any) => {
              let content = typeof tool.content === "string"
                ? tool.content
                : JSON.stringify(tool.content);
              
              // If Anthropic explicitly marked this as an error, ensure OpenAI model knows it failed
              if (tool.is_error && !content.trim().startsWith("Error")) {
                content = `Error: ${content}`;
              }

              const toolMessage: UnifiedMessage = {
                role: "tool",
                content: content,
                tool_call_id: tool.tool_use_id,
              };
              messages.push(toolMessage);
            });
          }

          // 2. Handle Text and Media
          const textAndMediaParts = msg.content.filter(
            (c: any) => c.type === "text" || c.type === "image"
          );
          if (textAndMediaParts.length) {
            messages.push({
              role: "user",
              content: textAndMediaParts.map((part: any) => {
                if (part?.type === "image") {
                  return {
                    type: "image_url",
                    image_url: {
                      url:
                        part.source?.type === "base64"
                          ? formatBase64(
                              part.source.data,
                              part.source.media_type
                            )
                          : part.source.url,
                    },
                    media_type: part.source.media_type,
                  };
                }
                return part;
              }),
            });
          }
        }
      } else if (role === "assistant") {
        const assistantMessage: UnifiedMessage = {
          role: "assistant",
          content: "",
        };
        
        // Extract text content
        if (typeof msg.content === "string") {
          assistantMessage.content = msg.content;
        } else if (Array.isArray(msg.content)) {
          const textParts = msg.content.filter(
            (c: any) => c.type === "text" && c.text
          );
          if (textParts.length) {
            assistantMessage.content = textParts
              .map((text: any) => text.text)
              .join("\n");
          }

          // Extract tool calls
          const toolCallParts = msg.content.filter(
            (c: any) => c.type === "tool_use" && c.id
          );
          if (toolCallParts.length) {
            assistantMessage.tool_calls = toolCallParts.map((tool: any) => ({
              id: tool.id,
              type: "function" as const,
              function: {
                name: tool.name,
                arguments: typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input || {}),
              },
            }));
          }

          // Preserve thinking content
          const thinkingPart = msg.content.find(
            (c: any) => c.type === "thinking"
          );
          if (thinkingPart) {
            assistantMessage.thinking = {
              content: thinkingPart.thinking || thinkingPart.text || "",
              signature: thinkingPart.signature,
            };
          }
        }
        messages.push(assistantMessage);
      } else if (role === "system") {
        messages.push({
          role: "system",
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)
        });
      }
    });

    const result: UnifiedChatRequest = {
      messages,
      model: request.model,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      stream: request.stream,
      tools: request.tools?.length
        ? this.convertAnthropicToolsToUnified(request.tools)
        : undefined,
      tool_choice: request.tool_choice,
    };

    // 强制必需参数映射：确保模型始终输出关键参数，修复 InputValidationError
    if (result.tools?.length) {
      result.tools = result.tools.map(tool => {
        if (tool.function.name === "edit_file") {
          return {
            ...tool,
            function: {
              ...tool.function,
              parameters: {
                ...tool.function.parameters,
                required: ["file_path", "old_string", "new_string", "allow_multiple", "instruction"]
              }
            }
          };
        }
        if (tool.function.name === "read_file") {
          return {
            ...tool,
            function: {
              ...tool.function,
              parameters: {
                ...tool.function.parameters,
                required: ["file_path"]
              }
            }
          };
        }
        if (tool.function.name === "run_bash_command") {
          return {
            ...tool,
            function: {
              ...tool.function,
              parameters: {
                ...tool.function.parameters,
                required: ["command"]
              }
            }
          };
        }
        return tool;
      });
    }

    if (request.thinking) {
      result.reasoning = {
        effort: getThinkLevel(request.thinking.budget_tokens),
        // max_tokens: request.thinking.budget_tokens,
        enabled: request.thinking.type === "enabled",
      };
    }
    if (request.tool_choice) {
      if (request.tool_choice.type === "tool") {
        result.tool_choice = {
          type: "function",
          function: { name: request.tool_choice.name },
        };
      } else {
        result.tool_choice = request.tool_choice.type;
      }
    }
    return result;
  }

  async transformResponseIn(
    response: Response,
    context?: TransformerContext
  ): Promise<Response> {
    const isStream = response.headers
      .get("Content-Type")
      ?.includes("text/event-stream");
    if (isStream) {
      if (!response.body) {
        throw new Error("Stream response body is null");
      }
      const convertedStream = await this.convertOpenAIStreamToAnthropic(
        response.body,
        context!
      );
      return new Response(convertedStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } else {
      const data = (await response.json()) as any;
      const anthropicResponse = this.convertOpenAIResponseToAnthropic(
        data,
        context!
      );
      return new Response(JSON.stringify(anthropicResponse), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  private convertAnthropicToolsToUnified(tools: any[]): UnifiedTool[] {
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || "",
        parameters: tool.input_schema,
      },
    }));
  }

  private async convertOpenAIStreamToAnthropic(
    openaiStream: ReadableStream,
    context: TransformerContext
  ): Promise<ReadableStream> {
    const readable = new ReadableStream({
      start: async (controller) => {
        const encoder = new TextEncoder();
        const messageId = `msg_${Date.now()}`;
        let stopReasonMessageDelta: null | Record<string, any> = null;
        let model = "unknown";
        let hasStarted = false;
        let hasFinished = false;
        let isClosed = false;

        let isThinkingStopped = false;
        let isTextStopped = false;

        const toolCallIndexToContentBlockIndex = new Map<number, number>();
        const toolCalls = new Map<
          number,
          {
            id: string;
            name: string;
            arguments: string;
            contentBlockIndex: number;
          }
        >();

        let contentIndex = 0;
        let thinkingBlockIndex = -1;
        let textBlockIndex = -1;

        const assignContentBlockIndex = () => contentIndex++;

        const safeEnqueue = (data: Uint8Array) => {
          if (!isClosed) {
            try {
              controller.enqueue(data);
            } catch (error) {
              if (
                error instanceof TypeError &&
                error.message.includes("Controller is already closed")
              ) {
                isClosed = true;
              } else {
                this.logger?.debug({
                  reqId: context.req.id,
                  error: error instanceof Error ? error.message : String(error),
                  type: "send data error",
                });
                throw error;
              }
            }
          }
        };

        const safeClose = () => {
          if (!isClosed) {
            try {
              // Close any open blocks
              if (thinkingBlockIndex >= 0 && !isThinkingStopped) {
                safeEnqueue(
                  encoder.encode(
                    `event: content_block_stop\ndata: ${JSON.stringify({
                      type: "content_block_stop",
                      index: thinkingBlockIndex,
                    })}\n\n`
                  )
                );
                isThinkingStopped = true;
              }
              if (textBlockIndex >= 0 && !isTextStopped) {
                safeEnqueue(
                  encoder.encode(
                    `event: content_block_stop\ndata: ${JSON.stringify({
                      type: "content_block_stop",
                      index: textBlockIndex,
                    })}\n\n`
                  )
                );
                isTextStopped = true;
              }
              toolCallIndexToContentBlockIndex.forEach((cbIndex) => {
                safeEnqueue(
                  encoder.encode(
                    `event: content_block_stop\ndata: ${JSON.stringify({
                      type: "content_block_stop",
                      index: cbIndex,
                    })}\n\n`
                  )
                );
              });

              if (stopReasonMessageDelta) {
                safeEnqueue(
                  encoder.encode(
                    `event: message_delta\ndata: ${JSON.stringify(
                      stopReasonMessageDelta
                    )}\n\n`
                  )
                );
                stopReasonMessageDelta = null;
              } else {
                safeEnqueue(
                  encoder.encode(
                    `event: message_delta\ndata: ${JSON.stringify({
                      type: "message_delta",
                      delta: {
                        stop_reason: "end_turn",
                        stop_sequence: null,
                      },
                      usage: {
                        input_tokens: 0,
                        output_tokens: 0,
                        cache_read_input_tokens: 0,
                        cache_creation_input_tokens: 0,
                      },
                    })}\n\n`
                  )
                );
              }
              safeEnqueue(
                encoder.encode(
                  `event: message_stop\ndata: ${JSON.stringify({
                    type: "message_stop",
                  })}\n\n`
                )
              );
              controller.close();
              isClosed = true;
            } catch (error) {
              if (
                error instanceof TypeError &&
                error.message.includes("Controller is already closed")
              ) {
                isClosed = true;
              } else {
                throw error;
              }
            }
          }
        };

        let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

        try {
          reader = openaiStream.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            if (isClosed) break;

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (isClosed || hasFinished) break;

              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              this.logger?.debug({
                reqId: context.req.id,
                type: "recieved data",
                data,
              });

              if (data === "[DONE]") {
                hasFinished = true;
                break;
              }

              try {
                const chunk = JSON.parse(data);
                if (chunk.error) {
                  safeEnqueue(
                    encoder.encode(
                      `event: error\ndata: ${JSON.stringify({
                        type: "error",
                        message: {
                          type: "api_error",
                          message: JSON.stringify(chunk.error),
                        },
                      })}\n\n`
                    )
                  );
                  continue;
                }

                model = chunk.model || model;

                if (!hasStarted && !isClosed) {
                  hasStarted = true;
                  safeEnqueue(
                    encoder.encode(
                      `event: message_start\ndata: ${JSON.stringify({
                        type: "message_start",
                        message: {
                          id: messageId,
                          type: "message",
                          role: "assistant",
                          content: [],
                          model: model,
                          stop_reason: null,
                          stop_sequence: null,
                          usage: {
                            input_tokens: chunk.usage?.prompt_tokens || 0,
                            output_tokens: 0,
                          },
                        },
                      })}\n\n`
                    )
                  );
                }

                if (chunk.usage) {
                  const usage = {
                    input_tokens:
                      (chunk.usage?.prompt_tokens || 0) -
                      (chunk.usage?.prompt_tokens_details?.cached_tokens || 0),
                    output_tokens: chunk.usage?.completion_tokens || 0,
                    cache_read_input_tokens:
                      chunk.usage?.prompt_tokens_details?.cached_tokens || 0,
                    cache_creation_input_tokens: 0,
                  };

                  if (!stopReasonMessageDelta) {
                    stopReasonMessageDelta = {
                      type: "message_delta",
                      delta: {
                        stop_reason: "end_turn",
                        stop_sequence: null,
                      },
                      usage,
                    };
                  } else {
                    stopReasonMessageDelta.usage = usage;
                  }
                }

                const choice = chunk.choices?.[0];
                if (!choice) continue;

                // 1. Handle Thinking Block
                if (choice.delta?.thinking && !isClosed && !isThinkingStopped) {
                  if (thinkingBlockIndex === -1) {
                    thinkingBlockIndex = assignContentBlockIndex();
                    safeEnqueue(
                      encoder.encode(
                        `event: content_block_start\ndata: ${JSON.stringify({
                          type: "content_block_start",
                          index: thinkingBlockIndex,
                          content_block: {
                            type: "thinking",
                            thinking: "",
                            signature: choice.delta.thinking.signature || "none",
                          },
                        })}\n\n`
                      )
                    );
                  }

                  if (choice.delta.thinking.content) {
                    safeEnqueue(
                      encoder.encode(
                        `event: content_block_delta\ndata: ${JSON.stringify({
                          type: "content_block_delta",
                          index: thinkingBlockIndex,
                          delta: {
                            type: "thinking_delta",
                            thinking: choice.delta.thinking.content,
                          },
                        })}\n\n`
                      )
                    );
                  }
                }

                // 2. Handle Text Content Block
                let textValue = "";
                if (typeof choice.delta?.content === "string") {
                  textValue = choice.delta.content;
                } else if (Array.isArray(choice.delta?.content)) {
                  textValue = choice.delta.content
                    .map((part: any) => typeof part === 'string' ? part : (part.text || ""))
                    .join("");
                } else if (choice.delta?.content && typeof choice.delta.content === "object") {
                  textValue = (choice.delta.content as any).text || "";
                }

                if (textValue && !isClosed && !isTextStopped) {
                  if (textBlockIndex === -1) {
                    // Close thinking if it was open
                    if (thinkingBlockIndex >= 0 && !isThinkingStopped) {
                      safeEnqueue(
                        encoder.encode(
                          `event: content_block_stop\ndata: ${JSON.stringify({
                            type: "content_block_stop",
                            index: thinkingBlockIndex,
                          })}\n\n`
                        )
                      );
                      isThinkingStopped = true;
                    }
                    
                    textBlockIndex = assignContentBlockIndex();
                    safeEnqueue(
                      encoder.encode(
                        `event: content_block_start\ndata: ${JSON.stringify({
                          type: "content_block_start",
                          index: textBlockIndex,
                          content_block: { type: "text", text: "" },
                        })}\n\n`
                      )
                    );
                  }

                  safeEnqueue(
                    encoder.encode(
                      `event: content_block_delta\ndata: ${JSON.stringify({
                        type: "content_block_delta",
                        index: textBlockIndex,
                        delta: { type: "text_delta", text: textValue },
                      })}\n\n`
                    )
                  );
                }

                // 3. Handle Annotations (as Text)
                if (choice.delta?.annotations?.length && !isClosed && !isTextStopped) {
                  let annotationText = "\n\nSources:\n";
                  choice.delta.annotations.forEach((ann: any) => {
                    const title = ann.url_citation?.title || "Source";
                    const url = ann.url_citation?.url || "#";
                    annotationText += `- [${title}](${url})\n`;
                  });

                  if (textBlockIndex === -1) {
                    if (thinkingBlockIndex >= 0 && !isThinkingStopped) {
                      safeEnqueue(
                        encoder.encode(
                          `event: content_block_stop\ndata: ${JSON.stringify({
                            type: "content_block_stop",
                            index: thinkingBlockIndex,
                          })}\n\n`
                        )
                      );
                      isThinkingStopped = true;
                    }

                    textBlockIndex = assignContentBlockIndex();
                    safeEnqueue(
                      encoder.encode(
                        `event: content_block_start\ndata: ${JSON.stringify({
                          type: "content_block_start",
                          index: textBlockIndex,
                          content_block: { type: "text", text: "" },
                        })}\n\n`
                      )
                    );
                  }

                  safeEnqueue(
                    encoder.encode(
                      `event: content_block_delta\ndata: ${JSON.stringify({
                        type: "content_block_delta",
                        index: textBlockIndex,
                        delta: { type: "text_delta", text: annotationText },
                      })}\n\n`
                    )
                  );
                }

                // 4. Handle Tool Calls
                if (choice.delta?.tool_calls && !isClosed) {
                  for (const toolCall of choice.delta.tool_calls) {
                    const tIndex = toolCall.index ?? 0;
                    if (!toolCallIndexToContentBlockIndex.has(tIndex)) {
                      // Close previous blocks if starting a tool call
                      if (textBlockIndex >= 0 && !isTextStopped) {
                        safeEnqueue(
                          encoder.encode(
                            `event: content_block_stop\ndata: ${JSON.stringify({
                              type: "content_block_stop",
                              index: textBlockIndex,
                            })}\n\n`
                          )
                        );
                        isTextStopped = true;
                      }
                      if (thinkingBlockIndex >= 0 && !isThinkingStopped) {
                        safeEnqueue(
                          encoder.encode(
                            `event: content_block_stop\ndata: ${JSON.stringify({
                              type: "content_block_stop",
                              index: thinkingBlockIndex,
                            })}\n\n`
                          )
                        );
                        isThinkingStopped = true;
                      }

                      const newCBIndex = assignContentBlockIndex();
                      toolCallIndexToContentBlockIndex.set(tIndex, newCBIndex);
                      const tcId = toolCall.id || `call_${Date.now()}_${tIndex}`;
                      const tcName = toolCall.function?.name || `tool_${tIndex}`;
                      
                      safeEnqueue(
                        encoder.encode(
                          `event: content_block_start\ndata: ${JSON.stringify({
                            type: "content_block_start",
                            index: newCBIndex,
                            content_block: {
                              type: "tool_use",
                              id: tcId,
                              name: tcName,
                              input: {},
                            },
                          })}\n\n`
                        )
                      );

                      toolCalls.set(tIndex, {
                        id: tcId,
                        name: tcName,
                        arguments: "",
                        contentBlockIndex: newCBIndex,
                      });
                    }

                    if (typeof toolCall.function?.arguments === "string") {
                      const cbIndex = toolCallIndexToContentBlockIndex.get(tIndex)!;
                      const tc = toolCalls.get(tIndex)!;
                      tc.arguments += toolCall.function.arguments;

                      safeEnqueue(
                        encoder.encode(
                          `event: content_block_delta\ndata: ${JSON.stringify({
                            type: "content_block_delta",
                            index: cbIndex,
                            delta: {
                              type: "input_json_delta",
                              partial_json: toolCall.function.arguments,
                            },
                          })}\n\n`
                        )
                      );
                    }
                  }
                }

                if (choice.finish_reason && !isClosed) {
                  const mapping: Record<string, string> = {
                    stop: "end_turn",
                    length: "max_tokens",
                    tool_calls: "tool_use",
                    content_filter: "stop_sequence",
                  };
                  let reason = mapping[choice.finish_reason] || "end_turn";
                  
                  // 关键修复：如果存在工具调用，强制将 stop_reason 设置为 tool_use
                  // 这修复了 Qwen 模型因命中 <|im_end|> 返回 stop 而导致 Claude Code 校验失败的问题
                  if (toolCallIndexToContentBlockIndex.size > 0 && (reason === "end_turn" || choice.finish_reason === "stop")) {
                    reason = "tool_use";
                  }
                  
                  if (stopReasonMessageDelta !== null) {
                    stopReasonMessageDelta.delta.stop_reason = reason;
                    
                    // IMPORTANT: Stop all blocks before sending message_delta
                    if (thinkingBlockIndex >= 0 && !isThinkingStopped) {
                      safeEnqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: thinkingBlockIndex })}\n\n`));
                      isThinkingStopped = true;
                    }
                    if (textBlockIndex >= 0 && !isTextStopped) {
                      safeEnqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: textBlockIndex })}\n\n`));
                      isTextStopped = true;
                    }
                    toolCallIndexToContentBlockIndex.forEach((cbIndex) => {
                      // We don't have individual stop flags for tool calls yet, 
                      // but they are usually stopped when finish_reason is tool_calls
                      safeEnqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: cbIndex })}\n\n`));
                    });

                    // Send message_delta
                    safeEnqueue(
                      encoder.encode(
                        `event: message_delta\ndata: ${JSON.stringify(
                          stopReasonMessageDelta
                        )}\n\n`
                      )
                    );
                    stopReasonMessageDelta = null; // Mark as sent
                  }
                }
              } catch (e: any) {
                this.logger?.error(`parseError: ${e.message} data: ${data}`);
              }
            }
            if (hasFinished) break;
          }
          safeClose();
        } catch (error) {
          if (!isClosed) {
            try {
              controller.error(error);
            } catch (controllerError) {
              console.error(controllerError);
            }
          }
        } finally {
          if (reader) {
            try {
              reader.releaseLock();
            } catch (releaseError) {
              console.error(releaseError);
            }
          }
        }
      },
      cancel: (reason) => {
        this.logger?.debug({ reqId: context.req.id, type: "cancel stream", reason });
      },
    });

    return readable;
  }

  private convertOpenAIResponseToAnthropic(
    openaiResponse: ChatCompletion,
    context: TransformerContext
  ): any {
    this.logger?.debug(
      {
        reqId: context.req.id,
        response: openaiResponse,
      },
      `Original OpenAI response`
    );
    try {
      const choice = openaiResponse.choices[0];
      if (!choice) {
        throw new Error("No choices found in OpenAI response");
      }
      const content: any[] = [];
      
      // Handle annotations by appending to text or as text blocks
      let annotationText = "";
      if (choice.message.annotations) {
        annotationText = "\n\nSources:\n";
        choice.message.annotations.forEach((item: any) => {
          annotationText += `- [${item.url_citation.title}](${item.url_citation.url})\n`;
        });
      }

      if (choice.message.content) {
        if (Array.isArray(choice.message.content)) {
          choice.message.content.forEach((part: any) => {
            if (part.type === "text") {
              content.push({
                type: "text",
                text: part.text + (annotationText ? annotationText : ""),
              });
              annotationText = ""; // Only append once
            } else if (typeof part === "string") {
              content.push({
                type: "text",
                text: part + (annotationText ? annotationText : ""),
              });
              annotationText = "";
            }
          });
        } else {
          content.push({
            type: "text",
            text: choice.message.content + (annotationText ? annotationText : ""),
          });
          annotationText = "";
        }
      } else if (annotationText) {
        content.push({
          type: "text",
          text: annotationText,
        });
      }

      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        choice.message.tool_calls.forEach((toolCall) => {
          let parsedInput = {};
          try {
            const argumentsStr = toolCall.function.arguments || "{}";

            if (typeof argumentsStr === "object") {
              parsedInput = argumentsStr;
            } else if (typeof argumentsStr === "string") {
              parsedInput = JSON.parse(argumentsStr);
            }
          } catch {
            parsedInput = { text: toolCall.function.arguments || "" };
          }

          content.push({
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.function.name,
            input: parsedInput,
          });
        });
      }
      if ((choice.message as any)?.thinking?.content) {
        content.push({
          type: "thinking",
          thinking: (choice.message as any).thinking.content,
          signature: (choice.message as any).thinking.signature,
        });
      }
      const result = {
        id: openaiResponse.id,
        type: "message",
        role: "assistant",
        model: openaiResponse.model,
        content: content,
        stop_reason:
          choice.finish_reason === "stop"
            ? "end_turn"
            : choice.finish_reason === "length"
            ? "max_tokens"
            : choice.finish_reason === "tool_calls"
            ? "tool_use"
            : choice.finish_reason === "content_filter"
            ? "stop_sequence"
            : "end_turn",
        stop_sequence: null,
        usage: {
          input_tokens:
            (openaiResponse.usage?.prompt_tokens || 0) -
            (openaiResponse.usage?.prompt_tokens_details?.cached_tokens || 0),
          output_tokens: openaiResponse.usage?.completion_tokens || 0,
          cache_read_input_tokens:
            openaiResponse.usage?.prompt_tokens_details?.cached_tokens || 0,
        },
      };
      this.logger?.debug(
        {
          reqId: context.req.id,
          result,
        },
        `Conversion complete, final Anthropic response`
      );
      return result;
    } catch {
      throw createApiError(
        `Provider error: ${JSON.stringify(openaiResponse)}`,
        500,
        "provider_error"
      );
    }
  }
}
