import type { ProfileConfig } from "@ccr/core/contracts/app";

type ProfileApiKeyIdentity = Pick<ProfileConfig, "agent" | "id" | "name">;

export function profileApiKeyId(profile: ProfileApiKeyIdentity): string {
  const value = profile.id || profile.name || profile.agent;
  const profileId = value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
  return `profile:${profileId || "profile"}`;
}
