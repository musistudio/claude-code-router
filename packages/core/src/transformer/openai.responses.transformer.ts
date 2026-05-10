import { UnifiedChatRequest, MessageContent } from "@/types/llm";
import { Transformer } from "@/types/transformer";
import { validateOpenAIToolCalls, injectPromptCaching } from "../utils/openai.util";
import { createSSEStreamReader, StreamContext, encodeSSEData, encodeSSELine } from "../utils/stream";
import { stripCacheControl } from "../utils/cacheControl";

interface ResponsesAPIOutputItem {
  type: string;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: Array<{
    type: string;
    text?: string;
    image_url?: string;
    mime_type?: string;
    image_base64?: string;
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
    name?: string;
    content?: Array<{
      type: string;
      text?: string;
      image_url?: string;
    }>;
    reasoning?: string;
  };
  response?: {
    id?: string;
    model?: string;
    output?: Array<{
      type: string;
    }>;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
    };
  };
  reasoning_summary?: string;
  annotation?: {
    url?: string;
    title?: string;
    start_index?: number;
    end_index?: number;
  };
  part?: any;
}

export class OpenAIResponsesTransformer implements Transformer {
  name = "openai-responses";
  endPoint = "/v1/responses";

  async transformRequestIn(
    request: UnifiedChatRequest
  ): Promise<UnifiedChatRequest> {
    delete request.temperature;
    delete request.max_tokens;

    if (request.reasoning) {
      request.reasoning = {
        effort: request.reasoning.effort,
        // @ts-ignore - summary is specific to this API
        summary: "detailed",
      };
    }

    const model = request.model || "";
    let messages = validateOpenAIToolCalls(request.messages);
    messages = injectPromptCaching(messages, model);
    request.messages = messages;

    const input: any[] = [];
    let lastWasTool = false;


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
        lastWasTool = true;
        return;
      }

      if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
        const hasContent = message.content &&
          (typeof message.content === "string" ||
            (Array.isArray(message.content) && message.content.length > 0));
        lastWasTool = false;
        message.tool_calls.forEach((tool) => {
          input.push({
            type: "function_call",
            arguments: tool.function.arguments,
            name: tool.function.name,
            call_id: tool.id,
          });
        });

