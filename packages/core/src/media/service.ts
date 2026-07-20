import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, realpathSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONFIGDIR } from "@ccr/core/config/constants";
import type { AppConfig, GatewayMediaProtocol, MediaToolsConfig } from "@ccr/core/contracts/app";
import type { ImageEditRequest, ImageGenerateRequest, MediaArtifact, MediaExecutionContext, MediaExecutionResult, MediaJob, MediaJobError, MediaOperation, MediaRequest, PublicMediaArtifact, PublicMediaJob, VideoGenerateRequest } from "@ccr/core/media/contracts";
import { GatewayMediaExecutor } from "@ccr/core/media/executors";
import type { GatewayMediaTarget, GatewayMediaTransport } from "@ccr/core/media/executors";
import { grokMediaModelKind, isImportedGrokAgentProvider, migrateLegacyGrokMediaModelSelector, providerSupportsMediaKind, videoGenerationConstraints } from "@ccr/core/media/models";
import { detectMediaType, MediaArtifactStore, MediaJobStore } from "@ccr/core/media/storage";
import { mediaToolBindingsForConfig } from "@ccr/core/media/tools";
import type { MediaToolBinding } from "@ccr/core/media/tools";
import { activeProviderCredentials, inferProtocol, providerCapabilityInternalName, providerCredentialInternalName, sortProviderCredentialsForConfig } from "@ccr/core/providers/runtime-topology";
import { modelRegistryForConfig, parseProviderModelSelector, providerRuntimeId } from "@ccr/core/routing/model-registry";

type QueueItem = {
  jobId: string;
  request?: MediaRequest;
  resumeRemoteRequestId?: string;
};

type Completion = {
  promise: Promise<MediaJob>;
  resolve: (job: MediaJob) => void;
};

const mediaRoot = path.join(CONFIGDIR, "grok-media");
const maxInputBytes = 25 * 1024 * 1024;
const jobRetentionDays = 30;

export type { MediaToolBinding } from "@ccr/core/media/tools";

export class MediaService {
  private readonly active = new Map<string, AbortController>();
  private artifactStoreValue?: MediaArtifactStore;
  private cleanupTimer?: NodeJS.Timeout;
  private readonly completions = new Map<string, Completion>();
  private config?: AppConfig;
  private endpoint = "";
  private gatewayTransport?: GatewayMediaTransport;
  private jobStoreValue?: MediaJobStore;
  private queue: QueueItem[] = [];
  private running = false;
  private stopping = false;

  constructor(private readonly rootDir = mediaRoot) {}

  private get jobStore(): MediaJobStore {
    return this.jobStoreValue ??= new MediaJobStore(this.rootDir);
  }

  private get artifactStore(): MediaArtifactStore {
    return this.artifactStoreValue ??= new MediaArtifactStore(this.rootDir);
  }

