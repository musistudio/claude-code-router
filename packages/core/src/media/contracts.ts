export type MediaOperation = "image-edit" | "image-generate" | "video-generate";
export type MediaJobStatus = "canceled" | "failed" | "queued" | "running" | "succeeded";
export type ResolvedMediaBackend = "gateway-media-api" | "provider-api";

export type MediaArtifact = {
  accessToken: string;
  expiresAt: string;
  fileName: string;
  id: string;
  localPath: string;
  mimeType: string;
  sha256: string;
  sizeBytes: number;
};

export type MediaJobError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type MediaUsage = {
  costUsdTicks?: number;
};

export type MediaJob = {
  artifact?: MediaArtifact;
  backend: ResolvedMediaBackend;
  createdAt: string;
  error?: MediaJobError;
  finishedAt?: string;
  id: string;
  idempotencyKeyHash?: string;
  modelSelector: string;
  operation: MediaOperation;
  remoteRequestId?: string;
  startedAt?: string;
  status: MediaJobStatus;
  updatedAt: string;
  usage?: MediaUsage;
};

export type ImageGenerateRequest = {
  aspectRatio?: string;
  prompt: string;
};

export type ImageEditRequest = ImageGenerateRequest & {
  images: string[];
};

export type VideoGenerateRequest = {
  aspectRatio?: string;
  duration: 6 | 10;
  images: string[];
  prompt: string;
  resolution: "480p" | "720p";
};

export type MediaRequest = ImageEditRequest | ImageGenerateRequest | VideoGenerateRequest;

export type MediaExecutionContext = {
  job: MediaJob;
  onRemoteRequestId: (requestId: string) => void;
  signal: AbortSignal;
};

export type MediaExecutionResult = {
  contentType?: string;
  fileName?: string;
  filePath?: string;
  remoteUrl?: string;
  usage?: MediaUsage;
};

export type PublicMediaArtifact = Omit<MediaArtifact, "accessToken" | "localPath"> & {
  localPath?: string;
  url: string;
};

export type PublicMediaJob = Omit<MediaJob, "artifact" | "idempotencyKeyHash"> & {
  artifact?: PublicMediaArtifact;
};
