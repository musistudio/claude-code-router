import { UnifiedChatRequest } from "../types/llm";
import { Transformer } from "../types/transformer";
import { v4 as uuidv4 } from "uuid";

export class TooluseTransformer implements Transformer {
  name = "tooluse";

  transformRequestIn(request: UnifiedChatRequest): UnifiedChatRequest {
    request.messages.push({
      role: "system",
      content: `<system-reminder>Tool mode is active. The user expects you to proactively execute the most suitable tool to help complete the task. 
Before invoking a tool, you must carefully evaluate whether it matches the current task. If no available tool is appropriate for the task, you MUST call the \`ExitTool\` to exit tool mode — this is the only valid way to terminate tool mode.
Always prioritize completing the user's task effectively and efficiently by using tools whenever appropriate.</system-reminder>`,
    });
    if (request.tools?.length) {
      request.tool_choice = "required";
      request.tools.push({
        type: "function",
        function: {
          name: "ExitTool",
          description: `Use this tool when you are in tool mode and have completed the task. This is the only valid way to exit tool mode.
IMPORTANT: Before using this tool, ensure that none of the available tools are applicable to the current task. You must evaluate all available options — only if no suitable tool can help you complete the task should you use ExitTool to terminate tool mode.
Examples:
1. Task: "Use a tool to summarize this document" — Do not use ExitTool if a summarization tool is available.
2. Task: "What's the weather today?" — If no tool is available to answer, use ExitTool after reasoning that none can fulfill the task.`,
          parameters: {
            type: "object",
            properties: {
              response: {
                type: "string",
                description:
                  "Your response will be forwarded to the user exactly as returned — the tool will not modify or post-process it in any way.",
              },
            },
            required: ["response"],
          },
        },
      });
    }
    return request;
  }

