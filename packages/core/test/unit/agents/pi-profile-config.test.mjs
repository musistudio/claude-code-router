import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writePiGatewayConfig } from "@ccr/core/agents/pi/profile-config.ts";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";

test("Pi profile config writes a CCR OpenAI Responses provider", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-pi-profile-"));
  try {
    const config = createDefaultAppConfig({ generatedConfigFile: path.join(root, "gateway.config.json") });
    config.gateway.host = "0.0.0.0";
    config.gateway.port = 3459;
    config.Providers = [
      {
        api_key: "sk-test",
        baseUrl: "https://api.example.test/v1",
        models: ["alpha", "beta"],
        name: "Example",
        type: "openai_responses"
      }
    ];
    const profile = {
      agent: "pi",
      enabled: true,
      id: "pi-main",
      model: "Example/alpha",
      name: "Pi Main",
      providerId: "ccr-pi",
      scope: "ccr",
      surface: "cli"
    };

    const result = writePiGatewayConfig(root, config, profile, "ccr-profile-token", "Example/alpha");
    const payload = JSON.parse(readFileSync(result.file, "utf8"));
    const provider = payload.providers["ccr-pi"];

    assert.equal(result.changed, true);
    assert.equal(result.model, "Example/alpha");
    assert.equal(result.providerId, "ccr-pi");
    assert.equal(result.file, path.join(root, "profiles", "pi-main", "pi", "models.json"));
    assert.equal(result.profileHome, path.join(root, "profiles", "pi-main", "pi"));
    assert.equal(result.sessionDir, path.join(root, "profiles", "pi-main", "pi", "sessions"));
    assert.equal(provider.baseUrl, "http://127.0.0.1:3459/v1");
    assert.equal(provider.api, "openai-responses");
    assert.equal(provider.apiKey, "ccr-profile-token");
    assert.equal(provider.authHeader, true);
    assert.deepEqual(provider.headers, {
      "x-ccr-client": "pi",
      "x-ccr-profile": "pi-main"
    });
    assert.ok(provider.models.some((model) => model.id === "Example/alpha"));
    assert.ok(provider.models.some((model) => model.id === "Example/beta"));

    const second = writePiGatewayConfig(root, config, profile, "ccr-profile-token", "Example/alpha");
    assert.equal(second.changed, false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
