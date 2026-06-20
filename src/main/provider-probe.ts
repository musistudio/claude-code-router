import type {
  GatewayProviderCapability,
  GatewayProviderProbeProtocolResult,
  GatewayProviderProbeRequest,
  GatewayProviderProbeResult,
  GatewayProviderProtocol
} from "../shared/app";
import { providerApiKeySafetyIssue } from "../shared/provider-presets";
import {
  compactProviderUrl,
  parseProviderBaseUrl,
  providerBaseUrlForProtocol,
  type ParsedProviderBaseUrl
} from "../shared/provider-url";

type ModelSource = NonNullable<GatewayProviderProbeResult["modelSource"]>;

type ParsedProviderUrl = ParsedProviderBaseUrl & {
  hints: GatewayProviderProtocol[];
};

type FetchJsonResult = {
  payload?: unknown;
  status?: number;
  text: string;
};

type ModelProbeResult = {
  baseUrl?: string;
  models: string[];
  source?: ModelSource;
};

type ModelFetchResult = {
  baseUrl?: string;
  models: string[];
};

type ProtocolEndpoint = {
  baseUrl: string;
  endpoint: string;
};

const protocolOrder: GatewayProviderProtocol[] = [
  "openai_responses",
  "openai_chat_completions",
  "anthropic_messages",
  "gemini_generate_content"
];

const modelSourceOrder: ModelSource[] = ["openai", "anthropic", "gemini"];
const probeTimeoutMs = 10000;
const probeOutputTokenLimit = 1;

export async function probeGatewayProvider(request: GatewayProviderProbeRequest): Promise<GatewayProviderProbeResult> {
  const mode = request.mode ?? "protocols";
  const safetyIssue = providerApiKeySafetyIssue({
    apiKey: mode === "connectivity" ? request.apiKey : undefined,
    baseUrl: request.baseUrl
  });
  if (safetyIssue) {
    throw new Error(safetyIssue.message);
  }

  const parsed = parseProviderUrl(request.baseUrl);
  const protocols = uniqueProtocols(request.protocols ?? []);
  const typedModels = uniqueStrings(request.models ?? []);
  const modelProbe = mode === "protocols" || mode === "connectivity" || request.skipModelDiscovery
    ? { models: [] }
    : await probeModels(parsed, request.apiKey, protocols);
  const models = mode === "connectivity" && modelProbe.models.length > 0 ? modelProbe.models : typedModels;
  const protocolResults = await probeProtocols(parsed, request.apiKey, models, protocols, mode);
  const detectedProtocol = detectProtocol(parsed, protocolResults, modelProbe.source, protocols);

  return {
    capabilities: capabilitiesFromProtocolResults(protocolResults),
    detectedProtocol,
    modelSource: modelProbe.source,
    models: modelProbe.models,
    normalizedBaseUrl: detectedProtocol
      ? resolveProbeBaseUrl(parsed, detectedProtocol, protocolResults, modelProbe)
      : parsed.normalizedInputBaseUrl,
    protocols: protocolResults
  };
}

function capabilitiesFromProtocolResults(results: GatewayProviderProbeProtocolResult[]): GatewayProviderCapability[] {
  return results
    .filter((result) => result.supported && result.baseUrl)
    .map((result) => ({
      baseUrl: result.baseUrl as string,
      endpoint: result.endpoint,
      source: "detected" as const,
      type: result.protocol
    }));
}

async function probeModels(
  parsed: ParsedProviderUrl,
  apiKey: string | undefined,
  allowedProtocols: GatewayProviderProtocol[] = []
): Promise<ModelProbeResult> {
  for (const source of orderedModelSources(parsed, allowedProtocols)) {
    const result = await fetchModelsForSource(parsed, source, apiKey);
    if (result.models.length > 0) {
      return {
        baseUrl: result.baseUrl,
        models: result.models,
        source
      };
    }
  }

  return {
    models: []
  };
}