  private parseXmlToolCalls(content: string): Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }> | null {
    if (!content || typeof content !== "string") {
      return null;
    }

    const toolCalls: Array<{
      id: string;
      type: "function";
      function: {
        name: string;
        arguments: string;
      };
    }> = [];

    const toolPatterns = [
      { tag: "bash", paramName: "command" },
      { tag: "write_file", paramName: "content" },
      { tag: "read_file", paramName: "path" },
      { tag: "search_files", paramName: "query" },
      { tag: "list_dir", paramName: "path" },
      { tag: "view", paramName: "path" },
      { tag: "edit_file", paramName: "edits" },
      { tag: "delete_file", paramName: "path" },
      { tag: "create_directory", paramName: "path" },
      { tag: "replace_in_file", paramName: "replacements" },
      { tag: "execute_command", paramName: "command" },
      { tag: "read_image", paramName: "path" },
    ];

    for (const { tag, paramName } of toolPatterns) {
      const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
      let match;

      while ((match = regex.exec(content)) !== null) {
        const toolContent = match[1].trim();
        let args: Record<string, any> = {};

        try {
          args = JSON.parse(toolContent);
        } catch {
          args = { [paramName]: toolContent };
        }

        toolCalls.push({
          id: `call_${uuidv4().replace(/-/g, "").slice(0, 24)}`,
          type: "function",
          function: {
            name: tag,
            arguments: JSON.stringify(args),
          },
        });
      }
    }

    return toolCalls.length > 0 ? toolCalls : null;
  }

  private removeXmlToolTags(content: string): string {
    if (!content || typeof content !== "string") {
      return content;
    }

    const toolTags = [
      "bash",
      "write_file",
      "read_file",
      "search_files",
      "list_dir",
      "view",
      "edit_file",
      "delete_file",
      "create_directory",
      "replace_in_file",
      "execute_command",
      "read_image",
    ];

    let cleanedContent = content;
    for (const tag of toolTags) {
      const regex = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "g");
      cleanedContent = cleanedContent.replace(regex, "");
    }

    return cleanedContent.trim();
  }

  async transformResponseOut(response: Response): Promise<Response> {
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse = await response.json();
      
      if (
        jsonResponse?.choices?.[0]?.message.tool_calls?.length &&
        jsonResponse?.choices?.[0]?.message.tool_calls[0]?.function?.name ===
          "ExitTool"
      ) {
        const toolCall = jsonResponse?.choices[0]?.message.tool_calls[0];
        const toolArguments = JSON.parse(toolCall.function.arguments || "{}");
        jsonResponse.choices[0].message.content = toolArguments.response || "";
        delete jsonResponse.choices[0].message.tool_calls;
      }

      const message = jsonResponse?.choices?.[0]?.message;
      if (message && !message.tool_calls?.length && message.content) {
        const xmlToolCalls = this.parseXmlToolCalls(message.content);
        if (xmlToolCalls && xmlToolCalls.length > 0) {
          message.tool_calls = xmlToolCalls;
          if (jsonResponse.choices[0]) {
            jsonResponse.choices[0].finish_reason = "tool_calls";
          }
          message.content = this.removeXmlToolTags(message.content);
          if (!message.content || message.content.trim() === "") {
            message.content = null;
          }
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

      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let exitToolIndex = -1;
      let exitToolResponse = "";
      let buffer = "";
      
      let accumulatedContent = "";
      let hasDetectedToolCalls = false;
      let parsedToolCalls: Array<{
        id: string;
        type: "function";
        function: {
          name: string;
          arguments: string;
        };
      }> | null = null;
      let toolCallsSent = false;

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
              exitToolIndex: () => number;
              setExitToolIndex: (val: number) => void;
              exitToolResponse: () => string;
              appendExitToolResponse: (content: string) => void;
            }
          ) => {
            const {
              controller,
              encoder,
              exitToolIndex,
              setExitToolIndex,
              appendExitToolResponse,
            } = context;

            if (
              line.startsWith("data: ") &&
              line.trim() !== "data: [DONE]"
            ) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.choices[0]?.delta?.tool_calls?.length) {
                  const toolCall = data.choices[0].delta.tool_calls[0];

                  if (toolCall.function?.name === "ExitTool") {
                    setExitToolIndex(toolCall.index);
                    return;
                  } else if (
                    exitToolIndex() > -1 &&
                    toolCall.index === exitToolIndex() &&
                    toolCall.function.arguments
                  ) {
                    appendExitToolResponse(toolCall.function.arguments);
                    try {
                      const response = JSON.parse(context.exitToolResponse());
                      data.choices = [
                        {
                          delta: {
                            role: "assistant",
                            content: response.response || "",
                          },
                        },
                      ];
                      const modifiedLine = `data: ${JSON.stringify(
                        data
                      )}\n\n`;
                      controller.enqueue(encoder.encode(modifiedLine));
                    } catch (e) {}
                    return;
                  }
                }

                const deltaContent = data.choices?.[0]?.delta?.content;
                if (deltaContent && typeof deltaContent === "string") {
                  accumulatedContent += deltaContent;
                  
                  if (!hasDetectedToolCalls && !toolCallsSent) {
                    parsedToolCalls = this.parseXmlToolCalls(accumulatedContent);
                    if (parsedToolCalls && parsedToolCalls.length > 0) {
                      hasDetectedToolCalls = true;
                    }
                  }
                  
                  if (hasDetectedToolCalls) {
                    return;
                  }
                }

                if (data.choices?.[0]?.finish_reason && hasDetectedToolCalls && !toolCallsSent) {
                  const cleanedContent = this.removeXmlToolTags(accumulatedContent);
                  
                  if (cleanedContent && cleanedContent.trim()) {
                    const contentData = {
                      ...data,
                      choices: [{
                        ...data.choices[0],
                        delta: {
                          role: "assistant",
                          content: cleanedContent,
                        },
                        finish_reason: null,
                      }],
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(contentData)}\n\n`));
                  }
                  
                  if (parsedToolCalls) {
                    for (let i = 0; i < parsedToolCalls.length; i++) {
                      const toolCall = parsedToolCalls[i];
                      const isLast = i === parsedToolCalls.length - 1;
                      
                      const toolCallData = {
                        ...data,
                        choices: [{
                          ...data.choices[0],
                          delta: {
                            role: "assistant",
                            tool_calls: [{
                              index: i,
                              id: toolCall.id,
                              type: "function",
                              function: {
                                name: toolCall.function.name,
                                arguments: toolCall.function.arguments,
                              },
                            }],
                          },
                          finish_reason: isLast ? "tool_calls" : null,
                        }],
                      };
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolCallData)}\n\n`));
                    }
                  }
                  
                  toolCallsSent = true;
                  return;
                }

                if (
                  data.choices?.[0]?.delta &&
                  Object.keys(data.choices[0].delta).length > 0
                ) {
                  const modifiedLine = `data: ${JSON.stringify(data)}\n\n`;
                  controller.enqueue(encoder.encode(modifiedLine));
                }
              } catch (e) {
                controller.enqueue(encoder.encode(line + "\n"));
              }
            } else {
              controller.enqueue(encoder.encode(line + "\n"));
            }
          };

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                if (hasDetectedToolCalls && !toolCallsSent && parsedToolCalls) {
                  const cleanedContent = this.removeXmlToolTags(accumulatedContent);
                  
                  if (cleanedContent && cleanedContent.trim()) {
                    const contentData = {
                      id: `chatcmpl-${Date.now()}`,
                      object: "chat.completion.chunk",
                      created: Math.floor(Date.now() / 1000),
                      model: "unknown",
                      choices: [{
                        index: 0,
                        delta: {
                          role: "assistant",
                          content: cleanedContent,
                        },
                        finish_reason: null,
                      }],
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(contentData)}\n\n`));
                  }
                  
                  for (let i = 0; i < parsedToolCalls.length; i++) {
                    const toolCall = parsedToolCalls[i];
                    const isLast = i === parsedToolCalls.length - 1;
                    
                    const toolCallData = {
                      id: `chatcmpl-${Date.now()}`,
                      object: "chat.completion.chunk",
                      created: Math.floor(Date.now() / 1000),
                      model: "unknown",
                      choices: [{
                        index: 0,
                        delta: {
                          role: "assistant",
                          tool_calls: [{
                            index: i,
                            id: toolCall.id,
                            type: "function",
                            function: {
                              name: toolCall.function.name,
                              arguments: toolCall.function.arguments,
                            },
                          }],
                        },
                        finish_reason: isLast ? "tool_calls" : null,
                      }],
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolCallData)}\n\n`));
                  }
                  
                  toolCallsSent = true;
                }
                
                if (buffer.trim()) {
                  processBuffer(buffer, controller, encoder);
                }
                break;
              }
              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";
              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  processLine(line, {
                    controller,
                    encoder,
                    exitToolIndex: () => exitToolIndex,
                    setExitToolIndex: (val) => (exitToolIndex = val),
                    exitToolResponse: () => exitToolResponse,
                    appendExitToolResponse: (content) =>
                      (exitToolResponse += content),
                  });
                } catch (error) {
                  console.error("Error processing line:", line, error);
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