  start(config: AppConfig, endpoint: string, gatewayTransport?: GatewayMediaTransport): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = undefined;
    this.config = structuredClone(config);
    this.endpoint = endpoint.replace(/\/+$/g, "");
    this.gatewayTransport = normalizeGatewayTransport(gatewayTransport ?? { baseUrl: endpoint });
    this.running = true;
    this.stopping = false;
    if (config.mediaTools.enabled) {
      this.recoverInterruptedJobs();
      this.startCleanup();
    }
  }

  updateConfig(config: AppConfig, endpoint: string, gatewayTransport?: GatewayMediaTransport): void {
    const wasEnabled = this.config?.mediaTools.enabled === true;
    this.config = structuredClone(config);
    this.endpoint = endpoint.replace(/\/+$/g, "");
    this.gatewayTransport = normalizeGatewayTransport(gatewayTransport ?? this.gatewayTransport ?? { baseUrl: endpoint });
    if (!wasEnabled && config.mediaTools.enabled) {
      this.recoverInterruptedJobs();
      this.startCleanup();
    } else if (wasEnabled && !config.mediaTools.enabled && this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.schedule();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.stopping = true;
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = undefined;
    for (const controller of this.active.values()) controller.abort();
    const deadline = Date.now() + 3000;
    while (this.active.size && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    for (const item of this.queue) {
      const job = this.jobStore.get(item.jobId);
      if (!job) continue;
      if (item.resumeRemoteRequestId) {
        const next = this.jobStore.update(job.id, { status: "running" });
        this.completions.get(job.id)?.resolve(next);
        this.completions.delete(job.id);
      } else if (job.status === "queued") {
        this.finishCanceled(job, "CCR stopped before the media job started.");
      }
    }
    this.queue = [];
  }

  enabled(): boolean {
    return Boolean(this.running && this.config?.mediaTools.enabled);
  }

  async imageGenerate(args: Record<string, unknown>, modelSelector: string): Promise<PublicMediaJob> {
    const request: ImageGenerateRequest = {
      aspectRatio: optionalString(args.aspect_ratio),
      prompt: requiredPrompt(args.prompt)
    };
    return this.submitAndWait("image-generate", request, modelSelector, optionalString(args.idempotency_key));
  }

  async imageEdit(args: Record<string, unknown>, modelSelector: string): Promise<PublicMediaJob> {
    const request: ImageEditRequest = {
      aspectRatio: optionalString(args.aspect_ratio),
      images: this.validateImages(args.images ?? args.image, 1, 3),
      prompt: requiredPrompt(args.prompt)
    };
    return this.submitAndWait("image-edit", request, modelSelector, optionalString(args.idempotency_key));
  }

  videoStart(args: Record<string, unknown>, modelSelector: string): PublicMediaJob {
    const target = resolveProviderMediaTarget(this.requireConfig(), modelSelector, "video-generate");
    const constraints = videoGenerationConstraints(target.protocol);
    const durationValue = numberValue(args.duration) ?? constraints.defaultDuration;
    if (durationValue === undefined) throw new Error(`duration is required for ${target.protocol}.`);
    if (!Number.isInteger(durationValue)) throw new Error("duration must be an integer number of seconds.");
    if (constraints.durations && !constraints.durations.includes(durationValue)) {
      throw new Error(`duration must be one of ${constraints.durations.join(", ")} seconds for ${target.protocol}.`);
    }
    if (constraints.durationMinimum !== undefined && constraints.durationMaximum !== undefined &&
      (durationValue < constraints.durationMinimum || durationValue > constraints.durationMaximum)) {
      throw new Error(`duration must be between ${constraints.durationMinimum} and ${constraints.durationMaximum} seconds for ${target.protocol}.`);
    }
    const resolution = optionalString(args.resolution) ?? constraints.defaultResolution;
    if (!resolution) throw new Error(`resolution is required for ${target.protocol}.`);
    if (!constraints.resolutions.includes(resolution)) {
      throw new Error(`resolution must be one of ${constraints.resolutions.join(", ")} for ${target.protocol}.`);
    }
    const aspectRatio = optionalString(args.aspect_ratio);
    if (constraints.requiredParameters.includes("aspect_ratio") && !aspectRatio) {
      throw new Error(`aspect_ratio is required for ${target.protocol}.`);
    }
    if (aspectRatio && !constraints.aspectRatios.includes(aspectRatio)) {
      throw new Error(`aspect_ratio must be one of ${constraints.aspectRatios.join(", ")} for ${target.protocol}.`);
    }
    const request: VideoGenerateRequest = {
      aspectRatio,
      duration: durationValue,
      images: args.images === undefined && args.image === undefined ? [] : this.validateImages(args.images ?? args.image, 1, 7),
      prompt: requiredPrompt(args.prompt),
      resolution
    };
    const job = this.submit("video-generate", request, modelSelector, optionalString(args.idempotency_key));
    return this.publicJob(job);
  }

  getJob(id: string): PublicMediaJob {
    const job = this.jobStore.get(id);
    if (!job) throw new Error(`Media job not found: ${id}`);
    return this.publicJob(job);
  }

  cancelJob(id: string): PublicMediaJob {
    const job = this.jobStore.get(id);
    if (!job) throw new Error(`Media job not found: ${id}`);
    if (["canceled", "failed", "succeeded"].includes(job.status)) return this.publicJob(job);
    this.queue = this.queue.filter((item) => item.jobId !== id);
    this.active.get(id)?.abort();
    return this.publicJob(this.finishCanceled(job, "Canceled by MCP client."));
  }

  capabilities(): Record<string, unknown> {
    const config = this.requireConfig();
    const runtime = config.mediaTools;
    const bindings = this.toolBindings();
    return {
      backend: "gateway-media-api",
      bindings,
      constraints: {
        imageEditMaxInputs: 3,
        inputFileMaxBytes: maxInputBytes,
        videoReferenceMaxInputs: 7,
        videoTools: bindings
          .filter((binding) => binding.operation === "video-generate" && binding.protocol)
          .map((binding) => ({
            modelSelector: binding.modelSelector,
            name: binding.name,
            protocol: binding.protocol,
            ...videoGenerationConstraints(binding.protocol!)
          }))
      },
      enabled: runtime.enabled,
      operations: ["image-generate", "image-edit", "video-generate", "image-to-video", "reference-to-video"]
    };
  }

  toolBindings(): MediaToolBinding[] {
    return mediaToolBindingsForConfig(this.requireConfig()).map((binding) =>
      binding.operation === "video-generate"
        ? { ...binding, protocol: resolveProviderMediaTarget(this.requireConfig(), binding.modelSelector, binding.operation).protocol }
        : binding
    );
  }

  bindingForTool(name: string): MediaToolBinding | undefined {
    return this.toolBindings().find((binding) => binding.name === name);
  }

  resolveArtifact(id: string, token: string): { artifact: NonNullable<MediaJob["artifact"]>; state: "expired" | "missing" | "ok" } {
    const artifact = this.jobStore.list().map((job) => job.artifact).find((item) => item?.id === id);
    if (!artifact || !safeTokenEqual(artifact.accessToken, token)) return { artifact: undefined as never, state: "missing" };
    if (Date.parse(artifact.expiresAt) <= Date.now() || !existsSync(artifact.localPath)) return { artifact, state: "expired" };
    return { artifact, state: "ok" };
  }

  private async submitAndWait(operation: MediaOperation, request: MediaRequest, modelSelector: string, idempotencyKey: string | undefined): Promise<PublicMediaJob> {
    const job = this.submit(operation, request, modelSelector, idempotencyKey);
    if (job.status !== "queued" && job.status !== "running") return this.publicJob(job);
    const completion = this.completions.get(job.id);
    return this.publicJob(completion ? await completion.promise : this.jobStore.get(job.id) ?? job);
  }

  private submit(operation: MediaOperation, request: MediaRequest, modelSelector: string, idempotencyKey?: string): MediaJob {
    this.requireEnabledConfig();
    const normalizedModelSelector = normalizeMediaModelSelector(this.requireConfig(), modelSelector, operation);
    resolveProviderMediaTarget(this.requireConfig(), normalizedModelSelector, operation);
    const idempotencyKeyHash = idempotencyKey ? createHash("sha256").update(`${normalizedModelSelector}\n${idempotencyKey}`).digest("hex") : undefined;
    if (idempotencyKeyHash) {
      const existing = this.jobStore.list().find((job) => job.operation === operation && job.idempotencyKeyHash === idempotencyKeyHash);
      if (existing) return existing;
    }
    const now = new Date().toISOString();
    const job: MediaJob = {
      backend: "gateway-media-api",
      createdAt: now,
      id: randomUUID(),
      ...(idempotencyKeyHash ? { idempotencyKeyHash } : {}),
      modelSelector: normalizedModelSelector,
      operation,
      status: "queued",
      updatedAt: now
    };
    this.jobStore.put(job);
    this.completions.set(job.id, createCompletion());
    this.queue.push({ jobId: job.id, request });
    this.schedule();
    return job;
  }

  private schedule(): void {
    if (!this.running || !this.config?.mediaTools.enabled) return;
    for (let index = 0; index < this.queue.length;) {
      const item = this.queue[index];
      const job = this.jobStore.get(item.jobId);
      if (!job || !this.hasCapacity(job.operation)) {
        index += 1;
        continue;
      }
      this.queue.splice(index, 1);
      void this.run(item, job);
    }
  }

  private hasCapacity(operation: MediaOperation): boolean {
    const config = this.requireRuntimeConfig();
    const video = operation === "video-generate";
    const activeCount = [...this.active.keys()].map((id) => this.jobStore.get(id)).filter((job) => job && (job.operation === "video-generate") === video).length;
    return activeCount < (video ? config.maxVideoConcurrency : config.maxImageConcurrency);
  }

  private async run(item: QueueItem, initialJob: MediaJob): Promise<void> {
    const config = this.requireRuntimeConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.jobTimeoutMs);
    this.active.set(initialJob.id, controller);
    let job = this.jobStore.update(initialJob.id, { startedAt: initialJob.startedAt ?? new Date().toISOString(), status: "running" });
    try {
      const context: MediaExecutionContext = {
        job,
        onRemoteRequestId: (remoteRequestId) => {
          job = this.jobStore.update(job.id, { remoteRequestId });
        },
        signal: controller.signal
      };
      const result = item.resumeRemoteRequestId
        ? await this.executor(jobModelSelector(job), job.operation).resumeVideo(item.resumeRemoteRequestId, controller.signal)
        : await this.execute(job, item.request!, context);
      const artifact = await this.importResult(result, controller.signal, config.artifactTtlHours, jobModelSelector(job));
      job = this.jobStore.update(job.id, {
        artifact,
        error: undefined,
        finishedAt: new Date().toISOString(),
        status: "succeeded",
        usage: result.usage
      });
    } catch (error) {
      const current = this.jobStore.get(job.id) ?? job;
      if (current.status === "canceled") {
        job = current;
      } else if (this.stopping && isProviderApiJob(current) && current.remoteRequestId) {
        job = this.jobStore.update(job.id, { status: "running" });
      } else if (this.stopping) {
        job = this.jobStore.update(job.id, {
          error: { code: "interrupted", message: "CCR stopped before the media request completed. The request was not automatically resubmitted.", retryable: true },
          finishedAt: new Date().toISOString(),
          status: "failed"
        });
      } else {
        const normalized = normalizeJobError(error, controller.signal.aborted);
        job = this.jobStore.update(job.id, {
          error: normalized,
          finishedAt: new Date().toISOString(),
          status: normalized.code === "canceled" ? "canceled" : "failed"
        });
      }
    } finally {
      clearTimeout(timeout);
      this.active.delete(job.id);
      this.completions.get(job.id)?.resolve(job);
      this.completions.delete(job.id);
      this.schedule();
    }
  }

  private execute(job: MediaJob, request: MediaRequest, context: MediaExecutionContext): Promise<MediaExecutionResult> {
    const executor = this.executor(jobModelSelector(job), job.operation);
    if (job.operation === "image-generate") return executor.imageGenerate(request as ImageGenerateRequest, context);
    if (job.operation === "image-edit") return executor.imageEdit(request as ImageEditRequest, context);
    return executor.videoGenerate(request as VideoGenerateRequest, context);
  }

  private async importResult(result: MediaExecutionResult, signal: AbortSignal, ttlHours: number, modelSelector: string): Promise<MediaArtifact> {
    if (result.filePath) {
      try {
        return this.artifactStore.importFile(result.filePath, { contentType: result.contentType, fileName: result.fileName, ttlHours });
      } finally {
        if (isPathInside(result.filePath, os.tmpdir())) rmSync(result.filePath, { force: true });
      }
    }
    const downloaded = await this.executor(modelSelector).download(result, signal);
    return this.importResult(downloaded, signal, ttlHours, modelSelector);
  }

  private recoverInterruptedJobs(): void {
    for (const job of this.jobStore.list()) {
      if (job.status !== "queued" && job.status !== "running") continue;
      if (this.active.has(job.id) || this.queue.some((item) => item.jobId === job.id)) continue;
      if (isProviderApiJob(job) && job.operation === "video-generate" && job.remoteRequestId && jobModelSelector(job, false)) {
        this.completions.set(job.id, createCompletion());
        if (!this.queue.some((item) => item.jobId === job.id)) this.queue.push({ jobId: job.id, resumeRemoteRequestId: job.remoteRequestId });
      } else {
        this.jobStore.update(job.id, {
          error: { code: "interrupted", message: "CCR restarted before the media request completed. The request was not automatically resubmitted.", retryable: true },
          finishedAt: new Date().toISOString(),
          status: "failed"
        });
      }
    }
    this.schedule();
  }

  private startCleanup(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanup();
    this.cleanupTimer = setInterval(() => this.cleanup(), 60 * 60 * 1000);
    this.cleanupTimer.unref?.();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const job of this.jobStore.list()) {
      if (job.artifact && Date.parse(job.artifact.expiresAt) <= now) this.artifactStore.delete(job.artifact);
    }
    for (const job of this.jobStore.deleteOlderThan(now - jobRetentionDays * 24 * 60 * 60 * 1000)) this.artifactStore.delete(job.artifact);
  }

  private validateImages(value: unknown, min: number, max: number): string[] {
    const raw = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
    if (raw.length < min || raw.length > max || raw.some((item) => typeof item !== "string" || !item.trim())) {
      throw new Error(`images must contain between ${min} and ${max} local image paths.`);
    }
    const roots = mediaInputRoots(this.requireRuntimeConfig().allowedInputRoots);
    return raw.map((item) => {
      const resolved = realpathSync(expandHome(String(item).trim()));
      if (!roots.some((root) => isPathInside(resolved, root))) throw new Error(`Input image is outside allowed roots: ${resolved}`);
      const stats = statSync(resolved);
      if (!stats.isFile() || stats.size <= 0 || stats.size > maxInputBytes) throw new Error(`Input image must be a non-empty regular file no larger than ${maxInputBytes} bytes.`);
      if (!detectMediaType(resolved).mimeType?.startsWith("image/")) throw new Error(`Unsupported input image format: ${resolved}`);
      return resolved;
    });
  }

  private finishCanceled(job: MediaJob, message: string): MediaJob {
    const next = this.jobStore.update(job.id, {
      error: { code: "canceled", message, retryable: false },
      finishedAt: new Date().toISOString(),
      status: "canceled"
    });
    this.completions.get(job.id)?.resolve(next);
    this.completions.delete(job.id);
    return next;
  }

  private publicJob(job: MediaJob): PublicMediaJob {
    const { artifact, idempotencyKeyHash: _idempotencyKeyHash, ...rest } = job;
    return {
      ...rest,
      ...(artifact ? { artifact: this.publicArtifact(artifact) } : {})
    };
  }

  private publicArtifact(artifact: NonNullable<MediaJob["artifact"]>): PublicMediaArtifact {
    const { accessToken, ...rest } = artifact;
    const url = `${this.endpoint}/__ccr/media/artifacts/${encodeURIComponent(artifact.id)}?token=${encodeURIComponent(accessToken)}`;
    return {
      ...rest,
      url
    };
  }

  private requireConfig(): AppConfig {
    if (!this.config) throw new Error("Media service is not configured.");
    return this.config;
  }

  private requireRuntimeConfig(): MediaToolsConfig {
    return this.requireConfig().mediaTools;
  }

  private requireEnabledConfig(): MediaToolsConfig {
    const config = this.requireConfig();
    if (!this.running || !config.mediaTools.enabled) throw new Error("Media service is disabled.");
    return config.mediaTools;
  }

  private executor(modelSelector: string, operation?: MediaOperation): GatewayMediaExecutor {
    const transport = this.gatewayTransport;
    if (!transport) throw new Error("Media gateway transport is not configured.");
    return new GatewayMediaExecutor(resolveProviderMediaTarget(this.requireConfig(), modelSelector, operation), transport);
  }
}

