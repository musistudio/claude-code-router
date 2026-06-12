/**
 * Optional Morph Model Router integration for Claude Code Router (CCR).
 *
 * Install by copying this file into ~/.claude-code-router/morph-router.cjs and
 * setting CUSTOM_ROUTER_PATH in ~/.claude-code-router/config.json.
 *
 * This router is BYO-key and fail-open: if MORPH_ROUTER is disabled, the
 * Morph API key is missing, Morph times out, or Morph returns a route that is
 * not configured in CCR, it returns a configured fallback route or null so CCR
 * falls back to its normal Router.
 */

const DEFAULT_ENDPOINT = "https://api.morphllm.com/v1/router/multimodel";
const DEFAULT_TIMEOUT_MS = 750;
const DEFAULT_MAX_INPUT_CHARS = 24000;

module.exports = async function morphRouter(req, config) {
  const options = config.MORPH_ROUTER || {};
  if (!options.enabled) return null;

  const apiKey = resolveSecret(options.api_key) || process.env.MORPH_API_KEY;
  if (!apiKey) {
    req.log?.debug?.("MORPH_ROUTER enabled but MORPH_API_KEY is not set");
    return null;
  }

  if (shouldPreserveCcrRoute(req, config, options)) return null;

  const input = extractLatestUserText(req.body?.messages || []);
  if (!input) return null;

  const payload = {
    input: truncateForRouter(input, options.max_input_chars || DEFAULT_MAX_INPUT_CHARS),
    policy: options.policy || "balanced",
    default_model: options.default_model,
    allowed_models: options.allowed_models,
    allowed_providers: options.allowed_providers,
  };

  for (const key of Object.keys(payload)) {
    if (payload[key] == null) delete payload[key];
  }

  try {
    const decision = await callMorphRouter({
      endpoint: options.endpoint || DEFAULT_ENDPOINT,
      apiKey,
      payload,
      timeoutMs: options.timeout_ms || DEFAULT_TIMEOUT_MS,
    });

    const route = mapMorphDecisionToCcrRoute(decision, config, options);
    if (!route) {
      req.log?.warn?.({ decision }, "Morph router returned an unconfigured route");
      return resolveFallbackRoute(config, options);
    }

    req.log?.info?.({ route, decision }, "Morph router selected CCR route");
    return route;
  } catch (error) {
    req.log?.warn?.({ error: error.message }, "Morph router failed; falling back to CCR");
    return resolveFallbackRoute(config, options);
  }
};

function resolveSecret(value) {
  if (!value || typeof value !== "string") return value;
  const braced = value.match(/^\$\{([A-Z0-9_]+)\}$/i);
  if (braced) return process.env[braced[1]];
  const bare = value.match(/^\$([A-Z0-9_]+)$/i);
  if (bare) return process.env[bare[1]];
  return value;
}

function shouldPreserveCcrRoute(req, config, options) {
  const body = req.body || {};
  const router = config.Router || {};

  if (typeof body.model === "string" && body.model.includes(",")) return true;

  if (hasSubagentModelDirective(body)) return true;

  if (!options.route_thinking && body.thinking) return true;

  if (!options.route_web_search && hasWebSearchTool(body.tools)) return true;

  const threshold = router.longContextThreshold || 60000;
  if (!options.route_long_context && req.tokenCount && req.tokenCount > threshold) {
    return true;
  }

  if (
    !options.route_background &&
    typeof body.model === "string" &&
    body.model.includes("claude") &&
    body.model.includes("haiku") &&
    router.background
  ) {
    return true;
  }

  return false;
}

function hasSubagentModelDirective(body) {
  const system = body.system;
  if (!system) return false;

  const entries = Array.isArray(system) ? system : [system];
  return entries.some((entry) => {
    const text = typeof entry === "string" ? entry : entry?.text;
    return typeof text === "string" && text.includes("<CCR-SUBAGENT-MODEL>");
  });
}

function hasWebSearchTool(tools) {
  if (!Array.isArray(tools)) return false;
  return tools.some((tool) => {
    const name = tool?.name || tool?.function?.name || "";
    return tool?.type?.startsWith?.("web_search") || /web[_-]?search/.test(name.toLowerCase());
  });
}

function extractLatestUserText(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;

    const text = contentToText(message.content)
      .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
      .replace(/<CCR-SUBAGENT-MODEL>[\s\S]*?<\/CCR-SUBAGENT-MODEL>/g, "")
      .trim();

    if (text) return text;
  }

  return "";
}

function contentToText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part?.type === "text" && typeof part.text === "string") return part.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function truncateForRouter(input, maxChars) {
  const configuredLimit = Number(maxChars);
  const limit =
    Number.isFinite(configuredLimit) && configuredLimit > 0
      ? configuredLimit
      : DEFAULT_MAX_INPUT_CHARS;

  if (input.length <= limit) return input;

  const marker = "\n\n[...truncated for Morph router...]\n\n";
  if (limit <= marker.length) return input.slice(0, limit);

  const keep = limit - marker.length;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${input.slice(0, head)}${marker}${input.slice(-tail)}`;
}

async function callMorphRouter({ endpoint, apiKey, payload, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Morph router request failed with HTTP ${response.status}`);
    }

    const body = await response.json().catch(() => ({}));
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function mapMorphDecisionToCcrRoute(decision, config, options) {
  const provider = decision?.provider;
  const model = decision?.model;
  if (!provider || !model) return null;

  const providerMap = options.provider_map || {};
  const modelMap = options.model_map || {};

  const ccrProvider = providerMap[provider] || provider;
  const ccrModel =
    modelMap[`${provider}:${model}`] ||
    modelMap[`${provider}/${model}`] ||
    modelMap[model] ||
    model;

  if (options.allow_unconfigured_routes || hasConfiguredModel(config, ccrProvider, ccrModel)) {
    return `${ccrProvider},${ccrModel}`;
  }

  return null;
}

function hasConfiguredModel(config, providerName, modelName) {
  const providers = config.Providers || config.providers || [];
  const provider = providers.find((entry) => entry.name === providerName);
  return Boolean(provider && Array.isArray(provider.models) && provider.models.includes(modelName));
}

function resolveFallbackRoute(config, options) {
  if (!options.fallback) return null;
  if (options.allow_unconfigured_routes) return options.fallback;

  const [provider, ...modelParts] = options.fallback.split(",");
  const model = modelParts.join(",");
  if (!provider || !model) return null;

  return hasConfiguredModel(config, provider, model) ? options.fallback : null;
}

module.exports._test = {
  contentToText,
  extractLatestUserText,
  hasConfiguredModel,
  mapMorphDecisionToCcrRoute,
  resolveFallbackRoute,
  shouldPreserveCcrRoute,
  truncateForRouter,
};
