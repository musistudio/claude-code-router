import {
  GROK_MEDIA_CAPABILITIES_TOOL_NAME,
  GROK_MEDIA_IMAGE_EDIT_TOOL_NAME,
  GROK_MEDIA_IMAGE_GENERATE_TOOL_NAME,
  GROK_MEDIA_JOB_CANCEL_TOOL_NAME,
  GROK_MEDIA_JOB_GET_TOOL_NAME,
  GROK_MEDIA_VIDEO_START_TOOL_NAME,
  isGatewayProviderEnabled
} from "@ccr/core/contracts/app";
import type { AppConfig, GatewayMediaProtocol } from "@ccr/core/contracts/app";
import type { MediaOperation } from "@ccr/core/media/contracts";
import { defaultGrokMediaModelSelector, migrateLegacyGrokMediaModelSelector, videoGenerationConstraints } from "@ccr/core/media/models";

export type MediaToolBinding = {
  modelSelector: string;
  name: string;
  operation: MediaOperation | "capabilities" | "job-cancel" | "job-get";
  protocol?: GatewayMediaProtocol;
};

export type MediaMcpToolDefinition = {
  description: string;
  inputSchema: Record<string, unknown>;
  name: string;
};

export function mediaToolBindingsForConfig(config: Pick<AppConfig, "Providers" | "virtualModelProfiles">): MediaToolBinding[] {
  const providers = (config.Providers ?? []).filter(isGatewayProviderEnabled);
  const bindings: MediaToolBinding[] = [];
  const seen = new Set<string>();
  const add = (binding: MediaToolBinding) => {
    if (!binding.name || !binding.modelSelector || seen.has(binding.name)) return;
    seen.add(binding.name);
    bindings.push(binding);
  };

  for (const profile of config.virtualModelProfiles ?? []) {
    if (profile.enabled === false) continue;
    const media = readFusionMediaConfig(profile.metadata?.fusionMedia);
    if (!media) continue;
    const imageModelSelector = migrateLegacyGrokMediaModelSelector(providers, media.imageModelSelector, "image");
    const videoModelSelector = migrateLegacyGrokMediaModelSelector(providers, media.videoModelSelector, "video");
    if (imageModelSelector) {
      if (media.imageGenerateToolName) add({ modelSelector: imageModelSelector, name: media.imageGenerateToolName, operation: "image-generate" });
      if (media.imageEditToolName) add({ modelSelector: imageModelSelector, name: media.imageEditToolName, operation: "image-edit" });
    }
    if (videoModelSelector) {
      if (media.videoStartToolName) add({ modelSelector: videoModelSelector, name: media.videoStartToolName, operation: "video-generate" });
      if (media.jobGetToolName) add({ modelSelector: videoModelSelector, name: media.jobGetToolName, operation: "job-get" });
      if (media.jobCancelToolName) add({ modelSelector: videoModelSelector, name: media.jobCancelToolName, operation: "job-cancel" });
    }
  }

  // Profiles produced by the first Grok-only implementation did not carry model bindings.
  // Migrate their tool names to an available Grok API model without invoking Grok CLI.
  const legacyToolNames = new Set(
    (config.virtualModelProfiles ?? [])
      .filter((profile) => profile.enabled !== false)
      .flatMap((profile) => Array.isArray(profile.tools) ? profile.tools.map((tool) => tool.name) : [])
  );
  const defaultImageModel = defaultGrokMediaModelSelector(providers, "image");
  const defaultVideoModel = defaultGrokMediaModelSelector(providers, "video");
  if (defaultImageModel && legacyToolNames.has(GROK_MEDIA_IMAGE_GENERATE_TOOL_NAME)) add({ modelSelector: defaultImageModel, name: GROK_MEDIA_IMAGE_GENERATE_TOOL_NAME, operation: "image-generate" });
  if (defaultImageModel && legacyToolNames.has(GROK_MEDIA_IMAGE_EDIT_TOOL_NAME)) add({ modelSelector: defaultImageModel, name: GROK_MEDIA_IMAGE_EDIT_TOOL_NAME, operation: "image-edit" });
  if (defaultVideoModel && legacyToolNames.has(GROK_MEDIA_VIDEO_START_TOOL_NAME)) add({ modelSelector: defaultVideoModel, name: GROK_MEDIA_VIDEO_START_TOOL_NAME, operation: "video-generate" });
  if (defaultVideoModel && legacyToolNames.has(GROK_MEDIA_JOB_GET_TOOL_NAME)) add({ modelSelector: defaultVideoModel, name: GROK_MEDIA_JOB_GET_TOOL_NAME, operation: "job-get" });
  if (defaultVideoModel && legacyToolNames.has(GROK_MEDIA_JOB_CANCEL_TOOL_NAME)) add({ modelSelector: defaultVideoModel, name: GROK_MEDIA_JOB_CANCEL_TOOL_NAME, operation: "job-cancel" });
  if ((defaultImageModel ?? defaultVideoModel) && legacyToolNames.has(GROK_MEDIA_CAPABILITIES_TOOL_NAME)) add({ modelSelector: (defaultImageModel ?? defaultVideoModel)!, name: GROK_MEDIA_CAPABILITIES_TOOL_NAME, operation: "capabilities" });
  return bindings;
}

