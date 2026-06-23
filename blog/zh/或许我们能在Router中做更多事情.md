# 或许我们能在 Router 中做更多事情

自从`claude-code-router`发布以来，我收到了很多用户的反馈，至今还有不少的 issues 未处理。其中大多都是关于不同的供应商的支持和`deepseek`模型调用工具不积极的问题。
之前开发这个项目主要是为了我自己能以较低成本使用上`claude code`，所以一开始的设计并没有考虑到多供应商的情况。在实际的排查问题中，我发现尽管市面上所有的供应商几乎都宣称兼容`OpenAI`格式调用，即通过`/chat/compeletions`接口调用，但是其中的细节差异非常多。例如:

1. Gemini 的工具参数类型是 string 时，`format`参数只支持`date`和`date-time`，并且没有工具调用 ID。

2. OpenRouter 需要使用`cache_control`进行缓存。

3. DeepSeek 官方 API 的 `max_output` 为 8192，而火山引擎的会更大。

除了这些问题之外，还有一些其他的小的供应商，他们或多或少参数都有点问题。于是，我打算开发一个新的项目[musistudio/llms](https://github.com/musistudio/llms)来处理这种不同服务商的兼容问题。该项目使用 OpenAI 格式为基础的通用格式，提供了一个`Transformer`接口，该接口用于处理转换请求和响应。当我们给不同的服务商都实现了`Transformer`后，我们可以实现不同服务商的混合调用。比如我在`AnthropicTransformer`中实现了`Anthropic`<->`OpenAI`格式的互相转换，并监听了`/v1/messages`端点，在`GeminiTransformer`中实现了`Gemini`<->`OpenAI`格式的互相转换，并监听了`/v1beta/models/:modelAndAction`端点，当他们的请求和响应都被转换成一个通用格式的时候，就可以实现他们的互相调用。

```
AnthropicRequest -> AnthropicTransformer -> OpenAIRequest -> GeminiTransformer -> GeminiRequest -> GeminiServer
```

```
GeminiReseponse -> GeminiTransformer -> OpenAIResponse -> AnthropicTransformer -> AnthropicResponse
```

虽然使用中间层抹平差异可能会带来一些性能问题，但是该项目最初的目的是为了让`claude-code-router`支持不同的供应商。

至于`deepseek`模型调用工具不积极的问题，我发现这是由于`deepseek`在长上下文中的指令遵循不佳导致的。现象就是刚开始模型会主动调用工具，但是在经过几轮对话后模型只会返回文本。一开始的解决方案是通过注入一个系统提示词告知模型需要积极去使用工具以解决用户的问题，但是后面测试发现在长上下文中模型会遗忘该指令。
查看`deepseek`文档后发现模型支持`tool_choice`参数，可以强制让模型最少调用 1 个工具，我尝试将该值设置为`required`，发现模型调用工具的积极性大大增加，现在我们只需要在合适的时候取消这个参数即可。借助[musistudio/llms](https://github.com/musistudio/llms)的`Transformer`可以让我们在发送请求前和收到响应后做点什么，所以我参考`claude code`的`Plan Mode`，实现了一个使用与`deepseek`的`Tool Mode`

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

该工具将始终让模型至少调用一个工具，如果没有合适的工具或者任务已完成可以调用`ExitTool`来退出工具模式，因为是依靠`tool_choice`参数实现的，所以仅适用于支持该参数的模型。经过测试，该工具能显著增加`deepseek`的工具调用次数，弊端是可能会有跟任务无关或者没有必要的工具调用导致增加任务执行事件和消耗的 `token` 数。

这次更新仅仅是在 Router 中实现一个`agent`的一次小探索，或许还能做更多其他有趣的事也说不定...
