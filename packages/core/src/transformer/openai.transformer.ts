import { Transformer, TransformerContext } from "@/types/transformer";
import { UnifiedChatRequest, UnifiedMessage, UnifiedTool } from "@/types/llm";
import { mapToolName, unmapToolName, extractQwenThinking, QWEN_THINK_TAGS } from "@/utils/qwen";
import { rewriteStream } from "@/utils/sse/rewriteStream";

export class OpenAITransformer implements Transformer {
  name = "OpenAI";
  endPoint = "/v1/chat/completions";

  async transformRequestOut(request: any): Promise<UnifiedChatRequest> {
    const messages: UnifiedMessage[] = (request.messages || []).map((msg: any) => {
      // Map 'developer' role to 'system'
      const role = msg.role === "developer" ? "system" : msg.role;
      
      const unifiedMsg: UnifiedMessage = {
        role,
        content: msg.content,
      };

      if (msg.tool_calls) {
        unifiedMsg.tool_calls = msg.tool_calls.map((tc: any) => ({
          ...tc,
          function: {
            ...tc.function,
            name: mapToolName(tc.function.name)
          }
        }));
      }

      if (msg.tool_call_id) {
        unifiedMsg.tool_call_id = msg.tool_call_id;
      }

      return unifiedMsg;
    });

    const tools: UnifiedTool[] | undefined = request.tools?.map((tool: any) => {
        const toolName = mapToolName(tool.function.name);
        let required = tool.function.parameters.required || [];

        // Apply strict tool parameters if not already present, similar to AnthropicTransformer
        if (toolName === "Bash") {
            required = ["command"];
        } else if (toolName === "Edit") {
            required = ["file_path", "old_string", "new_string", "allow_multiple", "instruction"];
        } else if (toolName === "Read") {
            required = ["file_path"];
        } else if (toolName === "Glob") {
            required = ["pattern"];
        } else if (toolName === "Grep") {
            required = ["pattern"];
        } else if (toolName === "Ls") {
            required = ["path"];
        } else if (toolName === "Write") {
            required = ["file_path", "content"];
        }

        return {
            type: tool.type || "function",
            function: {
                ...tool.function,
                name: toolName,
                parameters: {
                    ...tool.function.parameters,
                    required
                }
            }
        };
    });

    const result: UnifiedChatRequest = {
      messages,
      model: request.model,
      stream: request.stream,
      tools,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      tool_choice: request.tool_choice,
    };

    // Support OpenAI o1/o3 reasoning_effort
    if (request.reasoning_effort) {
      result.reasoning = {
        effort: request.reasoning_effort,
        enabled: true
      };
    }

    return result;
  }

  async transformResponseIn(response: Response, context: TransformerContext): Promise<Response> {
    const contentType = response.headers.get("Content-Type") || "";
    
    if (contentType.includes("text/event-stream")) {
        return this.transformStreamResponse(response, context);
    }

    if (contentType.includes("application/json")) {
        const data = await response.json();
        const choice = data.choices?.[0];
        
        if (choice?.message) {
            // 1. Handle Qwen thinking tags in content
            if (typeof choice.message.content === "string") {
                const { thinking, content } = extractQwenThinking(choice.message.content);
                if (thinking) {
                    choice.message.reasoning_content = thinking;
                    choice.message.content = content;
                }
            }

            // 2. Unmap tool names
            if (choice.message.tool_calls) {
                choice.message.tool_calls.forEach((tc: any) => {
                    tc.function.name = unmapToolName(tc.function.name);
                });
            }
        }

        return new Response(JSON.stringify(data), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });
    }

    return response;
  }

  private transformStreamResponse(response: Response, context: TransformerContext): Response {
    if (!response.body) return response;

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let isThinking = false;
    let thinkingBuffer = "";

    const stream = rewriteStream(response.body, async (value, controller) => {
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        const processedLines = [];

        for (const line of lines) {
            if (!line.startsWith("data: ") || line.trim() === "data: [DONE]") {
                processedLines.push(line);
                continue;
            }

            try {
                const data = JSON.parse(line.slice(6));
                const choice = data.choices?.[0];
                
                if (choice?.delta) {
                    let content = choice.delta.content || "";
                    
                    // Detect Qwen thinking tags in stream
                    if (content.includes(QWEN_THINK_TAGS.start)) {
                        isThinking = true;
                        const parts = content.split(QWEN_THINK_TAGS.start);
                        const preThinking = parts[0];
                        const rest = parts[1];
                        
                        if (preThinking) {
                            choice.delta.content = preThinking;
                        } else {
                            delete choice.delta.content;
                        }

                        if (rest) {
                            thinkingBuffer = rest;
                            choice.delta.reasoning_content = rest;
                        } else {
                            choice.delta.reasoning_content = "";
                        }
                        
                        processedLines.push(`data: ${JSON.stringify(data)}`);
                        continue;
                    }

                    if (isThinking) {
                        if (content.includes(QWEN_THINK_TAGS.end)) {
                            isThinking = false;
                            const parts = content.split(QWEN_THINK_TAGS.end);
                            const lastThinking = parts[0];
                            const postThinking = parts[1];

                            choice.delta.reasoning_content = lastThinking;
                            if (postThinking) {
                                choice.delta.content = postThinking;
                            } else {
                                delete choice.delta.content;
                            }
                        } else {
                            choice.delta.reasoning_content = content;
                            delete choice.delta.content;
                        }
                    }

                    // Unmap tool names in stream
                    if (choice.delta.tool_calls) {
                        choice.delta.tool_calls.forEach((tc: any) => {
                            if (tc.function?.name) {
                                tc.function.name = unmapToolName(tc.function.name);
                            }
                        });
                    }
                }
                processedLines.push(`data: ${JSON.stringify(data)}`);
            } catch (e) {
                processedLines.push(line);
            }
        }

        return encoder.encode(processedLines.join("\n") + "\n");
    });

    return new Response(stream, {
        headers: response.headers
    });
  }
}
