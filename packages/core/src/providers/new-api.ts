import type { ProviderAccountConfig, ProviderAccountHttpJsonConnectorConfig } from "@ccr/core/contracts/app";
import { compactProviderUrl, providerUrlWithDefaultScheme } from "@ccr/core/providers/url";

export type DetectedProviderKind = "new-api";

const newApiHeaderNames = ["x-new-api-version", "x-oneapi-request-id"];

export function detectedProviderFromHeaders(headers: Record<string, string | undefined>): DetectedProviderKind | undefined {
  return hasNewApiHeaders(headers) ? "new-api" : undefined;
}

export function hasNewApiHeaders(headers: Record<string, string | undefined>): boolean {
  const normalized = new Set(Object.keys(headers).map((key) => key.toLowerCase()));
  return newApiHeaderNames.some((header) => normalized.has(header));
}

export function newApiKeyUsageAccountConfig(baseUrl: string): ProviderAccountConfig {
  return {
    connectors: [
      {
        auth: "provider-api-key",
        endpoint: newApiKeyUsageEndpoint(baseUrl),
        mapping: {
          message: "$.message",
          meters: [
            {
              id: "new_api_key_quota",
              kind: "quota",
              label: "API key quota",
              limit: "$.data.total_granted",
              remaining: "$.data.total_available",
              unit: "quota",
              used: "$.data.total_used",
            }
          ]
        },
        method: "GET",
        parser: "new-api-key-usage",
        type: "http-json"
      }
    ],
    enabled: true
  };
}

export function newApiKeyUsageEndpoint(baseUrl: string): string {
  const root = newApiRootBaseUrl(baseUrl);
  return `${root}/api/usage/token/`;
}

export function newApiUserSelfConnectorConfig(baseUrl: string): ProviderAccountHttpJsonConnectorConfig {
  return {
    auth: "none",
    endpoint: newApiUserSelfEndpoint(baseUrl),
    headers: {
      Authorization: "Bearer <new-api-access-token>",
      "New-Api-User": "<user-id>"
    },
    mapping: {
      meters: [
        {
          id: "new_api_user_balance",
          kind: "balance",
          label: "User balance",
          remaining: "$.data.quota",
          unit: "quota",
          used: "$.data.used_quota"
        }
      ]
    },
    method: "GET",
    parser: "new-api-user-self",
    type: "http-json"
  };
}

export function newApiUserSelfEndpoint(baseUrl: string): string {
  const root = newApiRootBaseUrl(baseUrl);
  return `${root}/api/user/self`;
}

export function newApiRootBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(providerUrlWithDefaultScheme(baseUrl.trim()));
    url.pathname = url.pathname.replace(/\/+(v1|api)$/i, "").replace(/\/+$/, "") || "/";
    url.search = "";
    url.hash = "";
    return compactProviderUrl(url);
  } catch {
    return baseUrl.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/\/(v1|api)$/i, "");
  }
}
