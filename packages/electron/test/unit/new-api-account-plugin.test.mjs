import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const require = createRequire(path.resolve(process.cwd(), "package.json"));
const pluginPath = path.resolve(process.cwd(), "packages/electron/bundled-plugins/new-api-account/index.cjs");

test("New API account plugin refreshes browser token before reading subscription quota", async () => {
  const plugin = require(pluginPath);
  const registration = plugin.setup({
    logger: {
      info() {}
    }
  });
  const connector = registration.providerAccountConnectors.find((item) => item.id === "subscription-self");
  assert.equal(typeof connector?.resolve, "function");

  const calls = [];
  const result = await connector.resolve({
    config: {},
    connector: {
      connectorId: "subscription-self",
      pluginId: "new-api-account",
      type: "plugin"
    },
    fetchProviderAccountJson: async (request) => {
      calls.push(request);
      if (request.endpoint.endsWith("/api/user/auth/refresh")) {
        return {
          success: true,
          data: {
            access_token: "browser-token"
          }
        };
      }
      assert.equal(request.headers.authorization, "Bearer browser-token");
      return {
        success: true,
        data: {
          expired_at: "2026-09-01T00:00:00Z",
          plan_name: "Pro",
          quota: 700,
          total_quota: 1000,
          used_quota: 300
        }
      };
    },
    now: "2026-08-18T00:00:00.000Z",
    provider: {
      api_base_url: "https://new-api.example.com/api/v1",
      models: [],
      name: "New API"
    }
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].endpoint, "https://new-api.example.com/api/user/auth/refresh");
  assert.equal(calls[0].credentials, "include");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].requestOrigin, "https://new-api.example.com");
  assert.deepEqual(calls[0].body, {});
  assert.equal(calls[1].endpoint, "https://new-api.example.com/api/subscription/self");
  assert.equal(calls[1].credentials, "omit");
  assert.equal(calls[1].method, "GET");

  assert.equal(result.message, "Pro");
  assert.equal(result.status, "ok");
  assert.deepEqual(result.meters, [
    {
      id: "new_api_subscription_quota",
      kind: "quota",
      label: "Subscription quota",
      limit: 1000,
      remaining: 700,
      resetAt: "2026-09-01T00:00:00.000Z",
      unit: "quota",
      used: 300
    }
  ]);
});