async function fetchModelsForSource(parsed: ParsedProviderUrl, source: ModelSource, apiKey: string | undefined): Promise<ModelFetchResult> {
  if (source === "openai") {
    for (const baseUrl of parsed.openaiBaseUrlCandidates) {
      const result = await requestJson(`${baseUrl}/models`, {
        headers: {
          ...openAiHeaders(apiKey)
        },
        method: "GET"
      });
      const models = parseModelIds(result.payload, "openai");
      if (models.length > 0) {
        return {
          baseUrl,
          models
        };
      }
    }

    return {
      models: []
    };
  }

  if (source === "anthropic") {
    for (const baseUrl of parsed.anthropicBaseUrlCandidates) {
      const result = await requestJson(`${baseUrl}/v1/models`, {
        headers: {
          ...anthropicHeaders(apiKey)
        },
        method: "GET"
      });
      const models = parseModelIds(result.payload, "anthropic");
      if (models.length > 0) {
        return {
          baseUrl,
          models
        };
      }
    }

    return {
      models: []
    };
  }

  const result = await requestJson(withGeminiKey(`${parsed.geminiBaseUrl}/v1beta/models`, apiKey), {
    headers: {
      ...geminiHeaders(apiKey)
    },
    method: "GET"
  });
  return {
    baseUrl: parsed.geminiBaseUrl,
    models: parseModelIds(result.payload, "gemini")
  };
}

async function probeProtocols(
  parsed: ParsedProviderUrl,
  apiKey: string | undefined,
  models: string[],
  allowedProtocols: GatewayProviderProtocol[] = [],
  mode: NonNullable<GatewayProviderProbeRequest["mode"]> = "protocols"
): Promise<GatewayProviderProbeProtocolResult[]> {
  const results: GatewayProviderProbeProtocolResult[] = [];

  for (const protocol of orderedProtocols(parsed, allowedProtocols)) {
    results.push(
      mode === "connectivity"
        ? await probeProtocolConnectivity(parsed, apiKey, models, protocol)
        : await probeProtocolSupport(parsed, protocol)
    );
  }

  return results;
}

async function probeProtocolSupport(
  parsed: ParsedProviderUrl,
  protocol: GatewayProviderProtocol
): Promise<GatewayProviderProbeProtocolResult> {
  const endpoints = endpointsForProtocol(parsed, protocol, undefined);
  const endpoint = endpoints[0]?.endpoint ?? providerBaseUrlForProtocol(parsed, protocol);
  let firstResult: GatewayProviderProbeProtocolResult | undefined;

  for (const candidate of endpoints) {
    const result = await requestJson(candidate.endpoint, requestForProtocolSupport(protocol));
    const message = readResponseMessage(result);
    const supported = isProtocolEndpointSupported(result.status, message);
    const probeResult = {
      baseUrl: candidate.baseUrl,
      endpoint: candidate.endpoint,
      message,
      protocol,
      status: result.status,
      supported
    };

    firstResult ??= probeResult;
    if (supported) {
      return probeResult;
    }
  }

  return firstResult ?? {
    endpoint,
    message: "No endpoint candidates available.",
    protocol,
    supported: false
  };
}

async function probeProtocolConnectivity(
  parsed: ParsedProviderUrl,
  apiKey: string | undefined,
  models: string[],
  protocol: GatewayProviderProtocol
): Promise<GatewayProviderProbeProtocolResult> {
  const model = pickProbeModel(models, protocol);
  const endpoints = endpointsForProtocol(parsed, protocol, model);
  const endpoint = endpoints[0]?.endpoint ?? providerBaseUrlForProtocol(parsed, protocol);

  if (!model) {
    return {
      endpoint,
      message: "Model required before protocol verification.",
      protocol,
      supported: false
    };
  }

  let firstResult: GatewayProviderProbeProtocolResult | undefined;

  for (const candidate of endpoints) {
    const result = await requestJson(candidate.endpoint, requestForProtocol(protocol, model, apiKey));
    const message = readResponseMessage(result);
    const supported = isProtocolSupported(result.status, message);
    const probeResult = {
      baseUrl: candidate.baseUrl,
      endpoint: candidate.endpoint,
      message,
      protocol,
      status: result.status,
      supported
    };

    firstResult ??= probeResult;
    if (supported) {
      return probeResult;
    }
  }

  return firstResult ?? {
    endpoint,
    message: "No endpoint candidates available.",
    protocol,
    supported: false
  };
}

