import type { GatewayProviderProtocol, ProviderAccountConfig } from "@ccr/core/contracts/app";

export type ProviderPresetEndpoint = {
  baseUrl: string;
  label?: string;
  protocols: GatewayProviderProtocol[];
  websiteUrl?: string;
};

export type ProviderOfficialKeyPattern = {
  flags?: string;
  source: string;
};

export type ProviderPreset = {
  account?: ProviderAccountConfig;
  aliases: string[];
  defaultModelDisplayNames?: Record<string, string>;
  defaultModels?: string[];
  endpoints: ProviderPresetEndpoint[];
  id: string;
  name: string;
  officialApiKeyPatterns?: ProviderOfficialKeyPattern[];
  websiteUrl?: string;
};

export type ProviderIdentitySafetyIssue = {
  message: string;
  preset: ProviderPreset;
};

export const customProviderPresetId = "custom";

export const defaultProviderAccountConfig: ProviderAccountConfig = {
  connectors: [],
  enabled: false
};

export const standardProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      type: "standard"
    }
  ],
  enabled: true
};
