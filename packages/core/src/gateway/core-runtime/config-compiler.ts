/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import { join as pathJoin } from "node:path";
import type { AppConfig, GatewayProviderConfig, GatewayProviderProtocol, VirtualModelProfileConfig } from "@ccr/core/contracts/app";
import { codexDefaultBaseUrl, readCodexAuth, readGrokAuth, resolveGrokAuth } from "@ccr/core/agents/local-providers/service";
import { grokAccessTokenExpired, grokClientVersion } from "@ccr/core/agents/local-providers/grok";
import { pluginService } from "@ccr/core/plugins/service";
import { normalizeRouteSelector, providerRuntimeId } from "@ccr/core/routing/model-registry";
import { isRecord, stringListValue, stringValue } from "@ccr/core/gateway/internal/value";
import { fusionBuiltinToolArtifacts, fusionToolFallbackMcpServer, normalizeFusionWebSearchProfileToolName, toolHubMcpServer, withCodexCompatibleVirtualModelProfiles, withFusionVirtualModelAliases, withFusionWebSearchToolInstructions } from "@ccr/core/mcp/fusion-config";
import { resolveGatewayPublicModelId } from "@ccr/core/gateway/features/model-discovery";
import { activeProviderCredentials, inferProtocol, normalizedProviderCapabilities, normalizeProviderProtocol, providerCapabilityForClientProtocol, providerCapabilityInternalName, providerCredentialInternalName, providerProtocolForClientProtocol, sortProviderCredentialsForConfig, toCoreGatewayProviders } from "@ccr/core/providers/runtime-topology";
import { buildRawTraceConfig } from "@ccr/core/observability/raw-trace-sync";
import { endpoint, resolveUndiciProxyAgentModule, writeGatewayProxyPreloadFile } from "@ccr/core/gateway/core-runtime/supervisor";
import { billingUsageSyncHeader, billingUsageSyncPath, claudeCodeOauthBetaHeader, claudeCodeOauthRequiredBeta, coreGatewayAuthHeader, coreGatewayAuthTokenEnv } from "@ccr/core/gateway/internal/shared";
import type { BrowserWebSearchMcpIntegration, CoreGatewayProvider } from "@ccr/core/gateway/internal/shared";
import { uniqueStrings } from "@ccr/core/gateway/internal/collections";
import { isLocalClaudeCodeOauthProviderPlugin, mergeAnthropicBetaValues } from "@ccr/core/providers/oauth-plugin";
import { resolveConfiguredProviderModelSelector, resolveUniqueConfiguredProviderModelSelector } from "@ccr/core/routing/model-resolution";

const upstreamHeaderSanitizerPluginKey = "ccr-upstream-header-sanitizer";


