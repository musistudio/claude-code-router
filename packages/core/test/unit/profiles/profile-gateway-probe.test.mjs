import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { ensureProfileGateway } from "@ccr/core/profiles/launch-service.ts";

function claudeProfileConfig() {
  const profile = {
    agent: "claude-code",
    enabled: true,
    env: {},
    id: "claude-main",
    model: "Provider/model",
    name: "Claude Main",
    scope: "ccr",
    surface: "cli"
  };
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  config.APIKEY = "profile-token";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "profile:claude-main",
      key: "profile-token",
      name: "Profile: Claude Main"
    }
  ];
  config.gateway.host = "127.0.0.1";
  config.gateway.port = 3466;
  config.profile.profiles = [profile];
  return { config, profile };
}

test("existing profile gateway uses health before the optional root probe", async () => {
  const previousFetch = globalThis.fetch;
  const paths = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    if (url.pathname === "/health") {
      return Response.json({
        core: "http://127.0.0.1:3467",
        status: "running",
        timestamp: "2026-01-01T00:00:00.000Z"
      });
    }
    if (url.pathname === "/v1/models") {
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer profile-token");
      return Response.json({ data: [], object: "list" });
    }
    if (url.pathname === "/") {
      throw new TypeError("root probe connection reset");
    }
    throw new Error(`Unexpected gateway probe: ${url.pathname}`);
  };

  try {
    const { config, profile } = claudeProfileConfig();
    const result = await ensureProfileGateway(config, profile, "Local subscription router", {
      reuseExisting: true,
      startIfMissing: false
    });

    assert.equal(result.APIKEY, "profile-token");
    assert.deepEqual(paths, ["/health", "/v1/models"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("existing profile gateway falls back to the root identity response", async () => {
  const previousFetch = globalThis.fetch;
  const paths = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    if (url.pathname === "/health") {
      return Response.json({ status: "unknown" }, { status: 404 });
    }
    if (url.pathname === "/") {
      return Response.json({ name: "claude-code-router" });
    }
    if (url.pathname === "/v1/models") {
      return Response.json({ data: [], object: "list" });
    }
    throw new Error(`Unexpected gateway probe: ${url.pathname}`);
  };

  try {
    const { config, profile } = claudeProfileConfig();
    const result = await ensureProfileGateway(config, profile, "Local subscription router", {
      reuseExisting: true,
      startIfMissing: false
    });

    assert.equal(result.APIKEY, "profile-token");
    assert.deepEqual(paths, ["/health", "/", "/v1/models"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("existing profile gateway retries a transient transport failure", async () => {
  const previousFetch = globalThis.fetch;
  const paths = [];
  let modelAttempts = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    if (url.pathname === "/health") {
      return Response.json({
        core: "http://127.0.0.1:3467",
        status: "running",
        timestamp: "2026-01-01T00:00:00.000Z"
      });
    }
    if (url.pathname === "/v1/models") {
      modelAttempts += 1;
      if (modelAttempts === 1) {
        throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
      }
      return Response.json({ data: [], object: "list" });
    }
    throw new Error(`Unexpected gateway probe: ${url.pathname}`);
  };

  try {
    const { config, profile } = claudeProfileConfig();
    const result = await ensureProfileGateway(config, profile, "Local subscription router", {
      reuseExisting: true,
      startIfMissing: false
    });

    assert.equal(result.APIKEY, "profile-token");
    assert.equal(modelAttempts, 2);
    assert.deepEqual(paths, ["/health", "/v1/models", "/v1/models"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("unavailable profile gateway reports the probe failure reason", async () => {
  const previousFetch = globalThis.fetch;
  const paths = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    if (url.pathname === "/health") {
      throw new TypeError("health probe timed out");
    }
    if (url.pathname === "/") {
      throw new TypeError("root probe connection reset");
    }
    throw new Error(`Unexpected gateway probe: ${url.pathname}`);
  };

  try {
    const { config, profile } = claudeProfileConfig();
    await assert.rejects(
      ensureProfileGateway(config, profile, "Local subscription router", {
        reuseExisting: true,
        startIfMissing: false
      }),
      (error) => {
        assert.equal(error?.name, "ProfileGatewayUnavailableError");
        assert.match(error.message, /health probe timed out/);
        return true;
      }
    );
    assert.deepEqual(paths, ["/health", "/health", "/health", "/", "/", "/"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
