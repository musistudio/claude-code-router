import { createHash } from "node:crypto";
import type {
  GatewayProviderConnectivityCheckReport,
  GatewayProviderConnectivityCheckRequest,
  GatewayProviderCapability,
  GatewayProviderProbeCandidate,
  GatewayProviderProbeCandidateResult,
  GatewayProviderProbeCandidatesRequest,
  GatewayProviderProbeProtocolResult,
  GatewayProviderProbeRequest,
  GatewayProviderProbeResult,
  GatewayProviderCapabilityProtocol,
  GatewayProviderProtocol
} from "@ccr/core/contracts/app";
import { providerApiKeySafetyIssue } from "@ccr/core/providers/presets/index";
import { fetchWithSystemProxy } from "@ccr/core/proxy/system-proxy-fetch";
import {
  compactProviderUrl,
  parseProviderBaseUrl,
  providerBaseUrlForProtocol,
  type ParsedProviderBaseUrl
} from "@ccr/core/providers/url";
import {
  detectedProviderFromHeaders,
  newApiKeyUsageAccountConfig,
  type DetectedProviderKind
} from "@ccr/core/providers/new-api";

type ModelSource = NonNullable<GatewayProviderProbeResult["modelSource"]>;

type ParsedProviderUrl = ParsedProviderBaseUrl & {
  hints: GatewayProviderCapabilityProtocol[];
};

type FetchJsonResult = {
  detectedProvider?: DetectedProviderKind;
  headers?: Record<string, string>;
  payload?: unknown;
  status?: number;
  text: string;
};

type ModelProbeResult = {
  baseUrl?: string;
  modelDisplayNames?: Record<string, string>;
  models: string[];
  source?: ModelSource;
};

type ModelFetchResult = {
  baseUrl?: string;
  modelDisplayNames?: Record<string, string>;
  models: string[];
};

type ProtocolEndpoint = {
  baseUrl: string;
  endpoint: string;
};

type ProbeCacheEntry = {
  expiresAt: number;
  result: GatewayProviderProbeResult;
};

const protocolOrder: GatewayProviderCapabilityProtocol[] = [
  "openai_responses",
  "openai_chat_completions",
  "anthropic_messages",
  "gemini_generate_content",
  "gemini_interactions",
  "openai_image_generations",
  "openai_video_generations"
];

const modelSourceOrder: ModelSource[] = ["openai", "anthropic", "gemini"];
const probeTimeoutMs = 10000;
const probeOutputTokenLimit = 1;
const protocolProbeCacheMs = 60 * 1000;
const connectivityProbeCacheMs = 15 * 1000;
const failedProbeCacheMs = 10 * 1000;
const maxProbeCacheEntries = 500;
const probeCache = new Map<string, ProbeCacheEntry>();
const inFlightProbes = new Map<string, Promise<GatewayProviderProbeResult>>();

