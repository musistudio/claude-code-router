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
        
        // Extract content
        if (typeof msg.content === "string") {
          assistantMessage.content = msg.content;
        } else if (Array.isArray(msg.content)) {
          const contentParts: string[] = [];
          
          msg.content.forEach((part: any) => {
            if (part.type === "text" && part.text) {
              contentParts.push(part.text);
            } else if (part.type === "thinking" && (part.thinking || part.text)) {
              const thinkText = part.thinking || part.text;
              // 将 thinking 内容也作为普通文本放入 content 中，保证即使模型只输出思考和工具，对话流也不断裂
              contentParts.push(thinkText);
              // 依然保留结构化的 thinking 字段以供支持的 Provider 使用
              assistantMessage.thinking = {
                content: thinkText,
                signature: part.signature,
              };
            }
          });

          assistantMessage.content = contentParts.join("\n\n").trim();

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
        }
        messages.push(assistantMessage);
      } else if (role === "system") {
        messages.push({
          role: "system",
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)
        });
      }
    });

    const mergeMessages = (msgs: UnifiedMessage[]): UnifiedMessage[] => {
      if (msgs.length <= 1) return msgs;
      const merged: UnifiedMessage[] = [];
      
      for (const msg of msgs) {
        const last = merged[merged.length - 1];
        
        // 合并条件：角色相同、都没有工具调用、都没有思考过程、且内容都是字符串
        const canMerge = 
          last && 
          last.role === msg.role && 
          !last.tool_calls && !msg.tool_calls &&
          !last.thinking && !msg.thinking &&
          typeof last.content === 'string' &&
          typeof msg.content === 'string';

        if (canMerge) {
          last.content = (last.content + "\n\n" + msg.content).trim();
        } else {
          merged.push({ ...msg });
        }
      }
      return merged;
    };

    const mergedMessages = mergeMessages(messages);

    // 4. 基础上下文截断保护：如果消息条数过多，保留头尾，丢弃中间 (针对特大对话)
    const MAX_HISTORY_MESSAGES = 150;
    let finalMessages = mergedMessages;
    if (mergedMessages.length > MAX_HISTORY_MESSAGES) {
      const head = mergedMessages.slice(0, 10); // 保留最初的设定
      const tail = mergedMessages.slice(-80);   // 保留最近的对话
      finalMessages = [
        ...head,
        { 
          role: "user", 
          content: "[... 系统提示：由于上下文过长，中间部分已被路由器自动截断以保持对话稳定性 ...]" 
        },
        ...tail
      ];
    }

    const result: UnifiedChatRequest = {
      messages: finalMessages,
      model: request.model,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      stream: request.stream,
      tools: request.tools?.length
        ? this.convertAnthropicToolsToUnified(request.tools)
        : undefined,
      tool_choice: request.tool_choice,
    };

    // --- 工业级 Prompt Caching 优化 (借鉴 9router) ---
    // 1. 清理所有历史消息中已有的 cache_control，防止槽位冲突
    const stripCache = (obj: any) => {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        obj.forEach(stripCache);
      } else {
        delete obj.cache_control;
        Object.values(obj).forEach(stripCache);
      }
    };
    stripCache(result.messages);

    // 2. 在 System 消息末尾注入缓存点 (针对超长 System Prompt)
    const firstSystemMsg = result.messages.find(m => m.role === "system");
    if (firstSystemMsg) {
      if (Array.isArray(firstSystemMsg.content) && firstSystemMsg.content.length > 0) {
        const lastBlock = firstSystemMsg.content[firstSystemMsg.content.length - 1];
        if (lastBlock.type === "text") lastBlock.cache_control = { type: "ephemeral" };
      } else if (typeof firstSystemMsg.content === "string") {
        firstSystemMsg.content = [{ type: "text", text: firstSystemMsg.content, cache_control: { type: "ephemeral" } }];
      }
    }

    // 3. 在对话历史末尾注入缓存点 (针对超长对话)
    const lastUserMsg = [...result.messages].reverse().find(m => m.role === "user");
    if (lastUserMsg) {
      if (Array.isArray(lastUserMsg.content) && lastUserMsg.content.length > 0) {
        const lastTextBlock = [...lastUserMsg.content].reverse().find((c: any) => c.type === "text");
        if (lastTextBlock) lastTextBlock.cache_control = { type: "ephemeral" };
      } else if (typeof lastUserMsg.content === "string") {
        lastUserMsg.content = [{ type: "text", text: lastUserMsg.content, cache_control: { type: "ephemeral" } }];
      }
    }

    // 终极影子映射：将工具名映射，并确保必需参数存在且 properties 完整
    if (result.tools?.length) {
      result.tools = result.tools.map(tool => {
        const toolName = mapToolName(tool.function.name);
        // 深度合并参数，防止 properties 丢失
        const existingParameters = tool.function.parameters || { type: "object", properties: {} };
        let required = existingParameters.required || [];

        const ensureRequired = (param: string) => {
          if (!required.includes(param)) {
            required = [...required, param];
          }
        };

        if (toolName === "Bash") {
          ensureRequired("command");
        } else if (toolName === "Edit") {
          ["file_path", "old_string", "new_string", "allow_multiple", "instruction"].forEach(ensureRequired);
          // 强化 Edit 描述，强制模型必须精确匹配，减少 "String to replace not found" 报错
          tool.function.description = "Modify a file by replacing a specific string. CRITICAL: 'old_string' must be an EXACT, character-for-character match of the file content, including all whitespace, indentation, and newlines. Always Read the file first to ensure accuracy. 'allow_multiple' is equivalent to 'replace_all'.";
          
          if (existingParameters.properties) {
            if (existingParameters.properties.old_string) {
              existingParameters.properties.old_string.description = "The exact, full-line(s) string to be replaced. Must match exactly.";
            }
            // 兼容模型可能的 replace_all 幻觉：在 schema 中定义它但不标记为必需
            if (!existingParameters.properties.replace_all) {
               existingParameters.properties.replace_all = {
                 type: "boolean",
                 description: "Alias for allow_multiple. If true, all occurrences will be replaced."
               };
            }
          }
        } else if (toolName === "Read") {
          ensureRequired("file_path");
        } else if (toolName === "Glob") {
          ensureRequired("pattern");
        } else if (toolName === "Grep") {
          ensureRequired("pattern");
        } else if (toolName === "Ls") {
          ensureRequired("path");
        } else if (toolName === "Write") {
          ["file_path", "content"].forEach(ensureRequired);
        }

        return {
          ...tool,
          function: {
            ...tool.function,
            name: toolName,
            parameters: {
              ...existingParameters,
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
    const messageId = `msg_${uuidv4()}`;

    // 状态机跟踪
    let state = {
      messageId: null as string | null,
      hasStarted: false,
      hasFinished: false,
      isClosed: false,
      hasToolCallInThisStream: false, // 仅记录当前流中是否输出了工具调用
      currentBlockIndex: -1,
      currentBlockType: null as "thinking" | "text" | "tool_use" | null,
      nextIndex: 0,
      model: "unknown",
      lastUsage: null as any,
      toolCallMap: new Map<number, { id: string; name: string; blockIndex: number; args: string }>()
    };


    const tryFixJson = (json: string): string => {
      let openBraces = 0;
      let closeBraces = 0;
      for (const char of json) {
        if (char === "{") openBraces++;
        if (char === "}") closeBraces++;
      }
      if (openBraces > closeBraces) {
        return "}".repeat(openBraces - closeBraces);
      }
      return "";
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
            // If it's a tool block and the stream hasn't finished, try to fix JSON
            if (state.currentBlockType === "tool_use" && !state.hasFinished) {
              for (const [tIdx, toolInfo] of state.toolCallMap) {
                if (toolInfo.blockIndex === state.currentBlockIndex && toolInfo.args) {
                  const fix = tryFixJson(toolInfo.args);
                  if (fix) {
                    safeEnqueue("content_block_delta", {
                      type: "content_block_delta",
                      index: state.currentBlockIndex,
                      delta: { type: "input_json_delta", partial_json: fix }
                    });
                  }
                  state.toolCallMap.delete(tIdx);
                  break;
                }
              }
            }

            safeEnqueue("content_block_stop", {
              type: "content_block_stop",
              index: state.currentBlockIndex
            });
            state.currentBlockType = null;
            state.currentBlockIndex = -1;
          }
        };

        const stopAllToolBlocks = () => {
          // If the current block is a tool block, stop it first
          if (state.currentBlockType === "tool_use") {
            stopCurrentBlock();
          }

          for (const [tIdx, toolInfo] of state.toolCallMap) {
            if (!state.hasFinished && toolInfo.args) {
              const fix = tryFixJson(toolInfo.args);
              if (fix) {
                safeEnqueue("content_block_delta", {
                  type: "content_block_delta",
                  index: toolInfo.blockIndex,
                  delta: { type: "input_json_delta", partial_json: fix }
                });
              }
            }
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
          // 1. 发送消息开始 (零延迟)
          const initialModel = context.req.body?.model || "claude-3-5-sonnet-20241022";
          safeEnqueue("message_start", {
            type: "message_start",
            message: {
              id: messageId,
              type: "message",
              role: "assistant",
              model: initialModel,
              usage: {
                input_tokens: 0,
                output_tokens: 0,
                cache_read_input_tokens: 0,
                cache_creation_input_tokens: 0,
                thinking_tokens: 0
              }
            }
          });
          state.hasStarted = true;

          // 心跳定时器：每 15 秒发送一次 SSE 注释保持连接活跃
          // 尤其针对超大上下文，后端可能长时间不返回数据
          const heartbeatInterval = setInterval(() => {
            if (!state.isClosed && !state.hasFinished) {
              try {
                // Claude Code CLI 会忽略 SSE 注释行，但这能保持 TCP 连接活跃
                controller.enqueue(encoder.encode(": heartbeat\n\n"));
              } catch (e) {
                clearInterval(heartbeatInterval);
              }
            } else {
              clearInterval(heartbeatInterval);
            }
          }, 15000);

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
                  error: { type: "api_error", message: chunk.error.message || JSON.stringify(chunk.error) }
                });
                state.hasFinished = true; // 终止处理
                state.isClosed = true;
                return;
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
                
                // 如果这是最后的 Usage 包且没有内容，尝试立即发送一次 delta 更新
                if (!chunk.choices?.length && state.hasStarted) {
                   safeEnqueue("message_delta", {
                     type: "message_delta",
                     delta: { stop_reason: null, stop_sequence: null },
                     usage: state.lastUsage
                   });
                }
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
                    state.hasToolCallInThisStream = true; // 标记本轮流曾触发工具调用
                    const blockIndex = startBlock("tool_use", {
                      id: tc.id,
                      name: unmapToolName(tc.function?.name || "unknown")
                    });
                    state.toolCallMap.set(tIdx, { id: tc.id, name: tc.function?.name || "unknown", blockIndex, args: "" });
                  }
                  
                  if (tc.function?.arguments) {
                    const toolInfo = state.toolCallMap.get(tIdx);
                    if (toolInfo) {
                      toolInfo.args += tc.function.arguments;
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
                // 只有当本轮流中真的产生了工具调用，才映射为 tool_calls
                if (state.hasToolCallInThisStream && reason === "stop") {
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
              if (!state.hasFinished) {
                stopCurrentBlock();
                stopAllToolBlocks();
                safeEnqueue("message_stop", { type: "message_stop" });
                state.hasFinished = true;
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
      const message = choice.message as any;

      // 1. Extract and add Thinking
      const thinking = message.thinking?.content || message.reasoning_content;
      const signature = message.thinking?.signature || "none";
      if (thinking) {
        content.push({
          type: "thinking",
          thinking: thinking,
          signature: signature,
        });
      }

      // 2. Extract and add Text/Annotations
      let combinedText = "";
      
      // Handle Text Content (string or array)
      if (message.content) {
        if (typeof message.content === "string") {
          combinedText += message.content;
        } else if (Array.isArray(message.content)) {
          combinedText += message.content
            .map((part: any) => {
              if (typeof part === "string") return part;
              if (part.type === "text") return part.text || "";
              return "";
            })
            .join("");
        }
      }

      // Handle Annotations
      if (message.annotations && Array.isArray(message.annotations) && message.annotations.length > 0) {
        let annotationText = "\n\nSources:\n";
        message.annotations.forEach((item: any) => {
          if (item.url_citation) {
            annotationText += `- [${item.url_citation.title}](${item.url_citation.url})\n`;
          }
        });
        combinedText += annotationText;
      }

      if (combinedText.trim()) {
        content.push({
          type: "text",
          text: combinedText,
        });
      }

      // 3. Extract and add Tool Calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        message.tool_calls.forEach((toolCall: any) => {
          let parsedInput = {};
          try {
            const argumentsStr = toolCall.function.arguments || "{}";
            if (typeof argumentsStr === "object") {
              parsedInput = argumentsStr;
            } else {
              parsedInput = JSON.parse(argumentsStr);
            }
          } catch {
            // 解析失败时透传原始字符串，避免破坏结构
            parsedInput = toolCall.function.arguments;
          }

          const rawName = toolCall.function.name;
          const finalName = unmapToolName(rawName);

          // 针对核心工具进行参数清洗：实施严格的白名单机制，剔除 CLI 无法识别的多余字段
          if (typeof parsedInput === "object" && parsedInput !== null) {
            const input = parsedInput as any;
            if (finalName === "Edit") {
              // 容错：如果模型幻觉输出了 replace_all 而非 allow_multiple
              const am = typeof input.allow_multiple !== "undefined" ? input.allow_multiple : input.replace_all;
              
              // 深度清洗：模型经常在 old_string/new_string 末尾多带一个 \n，这会导致匹配失败
              const scrub = (val: any) => {
                if (typeof val !== "string") return val;
                // 如果字符串末尾有换行符且前面不是空行，通常是模型生成的冗余
                return val.replace(/\r\n/g, "\n").trimEnd();
              };

              parsedInput = { 
                file_path: input.file_path, 
                old_string: scrub(input.old_string), 
                new_string: scrub(input.new_string), 
                allow_multiple: am 
              };
            } else if (finalName === "Write") {
              const { file_path, content } = input;
              parsedInput = { file_path, content };
            } else if (finalName === "Read") {
              // Read 支持分页参数
              const { file_path, start_line, end_line } = input;
              parsedInput = { file_path, start_line, end_line };
            } else if (finalName === "Bash") {
              const { command } = input;
              parsedInput = { command };
            } else if (finalName === "Ls") {
              const { path } = input;
              parsedInput = { path };
            } else if (finalName === "Glob" || finalName === "Grep") {
              // 搜索工具支持 pattern 和过滤
              const { pattern, include_pattern, exclude_pattern } = input;
              parsedInput = { pattern, include_pattern, exclude_pattern };
            }
          }

          content.push({
            type: "tool_use",
            id: toolCall.id,
            name: finalName,
            input: parsedInput,
          });
        });
      }

      // 4. Finalize Stop Reason (force tool_use if tool calls are present)
      let stop_reason = "end_turn";
      if (choice.finish_reason === "tool_calls" || (message.tool_calls && message.tool_calls.length > 0)) {
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
          input_tokens: Math.max(0, (openaiResponse.usage?.prompt_tokens || 0) - (openaiResponse.usage?.prompt_tokens_details?.cached_tokens || 0)),
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
    } catch (e) {
      this.logger?.error(`Response conversion error: ${e}`);
      throw createApiError(
        `Provider error: ${JSON.stringify(openaiResponse)}`,
        500,
        "provider_error"
      );
    }
  }
}
