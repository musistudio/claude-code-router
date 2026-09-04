import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { compileCoreGatewayConfig, coreGatewayUsageAttributionConfig } from "@ccr/core/gateway/core-runtime/config-compiler.ts";
import { pluginService } from "@ccr/core/plugins/service.ts";
import { resolveUsageModelAttribution } from "@ccr/core/usage/model-attribution.ts";

test("plugin service skips failed plugins and rolls back their registrations", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-plugin-service-test-"));
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(" "));

  try {
    const brokenPlugin = path.join(dir, "broken-plugin.cjs");
    const goodPlugin = path.join(dir, "good-plugin.cjs");
    writeFileSync(brokenPlugin, `
module.exports = async function brokenPlugin(context) {
  context.registerApp({ id: "broken-context-app", name: "Broken context", url: "http://broken-context.local" });
  context.registerGatewayRoute({ id: "broken-context-route", path: "/broken-context", handler(_request, response) { response.end("broken"); } });
  context.registerGatewayRequestTransform({ id: "broken-transform", transform(input) { return { headers: { "x-broken-transform": input.requestId } }; } });
  context.registerCoreGatewayProviderPlugin({ key: "broken-context-provider" });
  context.registerCoreGatewayVirtualModelProfile({ id: "broken-context-vm" });
  context.registerProviderAccountConnector({ id: "broken-account", resolve() { return []; } });
  throw new Error("broken plugin setup failed");
};
`);
    writeFileSync(goodPlugin, `
module.exports = {
  setup(context) {
    context.registerCoreGatewayProviderPlugin({ key: "good-context-provider" });
    context.registerCoreGatewayVirtualModelProfile({ id: "good-context-vm" });
    return {
      apps: [{ id: "good-app", name: "Good app", url: "http://good.local" }],
      coreGateway: {
        config: {
          agent: { mcpServers: [{ name: "good-mcp", command: "good" }] },
          billing: {
            rates: {
              openai: { inputPerMillionUsd: 1, outputPerMillionUsd: 2 }
            }
          }
        },
        providerPlugins: [{ key: "good-provider" }],
        virtualModelProfiles: [{
          baseModel: { fixedModel: "Good Provider/good-model", mode: "fixed" },
          displayName: "Good usage model",
          enabled: true,
          execution: {},
          id: "good-vm",
          key: "good-vm",
          match: { exactAliases: ["plugin-usage"], prefixes: [], suffixes: [] },
          materialization: { enabled: true, includeInGatewayModels: true },
          tools: []
        }]
      },
      gatewayRoutes: [{ id: "good-route", path: "/good", handler(_request, response) { response.end("good"); } }],
      gatewayRequestTransforms: [{
        id: "good-transform",
        transform(input) {
          return {
            body: {
              ...input.body,
              model: "OpenRouter/z-ai/glm-5.2",
              provider: {
                order: ["deepinfra"],
                allow_fallbacks: false,
                require_parameters: true
              }
            },
            headers: {
              ...input.headers,
              "x-good-transform": String(input.tokenCount) + ":" + input.sessionId
            },
            responseHeaders: {
              "x-good-savings": "0.0001"
            },
            routedModel: "OpenRouter/z-ai/glm-5.2"
          };
        }
      }],
      providerAccountConnectors: [{ id: "good-account", resolve() { return []; } }],
      proxyRoutes: [{ host: "good.local", upstream: "http://127.0.0.1" }]
    };
  }
};
`);

    const config = createDefaultAppConfig();
    config.Providers = [{
      apiKey: "good-key",
      baseUrl: "https://good-provider.example/v1",
      models: ["good-model"],
      name: "Good Provider",
      type: "openai_chat_completions"
    }];
    config.plugins = [
      {
        apps: [{ id: "broken-config-app", name: "Broken config", url: "http://broken-config.local" }],
        coreGateway: {
          config: { agent: { mcpServers: [{ name: "broken-config-mcp", command: "broken" }] } },
          providerPlugins: [{ key: "broken-config-provider" }],
          virtualModelProfiles: [{ id: "broken-config-vm" }]
        },
        id: "broken",
        module: brokenPlugin,
        proxy: { routes: [{ host: "broken.local", upstream: "http://127.0.0.1" }] }
      },
      {
        id: "good",
        module: goodPlugin
      }
    ];

    await pluginService.start(config);

    assert.match(warnings.join("\n"), /plugin:broken.*Disabled after startup failure.*broken plugin setup failed/);
    assert.deepEqual(pluginService.getApps().map((app) => app.id), ["good-app"]);
    assert.equal(pluginService.matchGatewayRoute("GET", "/broken-context"), undefined);
    assert.equal(pluginService.matchGatewayRoute("GET", "/good")?.id, "good-route");
    const transformed = await pluginService.applyGatewayRequestTransforms({
      body: { model: "OpenRouter/z-ai/glm-5.2" },
      headers: { "content-type": "application/json" },
      method: "POST",
      path: "/v1/chat/completions",
      requestId: "req-1",
      routedModel: "OpenRouter/z-ai/glm-5.2",
      sessionId: "session-1",
      tokenCount: 123,
      url: "/v1/chat/completions"
    });
    assert.equal(transformed.body.model, "OpenRouter/z-ai/glm-5.2");
    assert.deepEqual(transformed.body.provider, {
      order: ["deepinfra"],
      allow_fallbacks: false,
      require_parameters: true
    });
    assert.equal(transformed.headers["x-good-transform"], "123:session-1");
    assert.equal(transformed.responseHeaders["x-good-savings"], "0.0001");
    assert.equal(transformed.routedModel, "OpenRouter/z-ai/glm-5.2");
    assert.deepEqual(transformed.applied.map((item) => item.id), ["good-transform"]);
    assert.equal(transformed.applied[0].pluginId, "good");
    assert.equal(transformed.applied[0].responseHeaders["x-good-savings"], "0.0001");
    assert.ok(transformed.applied[0].changes.some((change) => change.scope === "body"));
    assert.ok(transformed.applied[0].changes.some((change) => change.path === "/headers/x-good-transform"));
    assert.deepEqual(pluginService.getProxyRouteTargets(), [{ host: "good.local", paths: undefined }]);
    assert.deepEqual(pluginService.getCoreProviderPlugins().map((plugin) => plugin.key), ["good-context-provider", "good-provider"]);
    assert.deepEqual(pluginService.getVirtualModelProfiles().map((profile) => profile.id), ["good-context-vm", "good-vm"]);
    assert.deepEqual(pluginService.getCoreGatewayConfig(), {
      agent: { mcpServers: [{ name: "good-mcp", command: "good" }] },
      billing: {
        rates: {
          openai: { inputPerMillionUsd: 1, outputPerMillionUsd: 2 }
        }
      }
    });
    const compiled = await compileCoreGatewayConfig(
      config,
      "raw-trace-token",
      "billing-usage-token",
      "core-auth-token"
    );
    assert.deepEqual(compiled.billing, {
      enabled: true,
      rates: {
        openai: { inputPerMillionUsd: 1, outputPerMillionUsd: 2 }
      }
    });
    assert.deepEqual(
      resolveUsageModelAttribution(coreGatewayUsageAttributionConfig(config), "Fusion/plugin-usage"),
      {
        logicalModel: "Fusion/plugin-usage",
        model: "good-model",
        provider: "Good Provider"
      }
    );
    assert.equal(pluginService.getProviderAccountConnector("broken", "broken-account"), undefined);
    assert.equal(typeof pluginService.getProviderAccountConnector("good", "good-account")?.resolve, "function");
  } finally {
    console.warn = originalWarn;
    await pluginService.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("plugin service does not fail startup when every enabled plugin fails", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-plugin-service-all-failed-"));
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(" "));

  try {
    const brokenPlugin = path.join(dir, "broken-plugin.cjs");
    writeFileSync(brokenPlugin, `
module.exports = {
  setup(context) {
    context.registerApp({ id: "broken-app", name: "Broken app", url: "/broken" });
    context.registerGatewayRoute({ id: "broken-route", path: "/broken", handler(_request, response) { response.end("broken"); } });
    throw new Error("only plugin failed");
  }
};
`);

    const config = createDefaultAppConfig();
    config.gateway.enabled = false;
    config.plugins = [{
      id: "broken",
      module: brokenPlugin
    }];

    await pluginService.start(config);

    assert.match(warnings.join("\n"), /plugin:broken.*Disabled after startup failure.*only plugin failed/);
    assert.deepEqual(pluginService.getApps(), []);
    assert.equal(pluginService.matchGatewayRoute("GET", "/broken"), undefined);
    assert.deepEqual(pluginService.getCoreProviderPlugins(), []);
    assert.deepEqual(pluginService.getVirtualModelProfiles(), []);
  } finally {
    console.warn = originalWarn;
    await pluginService.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("built-in OpenRouter discount routing only runs for enabled provider models", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      data: {
        endpoints: [
          {
            provider_name: "Expensive",
            provider_slug: "expensive",
            status: 0,
            supports_implicit_caching: true,
            uptime_last_30m: 100,
            pricing: {
              cache_read: "0.000001",
              completion: "0.00002",
              prompt: "0.00001"
            }
          },
          {
            provider_name: "Mid",
            provider_slug: "mid",
            status: 0,
            supports_implicit_caching: true,
            uptime_last_30m: 100,
            pricing: {
              cache_read: "0.000001",
              completion: "0.00001",
              prompt: "0.000005"
            }
          },
          {
            provider_name: "Cheap",
            status: 0,
            supports_implicit_caching: true,
            uptime_last_30m: 100,
            pricing: {
              cache_read: "0.000001",
              completion: "0.0000048",
              prompt: "0.0000024"
            }
          }
        ]
      }
    }), {
      headers: { "content-type": "application/json" },
      status: 200
    });

    const config = createDefaultAppConfig();
    config.gateway.enabled = false;
    config.Providers = [{
      apiKey: "sk-or-v1-test",
      baseUrl: "https://openrouter.ai/api/v1",
      modelMetadata: {
        "z-ai/glm-disabled": {
          openRouterDiscountRouting: { enabled: false }
        },
        "z-ai/glm-enabled": {
          openRouterDiscountRouting: {
            cacheHitRate: 0.75,
            enabled: true,
            minSavingsRatio: 0,
            minSavingsUsd: 0,
            providerBlacklist: ["Cheap"]
          }
        }
      },
      models: ["z-ai/glm-disabled", "z-ai/glm-enabled"],
      name: "OpenRouter",
      type: "openai_chat_completions"
    }];

    await pluginService.start(config);
    const skipped = await pluginService.applyGatewayRequestTransforms({
      body: { model: "OpenRouter/z-ai/glm-disabled" },
      headers: { "content-type": "application/json" },
      method: "POST",
      path: "/v1/chat/completions",
      requestId: "disabled-req",
      routedModel: "OpenRouter/z-ai/glm-disabled",
      sessionId: "session-disabled",
      tokenCount: 1000,
      url: "/v1/chat/completions"
    });
    assert.deepEqual(skipped.applied, []);

    const transformed = await pluginService.applyGatewayRequestTransforms({
      body: {
        model: "OpenRouter/z-ai/glm-enabled",
        max_tokens: 500,
        provider: { order: ["expensive"] }
      },
      headers: { "content-type": "application/json" },
      method: "POST",
      path: "/v1/chat/completions",
      requestId: "enabled-req",
      routedModel: "OpenRouter/z-ai/glm-enabled",
      sessionId: "session-enabled",
      tokenCount: 1000,
      url: "/v1/chat/completions"
    });

    assert.deepEqual(transformed.body.provider, {
      allow_fallbacks: true,
      ignore: ["cheap"],
      order: ["mid"],
      require_parameters: true
    });
    assert.deepEqual(transformed.applied.map((item) => item.id), ["openrouter-discount-provider-router"]);
    assert.equal(transformed.applied[0].pluginId, "openrouter");
    assert.equal(transformed.responseHeaders["x-ccr-openrouter-discount-ignored-providers"], "cheap");
    assert.equal(transformed.responseHeaders["x-ccr-openrouter-discount-selected-provider"], "mid");
    assert.equal(transformed.responseHeaders["x-ccr-openrouter-discount-cheapest-off-pct"], "50.00");
    assert.equal(transformed.responseHeaders["x-ccr-openrouter-discount-savings-usd"], "0.00325");
  } finally {
    globalThis.fetch = originalFetch;
    await pluginService.stop();
  }
});

