import { randomBytes } from "node:crypto";
import type { ApiKeyConfig, ProfileConfig } from "@ccr/core/contracts/app";

type ProfileApiKeySource = Pick<ProfileConfig, "agent" | "id" | "name">;

type ProfileApiKeySyncOptions = {
  generateKey?: () => string;
  now?: () => string;
};

export type ProfileApiKeySyncResult = {
  apiKeys: ApiKeyConfig[];
  changed: boolean;
  tokens: Map<string, string>;
};

export function profileApiKeyId(profile: ProfileApiKeySource | string): string {
  const value = typeof profile === "string" ? profile : profile.id || profile.name || profile.agent;
  return `profile:${sanitizeProfileKeySegment(value) || "profile"}`;
}

export function profileIdFromApiKeyId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed?.startsWith("profile:")) {
    return undefined;
  }
  return trimmed.slice("profile:".length) || undefined;
}

export function sanitizeProfileKeySegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function syncProfileApiKeys(
  apiKeys: ApiKeyConfig[],
  profiles: ProfileConfig[],
  options: ProfileApiKeySyncOptions = {}
): ProfileApiKeySyncResult {
  const nextApiKeys = [...apiKeys];
  const byId = new Map(nextApiKeys.map((apiKey, index) => [apiKey.id || `key-${index + 1}`, { apiKey, index }]));
  const tokens = new Map<string, string>();
  const generateKey = options.generateKey ?? generateProfileApiKey;
  const now = options.now ?? (() => new Date().toISOString());
  let changed = false;

  for (const profile of profiles.filter((candidate) => candidate.enabled)) {
    const id = profileApiKeyId(profile);
    const name = profileApiKeyName(profile);
    const existing = byId.get(id);
    if (existing?.apiKey.key.trim()) {
      tokens.set(profile.id, existing.apiKey.key.trim());
      if (existing.apiKey.name !== name) {
        nextApiKeys[existing.index] = {
          ...existing.apiKey,
          name
        };
        changed = true;
      }
      continue;
    }

    const apiKey: ApiKeyConfig = {
      createdAt: now(),
      id,
      key: generateKey(),
      name
    };
    nextApiKeys.push(apiKey);
    byId.set(id, { apiKey, index: nextApiKeys.length - 1 });
    tokens.set(profile.id, apiKey.key);
    changed = true;
  }

  return {
    apiKeys: nextApiKeys,
    changed,
    tokens
  };
}

export function pruneInactiveProfileApiKeysFromList(
  apiKeys: ApiKeyConfig[],
  profiles: ProfileConfig[]
): { apiKeys: ApiKeyConfig[]; changed: boolean } {
  const activeIds = new Set(profiles
    .filter((profile) => profile.enabled)
    .map(profileApiKeyId));
  const retained = apiKeys.filter((apiKey) =>
    !apiKey.id.startsWith("profile:") || activeIds.has(apiKey.id)
  );
  return {
    apiKeys: retained,
    changed: retained.length !== apiKeys.length
  };
}

export function profileApiKeyName(profile: ProfileApiKeySource): string {
  return `Profile: ${profile.name?.trim() || profile.id || profile.agent}`;
}

export function generateProfileApiKey(): string {
  return `ccr-profile-${randomBase64Url(24)}`;
}

function randomBase64Url(byteLength: number): string {
  return randomBytes(byteLength).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
