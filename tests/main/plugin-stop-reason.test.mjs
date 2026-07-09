import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "../../packages/core/src/config/default-config.ts";
import { gatewayService } from "../../packages/core/src/gateway/service.ts";
import { pluginService } from "../../packages/core/src/plugins/service.ts";

test("gateway restart reports disabled reason to removed plugin stop hooks", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-plugin-stop-reason-"));
  const previousReasonFile = process.env.CCR_TEST_PLUGIN_STOP_REASON_FILE;
  try {
    const reasonFile = path.join(dir, "stop-reasons.log");
    const pluginFile = path.join(dir, "stop-reason-plugin.cjs");
    process.env.CCR_TEST_PLUGIN_STOP_REASON_FILE = reasonFile;
    writeFileSync(pluginFile, [
      "\"use strict\";",
      "const fs = require(\"node:fs\");",
      "module.exports = {",
      "  setup() {",
      "    return {",
      "      stop(event) {",
      "        fs.appendFileSync(process.env.CCR_TEST_PLUGIN_STOP_REASON_FILE, `${event?.reason || \"missing\"}\\n`);",
      "      }",
      "    };",
      "  }",
      "};",
      ""
    ].join("\n"), "utf8");

    await pluginService.start(configWithPlugin(dir, pluginFile, true));
    await gatewayService.start(configWithPlugin(dir, pluginFile, false));

    assert.equal(readFileSync(reasonFile, "utf8"), "disabled\n");
  } finally {
    await gatewayService.stop();
    await pluginService.stop();
    if (previousReasonFile === undefined) {
      delete process.env.CCR_TEST_PLUGIN_STOP_REASON_FILE;
    } else {
      process.env.CCR_TEST_PLUGIN_STOP_REASON_FILE = previousReasonFile;
    }
    rmSync(dir, { force: true, recursive: true });
  }
});

function configWithPlugin(dir, pluginFile, enabled) {
  const config = createDefaultAppConfig({
    generatedConfigFile: path.join(dir, "gateway.config.json")
  });
  config.gateway.enabled = false;
  config.plugins = [{
    enabled,
    id: "stop-reason-plugin",
    module: pluginFile
  }];
  return config;
}
