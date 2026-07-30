import {
  CLOUD_SYNC_SCOPE_IDS,
  DEFAULT_CLOUD_SYNC_SCOPES,
  type CloudSyncScope
} from "@ccr/core/contracts/app";

export const cloudSyncScopeOptions: Array<{
  description?: string;
  id: CloudSyncScope;
  label: string;
}> = [
  { id: "providers", label: "Provider" },
  { id: "agent-profiles", label: "Agent Profile" },
  {
    description: "Sync the latest 5,000 usage records.",
    id: "usage",
    label: "Usage statistics"
  },
  { id: "fusion", label: "Fusion" },
  { id: "api-keys", label: "API keys" },
  { id: "extensions", label: "Extensions" },
  { id: "bot", label: "Bot" },
  { id: "toolhub", label: "ToolHub" },
  { id: "appearance", label: "Appearance settings" },
  { id: "tray", label: "Tray" },
  { id: "overview", label: "Overview configuration" }
];

export function normalizeCloudSyncScopeSelection(value: unknown): CloudSyncScope[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_CLOUD_SYNC_SCOPES];
  }
  const allowed = new Set<unknown>(CLOUD_SYNC_SCOPE_IDS);
  return [...new Set(value.filter((item): item is CloudSyncScope => allowed.has(item)))];
}

export { CLOUD_SYNC_SCOPE_IDS, DEFAULT_CLOUD_SYNC_SCOPES };
export type { CloudSyncScope };
