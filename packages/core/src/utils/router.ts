import { get_encoding } from "tiktoken";
import { sessionUsageCache, Usage } from "./cache";
import { readFile } from "fs/promises";
import { opendir, stat } from "fs/promises";
import { join } from "path";
import { CLAUDE_PROJECTS_DIR, HOME_DIR } from "@CCR/shared";
import { LRUCache } from "lru-cache";
import { ConfigService } from "../services/config";
import { TokenizerService } from "../services/tokenizer";
import { resolveModelAlias } from "./model-alias";
import { analyzeReasoning, buildContextInjection } from "../engines/reasoning-engine";
import { getAdaptiveRouter } from "./adaptive-router";
import { getAdaptiveParameterTuner } from "./adaptive-params";

// ==========================================================================
// Provider fallback: config-driven via "fallback" section in config.json
// No hardcoded provider names — all fallback logic reads from config
// ==========================================================================

// Types from @anthropic-ai/sdk
interface Tool {
  name: string;
  description?: string;
  input_schema: object;
}

interface ContentBlockParam {
  type: string;
  [key: string]: any;
}

interface MessageParam {
  role: string;
  content: string | ContentBlockParam[];
}

interface MessageCreateParamsBase {
  messages?: MessageParam[];
  system?: string | any[];
  tools?: Tool[];
  [key: string]: any;
}

const enc = get_encoding("cl100k_base");

