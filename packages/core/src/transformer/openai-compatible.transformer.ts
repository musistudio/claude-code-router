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
import { FastifyBaseLogger } from "fastify";
import { createApiError } from "@/api/middleware";

export class OpenAICompatibleTransformer implements Transformer {
  name = "OpenAICompatible";
  // 不设置 endPoint，避免与 OpenAITransformer (/v1/chat/completions) 路由冲突
  // OpenAICompatibleTransformer 只作为 provider transformer 使用，不注册独立路由
  endPoint?: string;
  private useBearer: boolean;
  logger?: any;

  constructor(private readonly options?: TransformerOptions) {
    this.useBearer = this.options?.UseBearer ?? true;
  }

  async auth(request: any, provider: LLMProvider): Promise<any> {
    this.logger?.debug(`[OpenAICompatible] auth: provider=${provider.name}, useBearer=${this.useBearer}`);

    const headers: Record<string, string | undefined> = {};

    if (this.useBearer) {
      headers["authorization"] = `Bearer ${provider.apiKey.substring(0, 10)}...`;
    }

    return {
      body: request,
      config: {
        headers,
      },
    };
  }


  /**
   * 将内部统一格式的请求转换为外部OpenAI格式
   * 
   * 功能：
   * 1. 接收系统内部使用的UnifiedChatRequest格式请求
   * 2. 将其转换为外部OpenAI兼容的格式
   * 3. 处理消息格式转换
   * 4. 处理工具定义转换
   * 5. 处理工具选择和推理相关参数
   * 
   * @param request 内部统一格式的请求对象
   * @param provider LLM提供商信息
   * @param context 转换上下文
   * @returns 转换后的OpenAI格式请求
   */
  async transformRequestIn(
    request: UnifiedChatRequest,
    provider: LLMProvider,
    context: TransformerContext
  ): Promise<Record<string, any>> {
    this.logger?.debug(`[OpenAICompatible] transformRequestIn: model=${request.model}, messagesCount=${request.messages?.length}, provider=${provider.name}`);
    this.logger?.debug(`[OpenAICompatible] transformRequestIn: tools=${JSON.stringify(request.tools)}`);

    // 构建基本的OpenAI格式请求
    const openaiRequest: Record<string, any> = {
      model: request.model,
      messages: this.convertMessagesToOpenAI(request.messages), // 转换消息格式
      // max_tokens: request.max_tokens, // 外部OpenAI不支持 max_tokens 参数
      temperature: request.temperature,
      stream: request.stream,
    };

    // 处理工具定义
    if (request.tools && request.tools.length > 0) {
      openaiRequest.tools = this.convertUnifiedToolsToOpenAI(request.tools);
    }

    // 处理工具选择
    if (request.tool_choice) {
      openaiRequest.tool_choice = request.tool_choice;
    }

    // 处理推理相关参数
    // if (!request.reasoning) {
    //   openaiRequest.reasoning = request.reasoning;
    //   openaiRequest.thinking = {
    //     "thinking": {"type": "disabled"}
    //   };
    // }

    this.logger?.debug(`[OpenAICompatible] transformRequestIn: toolsCount=${openaiRequest.tools?.length || 0}`);
    return openaiRequest;
  }

