import type {
  LocalAgentProviderCandidate,
  LocalAgentProviderImportRequest,
  LocalAgentProviderImportResult
} from "@ccr/core/contracts/app";
import { claudeCodeCandidate, importClaudeCodeProvider } from "@ccr/core/agents/local-providers/claude-code";
import { codexCandidate, importCodexProvider } from "@ccr/core/agents/local-providers/codex";
import { importZcodeProvider, zcodeCandidate } from "@ccr/core/agents/local-providers/zcode";

export { codexDefaultBaseUrl, readCodexAuth } from "@ccr/core/agents/local-providers/codex";
export { localAgentProviderApiKey, type OAuthTokenSet } from "@ccr/core/agents/local-providers/shared";

export function getLocalAgentProviderCandidates(): LocalAgentProviderCandidate[] {
  return [
    codexCandidate(),
    claudeCodeCandidate(),
    zcodeCandidate()
  ].filter((candidate) => candidate.status !== "missing");
}

export function importLocalAgentProvider(request: LocalAgentProviderImportRequest): LocalAgentProviderImportResult {
  const candidate = getLocalAgentProviderCandidates().find((item) => item.id === request.id);
  if (!candidate) {
    throw new Error("Local agent provider was not found.");
  }
  if (!candidate.importable) {
    throw new Error(candidate.detail || "Local agent login is not importable.");
  }

  if (candidate.kind === "codex") {
    return importCodexProvider(candidate, request.providerNames ?? []);
  }
  if (candidate.kind === "claude-code") {
    return importClaudeCodeProvider(candidate, request.providerNames ?? []);
  }
  return importZcodeProvider(candidate, request.providerNames ?? []);
}