export const calculateTokenCount = (
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

const getProjectSpecificRouter = async (
  req: any,
  configService: ConfigService
) => {
  // Check if there is project-specific configuration
  if (req.sessionId) {
    const project = await searchProjectBySession(req.sessionId);
    if (project) {
      const projectConfigPath = join(HOME_DIR, project, "config.json");
      const sessionConfigPath = join(
        HOME_DIR,
        project,
        `${req.sessionId}.json`
      );

      // First try to read sessionConfig file
      try {
        const sessionConfig = JSON.parse(await readFile(sessionConfigPath, "utf8"));
        if (sessionConfig && sessionConfig.Router) {
          return sessionConfig.Router;
        }
      } catch {}
      try {
        const projectConfig = JSON.parse(await readFile(projectConfigPath, "utf8"));
        if (projectConfig && projectConfig.Router) {
          return projectConfig.Router;
        }
      } catch {}
    }
  }
  return undefined; // Return undefined to use original configuration
};

const getUseModel = async (
  req: any,
  tokenCount: number,
  configService: ConfigService,
  lastUsage?: Usage | undefined
): Promise<{ model: string; scenarioType: RouterScenarioType }> => {
  const projectSpecificRouter = await getProjectSpecificRouter(req, configService);
  const providers = configService.get<any[]>("providers") || [];
  const Router = projectSpecificRouter || configService.get("Router");

  // Slash-prefix routing: "openai/gpt-4.1" → "openai,gpt-4.1"
  if (req.body.model?.includes('/') && !req.body.model.includes(',')) {
    const [prefix, ...rest] = req.body.model.split('/');
    const actualModel = rest.join('/');
    const providerMap: Record<string, string> = {
      'openai': 'openai',
      'xai': 'xai',
      'qwen': 'dashscope',
      'kimi': 'dashscope',
      'deepseek': 'deepseek',
      'anthropic': 'anthropic',
      'google': 'google',
      'groq': 'groq',
    };
    const resolvedProvider = providerMap[prefix.toLowerCase()];
    if (resolvedProvider) {
      req.log.info(`Slash-prefix routing: ${req.body.model} → ${resolvedProvider},${actualModel}`);
      req.body.model = `${resolvedProvider},${actualModel}`;
    }
  }

  // Try model alias resolution (e.g. "opus" → "claude-opus-4-6", then config overrides)
  if (!req.body.model.includes(",")) {
    const aliasTarget = resolveModelAlias(req.body.model, configService);
    if (aliasTarget) {
      req.log.info(`Model alias resolved: ${req.body.model} → ${aliasTarget}`);
      req.body.model = aliasTarget;
    }
  }

  if (req.body.model.includes(",")) {
    const [provider, model] = req.body.model.split(",");
    const providerLower = provider.toLowerCase();
    const modelLower = model.toLowerCase();
    const finalProvider = providers.find(
      (p: any) => p.name.toLowerCase() === providerLower
    );
    const finalModel = finalProvider?.models?.find(
      (m: any) => m.toLowerCase() === modelLower
    );
    if (finalProvider && finalModel) {
      return { model: `${finalProvider.name},${finalModel}`, scenarioType: 'default' };
    }
    return { model: req.body.model, scenarioType: 'default' };
  }

  // if tokenCount is greater than the configured threshold, use the long context model
  const longContextThreshold = Router?.longContextThreshold || 60000;
  const lastUsageThreshold =
    lastUsage &&
    lastUsage.input_tokens > longContextThreshold &&
    tokenCount > 20000;
  const tokenCountThreshold = tokenCount > longContextThreshold;
  if ((lastUsageThreshold || tokenCountThreshold) && Router?.longContext) {
    req.log.info(
      `Using long context model due to token count: ${tokenCount}, threshold: ${longContextThreshold}`
    );
    return { model: Router.longContext, scenarioType: 'longContext' };
  }
  const subagentModel = extractSubagentModel(req);
  if (subagentModel) {
    return { model: subagentModel, scenarioType: 'default' };
  }
  // Use the background model for any Claude Haiku variant
  const globalRouter = configService.get("Router");
  if (
    req.body.model?.includes("claude") &&
    req.body.model?.includes("haiku") &&
    globalRouter?.background
  ) {
    req.log.info(`Using background model for ${req.body.model}`);
    return { model: globalRouter.background, scenarioType: 'background' };
  }
  // The priority of websearch must be higher than thinking.
  if (
    Array.isArray(req.body.tools) &&
    req.body.tools.some((tool: any) => tool.type?.startsWith("web_search")) &&
    Router?.webSearch
  ) {
    return { model: Router.webSearch, scenarioType: 'webSearch' };
  }
  // if exits thinking, use the think model
  if (req.body.thinking && Router?.think) {
    req.log.info(`Using think model for ${req.body.thinking}`);
    return { model: Router.think, scenarioType: 'think' };
  }
  return { model: Router?.default, scenarioType: 'default' };
};

const extractSubagentModel = (req: any): string | undefined => {
  if (
    !Array.isArray(req.body?.system) ||
    req.body.system.length <= 1 ||
    typeof req.body.system[1]?.text !== "string" ||
    !req.body.system[1].text.startsWith("<CCR-SUBAGENT-MODEL>")
  ) {
    return undefined;
  }

  const model = req.body.system[1].text.match(
    /<CCR-SUBAGENT-MODEL>(.*?)<\/CCR-SUBAGENT-MODEL>/s
  );
  if (!model) return undefined;

  req.body.system[1].text = req.body.system[1].text.replace(
    `<CCR-SUBAGENT-MODEL>${model[1]}</CCR-SUBAGENT-MODEL>`,
    ""
  );
  return model[1];
};

export interface RouterContext {
  configService: ConfigService;
  tokenizerService?: TokenizerService;
  event?: any;
}

export type RouterScenarioType =
  | 'default'
  | 'background'
  | 'think'
  | 'longContext'
  | 'webSearch'
  | string;

export interface RouterFallbackConfig {
  default?: string[];
  background?: string[];
  think?: string[];
  longContext?: string[];
  webSearch?: string[];
}

export const router = async (req: any, _res: any, context: RouterContext) => {
  const { configService, event } = context;
  // Parse sessionId from metadata.user_id
  if (req.body.metadata?.user_id) {
    const parts = req.body.metadata.user_id.split("_session_");
    if (parts.length > 1) {
      req.sessionId = parts[1];
    }
  }
  const lastMessageUsage = sessionUsageCache.get(req.sessionId);
  const { messages, system = [], tools }: MessageCreateParamsBase = req.body;
  const rewritePrompt = configService.get("REWRITE_SYSTEM_PROMPT");
  if (
    rewritePrompt &&
    system.length > 1 &&
    system[1]?.text?.includes("<env>")
  ) {
    const prompt = await readFile(rewritePrompt, "utf-8");
    system[1].text = `${prompt}<env>${system[1].text.split("<env>").pop()}`;
  }

  try {
    // Try to get tokenizer config for the current model
    const [providerName, modelName] = req.body.model.split(",");
    const tokenizerConfig = context.tokenizerService?.getTokenizerConfigForModel(
      providerName,
      modelName
    );

    // Use TokenizerService if available, otherwise fall back to legacy method
    let tokenCount: number;

    if (context.tokenizerService) {
      const result = await context.tokenizerService.countTokens(
        {
          messages: messages as MessageParam[],
          system,
          tools: tools as Tool[],
        },
        tokenizerConfig
      );
      tokenCount = result.tokenCount;
    } else {
      // Legacy fallback
      tokenCount = calculateTokenCount(
        messages as MessageParam[],
        system,
        tools as Tool[]
      );
    }

    let model = extractSubagentModel(req);
    const customRouterPath = configService.get("CUSTOM_ROUTER_PATH");
    if (!model && customRouterPath) {
      try {
        const resolved = require.resolve(customRouterPath);
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const realResolved = fs.realpathSync(resolved);
        const allowed = [process.cwd(), os.homedir(), path.join(os.homedir(), '.claude-code-router')];
        const isAllowed = allowed.some(dir => realResolved.startsWith(path.resolve(dir)));
        if (!isAllowed) {
          req.log.error(`Custom router path outside allowed directories: ${realResolved}`);
        } else {
          const customRouter = require(realResolved);
          req.tokenCount = tokenCount;
          model = await customRouter(req, configService.getAll(), {
            event,
          });
        }
      } catch (e: any) {
        req.log.error(`failed to load custom router: ${e.message}`);
      }
    }
    if (!model) {
      const result = await getUseModel(req, tokenCount, configService, lastMessageUsage);
      model = result.model;
      req.scenarioType = result.scenarioType;

      // ====================================================================
      // REASONING-AWARE ROUTING: analyze MCP tools and adjust tier
      // ====================================================================
      try {
        const reasoning = analyzeReasoning(req.body, tokenCount);
        if (reasoning.recommendation === 'flash' && reasoning.reason) {
          // Route simple/relay MCP tool tasks to DeepSeek Flash (cheap, fast)
          const flashProvider = configService.get('Router')?.reasoningFlash || 'deepseek,deepseek-v4-flash';
          req.log.info(`Reasoning: ${reasoning.reason} → routing to flash (${flashProvider})`);
          model = flashProvider;
          req.scenarioType = 'reasoning_flash';
        } else if (reasoning.recommendation === 'pro_max' && reasoning.reason) {
          // Route deep reasoning with sufficient context to DeepSeek Pro
          const proMaxProvider = configService.get('Router')?.reasoningProMax || 'deepseek,deepseek-v4-pro';
          req.log.info(`Reasoning: ${reasoning.reason} → routing to pro max (${proMaxProvider})`);
          model = proMaxProvider;
          req.scenarioType = 'reasoning_pro_max';
        } else if (reasoning.recommendation === 'pro' && reasoning.needsDeepReasoning) {
          // Deep reasoning task with too little context → inject project knowledge
          const enrichment = buildContextInjection(
            configService.get('PROJECT_ROOT') || process.cwd(),
            req.gatewayAgentName || 'default'
          );
          if (enrichment && req.body.system) {
            if (typeof req.body.system === 'string') {
              req.body.system = enrichment + '\n' + req.body.system;
            } else if (Array.isArray(req.body.system)) {
              req.body.system.unshift({ type: 'text', text: enrichment });
            }
            req.log.info(`Reasoning: ${reasoning.reason} → injected context (${enrichment.length} chars)`);
            (req as any)._ragInjected = true;
          }
        }
      } catch (e: any) {
        // Reasoning engine failure → fall through to default routing
        req.log.debug(`Reasoning engine skipped: ${e.message}`);
      }

      // ====================================================================
      // HEALTH-BASED FALLBACK: check if target provider is healthy
      // Falls back to config-driven fallback[scenarioType] or fallback.default
      // ====================================================================
      try {
        const [targetProvider] = model.split(",");
        const healthMonitor = configService.get("_healthMonitor");
        if (healthMonitor && targetProvider) {
          const isHealthy = await healthMonitor.checkBeforeRoute(targetProvider);
          if (!isHealthy) {
            // Use config-driven fallback chain
            const fallbackConfig = configService.get<any>('fallback');
            const scenarioType = req.scenarioType || 'default';
            const fallbackList = fallbackConfig?.[scenarioType] || fallbackConfig?.default || [];
            const fallback = Array.isArray(fallbackList) ? fallbackList[0] : fallbackList;
            if (fallback) {
              req.log.warn(
                `Provider ${targetProvider} is UNHEALTHY → falling back to ${fallback}`
              );
              model = fallback;
              req.scenarioType = 'health_fallback';
            } else {
              req.log.warn(
                `Provider ${targetProvider} is UNHEALTHY and no fallback configured`
              );
            }
          }
        }
      } catch (e: any) {
        req.log.debug(`Health check skipped: ${e?.message}`);
      }

      // ====================================================================
      // ADAPTIVE ROUTER SCORING: use real-time health/latency data to
      // potentially override the model choice with a better-scoring provider
      // ====================================================================
      try {
        const adaptiveR = getAdaptiveRouter();
        if (adaptiveR) {
          const [targetProvider] = model.split(",");
          const candidates = (configService.get<any[]>("providers") || [])
            .filter((p: any) => p.models && p.models.length > 0)
            .map((p: any) => p.name);
          if (candidates.length > 1 && targetProvider) {
            const routeResult = adaptiveR.route(targetProvider, candidates);
            if (routeResult.provider !== targetProvider && routeResult.provider) {
              const targetProviderObj = (configService.get<any[]>("providers") || [])
                .find((p: any) => p.name.toLowerCase() === routeResult.provider!.toLowerCase());
              if (targetProviderObj?.models?.[0]) {
                req.log.info(
                  `AdaptiveRouter: overriding ${targetProvider} → ${routeResult.provider} (score=${routeResult.score.toFixed(2)})`
                );
                model = `${routeResult.provider},${targetProviderObj.models[0]}`;
                req.scenarioType = req.scenarioType || 'adaptive';
              }
            }
          }
        }
      } catch (e: any) {
        req.log.debug(`AdaptiveRouter scoring skipped: ${e.message}`);
      }

      // ====================================================================
      // ADAPTIVE PARAMETER TUNING: auto-tune max_tokens/temperature based
      // on request complexity signals and target model characteristics
      // ====================================================================
      try {
        const tuner = getAdaptiveParameterTuner();
        const [provider, ...modelParts] = model.split(",");
        const modelId = modelParts.join(",");
        const params = tuner.tune(req.body, tokenCount, provider, modelId);
        const tuned = tuner.applyTuning(req.body, params);
        req.body = tuned;
        (req as any)._adaptiveParams = params;
      } catch (e: any) {
        req.log.debug(`AdaptiveParameterTuning skipped: ${e.message}`);
      }
    } else {
      req.scenarioType = req.gatewayScenario || req.scenarioType || 'default';
    }
    req.body.model = model;
  } catch (error: any) {
    req.log.error(`Error in router middleware: ${error.message}`);
    const Router = configService.get("Router");
    req.body.model = Router?.default;
    req.scenarioType = 'default';
  }
  return;
};

// Memory cache for sessionId to project name mapping
// null value indicates previously searched but not found
// Uses LRU cache with max 1000 entries
const sessionProjectCache = new LRUCache<string, string>({
  max: 1000,
});

export const searchProjectBySession = async (
  sessionId: string
): Promise<string | null> => {
  // Check cache first
  if (sessionProjectCache.has(sessionId)) {
    const result = sessionProjectCache.get(sessionId);
    if (!result || result === '') {
      return null;
    }
    return result;
  }

  try {
    const dir = await opendir(CLAUDE_PROJECTS_DIR);
    const folderNames: string[] = [];

    // Collect all folder names
    for await (const dirent of dir) {
      if (dirent.isDirectory()) {
        folderNames.push(dirent.name);
      }
    }

    // Concurrently check each project folder for sessionId.jsonl file
    const checkPromises = folderNames.map(async (folderName) => {
      const sessionFilePath = join(
        CLAUDE_PROJECTS_DIR,
        folderName,
        `${sessionId}.jsonl`
      );
      try {
        const fileStat = await stat(sessionFilePath);
        return fileStat.isFile() ? folderName : null;
      } catch {
        // File does not exist, continue checking next
        return null;
      }
    });

    const results = await Promise.all(checkPromises);

    // Return the first existing project directory name
    for (const result of results) {
      if (result) {
        // Cache the found result
        sessionProjectCache.set(sessionId, result);
        return result;
      }
    }

    // Cache not found result (null value means previously searched but not found)
    sessionProjectCache.set(sessionId, '');
    return null; // No matching project found
  } catch (error) {
    console.error("Error searching for project by session:", error);
    // Cache null result on error to avoid repeated errors
    sessionProjectCache.set(sessionId, '');
    return null;
  }
};
