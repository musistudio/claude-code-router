import { MessageContent, TextContent, UnifiedChatRequest } from "@/types/llm";
import { Transformer } from "../types/transformer";
import { v4 as uuidv4 } from "uuid"

export class GroqTransformer implements Transformer {
  name = "groq";

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    request.messages.forEach(msg => {
      if (Array.isArray(msg.content)) {
        (msg.content as MessageContent[]).forEach((item) => {
          if ((item as TextContent).cache_control) {
            delete (item as TextContent).cache_control;
          }
        });
      } else if (msg.cache_control) {
        delete msg.cache_control;
      }
    })
    if (Array.isArray(request.tools)) {
      request.tools.forEach(tool => {
        delete tool.function.parameters.$schema;
      })
    }
    return request
  }

  async transformResponseOut(response: Response): Promise<Response> {
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse = await response.json();
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

      let hasTextContent = false;
      let reasoningContent = "";
      let isReasoningComplete = false;
      let buffer = ""; // 用于缓冲不完整的数据

      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader();
          const processBuffer = (buffer: string, controller: ReadableStreamDefaultController, encoder: InstanceType<typeof TextEncoder>) => {
            const lines = buffer.split("\n");
            for (const line of lines) {
              if (line.trim()) {
                controller.enqueue(encoder.encode(line + "\n"));
              }
            }
          };

          const processLine = (line: string, context: {
            controller: ReadableStreamDefaultController;
            encoder: typeof TextEncoder;
            hasTextContent: () => boolean;
            setHasTextContent: (val: boolean) => void;
            reasoningContent: () => string;
            appendReasoningContent: (content: string) => void;
            isReasoningComplete: () => boolean;
            setReasoningComplete: (val: boolean) => void;
          }) => {
            const { controller, encoder } = context;

            if (line.startsWith("data: ") && line.trim() !== "data: [DONE]") {
              const jsonStr = line.slice(6);
              try {
                const data = JSON.parse(jsonStr);
                if (data.error) {
                  throw new Error(JSON.stringify(data));
                }

                if (data.choices?.[0]?.delta?.content && !context.hasTextContent()) {
                  context.setHasTextContent(true);
                }

                if (
                  data.choices?.[0]?.delta?.tool_calls?.length
                ) {
                  data.choices?.[0]?.delta?.tool_calls.forEach((tool: any) => {
                    tool.id = `call_${uuidv4()}`;
                  })
                }

                if (
                  data.choices?.[0]?.delta?.tool_calls?.length &&
                  context.hasTextContent()
                ) {
                  if (typeof data.choices[0].index === 'number') {
                    data.choices[0].index += 1;
                  } else {
                    data.choices[0].index = 1;
                  }
                }

                const modifiedLine = `data: ${JSON.stringify(data)}\n\n`;
                controller.enqueue(encoder.encode(modifiedLine));
              } catch (e) {
                // 如果JSON解析失败，可能是数据不完整，将原始行传递下去
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
                // 处理缓冲区中剩余的数据
                if (buffer.trim()) {
                  processBuffer(buffer, controller, encoder);
                }
                break;
              }

              // 检查value是否有效
              if (!value || value.length === 0) {
                continue;
              }

              let chunk;
              try {
                chunk = decoder.decode(value, { stream: true });
              } catch (decodeError) {
                console.warn("Failed to decode chunk", decodeError);
                continue;
              }

              if (chunk.length === 0) {
                continue;
              }

              buffer += chunk;

              // 如果缓冲区过大，进行处理避免内存泄漏
              if (buffer.length > 1000000) { // 1MB 限制
                console.warn("Buffer size exceeds limit, processing partial data");
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  if (line.trim()) {
                    try {
                      processLine(line, {
                        controller,
                        encoder,
                        hasTextContent: () => hasTextContent,
                        setHasTextContent: (val) => hasTextContent = val,
                        reasoningContent: () => reasoningContent,
                        appendReasoningContent: (content) => reasoningContent += content,
                        isReasoningComplete: () => isReasoningComplete,
                        setReasoningComplete: (val) => isReasoningComplete = val
                      });
                    } catch (error) {
                      console.error("Error processing line:", line, error);
                      // 如果解析失败，直接传递原始行
                      controller.enqueue(encoder.encode(line + "\n"));
                    }
                  }
                }
                continue;
              }

              // 处理缓冲区中完整的数据行
              const lines = buffer.split("\n");
              buffer = lines.pop() || ""; // 最后一行可能不完整，保留在缓冲区

              for (const line of lines) {
                if (!line.trim()) continue;

                try {
                  processLine(line, {
                    controller,
                    encoder,
                    hasTextContent: () => hasTextContent,
                    setHasTextContent: (val) => hasTextContent = val,
                    reasoningContent: () => reasoningContent,
                    appendReasoningContent: (content) => reasoningContent += content,
                    isReasoningComplete: () => isReasoningComplete,
                    setReasoningComplete: (val) => isReasoningComplete = val
                  });
                } catch (error) {
                  console.error("Error processing line:", line, error);
                  // 如果解析失败，直接传递原始行
                  controller.enqueue(encoder.encode(line + "\n"));
                }
              }
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
        },
      });
    }

    return response;
  }
}