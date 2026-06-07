import { UnifiedChatRequest, MessageContent } from "@/types/llm";
import { Transformer } from "@/types/transformer";
import { normalizeToolInputSchema } from "@/utils/tool-schema";
import { sanitizeToolInput } from "@/utils/tool-sanitizer";

interface ResponsesAPIOutputItem {
  type: string;
  id?: string;
  call_id?: string;
  tool_call_id?: string;
  name?: string;
  arguments?: unknown;
  content?: Array<{
    type: string;
    text?: unknown;
    image_url?: string;
    mime_type?: string;
    image_base64?: string;
    annotations?: Array<Record<string, any>>;
  }>;
  reasoning?: string;
}

interface ResponsesAPIPayload {
  id: string;
  object: string;
  model: string;
  created_at: number;
  output: ResponsesAPIOutputItem[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

interface ResponsesStreamEvent {
  [key: string]: any;
  type: string;
  item_id?: string;
  output_index?: number;
  delta?:
    | string
    | {
        url?: string;
        b64_json?: string;
        mime_type?: string;
      };
  item?: {
    id?: string;
    type?: string;
    call_id?: string;
    tool_call_id?: string;
    name?: string;
    arguments?: unknown;
    content?: Array<{
      type: string;
      text?: unknown;
      image_url?: string;
      mime_type?: string;
    }>;
    reasoning?: string; // 添加 reasoning 字段支持
  };
  response?: {
    id?: string;
    model?: string;
    output?: Array<{
      type: string;
      [key: string]: any;
    }>;
  };
  reasoning_summary?: string; // 添加推理摘要支持
}

export class OpenAIResponsesTransformer implements Transformer {
  name = "openai-responses";
  endPoint = "/v1/responses";
  logger?: any;

  async transformRequestIn(
    request: UnifiedChatRequest
  ): Promise<UnifiedChatRequest> {
    delete request.temperature;
    delete request.max_tokens;

    // 处理 reasoning 参数
    if (request.reasoning) {
      (request as any).reasoning = {
        effort: request.reasoning.effort,
        summary: "detailed",
      };
    }

    const input: any[] = [];

    const systemMessages = request.messages.filter(
      (msg) => msg.role === "system"
    );
    if (systemMessages.length > 0) {
      const firstSystem = systemMessages[0];
      if (Array.isArray(firstSystem.content)) {
        firstSystem.content.forEach((item) => {
          let text = "";
          if (typeof item === "string") {
            text = item;
          } else if (item && typeof item === "object" && "text" in item) {
            text = (item as { text: string }).text;
          }
          input.push({
            role: "system",
            content: text,
          });
        });
      } else {
        (request as any).instructions = firstSystem.content;
      }
    }

    request.messages.forEach((message) => {
      if (message.role === "system") return;

      if (Array.isArray(message.content)) {
        const convertedContent = message.content
          .map((content) => this.normalizeRequestContent(content, message.role))
          .filter(
            (content): content is Record<string, unknown> => content !== null
          );

        if (convertedContent.length > 0) {
          (message as any).content = convertedContent;
        } else {
          delete (message as any).content;
        }
      }

      if (message.role === "tool") {
        const toolMessage: any = { ...message };
        toolMessage.type = "function_call_output";
        toolMessage.call_id = message.tool_call_id;
        toolMessage.output = message.content;
        delete toolMessage.cache_control;
        delete toolMessage.role;
        delete toolMessage.tool_call_id;
        delete toolMessage.content;
        input.push(toolMessage);
        return;
      }

      if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
        message.tool_calls.forEach((tool) => {
          input.push({
            type: "function_call",
            arguments: tool.function.arguments,
            name: tool.function.name,
            call_id: tool.id,
          });
        });
        return;
      }

      input.push(message);
    });

    (request as any).input = input;
    delete (request as any).messages;

    if (Array.isArray(request.tools)) {
      const webSearch = request.tools.find(
        (tool) => tool.function.name === "web_search"
      );

      (request as any).tools = request.tools
        .filter((tool) => tool.function.name !== "web_search")
        .map((tool) => {
          let parameters = normalizeToolInputSchema(
            tool.function.name,
            tool.function.parameters
          );
          if (tool.function.name === "WebSearch") {
            parameters = {
              ...parameters,
              properties: { ...parameters.properties },
            };
            delete parameters.properties.allowed_domains;
          }
          if (tool.function.name === "Edit") {
            return {
              type: tool.type,
              name: tool.function.name,
              description: tool.function.description,
              parameters: {
                ...parameters,
                required: [
                  "file_path",
                  "old_string",
                  "new_string",
                  "replace_all",
                ],
              },
              strict: true,
            };
          }
          return {
            type: tool.type,
            name: tool.function.name,
            description: tool.function.description,
            parameters,
          };
        });

      if (webSearch) {
        (request as any).tools.push({
          type: "web_search",
        });
      }
    }

    (request as any).parallel_tool_calls = false;

    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    const contentType = response.headers.get("Content-Type") || "";

    if (contentType.includes("application/json")) {
      const jsonResponse: any = await response.json();

      // 检查是否为responses API格式的JSON响应
      if (jsonResponse.object === "response" && jsonResponse.output) {
        // 将responses格式转换为chat格式
        const chatResponse = this.convertResponseToChat(jsonResponse);
        return new Response(JSON.stringify(chatResponse), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }

      // 不是responses API格式，保持原样
      return new Response(JSON.stringify(jsonResponse), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } else if (contentType.includes("text/event-stream")) {
      if (!response.body) {
        return response;
      }

      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = ""; // 用于缓冲不完整的数据
      let isStreamEnded = false;

      const transformer = this;
      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader();

          // 索引跟踪变量，只有在事件类型切换时才增加索引
          let currentIndex = -1;
          let lastEventType = "";

          // 获取当前应该使用的索引的函数
          const getCurrentIndex = (eventType: string) => {
            if (eventType !== lastEventType) {
              currentIndex++;
              lastEventType = eventType;
            }
            return currentIndex;
          };
          const pendingToolCalls = new Map<string, any>();
          const completedToolCallIds = new Set<string>();
          let hasToolCall = false;
          let pendingEventType = "";

          const dataModel = (item: any) =>
            item?.response?.model || item?.model || "gpt-5-codex";

          const enqueueChatChunk = (chunk: Record<string, any>) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
            );
          };

          const enqueueToolCallChunk = (
            item: any,
            index: number,
            argumentsOverride?: unknown
          ) => {
            const toolCall = transformer.buildToolCallFromOutputItem(
              item,
              argumentsOverride
            );
            if (!toolCall) {
              return;
            }

            hasToolCall = true;
            completedToolCallIds.add(toolCall.id);
            enqueueChatChunk({
              id:
                item?.call_id ||
                item?.id ||
                item?.tool_call_id ||
                "chatcmpl-" + Date.now(),
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: dataModel(item),
              choices: [
                {
                  index,
                  delta: {
                    role: "assistant",
                    tool_calls: [
                      {
                        index: 0,
                        id: toolCall.id,
                        function: {
                          name: toolCall.function.name,
                          arguments: toolCall.function.arguments,
                        },
                        type: "function",
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            });
          };

          const rememberPendingToolCall = (item: any) => {
            const pending = {
              ...item,
              arguments:
                typeof item?.arguments === "string" ? item.arguments : "",
            };
            for (const id of [
              item?.call_id,
              item?.id,
              item?.tool_call_id,
              item?.item_id,
            ]) {
              if (typeof id === "string" && id.length > 0) {
                pendingToolCalls.set(id, pending);
              }
            }
          };

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                if (!isStreamEnded) {
                  // 发送结束标记
                  const doneChunk = `data: [DONE]\n\n`;
                  controller.enqueue(encoder.encode(doneChunk));
                }
                break;
              }

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;

              // 处理缓冲区中完整的数据行
              let lines = buffer.split(/\r?\n/);
              buffer = lines.pop() || ""; // 最后一行可能不完整，保留在缓冲区

              for (const line of lines) {
                if (!line.trim()) continue;

                try {
                  if (line.startsWith("event: ")) {
                    // 处理事件行，暂存以便与下一行数据配对
                    pendingEventType = line.slice(7).trim();
                    continue;
                  } else if (line.startsWith("data: ")) {
                    const dataStr = line.slice(5).trim(); // 移除 "data: " 前缀
                    if (dataStr === "[DONE]") {
                      isStreamEnded = true;
                      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                      continue;
                    }

                    try {
                      const data: ResponsesStreamEvent = JSON.parse(dataStr);
                      if (!data.type && pendingEventType) {
                        data.type = pendingEventType;
                      }

                      // 根据不同的事件类型转换为chat格式
                      if (data.type === "response.output_text.delta") {
                        // 将output_text.delta转换为chat格式
                        const chatChunk = {
                          id: data.item_id || "chatcmpl-" + Date.now(),
                          object: "chat.completion.chunk",
                          created: Math.floor(Date.now() / 1000),
                          model: data.response?.model,
                          choices: [
                            {
                              index: getCurrentIndex(data.type),
                              delta: {
                                content: data.delta || "",
                              },
                              finish_reason: null,
                            },
                          ],
                        };

                        controller.enqueue(
                          encoder.encode(
                            `data: ${JSON.stringify(chatChunk)}\n\n`
                          )
                        );
                      } else if (
                        data.type === "response.output_item.added" &&
                        data.item?.type === "function_call"
                      ) {
                        const id =
                          data.item.call_id ||
                          data.item.id ||
                          data.item.tool_call_id ||
                          data.item_id ||
                          `call_${Date.now()}`;
                        rememberPendingToolCall({
                          ...data.item,
                          call_id: data.item.call_id || id,
                          response: data.response,
                        });
                        getCurrentIndex(data.type);
                      } else if (
                        data.type === "response.output_item.added" &&
                        data.item?.type === "message"
                      ) {
                        // 处理message item added事件
                        const contentItems: MessageContent[] = [];
                        (data.item.content || []).forEach((item: any) => {
                          if (item.type === "output_text") {
                            contentItems.push({
                              type: "text",
                              text: item.text || "",
                            });
                          }
                        });

                        const delta: any = { role: "assistant" };
                        if (
                          contentItems.length === 1 &&
                          contentItems[0].type === "text"
                        ) {
                          delta.content = contentItems[0].text;
                        } else if (contentItems.length > 0) {
                          delta.content = contentItems;
                        }
                        if (delta.content) {
                          const messageChunk = {
                            id: data.item.id || "chatcmpl-" + Date.now(),
                            object: "chat.completion.chunk",
                            created: Math.floor(Date.now() / 1000),
                            model: data.response?.model,
                            choices: [
                              {
                                index: getCurrentIndex(data.type),
                                delta,
                                finish_reason: null,
                              },
                            ],
                          };

                          controller.enqueue(
                            encoder.encode(
                              `data: ${JSON.stringify(messageChunk)}\n\n`
                            )
                          );
                        }
                      } else if (
                        data.type === "response.output_text.annotation.added"
                      ) {
                        const annotationChunk = {
                          id: data.item_id || "chatcmpl-" + Date.now(),
                          object: "chat.completion.chunk",
                          created: Math.floor(Date.now() / 1000),
                          model: data.response?.model || "gpt-5-codex",
                          choices: [
                            {
                              index: getCurrentIndex(data.type),
                              delta: {
                                annotations: [
                                  {
                                    type: "url_citation",
                                    url_citation: {
                                      url: data.annotation?.url || "",
                                      title: data.annotation?.title || "",
                                      content: "",
                                      start_index:
                                        data.annotation?.start_index || 0,
                                      end_index:
                                        data.annotation?.end_index || 0,
                                    },
                                  },
                                ],
                              },
                              finish_reason: null,
                            },
                          ],
                        };

                        controller.enqueue(
                          encoder.encode(
                            `data: ${JSON.stringify(annotationChunk)}\n\n`
                          )
                        );
                      } else if (
                        data.type === "response.function_call_arguments.delta"
                      ) {
                        const id = data.item_id || data.output_index?.toString() || "call_unknown";
                        const existing = pendingToolCalls.get(id) || {
                          call_id: id,
                          arguments: "",
                          response: data.response,
                        };
                        existing.arguments = `${existing.arguments || ""}${
                          typeof data.delta === "string" ? data.delta : ""
                        }`;
                        existing.response = existing.response || data.response;
                        pendingToolCalls.set(id, existing);
                        getCurrentIndex(data.type);
                      } else if (
                        data.type === "response.output_item.done" &&
                        (data.item?.type === "function_call" ||
                          data.item?.type === "tool_call" ||
                          data.item?.type === "custom_tool_call")
                      ) {
                        const id =
                          data.item.call_id ||
                          data.item.id ||
                          data.item.tool_call_id ||
                          data.item_id ||
                          `call_${Date.now()}`;
                        const pending = pendingToolCalls.get(id);
                        const item = {
                          ...pending,
                          ...data.item,
                          response: data.response || pending?.response,
                        };
                        enqueueToolCallChunk(
                          item,
                          getCurrentIndex("response.output_item.done"),
                          item.arguments
                        );
                        pendingToolCalls.delete(id);
                      } else if (data.type === "response.completed") {
                        const responseOutput = data.response?.output || [];
                        responseOutput
                          .filter((item: any) =>
                            transformer.isFunctionCallOutputItem(item)
                          )
                          .forEach((item: any) => {
                            const id =
                              item.call_id ||
                              item.id ||
                              item.tool_call_id ||
                              `call_${Date.now()}`;
                            if (!completedToolCallIds.has(id)) {
                              enqueueToolCallChunk(
                                { ...item, response: data.response },
                                getCurrentIndex("response.output_item.done"),
                                item.arguments
                              );
                            }
                          });

                        const uniquePendingToolCalls = new Set(
                          pendingToolCalls.values()
                        );
                        for (const item of uniquePendingToolCalls) {
                          const id =
                            item.call_id ||
                            item.id ||
                            item.tool_call_id ||
                            `call_${Date.now()}`;
                          if (!completedToolCallIds.has(id)) {
                            enqueueToolCallChunk(
                              item,
                              getCurrentIndex("response.output_item.done"),
                              item.arguments
                            );
                          }
                        }
                        pendingToolCalls.clear();

                        // 发送结束标记 - 检查是否是tool_calls完成
                        const finishReason = hasToolCall ||
                        responseOutput.some((item: any) =>
                          transformer.isFunctionCallOutputItem(item)
                        )
                          ? "tool_calls"
                          : "stop";

                        const endChunk = {
                          id: data.response?.id || "chatcmpl-" + Date.now(),
                          object: "chat.completion.chunk",
                          created: Math.floor(Date.now() / 1000),
                          model: data.response?.model || "gpt-5-codex-",
                          choices: [
                            {
                              index: 0,
                              delta: {},
                              finish_reason: finishReason,
                            },
                          ],
                        };

                        controller.enqueue(
                          encoder.encode(
                            `data: ${JSON.stringify(endChunk)}\n\n`
                          )
                        );
                        isStreamEnded = true;
                      } else if (
                        data.type === "response.reasoning_summary_text.delta"
                      ) {
                        // 处理推理文本，将其转换为 thinking delta 格式
                        const thinkingChunk = {
                          id: data.item_id || "chatcmpl-" + Date.now(),
                          object: "chat.completion.chunk",
                          created: Math.floor(Date.now() / 1000),
                          model: data.response?.model,
                          choices: [
                            {
                              index: getCurrentIndex(data.type),
                              delta: {
                                thinking: {
                                  content: data.delta || "",
                                },
                              },
                              finish_reason: null,
                            },
                          ],
                        };

                        controller.enqueue(
                          encoder.encode(
                            `data: ${JSON.stringify(thinkingChunk)}\n\n`
                          )
                        );
                      } else if (
                        data.type === "response.reasoning_summary_part.done" &&
                        data.part
                      ) {
                        const thinkingChunk = {
                          id: data.item_id || "chatcmpl-" + Date.now(),
                          object: "chat.completion.chunk",
                          created: Math.floor(Date.now() / 1000),
                          model: data.response?.model,
                          choices: [
                            {
                              index: currentIndex,
                              delta: {
                                thinking: {
                                  signature: data.item_id,
                                },
                              },
                              finish_reason: null,
                            },
                          ],
                        };

                        controller.enqueue(
                          encoder.encode(
                            `data: ${JSON.stringify(thinkingChunk)}\n\n`
                          )
                        );
                      }
                    } catch (e) {
                      // 如果JSON解析失败，传递原始行
                      controller.enqueue(encoder.encode(line + "\n"));
                    }
                  } else {
                    // 传递其他行
                    controller.enqueue(encoder.encode(line + "\n"));
                  }
                } catch (error) {
                  console.error("Error processing line:", line, error);
                  // 如果解析失败，直接传递原始行
                  controller.enqueue(encoder.encode(line + "\n"));
                }
              }
            }

            // 处理缓冲区中剩余的数据
            if (buffer.trim()) {
              controller.enqueue(encoder.encode(buffer + "\n"));
            }

            // 确保流结束时发送结束标记
            if (!isStreamEnded) {
              const doneChunk = `data: [DONE]\n\n`;
              controller.enqueue(encoder.encode(doneChunk));
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
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    return response;
  }

  private normalizeRequestContent(content: any, role: string | undefined) {
    // 克隆内容对象并删除缓存控制字段
    const clone = { ...content };
    delete clone.cache_control;

    if (content.type === "text") {
      return {
        type: role === "assistant" ? "output_text" : "input_text",
        text: content.text,
      };
    }

    if (content.type === "image_url") {
      console.log(content);
      const imagePayload: Record<string, unknown> = {
        type: role === "assistant" ? "output_image" : "input_image",
      };

      if (typeof content.image_url?.url === "string") {
        imagePayload.image_url = content.image_url.url;
      }

      return imagePayload;
    }

    return null;
  }

  private convertResponseToChat(responseData: ResponsesAPIPayload): any {
    // 从output数组中提取不同类型的输出
    const messageOutput = responseData.output?.find(
      (item) => item.type === "message"
    );
    let annotations;
    if (
      messageOutput?.content?.length &&
      messageOutput?.content[0].annotations
    ) {
      annotations = messageOutput.content[0].annotations.map((item) => {
        return {
          type: "url_citation",
          url_citation: {
            url: item.url || "",
            title: item.title || "",
            content: "",
            start_index: item.start_index || 0,
            end_index: item.end_index || 0,
          },
        };
      });
    }

    this.logger.debug({
      data: annotations,
      type: "url_citation",
    });

    let messageContent: string | MessageContent[] | null = null;
    let toolCalls = null;
    let thinking = null;

    // 处理推理内容
    if (messageOutput && messageOutput.reasoning) {
      thinking = {
        content: messageOutput.reasoning,
      };
    }

    if (messageOutput && messageOutput.content) {
      // 分离文本和图片内容
      const textParts: string[] = [];
      const imageParts: MessageContent[] = [];

      messageOutput.content.forEach((item: any) => {
        if (item.type === "output_text" || item.type === "text") {
          textParts.push(this.extractTextValue(item.text));
        } else if (item.type === "output_image") {
          const imageContent = this.buildImageContent({
            url: item.image_url,
            mime_type: item.mime_type,
          });
          if (imageContent) {
            imageParts.push(imageContent);
          }
        } else if (item.type === "output_image_base64") {
          const imageContent = this.buildImageContent({
            b64_json: item.image_base64,
            mime_type: item.mime_type,
          });
          if (imageContent) {
            imageParts.push(imageContent);
          }
        }
      });

      // 构建最终内容
      if (imageParts.length > 0) {
        // 如果有图片，将所有内容组合成数组
        const contentArray: MessageContent[] = [];
        if (textParts.length > 0) {
          contentArray.push({
            type: "text",
            text: textParts.join(""),
          });
        }
        contentArray.push(...imageParts);
        messageContent = contentArray;
      } else {
        // 如果只有文本，返回字符串
        messageContent = textParts.join("");
      }
    }

    toolCalls = (responseData.output || [])
      .filter((item) => this.isFunctionCallOutputItem(item))
      .map((item) => this.buildToolCallFromOutputItem(item))
      .filter((toolCall): toolCall is Record<string, any> => Boolean(toolCall));

    // 构建chat格式的响应
    const chatResponse = {
      id: responseData.id || "chatcmpl-" + Date.now(),
      object: "chat.completion",
      created: responseData.created_at,
      model: responseData.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: messageContent || null,
            tool_calls: toolCalls,
            thinking: thinking,
            annotations: annotations,
          },
          logprobs: null,
          finish_reason: toolCalls ? "tool_calls" : "stop",
        },
      ],
      usage: responseData.usage
        ? {
            prompt_tokens: responseData.usage.input_tokens || 0,
            completion_tokens: responseData.usage.output_tokens || 0,
            total_tokens: responseData.usage.total_tokens || 0,
          }
        : null,
    };

    return chatResponse;
  }

  private buildImageContent(source: {
    url?: string;
    b64_json?: string;
    mime_type?: string;
  }): MessageContent | null {
    if (!source) return null;

    if (source.url || source.b64_json) {
      return {
        type: "image_url",
        image_url: {
          url: source.url || "",
          b64_json: source.b64_json,
        },
        media_type: source.mime_type,
      } as MessageContent;
    }

    return null;
  }

  private isFunctionCallOutputItem(item: any): boolean {
    return (
      item?.type === "function_call" ||
      item?.type === "tool_call" ||
      item?.type === "custom_tool_call"
    );
  }

  private buildToolCallFromOutputItem(
    item: any,
    argumentsOverride?: unknown
  ): Record<string, any> | null {
    if (!this.isFunctionCallOutputItem(item)) {
      return null;
    }

    const name = typeof item.name === "string" ? item.name : "";
    const id =
      item.call_id ||
      item.id ||
      item.tool_call_id ||
      `call_${Date.now()}`;
    const rawArguments =
      argumentsOverride !== undefined ? argumentsOverride : item.arguments;
    const parsedInput = this.parseToolArguments(rawArguments);
    const sanitizedInput = sanitizeToolInput(name, parsedInput);

    return {
      id,
      function: {
        name,
        arguments: JSON.stringify(sanitizedInput || {}),
      },
      type: "function",
    };
  }

  private parseToolArguments(rawArguments: unknown): unknown {
    if (rawArguments === undefined || rawArguments === null) {
      return {};
    }

    if (typeof rawArguments === "object") {
      return rawArguments;
    }

    if (typeof rawArguments !== "string") {
      return {};
    }

    const trimmed = rawArguments.trim();
    if (!trimmed) {
      return {};
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return {};
    }
  }

  private extractTextValue(text: unknown): string {
    if (typeof text === "string") {
      return text;
    }
    if (text && typeof text === "object" && typeof (text as any).value === "string") {
      return (text as any).value;
    }
    return "";
  }
}
