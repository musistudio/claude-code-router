import { UnifiedChatRequest } from "@/types/llm";
import { Transformer, TransformerOptions } from "../types/transformer";

// Bifrost normalizes vLLM/Anthropic reasoning into delta.reasoning_details[] (array of objects).
// vLLM with --reasoning-parser also emits a flat delta.reasoning (string). Older
// OpenAI-compatible servers used delta.reasoning_content (string). When `handleReasoningDetails`
// is enabled, drain all three shapes and DELETE the consumed fields in place so downstream
// consumers (e.g. Fastify reply.send) only see the rendered thinking block, never raw
// object-arrays they can't serialize.
function extractReasoningFromDelta(delta: any): { text: string; signature: string | null } {
  let text = "";
  let signature: string | null = null;
  if (delta && typeof delta === "object") {
    if (typeof delta.reasoning_content === "string") {
      text += delta.reasoning_content;
      delete delta.reasoning_content;
    }
    if (typeof delta.reasoning === "string") {
      text += delta.reasoning;
      delete delta.reasoning;
    }
    if (Array.isArray(delta.reasoning_details)) {
      for (const item of delta.reasoning_details) {
        if (item && typeof item === "object") {
          if (typeof item.text === "string") text += item.text;
          if (typeof item.signature === "string") signature = item.signature;
        }
      }
      delete delta.reasoning_details;
    }
  }
  return { text, signature };
}

function extractReasoningFromMessage(message: any): { text: string; signature: string | null } {
  let text = "";
  let signature: string | null = null;
  if (message && typeof message === "object") {
    if (typeof message.reasoning_content === "string") {
      text += message.reasoning_content;
    }
    if (typeof message.reasoning === "string") {
      text += message.reasoning;
    }
    if (Array.isArray(message.reasoning_details)) {
      for (const item of message.reasoning_details) {
        if (item && typeof item === "object") {
          if (typeof item.text === "string") text += item.text;
          if (typeof item.signature === "string") signature = item.signature;
        }
      }
    }
  }
  return { text, signature };
}

export class ReasoningTransformer implements Transformer {
  static TransformerName = "reasoning";
  enable: any;
  handleReasoningDetails: boolean;

  constructor(private readonly options?: TransformerOptions) {
    this.enable = this.options?.enable ?? true;
    // Opt-in: when true, the transformer drains delta.reasoning + delta.reasoning_details[]
    // (in addition to delta.reasoning_content) and produces a thinking block. When false
    // (default), behaviour is unchanged. Default off so this is a purely additive change
    // for existing config.
    this.handleReasoningDetails =
      (this.options as any)?.handleReasoningDetails ?? false;
  }

  async transformRequestIn(
    request: UnifiedChatRequest
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
    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    if (!this.enable) return response;
    const handleDetails = this.handleReasoningDetails;
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse = await response.json();
      if (handleDetails) {
        const msg = jsonResponse.choices?.[0]?.message;
        const { text: reasoningText, signature } = extractReasoningFromMessage(msg);
        if (msg) {
          // Strip raw fields so downstream consumers don't see object-arrays.
          delete msg.reasoning_content;
          delete msg.reasoning;
          delete msg.reasoning_details;
          if (reasoningText) {
            jsonResponse.thinking = signature
              ? { content: reasoningText, signature }
              : { content: reasoningText };
          }
        }
      } else if (jsonResponse.choices[0]?.message.reasoning_content) {
        // Original behaviour: only handle reasoning_content (string).
        jsonResponse.thinking = {
          content: jsonResponse.choices[0]?.message.reasoning_content,
        };
      }
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
      let reasoningSignature: string | null = null;
      let isReasoningComplete = false;
      let buffer = ""; // Buffer for incomplete data

      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader();

          // Process buffer function
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

          // Process line function
          const processLine = (
            line: string,
            context: {
              controller: ReadableStreamDefaultController;
              encoder: typeof TextEncoder;
              reasoningContent: () => string;
              appendReasoningContent: (content: string) => void;
              reasoningSignature: () => string | null;
              setReasoningSignature: (sig: string | null) => void;
              isReasoningComplete: () => boolean;
              setReasoningComplete: (val: boolean) => void;
            }
          ) => {
            const { controller, encoder } = context;

            this.logger?.debug({ line }, `Processing reason line`);

            if (line.startsWith("data: ") && line.trim() !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                console.log(JSON.stringify(data));

                if (handleDetails) {
                  // Drain reasoning text from any of the three delta shapes:
                  //   delta.reasoning_content (string, legacy)
                  //   delta.reasoning (string, vLLM --reasoning-parser raw)
                  //   delta.reasoning_details (array, Bifrost-normalized)
                  // The helper DELETES the consumed fields from delta in-place, so the
                  // forwarded chunk never carries an object-array a downstream like
                  // Fastify reply.send() can't serialize.
                  const { text: chunkReasoning, signature: chunkSignature } =
                    extractReasoningFromDelta(data.choices?.[0]?.delta);
                  if (chunkReasoning) {
                    context.appendReasoningContent(chunkReasoning);
                    if (chunkSignature) context.setReasoningSignature(chunkSignature);
                    const thinkingChunk = {
                      ...data,
                      choices: [
                        {
                          ...data.choices[0],
                          delta: {
                            ...data.choices[0].delta,
                            thinking: {
                              content: chunkReasoning,
                            },
                          },
                        },
                      ],
                    };
                    const thinkingLine = `data: ${JSON.stringify(
                      thinkingChunk
                    )}\n\n`;
                    controller.enqueue(encoder.encode(thinkingLine));
                    return;
                  }
                } else {
                  // Original behaviour: only handle reasoning_content (string).
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
                }

                // Check if reasoning is complete (when delta has content but no reasoning_content)
                if (
                  (data.choices?.[0]?.delta?.content ||
                    data.choices?.[0]?.delta?.tool_calls) &&
                  context.reasoningContent() &&
                  !context.isReasoningComplete()
                ) {
                  context.setReasoningComplete(true);
                  // Prefer the upstream-supplied signature (from reasoning_details)
                  // over a fabricated timestamp; fall back to Date.now() if missing.
                  const signature =
                    context.reasoningSignature() ?? Date.now().toString();

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

                if (data.choices?.[0]?.delta?.reasoning_content) {
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
                // Process remaining data in buffer
                if (buffer.trim()) {
                  processBuffer(buffer, controller, encoder);
                }
                break;
              }

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;

              // Process complete lines from buffer
              const lines = buffer.split("\n");
              buffer = lines.pop() || ""; // Keep incomplete line in buffer

              for (const line of lines) {
                if (!line.trim()) continue;

                try {
                  processLine(line, {
                    controller,
                    encoder: encoder,
                    reasoningContent: () => reasoningContent,
                    appendReasoningContent: (content) =>
                      (reasoningContent += content),
                    reasoningSignature: () => reasoningSignature,
                    setReasoningSignature: (sig) => (reasoningSignature = sig),
                    isReasoningComplete: () => isReasoningComplete,
                    setReasoningComplete: (val) => (isReasoningComplete = val),
                  });
                } catch (error) {
                  console.error("Error processing line:", line, error);
                  // Pass through original line if parsing fails
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
