import type { GatewayProviderCapability, GatewayProviderConfig } from "@ccr/core/contracts/app";

export type FusionImageProviderSchema = {
  endpoints: Array<{
    baseUrl: string;
    generationPath: string;
  }>;
  id: string;
  models: string[];
  protocol: "openai_image_generations";
};

export const miniMaxImageGenerationSchema: FusionImageProviderSchema = {
  endpoints: [
    {
      baseUrl: "https://api.minimax.io/v1",
      generationPath: "/v1/image_generation"
    },
    {
      baseUrl: "https://api.minimaxi.com/v1",
      generationPath: "/v1/image_generation"
    }
  ],
  id: "minimax-image-generation",
  models: ["image-01", "image-01-live"],
  protocol: "openai_image_generations"
};

const fusionImageProviderSchemas = [miniMaxImageGenerationSchema];

export function registeredMediaCapabilities(provider: GatewayProviderConfig): GatewayProviderCapability[] {
  if ((provider.capabilities ?? []).some((capability) => capability.type === "openai_image_generations")) {
    return [];
  }
  const providerBaseUrl = provider.baseurl || provider.baseUrl || provider.api_base_url;
  if (!providerBaseUrl) return [];
  const configuredModels = new Set(provider.models ?? []);
  return fusionImageProviderSchemas.flatMap((schema) => {
    if (!schema.models.some((model) => configuredModels.has(model))) return [];
    const endpoint = schema.endpoints.find((item) => sameOrigin(item.baseUrl, providerBaseUrl));
    return endpoint
      ? [{ baseUrl: endpoint.baseUrl, source: "preset" as const, type: schema.protocol }]
      : [];
  });
}

export function fusionImageProviderSchemaForUrl(value: string): {
  endpoint: FusionImageProviderSchema["endpoints"][number];
  schema: FusionImageProviderSchema;
} | undefined {
  for (const schema of fusionImageProviderSchemas) {
    const endpoint = schema.endpoints.find((item) => sameOrigin(item.baseUrl, value));
    if (endpoint) return { endpoint, schema };
  }
  return undefined;
}

function sameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}