test("plugin gateway route failures are contained to the plugin response", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-plugin-route-failure-"));
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(" "));

  try {
    const routePlugin = path.join(dir, "route-plugin.cjs");
    writeFileSync(routePlugin, `
module.exports = {
  setup() {
    return {
      gatewayRoutes: [{
        auth: "none",
        id: "failing-route",
        path: "/fails",
        handler() {
          throw new Error("route exploded");
        }
      }]
    };
  }
};
`);

    const config = createDefaultAppConfig();
    config.gateway.enabled = false;
    config.plugins = [{
      id: "route-plugin",
      module: routePlugin
    }];

    await pluginService.start(config);
    const route = pluginService.matchGatewayRoute("GET", "/fails");
    assert.ok(route);

    const response = createMockResponse();
    await pluginService.handleGatewayRoute(route, {}, response);

    assert.match(warnings.join("\n"), /plugin:route-plugin.*Gateway route failing-route failed.*route exploded/);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.headers, { "content-type": "application/json" });
    assert.deepEqual(JSON.parse(response.body), { error: { message: "route exploded" } });
  } finally {
    console.warn = originalWarn;
    await pluginService.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

function createMockResponse() {
  return {
    body: "",
    destroyedWith: undefined,
    ended: false,
    headers: undefined,
    headersSent: false,
    statusCode: 0,
    destroy(error) {
      this.destroyedWith = error;
      return this;
    },
    end(chunk) {
      this.body += chunk ? String(chunk) : "";
      this.ended = true;
      return this;
    },
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
      this.headersSent = true;
      return this;
    }
  };
}