function requestForProtocol(protocol: GatewayProviderProtocol, model: string, apiKey: string | undefined): RequestInit {
  if (protocol === "openai_responses") {
    return {
      body: JSON.stringify({
        input: "ping",
        max_output_tokens: probeOutputTokenLimit,
        model,
        stream: false
      }),
      headers: {
        "content-type": "application/json",
        ...openAiHeaders(apiKey)
      },
      method: "POST"
    };
  }

  if (protocol === "openai_chat_completions") {
    return {
      body: JSON.stringify({
        max_tokens: probeOutputTokenLimit,
        messages: [{ content: "ping", role: "user" }],
        model,
        stream: false
      }),
      headers: {
        "content-type": "application/json",
        ...openAiHeaders(apiKey)
      },
      method: "POST"
    };
  }

  if (protocol === "anthropic_messages") {
    return {
      body: JSON.stringify({
        max_tokens: probeOutputTokenLimit,
        messages: [{ content: "ping", role: "user" }],
        model,
        stream: false
      }),
      headers: {
        "content-type": "application/json",
        ...anthropicHeaders(apiKey)
      },
      method: "POST"
    };
  }

  return {
    body: JSON.stringify({
      contents: [{ parts: [{ text: "ping" }], role: "user" }],
      generationConfig: {
        maxOutputTokens: probeOutputTokenLimit
      }
    }),
    headers: {
      "content-type": "application/json",
      ...geminiHeaders(apiKey)
    },
    method: "POST"
  };
}

function requestForProtocolSupport(protocol: GatewayProviderProtocol): RequestInit {
  return {
    body: JSON.stringify({}),
    headers: {
      "content-type": "application/json",
      ...(protocol === "anthropic_messages" ? { "anthropic-version": "2023-06-01" } : {})
    },
    method: "POST"
  };
}

