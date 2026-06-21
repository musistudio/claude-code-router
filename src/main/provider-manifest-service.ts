import { lookup } from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import { parseProviderManifestPayload } from "../shared/deep-link";
import { findProviderPresetByBaseUrl, providerEndpointCanReceiveProviderApiKey, providerIdentitySafetyIssue } from "./presets";
import { providerUrlWithDefaultScheme } from "../shared/provider-url";
import type {
  GatewayProviderConfig,
  ProviderAccountConnectorConfig,
  ProviderAccountHttpJsonConnectorConfig,
  ProviderAccountStandardConnectorConfig,
  ProviderDeepLinkPayload,
  ProviderManifestFetchRequest,
  ProviderManifestFetchResult
} from "../shared/app";

type SafeAddress = {
  address: string;
  family: 4 | 6;
};

const maxManifestBytes = 128 * 1024;
const maxRedirects = 3;
const manifestTimeoutMs = 8000;
const manifestUserAgent = "Claude-Code-Router/provider-manifest";

export async function fetchProviderManifest(request: ProviderManifestFetchRequest): Promise<ProviderManifestFetchResult> {
  const manifestUrl = normalizeManifestUrl(request.url);
  const text = await fetchManifestText(manifestUrl);
  const parsed = JSON.parse(text) as unknown;
  const provider = parseProviderManifestPayload(parsed);
  delete provider.apiKey;
  await validateRemoteManifestProvider(provider);
  return {
    fetchedAt: new Date().toISOString(),
    provider,
    url: manifestUrl.toString()
  };
}

async function fetchManifestText(url: URL, redirectCount = 0): Promise<string> {
  const safeUrl = normalizeManifestUrl(url.toString());
  const address = await resolveSafeAddress(safeUrl.hostname);

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | undefined, value?: string) => {
      if (settled) {
        return;
      }
      settled = true;
      if (error) {
        reject(error);
      } else {
        resolve(value ?? "");
      }
    };

    const request = https.request({
      headers: {
        accept: "application/json, application/manifest+json, application/vnd.ccr.provider+json",
        "accept-encoding": "identity",
        "user-agent": manifestUserAgent
      },
      hostname: safeUrl.hostname,
      lookup: (_hostname, _options, callback) => {
        callback(null, address.address, address.family);
      },
      method: "GET",
      path: `${safeUrl.pathname}${safeUrl.search}`,
      port: safeUrl.port ? Number(safeUrl.port) : 443,
      protocol: "https:",
      servername: safeUrl.hostname,
      timeout: manifestTimeoutMs
    }, (response) => {
      const statusCode = response.statusCode ?? 0;
      if (statusCode >= 300 && statusCode < 400) {
        response.resume();
        if (redirectCount >= maxRedirects) {
          finish(new Error("Provider manifest redirected too many times."));
          return;
        }
        const location = response.headers.location;
        if (!location) {
          finish(new Error("Provider manifest redirect did not include a Location header."));
          return;
        }
        const redirectedUrl = normalizeManifestUrl(new URL(location, safeUrl).toString());
        void fetchManifestText(redirectedUrl, redirectCount + 1).then((value) => finish(undefined, value), finish);
        return;
      }

      if (statusCode !== 200) {
        response.resume();
        finish(new Error(`Provider manifest returned HTTP ${statusCode}.`));
        return;
      }

      const contentEncoding = headerValue(response.headers["content-encoding"]).toLowerCase();
      if (contentEncoding && contentEncoding !== "identity") {
        response.resume();
        finish(new Error("Provider manifest must be served without compression."));
        return;
      }

      const contentType = headerValue(response.headers["content-type"]).split(";", 1)[0]?.trim().toLowerCase() ?? "";
      if (!isJsonContentType(contentType)) {
        response.resume();
        finish(new Error("Provider manifest must be served as JSON."));
        return;
      }

      const contentLength = Number(headerValue(response.headers["content-length"]));
      if (Number.isFinite(contentLength) && contentLength > maxManifestBytes) {
        response.resume();
        finish(new Error("Provider manifest is too large."));
        return;
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      response.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > maxManifestBytes) {
          request.destroy(new Error("Provider manifest is too large."));
          return;
        }
        chunks.push(chunk);
      });
      response.once("end", () => {
        finish(undefined, Buffer.concat(chunks).toString("utf8"));
      });
      response.once("error", (error) => finish(error));
    });

    request.once("timeout", () => {
      request.destroy(new Error(`Provider manifest fetch timed out after ${manifestTimeoutMs}ms.`));
    });
    request.once("error", (error) => finish(error));
    request.end();
  });
}

