import type { GatewayProviderProtocol } from "@ccr/core/contracts/app";

export type ParsedProviderBaseUrl = {
  anthropicBaseUrl: string;
  anthropicBaseUrlCandidates: string[];
  geminiBaseUrl: string;
  normalizedInputBaseUrl: string;
  openaiBaseUrl: string;
  openaiBaseUrlCandidates: string[];
  raw: string;
  rootBaseUrl: string;
};

export function parseProviderBaseUrl(value: string): ParsedProviderBaseUrl {
  const raw = value.trim();
  if (!raw) {
    throw new Error("Base URL is required.");
  }

  const url = new URL(providerUrlWithDefaultScheme(raw));
  url.username = "";
  url.password = "";
  url.hash = "";
  url.search = "";
  url.pathname = stripProviderEndpointPath(url.pathname);
  url.pathname = stripNestedProviderApiVersion(url.pathname);

  const normalizedInputBaseUrl = compactProviderUrl(url);
  const rootBaseUrl = stripProviderApiVersion(normalizedInputBaseUrl);
  const anthropicBaseUrl = rootBaseUrl;
  const anthropicBaseUrlCandidates = shouldProbeAnthropicPrefixFallback(anthropicBaseUrl)
    ? uniqueProviderUrls([anthropicBaseUrl, appendProviderPathSegment(anthropicBaseUrl, "anthropic")])
    : [anthropicBaseUrl];
  const openaiBaseUrl = normalizedInputBaseUrl;
  const openaiBaseUrlCandidates = shouldProbeOpenAiV1Fallback(openaiBaseUrl)
    ? uniqueProviderUrls([openaiBaseUrl, ensureProviderApiVersion(rootBaseUrl, "v1")])
    : [openaiBaseUrl];

  return {
    anthropicBaseUrl,
    anthropicBaseUrlCandidates,
    geminiBaseUrl: rootBaseUrl,
    normalizedInputBaseUrl,
    openaiBaseUrl,
    openaiBaseUrlCandidates,
    raw,
    rootBaseUrl
  };
}

export function normalizeProviderBaseUrl(value: string, protocol?: GatewayProviderProtocol): string {
  const raw = value.trim();
  if (!raw) {
    return "";
  }

  try {
    const parsed = parseProviderBaseUrl(raw);
    return protocol ? providerBaseUrlForProtocol(parsed, protocol) : parsed.normalizedInputBaseUrl;
  } catch {
    return normalizeProviderBaseUrlText(raw, protocol);
  }
}

export function providerBaseUrlForProtocol(parsed: ParsedProviderBaseUrl, protocol: GatewayProviderProtocol): string {
  if (protocol === "openai_responses" || protocol === "openai_chat_completions") {
    return parsed.openaiBaseUrl;
  }

  if (protocol === "anthropic_messages") {
    return parsed.anthropicBaseUrl;
  }

  return parsed.geminiBaseUrl;
}

export function providerUrlWithDefaultScheme(value: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value;
  }

  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(value)) {
    return `http://${value}`;
  }

  return `https://${value}`;
}

export function compactProviderUrl(url: URL): string {
  const value = url.toString();
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function stripProviderEndpointPath(pathname: string): string {
  const pathnameWithoutSlash = pathname.replace(/\/+$/, "") || "/";
  const rules: Array<[RegExp, string]> = [
    [/\/v1\/chat\/completions$/i, "/v1"],
    [/\/chat\/completions$/i, ""],
    [/\/v1\/responses$/i, "/v1"],
    [/\/responses$/i, ""],
    [/\/v1\/messages$/i, "/v1"],
    [/\/messages$/i, ""],
    [/\/v1beta\/models\/[^/]+:(generateContent|streamGenerateContent)$/i, "/v1beta"],
    [/\/v1\/models\/[^/]+:(generateContent|streamGenerateContent)$/i, "/v1"],
    [/\/v1beta\/interactions(?:\/[^/]+(?:\/cancel)?)?$/i, "/v1beta"],
    [/\/v1\/interactions(?:\/[^/]+(?:\/cancel)?)?$/i, "/v1"],
    [/\/interactions(?:\/[^/]+(?:\/cancel)?)?$/i, ""],
    [/\/v1beta\/models$/i, "/v1beta"],
    [/\/v1\/models$/i, "/v1"],
    [/\/models$/i, ""]
  ];

  for (const [pattern, replacement] of rules) {
    if (pattern.test(pathnameWithoutSlash)) {
      const next = pathnameWithoutSlash.replace(pattern, replacement);
      return next || "/";
    }
  }

  return pathnameWithoutSlash;
}

function stripProviderApiVersion(value: string): string {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/(v1|v1beta)$/i, "") || "/";
  return compactProviderUrl(url);
}