export async function compileCoreGatewayConfig(
  config: AppConfig,
  rawTraceSyncToken: string,
  billingUsageSyncToken: string,
  coreAuthToken: string,
  browserWebSearchMcpIntegration?: BrowserWebSearchMcpIntegration,
  upstreamProxyUrl?: string
): Promise<Record<string, unknown>> {
  const pluginCoreGatewayConfig = pluginService.getCoreGatewayConfig();
  const configuredGatewayPlugins = Array.isArray(pluginCoreGatewayConfig.plugins)
    ? pluginCoreGatewayConfig.plugins.filter((plugin) =>
        !isRecord(plugin) || stringValue(plugin.key) !== upstreamHeaderSanitizerPluginKey
      )
    : [];
  const pluginBillingConfig = isRecord(pluginCoreGatewayConfig.billing) ? pluginCoreGatewayConfig.billing : {};
  const configuredProviderPlugins = normalizeClaudeCodeOauthProviderPlugins([
    ...(config.providerPlugins ?? []).filter(providerPluginEnabled),
    ...pluginService.getCoreProviderPlugins().filter(providerPluginEnabled)
  ]);
  const providerPlugins = await withGrokOauthRuntimeDefaults(withCodexOauthRuntimeDefaults(configuredProviderPlugins));
  const codexOauthProviderNames = codexOauthLocalProviderNames(providerPlugins);
  const virtualModelProfiles = coreGatewayVirtualModelProfiles(config);
  const coreEndpoint = endpoint(config.gateway.coreHost, config.gateway.corePort);
  const proxyPreloadFile = upstreamProxyUrl ? writeGatewayProxyPreloadFile(config, upstreamProxyUrl) : undefined;
  const proxyEnv = upstreamProxyUrl
    ? { CCR_UPSTREAM_PROXY_URL: upstreamProxyUrl, CCR_UNDICI_MODULE: resolveUndiciProxyAgentModule() }
    : undefined;
  const builtinToolArtifacts = await fusionBuiltinToolArtifacts(
    virtualModelProfiles,
    coreEndpoint,
    coreAuthToken,
    browserWebSearchMcpIntegration,
    proxyPreloadFile,
    proxyEnv,
    {
      endpoint: `${endpoint(config.gateway.host, config.gateway.port)}${billingUsageSyncPath}`,
      header: billingUsageSyncHeader,
      token: billingUsageSyncToken
    }
  );
  const providers = [
    ...config.Providers
      .flatMap((provider) => toCoreGatewayProviders(withCodexOauthProviderBaseUrl(provider, codexOauthProviderNames)))
      .filter((provider): provider is CoreGatewayProvider => Boolean(provider)),
    ...builtinToolArtifacts.providers
  ];
  const pluginAgentConfig = isRecord(pluginCoreGatewayConfig.agent) ? pluginCoreGatewayConfig.agent : {};
  const pluginMcpServers = Array.isArray(pluginAgentConfig.mcpServers) ? pluginAgentConfig.mcpServers : [];
  const externalMcpServers = [
    ...pluginMcpServers,
    ...(config.agent?.mcpServers ?? []),
    ...(config.toolHub?.mcpServers ?? [])
  ];
  const toolHubServer = toolHubMcpServer(config, externalMcpServers);
  const mcpServers = [
    ...builtinToolArtifacts.mcpServers,
    ...(toolHubServer ? [toolHubServer] : externalMcpServers)
  ];
  const fallbackMcpServer = fusionToolFallbackMcpServer(virtualModelProfiles, [
    ...builtinToolArtifacts.mcpServers,
    ...externalMcpServers
  ]);
  if (fallbackMcpServer) {
    mcpServers.push(fallbackMcpServer);
  }
  return {
    ...pluginCoreGatewayConfig,
    auth: {
      enabled: true,
      mode: "static_api_key",
      required: true,
      staticApiKeys: {
        keyBearerOnly: false,
        keyEnv: coreGatewayAuthTokenEnv,
        keyHeader: coreGatewayAuthHeader,
        keys: [coreAuthToken]
      }
    },
    billing: {
      ...pluginBillingConfig,
      enabled: true
    },
    billingQueue: {
      enabled: false
    },
    billingWebhook: {
      enabled: false
    },
    bodyLimitBytes: 50 * 1024 * 1024,
    host: config.gateway.coreHost,
    mcpGateway: {
      enabled: false
    },
    port: config.gateway.corePort,
    plugins: [
      ...configuredGatewayPlugins,
      {
        enabled: true,
        key: upstreamHeaderSanitizerPluginKey,
        modulePath: pathJoin(__dirname, "upstream-header-sanitizer.js")
      }
    ],
    upstreamTimeoutMs: Number(config.API_TIMEOUT_MS) || 0,
    agent: {
      ...pluginAgentConfig,
      mcpServers
    },
    rawTrace: buildRawTraceConfig(config, rawTraceSyncToken),
    providerPlugins,
    providers,
    virtualModelProfiles
  };
}


function providerPluginEnabled(plugin: unknown): boolean {
  return !isRecord(plugin) || plugin.enabled !== false;
}


export function normalizeCoreGatewayVirtualModelProfiles(profiles: unknown[], config: AppConfig): unknown[] {
  return profiles.map((profile) => normalizeCoreGatewayVirtualModelProfile(profile, config));
}


