import { nativeTheme } from "electron";
import type { AppConfig } from "@ccr/core/contracts/app";

export function applyNativeThemePreference(theme: AppConfig["theme"] | undefined): void {
  nativeTheme.themeSource = theme === "light" || theme === "dark" ? theme : "system";
}
