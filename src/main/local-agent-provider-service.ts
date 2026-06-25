import type {
  LocalAgentProviderCandidate,
  LocalAgentProviderImportRequest,
  LocalAgentProviderImportResult
} from "../shared/app";
import { claudeCodeCandidate, importClaudeCodeProvider } from "./local-agent-providers/claude-code";
import { codexCandidate, importCodexProvider } from "./local-agent-providers/codex";
import { importZcodeProvider, zcodeCandidate } from "./local-agent-providers/zcode";

export { codexDefaultBaseUrl, readCodexAuth } from "./local-agent-providers/codex";
export { localAgentProviderApiKey, type OAuthTokenSet } from "./local-agent-providers/shared";

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
