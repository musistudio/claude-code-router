import { loadAppConfig } from "@ccr/core/config/config";
import type { ProfileConfig } from "@ccr/core/contracts/app";
import { getProviderAccountSnapshots } from "@ccr/core/providers/account-service";
import { codexNativeUsageData, readCodexAppUsage, type CodexAppUsage } from "@ccr/core/agents/codex/app-usage";

const selectedModels = new Map<string, string>();

export async function readCodexAppProfileUsage(profile: ProfileConfig, model?: string, initial = false): Promise<CodexAppUsage> {
  const config = await loadAppConfig();
  const current = config.profile.profiles.find(entry => entry.id === profile.id) ?? { ...profile, enabled: false };
  const usage = await readCodexAppUsage(config, current, model, initial ? async () => [] : getProviderAccountSnapshots);
  if (usage.models.includes(usage.model)) selectedModels.set(profile.id, usage.model);
  return usage;
}

/** Serve the official usage endpoint, scoped to the virtual identity's CCR profile. */
export async function codexAppAccountUsage(context: { accountId: string; authorization?: string }) {
  const token = context.authorization?.replace(/^Bearer\s+/i, "") || "";
  const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  let claims: Record<string, unknown> = {};
  try { if (token.endsWith(".ccr-virtual")) claims = record(JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"))); } catch {}
  const auth = record(claims["https://api.openai.com/auth"]);
  const userId = auth.chatgpt_user_id || auth.user_id;
  const identity = { account_id: context.accountId, user_id: typeof userId === "string" && userId ? userId : "ccr-virtual-user", plan_type: "plus" };
  let usage: CodexAppUsage = { model: "", models: [], snapshots: [] };
  if (auth.chatgpt_account_id === context.accountId && token.endsWith(".ccr-virtual")) {
    const config = await loadAppConfig();
    const name = record(claims["https://api.openai.com/profile"]).email;
    const profiles = config.profile.profiles.filter(profile => config.profile.enabled !== false && profile.enabled && profile.agent === "codex" && profile.scope !== "global");
    const matches = profiles.filter(profile => profile.name === name || profile.id === name);
    const profile = matches.length === 1 ? matches[0] : profiles.length === 1 ? profiles[0] : undefined;
    if (profile) {
      try { usage = await readCodexAppUsage(config, profile, selectedModels.get(profile.id), getProviderAccountSnapshots); }
      catch { usage = { model: selectedModels.get(profile.id) || profile.model, models: [], snapshots: [], error: true }; }
    }
  }
  return { ...identity, ...codexNativeUsageData(usage) };
}
