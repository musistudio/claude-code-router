import { UnifiedChatRequest } from "../types/llm";
import { Transformer } from "../types/transformer";

// Stores reasoning_content captured from past responses so it can be reinjected
// on subsequent requests. DeepSeek V4 thinking mode requires that the
// reasoning_content from any assistant turn that performed tool calls be sent
// back on the assistant message in every subsequent request — otherwise the
// API returns 400 ("The `reasoning_content` in the thinking mode must be passed
// back to the API."). Claude Code does not preserve thinking content across
// turns, so we capture and reinject it ourselves.
//
// Keyed by sorted tool_call IDs joined by "|". Tool-call IDs round-trip
// through Claude Code because tool_result messages reference them.
const REASONING_STORE = new Map<string, string>();
const REASONING_STORE_LIMIT = 1000;

function storeReasoning(key: string, value: string): void {
  if (REASONING_STORE.size >= REASONING_STORE_LIMIT) {
    const firstKey = REASONING_STORE.keys().next().value;
    if (firstKey !== undefined) REASONING_STORE.delete(firstKey);
  }
  REASONING_STORE.set(key, value);
}

function keyFromToolCalls(toolCalls: any): string | null {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null;
  const ids: string[] = toolCalls
    .map((tc: any) => tc && tc.id)
    .filter((id: any): id is string => typeof id === "string" && id.length > 0);
  if (ids.length === 0) return null;
  return ids.slice().sort().join("|");
}

export class DeepseekTransformer implements Transformer {
  name = "deepseek";

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    if (request.max_tokens && request.max_tokens > 8192) {
      request.max_tokens = 8192; // DeepSeek has a max token limit of 8192
    }

    // Reinject reasoning_content for assistant messages that performed tool calls.
    if (request && Array.isArray((request as any).messages)) {
      for (const msg of (request as any).messages) {
        if (!msg || msg.role !== "assistant") continue;
        if (typeof msg.reasoning_content === "string" && msg.reasoning_content) continue;
        const key = keyFromToolCalls(msg.tool_calls);
        if (!key) continue;
        const stored = REASONING_STORE.get(key);
        if (stored) msg.reasoning_content = stored;
      }
    }

    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse = await response.json();
      // Handle non-streaming response if needed
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
      let reasoningContent = "";
      let isReasoningComplete = false;
      let buffer = ""; // 用于缓冲不完整的数据

      // Tool-call IDs emitted by the assistant in this response. Used as the
      // key for storing reasoningContent so a future request that re-includes
      // this assistant turn can have its reasoning_content reinjected.
      const collectedToolCallIds: string[] = [];
      const captureToolCallIds = (data: any) => {
        const tcArr = data?.choices?.[0]?.delta?.tool_calls;
        if (!Array.isArray(tcArr)) return;
        for (const tc of tcArr) {
          if (tc && typeof tc.id === "string" && !collectedToolCallIds.includes(tc.id)) {
            collectedToolCallIds.push(tc.id);
          }
        }
      };

      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader();
          const processBuffer = (
            buffer: string,
            controller: ReadableStreamDefaultController,
            encoder: TextEncoder
          ) => {
            const lines = buffer.split("\n");
            for (const line of lines) {
              if (line.trim()) {
                controller.enqueue(encoder.encode(line + "\n"));
              }
            }
          };

          const processLine = (
            line: string,
            context: {
              controller: ReadableStreamDefaultController;
              encoder: TextEncoder;
              reasoningContent: () => string;
              appendReasoningContent: (content: string) => void;
              isReasoningComplete: () => boolean;
              setReasoningComplete: (val: boolean) => void;
            }
          ) => {
            const { controller, encoder } = context;

            if (
              line.startsWith("data: ") &&
              line.trim() !== "data: [DONE]"
            ) {
              try {
                const data = JSON.parse(line.slice(6));

                captureToolCallIds(data);

                // Extract reasoning_content from delta
                if (data.choices?.[0]?.delta?.reasoning_content) {
                  context.appendReasoningContent(
                    data.choices[0].delta.reasoning_content
                  );
                  const thinkingChunk = {
                    ...data,
                    choices: [
                      {
                        ...data.choices[0],
                        delta: {
                          ...data.choices[0].delta,
                          thinking: {
                            content: data.choices[0].delta.reasoning_content,
                          },
                        },
                      },
                    ],
                  };
                  delete thinkingChunk.choices[0].delta.reasoning_content;
                  const thinkingLine = `data: ${JSON.stringify(
                    thinkingChunk
                  )}\n\n`;
                  controller.enqueue(encoder.encode(thinkingLine));
                  return;
                }

                // Check if reasoning is complete (when delta has content but no reasoning_content)
                if (
                  data.choices?.[0]?.delta?.content &&
                  context.reasoningContent() &&
                  !context.isReasoningComplete()
                ) {
                  context.setReasoningComplete(true);
                  const signature = Date.now().toString();

                  // Create a new chunk with thinking block
                  const thinkingChunk = {
                    ...data,
                    choices: [
                      {
                        ...data.choices[0],
                        delta: {
                          ...data.choices[0].delta,
                          content: null,
                          thinking: {
                            content: context.reasoningContent(),
                            signature: signature,
                          },
                        },
                      },
                    ],
                  };
                  delete thinkingChunk.choices[0].delta.reasoning_content;
                  // Send the thinking chunk
                  const thinkingLine = `data: ${JSON.stringify(
                    thinkingChunk
                  )}\n\n`;
                  controller.enqueue(encoder.encode(thinkingLine));
                }

                if (data.choices[0]?.delta?.reasoning_content) {
                  delete data.choices[0].delta.reasoning_content;
                }

                // Send the modified chunk
                if (
                  data.choices?.[0]?.delta &&
                  Object.keys(data.choices[0].delta).length > 0
                ) {
                  if (context.isReasoningComplete()) {
                    data.choices[0].index++;
                  }
                  const modifiedLine = `data: ${JSON.stringify(data)}\n\n`;
                  controller.enqueue(encoder.encode(modifiedLine));
                }
              } catch (e) {
                // If JSON parsing fails, pass through the original line
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

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;

              // 处理缓冲区中完整的数据行
              const lines = buffer.split("\n");
              buffer = lines.pop() || ""; // 最后一行可能不完整，保留在缓冲区

              for (const line of lines) {
                if (!line.trim()) continue;

                try {
                  processLine(line, {
                    controller,
                    encoder,
                    reasoningContent: () => reasoningContent,
                    appendReasoningContent: (content) =>
                      (reasoningContent += content),
                    isReasoningComplete: () => isReasoningComplete,
                    setReasoningComplete: (val) => (isReasoningComplete = val),
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
            // Persist captured reasoning so future requests that re-send this
            // assistant turn (with tool_calls) can have it reinjected by
            // transformRequestIn. Required by DeepSeek V4 thinking mode.
            if (reasoningContent && collectedToolCallIds.length > 0) {
              const key = collectedToolCallIds.slice().sort().join("|");
              storeReasoning(key, reasoningContent);
            }

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
          "Content-Type": response.headers.get("Content-Type") || "text/plain",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return response;
  }
}
