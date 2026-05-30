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
