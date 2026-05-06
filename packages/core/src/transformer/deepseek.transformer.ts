import { UnifiedChatRequest } from "../types/llm";
import { Transformer } from "../types/transformer";
import { createSSEStreamReader, StreamContext, encodeSSEData, encodeSSELine } from "../utils/stream";
import {
  ReasoningAccumulator,
  createReasoningAccumulator,
  accumulateReasoning,
  finalizeReasoning,
  buildThinkingChunk,
  extractReasoningText,
  cleanReasoningFields,
} from "../utils/thinking";
import {
  appendAssistantResponseDelta,
  buildAssistantResponseMessage,
  createAssistantResponseRecorder,
  hasDeepSeekReasoningContext,
  prepareReasoningReplay,
  recordReasoningResponseMessage,
} from "../utils/deepseek.util";

export class DeepseekTransformer implements Transformer {
  name = "deepseek";

  async transformRequestIn(
    request: UnifiedChatRequest,
    provider?: any,
    context?: any
  ): Promise<UnifiedChatRequest> {
    if (request.max_tokens && request.max_tokens > 8192) {
      request.max_tokens = 8192;
    }
    prepareReasoningReplay(request, provider, context);
    return request;
  }

  async transformResponseOut(response: Response, context?: any): Promise<Response> {
    const shouldRecordDeepSeekReasoning = hasDeepSeekReasoningContext(context);
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse = await response.json();
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
      return new Response(JSON.stringify(jsonResponse), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } else if (response.headers.get("Content-Type")?.includes("stream")) {
      if (!response.body) return response;

      const accumulator = createReasoningAccumulator();
      const recorder = shouldRecordDeepSeekReasoning
        ? createAssistantResponseRecorder()
        : null;

      return createSSEStreamReader(response, (line: string, ctx: StreamContext) => {
        if (!line.trim()) {
          ctx.controller.enqueue(encodeSSELine(line, ctx.encoder));
          return;
        }

        if (!line.startsWith("data:") || line.trim() === "data: [DONE]") {
          ctx.controller.enqueue(encodeSSELine(line, ctx.encoder));
          return;
        }

        try {
          const rawDataStr = line.slice(5).trim();
          const data = JSON.parse(rawDataStr);

          const delta = data.choices?.[0]?.delta;
          if (!delta) {
            ctx.controller.enqueue(encodeSSELine(line, ctx.encoder));
            return;
          }

          const reasoningText = extractReasoningText(delta);

          if (reasoningText) {
            if (recorder) {
              appendAssistantResponseDelta(recorder, delta);
            }
            accumulateReasoning(accumulator, reasoningText);
            const thinkingChunk = buildThinkingChunk(data, {
              content: reasoningText,
            });
            cleanReasoningFields(thinkingChunk.choices[0].delta);
            ctx.controller.enqueue(encodeSSEData(JSON.stringify(thinkingChunk), ctx.encoder));
            return;
          }

          if (recorder) {
            appendAssistantResponseDelta(recorder, delta);
          }

          if (
            delta.content &&
            accumulator.hasContent &&
            !accumulator.isComplete
          ) {
            const { content, signature } = finalizeReasoning(accumulator);
            const thinkingChunk = buildThinkingChunk(data, {
              content,
              signature,
            });
            cleanReasoningFields(thinkingChunk.choices[0].delta);
            thinkingChunk.choices[0].delta.content = null;
            ctx.controller.enqueue(encodeSSEData(JSON.stringify(thinkingChunk), ctx.encoder));
          }

          if (delta.reasoning_content) {
            delete delta.reasoning_content;
          }

          if (
            data.choices?.[0]?.delta &&
            Object.keys(data.choices[0].delta).length > 0
          ) {
            if (accumulator.isComplete) {
              data.choices[0].index++;
            }
            ctx.controller.enqueue(encodeSSEData(JSON.stringify(data), ctx.encoder));
          }
        } catch {
          ctx.controller.enqueue(encodeSSELine(line, ctx.encoder));
        }
      }, {
        onComplete: () => {
          if (!recorder) return;
          recordReasoningResponseMessage(buildAssistantResponseMessage(recorder), context);
        },
      });
    }

    return response;
  }
}
