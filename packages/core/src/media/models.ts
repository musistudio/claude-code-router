import {
  GROK_API_DEFAULT_IMAGE_MODEL,
  GROK_API_DEFAULT_VIDEO_MODEL,
  GROK_CLI_MEDIA_MODEL_SELECTOR
} from "@ccr/core/contracts/app";
import type { GatewayMediaProtocol, GatewayProviderConfig } from "@ccr/core/contracts/app";

const localAgentProviderApiKey = "ccr-local-agent-login";

export type GrokMediaKind = "image" | "video";

export type VideoGenerationConstraints = {
  aspectRatios: string[];
  defaultDuration?: number;
  defaultResolution?: string;
  durationMaximum?: number;
  durationMinimum?: number;
  durations?: number[];
  requiredParameters: Array<"aspect_ratio" | "duration" | "resolution">;
  resolutions: string[];
};

export type GrokMediaModelOption = {
  label: string;
  value: string;
};

export function grokMediaModelKind(model: string | undefined): GrokMediaKind | undefined {
  const id = model?.trim().split("/").pop()?.toLowerCase();
  if (id?.startsWith("grok-imagine-image")) return "image";
  if (id?.startsWith("grok-imagine-video")) return "video";
  return undefined;
}

export function isImportedGrokAgentProvider(provider: GatewayProviderConfig): boolean {
  const apiKey = provider.apikey || provider.apiKey || provider.api_key || "";
  if (apiKey !== localAgentProviderApiKey) return false;
  const baseUrl = provider.baseurl || provider.baseUrl || provider.api_base_url || "";
  return /(?:^|\.)cli-chat-proxy\.grok\.com$/i.test(urlHost(baseUrl)) || /grok/i.test(provider.name ?? "");
}

export function grokMediaModelsForProvider(provider: GatewayProviderConfig, kind: GrokMediaKind): string[] {
  if (!providerSupportsMediaKind(provider, kind)) {
    return [];
  }
  const configured = (provider.models ?? [])
    .map((model) => model.trim())
    .filter((model) => model && grokMediaModelKind(model) !== oppositeMediaKind(kind));
  const classified = configured.filter((model) => grokMediaModelKind(model) === kind);
  if (!isImportedGrokAgentProvider(provider)) {
    return uniqueStrings(classified.length > 0 ? classified : configured);
  }
  const fallback = kind === "image" ? GROK_API_DEFAULT_IMAGE_MODEL : GROK_API_DEFAULT_VIDEO_MODEL;
  return uniqueStrings([
    ...classified,
    fallback
  ]);
}

export function providerSupportsMediaKind(provider: GatewayProviderConfig, kind: GrokMediaKind): boolean {
  const capabilities = kind === "image"
    ? ["openai_image_generations"]
    : ["xai_video_generations", "openai_video_generations"];
  return isImportedGrokAgentProvider(provider) ||
    (provider.capabilities ?? []).some((item) => capabilities.includes(item.type)) ||
    (provider.models ?? []).some((model) => grokMediaModelKind(model) === kind);
}

export function videoGenerationConstraints(protocol: GatewayMediaProtocol): VideoGenerationConstraints {
  if (protocol === "openai_video_generations") {
    return {
      aspectRatios: ["16:9", "9:16"],
      durations: [4, 8, 12],
      requiredParameters: ["duration", "aspect_ratio", "resolution"],
      resolutions: ["720p"]
    };
  }
  return {
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
    defaultDuration: 6,
    defaultResolution: "480p",
    durationMaximum: 15,
    durationMinimum: 1,
    requiredParameters: [],
    resolutions: ["480p", "720p"]
  };
}

export function createGrokMediaModelOptions(
  providers: GatewayProviderConfig[],
  kind: GrokMediaKind
): GrokMediaModelOption[] {
  return providers.flatMap((provider) => grokMediaModelsForProvider(provider, kind).map((model) => ({
    label: `${provider.name}/${mediaModelDisplayName(model)}`,
    value: `${provider.name}/${model}`
  })));
}

export function defaultGrokMediaModelSelector(
  providers: GatewayProviderConfig[],
  kind: GrokMediaKind
): string | undefined {
  return createGrokMediaModelOptions(providers, kind)[0]?.value;
}

export function migrateLegacyGrokMediaModelSelector(
  providers: GatewayProviderConfig[],
  selector: string | undefined,
  kind: GrokMediaKind
): string | undefined {
  const normalized = selector?.trim();
  if (normalized && normalized !== GROK_CLI_MEDIA_MODEL_SELECTOR) return normalized;
  return defaultGrokMediaModelSelector(providers, kind);
}

function mediaModelDisplayName(model: string): string {
  const id = model.split("/").pop() ?? model;
  if (id === GROK_API_DEFAULT_IMAGE_MODEL) return "Grok Imagine Image Quality";
  if (id === GROK_API_DEFAULT_VIDEO_MODEL) return "Grok Imagine Video";
  return model;
}

function oppositeMediaKind(kind: GrokMediaKind): GrokMediaKind {
  return kind === "image" ? "video" : "image";
}

function urlHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
