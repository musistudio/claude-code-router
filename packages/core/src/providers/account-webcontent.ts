import type {
  GatewayProviderConfig,
  ProviderAccountBrowserCredentialsMode
} from "@ccr/core/contracts/app";

export type ProviderAccountWebContentFetchRequest = {
  body?: unknown;
  credentials?: ProviderAccountBrowserCredentialsMode;
  endpoint: string;
  headers?: Record<string, string>;
  headerTemplates?: Record<string, string>;
  loginUrl?: string;
  method: "GET" | "POST";
  provider: GatewayProviderConfig;
  requestOrigin: string;
  timeoutMs?: number;
};

export type ProviderAccountWebContentFetchResponse = {
  payload: unknown;
};

export type ProviderAccountWebContentFetchHandler = (
  request: ProviderAccountWebContentFetchRequest
) => Promise<ProviderAccountWebContentFetchResponse>;

let providerAccountWebContentFetchHandler: ProviderAccountWebContentFetchHandler | undefined;

export function setProviderAccountWebContentFetchHandler(handler: ProviderAccountWebContentFetchHandler | undefined): void {
  providerAccountWebContentFetchHandler = handler;
}

export async function fetchProviderAccountWebContentJson(request: ProviderAccountWebContentFetchRequest): Promise<unknown> {
  if (!providerAccountWebContentFetchHandler) {
    throw new Error("Browser session account requests are only available in CCR Desktop. Use HTTP JSON in CLI or Docker.");
  }

  const endpoint = parseHttpUrl(request.endpoint, "Browser session account endpoint");
  const response = await providerAccountWebContentFetchHandler({
    ...request,
    credentials: normalizeWebContentCredentials(request.credentials, request.headerTemplates),
    endpoint: endpoint.toString(),
    provider: providerWithoutApiKey(request.provider),
    requestOrigin: normalizeWebContentRequestOrigin(request.requestOrigin, endpoint.origin)
  });
  return response.payload;
}

function normalizeWebContentRequestOrigin(requestOrigin: string | undefined, fallbackOrigin: string): string {
  if (!requestOrigin?.trim()) {
    return fallbackOrigin;
  }
  return parseHttpUrl(requestOrigin, "Browser session account request origin").origin;
}

function normalizeWebContentCredentials(
  credentials: ProviderAccountBrowserCredentialsMode | undefined,
  headerTemplates: Record<string, string> | undefined
): ProviderAccountBrowserCredentialsMode {
  if (!credentials) {
    return headerTemplates && Object.keys(headerTemplates).length > 0 ? "omit" : "include";
  }
  if (credentials === "include" || credentials === "omit" || credentials === "same-origin") {
    return credentials;
  }
  throw new Error("Browser session account credentials must be include, omit, or same-origin.");
}

function providerWithoutApiKey(provider: GatewayProviderConfig): GatewayProviderConfig {
  return {
    ...provider,
    api_key: "",
    apiKey: undefined,
    apikey: undefined
  };
}

function parseHttpUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTP or HTTPS URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must use HTTP or HTTPS.`);
  }
  return url;
}
