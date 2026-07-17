import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("home renderer HTML loads the web client bridge before the app bundle", () => {
  const projectRoot = process.cwd();
  const buildConfig = readFileSync(path.join(projectRoot, "build", "esbuild.config.mjs"), "utf8");
  const webBridge = readFileSync(path.join(projectRoot, "packages", "ui", "src", "web-client-bridge.ts"), "utf8");

  assert.match(buildConfig, /beforeModuleScriptTags:\s*\[\s*'    <script src="\.\.\/\.\.\/assets\/web-client-bridge\.js"><\/script>'\s*\]/);
  assert.match(webBridge, /if \(!window\.ccr\) \{/);
});
