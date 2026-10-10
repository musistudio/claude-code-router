import { Transform, type Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

type ParsedSseEvent = {
  data?: unknown;
  event?: string;
  raw?: string;
};

type UsageInjectionProtocol = "anthropic_messages" | "openai_responses" | "openai_chat_completions";

/**
 * Injects or supplements token usage information into streaming responses
 * that may not provide it or provide incomplete usage data.
 */
export function createTokenUsageInjectionStream(
  input: Readable,
  requestBody: Buffer | undefined,
  protocol: UsageInjectionProtocol
): Readable {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let estimatedInputTokens = 0;
  let estimatedOutputText = "";
  let hasUsage = false;
  let lastId = "";
  let lastModel = "";
  let lastSystemFingerprint = "";

  if (requestBody) {
    try {
      const parsedBody = JSON.parse(requestBody.toString("utf8"));
      const messages = parsedBody.messages || parsedBody.input || [];
      const system = parsedBody.system || parsedBody.instructions || "";
      const tools = parsedBody.tools || [];
      const inputCharacters = countUnknownCharacters(messages) + countUnknownCharacters(system) + countUnknownCharacters(tools);
      estimatedInputTokens = Math.max(1, Math.ceil(inputCharacters / 4));
    } catch {
      estimatedInputTokens = 0;
    }
  }

  const generateOpenAiChatUsageEvent = (): ParsedSseEvent => {
    const asciiWordsOut = estimatedOutputText.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g)?.length ?? 0;
    const cjkCharsOut = estimatedOutputText.match(/[\u3400-\u9fff]/g)?.length ?? 0;
    const outputTokens = Math.max(1, Math.ceil((asciiWordsOut + cjkCharsOut) * 1.15));
    const inputTokens = estimatedInputTokens || 1;

    const chunk = {
      id: lastId || `chatcmpl-${Math.random().toString(36).substring(7)}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: lastModel || "model",
      ...(lastSystemFingerprint ? { system_fingerprint: lastSystemFingerprint } : {}),
      choices: [],
      usage: {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens
      }
    };

    return {
      raw: `data: ${JSON.stringify(chunk)}`
    };
  };

  return input.pipe(new Transform({
    transform(chunk, _encoding, callback) {
      const text = decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      pending += text;

      const parts = pending.split(/\r?\n\r?\n/);
      pending = parts.pop() ?? "";

      for (const part of parts) {
        if (protocol === "openai_chat_completions" && part.trim() === "data: [DONE]") {
          if (!hasUsage) {
            hasUsage = true;
            this.push(`${serializeSseEvent(generateOpenAiChatUsageEvent())}\n\n`);
          }
        }

        const event = parseSseEventBlock(part);
        if (event.data && typeof event.data === "object") {
          const data = event.data as Record<string, any>;

          if (protocol === "anthropic_messages") {
            if (data.type === "content_block_delta" && data.delta) {
              if (data.delta.type === "text_delta" && typeof data.delta.text === "string") {
                estimatedOutputText += data.delta.text;
              } else if (data.delta.type === "thinking_delta" && typeof data.delta.thinking === "string") {
                estimatedOutputText += data.delta.thinking;
              }
            }

            if (data.type === "message_delta") {
              const usage = data.usage && typeof data.usage === "object" ? data.usage as Record<string, any> : {};
              const inputTokens = usage.input_tokens || estimatedInputTokens || 1;
              const asciiWordsOut = estimatedOutputText.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g)?.length ?? 0;
              const cjkCharsOut = estimatedOutputText.match(/[\u3400-\u9fff]/g)?.length ?? 0;
              const outputTokens = usage.output_tokens || Math.max(1, Math.ceil((asciiWordsOut + cjkCharsOut) * 1.15));

              data.usage = {
                ...usage,
                input_tokens: inputTokens,
                output_tokens: outputTokens
              };
              event.raw = `event: message_delta\ndata: ${JSON.stringify(data)}`;
            }
          } else if (protocol === "openai_responses") {
            if (data.type === "response.content_part.delta" && data.delta) {
              if (typeof data.delta.text === "string") {
                estimatedOutputText += data.delta.text;
              }
              if (typeof data.delta.thinking === "string") {
                estimatedOutputText += data.delta.thinking;
              }
              if (typeof data.delta.reasoning === "string") {
                estimatedOutputText += data.delta.reasoning;
              }
            } else if (data.type === "response.text.delta" && typeof data.value === "string") {
              estimatedOutputText += data.value;
            } else if (data.type === "response.function_call_arguments.delta" && typeof data.delta === "string") {
              estimatedOutputText += data.delta;
            }

            if (data.type === "response.done" && data.response && typeof data.response === "object") {
              const responseObj = data.response as Record<string, any>;
              const usage = responseObj.usage && typeof responseObj.usage === "object" ? responseObj.usage as Record<string, any> : {};
              const inputTokens = usage.prompt_tokens || estimatedInputTokens || 1;
              const asciiWordsOut = estimatedOutputText.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g)?.length ?? 0;
              const cjkCharsOut = estimatedOutputText.match(/[\u3400-\u9fff]/g)?.length ?? 0;
              const outputTokens = usage.completion_tokens || Math.max(1, Math.ceil((asciiWordsOut + cjkCharsOut) * 1.15));

              responseObj.usage = {
                ...usage,
                prompt_tokens: inputTokens,
                completion_tokens: outputTokens,
                total_tokens: inputTokens + outputTokens
              };
              event.raw = `event: response.done\ndata: ${JSON.stringify(data)}`;
            }
          } else if (protocol === "openai_chat_completions") {
            lastId = data.id || lastId;
            lastModel = data.model || lastModel;
            lastSystemFingerprint = data.system_fingerprint || lastSystemFingerprint;

            if (data.choices && Array.isArray(data.choices)) {
              const delta = data.choices[0]?.delta;
              if (delta) {
                if (typeof delta.content === "string") {
                  estimatedOutputText += delta.content;
                }
                if (typeof delta.reasoning_content === "string") {
                  estimatedOutputText += delta.reasoning_content;
                }
                if (typeof delta.reasoning === "string") {
                  estimatedOutputText += delta.reasoning;
                }
                if (Array.isArray(delta.tool_calls)) {
                  for (const tc of delta.tool_calls) {
                    if (tc.function?.arguments) {
                      estimatedOutputText += tc.function.arguments;
                    }
                    if (tc.id) {
                      estimatedOutputText += tc.id;
                    }
                    if (tc.name) {
                      estimatedOutputText += tc.name;
                    }
                  }
                }
              }
            }

            if (data.usage) {
              hasUsage = true;
            }
          }
        }
        this.push(`${serializeSseEvent(event)}\n\n`);
      }
      callback();
    },
    flush(callback) {
      pending += decoder.end();
      if (pending.trim()) {
        const parts = pending.split(/\r?\n\r?\n/);
        for (const part of parts) {
          if (protocol === "openai_chat_completions" && part.trim() === "data: [DONE]") {
            if (!hasUsage) {
              hasUsage = true;
              this.push(`${serializeSseEvent(generateOpenAiChatUsageEvent())}\n\n`);
            }
          }

          const event = parseSseEventBlock(part);
          if (event.data && typeof event.data === "object") {
            const data = event.data as Record<string, any>;
            if (protocol === "anthropic_messages") {
              if (data.type === "message_delta") {
                const usage = data.usage && typeof data.usage === "object" ? data.usage as Record<string, any> : {};
                const inputTokens = usage.input_tokens || estimatedInputTokens || 1;
                const asciiWordsOut = estimatedOutputText.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g)?.length ?? 0;
                const cjkCharsOut = estimatedOutputText.match(/[\u3400-\u9fff]/g)?.length ?? 0;
                const outputTokens = usage.output_tokens || Math.max(1, Math.ceil((asciiWordsOut + cjkCharsOut) * 1.15));

                data.usage = {
                  ...usage,
                  input_tokens: inputTokens,
                  output_tokens: outputTokens
                };
                event.raw = `event: message_delta\ndata: ${JSON.stringify(data)}`;
              }
            } else if (protocol === "openai_chat_completions") {
              if (data.usage) {
                hasUsage = true;
              }
            }
          }
          this.push(`${serializeSseEvent(event)}\n\n`);
        }
      }
      callback();
    }
  }));
}

function countUnknownCharacters(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === "string") {
    return value.length;
  }
  try {
    return JSON.stringify(value)?.length || 0;
  } catch {
    return String(value).length;
  }
}

function parseSseEventBlock(raw: string): ParsedSseEvent {
  const lines = raw.split(/\r?\n/g);
  const event = lines
    .filter((line) => line.startsWith("event:"))
    .map((line) => line.slice(6).trim())
    .find(Boolean);
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  if (!data || data === "[DONE]") {
    return { event, raw };
  }
  try {
    return { data: JSON.parse(data) as unknown, event, raw };
  } catch {
    return { event, raw };
  }
}

function serializeSseEvent(event: ParsedSseEvent): string {
  if (event.data === undefined) {
    return event.raw ?? "";
  }
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  const stringValue = (value: unknown): string | undefined =>
    typeof value === "string" && value ? value : undefined;
  const type = isRecord(event.data) ? stringValue(event.data.type) : undefined;
  return [
    event.event || type ? `event: ${event.event || type}` : undefined,
    `data: ${JSON.stringify(event.data)}`
  ].filter(Boolean).join("\n");
}
