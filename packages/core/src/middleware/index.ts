/**
 * Middleware index - extended with ContextCapture.
 */
export { SemanticCache } from "./semantic-cache";
export type { CacheConfig } from "./semantic-cache";

export { MemoryBridge } from "./memory-bridge";
export type { MemoryConfig } from "./memory-bridge";

export { RAGEnricher } from "./rag-enricher";
export type { RAGConfig } from "./rag-enricher";

export { HookManager } from "./hooks";
export type { HookContext, HookHandler, HookPriority } from "./hooks";

export { ContextCaptureEngine } from "./context-capture";
export type { CaptureEntry, CaptureConfig, ToolCallRecord } from "./context-capture";

export { MiddlewareOrchestrator } from "./orchestrator";
export type { MiddlewareConfig } from "./orchestrator";

export { LangfuseTracer } from "./langfuse-tracer";
export type { LangfuseConfig } from "./langfuse-tracer";

export { ToolCompressor } from "./tool-compressor";
export type { ToolCompressorConfig } from "./tool-compressor";

export { IdempotencyGuard } from "./idempotency-guard";
export type { IdempotencyConfig } from "./idempotency-guard";

export { KeyManager } from "./key-manager";
export type { KeyConfig, KeyManagerConfig } from "./key-manager";

export { QdrantCache } from "./qdrant-cache";
export type { QdrantCacheConfig } from "./qdrant-cache";

export { PromptCaching } from "./prompt-caching";
export type { PromptCachingConfig } from "./prompt-caching";

export { SummaryInjector } from "./summary-injector";
export type { SummaryInjectorConfig } from "./summary-injector";

export { MultiModelVoter } from "./multi-voter";
export type { MultiVoterConfig } from "./multi-voter";

export { RequestReplay } from "./request-replay";
export type { ReplayConfig } from "./request-replay";