export function coreGatewayUsageAttributionConfig(
  config: AppConfig
): Pick<AppConfig, "Providers" | "virtualModelProfiles"> {
  return {
    Providers: config.Providers,
    virtualModelProfiles: coreGatewayVirtualModelProfiles(config).flatMap(normalizeUsageVirtualModelProfile)
  };
}


function coreGatewayVirtualModelProfiles(config: AppConfig): unknown[] {
  return normalizeCoreGatewayVirtualModelProfiles(withCodexCompatibleVirtualModelProfiles(withFusionVirtualModelAliases([
    ...(config.virtualModelProfiles ?? []),
    ...pluginService.getVirtualModelProfiles()
  ])), config);
}


function normalizeUsageVirtualModelProfile(value: unknown): VirtualModelProfileConfig[] {
  if (!isRecord(value) || !isRecord(value.match)) {
    return [];
  }
  const match = {
    exactAliases: stringListValue(value.match.exactAliases),
    prefixes: stringListValue(value.match.prefixes),
    suffixes: stringListValue(value.match.suffixes)
  };
  if (match.exactAliases.length === 0 && match.prefixes.length === 0 && match.suffixes.length === 0) {
    return [];
  }
  return [{
    ...value,
    enabled: value.enabled !== false,
    match
  } as VirtualModelProfileConfig];
}


function normalizeCoreGatewayVirtualModelProfile(profile: unknown, config: AppConfig): unknown {
  if (!isRecord(profile)) {
    return profile;
  }

  let nextProfile: Record<string, unknown> | undefined;
  const baseModel = isRecord(profile.baseModel) ? profile.baseModel : undefined;
  const fixedModel = stringValue(baseModel?.fixedModel);
  const rewrittenFixedModel = fixedModel
    ? rewriteModelSelectorForCoreGatewayProfile(fixedModel, config, "anthropic_messages")
    : undefined;
  if (baseModel && rewrittenFixedModel && rewrittenFixedModel !== fixedModel) {
    nextProfile = {
      ...profile,
      baseModel: {
        ...baseModel,
        fixedModel: rewrittenFixedModel
      }
    };
  }

  const sourceProfile = nextProfile ?? profile;
  const metadata = isRecord(sourceProfile.metadata) ? sourceProfile.metadata : undefined;
  const fusionVision = isRecord(metadata?.fusionVision) ? metadata.fusionVision : undefined;
  const visionBaseUrl = stringValue(fusionVision?.baseUrl);
  const visionSelectorField = stringValue(fusionVision?.modelSelector) ? "modelSelector" : stringValue(fusionVision?.model) ? "model" : undefined;
  const visionSelector = visionSelectorField ? stringValue(fusionVision?.[visionSelectorField]) : undefined;
  const rewrittenVisionSelector = fusionVision && !visionBaseUrl && visionSelector
    ? rewriteModelSelectorForCoreGatewayProfile(visionSelector, config, "openai_chat_completions")
    : undefined;

  if (metadata && fusionVision && visionSelectorField && rewrittenVisionSelector && rewrittenVisionSelector !== visionSelector) {
    nextProfile = {
      ...sourceProfile,
      metadata: {
        ...metadata,
        fusionVision: {
          ...fusionVision,
          [visionSelectorField]: rewrittenVisionSelector
        }
      }
    };
  }

  const profileAfterVision = nextProfile ?? profile;
  const profileAfterWebSearchToolName = normalizeFusionWebSearchProfileToolName(profileAfterVision) ?? profileAfterVision;
  return withFusionWebSearchToolInstructions(profileAfterWebSearchToolName) ?? profileAfterWebSearchToolName;
}