function normalizeManifestUrl(value: string): URL {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") {
    throw new Error("Provider manifest URL must use https.");
  }
  if (url.username || url.password) {
    throw new Error("Provider manifest URL cannot include credentials.");
  }
  if (url.hash) {
    url.hash = "";
  }
  validateRemoteHostname(url.hostname, "Provider manifest URL");
  return url;
}

async function validateRemoteManifestProvider(provider: ProviderDeepLinkPayload): Promise<void> {
  await validatePublicHttpsUrl(provider.baseUrl, "Provider Base URL");
  const identityIssue = providerIdentitySafetyIssue({
    baseUrl: provider.baseUrl,
    name: provider.name
  });
  if (identityIssue) {
    throw new Error(identityIssue.message);
  }

  const connectors = provider.account?.connectors ?? [];
  for (const connector of connectors) {
    await validateRemoteAccountConnector(provider, connector);
  }
}

async function validateRemoteAccountConnector(provider: ProviderDeepLinkPayload, connector: ProviderAccountConnectorConfig): Promise<void> {
  if (connector.type === "http-json") {
    validateSafeHeaders(connector.headers);
    const endpoint = (connector as ProviderAccountHttpJsonConnectorConfig).endpoint;
    await validatePublicHttpsUrl(endpoint, "Fetch usage URL");
    validateProviderApiKeyTarget(provider, endpoint);
    return;
  }
  if (connector.type === "standard") {
    const standardConnector = connector as ProviderAccountStandardConnectorConfig;
    validateSafeHeaders(standardConnector.headers);
    const endpoints = [
      standardConnector.endpoint,
      ...(standardConnector.endpoints ?? [])
    ].filter((endpoint): endpoint is string => Boolean(endpoint?.trim()));
    for (const endpoint of endpoints) {
      if (/^https?:\/\//i.test(endpoint)) {
        await validatePublicHttpsUrl(endpoint, "Fetch usage URL");
        validateProviderApiKeyTarget(provider, endpoint);
      }
    }
  }
}

function validateProviderApiKeyTarget(provider: ProviderDeepLinkPayload, endpoint: string): void {
  const issue = providerEndpointCanReceiveProviderApiKey({
    apiKey: "manifest-provider-api-key",
    endpoint,
    providerName: provider.name,
    providerPresetId: findProviderPresetByBaseUrl(provider.baseUrl)?.id
  });
  if (issue) {
    throw new Error(issue.message);
  }
}

async function validatePublicHttpsUrl(value: string, label: string): Promise<void> {
  const url = new URL(providerUrlWithDefaultScheme(value));
  if (url.protocol !== "https:") {
    throw new Error(`${label} from a remote manifest must use https.`);
  }
  if (url.username || url.password) {
    throw new Error(`${label} cannot include credentials.`);
  }
  validateRemoteHostname(url.hostname, label);
  await resolveSafeAddress(url.hostname);
}

function validateRemoteHostname(hostname: string, label: string): void {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized) {
    throw new Error(`${label} is invalid.`);
  }
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".home") ||
    normalized.endsWith(".lan") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    throw new Error(`${label} cannot target a local or internal host.`);
  }
}

async function resolveSafeAddress(hostname: string): Promise<SafeAddress> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error(`Could not resolve host: ${hostname}`);
  }

  for (const address of addresses) {
    if (!isPublicIpAddress(address.address)) {
      throw new Error(`Remote manifest host resolved to a private or reserved address: ${address.address}`);
    }
  }

  const first = addresses[0];
  return {
    address: first.address,
    family: first.family === 6 ? 6 : 4
  };
}

function isPublicIpAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    return isPublicIpv4(address);
  }
  if (family === 6) {
    return isPublicIpv6(address);
  }
  return false;
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b, c, d] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 ||
    (a === 255 && b === 255 && c === 255 && d === 255)
  );
}

function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) {
    return isPublicIpv4(mappedIpv4);
  }
  return !(
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("100:") ||
    normalized.startsWith("2001:2:") ||
    normalized.startsWith("2001:10:") ||
    normalized.startsWith("2001:db8:") ||
    normalized.startsWith("2002:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89a-f]/.test(normalized) ||
    normalized.startsWith("ff")
  );
}

function validateSafeHeaders(headers: Record<string, string> | undefined): void {
  for (const key of Object.keys(headers ?? {})) {
    const normalized = key.trim().toLowerCase();
    if (normalized === "authorization" || normalized === "cookie" || normalized === "proxy-authorization") {
      throw new Error("Remote provider manifests cannot define sensitive Fetch usage headers.");
    }
  }
}

function isJsonContentType(value: string): boolean {
  return value === "application/json" || value.endsWith("+json");
}

function headerValue(value: string | string[] | number | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value === undefined ? "" : String(value);
}
