import { ProxyAgent } from "undici";

export type MorphRouterPolicy =
  | "balanced"
  | "cost_efficient"
  | "capability_heavy"
  | "domain_skills";

export interface MorphRouterTargetConfig {
  route?: string;
}

export interface MorphRouterModelConfig {
  name?: string;
  route?: string;
  routes?: Array<string | MorphRouterTargetConfig>;
  targets?: Array<string | MorphRouterTargetConfig>;
}

export interface MorphRouterConfig {
  enabled?: boolean;
  api_key?: string;
  apiKey?: string;
  policy?: MorphRouterPolicy;
  default?: string;
  default_model?: string;
  timeout_ms?: number;
  timeoutMs?: number;
  max_input_chars?: number;
  maxInputChars?: number;
  models?: Record<string, string | MorphRouterModelConfig> | MorphRouterModelConfig[];
}

export interface NormalizedMorphRouterTarget {
  route: string;
  provider: string;
  model: string;
}

export interface NormalizedMorphRouterModel {
  name: string;
  targets: NormalizedMorphRouterTarget[];
}

export interface NormalizedMorphRouterConfig {
  enabled: boolean;
  apiKey?: string;
  policy: MorphRouterPolicy;
  defaultModel?: string;
  timeoutMs: number;
  maxInputChars: number;
  models: NormalizedMorphRouterModel[];
  allowedModels: string[];
  errors: string[];
}

export interface MorphRouterResponse {
  model?: string;
  provider?: string;
  difficulty?: string;
  confidence?: number;
  [key: string]: any;
}

export interface MorphRouterDecision {
  route: string;
  morphModel: string;
  target: NormalizedMorphRouterTarget;
  fallbackTargets: NormalizedMorphRouterTarget[];
  response: MorphRouterResponse;
}

interface MorphRouterLogger {
  warn?: (...args: any[]) => void;
  info?: (...args: any[]) => void;
  error?: (...args: any[]) => void;
  debug?: (...args: any[]) => void;
}

export interface GetMorphRouterDecisionOptions {
  rawConfig: unknown;
  providers: ProviderLike[];
  requestBody: any;
  httpsProxy?: string;
  logger?: MorphRouterLogger;
  fetchImpl?: typeof fetch;
}

interface ProviderLike {
  name?: string;
  models?: string[];
}

const MORPH_ROUTER_API_URL =
  "https://api.morphllm.com/v1/router/multimodel";
const DEFAULT_TIMEOUT_MS = 1000;
const DEFAULT_MAX_INPUT_CHARS = 24000;
const DEFAULT_POLICY: MorphRouterPolicy = "balanced";
const POLICIES = new Set<MorphRouterPolicy>([
  "balanced",
  "cost_efficient",
  "capability_heavy",
  "domain_skills",
]);
const ENV_VAR_PATTERN = /\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g;

export const normalizeMorphRouterConfig = (
  rawConfig: unknown,
  providers: ProviderLike[] = []
): NormalizedMorphRouterConfig => {
  const config = isRecord(rawConfig) ? (rawConfig as MorphRouterConfig) : {};
  const errors: string[] = [];
  const rawApiKey = firstNonEmptyString(config.api_key, config.apiKey);
  const apiKey = interpolateEnvString(rawApiKey);

  const normalized: NormalizedMorphRouterConfig = {
    enabled: config.enabled === true,
    apiKey,
    policy: normalizePolicy(config.policy, errors),
    defaultModel: firstNonEmptyString(config.default_model, config.default),
    timeoutMs: normalizePositiveInteger(
      config.timeout_ms ?? config.timeoutMs,
      DEFAULT_TIMEOUT_MS
    ),
    maxInputChars: normalizePositiveInteger(
      config.max_input_chars ?? config.maxInputChars,
      DEFAULT_MAX_INPUT_CHARS
    ),
    models: [],
    allowedModels: [],
    errors,
  };

  if (!normalized.enabled) {
    return normalized;
  }

  if (!normalized.apiKey) {
    errors.push("MorphRouter.api_key is required when MorphRouter.enabled is true.");
  } else if (containsEnvPlaceholder(normalized.apiKey)) {
    errors.push(
      "MorphRouter.api_key references an environment variable that is not set."
    );
  }

  const modelEntries = normalizeModelEntries(config.models, errors);
  const seenModels = new Set<string>();

  for (const entry of modelEntries) {
    const modelName = entry.name.trim();
    const modelKey = modelName.toLowerCase();
    if (seenModels.has(modelKey)) {
      errors.push(`MorphRouter.models contains duplicate model "${modelName}".`);
      continue;
    }
    seenModels.add(modelKey);

    const targets = normalizeTargets(entry.config, providers, modelName, errors);
    if (targets.length === 0) {
      errors.push(`MorphRouter.models.${modelName} must map to at least one valid CCR route.`);
      continue;
    }

    normalized.models.push({
      name: modelName,
      targets,
    });
  }

  normalized.allowedModels = normalized.models.map((model) => model.name);

  if (normalized.models.length === 0) {
    errors.push("MorphRouter.models must contain at least one enabled model.");
  }

  if (!normalized.defaultModel) {
    errors.push("MorphRouter.default_model is required when MorphRouter.enabled is true.");
  } else if (!seenModels.has(normalized.defaultModel.toLowerCase())) {
    errors.push(
      `MorphRouter.default_model "${normalized.defaultModel}" must match one of MorphRouter.models.`
    );
  }

  return normalized;
};

