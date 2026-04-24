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
import { 
  mapToolName, 
  unmapToolName, 
  extractQwenThinking,
  QWEN_THINK_TAGS
} from "@/utils/qwen";

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
            assistantMessage.tool_calls = toolCallParts.map((tool: any) => {
              const toolName = mapToolName(tool.name);
              
              return {
                id: tool.id,
                type: "function" as const,
                function: {
                  name: toolName,
                  arguments: typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input || {}),
                },
              };
            });
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

    // 终极影子映射：将长工具名转换为短工具名，并补全必需参数
    if (result.tools?.length) {
      result.tools = result.tools.map(tool => {
        const toolName = mapToolName(tool.function.name);
        let required = tool.function.parameters.required || [];

        if (toolName === "Bash") {
          required = ["command"];
        } else if (toolName === "Edit") {
          required = ["file_path", "old_string", "new_string", "allow_multiple", "instruction"];
        } else if (toolName === "Read") {
          required = ["file_path"];
        } else if (toolName === "Glob") {
          required = ["pattern"];
        } else if (toolName === "Grep") {
          required = ["pattern"];
        } else if (toolName === "Ls") {
          required = ["path"];
        } else if (toolName === "Write") {
          required = ["file_path", "content"];
        }

        return {
    ...tool,
          function: {
            ...tool.function,
            name: toolName,
            parameters: {
              ...tool.function.parameters,
              required
            }
          }
        };
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
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // 状态机跟踪
    let state = {
      messageId: null as string | null,
      hasStarted: false,
      hasFinished: false,
      isClosed: false,
      currentBlockIndex: -1,
      currentBlockType: null as "thinking" | "text" | "tool_use" | null,
      nextIndex: 0,
      model: "unknown",
      lastUsage: null as any,
      toolCallMap: new Map<number, { id: string; name: string; blockIndex: number }>()
    };

    return new ReadableStream({
      start: async (controller) => {
        const safeEnqueue = (event: string, data: any) => {
          if (state.isClosed) return;
          try {
            const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(payload));
          } catch (e) {
            state.isClosed = true;
          }
        };

        const stopCurrentBlock = () => {
          if (state.currentBlockType && state.currentBlockIndex !== -1) {
            safeEnqueue("content_block_stop", {
              type: "content_block_stop",
              index: state.currentBlockIndex
            });
            state.currentBlockType = null;
            state.currentBlockIndex = -1;
          }
        };

        const stopAllToolBlocks = () => {
          for (const [, toolInfo] of state.toolCallMap) {
            safeEnqueue("content_block_stop", {
              type: "content_block_stop",
              index: toolInfo.blockIndex
            });
          }
          state.toolCallMap.clear();
        };

        const startBlock = (type: "thinking" | "text" | "tool_use", extra = {}) => {
          stopCurrentBlock();
          const index = state.nextIndex++;
          state.currentBlockIndex = index;
          state.currentBlockType = type;
          
          let contentBlock: any = { type };
          if (type === "thinking") {
            contentBlock.thinking = "";
            contentBlock.signature = (extra as any).signature || "none";
          } else if (type === "text") {
            contentBlock.text = "";
          } else if (type === "tool_use") {
            contentBlock.id = (extra as any).id;
            contentBlock.name = (extra as any).name;
            contentBlock.input = {};
          }

          safeEnqueue("content_block_start", {
            type: "content_block_start",
            index,
            content_block: contentBlock
          });
          return index;
        };

        try {
          const reader = openaiStream.getReader();
          let partialLine = new Uint8Array(0);

          const processLine = (line: string) => {
            if (!line.startsWith("data:") || state.hasFinished) return;
            const rawData = line.slice(5).trim();
            if (rawData === "[DONE]") {
              state.hasFinished = true;
              return;
            }

            try {
              const chunk = JSON.parse(rawData);
              if (chunk.error) {
                safeEnqueue("error", {
                  type: "error",
                  error: { type: "api_error", message: chunk.error.message }
                });
                return;
              }

              state.model = chunk.model || state.model;
              if (!state.messageId) {
                state.messageId = chunk.id?.replace("chatcmpl-", "") || `msg_${uuidv4()}`;
              }

              // 1. 发送消息开始
              if (!state.hasStarted) {
                state.hasStarted = true;
                safeEnqueue("message_start", {
                  type: "message_start",
                  message: {
                    id: state.messageId,
                    type: "message",
                    role: "assistant",
                    model: state.model,
                    usage: {
                      input_tokens: chunk.usage?.prompt_tokens || 0,
                      output_tokens: 0,
                      cache_read_input_tokens: 0,
                      cache_creation_input_tokens: 0,
                      thinking_tokens: 0
                    }
                  }
                });
              }

              // 更新 Usage 快照
              if (chunk.usage) {
                const cachedTokens = chunk.usage.prompt_tokens_details?.cached_tokens || 0;
                state.lastUsage = {
                  input_tokens: Math.max(0, (chunk.usage.prompt_tokens || 0) - cachedTokens),
                  output_tokens: chunk.usage.completion_tokens || 0,
                  cache_read_input_tokens: cachedTokens,
                  cache_creation_input_tokens: 0,
                  thinking_tokens: chunk.usage.completion_tokens_details?.reasoning_tokens || 0
                };
              }

              const choice = chunk.choices?.[0];
              if (!choice) return;

              // 2. 处理推理内容 (Thinking)
              if (choice.delta?.thinking) {
                if (state.currentBlockType !== "thinking") {
                  startBlock("thinking", { signature: choice.delta.thinking.signature });
                }
                if (choice.delta.thinking.content) {
                  safeEnqueue("content_block_delta", {
                    type: "content_block_delta",
                    index: state.currentBlockIndex,
                    delta: { type: "thinking_delta", thinking: choice.delta.thinking.content }
                  });
                }
              }

              // 3. 处理文本内容 (Text)
              const text = typeof choice.delta?.content === "string" ? choice.delta.content : "";
              if (text) {
                if (text.includes(QWEN_THINK_TAGS.start) && state.currentBlockType !== "thinking") {
                  startBlock("thinking", { signature: "qwen-think-v1" });
                }

                if (state.currentBlockType === "thinking") {
                  if (text.includes(QWEN_THINK_TAGS.end)) {
                    const [thinkPart, rest] = text.split(QWEN_THINK_TAGS.end);
                    if (thinkPart) {
                      safeEnqueue("content_block_delta", {
                        type: "content_block_delta",
                        index: state.currentBlockIndex,
                        delta: { type: "thinking_delta", thinking: thinkPart }
                      });
                    }
                    stopCurrentBlock();
                    if (rest) startBlock("text");
                  } else {
                    safeEnqueue("content_block_delta", {
                      type: "content_block_delta",
                      index: state.currentBlockIndex,
                      delta: { type: "thinking_delta", thinking: text }
                    });
                  }
                } else {
                  if (state.currentBlockType !== "text") {
                    startBlock("text");
                  }
                  safeEnqueue("content_block_delta", {
                    type: "content_block_delta",
                    index: state.currentBlockIndex,
                    delta: { type: "text_delta", text: text }
                  });
                }
              }

              // 4. 处理工具调用 (Tool Use)
              if (choice.delta?.tool_calls) {
                for (const tc of choice.delta.tool_calls) {
                  const tIdx = tc.index ?? 0;
                  if (tc.id) {
                    const blockIndex = startBlock("tool_use", {
                      id: tc.id,
                      name: unmapToolName(tc.function?.name || "unknown")
                    });
                    state.toolCallMap.set(tIdx, { id: tc.id, name: tc.function?.name || "unknown", blockIndex });
                  }
                  
                  if (tc.function?.arguments) {
                    const toolInfo = state.toolCallMap.get(tIdx);
                    if (toolInfo) {
                      safeEnqueue("content_block_delta", {
                        type: "content_block_delta",
                        index: toolInfo.blockIndex,
                        delta: { type: "input_json_delta", partial_json: tc.function.arguments }
                      });
                    }
                  }
                }
              }

              // 5. 结束判定
              if (choice.finish_reason) {
                stopCurrentBlock();
                stopAllToolBlocks();
                
                let reason = choice.finish_reason;
                if (state.toolCallMap.size > 0 && reason === "stop") {
                  reason = "tool_calls";
                }

                const stopReasonMap: Record<string, string> = {
                  stop: "end_turn",
                  length: "max_tokens",
                  tool_calls: "tool_use",
                  content_filter: "stop_sequence"
                };

                safeEnqueue("message_delta", {
                  type: "message_delta",
                  delta: {
                    stop_reason: stopReasonMap[reason] || "end_turn",
                    stop_sequence: null
                  },
                  usage: state.lastUsage || {
                    input_tokens: 0,
                    output_tokens: 0,
                    cache_read_input_tokens: 0,
                    cache_creation_input_tokens: 0,
                    thinking_tokens: 0
                  }
                });
                safeEnqueue("message_stop", { type: "message_stop" });
                state.hasFinished = true;
              }
            } catch (e) {
              this.logger?.error(`Stream parse error: ${e}`);
            }
          };

          while (true) {
            const { done, value } = await reader.read();
            
            if (value) {
              const combined = new Uint8Array(partialLine.length + value.length);
              combined.set(partialLine);
              combined.set(value, partialLine.length);
              
              let start = 0;
              for (let i = 0; i < combined.length; i++) {
                if (combined[i] === 10) { // Newline \n
                  const lineBytes = combined.slice(start, i);
                  const line = decoder.decode(lineBytes, { stream: true });
                  if (line.trim()) processLine(line);
                  start = i + 1;
                }
              }
              partialLine = combined.slice(start);
            }

            if (done) {
              if (partialLine.length > 0) {
                const line = decoder.decode(partialLine);
                if (line.trim()) processLine(line);
              }
              break;
            }
          }
        } catch (error) {
          controller.error(error);
        } finally {
          controller.close();
        }
      }
    });
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
      
      // 1. Handle Thinking (Place at the beginning of content)
      if ((choice.message as any)?.thinking?.content || (choice.message as any)?.reasoning_content) {
        content.push({
          type: "thinking",
          thinking: (choice.message as any).thinking?.content || (choice.message as any).reasoning_content,
          signature: (choice.message as any).thinking?.signature || "none",
        });
      }

      // 2. Handle Annotations
      let annotationText = "";
      if (choice.message.annotations) {
        annotationText = "\n\nSources:\n";
        choice.message.annotations.forEach((item: any) => {
          annotationText += `- [${item.url_citation.title}](${item.url_citation.url})\n`;
        });
      }

      // 3. Handle Text Content
      if (choice.message.content) {
        if (Array.isArray(choice.message.content)) {
          choice.message.content.forEach((part: any) => {
            if (part.type === "text") {
              content.push({
                type: "text",
                text: part.text + (annotationText ? annotationText : ""),
              });
              annotationText = ""; 
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

      // 4. Handle Tool Calls
      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        choice.message.tool_calls.forEach((toolCall) => {
          let parsedInput = {};
          try {
            const argumentsStr = toolCall.function.arguments || "{}";
            parsedInput = typeof argumentsStr === "string" ? JSON.parse(argumentsStr) : argumentsStr;
          } catch {
            parsedInput = { text: toolCall.function.arguments || "" };
          }

          content.push({
            type: "tool_use",
            id: toolCall.id,
            name: unmapToolName(toolCall.function.name),
            input: parsedInput,
          });
        });
      }

      // 5. Finalize Stop Reason
      let stop_reason = "end_turn";
      if (choice.finish_reason === "tool_calls" || (choice.message.tool_calls && choice.message.tool_calls.length > 0)) {
        stop_reason = "tool_use";
      } else if (choice.finish_reason === "length") {
        stop_reason = "max_tokens";
      } else if (choice.finish_reason === "content_filter") {
        stop_reason = "stop_sequence";
      }

      const result = {
        id: openaiResponse.id,
        type: "message",
        role: "assistant",
        model: openaiResponse.model,
        content: content,
        stop_reason,
        stop_sequence: null,
        usage: {
          input_tokens: openaiResponse.usage?.prompt_tokens || 0,
          output_tokens: openaiResponse.usage?.completion_tokens || 0,
          cache_read_input_tokens:
            openaiResponse.usage?.prompt_tokens_details?.cached_tokens || 0,
          cache_creation_input_tokens: 0,
          thinking_tokens: (openaiResponse.usage as any)?.completion_tokens_details?.reasoning_tokens || 0,
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