        if (hasContent) {
          // Keep the message content in the message object for the Responses API
        }
        return;
      }

      // If a user message follows a tool output, insert a dummy assistant message
      if (lastWasTool && message.role === "user") {
        input.push({
          role: "assistant",
          content: "",
        });
      }
      lastWasTool = false;
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
          if (tool.function.name === "WebSearch") {
            delete tool.function.parameters.properties.allowed_domains;
          }
          if (tool.function.name === "Edit") {
            return {
              type: tool.type,
              name: tool.function.name,
              description: tool.function.description,
              parameters: {
                ...tool.function.parameters,
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
            parameters: tool.function.parameters,
          };
        });

      if (webSearch) {
        (request as any).tools.push({
          type: "web_search",
        });
      }
    }

    request.parallel_tool_calls = false;

    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    const contentType = response.headers.get("Content-Type") || "";

    if (contentType.includes("application/json")) {
      const jsonResponse: any = await response.json();

      if (jsonResponse.object === "response" && jsonResponse.output) {
        const chatResponse = this.convertResponseToChat(jsonResponse);
        return new Response(JSON.stringify(chatResponse), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }

      return new Response(JSON.stringify(jsonResponse), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } else if (contentType.includes("text/event-stream")) {
      if (!response.body) {
        return response;
      }

      let isStreamEnded = false;
      let currentIndex = -1;
      let lastEventType = "";

      const getCurrentIndex = (eventType: string) => {
        if (eventType !== lastEventType) {
          currentIndex++;
          lastEventType = eventType;
        }
        return currentIndex;
      };

      const transformer = this;

      return createSSEStreamReader(
        response,
        (line: string, ctx: StreamContext) => {
          if (!line.trim()) return;

          if (line.startsWith("event: ")) return;

          if (line.startsWith("data: ")) {
            const dataStr = line.slice(5).trim();
            if (dataStr === "[DONE]") {
              isStreamEnded = true;
              ctx.controller.enqueue(encodeSSEData("[DONE]", ctx.encoder));
              return;
            }

            try {
              const data: ResponsesStreamEvent = JSON.parse(dataStr);
              const chunk = transformer.convertStreamEvent(data, getCurrentIndex);
              if (chunk) {
                ctx.controller.enqueue(encodeSSEData(JSON.stringify(chunk), ctx.encoder));
              }
            } catch {
              ctx.controller.enqueue(encodeSSELine(line, ctx.encoder));
            }
          } else {
            ctx.controller.enqueue(encodeSSELine(line, ctx.encoder));
          }
        }
      );
    }

    return response;
  }

  private convertStreamEvent(data: ResponsesStreamEvent, getCurrentIndex: (type: string) => number): any | null {
    if (data.type === "response.output_text.delta") {
      return {
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
    }

    if (data.type === "response.output_item.added" && data.item?.type === "function_call") {
      return {
        id: data.item.call_id || data.item.id || "chatcmpl-" + Date.now(),
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: data.response?.model || "gpt-5-codex-",
        choices: [
          {
            index: getCurrentIndex(data.type),
            delta: {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: data.item.call_id || data.item.id,
                  function: {
                    name: data.item.name || "",
                    arguments: "",
                  },
                  type: "function",
                },
              ],
            },
            finish_reason: null,
          },
        ],
      };
    }

    if (data.type === "response.output_item.added" && data.item?.type === "message") {
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
      if (contentItems.length === 1 && contentItems[0].type === "text") {
        delta.content = contentItems[0].text;
      } else if (contentItems.length > 0) {
        delta.content = contentItems;
      }
      if (delta.content) {
        return {
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
      }
      return null;
    }

    if (data.type === "response.output_text.annotation.added") {
      return {
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
                    start_index: data.annotation?.start_index || 0,
                    end_index: data.annotation?.end_index || 0,
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      };
    }

    if (data.type === "response.function_call_arguments.delta") {
      return {
        id: data.item_id || "chatcmpl-" + Date.now(),
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: data.response?.model || "gpt-5-codex-",
        choices: [
          {
            index: getCurrentIndex(data.type),
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: {
                    arguments: data.delta || "",
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      };
    }

    if (data.type === "response.completed") {
      const finishReason = data.response?.output?.some(
        (item: any) => item.type === "function_call"
      )
        ? "tool_calls"
        : "stop";

      const chunk: any = {
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

      if (data.response?.usage) {
        chunk.usage = {
          prompt_tokens: data.response.usage.input_tokens || 0,
          completion_tokens: data.response.usage.output_tokens || 0,
          total_tokens: data.response.usage.total_tokens || 0,
        };
      }

      return chunk;
    }

    if (data.type === "response.reasoning_summary_text.delta") {
      return {
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
    }

    if (data.type === "response.reasoning_summary_part.done" && data.part) {
      return {
        id: data.item_id || "chatcmpl-" + Date.now(),
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: data.response?.model,
        choices: [
          {
            index: getCurrentIndex(data.type),
            delta: {
              thinking: {
                signature: data.item_id,
              },
            },
            finish_reason: null,
          },
        ],
      };
    }

    return null;
  }

  private normalizeRequestContent(content: any, role: string | undefined) {
    const clone = stripCacheControl(content);

    if (content.type === "text") {
      return {
        type: role === "assistant" ? "output_text" : "input_text",
        text: content.text,
      };
    }

    if (content.type === "image_url") {
      this.logger?.debug(content);
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
    const messageOutput = responseData.output?.find(
      (item) => item.type === "message"
    );
    const functionCallOutput = responseData.output?.find(
      (item) => item.type === "function_call"
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

    if (messageOutput && messageOutput.reasoning) {
      thinking = {
        content: messageOutput.reasoning,
      };
    }

    if (messageOutput && messageOutput.content) {
      const textParts: string[] = [];
      const imageParts: MessageContent[] = [];

      messageOutput.content.forEach((item: any) => {
        if (item.type === "output_text") {
          textParts.push(item.text || "");
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

      if (imageParts.length > 0) {
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
        messageContent = textParts.join("");
      }
    }

    if (functionCallOutput) {
      toolCalls = [
        {
          id: functionCallOutput.call_id || functionCallOutput.id,
          function: {
            name: functionCallOutput.name,
            arguments: functionCallOutput.arguments,
          },
          type: "function",
        },
      ];
    }

    return {
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
}
