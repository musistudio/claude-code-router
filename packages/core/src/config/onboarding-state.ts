import { existsSync } from "node:fs";
import {
  loadPersistedAppSetting,
  replacePersistedAppSetting
} from "@ccr/core/config/config-repository";
import {
  ONBOARDING_FINISHED_AT_SETTING_KEY,
  ONBOARDING_FINISHED_FILE
} from "@ccr/core/config/constants";

export async function loadOnboardingFinished(): Promise<boolean> {
  try {
    const persisted = await loadPersistedAppSetting(ONBOARDING_FINISHED_AT_SETTING_KEY);
    return typeof persisted === "string" && Boolean(persisted.trim());
  } catch (error) {
    console.warn(`[config] Failed to load onboarding state: ${formatError(error)}`);
    return existsSync(ONBOARDING_FINISHED_FILE);
  }
}

export async function markOnboardingFinished(): Promise<void> {
  await replacePersistedAppSetting(ONBOARDING_FINISHED_AT_SETTING_KEY, new Date().toISOString());
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
