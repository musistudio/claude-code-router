import {
  MessageCreateParamsBase,
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { get_encoding } from "tiktoken";
import { log } from "./log";
import { sessionUsageCache, Usage } from "./cache";

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

const getUseModel = async (
  req: any,
  tokenCount: number,
  config: any,
  lastUsage?: Usage | undefined
) => {
  // Track the route used for analytics
  let routeUsed = 'default';
  
  if (req.body.model.includes(",")) {
    const [provider, model] = req.body.model.split(",");
    const finalProvider = config.Providers.find(
      (p: any) => p.name.toLowerCase() === provider
    );
    const finalModel = finalProvider?.models?.find(
      (m: any) => m.toLowerCase() === model
    );
    if (finalProvider && finalModel) {
      routeUsed = 'explicit'; // Explicit provider,model specification
      req.routeUsed = routeUsed;
      return `${finalProvider.name},${finalModel}`;
    }
    req.routeUsed = routeUsed;
    return req.body.model;
  }
  
  // if tokenCount is greater than the configured threshold, use the long context model
  const longContextThreshold = config.Router.longContextThreshold || 60000;
  const lastUsageThreshold =
    lastUsage &&
    lastUsage.input_tokens > longContextThreshold &&
    tokenCount > 20000;
  const tokenCountThreshold = tokenCount > longContextThreshold;
  if (
    (lastUsageThreshold || tokenCountThreshold) &&
    config.Router.longContext
  ) {
    log(
      "Using long context model due to token count:",
      tokenCount,
      "threshold:",
      longContextThreshold
    );
    routeUsed = 'longContext';
    req.routeUsed = routeUsed;
    return config.Router.longContext;
  }
  
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
      routeUsed = 'subagent';
      req.routeUsed = routeUsed;
      return model[1];
    }
  }
  
  // If the model is claude-3-5-haiku, use the background model
  if (
    req.body.model?.startsWith("claude-3-5-haiku") &&
    config.Router.background
  ) {
    log("Using background model for ", req.body.model);
    routeUsed = 'background';
    req.routeUsed = routeUsed;
    return config.Router.background;
  }
  
  // if exits thinking, use the think model
  if (req.body.thinking && config.Router.think) {
    log("Using think model for ", req.body.thinking);
    routeUsed = 'think';
    req.routeUsed = routeUsed;
    return config.Router.think;
  }
  
  if (
    Array.isArray(req.body.tools) &&
    req.body.tools.some((tool: any) => tool.type?.startsWith("web_search")) &&
    config.Router.webSearch
  ) {
    routeUsed = 'webSearch';
    req.routeUsed = routeUsed;
    return config.Router.webSearch;
  }
  
  req.routeUsed = routeUsed;
  return config.Router!.default;
};

// Helper function to extract provider and model from a model string
const extractProviderAndModel = (modelString: string, config: any) => {
  if (modelString.includes(",")) {
    const [providerName, modelName] = modelString.split(",");
    return {
      provider: providerName,
      model: modelName
    };
  }
  
  // If no comma, try to find which provider contains this model
  for (const provider of config.Providers || []) {
    if (provider.models?.includes(modelString)) {
      return {
        provider: provider.name,
        model: modelString
      };
    }
  }
  
  // Fallback - treat as provider name if no model found
  return {
    provider: modelString,
    model: modelString
  };
};

export const router = async (req: any, _res: any, config: any) => {
  // Parse sessionId from metadata.user_id
  if (req.body.metadata?.user_id) {
    const parts = req.body.metadata.user_id.split("_session_");
    if (parts.length > 1) {
      req.sessionId = parts[1];
    }
  }
  
  // Capture original model for analytics tracking
  req.originalModel = req.body.model;
  
  const lastMessageUsage = sessionUsageCache.get(req.sessionId);
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
        // For custom router, we can't determine the exact route, so use 'custom'
        req.routeUsed = 'custom';
      } catch (e: any) {
        log("failed to load custom router", e.message);
      }
    }
    if (!model) {
      model = await getUseModel(req, tokenCount, config, lastMessageUsage);
    }
    
    // Extract provider and model information for analytics
    const { provider, model: modelName } = extractProviderAndModel(model, config);
    
    // Set the full model string for the router
    req.body.model = model;
    
    // Set separate provider and model for analytics tracking
    req.selectedProvider = provider;
    req.selectedModel = modelName;
    req.actualModel = modelName; // Store the actual model used after routing
    
  } catch (error: any) {
    log("Error in router middleware:", error.message);
    const defaultModel = config.Router!.default;
    const { provider, model: modelName } = extractProviderAndModel(defaultModel, config);
    
    req.body.model = defaultModel;
    req.selectedProvider = provider;
    req.selectedModel = modelName;
    req.actualModel = modelName;
    req.routeUsed = 'error'; // Track that this was due to an error
  }
  return;
};
