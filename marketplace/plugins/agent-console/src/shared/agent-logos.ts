import claudeCodeLogoUrl from "../renderer/assets/agent-logos/claude-code.png";
import codexLogoUrl from "../renderer/assets/agent-logos/codex.png";

export const builtinAgentProviderLogos: Record<string, string> = {
  "claude-code": claudeCodeLogoUrl,
  codex: codexLogoUrl
};

export function getBuiltinAgentProviderLogoDataUrl(providerId: string): string | undefined {
  if (providerId === "claude") return builtinAgentProviderLogos["claude-code"];
  if (providerId === "openai-codex") return builtinAgentProviderLogos.codex;
  return builtinAgentProviderLogos[providerId];
}