function createCompletion(): Completion {
  let resolve!: (job: MediaJob) => void;
  const promise = new Promise<MediaJob>((value) => { resolve = value; });
  return { promise, resolve };
}

function requiredPrompt(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("prompt is required.");
  const prompt = value.trim();
  return prompt;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeJobError(error: unknown, aborted: boolean): MediaJobError {
  if (aborted && !(error && typeof error === "object" && "code" in error && error.code === "canceled")) {
    return { code: "timeout", message: "Media job exceeded its configured timeout.", retryable: true };
  }
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; message?: unknown; retryable?: unknown };
    return {
      code: typeof candidate.code === "string" ? candidate.code : "media_error",
      message: typeof candidate.message === "string" ? candidate.message : String(error),
      retryable: candidate.retryable === true
    };
  }
  return { code: "media_error", message: String(error), retryable: false };
}

function safeTokenEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

function expandHome(value: string): string {
  return value === "~" ? os.homedir() : value.startsWith(`~${path.sep}`) ? path.join(os.homedir(), value.slice(2)) : value;
}

function isPathInside(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function mediaInputRoots(allowedInputRoots: string[]): string[] {
  const workingDirectory = canonicalInputRoot(process.cwd());
  const homeDirectory = canonicalInputRoot(os.homedir());
  const roots = [
    ...(isSafeImplicitWorkingDirectory(workingDirectory, homeDirectory) ? [workingDirectory] : []),
    os.tmpdir(),
    CONFIGDIR,
    ...allowedInputRoots
  ].map(canonicalInputRoot);
  return [...new Set(roots)];
}

function canonicalInputRoot(value: string): string {
  const resolved = path.resolve(expandHome(value));
  return existsSync(resolved) ? realpathSync(resolved) : resolved;
}

function isSafeImplicitWorkingDirectory(workingDirectory: string, homeDirectory: string): boolean {
  const resolvedWorkingDirectory = path.resolve(workingDirectory);
  const resolvedHomeDirectory = path.resolve(homeDirectory);
  return resolvedWorkingDirectory !== path.parse(resolvedWorkingDirectory).root &&
    !isPathInside(resolvedHomeDirectory, resolvedWorkingDirectory);
}

function requiredModelSelector(value: string): string {
  const selector = value?.trim();
  if (!selector) throw new Error("A media model must be selected.");
  return selector;
}

function isProviderApiJob(job: MediaJob): boolean {
  const backend = (job as unknown as { backend?: string }).backend;
  return backend === "gateway-media-api" || backend === "provider-api" || backend === "xai-api";
}

function jobModelSelector(job: MediaJob): string;
function jobModelSelector(job: MediaJob, required: false): string | undefined;
function jobModelSelector(job: MediaJob, required = true): string | undefined {
  const selector = optionalString((job as Partial<MediaJob>).modelSelector);
  if (selector) return selector;
  if (required) throw new Error("This media job has no media API model binding and cannot be resumed.");
  return undefined;
}

export function resolveProviderMediaTarget(config: AppConfig, selector: string, operation?: MediaOperation): GatewayMediaTarget {
  const normalizedSelector = normalizeMediaModelSelector(config, selector, operation);
  const registry = modelRegistryForConfig(config);
  let resolved = registry.resolveProviderModel(normalizedSelector);
  if (!resolved) {
    const parsed = parseProviderModelSelector(normalizedSelector);
    const provider = parsed ? registry.findProvider(parsed.provider) : undefined;
    if (provider && isImportedGrokAgentProvider(provider) && grokMediaModelKind(parsed?.model)) {
      resolved = { model: parsed!.model, provider };
    }
  }
  if (!resolved) throw new Error(`Media model is not configured by a provider: ${normalizedSelector}`);
  const expectedKind = operation === "video-generate" ? "video" : operation ? "image" : undefined;
  const modelKind = grokMediaModelKind(resolved.model);
  if (expectedKind && modelKind && modelKind !== expectedKind) {
    throw new Error(`${resolved.model} is not a ${expectedKind} generation model.`);
  }
  const provider = resolved.provider;
  const kind = expectedKind ?? modelKind;
  if (!kind || !providerSupportsMediaKind(provider, kind)) {
    throw new Error(`Provider ${provider.name} does not declare ${kind ?? "media"} generation support.`);
  }
  const protocol: GatewayMediaProtocol = kind === "video"
    ? provider.capabilities?.some((item) => item.type === "xai_video_generations") || isImportedGrokAgentProvider(provider)
      ? "xai_video_generations"
      : "openai_video_generations"
    : "openai_image_generations";
  const capability = provider.capabilities?.find((item) => item.type === protocol) ??
    (protocol === "xai_video_generations" && isImportedGrokAgentProvider(provider)
      ? provider.capabilities?.find((item) => item.type === "openai_video_generations")
      : undefined);
  const providerBaseUrl = capability?.baseUrl ?? provider.baseurl ?? provider.baseUrl ?? provider.api_base_url;
  if (!providerBaseUrl?.trim()) {
    throw new Error(`Provider ${provider.name} does not configure a media API base URL.`);
  }
  const selectorProtocol = capability || isImportedGrokAgentProvider(provider)
    ? protocol
    : inferProtocol(provider);
  const credential = sortProviderCredentialsForConfig(activeProviderCredentials(provider))[0];
  return {
    model: resolved.model,
    protocol,
    providerBaseUrl: providerBaseUrl.trim(),
    providerName: provider.name,
    providerSelector: credential
      ? providerCredentialInternalName(provider, selectorProtocol, credential)
      : capability || isImportedGrokAgentProvider(provider)
        ? providerCapabilityInternalName(provider, protocol)
        : providerRuntimeId(provider)
  };
}

function normalizeMediaModelSelector(config: AppConfig, selector: string, operation?: MediaOperation): string {
  const kind = operation === "video-generate" ? "video" : "image";
  const migrated = migrateLegacyGrokMediaModelSelector(config.Providers, requiredModelSelector(selector), kind);
  if (!migrated) {
    throw new Error("No compatible media API model is available. Select a provider model that declares image or video generation support.");
  }
  return migrated;
}

function normalizeGatewayTransport(transport: GatewayMediaTransport): GatewayMediaTransport {
  return {
    ...transport,
    baseUrl: transport.baseUrl.replace(/\/+$/g, "")
  };
}

export const mediaService = new MediaService();

export const mediaServiceForTest = {
  isSafeImplicitWorkingDirectory
};
