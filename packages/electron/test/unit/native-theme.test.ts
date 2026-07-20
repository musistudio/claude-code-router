import assert from "node:assert/strict";
import test from "node:test";
import { IPC_CHANNELS } from "@ccr/core/contracts/ipc-channels.ts";
import { nativeThemeSource } from "@ccr/electron/main/native-theme.ts";

test("native theme source maps explicit preferences and system fallback", () => {
  assert.equal(nativeThemeSource("light"), "light");
  assert.equal(nativeThemeSource("dark"), "dark");
  assert.equal(nativeThemeSource("system"), "system");
  assert.equal(nativeThemeSource(undefined), "system");
});

test("theme preference IPC uses separate save and renderer notification channels", () => {
  assert.equal(IPC_CHANNELS.appSetThemePreference, "ccr:app:set-theme-preference");
  assert.equal(IPC_CHANNELS.appThemePreferenceChanged, "ccr:app:theme-preference-changed");
});
