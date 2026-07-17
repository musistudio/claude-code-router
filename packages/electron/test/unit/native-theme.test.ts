import assert from "node:assert/strict";
import test from "node:test";
import { nativeThemeSource } from "@ccr/electron/main/native-theme.ts";

test("native theme source maps explicit preferences and system fallback", () => {
  assert.equal(nativeThemeSource("light"), "light");
  assert.equal(nativeThemeSource("dark"), "dark");
  assert.equal(nativeThemeSource("system"), "system");
  assert.equal(nativeThemeSource(undefined), "system");
});