export async function probeGatewayProvider(request: GatewayProviderProbeRequest): Promise<GatewayProviderProbeResult> {
  pruneProbeCache();
  const cacheKey = providerProbeCacheKey(request);
  const cached = probeCache.get(cacheKey);
  if (!request.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const inFlight = inFlightProbes.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const probe = resolveGatewayProviderProbe(request);
  inFlightProbes.set(cacheKey, probe);
  probe.then(
    (result) => {
      const cacheTtlMs = providerProbeCacheTtl(request, result);
      probeCache.set(cacheKey, {
        expiresAt: Date.now() + cacheTtlMs,
        result
      });
      pruneProbeCache();
      if (inFlightProbes.get(cacheKey) === probe) {
        inFlightProbes.delete(cacheKey);
      }
    },
    () => {
      if (inFlightProbes.get(cacheKey) === probe) {
        inFlightProbes.delete(cacheKey);
      }
    }
  );
  return probe;
}

export async function probeGatewayProviderCandidates(
  request: GatewayProviderProbeCandidatesRequest
): Promise<GatewayProviderProbeCandidateResult | undefined> {
  const results: GatewayProviderProbeCandidateResult[] = [];
  const mode = request.mode ?? "protocols";

  for (const candidate of request.candidates) {
    const protocols = request.protocols
      ? candidate.protocols.filter((protocol) => request.protocols?.includes(protocol))
      : candidate.protocols;
    if (protocols.length === 0) {
      continue;
    }

    try {
      const probe = await probeGatewayProvider({
        apiKey: mode === "connectivity" || mode === "models" ? request.apiKey : undefined,
        baseUrl: candidate.baseUrl,
        forceRefresh: request.forceRefresh,
        mode,
        models: mode === "connectivity" ? request.models ?? [] : [],
        providerPlugins: request.providerPlugins,
        protocols
      });
      results.push({ candidate, probe });
    } catch {
      // Keep probing later candidates; the UI still receives the best usable result.
    }
  }

  return mergeProviderProbeCandidateResults(results);
}

export async function checkGatewayProviderConnectivity(
  request: GatewayProviderConnectivityCheckRequest
): Promise<GatewayProviderConnectivityCheckReport> {
  const models = uniqueStrings(request.models);
  const checks = await Promise.all(
    models.map(async (model) => {
      try {
        const result = await probeGatewayProviderCandidates({
          apiKey: request.apiKey,
          candidates: request.candidates,
          forceRefresh: request.forceRefresh,
          mode: "connectivity",
          models: [model],
          providerPlugins: request.providerPlugins,
          protocols: request.protocols
        });
        if (!result) {
          return {
            model,
            probe: undefined,
            report: {
              message: "Request failed.",
              model,
              protocols: [],
              supported: false
            }
          };
        }

        const supported = providerProbeHasSupportedProtocol(result.probe);
        return {
          model,
          probe: result.probe,
          report: {
            message: supported
              ? "Connection verified"
              : result.probe.protocols.find((item) => item.message)?.message || "Request failed.",
            model,
            protocols: result.probe.protocols,
            supported
          }
        };
      } catch (error) {
        return {
          model,
          probe: undefined,
          report: {
            message: formatError(error),
            model,
            protocols: [],
            supported: false
          }
        };
      }
    })
  );
  const reports = checks.map((check) => check.report);
  return {
    failed: reports.filter((item) => !item.supported),
    passed: reports.filter((item) => item.supported),
    probe: checks.find((check) => check.report.supported && check.probe)?.probe,
    results: reports
  };
}

async function resolveGatewayProviderProbe(request: GatewayProviderProbeRequest): Promise<GatewayProviderProbeResult> {
  const mode = request.mode ?? "protocols";
  const safetyIssue = providerApiKeySafetyIssue({
    apiKey: mode === "connectivity" || mode === "models" ? request.apiKey : undefined,
    baseUrl: request.baseUrl
  });
  if (safetyIssue) {
    throw new Error(safetyIssue.message);
  }

  const parsed = parseProviderUrl(request.baseUrl);
  const protocols = uniqueProtocols(request.protocols ?? []);
  const typedModels = uniqueStrings(request.models ?? []);
  const modelProbe = mode !== "models" || request.skipModelDiscovery
    ? { models: [] }
    : await probeModels(parsed, request.apiKey, protocols);
  const models = (mode === "connectivity" || mode === "models") && modelProbe.models.length > 0
    ? modelProbe.models
    : typedModels;
  const protocolResults = await probeProtocols(parsed, request.apiKey, models, protocols, mode, request.providerPlugins ?? []);
  const detectedProtocol = detectProtocol(parsed, protocolResults, modelProbe.source, protocols);
  const normalizedBaseUrl = detectedProtocol
    ? resolveProbeBaseUrl(parsed, detectedProtocol, protocolResults, modelProbe)
    : parsed.normalizedInputBaseUrl;
  const detectedProvider = detectProvider(protocolResults);
  const account = detectedProvider === "new-api" ? newApiKeyUsageAccountConfig(normalizedBaseUrl) : undefined;

  return {
    ...(account ? { account } : {}),
    capabilities: capabilitiesFromProtocolResults(protocolResults),
    ...(detectedProvider ? { detectedProvider } : {}),
    detectedProtocol,
    modelDisplayNames: modelProbe.modelDisplayNames,
    modelSource: modelProbe.source,
    models: modelProbe.models,
    normalizedBaseUrl,
    protocols: protocolResults
  };
}

function providerProbeCacheKey(request: GatewayProviderProbeRequest): string {
  return JSON.stringify({
    apiKeyHash: hashSensitiveValue(request.apiKey ?? ""),
    baseUrl: request.baseUrl.trim(),
    mode: request.mode ?? "protocols",
    models: uniqueStrings(request.models ?? []),
    providerPluginsHash: hashSensitiveValue(JSON.stringify(request.providerPlugins ?? [])),
    protocols: uniqueProtocols(request.protocols ?? []),
    skipModelDiscovery: request.skipModelDiscovery === true
  });
}

function providerProbeCacheTtl(request: GatewayProviderProbeRequest, result: GatewayProviderProbeResult): number {
  const hasSupportedProtocol = providerProbeHasSupportedProtocol(result);
  if (!hasSupportedProtocol && result.models.length === 0) {
    return failedProbeCacheMs;
  }
  return (request.mode ?? "protocols") === "connectivity"
    ? connectivityProbeCacheMs
    : protocolProbeCacheMs;
}

function pruneProbeCache(now = Date.now()): void {
  for (const [key, entry] of probeCache.entries()) {
    if (entry.expiresAt <= now) {
      probeCache.delete(key);
    }
  }
  if (probeCache.size <= maxProbeCacheEntries) {
    return;
  }

  const oldestEntries = [...probeCache.entries()]
    .sort(([, left], [, right]) => left.expiresAt - right.expiresAt)
    .slice(0, probeCache.size - maxProbeCacheEntries);
  for (const [key] of oldestEntries) {
    probeCache.delete(key);
  }
}

function hashSensitiveValue(value: string): string {
  return value
    ? createHash("sha256").update(value).digest("hex").slice(0, 16)
    : "";
}

function providerProbeHasSupportedProtocol(probe: GatewayProviderProbeResult): boolean {
  return probe.protocols.some((item) => item.supported);
}

function mergeProviderProbeCandidateResults(
  results: GatewayProviderProbeCandidateResult[]
): GatewayProviderProbeCandidateResult | undefined {
  if (results.length === 0) {
    return undefined;
  }

  const usable = results.find((result) => providerProbeResultIsUsable(result.probe)) ?? results[0];
  const capabilities = mergeProviderCapabilities(
    ...results.map((result) => providerProbeCapabilities(result.candidate, result.probe))
  );
  const models = uniqueStrings(results.flatMap((result) => result.probe.models));
  const protocols = results.flatMap((result) => result.probe.protocols);
  const detectedCapability = capabilities.find((capability) => capability.type === usable.probe.detectedProtocol)
    ?? capabilities.find((capability) => isChatProtocol(capability.type));
  const probe: GatewayProviderProbeResult = {
    ...usable.probe,
    capabilities,
    detectedProtocol: detectedCapability && isChatProtocol(detectedCapability.type)
      ? detectedCapability.type
      : usable.probe.detectedProtocol,
    models,
    normalizedBaseUrl: detectedCapability?.baseUrl ?? usable.probe.normalizedBaseUrl,
    protocols
  };

  return {
    candidate: usable.candidate,
    probe
  };
}

function providerProbeResultIsUsable(probe: GatewayProviderProbeResult): boolean {
  return Boolean(probe.detectedProtocol || probe.models.length > 0 || probe.protocols.some((item) => item.supported));
}

function providerProbeCapabilities(
  candidate: GatewayProviderProbeCandidate,
  probe: GatewayProviderProbeResult
): GatewayProviderCapability[] {
  const detectedCapabilities = mergeProviderCapabilities(probe.capabilities ?? []);
  const presetCapabilities = providerProbePresetCapabilities(candidate);
  return mergeProviderCapabilities(detectedCapabilities, presetCapabilities);
}

function providerProbePresetCapabilities(candidate: GatewayProviderProbeCandidate): GatewayProviderCapability[] {
  if (candidate.source !== "preset") {
    return [];
  }

  return uniqueProtocols(candidate.declaredProtocols ?? []).map((type) => ({
    baseUrl: providerProbeCandidateBaseUrlForProtocol(candidate.baseUrl, type),
    source: "preset" as const,
    type
  }));
}

function providerProbeCandidateBaseUrlForProtocol(baseUrl: string, protocol: GatewayProviderCapabilityProtocol): string {
  try {
    return providerBaseUrlForCapability(parseProviderBaseUrl(baseUrl), protocol);
  } catch {
    return baseUrl.trim();
  }
}

function mergeProviderCapabilities(...groups: GatewayProviderCapability[][]): GatewayProviderCapability[] {
  const seen = new Set<string>();
  const capabilities: GatewayProviderCapability[] = [];
  for (const group of groups) {
    for (const capability of group) {
      const baseUrl = capability.baseUrl.trim();
      if (!baseUrl) {
        continue;
      }
      const key = `${capability.type}\n${baseUrl}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      capabilities.push({
        baseUrl,
        endpoint: capability.endpoint,
        source: capability.source,
        type: capability.type
      });
    }
  }
  return capabilities;
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
  allowedProtocols: GatewayProviderCapabilityProtocol[] = []
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
      const modelList = parseModelList(result.payload, "openai");
      if (modelList.models.length > 0) {
        return {
          baseUrl,
          ...modelList
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
      const modelList = parseModelList(result.payload, "anthropic");
      if (modelList.models.length > 0) {
        return {
          baseUrl,
          ...modelList
        };
      }
    }

    return {
      models: []
    };
  }

  const result = await requestJson(withGeminiKey(geminiApiEndpoint(parsed.geminiBaseUrl, "models"), apiKey), {
    headers: {
      ...geminiHeaders(apiKey)
    },
    method: "GET"
  });
  return {
    baseUrl: parsed.geminiBaseUrl,
    ...parseModelList(result.payload, "gemini")
  };
}

async function probeProtocols(
  parsed: ParsedProviderUrl,
  apiKey: string | undefined,
  models: string[],
  allowedProtocols: GatewayProviderCapabilityProtocol[] = [],
  mode: NonNullable<GatewayProviderProbeRequest["mode"]> = "protocols",
  providerPlugins: unknown[] = []
): Promise<GatewayProviderProbeProtocolResult[]> {
  const results: GatewayProviderProbeProtocolResult[] = [];

  for (const protocol of orderedProtocols(parsed, allowedProtocols)) {
    results.push(
      mode === "connectivity" && isChatProtocol(protocol)
        ? await probeProtocolConnectivity(parsed, apiKey, models, protocol, providerPlugins)
        : await probeProtocolSupport(parsed, apiKey, protocol)
    );
  }

  return results;
}

async function probeProtocolSupport(
  parsed: ParsedProviderUrl,
  apiKey: string | undefined,
  protocol: GatewayProviderCapabilityProtocol
): Promise<GatewayProviderProbeProtocolResult> {
  const endpoints = endpointsForProtocol(parsed, protocol, undefined);
  const endpoint = endpoints[0]?.endpoint ?? providerBaseUrlForCapability(parsed, protocol);
  let firstResult: GatewayProviderProbeProtocolResult | undefined;

  for (const candidate of endpoints) {
    const result = await requestJson(candidate.endpoint, requestForProtocolSupport(protocol, apiKey));
    const message = readResponseMessage(result);
    const supported = isProviderProtocolEndpointSupportedForProbe(result.status, message, protocol, parsed.hints);
    const probeResult = {
      baseUrl: candidate.baseUrl,
      ...(result.detectedProvider ? { detectedProvider: result.detectedProvider } : {}),
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
  protocol: GatewayProviderCapabilityProtocol,
  providerPlugins: unknown[] = []
): Promise<GatewayProviderProbeProtocolResult> {
  const model = pickProbeModel(models, protocol);
  const endpoints = endpointsForProtocol(parsed, protocol, model);
  const endpoint = endpoints[0]?.endpoint ?? providerBaseUrlForCapability(parsed, protocol);

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
    const request = providerProbeAuthRequest(
      candidate.endpoint,
      requestForProtocol(protocol, model, apiKey),
      providerPlugins
    );
    const result = await requestJson(request.url, request.init);
    const message = readResponseMessage(result);
    const supported = isProtocolSupported(result.status, message, protocol);
    const probeResult = {
      baseUrl: candidate.baseUrl,
      ...(result.detectedProvider ? { detectedProvider: result.detectedProvider } : {}),
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

function requestForProtocol(protocol: GatewayProviderCapabilityProtocol, model: string, apiKey: string | undefined): RequestInit {
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

  if (protocol === "gemini_interactions") {
    return {
      body: JSON.stringify({
        generation_config: {
          max_output_tokens: probeOutputTokenLimit
        },
        input: "ping",
        model,
        store: false
      }),
      headers: {
        "content-type": "application/json",
        ...geminiHeaders(apiKey)
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

function requestForProtocolSupport(protocol: GatewayProviderCapabilityProtocol, apiKey: string | undefined): RequestInit {
  return {
    body: JSON.stringify(mediaProbeBody(protocol)),
    headers: {
      "content-type": "application/json",
      ...headersForProtocol(protocol, apiKey)
    },
    method: "POST"
  };
}

function mediaProbeBody(protocol: GatewayProviderCapabilityProtocol): Record<string, unknown> {
  if (protocol === "openai_image_generations") {
    return {
      model: "__ccr_media_protocol_probe__",
      n: 0,
      prompt: ""
    };
  }
  if (protocol === "openai_video_generations") {
    return {
      duration: 0,
      model: "__ccr_media_protocol_probe__",
      prompt: ""
    };
  }
  return {};
}

function providerProbeAuthRequest(
  url: string,
  init: RequestInit,
  providerPlugins: unknown[]
): { init: RequestInit; url: string } {
  const auth = providerPlugins
    .map(providerPluginAuth)
    .find((item): item is Record<string, unknown> => Boolean(item));
  if (!auth) {
    return { init, url };
  }

  const headers = new Headers(init.headers);
  for (const header of readStringArray(auth.removeHeaders)) {
    headers.delete(header);
  }
  for (const [name, value] of Object.entries(isRecord(auth.headers) ? auth.headers : {})) {
    const headerValue = readString(value);
    if (headerValue) {
      headers.set(name, headerValue);
    }
  }

  const nextUrl = new URL(url);
  for (const [name, value] of Object.entries(isRecord(auth.query) ? auth.query : {})) {
    const queryValue = readString(value);
    if (queryValue) {
      nextUrl.searchParams.set(name, queryValue);
    }
  }

  return {
    init: {
      ...init,
      headers
    },
    url: nextUrl.toString()
  };
}

function providerPluginAuth(plugin: unknown): Record<string, unknown> | undefined {
  if (!isRecord(plugin) || !isRecord(plugin.auth)) {
    return undefined;
  }
  return plugin.auth;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(readString).filter((item): item is string => Boolean(item))
    : [];
}

async function requestJson(url: string, init: RequestInit): Promise<FetchJsonResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), probeTimeoutMs);

  try {
    const response = await fetchWithSystemProxy(url, {
      ...init,
      signal: controller.signal
    });
    const text = await response.text();
    const headers = responseHeadersRecord(response.headers);
    return {
      detectedProvider: detectedProviderFromHeaders(headers),
      headers,
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

function detectProvider(protocols: GatewayProviderProbeProtocolResult[]): DetectedProviderKind | undefined {
  return protocols.find((item) => item.detectedProvider)?.detectedProvider;
}

function responseHeadersRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
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
  protocol: GatewayProviderCapabilityProtocol,
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
    return parsed.anthropicBaseUrlCandidates.flatMap((baseUrl) => uniqueProtocolEndpoints([
      {
        baseUrl,
        endpoint: `${baseUrl}/v1/messages`
      },
      {
        baseUrl,
        endpoint: `${baseUrl}/messages`
      }
    ]));
  }

  if (protocol === "gemini_interactions") {
    return [
      {
        baseUrl: parsed.geminiBaseUrl,
        endpoint: geminiApiEndpoint(parsed.geminiBaseUrl, "interactions", "v1beta")
      },
      {
        baseUrl: parsed.geminiBaseUrl,
        endpoint: geminiApiEndpoint(parsed.geminiBaseUrl, "interactions", "v1")
      }
    ];
  }

  if (protocol === "openai_image_generations") {
    return parsed.openaiBaseUrlCandidates.map((baseUrl) => ({
      baseUrl,
      endpoint: `${baseUrl}/images/generations`
    }));
  }

  if (protocol === "openai_video_generations") {
    return parsed.openaiBaseUrlCandidates.map((baseUrl) => ({
      baseUrl,
      endpoint: `${baseUrl}/videos/generations`
    }));
  }

  const encodedModel = encodeURIComponent(stripGeminiModelPrefix(model || "model"));
  return [
    {
      baseUrl: parsed.geminiBaseUrl,
      endpoint: geminiApiEndpoint(parsed.geminiBaseUrl, `models/${encodedModel}:generateContent`)
    }
  ];
}

function geminiApiEndpoint(baseUrl: string, path: string, defaultVersion: "v1" | "v1beta" = "v1beta"): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  if (/\/v1(?:beta)?$/i.test(normalizedBaseUrl)) {
    return `${normalizedBaseUrl}/${path}`;
  }
  return `${normalizedBaseUrl}/${defaultVersion}/${path}`;
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

function headersForProtocol(protocol: GatewayProviderCapabilityProtocol, apiKey: string | undefined): Record<string, string> {
  if (protocol === "anthropic_messages") {
    return anthropicHeaders(apiKey);
  }
  if (protocol === "gemini_generate_content" || protocol === "gemini_interactions") {
    return geminiHeaders(apiKey);
  }
  return openAiHeaders(apiKey);
}

function parseModelList(payload: unknown, source: ModelSource): Pick<ModelFetchResult, "modelDisplayNames" | "models"> {
  if (!isRecord(payload)) {
    return {
      models: []
    };
  }

  const items = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
  const models: string[] = [];
  const modelDisplayNames: Record<string, string> = {};

  for (const item of items) {
    const model = readModelId(item, source);
    if (!model) {
      continue;
    }
    models.push(model);

    const displayName = readModelDisplayName(item);
    if (displayName && displayName !== model) {
      modelDisplayNames[model] = displayName;
    }
  }

  const uniqueModels = uniqueStrings(models);
  const uniqueDisplayNames = Object.fromEntries(
    uniqueModels
      .map((model) => [model, modelDisplayNames[model]] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
  );

  return {
    modelDisplayNames: Object.keys(uniqueDisplayNames).length > 0 ? uniqueDisplayNames : undefined,
    models: uniqueModels
  };
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

function readModelDisplayName(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return readString(value.display_name) || readString(value.displayName) || readString(value.label);
}

function stripGeminiModelPrefix(value: string): string {
  return value.replace(/^models\//i, "");
}

function pickProbeModel(models: string[], protocol: GatewayProviderCapabilityProtocol): string | undefined {
  const candidates = uniqueStrings(models);
  if (candidates.length === 0) {
    return undefined;
  }

  if (protocol === "gemini_generate_content" || protocol === "gemini_interactions") {
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
  allowedProtocols: GatewayProviderCapabilityProtocol[] = []
): GatewayProviderCapabilityProtocol[] {
  const ordered = uniqueProtocols([...parsed.hints, ...protocolOrder]);
  if (allowedProtocols.length === 0) {
    return ordered;
  }
  const allowed = new Set(allowedProtocols);
  return ordered.filter((protocol) => allowed.has(protocol));
}

function orderedModelSources(
  parsed: ParsedProviderUrl,
  allowedProtocols: GatewayProviderCapabilityProtocol[] = []
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

function protocolModelSource(protocol: GatewayProviderCapabilityProtocol): ModelSource {
  if (protocol === "anthropic_messages") {
    return "anthropic";
  }
  if (protocol === "gemini_generate_content" || protocol === "gemini_interactions") {
    return "gemini";
  }
  return "openai";
}

function isChatProtocol(protocol: GatewayProviderCapabilityProtocol): protocol is GatewayProviderProtocol {
  return protocol !== "openai_image_generations" && protocol !== "openai_video_generations";
}

function isMediaProtocol(protocol: GatewayProviderCapabilityProtocol): boolean {
  return !isChatProtocol(protocol);
}

function orderedProtocolFallback(allowedProtocols: GatewayProviderCapabilityProtocol[] = []): GatewayProviderProtocol | undefined {
  const chatProtocols = allowedProtocols.filter(isChatProtocol);
  if (chatProtocols.length === 0) {
    return undefined;
  }
  const allowed = new Set(chatProtocols);
  return protocolOrder.find((protocol): protocol is GatewayProviderProtocol => isChatProtocol(protocol) && allowed.has(protocol))
    ?? chatProtocols[0];
}

function protocolIsAllowed(protocol: GatewayProviderProtocol, allowedProtocols: GatewayProviderCapabilityProtocol[]): boolean {
  return allowedProtocols.length === 0 || allowedProtocols.includes(protocol);
}

function detectProtocol(
  parsed: ParsedProviderUrl,
  protocols: GatewayProviderProbeProtocolResult[],
  modelSource: ModelSource | undefined,
  allowedProtocols: GatewayProviderCapabilityProtocol[] = []
): GatewayProviderProtocol | undefined {
  const supported = protocols.find((item) => item.supported && isChatProtocol(item.protocol));
  if (supported) {
    return supported.protocol as GatewayProviderProtocol;
  }

  const hinted = parsed.hints.find((protocol): protocol is GatewayProviderProtocol =>
    isChatProtocol(protocol) && protocolIsAllowed(protocol, allowedProtocols)
  );
  if (hinted) {
    return hinted;
  }

  if (modelSource === "anthropic" && protocolIsAllowed("anthropic_messages", allowedProtocols)) {
    return "anthropic_messages";
  }

  if (modelSource === "gemini") {
    const geminiProtocols = orderedProtocols(parsed, allowedProtocols).filter((protocol) =>
      protocol === "gemini_generate_content" || protocol === "gemini_interactions"
    );
    return geminiProtocols.find((protocol) => parsed.hints.includes(protocol)) ??
      geminiProtocols.find((protocol) => protocol === "gemini_generate_content") ??
      geminiProtocols[0];
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

function protocolHints(value: string): GatewayProviderCapabilityProtocol[] {
  const normalized = value.toLowerCase();
  const hints: GatewayProviderCapabilityProtocol[] = [];

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
  if (normalized.includes("interactions") || normalized.includes("gemini_interactions") || normalized.includes("google_interactions")) {
    hints.push("gemini_interactions");
  }
  if (normalized.includes("generativelanguage.googleapis.com") || normalized.includes("gemini") || normalized.includes("generatecontent")) {
    hints.push("gemini_generate_content");
  }
  if (normalized.includes("generativelanguage.googleapis.com")) {
    hints.push("gemini_interactions");
  }
  if (normalized.includes("images/generations")) {
    hints.push("openai_image_generations");
  }
  if (normalized.includes("videos/generations")) {
    hints.push("openai_video_generations");
  }

  return hints;
}

function isProtocolSupported(
  status: number | undefined,
  message: string,
  protocol?: GatewayProviderCapabilityProtocol
): boolean {
  if (status === undefined) {
    return false;
  }

  if (status >= 200 && status < 300) {
    return true;
  }

  if (status === 429) {
    return true;
  }

  if (status === 400 || status === 422) {
    const normalized = message.toLowerCase();
    if (/not found|unknown endpoint|unknown route|no route/.test(normalized)) {
      return false;
    }
    return true;
  }

  return false;
}

export function isProviderProtocolEndpointSupportedForProbe(
  status: number | undefined,
  message: string,
  protocol: GatewayProviderCapabilityProtocol,
  hints: GatewayProviderCapabilityProtocol[] = []
): boolean {
  if (isProtocolSupported(status, message, protocol)) {
    return true;
  }

  if (status === 401 || status === 403) {
    const normalized = message.toLowerCase();
    const hintMatches = isMediaProtocol(protocol)
      ? status === 401 || hints.includes(protocol)
      : hints.length === 0 || protocolMatchesHints(protocol, hints);
    return hintMatches &&
      !/not found|unknown endpoint|unknown route|no route/.test(normalized);
  }

  return false;
}

function protocolMatchesHints(protocol: GatewayProviderCapabilityProtocol, hints: GatewayProviderCapabilityProtocol[]): boolean {
  if (hints.includes(protocol)) {
    return true;
  }
  if (protocol === "openai_chat_completions") {
    return hints.includes("openai_responses");
  }
  if (protocol === "openai_responses") {
    return hints.includes("openai_chat_completions");
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

function uniqueProtocols(values: GatewayProviderCapabilityProtocol[]): GatewayProviderCapabilityProtocol[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function providerBaseUrlForCapability(
  parsed: ParsedProviderBaseUrl,
  protocol: GatewayProviderCapabilityProtocol
): string {
  return isChatProtocol(protocol) ? providerBaseUrlForProtocol(parsed, protocol) : parsed.openaiBaseUrl;
}

function uniqueProtocolEndpoints(values: ProtocolEndpoint[]): ProtocolEndpoint[] {
  const seen = new Set<string>();
  const result: ProtocolEndpoint[] = [];
  for (const value of values) {
    const key = `${value.baseUrl}\n${value.endpoint}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function uniqueModelSources(values: ModelSource[]): ModelSource[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
