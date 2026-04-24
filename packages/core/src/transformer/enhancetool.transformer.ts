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
            const rawArgs = toolCall.function.arguments;
            const repairedArgs = parseToolArguments(rawArgs, this.logger);
            
            // 核心修复：在这里执行针对 Edit 工具的白名单清洗
            // 这解决了由于配置了 enhancetool 导致参数清洗逻辑被绕过的问题
            if (toolCall.function.name === "Edit") {
              try {
                const parsed = JSON.parse(repairedArgs);
                // 仅保留必需字段
                const { file_path, old_string, new_string } = parsed;
                // 注意：allow_multiple 视情况保留，但 instruction 必须剔除
                const finalObj = { file_path, old_string, new_string };
                toolCall.function.arguments = JSON.stringify(finalObj);
              } catch (e) {
                toolCall.function.arguments = repairedArgs;
              }
            } else {
              toolCall.function.arguments = repairedArgs;
            }
          }
        }
      }
      return new Response(JSON.stringify(jsonResponse), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } else if (response.headers.get("Content-Type")?.includes("stream")) {
      // Streaming mode: Pass through transparently to avoid deadlocks in large context/skill scenarios.
      // AnthropicTransformer already handles stream stability, heartbeats, and tool mapping.
      return response;
    }

    return response;
  }
}
