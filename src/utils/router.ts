import {
  MessageCreateParamsBase,
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { get_encoding } from "tiktoken";
import { log } from "./log";

const enc = get_encoding("cl100k_base");

const calculateTokenCount = (
  messages: MessageParam[],
  system: any,
  tools: Tool[]
) => {
  let tokenCount = 0;
  if (Array.isArray(messages)) {
    messages.forEach((message) => {
      if (typeof message.content === "string") {
        tokenCount += enc.encode(message.content).length;
      } else if (Array.isArray(message.content)) {
        message.content.forEach((contentPart: any) => {
          if (contentPart.type === "text") {
            tokenCount += enc.encode(contentPart.text).length;
          } else if (contentPart.type === "tool_use") {
            tokenCount += enc.encode(JSON.stringify(contentPart.input)).length;
          } else if (contentPart.type === "tool_result") {
            tokenCount += enc.encode(
              typeof contentPart.content === "string"
                ? contentPart.content
                : JSON.stringify(contentPart.content)
            ).length;
          }
        });
      }
    });
  }
  if (typeof system === "string") {
    tokenCount += enc.encode(system).length;
  } else if (Array.isArray(system)) {
    system.forEach((item: any) => {
      if (item.type !== "text") return;
      if (typeof item.text === "string") {
        tokenCount += enc.encode(item.text).length;
      } else if (Array.isArray(item.text)) {
        item.text.forEach((textPart: any) => {
          tokenCount += enc.encode(textPart || "").length;
        });
      }
    });
  }
  if (tools) {
    tools.forEach((tool: Tool) => {
      if (tool.description) {
        tokenCount += enc.encode(tool.name + tool.description).length;
      }
      if (tool.input_schema) {
        tokenCount += enc.encode(JSON.stringify(tool.input_schema)).length;
      }
    });
  }
  return tokenCount;
};

const getUseModel = async (req: any, tokenCount: number, config: any) => {
  if (req.body.model.includes(",")) {
    const [provider, model] = req.body.model.split(",");
    const finalProvider = config.Providers.find(
      (p: any) => p.name.toLowerCase() === provider
    );
    const finalModel = finalProvider?.models?.find(
      (m: any) => m.toLowerCase() === model
    );
    if (finalProvider && finalModel) {
      return `${finalProvider.name},${finalModel}`;
    }
    return req.body.model;
  }
  // if tokenCount is greater than the configured threshold, use the long context model
  const longContextThreshold = config.Router.longContextThreshold || 60000;
  if (tokenCount > longContextThreshold && config.Router.longContext) {
    log(
      "Using long context model due to token count:",
      tokenCount,
      "threshold:",
      longContextThreshold
    );
    return config.Router.longContext;
  }
  // Check for CCR-SUBAGENT-MODEL routing
  if (
    req.body?.system?.length > 1 &&
    req.body?.system[1]?.text?.startsWith("<CCR-SUBAGENT-MODEL>")
  ) {
    const model = req.body?.system[1].text.match(
      /<CCR-SUBAGENT-MODEL>(.*?)<\/CCR-SUBAGENT-MODEL>/s
    );
    if (model) {
      req.body.system[1].text = req.body.system[1].text.replace(
        `<CCR-SUBAGENT-MODEL>${model[1]}</CCR-SUBAGENT-MODEL>`,
        ""
      );
      return model[1];
    }
  }
  
  // Helper: resolve tool use model from provider transformer config when Router.toolUse is not set
  const resolveToolUseModelFromProviders = (): string | null => {
    try {
      const providers = config.Providers || config.providers || [];
      if (!Array.isArray(providers)) return null;

      // Prefer provider inferred from current model or Router.default
      const currentModel: string = req.body?.model || "";
      const currentProviderName = ((): string | null => {
        if (currentModel.includes(",")) {
          return currentModel.split(",")[0]?.toLowerCase() || null;
        }
        const def = config.Router?.default;
        if (typeof def === "string" && def.includes(",")) {
          return def.split(",")[0]?.toLowerCase() || null;
        }
        return null;
      })();

      const scanProvider = (prov: any): string | null => {
        const t = prov?.transformer;
        if (!t) return null;

        const scanUseArray = (arr: any[]): string | null => {
          for (const item of arr) {
            if (Array.isArray(item)) {
              const [name, options] = item;
              if (name === "tooluse-router" && options?.toolUseModel) {
                return options.toolUseModel as string;
              }
            } else if (item === "tooluse-router") {
              // No options provided; skip
              continue;
            }
          }
          return null;
        };

        // Top-level use
        if (Array.isArray(t.use)) {
          const found = scanUseArray(t.use);
          if (found) return found;
        }
        // Model-specific use (best-effort scan)
        for (const key of Object.keys(t)) {
          if (key === "use") continue;
          const sub = t[key];
          if (Array.isArray(sub?.use)) {
            const found = scanUseArray(sub.use);
            if (found) return found;
          }
        }
        return null;
      };

      // 1) Try the current provider (if inferred)
      if (currentProviderName) {
        const prov = providers.find((p: any) => p?.name?.toLowerCase() === currentProviderName);
        const found = scanProvider(prov);
        if (found) return found;
      }

      // 2) Fallback: scan all providers
      for (const prov of providers) {
        const found = scanProvider(prov);
        if (found) return found;
      }
    } catch {}
    return null;
  };

  // Check for CCR-TOOLUSE-ROUTER routing (new tool use routing mechanism)
  const systemContent = req.body?.system || req.body?.messages?.find((m: any) => m.role === "system")?.content;
  let toolUseRouterModel = null;
  
  if (typeof systemContent === "string" && systemContent.includes("<CCR-TOOLUSE-ROUTER>")) {
    const match = systemContent.match(/<CCR-TOOLUSE-ROUTER>(.*?)<\/CCR-TOOLUSE-ROUTER>/s);
    if (match) {
      toolUseRouterModel = match[1];
      // Clean up the routing instruction from system content
      if (req.body?.system) {
        req.body.system = req.body.system.replace(
          `<CCR-TOOLUSE-ROUTER>${match[1]}</CCR-TOOLUSE-ROUTER>`,
          ""
        ).trim();
      }
      const systemMessage = req.body?.messages?.find((m: any) => m.role === "system");
      if (systemMessage) {
        systemMessage.content = systemMessage.content.replace(
          `<CCR-TOOLUSE-ROUTER>${match[1]}</CCR-TOOLUSE-ROUTER>`,
          ""
        ).trim();
      }
    }
  } else if (Array.isArray(systemContent)) {
    // Handle array-based system content
    for (let i = 0; i < systemContent.length; i++) {
      if (systemContent[i]?.text && systemContent[i].text.includes("<CCR-TOOLUSE-ROUTER>")) {
        const match = systemContent[i].text.match(/<CCR-TOOLUSE-ROUTER>(.*?)<\/CCR-TOOLUSE-ROUTER>/s);
        if (match) {
          toolUseRouterModel = match[1];
          systemContent[i].text = systemContent[i].text.replace(
            `<CCR-TOOLUSE-ROUTER>${match[1]}</CCR-TOOLUSE-ROUTER>`,
            ""
          ).trim();
          break;
        }
      }
    }
  }
  
  if (toolUseRouterModel) {
    log("Using tool use router model:", toolUseRouterModel);
    return toolUseRouterModel;
  }
  // If the model is claude-3-5-haiku, use the background model
  if (
    req.body.model?.startsWith("claude-3-5-haiku") &&
    config.Router.background
  ) {
    log("Using background model for ", req.body.model);
    return config.Router.background;
  }
  // if exits thinking, use the think model
  if (req.body.thinking && config.Router.think) {
    log("Using think model for ", req.body.thinking);
    return config.Router.think;
  }
  // Check for web search tools
  if (
    Array.isArray(req.body.tools) &&
    req.body.tools.some((tool: any) => tool.type?.startsWith("web_search")) &&
    config.Router.webSearch
  ) {
    return config.Router.webSearch;
  }
  
  // Check for general tool use (excluding web_search which is handled above)
  if (
    Array.isArray(req.body.tools) &&
    req.body.tools.length > 0 &&
    !req.body.tools.some((tool: any) => tool.type?.startsWith("web_search")) &&
    (resolveToolUseModelFromProviders() || config.Router.toolUse)
  ) {
    const provToolUse = resolveToolUseModelFromProviders() || config.Router.toolUse;
    if (provToolUse) {
      log("Using tool use model for general tools", provToolUse);
      return provToolUse;
    }
  }
  
  // Check for tool calls or tool results in messages (ongoing tool conversation)
  const hasToolUsage = req.body.messages && Array.isArray(req.body.messages) && 
    req.body.messages.some((message: any) => 
      message.tool_calls?.length > 0 || 
      message.role === "tool" ||
      (Array.isArray(message.content) && message.content.some((content: any) => 
        content.type === "tool_use" || content.type === "tool_result"
      ))
    );
    
  if (hasToolUsage && (resolveToolUseModelFromProviders() || config.Router.toolUse)) {
    const provToolUse = resolveToolUseModelFromProviders() || config.Router.toolUse;
    if (provToolUse) {
      log("Using tool use model for ongoing tool conversation", provToolUse);
      return provToolUse;
    }
  }
  return config.Router!.default;
};

export const router = async (req: any, _res: any, config: any) => {
  const { messages, system = [], tools }: MessageCreateParamsBase = req.body;
  try {
    const tokenCount = calculateTokenCount(
      messages as MessageParam[],
      system,
      tools as Tool[]
    );

    let model;
    if (config.CUSTOM_ROUTER_PATH) {
      try {
        const customRouter = require(config.CUSTOM_ROUTER_PATH);
        req.tokenCount = tokenCount; // Pass token count to custom router
        model = await customRouter(req, config);
      } catch (e: any) {
        log("failed to load custom router", e.message);
      }
    }
    if (!model) {
      model = await getUseModel(req, tokenCount, config);
    }
    req.body.model = model;
  } catch (error: any) {
    log("Error in router middleware:", error.message);
    req.body.model = config.Router!.default;
  }
  return;
};
