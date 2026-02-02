import { UnifiedChatRequest, UnifiedMessage, UnifiedTool } from "@/types/llm";
import { Transformer, TransformerContext } from "@/types/transformer";

export class OpenAITransformer implements Transformer {
  name = "OpenAI";
  endPoint = "/v1/chat/completions";
  logger?: any;

  /**
   * 将外部OpenAI格式的请求转换为内部统一格式
   *
   * 功能：
   * 1. 接收外部系统发送的OpenAI格式的请求
   * 2. 将其转换为系统内部使用的UnifiedChatRequest格式
   * 3. 处理系统消息、用户消息、助手消息和工具消息
   * 4. 处理消息中的文本内容和多媒体内容
   * 5. 处理工具调用相关的信息
   *
   * @param request 外部OpenAI格式的请求对象
   * @param context 转换上下文
   * @returns 转换后的内部统一格式请求
   */
  async transformRequestOut(request: any): Promise<UnifiedChatRequest> {
    this.logger?.debug(
      `[OpenAITransformer] transformRequestOut: model=${request.model}, messagesCount=${request.messages?.length}, system=${!!request.system}`,
    );

    const messages: UnifiedMessage[] = [];

    // 处理系统消息
    if (request.system) {
      if (typeof request.system === "string") {
        // 处理字符串类型的系统消息
        messages.push({
          role: "system",
          content: request.system,
        });
      } else if (Array.isArray(request.system) && request.system.length) {
        // 处理数组类型的系统消息，提取文本部分
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

    // 处理常规消息
    const requestMessages = JSON.parse(JSON.stringify(request.messages || []));

    requestMessages?.forEach((msg: any) => {
      if (
        msg.role === "user" ||
        msg.role === "assistant" ||
        msg.role === "tool"
      ) {
        if (typeof msg.content === "string") {
          // 处理字符串类型的消息内容
          messages.push({
            role: msg.role,
            content: msg.content,
          });
          return;
        }

        if (Array.isArray(msg.content)) {
          if (msg.role === "user") {
            // 处理用户消息中的文本和媒体内容
            const textAndMediaParts = msg.content.filter(
              (c: any) =>
                (c.type === "text" && c.text) ||
                (c.type === "image_url" && c.image_url),
            );
            if (textAndMediaParts.length) {
              messages.push({
                role: "user",
                content: textAndMediaParts,
              });
            }
          } else if (msg.role === "assistant") {
            // 处理助手消息
            const assistantMessage: UnifiedMessage = {
              role: "assistant",
              content: "",
            };

            // 提取助手消息中的文本部分
            const textParts = msg.content.filter(
              (c: any) => c.type === "text" && c.text,
            );
            if (textParts.length) {
              assistantMessage.content = textParts
                .map((text: any) => text.text)
                .join("\n");
            }

            // 提取助手消息中的工具调用部分
            const toolCallParts = msg.content.filter(
              (c: any) => c.type === "tool_calls" && c.tool_calls,
            );
            if (toolCallParts.length) {
              assistantMessage.tool_calls = toolCallParts.flatMap((part: any) =>
                part.tool_calls.map((tool: any) => ({
                  id: tool.id,
                  type: "function" as const,
                  function: {
                    name: tool.function.name,
                    arguments: JSON.stringify(tool.function.arguments || {}),
                  },
                })),
              );
            }

            messages.push(assistantMessage);
          } else if (msg.role === "tool") {
            // 处理工具消息
            const toolMessage: UnifiedMessage = {
              role: "tool",
              content:
                typeof msg.content === "string"
                  ? msg.content
                  : JSON.stringify(msg.content),
              tool_call_id: msg.tool_call_id,
            };
            messages.push(toolMessage);
          }
          return;
        }
      }
    });

    // 构建最终的统一格式请求
    const result: UnifiedChatRequest = {
      messages,
      model: request.model,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      stream: request.stream,
      tools: request.tools?.length
        ? this.convertToolsToUnified(request.tools) // 转换工具定义
        : undefined,
      tool_choice: request.tool_choice,
    };

    this.logger?.debug(
      `[OpenAITransformer] transformRequestOut: messagesCount=${messages.length}, toolsCount=${result.tools?.length || 0}`,
    );
    return result;
  }

  private convertToolsToUnified(tools: any[]): UnifiedTool[] {
    return tools.map((tool) => {
      if (tool.type == "function") {
        return {
          type: "function",
          function: {
            name: tool.function.name,
            description: tool.function.description || "",
            parameters: tool.function.parameters,
          },
        };
      } else
        return {
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description || "",
            parameters: tool.input_schema,
          },
        };
    });
  }
}