export const getMorphRouterDecision = async ({
  rawConfig,
  providers,
  requestBody,
  httpsProxy,
  logger,
  fetchImpl = fetch,
}: GetMorphRouterDecisionOptions): Promise<MorphRouterDecision | undefined> => {
  const config = normalizeMorphRouterConfig(rawConfig, providers);

  if (!config.enabled) {
    return undefined;
  }

  if (config.errors.length > 0) {
    logger?.warn?.(
      { errors: config.errors },
      "MorphRouter config is invalid; falling back to default router"
    );
    return undefined;
  }

  const input = extractMorphRouterInput(requestBody, config.maxInputChars);
  if (!input) {
    logger?.warn?.(
      "MorphRouter could not extract request input; falling back to default router"
    );
    return undefined;
  }

  try {
    const response = await callMorphRouter(config, input, httpsProxy, fetchImpl);
    const morphModel = firstNonEmptyString(response.model);

    if (!morphModel) {
      logger?.warn?.(
        { response },
        "MorphRouter response did not include a model; falling back to default router"
      );
      return undefined;
    }

    const model = findMorphRouterModel(config, morphModel);
    if (!model) {
      logger?.warn?.(
        { morphModel, allowedModels: config.allowedModels },
        "MorphRouter returned an unmapped model; falling back to default router"
      );
      return undefined;
    }

    return {
      route: model.targets[0].route,
      morphModel,
      target: model.targets[0],
      fallbackTargets: model.targets.slice(1),
      response,
    };
  } catch (error: any) {
    logger?.warn?.(
      { error: error?.message || String(error) },
      "MorphRouter request failed; falling back to default router"
    );
    return undefined;
  }
};

export const findMorphRouterRouteForModel = (
  config: NormalizedMorphRouterConfig,
  modelName: string
): NormalizedMorphRouterTarget | undefined => {
  return findMorphRouterModel(config, modelName)?.targets[0];
};

export const findMorphRouterModel = (
  config: NormalizedMorphRouterConfig,
  modelName: string
): NormalizedMorphRouterModel | undefined => {
  const model = config.models.find(
    (entry) => entry.name.toLowerCase() === modelName.toLowerCase()
  );
  return model;
};

export const extractMorphRouterInput = (
  requestBody: any,
  maxInputChars = DEFAULT_MAX_INPUT_CHARS
): string => {
  const messages = Array.isArray(requestBody?.messages)
    ? requestBody.messages
    : [];
  const userMessages = messages.filter((message: any) => message?.role === "user");
  const input =
    findLatestTextMessage(userMessages) ||
    findLatestTextMessage(messages) ||
    "";
  const sanitizedInput = sanitizeMorphRouterInput(input) || input;

  if (sanitizedInput.length <= maxInputChars) {
    return sanitizedInput;
  }
  return sanitizedInput.slice(sanitizedInput.length - maxInputChars);
};

export const sanitizeMorphRouterInput = (input: string): string => {
  return input
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, "")
    .replace(/<\/?session>/gi, "")
    .trim();
};

