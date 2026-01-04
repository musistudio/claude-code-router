import { UnifiedChatRequest } from "../types/llm";
import { Transformer } from "../types/transformer";

const PROMPT = `Always think before answering. Even if the problem seems simple, always write down your reasoning process explicitly.

Output format:
<reasoning_content>
Your detailed thinking process goes here
</reasoning_content>
Your final answer must follow after the closing tag above.`;

const MAX_INTERLEAVED_TIMES = 10;

export class ForceReasoningTransformer implements Transformer {
  name = "forcereasoning";

  async transformRequestIn(
    request: UnifiedChatRequest
  ): Promise<UnifiedChatRequest> {
    let times = 0
    request.messages
      .filter((msg) => msg.role === "assistant")
      .reverse()
      .forEach((message) => {
        if (message.thinking) {
          if (message.thinking.content) {
            if (!message.content || times < MAX_INTERLEAVED_TIMES) {
              times++;
              message.content = `<reasoning_content>${message.thinking.content}</reasoning_content>\n${message.content}`;
            }
          }
          delete message.thinking;
        }
      });
    const lastMessage = request.messages[request.messages.length - 1];
    if (lastMessage.role === "user") {
      if (Array.isArray(lastMessage.content)) {
        lastMessage.content.push({
          type: "text",
          text: PROMPT,
        });
      } else {
        lastMessage.content = [
          {
            type: "text",
            text: PROMPT,
          },
          {
            type: "text",
            text: lastMessage.content || '',
          },
        ];
      }
    }
    if (lastMessage.role === "tool") {
      request.messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: PROMPT,
          },
        ],
      });
    }
    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    const reasonStartTag = "<reasoning_content>";
    const reasonStopTag = "</reasoning_content>";

    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse: any = await response.json();
      if (jsonResponse.choices[0]?.message.content) {
        const regex = /<reasoning_content>(.*?)<\/reasoning_content>/s;
        const match = jsonResponse.choices[0]?.message.content.match(regex);
        if (match && match[1]) {
          jsonResponse.thinking = {
            content: match[1],
          };
        }
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
      let contentIndex = 0;

      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader();
          let lineBuffer = "";

          let fsmState: "SEARCHING" | "REASONING" | "FINAL" = "SEARCHING";
          let tagBuffer = "";
          let finalBuffer = "";

          const processAndEnqueue = (
            originalData: any,
            content: string | null | undefined
          ) => {
            if (typeof content !== "string") {
              if (
                originalData.choices?.[0]?.delta &&
                Object.keys(originalData.choices[0].delta).length > 0 &&
                !originalData.choices[0].delta.content
              ) {
                originalData.choices[0].index = contentIndex
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(originalData)}\n\n`)
                );
              }
              return;
            }

            let currentContent = tagBuffer + content;
            tagBuffer = "";

            while (currentContent.length > 0) {
              if (fsmState === "SEARCHING") {
                const startTagIndex = currentContent.indexOf(reasonStartTag);
                if (startTagIndex !== -1) {
                  currentContent = currentContent.substring(
                    startTagIndex + reasonStartTag.length
                  );
                  fsmState = "REASONING";
                } else {
                  for (let i = reasonStartTag.length - 1; i > 0; i--) {
                    if (
                      currentContent.endsWith(reasonStartTag.substring(0, i))
                    ) {
                      tagBuffer = currentContent.substring(
                        currentContent.length - i
                      );
                      break;
                    }
                  }
                  currentContent = "";
                }
              } else if (fsmState === "REASONING") {
                const endTagIndex = currentContent.indexOf(reasonStopTag);
                if (endTagIndex !== -1) {
                  const reasoningPart = currentContent.substring(
                    0,
                    endTagIndex
                  );
                  if (reasoningPart.length > 0) {
                    const newDelta = {
                      ...originalData.choices[0].delta,
                      thinking: {
                        content: reasoningPart,
                      },
                    };
                    delete newDelta.content;
                    const thinkingChunk = {
                      ...originalData,
                      choices: [
                        { ...originalData.choices[0], delta: newDelta, index: contentIndex },
                      ],
                    };
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify(thinkingChunk)}\n\n`
                      )
                    );
                  }

                  // Send signature message
                  const signatureDelta = {
                    ...originalData.choices[0].delta,
                    thinking: { signature: new Date().getTime().toString() },
                  };
                  delete signatureDelta.content;
                  const signatureChunk = {
                    ...originalData,
                    choices: [
                      { ...originalData.choices[0], delta: signatureDelta, index: contentIndex },
                    ],
                  };
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify(signatureChunk)}\n\n`
                    )
                  );
                  contentIndex++;

                  currentContent = currentContent.substring(
                    endTagIndex + reasonStopTag.length
                  );
                  fsmState = "FINAL";
                } else {
                  let reasoningPart = currentContent;
                  for (let i = reasonStopTag.length - 1; i > 0; i--) {
                    if (
                      currentContent.endsWith(reasonStopTag.substring(0, i))
                    ) {
                      tagBuffer = currentContent.substring(
                        currentContent.length - i
                      );
                      reasoningPart = currentContent.substring(
                        0,
                        currentContent.length - i
                      );
                      break;
                    }
                  }
                  if (reasoningPart.length > 0) {
                    const newDelta = {
                      ...originalData.choices[0].delta,
                      thinking: { content: reasoningPart },
                    };
                    delete newDelta.content;
                    const thinkingChunk = {
                      ...originalData,
                      choices: [
                        { ...originalData.choices[0], delta: newDelta, index: contentIndex },
                      ],
                    };
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify(thinkingChunk)}\n\n`
                      )
                    );
                  }
                  currentContent = "";
                }
              } else if (fsmState === "FINAL") {
                if (currentContent.length > 0) {
                  // Check if content contains only newlines
                  const isOnlyNewlines = /^\s*$/.test(currentContent);

                  if (isOnlyNewlines) {
                    // If only newlines, add to buffer but don't send
                    finalBuffer += currentContent;
                  } else {
                    // If non-whitespace content, send buffer and new content together
                    const finalPart = finalBuffer + currentContent;
                    const newDelta = {
                      ...originalData.choices[0].delta,
                      content: finalPart,
                    };
                    if (newDelta.thinking) delete newDelta.thinking;
                    const finalChunk = {
                      ...originalData,
                      choices: [
                        { ...originalData.choices[0], delta: newDelta },
                      ],
                    };
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`)
                    );
                    // Clear buffer after sending
                    finalBuffer = "";
                  }
                }
                contentIndex++
                currentContent = "";
              }
            }
          };

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              const chunk = decoder.decode(value, { stream: true });
              lineBuffer += chunk;
              const lines = lineBuffer.split("\n");
              lineBuffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.trim()) continue;

                if (line.trim() === "data: [DONE]") {
                  controller.enqueue(encoder.encode(line + "\n\n"));
                  break;
                }

                if (line.startsWith("data:")) {
                  try {
                    const data = JSON.parse(line.slice(5));
                    processAndEnqueue(data, data.choices?.[0]?.delta?.content);
                  } catch (e) {
                    controller.enqueue(encoder.encode(line + "\n"));
                  }
                } else {
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

            if (fsmState === "REASONING") {
              const signatureDelta = {
                thinking: { signature: new Date().getTime().toString() },
              };
              const signatureChunk = {
                choices: [{ delta: signatureDelta }],
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(signatureChunk)}\n\n`)
              );
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