export function mediaMcpToolDefinition(binding: MediaToolBinding): MediaMcpToolDefinition {
  if (binding.operation === "image-generate") return {
    description: `Generate an image through the selected media provider with ${binding.modelSelector}. This call waits for completion and returns a durable local artifact plus an expiring URL.`,
    inputSchema: objectSchema({
      aspect_ratio: { description: "Optional aspect ratio such as 1:1, 16:9, 9:16, 4:3, or 3:2.", type: "string" },
      idempotency_key: { description: "Stable caller-generated key that prevents duplicate paid submissions.", type: "string" },
      prompt: { description: "Image generation prompt.", maxLength: 20000, type: "string" }
    }, ["prompt"]),
    name: binding.name
  };
  if (binding.operation === "image-edit") return {
    description: `Edit one to three local images with ${binding.modelSelector}.`,
    inputSchema: objectSchema({
      aspect_ratio: { description: "Optional output aspect ratio.", type: "string" },
      idempotency_key: { description: "Stable caller-generated key that prevents duplicate paid submissions.", type: "string" },
      images: { description: "One to three absolute local image paths.", items: { type: "string" }, maxItems: 3, minItems: 1, type: "array" },
      prompt: { description: "Editing instruction.", maxLength: 20000, type: "string" }
    }, ["images", "prompt"]),
    name: binding.name
  };
  if (binding.operation === "video-generate") {
    const protocol = binding.protocol ?? "xai_video_generations";
    const constraints = videoGenerationConstraints(protocol);
    const durationSchema = constraints.durations
      ? { description: `Video duration in seconds for ${protocol}.`, enum: constraints.durations, type: "integer" }
      : {
          description: `Video duration in seconds for ${protocol}.`,
          maximum: constraints.durationMaximum,
          minimum: constraints.durationMinimum,
          type: "integer"
        };
    return {
      description: `Start a ${protocol} video job with ${binding.modelSelector}. Returns immediately with a job id. Supply zero images for text-to-video, one for image-to-video, or two to seven reference images.`,
      inputSchema: objectSchema({
        aspect_ratio: { description: `Output aspect ratio for ${protocol}.`, enum: constraints.aspectRatios, type: "string" },
        duration: durationSchema,
        idempotency_key: { description: "Stable caller-generated key that prevents duplicate paid submissions.", type: "string" },
        images: { description: "Up to seven absolute local image paths.", items: { type: "string" }, maxItems: 7, type: "array" },
        prompt: { description: "Video generation prompt.", maxLength: 20000, type: "string" },
        resolution: { description: `Requested output resolution for ${protocol}.`, enum: constraints.resolutions, type: "string" }
      }, ["prompt", ...constraints.requiredParameters]),
      name: binding.name
    };
  }
  if (binding.operation === "job-get") return {
    description: "Get the current state and artifact of a media job.",
    inputSchema: objectSchema({ job_id: { description: "Job id returned by a start or image call.", type: "string" } }, ["job_id"]),
    name: binding.name
  };
  if (binding.operation === "job-cancel") return {
    description: "Cancel a queued or running media job. Remote providers may already have billed a submitted request.",
    inputSchema: objectSchema({ job_id: { description: "Job id to cancel.", type: "string" } }, ["job_id"]),
    name: binding.name
  };
  return {
    description: "Return available media model bindings and constraints.",
    inputSchema: objectSchema({}),
    name: binding.name
  };
}

function readFusionMediaConfig(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, string> = {};
  for (const key of ["imageEditToolName", "imageGenerateToolName", "imageModelSelector", "jobCancelToolName", "jobGetToolName", "videoModelSelector", "videoStartToolName"]) {
    const item = readString(value[key]);
    if (item) result[key] = item;
  }
  return Object.keys(result).length ? result : undefined;
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { additionalProperties: false, properties, ...(required.length ? { required } : {}), type: "object" };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