const callMorphRouter = async (
  config: NormalizedMorphRouterConfig,
  input: string,
  httpsProxy: string | undefined,
  fetchImpl: typeof fetch
): Promise<MorphRouterResponse> => {
  const headers = new Headers({
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  });
  const requestBody = {
    input,
    allowed_models: config.allowedModels,
    policy: config.policy,
    default_model: config.defaultModel,
  };
  const fetchOptions: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(config.timeoutMs),
  };

  if (httpsProxy) {
    (fetchOptions as any).dispatcher = new ProxyAgent(
      new URL(httpsProxy).toString()
    );
  }

  const response = await fetchImpl(MORPH_ROUTER_API_URL, fetchOptions);
  if (!response.ok) {
    throw new Error(`Morph Router responded with HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!isRecord(data)) {
    throw new Error("Morph Router returned a non-object response");
  }
  return data as MorphRouterResponse;
};

const normalizePolicy = (
  policy: unknown,
  errors: string[]
): MorphRouterPolicy => {
  if (typeof policy === "undefined") {
    return DEFAULT_POLICY;
  }
  if (typeof policy === "string" && POLICIES.has(policy as MorphRouterPolicy)) {
    return policy as MorphRouterPolicy;
  }
  errors.push(
    `MorphRouter.policy must be one of: ${Array.from(POLICIES).join(", ")}.`
  );
  return DEFAULT_POLICY;
};

const normalizePositiveInteger = (
  value: unknown,
  defaultValue: number
): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultValue;
  }
  return Math.max(1, Math.floor(value));
};

const normalizeModelEntries = (
  models: MorphRouterConfig["models"],
  errors: string[]
): Array<{ name: string; config: string | MorphRouterModelConfig }> => {
  if (!models) {
    return [];
  }

  if (Array.isArray(models)) {
    return models.flatMap((modelConfig, index) => {
      if (!isRecord(modelConfig) || typeof modelConfig.name !== "string" || !modelConfig.name.trim()) {
        errors.push(`MorphRouter.models[${index}].name is required.`);
        return [];
      }
      return [{ name: modelConfig.name, config: modelConfig }];
    });
  }

  if (isRecord(models)) {
    return Object.entries(models).flatMap(([name, modelConfig]) => {
      if (!name.trim()) {
        errors.push("MorphRouter.models contains an empty model name.");
        return [];
      }
      if (typeof modelConfig === "string" || isRecord(modelConfig)) {
        return [{ name, config: modelConfig as string | MorphRouterModelConfig }];
      }
      errors.push(`MorphRouter.models.${name} must be a route string or model config object.`);
      return [];
    });
  }

  errors.push("MorphRouter.models must be an object or array.");
  return [];
};

const normalizeTargets = (
  modelConfig: string | MorphRouterModelConfig,
  providers: ProviderLike[],
  modelName: string,
  errors: string[]
): NormalizedMorphRouterTarget[] => {
  const routeInputs = getRouteInputs(modelConfig);
  if (routeInputs.length === 0) {
    errors.push(`MorphRouter.models.${modelName} has no target routes.`);
    return [];
  }

  const targets: NormalizedMorphRouterTarget[] = [];
  const seenRoutes = new Set<string>();

  for (const routeInput of routeInputs) {
    const route = typeof routeInput === "string" ? routeInput : routeInput.route;
    if (typeof route !== "string" || !route.trim()) {
      errors.push(`MorphRouter.models.${modelName} contains a target without a route.`);
      continue;
    }

    const normalizedRoute = normalizeRoute(route, providers);
    if (!normalizedRoute) {
      errors.push(
        `MorphRouter.models.${modelName} target "${route}" does not match any configured provider/model.`
      );
      continue;
    }

    if (seenRoutes.has(normalizedRoute.route)) {
      continue;
    }
    seenRoutes.add(normalizedRoute.route);
    targets.push(normalizedRoute);
  }

  return targets;
};

const getRouteInputs = (
  modelConfig: string | MorphRouterModelConfig
): Array<string | MorphRouterTargetConfig> => {
  if (typeof modelConfig === "string") {
    return [modelConfig];
  }
  if (typeof modelConfig.route === "string") {
    return [modelConfig.route];
  }
  if (Array.isArray(modelConfig.targets)) {
    return modelConfig.targets;
  }
  if (Array.isArray(modelConfig.routes)) {
    return modelConfig.routes;
  }
  return [];
};

const normalizeRoute = (
  route: string,
  providers: ProviderLike[]
): NormalizedMorphRouterTarget | undefined => {
  const [providerName, ...modelParts] = route.split(",");
  const requestedProvider = providerName?.trim();
  const requestedModel = modelParts.join(",").trim();

  if (!requestedProvider || !requestedModel) {
    return undefined;
  }

  const provider = providers.find(
    (candidate) => candidate.name?.toLowerCase() === requestedProvider.toLowerCase()
  );
  if (!provider || !Array.isArray(provider.models)) {
    return undefined;
  }

  const model = provider.models.find(
    (candidate) => candidate.toLowerCase() === requestedModel.toLowerCase()
  );
  if (!model || !provider.name) {
    return undefined;
  }

  return {
    route: `${provider.name},${model}`,
    provider: provider.name,
    model,
  };
};

const firstNonEmptyString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const interpolateEnvString = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  return value.replace(ENV_VAR_PATTERN, (match, braced, unbraced) => {
    const envValue = process.env[braced || unbraced];
    return envValue || match;
  });
};

const containsEnvPlaceholder = (value: string): boolean => {
  ENV_VAR_PATTERN.lastIndex = 0;
  return ENV_VAR_PATTERN.test(value);
};

const isRecord = (value: unknown): value is Record<string, any> => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const contentToTextParts = (content: unknown): string[] => {
  if (typeof content === "string") {
    return [content];
  }
  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((part: any) => {
    if (!isRecord(part)) {
      return [];
    }
    if (part.type === "text" && typeof part.text === "string") {
      return [part.text];
    }
    if (!("type" in part) && typeof part.text === "string") {
      return [part.text];
    }
    return [];
  });
};

const findLatestTextMessage = (messages: any[]): string | undefined => {
  return [...messages]
    .reverse()
    .map((message: any) => contentToTextParts(message?.content).join("\n").trim())
    .find((text) => text.length > 0);
};

/**
 * Convert a Morph Router decision into a v3 route selector ("provider,model")
 * plus a model-chain fallback list built from the remaining configured targets.
 * The gateway's native `model-chain` fallback then tries each target in order.
 */
export const morphDecisionToRouteChain = (
  decision: MorphRouterDecision
): { primary: string; fallbackModels: string[] } => {
  return {
    primary: decision.target.route,
    fallbackModels: decision.fallbackTargets.map((target) => target.route),
  };
};
