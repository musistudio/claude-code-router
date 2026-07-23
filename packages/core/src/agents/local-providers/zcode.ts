import os from "node:os";
import path from "node:path";
import type {
  LocalAgentProviderCandidate,
  LocalAgentProviderImportResult,
  ProviderAccountConfig
} from "@ccr/core/contracts/app";
import { findProviderPresetByBaseUrl } from "@ccr/core/providers/presets/index";
import {
  apiKeyAuthPlugin,
  cloneProviderAccountConfig,
  firstString,
  isLoopbackUrl,
  isRecord,
  missingCandidate,
  modelDisplayNamesForModels,
  providerInternalNamePlaceholder,
  providerPayload,
  readJsonRecord,
  readString,
  uniqueProviderName,
  uniqueStrings,
  type ApiTokenSet
} from "@ccr/core/agents/local-providers/shared";

type ZcodeConfiguredProvider = {
  apiKey: string;
  baseUrl: string;
  modelDisplayNames?: Record<string, string>;
  models: string[];
  name: string;
  providerId: string;
  sourceFile: string;
};

type LocalAgentModelCatalog = {
  modelDisplayNames?: Record<string, string>;
  models: string[];
};

const zcodeDefaultModels = ["GLM-5.2", "GLM-5-Turbo"];
export const zcodeDefaultBaseUrl = "https://zcode.z.ai/api/v1/zcode-plan/anthropic";

export type ZcodeLocalProviderCredential = {
  apiKey: string;
  baseUrl: string;
};

export function zcodeCandidate(): LocalAgentProviderCandidate {
  const configuredProvider = readZcodeConfiguredProvider();
  const zcodeRuntime = readZcodeRuntime();
  const models = configuredProvider?.models.length
    ? configuredProvider.models
    : zcodeRuntime.models.length > 0 ? zcodeRuntime.models : zcodeDefaultModels;
  const modelDisplayNames = configuredProvider?.models.length
    ? configuredProvider.modelDisplayNames
    : zcodeRuntime.modelDisplayNames;
  if (configuredProvider) {
    return {
      detail: "ZCode provider API key detected in local ZCode config. Click Import to add it as a gateway provider.",
      id: "zcode-api",
      importable: true,
      kind: "zcode",
      modelDisplayNames,
      models,
      name: "ZCode API",
      protocol: "anthropic_messages",
      sourceFile: configuredProvider.sourceFile,
      status: "available"
    };
  }

  const credentials = readZcodeSharedLogin();
  if (credentials?.hasSharedLogin) {
    return {
      detail: "ZCode login was detected, but no usable provider API key was found in ZCode config.",
      id: "zcode-api",
      importable: false,
      kind: "zcode",
      modelDisplayNames,
      models,
      name: "ZCode API",
      protocol: "anthropic_messages",
      sourceFile: credentials.sourceFile,
      status: "locked"
    };
  }
  return missingCandidate("zcode", "zcode-api", "ZCode API", "anthropic_messages", models, modelDisplayNames);
}

export function importZcodeProvider(candidate: LocalAgentProviderCandidate, providerNames: string[]): LocalAgentProviderImportResult {
  const configuredProvider = readZcodeConfiguredProvider();
  if (!configuredProvider) {
    throw new Error("ZCode provider API key was not found in ZCode config.");
  }
  const provider = providerPayload(
    {
      ...candidate,
      modelDisplayNames: configuredProvider.models.length > 0 ? configuredProvider.modelDisplayNames : candidate.modelDisplayNames,
      models: configuredProvider.models.length > 0 ? configuredProvider.models : candidate.models
    },
    uniqueProviderName(providerNames, "ZCode API"),
    configuredProvider.baseUrl,
    zcodeProviderAccountConfig(configuredProvider.baseUrl)
  );
  return {
    candidate,
    provider,
    providerPlugins: [
      apiKeyAuthPlugin("zcode-api-key", configuredProvider.apiKey),
      apiKeyAuthPlugin("zcode-api-key-internal", configuredProvider.apiKey, providerInternalNamePlaceholder)
    ]
  };
}

