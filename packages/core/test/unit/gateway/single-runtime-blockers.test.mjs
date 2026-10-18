import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { singleGatewayRuntimeBlockersForTest } from "@ccr/core/gateway/application/gateway-service.ts";

test("Bailian enhanced search uses the CCR request pipeline only while an enabled provider needs it", () => {
  const config = createDefaultAppConfig();
  const provider = { name: "Bailian", models: ["test"], enhancedSearch: { enabled: true } };
  config.Providers = [provider];
  assert.ok(singleGatewayRuntimeBlockersForTest(config, pluginCapableOptions()).includes("bailian-enhanced-search"));

  provider.enhancedSearch.enabled = false;
  assert.equal(singleGatewayRuntimeBlockersForTest(config, pluginCapableOptions()).includes("bailian-enhanced-search"), false);
  provider.enhancedSearch.enabled = true;
  provider.enabled = false;
  assert.equal(singleGatewayRuntimeBlockersForTest(config, pluginCapableOptions()).includes("bailian-enhanced-search"), false);
});

test("single gateway runtime falls back when Media Tools need CCR HTTP routes", () => {
  const config = createDefaultAppConfig();
  config.mediaTools.enabled = true;

  assert.ok(singleGatewayRuntimeBlockersForTest(config).includes("media-tools"));
});

test("single gateway runtime falls back when browser automation MCP needs Electron routing", () => {
  const config = createDefaultAppConfig();
  config.toolHub.enabled = true;
  config.toolHub.browserAutomation = true;

  assert.ok(singleGatewayRuntimeBlockersForTest(config).includes("browser-automation-mcp"));
});

test("single gateway runtime falls back for any plugin gateway route", () => {
  const config = createDefaultAppConfig();

  const blockers = singleGatewayRuntimeBlockersForTest(config, {
    gatewayRuntimeSupportsRouterPlugin: () => true,
    hasGatewayRequestTransforms: () => false,
    hasGatewayRoutes: () => true
  });

  assert.ok(blockers.includes("plugin-gateway-routes"));
});

test("single gateway runtime falls back when global router fallback can retry", () => {
  const config = createDefaultAppConfig();
  config.Router.fallback = { mode: "retry", models: [], retryCount: 1 };

  const blockers = singleGatewayRuntimeBlockersForTest(config, pluginCapableOptions());

  assert.ok(blockers.includes("router-fallback"));
});

test("single gateway runtime falls back when global router fallback has a model chain", () => {
  const config = createDefaultAppConfig();
  config.Router.fallback = { mode: "model-chain", models: ["Provider/beta"], retryCount: 0 };

  const blockers = singleGatewayRuntimeBlockersForTest(config, pluginCapableOptions());

  assert.ok(blockers.includes("router-fallback"));
});

test("single gateway runtime falls back when a router rule has fallback", () => {
  const config = createDefaultAppConfig();
  config.Router.rules = [{
    condition: { left: "request.url", operator: "contains", right: "/v1/messages" },
    enabled: true,
    fallback: { mode: "retry", models: [], retryCount: 1 },
    id: "retry-messages",
    name: "Retry messages",
    type: "condition"
  }];

  const blockers = singleGatewayRuntimeBlockersForTest(config, pluginCapableOptions());

  assert.ok(blockers.includes("router-fallback"));
});

test("single gateway runtime falls back when a profile route has fallback", () => {
  const config = createDefaultAppConfig();
  config.profile.profiles = config.profile.profiles.map((profile) => profile.id === "default-claude-code"
    ? {
        ...profile,
        routing: {
          enabled: true,
          enhancedRoute: false,
          rules: [{
            condition: { left: "request.url", operator: "contains", right: "/v1/messages" },
            enabled: true,
            fallback: { mode: "model-chain", models: ["Provider/beta"], retryCount: 0 },
            id: "profile-fallback",
            name: "Profile fallback",
            type: "condition"
          }]
        }
      }
    : profile);

  const blockers = singleGatewayRuntimeBlockersForTest(config, pluginCapableOptions());

  assert.ok(blockers.includes("router-fallback"));
});

test("single gateway runtime allows no-op retry fallback", () => {
  const config = createDefaultAppConfig();
  config.Router.fallback = { mode: "retry", models: [], retryCount: 0 };

  const blockers = singleGatewayRuntimeBlockersForTest(config, pluginCapableOptions());

  assert.equal(blockers.includes("router-fallback"), false);
});

function pluginCapableOptions() {
  return {
    gatewayRuntimeSupportsRouterPlugin: () => true,
    hasGatewayRequestTransforms: () => false,
    hasGatewayRoutes: () => false
  };
}
