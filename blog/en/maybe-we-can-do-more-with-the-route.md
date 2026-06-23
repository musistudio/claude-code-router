# Maybe We Can Do More with the Router

Since the release of `claude-code-router`, I’ve received a lot of user feedback, and quite a few issues are still open. Most of them are related to support for different providers and the lack of tool usage from the deepseek model.

Originally, I created this project for personal use, mainly to access claude code at a lower cost. So, multi-provider support wasn’t part of the initial design. But during troubleshooting, I discovered that even though most providers claim to be compatible with the OpenAI-style `/chat/completions` interface, there are many subtle differences. For example:

1. When Gemini's tool parameter type is string, the `format` field only supports `date` and `date-time`, and there’s no tool call ID.

2. OpenRouter requires `cache_control` for caching.

3. The official DeepSeek API has a `max_output` of 8192, but Volcano Engine’s limit is even higher.

Aside from these, smaller providers often have quirks in their parameter handling. So I decided to create a new project, [musistudio/llms](https://github.com/musistudio/llms), to deal with these compatibility issues. It uses the OpenAI format as a base and introduces a generic Transformer interface for transforming both requests and responses.

Once a `Transformer` is implemented for each provider, it becomes possible to mix-and-match requests between them. For example, I implemented bidirectional conversion between Anthropic and OpenAI formats in `AnthropicTransformer`, which listens to the `/v1/messages` endpoint. Similarly, `GeminiTransformer` handles Gemini <-> OpenAI format conversions and listens to `/v1beta/models/:modelAndAction`.

When both requests and responses are transformed into a common format, they can interoperate seamlessly:

```
AnthropicRequest -> AnthropicTransformer -> OpenAIRequest -> GeminiTransformer -> GeminiRequest -> GeminiServer
```

```
GeminiResponse -> GeminiTransformer -> OpenAIResponse -> AnthropicTransformer -> AnthropicResponse
```

Using a middleware layer to smooth out differences may introduce some performance overhead, but the main goal here is to enable `claude-code-router` to support multiple providers.

As for the issue of DeepSeek’s lackluster tool usage — I found that it stems from poor instruction adherence in long conversations. Initially, the model actively calls tools, but after several rounds, it starts responding with plain text instead. My first workaround was injecting a system prompt to remind the model to use tools proactively. But in long contexts, the model tends to forget this instruction.

After reading the DeepSeek documentation, I noticed it supports the `tool_choice` parameter, which can be set to `"required"` to force the model to use at least one tool. I tested this by enabling the parameter, and it significantly improved the model’s tool usage. We can remove the setting when it's no longer necessary. With the help of the `Transformer` interface in [musistudio/llms](https://github.com/musistudio/llms), we can modify the request before it’s sent and adjust the response after it’s received.

Inspired by the Plan Mode in `claude code`, I implemented a similar Tool Mode for DeepSeek:

```typescript
export class TooluseTransformer implements Transformer {
  name = "tooluse";

  transformRequestIn(request: UnifiedChatRequest): UnifiedChatRequest {
    if (request.tools?.length) {
      request.messages.push({
        role: "system",
        content: `<system-reminder>Tool mode is active. The user expects you to proactively execute the most suitable tool to help complete the task. 
Before invoking a tool, you must carefully evaluate whether it matches the current task. If no available tool is appropriate for the task, you MUST call the \`ExitTool\` to exit tool mode — this is the only valid way to terminate tool mode.
Always prioritize completing the user's task effectively and efficiently by using tools whenever appropriate.</system-reminder>`,
      });
      request.tool_choice = "required";
      request.tools.unshift({
        type: "function",
        function: {
          name: "ExitTool",
          description: `Use this tool when you are in tool mode and have completed the task. This is the only valid way to exit tool mode.
IMPORTANT: Before using this tool, ensure that none of the available tools are applicable to the current task. You must evaluate all available options — only if no suitable tool can help you complete the task should you use ExitTool to terminate tool mode.
Examples:
1. Task: "Use a tool to summarize this document" — Do not use ExitTool if a summarization tool is available.
2. Task: "What’s the weather today?" — If no tool is available to answer, use ExitTool after reasoning that none can fulfill the task.`,
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

  async transformResponseOut(response: Response): Promise<Response> {
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse = await response.json();
      if (
        jsonResponse?.choices[0]?.message.tool_calls?.length &&
        jsonResponse?.choices[0]?.message.tool_calls[0]?.function?.name ===
          "ExitTool"
      ) {
        const toolArguments = JSON.parse(toolCall.function.arguments || "{}");
        jsonResponse.choices[0].message.content = toolArguments.response || "";
        delete jsonResponse.choices[0].message.tool_calls;
      }

      // Handle non-streaming response if needed
      return new Response(JSON.stringify(jsonResponse), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } else if (response.headers.get("Content-Type")?.includes("stream")) {
      // ...
    }
    return response;
  }
}
```

This transformer ensures the model calls at least one tool. If no tools are appropriate or the task is finished, it can exit using `ExitTool`. Since this relies on the `tool_choice` parameter, it only works with models that support it.

In practice, this approach noticeably improves tool usage for DeepSeek. The tradeoff is that sometimes the model may invoke irrelevant or unnecessary tools, which could increase latency and token usage.

This update is just a small experiment — adding an `“agent”` to the router. Maybe there are more interesting things we can explore from here.