export function readZcodeLocalProviderCredential(): ZcodeLocalProviderCredential | undefined {
  const provider = readZcodeConfiguredProvider();
  return provider ? { apiKey: provider.apiKey, baseUrl: provider.baseUrl } : undefined;
}

function zcodeProviderAccountConfig(baseUrl: string): ProviderAccountConfig | undefined {
  return cloneProviderAccountConfig(findProviderPresetByBaseUrl(baseUrl)?.account);
}

function readZcodeSharedLogin(): ApiTokenSet | undefined {
  for (const sourceFile of zcodeCredentialFiles()) {
    const record = readJsonRecord(sourceFile);
    if (!record) {
      continue;
    }
    const rawToken =
      readString(record.zcodejwttoken) ||
      readString(record["oauth:zai:access_token"]) ||
      readString(record["oauth:zai:refresh_token"]) ||
      readString(record["oauth:bigmodel:access_token"]) ||
      readString(record["oauth:bigmodel:refresh_token"]) ||
      readString(record["oauth:active_provider"]) ||
      readString(record.access_token) ||
      readString(record.accessToken);
    if (rawToken) {
      return {
        sourceFile,
        hasSharedLogin: true
      };
    }
  }
  return undefined;
}

function readZcodeConfiguredProvider(): ZcodeConfiguredProvider | undefined {
  const candidates = zcodeConfigFiles()
    .flatMap((sourceFile) => readZcodeConfiguredProviders(sourceFile));
  return candidates.find((provider) => provider.apiKey.trim() && provider.baseUrl.trim());
}

function readZcodeConfiguredProviders(sourceFile: string): ZcodeConfiguredProvider[] {
  const record = readJsonRecord(sourceFile);
  const providers = isRecord(record?.provider) ? record.provider : undefined;
  if (!providers) {
    return [];
  }

  return Object.entries(providers)
    .flatMap(([providerId, value]) => {
      if (!isRecord(value) || !isZcodeModelProvider(providerId, value)) {
        return [];
      }
      const options = isRecord(value.options) ? value.options : {};
      const apiKey = readString(options.apiKey) || readString(options.api_key) || readString(value.apiKey) || readString(value.api_key);
      const baseUrl =
        readString(options.baseURL) ||
        readString(options.baseUrl) ||
        readString(isRecord(value.endpoints) ? value.endpoints.baseURL : undefined) ||
        readString(isRecord(value.endpoints) ? value.endpoints.baseUrl : undefined);
      if (!apiKey || !baseUrl) {
        return [];
      }
      return [{
        apiKey,
        baseUrl,
        ...zcodeProviderModelCatalog(value),
        name: readString(value.name) || providerId,
        providerId,
        sourceFile
      }];
    });
}

function readZcodeRuntime(): { baseUrl: string } & LocalAgentModelCatalog {
  const cache = readJsonRecord(path.join(zcodeStorageRoot(), "v2", "bots-model-cache.v2.json"));
  const providers = Array.isArray(cache?.providers)
    ? cache.providers.filter((provider): provider is Record<string, unknown> => isRecord(provider))
    : [];
  const provider = providers.find((item) => {
    const text = [
      readString(item.id),
      readString(item.name),
      readString(isRecord(item.endpoints) ? item.endpoints.baseURL : undefined)
    ].join(" ").toLowerCase();
    return text.includes("zcode") || text.includes("z.ai") || text.includes("bigmodel");
  });
  const baseUrl = readString(isRecord(provider?.endpoints) ? provider?.endpoints.baseURL : undefined) || zcodeDefaultBaseUrl;
  const catalog = zcodeProviderModelCatalog(provider ?? {});
  const models = uniqueStrings([...catalog.models, ...zcodeDefaultModels]);
  return {
    baseUrl,
    modelDisplayNames: modelDisplayNamesForModels(catalog.modelDisplayNames, models),
    models
  };
}

