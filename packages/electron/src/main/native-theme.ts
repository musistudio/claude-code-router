import { nativeTheme } from "electron";
import type { AppConfig } from "@ccr/core/contracts/app";

export function nativeThemeSource(theme: AppConfig["theme"] | undefined): "dark" | "light" | "system" {
  return theme === "light" || theme === "dark" ? theme : "system";
}

export function applyNativeThemePreference(theme: AppConfig["theme"] | undefined): void {
  nativeTheme.themeSource = nativeThemeSource(theme);
}
