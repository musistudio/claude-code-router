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
      // Streaming mode: Pass through transparently to avoid deadlocks in large context/skill scenarios.
      // AnthropicTransformer already handles stream stability, heartbeats, and tool mapping.
      return response;
    }

    return response;
  }
}
