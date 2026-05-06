import { UnifiedChatRequest } from "@/types/llm";
import { Transformer, TransformerOptions } from "../types/transformer";
import { createSSEStreamReader } from "../utils/stream";
import {
  appendAssistantResponseDelta,
  buildAssistantResponseMessage,
  createAssistantResponseRecorder,
  hasDeepSeekReasoningContext,
  prepareReasoningReplay,
  recordReasoningResponseMessage,
} from "../utils/deepseek.util";
export class ReasoningTransformer implements Transformer {
  static TransformerName = "reasoning";
  enable: any;

  constructor(private readonly options?: TransformerOptions) {
    this.enable = this.options?.enable ?? true;
  }

  async transformRequestIn(
    request: UnifiedChatRequest,
    provider?: any,
    context?: any
  ): Promise<UnifiedChatRequest> {
    if (!this.enable) {
      request.thinking = {
        type: "disabled",
        budget_tokens: -1,
      };
      request.enable_thinking = false;
      return request;
    }
    if (request.reasoning) {
      request.thinking = {
        type: "enabled",
        budget_tokens: request.reasoning.max_tokens,
      };
      request.enable_thinking = true;
    }

    prepareReasoningReplay(request, provider, context);
    return request;
  }

  async transformResponseOut(response: Response, context?: any): Promise<Response> {
    if (!this.enable) return response;
    const shouldRecordDeepSeekReasoning = hasDeepSeekReasoningContext(context);
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse = await response.json();
      if (jsonResponse.choices[0]?.message.reasoning_content) {
        jsonResponse.thinking = {
          content: jsonResponse.choices[0]?.message.reasoning_content
        }
      }
      if (shouldRecordDeepSeekReasoning) {
        recordReasoningResponseMessage(
          {
            role: "assistant",
            content: jsonResponse.choices?.[0]?.message?.content ?? null,
            tool_calls: jsonResponse.choices?.[0]?.message?.tool_calls,
            reasoning_content: jsonResponse.choices?.[0]?.message?.reasoning_content,
          },
          context
        );
      }
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

      const encoder = new TextEncoder();
      let reasoningContent = "";
      let isReasoningComplete = false;
      const recorder = shouldRecordDeepSeekReasoning
        ? createAssistantResponseRecorder()
        : null;

      const processLine = (
        line: string,
        ctx: { controller: ReadableStreamDefaultController; encoder: TextEncoder }
      ) => {
        const { controller, encoder } = ctx;

        if (line.startsWith("data: ") && line.trim() !== "data: [DONE]") {
          try {
            const data = JSON.parse(line.slice(6));
            const delta = data.choices?.[0]?.delta;

            if (!delta) {
              controller.enqueue(encoder.encode(line + "\n"));
              return;
            }

            // Extract reasoning_content from delta
            if (delta.reasoning_content) {
              reasoningContent += typeof delta.reasoning_content === "string" 
                ? delta.reasoning_content 
                : JSON.stringify(delta.reasoning_content);
              if (recorder) {
                appendAssistantResponseDelta(recorder, delta);
              }
                
              const thinkingChunk = {
                ...data,
                choices: [
                  {
                    ...data.choices[0],
                    delta: {
                      ...delta,
                      thinking: {
                        content: delta.reasoning_content,
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

            if (recorder) {
              appendAssistantResponseDelta(recorder, delta);
            }

            // Check if reasoning is complete (when delta has content but no reasoning_content)
            if (
              (delta.content || delta.tool_calls) &&
              reasoningContent &&
              !isReasoningComplete
            ) {
              isReasoningComplete = true;
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
                        content: reasoningContent,
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

            if (delta.reasoning_content) {
              delete data.choices[0].delta.reasoning_content;
            }

            // Send the modified chunk
            if (
              data.choices?.[0]?.delta &&
              Object.keys(data.choices[0].delta).length > 0
            ) {
              if (isReasoningComplete) {
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

      return createSSEStreamReader(response, processLine, {
        onComplete: () => {
          if (!recorder) return;
          recordReasoningResponseMessage(buildAssistantResponseMessage(recorder), context);
        },
      });
    }

    return response;
  }
}
