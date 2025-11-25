# GLM-4.6支持思考及思维链回传

## GLM-4.6在cluade code中启用思考
GLM从4.5开始就对claude code进行了支持，我之前也一直在关注，很多用户反映在claude code中无法启用思考，刚好最近收到了来自智谱的赞助，就着手进行研究。

首先根据[官方文档](https://docs.bigmodel.cn/api-reference/%E6%A8%A1%E5%9E%8B-api/%E5%AF%B9%E8%AF%9D%E8%A1%A5%E5%85%A8)，我们发现`/chat/completions`端点是默认启用思考的，但是是由模型判断是否需要进行思考

```
thinking object
仅 GLM-4.5 及以上模型支持此参数配置. 控制大模型是否开启思维链。

thinking.type enum<string> default:enabled
是否开启思维链(当开启后 GLM-4.6 GLM-4.5 为模型自动判断是否思考，GLM-4.5V 为强制思考), 默认: enabled.

Available options: enabled, disabled 
```

在claude code本身大量的提示词干扰下，会严重阻碍GLM模型本身的判断机制，导致模型很少进行思考。所以我们需要对模型进行引导，让模型认为需要进行思考。但是`claude-code-router`作为proxy，能做的只能是修改提示词/参数。

在最开始，我尝试直接删除claude code的系统提示词，模型确实进行了思考，但是这样就无法驱动claude code。所以我们需要进行提示词注入，明确告知模型需要进行思考。

```javascript
// transformer.ts
import { UnifiedChatRequest } from "../types/llm";
import { Transformer } from "../types/transformer";

export class ForceReasoningTransformer implements Transformer {
  name = "forcereasoning";

  async transformRequestIn(
    request: UnifiedChatRequest
  ): Promise<UnifiedChatRequest> {
    const systemMessage = request.messages.find(
      (item) => item.role === "system"
    );
    if (Array.isArray(systemMessage?.content)) {
      systemMessage.content.push({
        type: "text",
        text: "You are an expert reasoning model. \nAlways think step by step before answering. Even if the problem seems simple, always write down your reasoning process explicitly. \nNever skip your chain of thought. \nUse the following output format:\n<reasoning_content>(Write your full detailed thinking here.)</reasoning_content>\n\nWrite your final conclusion here.",
      });
    }
    const lastMessage = request.messages[request.messages.length - 1];
    if (lastMessage.role === "user" && Array.isArray(lastMessage.content)) {
      lastMessage.content.push({
        type: "text",
        text: "You are an expert reasoning model. \nAlways think step by step before answering. Even if the problem seems simple, always write down your reasoning process explicitly. \nNever skip your chain of thought. \nUse the following output format:\n<reasoning_content>(Write your full detailed thinking here.)</reasoning_content>\n\nWrite your final conclusion here.",
      });
    }
    if (lastMessage.role === "tool") {
      request.messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: "You are an expert reasoning model. \nAlways think step by step before answering. Even if the problem seems simple, always write down your reasoning process explicitly. \nNever skip your chain of thought. \nUse the following output format:\n<reasoning_content>(Write your full detailed thinking here.)</reasoning_content>\n\nWrite your final conclusion here.",
          },
        ],
      });
    }
    return request;
  }
}
```

至于为什么让模型将思考内容放入reasoning_content标签而不是think标签有两个原因：
1. 直接使用think标签不能很好的激活思考，猜测是训练模型时以think标签作为数据集进行训练。
2. 如果使用think标签，模型的推理内容会被拆分到单独的字段，这就涉及到我们接下来要说的思维链回传问题。


## 思维链回传

近期Minimax发布了Minimax-m2，与此同时，他们还发布了一篇[文章](https://www.minimaxi.com/news/why-is-interleaved-thinking-important-for-m2)介绍思维链回传。但是太阳底下无新鲜事，刚好借此来剖析一下。       
1. 我们首先来看一下为什么需要回传思维链？     
Minimax在文章中说的是Chat Completion API不支持在后续请求中传递推理内容。我们知道ChatGPT是最先支持推理的，但是OpenAI最初没有开放思维链给用户，所以对于Chat Completion API来讲并不需要支持思维链相关的东西。就连CoT的字段也是DeepSeek率先在Chat Completion API中加入的。

2. 我们真的需要这些字段吗？
如果没有这些字段会怎么样？会影响到模型的思考吗？可以查看一下[sglang的源码](https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/parser/reasoning_parser.py)发现思维链的信息原本就会在消息中按照特定的标记进行输出，假如我们不对其进行拆分，正常情况下在下轮对话中会自然包含这些信息。所以需要思维链回传的原因就是我们对模型的思维链内容进行拆分。

我用上面不到40行的代码完成了对GLM-4.5/6支持思考以及思维链回传的简单探索(单纯是因为没时间做拆分，完全可以在transformer中响应时先做拆分，请求时再进行合并，这样对cc前端的展示适配会更好)，如果你有什么更好的想法也欢迎与我联系。