function rewriteModelSelectorForCoreGatewayProfile(
  model: string,
  config: AppConfig,
  clientProtocol: GatewayProviderProtocol
): string | undefined {
  const normalized = normalizeRouteSelector(model);
  if (!normalized) {
    return undefined;
  }

  const publicModel = resolveGatewayPublicModelId(normalized, config) ?? normalized;
  const selector =
    resolveConfiguredProviderModelSelector(publicModel, config) ??
    resolveUniqueConfiguredProviderModelSelector(publicModel, config);
  if (!selector) {
    return publicModel;
  }

  const providerName = coreGatewayProviderSelectorName(selector.provider, clientProtocol);
  return providerName ? `${providerName}/${selector.model}` : publicModel;
}


function coreGatewayProviderSelectorName(
  provider: GatewayProviderConfig,
  clientProtocol: GatewayProviderProtocol
): string | undefined {
  const capability = providerCapabilityForClientProtocol(provider, clientProtocol);
  const explicitCapabilities = normalizedProviderCapabilities(provider);
  const protocol = capability?.type ?? (explicitCapabilities.length === 0 ? providerProtocolForClientProtocol(provider, clientProtocol) : undefined);
  if (!protocol) {
    return undefined;
  }

  const credentials = sortProviderCredentialsForConfig(activeProviderCredentials(provider));
  if (credentials.length > 0) {
    return providerCredentialInternalName(provider, protocol, credentials[0]);
  }

  return capability ? providerCapabilityInternalName(provider, protocol) : providerRuntimeId(provider);
}


function withCodexOauthRuntimeDefaults(providerPlugins: unknown[]): unknown[] {
  const codexAuth = readCodexAuth();
  return providerPlugins.map((plugin) => {
    if (!isLocalCodexOauthProviderPlugin(plugin)) {
      return plugin;
    }

    const codexOauth = plugin.codexOauth;
    const nextCodexOauth = {
      ...codexOauth,
      ...(!hasOwn(codexOauth, "accountId") && !hasOwn(codexOauth, "account_id") && codexAuth?.accountId
        ? { accountId: codexAuth.accountId }
        : {})
    };
    const nextPlugin: Record<string, unknown> = {
      ...plugin,
      codexOauth: nextCodexOauth,
      request: withCodexBackendRequestTransform(plugin.request)
    };

    if (codexAuth?.isFedrampAccount) {
      const currentAuth = isRecord(plugin.auth) ? plugin.auth : {};
      const currentHeaders = isRecord(currentAuth.headers) ? currentAuth.headers : {};
      nextPlugin.auth = {
        ...currentAuth,
        headers: {
          ...currentHeaders,
          "X-OpenAI-Fedramp": "true"
        }
      };
    }

    return nextPlugin;
  });
}


async function withGrokOauthRuntimeDefaults(providerPlugins: unknown[]): Promise<unknown[]> {
  const grokAuth = await resolveGrokAuth().catch(() => readGrokAuth());
  if (!grokAuth?.accessToken || grokAccessTokenExpired(grokAuth)) {
    return providerPlugins;
  }

  return providerPlugins.map((plugin) => {
    if (!isLocalGrokOauthProviderPlugin(plugin)) {
      return plugin;
    }
    const currentAuth = isRecord(plugin.auth) ? plugin.auth : {};
    const currentHeaders = isRecord(currentAuth.headers) ? currentAuth.headers : {};
    const currentRequest = isRecord(plugin.request) ? plugin.request : {};
    const currentRequestHeaders = isRecord(currentRequest.headers) ? currentRequest.headers : {};
    return {
      ...plugin,
      auth: {
        ...currentAuth,
        headers: {
          ...currentHeaders,
          authorization: `Bearer ${grokAuth.accessToken}`
        }
      },
      request: {
        ...currentRequest,
        headers: {
          ...currentRequestHeaders,
          "x-grok-client-identifier": "xai-grok-cli",
          "x-grok-client-version": grokClientVersion(),
          "x-grok-model-override": currentRequestHeaders["x-grok-model-override"] ?? "{{ model }}"
        },
        strict: currentRequest.strict ?? true
      }
    };
  });
}