async function requestJson(url: string, init: RequestInit): Promise<FetchJsonResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), probeTimeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    const text = await response.text();
    return {
      payload: parseJson(text),
      status: response.status,
      text
    };
  } catch (error) {
    return {
      text: formatError(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseProviderUrl(value: string): ParsedProviderUrl {
  const parsed = parseProviderBaseUrl(value);
  const url = new URL(parsed.normalizedInputBaseUrl);
  const hints = uniqueProtocols([...protocolHints(parsed.raw), ...protocolHints(url.hostname)]);

  return {
    ...parsed,
    hints
  };
}

function endpointsForProtocol(
  parsed: ParsedProviderUrl,
  protocol: GatewayProviderProtocol,
  model: string | undefined
): ProtocolEndpoint[] {
  if (protocol === "openai_responses") {
    return parsed.openaiBaseUrlCandidates.map((baseUrl) => ({
      baseUrl,
      endpoint: `${baseUrl}/responses`
    }));
  }

  if (protocol === "openai_chat_completions") {
    return parsed.openaiBaseUrlCandidates.map((baseUrl) => ({
      baseUrl,
      endpoint: `${baseUrl}/chat/completions`
    }));
  }

  if (protocol === "anthropic_messages") {
    return parsed.anthropicBaseUrlCandidates.map((baseUrl) => ({
      baseUrl,
      endpoint: `${baseUrl}/v1/messages`
    }));
  }

  const encodedModel = encodeURIComponent(stripGeminiModelPrefix(model || "model"));
  return [
    {
      baseUrl: parsed.geminiBaseUrl,
      endpoint: `${parsed.geminiBaseUrl}/v1beta/models/${encodedModel}:generateContent`
    }
  ];
}

function withGeminiKey(url: string, apiKey: string | undefined): string {
  if (!apiKey) {
    return url;
  }

  const parsed = new URL(url);
  parsed.searchParams.set("key", apiKey);
  return compactProviderUrl(parsed);
}

function openAiHeaders(apiKey: string | undefined): Record<string, string> {
  return apiKey
    ? {
        authorization: `Bearer ${apiKey}`
      }
    : {};
}

function anthropicHeaders(apiKey: string | undefined): Record<string, string> {
  return {
    "anthropic-version": "2023-06-01",
    ...(apiKey ? { "x-api-key": apiKey } : {})
  };
}

function geminiHeaders(apiKey: string | undefined): Record<string, string> {
  return apiKey
    ? {
        "x-goog-api-key": apiKey
      }
    : {};
}

function parseModelIds(payload: unknown, source: ModelSource): string[] {
  if (!isRecord(payload)) {
    return [];
  }

  const items = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
  const models = items
    .map((item) => readModelId(item, source))
    .filter((item): item is string => Boolean(item));

  return uniqueStrings(models);
}

function readModelId(value: unknown, source: ModelSource): string | undefined {
  if (typeof value === "string") {
    return source === "gemini" ? stripGeminiModelPrefix(value) : value;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const rawId = readString(value.id) || readString(value.name) || readString(value.model);
  if (!rawId) {
    return undefined;
  }

  if (source === "gemini") {
    const methods = Array.isArray(value.supportedGenerationMethods)
      ? value.supportedGenerationMethods.map((item) => String(item))
      : [];
    if (methods.length > 0 && !methods.includes("generateContent")) {
      return undefined;
    }
    return stripGeminiModelPrefix(rawId);
  }

  return rawId;
}

function stripGeminiModelPrefix(value: string): string {
  return value.replace(/^models\//i, "");
}

function pickProbeModel(models: string[], protocol: GatewayProviderProtocol): string | undefined {
  const candidates = uniqueStrings(models);
  if (candidates.length === 0) {
    return undefined;
  }

  if (protocol === "gemini_generate_content") {
    return candidates.find((model) => model.toLowerCase().includes("gemini")) ?? candidates[0];
  }

  if (protocol === "anthropic_messages") {
    return candidates.find((model) => model.toLowerCase().includes("claude")) ?? candidates[0];
  }

  return (
    candidates.find((model) => {
      const normalized = model.toLowerCase();
      return /gpt|o\d|deepseek|qwen|glm|kimi|llama|mistral|command|sonar|yi-|doubao/.test(normalized);
    }) ?? candidates[0]
  );
}

function orderedProtocols(
  parsed: ParsedProviderUrl,
  allowedProtocols: GatewayProviderProtocol[] = []
): GatewayProviderProtocol[] {
  const ordered = uniqueProtocols([...parsed.hints, ...protocolOrder]);
  if (allowedProtocols.length === 0) {
    return ordered;
  }
  const allowed = new Set(allowedProtocols);
  return ordered.filter((protocol) => allowed.has(protocol));
}

function orderedModelSources(
  parsed: ParsedProviderUrl,
  allowedProtocols: GatewayProviderProtocol[] = []
): ModelSource[] {
  const allowedSources = allowedProtocols.length > 0
    ? new Set(allowedProtocols.map(protocolModelSource))
    : undefined;
  const hintedSources = parsed.hints
    .map(protocolModelSource)
    .filter((item): item is ModelSource => Boolean(item));
  const ordered = uniqueModelSources([...hintedSources, ...modelSourceOrder]);
  if (!allowedSources) {
    return ordered;
  }
  return ordered.filter((source) => allowedSources.has(source));
}

function protocolModelSource(protocol: GatewayProviderProtocol): ModelSource {
  if (protocol === "anthropic_messages") {
    return "anthropic";
  }
  if (protocol === "gemini_generate_content") {
    return "gemini";
  }
  return "openai";
}

function orderedProtocolFallback(allowedProtocols: GatewayProviderProtocol[] = []): GatewayProviderProtocol | undefined {
  if (allowedProtocols.length === 0) {
    return undefined;
  }
  const allowed = new Set(allowedProtocols);
  return protocolOrder.find((protocol) => allowed.has(protocol)) ?? allowedProtocols[0];
}

function protocolIsAllowed(protocol: GatewayProviderProtocol, allowedProtocols: GatewayProviderProtocol[]): boolean {
  return allowedProtocols.length === 0 || allowedProtocols.includes(protocol);
}

function detectProtocol(
  parsed: ParsedProviderUrl,
  protocols: GatewayProviderProbeProtocolResult[],
  modelSource: ModelSource | undefined,
  allowedProtocols: GatewayProviderProtocol[] = []
): GatewayProviderProtocol | undefined {
  const supported = protocols.find((item) => item.supported);
  if (supported) {
    return supported.protocol;
  }

  const hinted = parsed.hints.find((protocol) => protocolIsAllowed(protocol, allowedProtocols));
  if (hinted) {
    return hinted;
  }

  if (modelSource === "anthropic" && protocolIsAllowed("anthropic_messages", allowedProtocols)) {
    return "anthropic_messages";
  }

  if (modelSource === "gemini" && protocolIsAllowed("gemini_generate_content", allowedProtocols)) {
    return "gemini_generate_content";
  }

  if (modelSource === "openai") {
    const openAiProtocols = orderedProtocols(parsed, allowedProtocols).filter((protocol) =>
      protocol === "openai_responses" || protocol === "openai_chat_completions"
    );
    return openAiProtocols.find((protocol) => parsed.hints.includes(protocol)) ??
      openAiProtocols.find((protocol) => protocol === "openai_chat_completions") ??
      openAiProtocols[0];
  }

  return orderedProtocolFallback(allowedProtocols);
}

function resolveProbeBaseUrl(
  parsed: ParsedProviderUrl,
  protocol: GatewayProviderProtocol,
  protocols: GatewayProviderProbeProtocolResult[],
  modelProbe: ModelProbeResult
): string {
  const supported = protocols.find((item) => item.protocol === protocol && item.supported && item.baseUrl);
  if (supported?.baseUrl) {
    return supported.baseUrl;
  }

  if (
    (protocol === "openai_responses" || protocol === "openai_chat_completions") &&
    modelProbe.source === "openai" &&
    modelProbe.baseUrl
  ) {
    return modelProbe.baseUrl;
  }

  return providerBaseUrlForProtocol(parsed, protocol);
}

function protocolHints(value: string): GatewayProviderProtocol[] {
  const normalized = value.toLowerCase();
  const hints: GatewayProviderProtocol[] = [];

  if (normalized.includes("chat/completions")) {
    hints.push("openai_chat_completions");
  }
  if (normalized.includes("responses")) {
    hints.push("openai_responses");
  }
  if (normalized.includes("api.openai.com") || normalized.includes("openai")) {
    hints.push("openai_responses");
  }
  if (normalized.includes("anthropic") || normalized.includes("/messages")) {
    hints.push("anthropic_messages");
  }
  if (normalized.includes("generativelanguage.googleapis.com") || normalized.includes("gemini") || normalized.includes("generatecontent")) {
    hints.push("gemini_generate_content");
  }

  return hints;
}

function isProtocolSupported(status: number | undefined, message: string): boolean {
  if (status === undefined) {
    return false;
  }

  if (status >= 200 && status < 300) {
    return true;
  }

  if (status === 429) {
    return true;
  }

  if (status === 400) {
    const normalized = message.toLowerCase();
    return /model|max_tokens|max output|messages|input|required/.test(normalized) && !/not found|unknown endpoint|unknown route|no route/.test(normalized);
  }

  return false;
}

function isProtocolEndpointSupported(status: number | undefined, message: string): boolean {
  if (isProtocolSupported(status, message)) {
    return true;
  }

  if (status === 401 || status === 403) {
    const normalized = message.toLowerCase();
    return !/not found|unknown endpoint|unknown route|no route/.test(normalized);
  }

  return false;
}

function readResponseMessage(result: FetchJsonResult): string {
  if (result.status === undefined) {
    return result.text || "Request failed.";
  }

  const payloadMessage = readPayloadMessage(result.payload);
  if (payloadMessage) {
    return `HTTP ${result.status}: ${payloadMessage}`;
  }

  return `HTTP ${result.status}`;
}

function readPayloadMessage(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const directMessage = readString(payload.message);
  if (directMessage) {
    return directMessage;
  }

  if (isRecord(payload.error)) {
    return readString(payload.error.message) || readString(payload.error.type) || readString(payload.error.code);
  }

  return undefined;
}

function parseJson(value: string): unknown {
  if (!value.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

function uniqueProtocols(values: GatewayProviderProtocol[]): GatewayProviderProtocol[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function uniqueModelSources(values: ModelSource[]): ModelSource[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