function zcodeProviderModelCatalog(provider: Record<string, unknown>): LocalAgentModelCatalog {
  const models: string[] = [];
  const modelDisplayNames: Record<string, string> = {};
  if (Array.isArray(provider.models)) {
    for (const item of provider.models) {
      const model = isRecord(item)
        ? readString(item.id) || readString(item.name)
        : readString(item);
      if (!model) {
        continue;
      }
      models.push(model);
      if (isRecord(item)) {
        const displayName = readString(item.displayName) || readString(item.display_name) || readString(item.label) || readString(item.name);
        if (displayName && displayName !== model) {
          modelDisplayNames[model] = displayName;
        }
      }
    }
    const uniqueModels = uniqueStrings(models);
    return {
      modelDisplayNames: modelDisplayNamesForModels(modelDisplayNames, uniqueModels),
      models: uniqueModels
    };
  }
  if (isRecord(provider.models)) {
    for (const [key, value] of Object.entries(provider.models)) {
      const model = isRecord(value) ? readString(value.id) || key : key;
      if (!model) {
        continue;
      }
      models.push(model);
      if (isRecord(value)) {
        const displayName = readString(value.displayName) || readString(value.display_name) || readString(value.label) || readString(value.name);
        if (displayName && displayName !== model) {
          modelDisplayNames[model] = displayName;
        }
      }
    }
    const uniqueModels = uniqueStrings(models);
    return {
      modelDisplayNames: modelDisplayNamesForModels(modelDisplayNames, uniqueModels),
      models: uniqueModels
    };
  }
  return {
    models: []
  };
}

function isZcodeModelProvider(providerId: string, provider: Record<string, unknown>): boolean {
  if (provider.enabled === false || readString(provider.systemDisabledReason)) {
    return false;
  }

  const options = isRecord(provider.options) ? provider.options : {};
  const endpoints = isRecord(provider.endpoints) ? provider.endpoints : {};
  const baseUrl = firstString([
    readString(options.baseURL),
    readString(options.baseUrl),
    readString(endpoints.baseURL),
    readString(endpoints.baseUrl)
  ]);
  const baseUrlText = baseUrl.toLowerCase();
  if (isLoopbackUrl(baseUrl)) {
    return false;
  }

  const text = [
    providerId,
    readString(provider.name),
    baseUrlText
  ].join(" ").toLowerCase();
  const matchesZcodeProvider =
    text.includes("z.ai") ||
    text.includes("zai") ||
    text.includes("zcode") ||
    text.includes("bigmodel") ||
    text.includes("open.bigmodel.cn");
  if (!matchesZcodeProvider || text.includes("claude-code-router")) {
    return false;
  }

  const kind = [
    readString(provider.kind),
    readString(provider.apiFormat),
    readString(provider.defaultKind),
    readString(isRecord(endpoints.paths) ? endpoints.paths.anthropic : undefined)
  ].join(" ").toLowerCase();
  return kind.includes("anthropic") || baseUrlText.includes("/anthropic");
}

function zcodeCredentialFiles(): string[] {
  const storageRoot = zcodeStorageRoot();
  return uniqueStrings([
    path.join(storageRoot, "v2", "credentials.json"),
    path.join(storageRoot, "credentials.json")
  ]);
}

function zcodeConfigFiles(): string[] {
  const storageRoot = zcodeStorageRoot();
  return uniqueStrings([
    path.join(storageRoot, "v2", "config.json"),
    path.join(storageRoot, "cli", "config.json")
  ]);
}

function zcodeStorageRoot(): string {
  const explicitRoot = process.env.ZCODE_STORAGE_DIR?.trim() || process.env.ZCODE_HOME?.trim();
  if (explicitRoot) {
    return explicitRoot;
  }
  const homeDir = process.env.CCR_INTERNAL_HOME_DIR?.trim() || process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || os.homedir();
  return path.join(homeDir, ".zcode");
}