function stripNestedProviderApiVersion(pathname: string): string {
  return pathname.replace(/(\/v[0-9][a-z0-9-]*)\/v1$/i, "$1") || "/";
}

function shouldProbeOpenAiV1Fallback(value: string): boolean {
  const url = new URL(value);
  const pathname = url.pathname.replace(/\/+$/, "");
  return !/\/v[0-9][a-z0-9-]*$/i.test(pathname);
}

function shouldProbeAnthropicPrefixFallback(value: string): boolean {
  // Only add /anthropic fallback when the URL already shows anthropic affinity:
  // - hostname contains "anthropic" (e.g. api.anthropic.com)
  // - path contains "anthropic" (e.g. api.z.ai/api/anthropic)
  // This prevents false positives where a non-anthropic endpoint
  // coincidentally responds to /anthropic/* with a 401/403.
  const url = new URL(value);
  const segments = url.pathname
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
  const hostname = url.hostname.toLowerCase();
  return hostname.includes("anthropic") || segments.includes("anthropic");
}

function ensureProviderApiVersion(value: string, version: "v1"): string {
  const url = new URL(value);
  const pathname = url.pathname.replace(/\/+$/, "");
  if (new RegExp(`/${version}$`, "i").test(pathname)) {
    return compactProviderUrl(url);
  }
  url.pathname = `${pathname}/${version}`.replace(/\/{2,}/g, "/");
  return compactProviderUrl(url);
}

function appendProviderPathSegment(value: string, segment: string): string {
  const url = new URL(value);
  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = `${pathname}/${segment}`.replace(/\/{2,}/g, "/");
  return compactProviderUrl(url);
}

function uniqueProviderUrls(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function normalizeProviderBaseUrlText(value: string, protocol?: GatewayProviderProtocol): string {
  const normalized = value
    .trim()
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");

  if (protocol === "openai_chat_completions") {
    return normalized.replace(/\/chat\/completions$/i, "").replace(/\/responses$/i, "");
  }
  if (protocol === "openai_responses") {
    return normalized.replace(/\/responses$/i, "").replace(/\/chat\/completions$/i, "");
  }
  if (protocol === "anthropic_messages") {
    return normalized.replace(/\/v1\/messages$/i, "").replace(/\/messages$/i, "").replace(/\/v1$/i, "");
  }
  if (protocol === "gemini_generate_content" || protocol === "gemini_interactions") {
    return normalized
      .replace(/\/v1beta\/models\/[^/]+:(generateContent|streamGenerateContent)$/i, "")
      .replace(/\/v1\/models\/[^/]+:(generateContent|streamGenerateContent)$/i, "")
      .replace(/\/v1beta\/interactions(?:\/[^/]+(?:\/cancel)?)?$/i, "")
      .replace(/\/v1\/interactions(?:\/[^/]+(?:\/cancel)?)?$/i, "")
      .replace(/\/interactions(?:\/[^/]+(?:\/cancel)?)?$/i, "")
      .replace(/\/v1beta\/models$/i, "")
      .replace(/\/v1\/models$/i, "")
      .replace(/\/v1beta$/i, "")
      .replace(/\/v1$/i, "");
  }

  return normalized;
}
