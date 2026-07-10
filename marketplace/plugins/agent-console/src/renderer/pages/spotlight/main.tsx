import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const settingsPreferencesStorageKey = "agent-console:settings-preferences";

type ThemePreference = "system" | "light" | "dark";

function getStoredThemePreference(): ThemePreference {
  try {
    const rawPreferences = window.localStorage.getItem(settingsPreferencesStorageKey);
    const preference = JSON.parse(rawPreferences || "{}")?.theme;
    return preference === "light" || preference === "dark" || preference === "system" ? preference : "system";
  } catch {
    return "system";
  }
}

function resolveThemePreference(preference: ThemePreference) {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applySpotlightTheme() {
  const themePreference = getStoredThemePreference();
  const resolvedTheme = resolveThemePreference(themePreference);
  const root = document.documentElement;

  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = themePreference;
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.style.colorScheme = resolvedTheme;
}

applySpotlightTheme();

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root element not found");
}

window.addEventListener("storage", (event) => {
  if (event.key === settingsPreferencesStorageKey) {
    applySpotlightTheme();
  }
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (getStoredThemePreference() === "system") {
    applySpotlightTheme();
  }
});

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