  /**
   * 将外部OpenAI格式的响应转换为内部统一格式
   * 
   * 功能：
   * 1. 接收外部OpenAI兼容API返回的响应
   * 2. 检测响应是否为流式响应
   * 3. 对于流式响应，转换为内部统一的流式格式
   * 4. 对于非流式响应，转换为内部统一的响应格式
   * 5. 保持响应头信息的一致性
   * 
   * @param response 外部OpenAI格式的响应对象
   * @param context 转换上下文
   * @returns 转换后的内部统一格式响应
   */
  async transformResponseIn(
    response: Response,
    context?: TransformerContext
  ): Promise<Response> {
    // 检测是否为流式响应
    const isStream = response.headers
      .get("Content-Type")
      ?.includes("text/event-stream");

    this.logger?.debug(`[OpenAICompatible] transformResponseIn: isStream=${isStream}`);

    if (isStream) {
      // 处理流式响应
      if (!response.body) {
        throw new Error("Stream response body is null");
      }
      // 转换流式响应格式
      const convertedStream = await this.convertOpenAIStreamToUnified(
        response.body,
        context!
      );
      // 返回转换后的流式响应
      return new Response(convertedStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } else {
      // 处理非流式响应
      const data = await response.json();
      this.logger?.debug(`[OpenAICompatible] transformResponseIn: responseId=${data.id}, model=${data.model}`);
      // 转换响应格式
      const unifiedResponse = this.convertOpenAIResponseToUnified(
        data,
        context!
      );
      // 返回转换后的非流式响应
      return new Response(JSON.stringify(unifiedResponse), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  /**
   * 将内部统一格式的响应转换为外部OpenAI格式
   * 
   * 功能：
   * 1. 接收系统内部处理后的统一格式响应
   * 2. 检测响应是否为流式响应
   * 3. 对于流式响应，转换为外部OpenAI兼容的流式格式
   * 4. 对于非流式响应，转换为外部OpenAI兼容的响应格式
   * 5. 保持响应头信息的一致性，确保外部客户端能够正确处理
   * 
   * @param response 内部统一格式的响应对象
   * @param context 转换上下文
   * @returns 转换后的OpenAI格式响应
   */
  async transformResponseOut(
    response: Response,
    context: TransformerContext
  ): Promise<Response> {
    // 检测是否为流式响应
    const isStream = response.headers
      .get("Content-Type")
      ?.includes("text/event-stream");

    this.logger?.debug(`[OpenAICompatible] transformResponseOut: isStream=${isStream}`);

    if (isStream) {
      // 处理流式响应
      if (!response.body) {
        throw new Error("Stream response body is null");
      }
      // 转换流式响应格式为OpenAI兼容格式
      const convertedStream = await this.convertUnifiedStreamToOpenAI(
        response.body,
        context
      );
      // 返回转换后的流式响应
      return new Response(convertedStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    } else {
      // 处理非流式响应
      const data = await response.json();
      this.logger?.debug(`[OpenAICompatible] transformResponseOut: responseId=${data.id}`);
      // 转换响应格式为OpenAI兼容格式
      const openaiResponse = this.convertUnifiedResponseToOpenAI(
        data,
        context
      );
      // 返回转换后的非流式响应
      return new Response(JSON.stringify(openaiResponse), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  private convertUnifiedToolsToOpenAI(tools: UnifiedTool[]): any[] {
    const logger = this.logger;
    return tools.map((tool) => {
      var convertTool: any = {};
      logger?.debug(`[OpenAICompatible] convertUnifiedToolsToOpenAI: tool.type=${tool.type}, tool=${JSON.stringify(tool)}`);
      if ("function" in tool) {
        convertTool = {
          type: tool.type,
          function: {
            name: tool.function.name,
            description: tool.function.description || [],
          },
        };

        // 处理参数，移除 $schema 字段
        if (tool.function.parameters) {
          const parameters = { ...tool.function.parameters };
          // 移除 parameters 中的 $schema 字段
          delete parameters["$schema"];
          // 移除 parameters.properties 中的 $schema 字段
          if (parameters.properties) {
            const properties = { ...parameters.properties };
            delete properties["$schema"];
            parameters.properties = properties;
          }
          convertTool.function.parameters = parameters;
        }
      }
      this.logger?.debug(`[OpenAICompatible] convertUnifiedToolsToOpenAI: convertedTool=${JSON.stringify(convertTool)}`);
      return convertTool;
    });
  }

  private convertMessagesToOpenAI(messages: UnifiedMessage[]): any[] {
    return messages.map((msg) => {
      const openaiMessage: any = {
        role: msg.role,
      };

      if (typeof msg.content === "string") {
        openaiMessage.content = msg.content;
      } else if (Array.isArray(msg.content)) {
        // 移除数组内容中的 cache_control 字段
        openaiMessage.content = msg.content.map((item: any) => {
          const { cache_control, ...rest } = item;
          return rest;
        });
      }

      if (msg.tool_calls) {
        openaiMessage.tool_calls = msg.tool_calls.map((tool) => ({
          id: tool.id,
          type: tool.type,
          function: {
            name: tool.function.name,
            arguments: tool.function.arguments,
          },
        }));
      }

      if (msg.tool_call_id) {
        openaiMessage.tool_call_id = msg.tool_call_id;
      }

      return openaiMessage;
    });
  }

  private async convertOpenAIStreamToUnified(
    openaiStream: ReadableStream,
    context: TransformerContext
  ): Promise<ReadableStream> {
    const readable = new ReadableStream({
      start: async (controller) => {
        const encoder = new TextEncoder();
        let buffer = "";
        let isClosed = false;

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
                throw error;
              }
            }
          }
        };

        const safeClose = () => {
          if (!isClosed) {
            try {
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

          while (true) {
            if (isClosed) {
              break;
            }

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (isClosed) break;

              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();

              if (data === "[DONE]") {
                safeEnqueue(encoder.encode(`data: [DONE]\n\n`));
                continue;
              }

              try {
                const chunk = JSON.parse(data);
                safeEnqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
              } catch (parseError) {
                this.logger?.error(`Parse error: ${parseError}`);
              }
            }
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
    });

    return readable;
  }

  private convertOpenAIResponseToUnified(
    openaiResponse: ChatCompletion,
    context: TransformerContext
  ): any {
    this.logger?.debug(`[OpenAICompatible] convertOpenAIResponseToUnified: id=${openaiResponse.id}, choicesCount=${openaiResponse.choices?.length}`);
    return openaiResponse;
  }

  private async convertUnifiedStreamToOpenAI(
    unifiedStream: ReadableStream,
    context: TransformerContext
  ): Promise<ReadableStream> {
    const readable = new ReadableStream({
      start: async (controller) => {
        const encoder = new TextEncoder();
        let buffer = "";
        let isClosed = false;

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
                throw error;
              }
            }
          }
        };

        const safeClose = () => {
          if (!isClosed) {
            try {
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
          reader = unifiedStream.getReader();
          const decoder = new TextDecoder();

          while (true) {
            if (isClosed) {
              break;
            }

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (isClosed) break;

              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();

              if (data === "[DONE]") {
                safeEnqueue(encoder.encode(`data: [DONE]\n\n`));
                continue;
              }

              try {
                const chunk = JSON.parse(data);
                safeEnqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
              } catch (parseError) {
                this.logger?.error(`Parse error: ${parseError}`);
              }
            }
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
    });

    return readable;
  }

  private convertUnifiedResponseToOpenAI(
    unifiedResponse: any,
    context: TransformerContext
  ): any {
    this.logger?.debug(`[OpenAICompatible] convertUnifiedResponseToOpenAI: id=${unifiedResponse.id}, model=${unifiedResponse.model}`);
    return unifiedResponse;
  }
}
