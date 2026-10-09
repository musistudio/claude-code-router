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
    geminiBaseUrl: providerGeminiBaseUrl(normalizedInputBaseUrl, rootBaseUrl),
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

  const scheme = isPrivateProviderHost(providerHostnameWithoutScheme(value)) ? "http" : "https";
  return `${scheme}://${value}`;
}

function providerHostnameWithoutScheme(value: string): string {
  try {
    return new URL(`http://${value.trim()}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// Self-hosted upstreams (vLLM, SGLang, Ollama, LM Studio) are usually served over plain HTTP on a
// loopback or private-network address, so a schemeless host there defaults to http instead of https.
function isPrivateProviderHost(hostname: string): boolean {
  if (!hostname) {
    return false;
  }

  const host = hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "host.docker.internal") {
    return true;
  }

  if (/\.(local|localdomain|internal|lan|intranet|home\.arpa)$/.test(host)) {
    return true;
  }

  return isPrivateIpv4Host(host) || isPrivateIpv6Host(host);
}

function isPrivateIpv4Host(host: string): boolean {
  const octets = host.split(".");
  if (octets.length !== 4 || !octets.every((octet) => /^[0-9]{1,3}$/.test(octet))) {
    return false;
  }

  const numbers = octets.map((octet) => Number(octet));
  if (numbers.some((octet) => octet > 255)) {
    return false;
  }

  const [first, second] = numbers;

  // Unspecified (0.0.0.0/8), private (10/8, 172.16/12, 192.168/16), loopback and link local.
  if (first === 0 || first === 10 || first === 127) {
    return true;
  }

  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }

  return (first === 192 && second === 168) || (first === 169 && second === 254);
}

function isPrivateIpv6Host(host: string): boolean {
  if (!host.includes(":")) {
    return false;
  }

  if (host === "::1" || host === "::") {
    return true;
  }

  const firstHextet = Number.parseInt(host.split(":")[0] ?? "", 16);
  if (!Number.isFinite(firstHextet)) {
    return false;
  }

  // Unique local (fc00::/7) and link local (fe80::/10).
  return (
    (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) || (firstHextet >= 0xfe80 && firstHextet <= 0xfebf)
  );
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

function providerGeminiBaseUrl(normalizedInputBaseUrl: string, rootBaseUrl: string): string {
  return isVersionedVertexBypassBaseUrl(normalizedInputBaseUrl) ||
    isNestedVersionedGeminiBaseUrl(normalizedInputBaseUrl)
    ? normalizedInputBaseUrl
    : rootBaseUrl;
}

function isVersionedVertexBypassBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const segments = url.pathname
      .split("/")
      .map((segment) => segment.trim().toLowerCase())
      .filter(Boolean);
    return segments.includes("bypass") &&
      segments.includes("vertex") &&
      /^(v1|v1beta)$/.test(segments[segments.length - 1] ?? "");
  } catch {
    return false;
  }
}

function isNestedVersionedGeminiBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const segments = url.pathname
      .split("/")
      .map((segment) => segment.trim().toLowerCase())
      .filter(Boolean);
    return segments.length > 1 && /^(v1|v1beta)$/.test(segments[segments.length - 1] ?? "");
  } catch {
    return false;
  }
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
  const url = new URL(value);
  const segments = url.pathname
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
  return !segments.includes("anthropic");
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