function codexOauthLocalProviderNames(providerPlugins: unknown[]): Set<string> {
  const names = new Set<string>();
  for (const plugin of providerPlugins) {
    if (!isLocalCodexOauthProviderPlugin(plugin)) {
      continue;
    }
    addProviderNameVariants(names, stringValue(plugin.providerName));
  }
  return names;
}


function withCodexOauthProviderBaseUrl(
  provider: GatewayProviderConfig,
  codexOauthProviderNames: Set<string>
): GatewayProviderConfig {
  if (!codexOauthProviderNames.has(provider.name)) {
    return provider;
  }

  const protocol =
    normalizeProviderProtocol(provider.type) ??
    normalizeProviderProtocol(provider.provider) ??
    inferProtocol(provider);
  if (protocol !== "openai_responses") {
    return provider;
  }

  const capabilities = Array.isArray(provider.capabilities)
    ? provider.capabilities.map((capability) => {
        const capabilityProtocol = normalizeProviderProtocol(capability.type);
        if (capabilityProtocol !== "openai_responses") {
          return capability;
        }
        return {
          ...capability,
          baseUrl: codexDefaultBaseUrl
        };
      })
    : provider.capabilities;

  return {
    ...provider,
    api_base_url: codexDefaultBaseUrl,
    baseUrl: codexDefaultBaseUrl,
    baseurl: codexDefaultBaseUrl,
    capabilities
  };
}


function isLocalCodexOauthProviderPlugin(value: unknown): value is Record<string, unknown> & { codexOauth: Record<string, unknown> } {
  if (!isRecord(value) || !isRecord(value.codexOauth)) {
    return false;
  }
  const key = stringValue(value.key)?.toLowerCase() ?? "";
  return key.startsWith("ccr-local-agent-") && key.includes("codex-oauth");
}


export function normalizeClaudeCodeOauthProviderPlugins(providerPlugins: unknown[]): unknown[] {
  return providerPlugins.map((plugin) => {
    if (!isLocalClaudeCodeOauthProviderPlugin(plugin)) {
      return plugin;
    }

    const auth = isRecord(plugin.auth) ? plugin.auth : {};
    const headers = isRecord(auth.headers) ? auth.headers : {};
    const configuredBeta = Object.entries(headers)
      .find(([name]) => name.trim().toLowerCase() === claudeCodeOauthBetaHeader)?.[1];
    const defaultBeta = mergeAnthropicBetaValues(
      configuredAnthropicBetaDefault(configuredBeta),
      claudeCodeOauthRequiredBeta
    );
    const normalizedHeaders = Object.fromEntries(
      Object.entries(headers).filter(([name]) => name.trim().toLowerCase() !== claudeCodeOauthBetaHeader)
    );

    return {
      ...plugin,
      auth: {
        ...auth,
        headers: {
          ...normalizedHeaders,
          [claudeCodeOauthBetaHeader]: {
            default: defaultBeta,
            from: `request.headers.${claudeCodeOauthBetaHeader}`
          }
        }
      }
    };
  });
}


function configuredAnthropicBetaDefault(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  return stringValue(value.default);
}


function isLocalGrokOauthProviderPlugin(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }
  const key = stringValue(value.key)?.toLowerCase() ?? "";
  return key.startsWith("ccr-local-agent-") && key.includes("grok-cli-oauth");
}


function withCodexBackendRequestTransform(request: unknown): Record<string, unknown> {
  const currentRequest = isRecord(request) ? request : {};
  const bodyRemove = Array.isArray(currentRequest.bodyRemove)
    ? currentRequest.bodyRemove.map((item) => stringValue(item)).filter((item): item is string => Boolean(item))
    : [];
  return {
    ...currentRequest,
    bodyRemove: uniqueStrings([...bodyRemove, "max_output_tokens"])
  };
}


function addProviderNameVariants(names: Set<string>, providerName: string | undefined): void {
  if (!providerName) {
    return;
  }
  names.add(providerName);
  const capabilitySeparatorIndex = providerName.indexOf("::");
  if (capabilitySeparatorIndex > 0) {
    names.add(providerName.slice(0, capabilitySeparatorIndex));
  }
}


function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
