import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import {
  ccrCodexApplyPatchBridgeHeader,
  ccrCodexBridgeRequestTransformKey,
  ccrCodexBridgeResponseHookKey,
  ccrCodexBridgeStreamHookKey,
  ccrCodexMultiAgentBridgeHeader,
  ccrLiveTokenRateConfigMessageType,
  ccrLiveTokenRateSnapshotMessageType,
  ccrLiveTokenRateStreamHookKey,
  ccrOpenRouterDiscountFinalizeResponseHookKey,
  ccrRuntimeConfigReloadMessageType,
  ccrRouteReasonHeader,
  ccrRouteSourceHeader,
  ccrRoutedModelHeader,
  ccrRouterHttpRoutePath,
  ccrRouterRouteResolverKey,
  ccrRouterRequestTransformKey
} from "@ccr/core/gateway/core-runtime/router-plugin-contract.ts";
import { coreGatewayAuthHeader } from "@ccr/core/gateway/internal/shared.ts";
import { ccrRemoteControlPathPrefix } from "@ccr/core/gateway/remote-control-service.ts";
import { gatewayRuntimeConfigControlPath, gatewayRuntimeConfigRevision } from "@ccr/core/gateway/runtime-config-control.ts";
import { createGatewayPlugin } from "@ccr/core/gateway/core-runtime/router-plugin.ts";
import { providerRuntimeId } from "@ccr/core/routing/model-registry.ts";

test("CCR router core plugin exposes route endpoint and beforeRouting transform", async () => {
  const config = createDefaultAppConfig();
  config.Providers = [
    { models: ["alpha"], name: "Primary", type: "openai_chat_completions" },
    { models: ["beta"], name: "Secondary", type: "openai_chat_completions" }
  ];
  config.Router.rules = [{
    condition: { left: "request.url", operator: "contains", right: "/v1/chat/completions" },
    enabled: true,
    id: "route-to-secondary",
    name: "Route to secondary",
    rewrites: [{ key: "request.body.model", operation: "set", value: "Secondary/beta" }],
    type: "condition"
  }];

  const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config } } });
  assert.equal(plugin.httpRoutes[0].path, ccrRouterHttpRoutePath);

  const transformed = await plugin.requestTransforms[0].transform({
    request: {
      headers: {},
      method: "POST",
      url: "/v1/chat/completions"
    },
    requestBody: {
      messages: [{ role: "user", content: "hello" }],
      model: "Primary/alpha"
    },
    route: {
      method: "POST",
      url: "/v1/chat/completions"
    }
  });

  assert.ok(transformed);
  assert.equal(transformed.requestBody.model, "Secondary/beta");
  assert.equal(transformed.model, "Secondary/beta");
  assert.equal(transformed.headers[ccrRoutedModelHeader], "Secondary/beta");
  assert.equal(transformed.headers[ccrRouteReasonHeader], "rule:route-to-secondary");
  assert.equal(transformed.headers[ccrRouteSourceHeader], "rule");

  const resolver = plugin.routeResolvers.find((item) => item.key === ccrRouterRouteResolverKey);
  const resolved = resolver.resolve({
    model: transformed.model,
    request: {
      headers: transformed.headers,
      method: "POST",
      url: "/v1/chat/completions"
    },
    requestBody: transformed.requestBody,
    route: {
      method: "POST",
      url: "/v1/chat/completions"
    }
  });

  assert.equal(resolved.targetProviderName, providerRuntimeId(config.Providers[1]));
  assert.equal(resolved.model, "beta");
  assert.equal(resolved.requestBody.model, "beta");
});

test("CCR router core plugin publishes live token rate snapshots from the single runtime", async () => {
  const originalSend = process.send;
  const messages = [];
  process.send = (message) => {
    messages.push(message);
    return true;
  };
  try {
    const config = createDefaultAppConfig();
    const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config } } });
    const streamHook = plugin.streamHooks.find((item) => item.key === ccrLiveTokenRateStreamHookKey);
    assert.ok(streamHook);
    const disabledResult = await streamHook.transformResponse({
      request: { id: "single-runtime-rate-disabled" },
      targetProvider: "openai",
      targetProviderConfig: { type: "openai_chat_completions" },
      upstreamResponse: new Response("disabled", {
        headers: { "content-type": "text/event-stream" },
        status: 200
      })
    });
    assert.equal(disabledResult, undefined);
    process.emit("message", {
      enabled: true,
      protocolVersion: 1,
      type: ccrLiveTokenRateConfigMessageType
    });
    const encoder = new TextEncoder();
    const upstreamResponse = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"first token"}}]}\n\n'));
        setTimeout(() => {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" second token"}}]}\n\n'));
        }, 275);
        setTimeout(() => controller.close(), 325);
      }
    }), {
      headers: { "content-type": "text/event-stream" },
      status: 200
    });
    const meteredResponse = await streamHook.transformResponse({
      request: {
        headers: {},
        id: "single-runtime-rate-test",
        method: "POST",
        url: "/v1/chat/completions"
      },
      targetProvider: "openai",
      targetProviderConfig: {
        provider: "openai_chat_completions",
        type: "openai_chat_completions"
      },
      upstreamResponse
    });

    assert.ok(meteredResponse instanceof Response);
    await meteredResponse.text();
    assert.ok(messages.some((message) =>
      message?.type === ccrLiveTokenRateSnapshotMessageType &&
      message.activeRequests === 1 &&
      message.tokensPerSecond > 0
    ));
  } finally {
    process.emit("message", {
      enabled: false,
      protocolVersion: 1,
      type: ccrLiveTokenRateConfigMessageType
    });
    if (originalSend) {
      process.send = originalSend;
    } else {
      delete process.send;
    }
  }
});

test("CCR router core plugin resolves bare Codex companion models through the authenticated profile provider", async () => {
  const config = createDefaultAppConfig();
  config.APIKEY = "bs-key";
  config.APIKEYS = [{ createdAt: new Date(0).toISOString(), id: "profile:bs-2", key: "bs-key" }];
  config.Providers = [
    {
      id: "zhipu",
      models: ["glm-5.3"],
      name: "Zhipu AI (China) - Coding Plan",
      type: "openai_chat_completions"
    },
    {
      id: "codex-api",
      models: ["gpt-5.6-luna"],
      name: "Codex API",
      type: "openai_responses"
    },
    {
      id: "uuroute",
      models: ["gpt-5.5", "gpt-5.6-sol", "gpt-5.6-luna"],
      name: "uuroute",
      type: "openai_chat_completions"
    },
    {
      id: "baishan",
      models: ["gpt-5.5", "gpt-5.6-luna"],
      name: "白山",
      type: "openai_chat_completions"
    }
  ];
  config.profile.profiles = [{
    agent: "codex",
    enabled: true,
    id: "bs-2",
    model: "uuroute/gpt-5.6-sol",
    name: "BS",
    providerId: "claude-code-router",
    routing: {
      enabled: false,
      enhancedRoute: false,
      rules: []
    },
    scope: "ccr"
  }];

  const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config } } });
  const headers = {
    authorization: "Bearer bs-key",
    "user-agent": "Codex Desktop/0.153.4"
  };
  await plugin.requestHooks[0].beforeAuth({
    request: {
      headers,
      method: "POST",
      url: "/v1/responses"
    }
  });
  const transformed = await plugin.requestTransforms[0].transform({
    request: {
      headers,
      method: "POST",
      url: "/v1/responses"
    },
    requestBody: {
      input: "generate a title",
      model: "gpt-5.6-luna",
      stream: true
    },
    route: {
      method: "POST",
      url: "/v1/responses"
    }
  });

  assert.ok(transformed);
  assert.equal(transformed.headers[ccrRouteReasonHeader], "default");
  assert.equal(transformed.headers[ccrRoutedModelHeader], "gpt-5.6-luna");
  assert.equal(transformed.model, "gpt-5.6-luna");
  assert.equal(transformed.requestBody.model, "gpt-5.6-luna");

  const resolver = plugin.routeResolvers.find((item) => item.key === ccrRouterRouteResolverKey);
  const resolved = resolver.resolve({
    model: transformed.model,
    request: {
      headers: {
        ...headers,
        ...transformed.headers
      },
      method: "POST",
      url: "/v1/responses"
    },
    requestBody: transformed.requestBody,
    route: {
      method: "POST",
      url: "/v1/responses"
    }
  });

  assert.equal(resolved.targetProviderName, providerRuntimeId(config.Providers[2]));
  assert.equal(resolved.model, "gpt-5.6-luna");
  assert.equal(resolved.requestBody.model, "gpt-5.6-luna");
});

test("CCR router core plugin applies Codex bridge request and response hooks", async () => {
  const config = createDefaultAppConfig();
  config.Providers = [{
    models: ["claude-sonnet"],
    name: "Primary",
    type: "openai_responses"
  }];

  const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config } } });
  const transform = plugin.requestTransforms.find((item) => item.key === ccrCodexBridgeRequestTransformKey);
  const patch = "*** Begin Patch\n*** Add File: foo.txt\n+hi\n*** End Patch\n";
  const transformed = await transform.transform({
    model: "Primary/claude-sonnet",
    request: {
      headers: { "user-agent": "codex-test" },
      id: "codex-bridge-1",
      method: "POST",
      url: "/v1/responses"
    },
    requestBody: {
      input: [
        { type: "custom_tool_call", call_id: "call_patch", name: "apply_patch", input: patch },
        {
          arguments: JSON.stringify({ message: "inspect tests" }),
          call_id: "call_agent",
          name: "spawn_agent",
          namespace: "multi_agent_v1",
          type: "function_call"
        }
      ],
      model: "Primary/claude-sonnet",
      tools: [
        { type: "custom", name: "apply_patch", format: { type: "grammar", syntax: "lark", definition: "start: begin_patch" } },
        multiAgentNamespaceTool()
      ]
    },
    route: {
      method: "POST",
      url: "/v1/responses"
    }
  });

  assert.ok(transformed);
  assert.equal(transformed.headers[ccrCodexApplyPatchBridgeHeader]?.startsWith("Primary/claude-sonnet:"), true);
  assert.equal(transformed.headers[ccrCodexMultiAgentBridgeHeader]?.startsWith("Primary/claude-sonnet:"), true);
  assert.equal(transformed.requestBody.tools[0].name, "virtual_apply_patch");
  assert.equal(transformed.requestBody.tools[1].name, "multi_agent_v1_spawn_agent");
  assert.equal(transformed.requestBody.input[0].name, "virtual_apply_patch");
  assert.equal(transformed.requestBody.input[1].name, "multi_agent_v1_spawn_agent");

  const responseHook = plugin.responseHooks.find((item) => item.key === ccrCodexBridgeResponseHookKey);
  const response = await responseHook.transformResponse({
    request: {
      headers: transformed.headers,
      id: "codex-bridge-1",
      method: "POST",
      url: "/v1/responses"
    },
    responseHeaders: {},
    responsePayload: {
      output: [{
        arguments: JSON.stringify({ patch }),
        call_id: "call_patch",
        name: "virtual_apply_patch",
        type: "function_call"
      }, {
        arguments: JSON.stringify({ targets: ["agent-1"] }),
        call_id: "call_wait",
        name: "multi_agent_v1_wait_agent",
        type: "function_call"
      }]
    },
    statusCode: 200
  });

  assert.equal(response.responsePayload.output[0].type, "custom_tool_call");
  assert.equal(response.responsePayload.output[0].name, "apply_patch");
  assert.equal(response.responsePayload.output[0].input, patch);
  assert.equal(response.responsePayload.output[1].name, "wait_agent");
  assert.equal(response.responsePayload.output[1].namespace, "multi_agent_v1");

  const streamHook = plugin.streamHooks.find((item) => item.key === ccrCodexBridgeStreamHookKey);
  const streamed = await streamHook.transformResponse({
    request: {
      headers: transformed.headers,
      id: "codex-bridge-1",
      method: "POST",
      url: "/v1/responses"
    },
    upstreamRequest: {
      body: {},
      headers: {},
      method: "POST",
      url: "https://provider.test/v1/responses"
    },
    upstreamResponse: new Response([
      "event: response.output_item.done",
      `data: ${JSON.stringify({
        type: "response.output_item.done",
        item: {
          arguments: JSON.stringify({ patch }),
          call_id: "call_patch",
          name: "virtual_apply_patch",
          type: "function_call"
        }
      })}`,
      ""
    ].join("\n"), {
      headers: {
        "content-length": "999",
        "content-type": "text/event-stream"
      },
      status: 200
    })
  });
  const streamText = await streamed.text();

  assert.equal(streamed.headers.get("content-length"), null);
  assert.match(streamText, /"type":"custom_tool_call"/);
  assert.match(streamText, /"name":"apply_patch"/);
});

test("CCR router core plugin skips Codex bridge for native Responses passthrough", async () => {
  const config = createDefaultAppConfig();
  config.Providers = [{
    models: ["gpt-5.5"],
    name: "uuroute",
    type: "openai_responses"
  }];

  const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config } } });
  const transform = plugin.requestTransforms.find((item) => item.key === ccrCodexBridgeRequestTransformKey);
  const transformed = await transform.transform({
    model: "gpt-5.5",
    request: {
      headers: { "user-agent": "Codex Desktop/0.153.4" },
      id: "native-responses-passthrough-1",
      method: "POST",
      url: "/v1/responses"
    },
    requestBody: {
      input: "inspect the repo",
      model: "gpt-5.5",
      tools: [
        { type: "custom", name: "apply_patch", format: { type: "grammar", syntax: "lark", definition: "start: begin_patch" } },
        multiAgentNamespaceTool()
      ],
      tool_choice: "auto"
    },
    route: {
      method: "POST",
      url: "/v1/responses"
    },
    source: {
      adapterKey: "openai_responses",
      metadata: {}
    },
    sourceAdapterKey: "openai_responses",
    sourceProvider: "openai",
    targetProvider: "openai",
    targetProviderConfig: {
      name: "uuroute",
      type: "openai_responses"
    }
  });

  assert.equal(transformed, undefined);
});

test("CCR router core plugin applies OpenRouter discount provider routing", async (t) => {
  const config = createDefaultAppConfig();
  config.Providers = [{
    api_base_url: "https://openrouter.ai/api/v1",
    modelMetadata: {
      "author/router-plugin-discount-model": {
        openRouterDiscountRouting: {
          allowFallbacks: false,
          cacheHitRate: 0,
          enabled: true,
          minSavingsRatio: 0,
          minSavingsUsd: 0,
          minUptime5m: 0
        }
      }
    },
    models: ["author/router-plugin-discount-model"],
    name: "OpenRouter",
    type: "openai_chat_completions"
  }];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: {
      endpoints: [{
        name: "Expensive Provider",
        pricing: { completion: 0.000004, prompt: 0.000002 },
        provider_name: "Expensive Provider",
        status: 0,
        tag: "expensive"
      }, {
        name: "Cheap Provider",
        pricing: { completion: 0.000001, prompt: 0.0000005 },
        provider_name: "Cheap Provider",
        status: 0,
        tag: "cheap"
      }]
    }
  }), { headers: { "content-type": "application/json" }, status: 200 });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config } } });
  const transformed = await plugin.requestTransforms[0].transform({
    request: {
      headers: { "x-claude-code-session-id": "router-plugin-discount-session" },
      id: "router-plugin-discount-1",
      method: "POST",
      url: "/v1/chat/completions"
    },
    requestBody: {
      max_tokens: 512,
      messages: [{ role: "user", content: "hello" }],
      model: "OpenRouter/author/router-plugin-discount-model",
      provider: { order: ["expensive"] }
    },
    route: {
      method: "POST",
      url: "/v1/chat/completions"
    }
  });

  assert.equal(transformed.requestBody.provider.order[0], "cheap");
  assert.equal(transformed.responseHeaders["x-ccr-openrouter-discount-reason"], "switched-cheaper-after-cache-loss");
  assert.equal(transformed.responseHeaders["x-ccr-openrouter-discount-selected-provider"], "cheap");
  assert.equal(transformed.responseHeaders["x-ccr-openrouter-discount-model"], "author/router-plugin-discount-model");

  const beforeConfirm = await plugin.requestTransforms[0].transform({
    request: {
      headers: { "x-claude-code-session-id": "router-plugin-discount-session" },
      id: "router-plugin-discount-before-confirm",
      method: "POST",
      url: "/v1/chat/completions"
    },
    requestBody: {
      max_tokens: 512,
      messages: [{ role: "user", content: "hello" }],
      model: "OpenRouter/author/router-plugin-discount-model"
    },
    route: {
      method: "POST",
      url: "/v1/chat/completions"
    }
  });
  assert.equal(beforeConfirm.responseHeaders["x-ccr-openrouter-discount-reason"], "initial-cheapest");

  const finalizer = plugin.responseHooks.find((item) => item.key === ccrOpenRouterDiscountFinalizeResponseHookKey);
  await finalizer.transformResponse({
    request: {
      headers: {
        ...transformed.headers,
        "x-claude-code-session-id": "router-plugin-discount-session"
      },
      id: "router-plugin-discount-1",
      method: "POST",
      url: "/v1/chat/completions"
    },
    responseHeaders: {},
    responsePayload: {},
    statusCode: 200,
    upstreamResponse: new Response("{}", { status: 200 })
  });

  const afterConfirm = await plugin.requestTransforms[0].transform({
    request: {
      headers: { "x-claude-code-session-id": "router-plugin-discount-session" },
      id: "router-plugin-discount-2",
      method: "POST",
      url: "/v1/chat/completions"
    },
    requestBody: {
      max_tokens: 512,
      messages: [{ role: "user", content: "hello" }],
      model: "OpenRouter/author/router-plugin-discount-model"
    },
    route: {
      method: "POST",
      url: "/v1/chat/completions"
    }
  });
  assert.equal(afterConfirm.responseHeaders["x-ccr-openrouter-discount-reason"], "already-cheapest");

  await finalizer.transformResponse({
    request: {
      headers: beforeConfirm.headers,
      id: "router-plugin-discount-before-confirm",
      method: "POST",
      url: "/v1/chat/completions"
    },
    responseHeaders: {},
    responsePayload: {},
    statusCode: 500
  });
  await finalizer.transformResponse({
    request: {
      headers: afterConfirm.headers,
      id: "router-plugin-discount-2",
      method: "POST",
      url: "/v1/chat/completions"
    },
    responseHeaders: {},
    responsePayload: {},
    statusCode: 500
  });
});

test("CCR router core plugin maps public API keys before gateway auth", async () => {
  const config = createDefaultAppConfig();
  config.APIKEY = "client-key";
  config.APIKEYS = [{ createdAt: new Date(0).toISOString(), id: "profile:limited", key: "client-key" }];

  const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config, coreAuthToken: "core-token", publicGatewayMode: true } } });
  const headers = { authorization: "Bearer client-key" };
  const result = await plugin.requestHooks[0].beforeAuth({ request: { headers, method: "GET", url: "/v1/models" } });

  assert.equal(result, undefined);
  assert.equal(headers["x-auth-api-key-id"], "profile:limited");
  assert.equal(headers["x-auth-sub"], "profile:limited");
});

test("CCR router core plugin maps SDK-compatible public API key headers before gateway auth", async () => {
  const config = createDefaultAppConfig();
  config.APIKEY = "client-key";
  config.APIKEYS = [{ createdAt: new Date(0).toISOString(), id: "profile:limited", key: "client-key" }];

  const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config, coreAuthToken: "core-token", publicGatewayMode: true } } });
  for (const headerName of ["api-key", "x-goog-api-key", "x-mcp-key", "x-codex-access-token"]) {
    const headers = { [headerName]: "client-key" };
    const result = await plugin.requestHooks[0].beforeAuth({ request: { headers, method: "GET", url: "/v1/models" } });

    assert.equal(result, undefined);
    assert.equal(headers["x-auth-api-key-id"], "profile:limited", headerName);
    assert.equal(headers["x-auth-sub"], "profile:limited", headerName);
  }
});

test("CCR router core plugin rejects expired public API keys before gateway static auth", async () => {
  const config = createDefaultAppConfig();
  config.APIKEY = "expired-key";
  config.APIKEYS = [{
    createdAt: new Date(0).toISOString(),
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
    id: "expired",
    key: "expired-key"
  }];

  const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config, coreAuthToken: "core-token", publicGatewayMode: true } } });
  const headers = { authorization: "Bearer expired-key" };
  const result = await plugin.requestHooks[0].beforeAuth({ request: { headers, method: "GET", url: "/v1/models" } });

  assert.deepEqual(result, {
    ok: false,
    status: 401,
    error: "Invalid or expired API key."
  });
  assert.equal(headers["x-auth-api-key-id"], undefined);
  assert.equal(headers["x-auth-sub"], undefined);
});

test("CCR router core plugin protects internal route decisions with the core token", async () => {
  const config = createDefaultAppConfig();
  config.APIKEY = "client-key";
  config.APIKEYS = [{ createdAt: new Date(0).toISOString(), id: "client", key: "client-key" }];
  config.Providers = [{ models: ["alpha"], name: "Primary", type: "openai_chat_completions" }];

  const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config, coreAuthToken: "core-token", publicGatewayMode: true } } });
  const route = plugin.httpRoutes.find((item) => item.path === ccrRouterHttpRoutePath);

  const clientReply = createReply();
  const denied = await route.handler({
    request: {
      body: { body: { model: "Primary/alpha" }, method: "POST", path: "/v1/messages", url: "/v1/messages" },
      headers: { authorization: "Bearer client-key" },
      method: "POST",
      url: ccrRouterHttpRoutePath
    },
    reply: clientReply
  });

  assert.equal(clientReply.statusCode, 401);
  assert.match(denied.error.message, /Unauthorized CCR router route/);

  const allowed = await route.handler({
    request: {
      body: { body: { model: "Primary/alpha" }, method: "POST", path: "/v1/messages", url: "/v1/messages" },
      headers: { [coreGatewayAuthHeader]: "core-token" },
      method: "POST",
      url: ccrRouterHttpRoutePath
    },
    reply: createReply()
  });

  assert.equal(allowed.body.model, "Primary/alpha");
  assert.equal(allowed.decision.source, "default");
});

test("CCR router core plugin exposes runtime config control through the managed parent process", async (t) => {
  const config = createDefaultAppConfig();
  config.APIKEY = "primary-key";
  config.APIKEYS = [{ createdAt: new Date(0).toISOString(), id: "primary", key: "primary-key" }];
  const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config, coreAuthToken: "core-token", publicGatewayMode: true } } });
  const route = plugin.httpRoutes.find((item) => item.path === gatewayRuntimeConfigControlPath);
  const originalSend = process.send;
  let sent;
  process.send = (message, callback) => {
    sent = message;
    callback?.(null);
    return true;
  };
  t.after(() => {
    if (originalSend) process.send = originalSend;
    else delete process.send;
  });

  const status = await route.handler({
    request: {
      headers: { authorization: "Bearer primary-key" },
      method: "GET",
      url: gatewayRuntimeConfigControlPath
    },
    reply: createReply()
  });
  assert.equal(status.revision, gatewayRuntimeConfigRevision(config));
  assert.equal(status.state, "running");

  const revision = "a".repeat(64);
  const reloadReply = createReply();
  const reload = await route.handler({
    request: {
      body: { configRevision: revision, forceRestart: true },
      headers: { authorization: "Bearer primary-key" },
      method: "POST",
      url: gatewayRuntimeConfigControlPath
    },
    reply: reloadReply
  });

  assert.equal(reloadReply.statusCode, 202);
  assert.deepEqual(reload, { accepted: true, configRevision: revision, restarting: true });
  assert.deepEqual(sent, {
    configRevision: revision,
    forceRestart: true,
    protocolVersion: 1,
    type: ccrRuntimeConfigReloadMessageType
  });
});

test("CCR router core plugin allows internal core auth tokens before public gateway auth", async () => {
  const config = createDefaultAppConfig();
  config.APIKEY = "client-key";
  config.APIKEYS = [{ createdAt: new Date(0).toISOString(), id: "client", key: "client-key" }];

  const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config, coreAuthToken: "core-token", publicGatewayMode: true } } });
  const headers = { authorization: "Bearer core-token" };
  const result = await plugin.requestHooks[0].beforeAuth({ request: { headers, method: "GET", url: "/v1/models" } });

  assert.equal(result, undefined);
  assert.equal(headers["x-auth-api-key-id"], undefined);
  assert.equal(headers["x-auth-sub"], undefined);
});

test("CCR router core plugin serves remote control capabilities with query auth", async () => {
  const config = createDefaultAppConfig();
  config.APIKEY = "client-key";
  config.APIKEYS = [{ createdAt: new Date(0).toISOString(), id: "client", key: "client-key" }];

  const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config, coreAuthToken: "core-token", publicGatewayMode: true } } });
  const route = plugin.httpRoutes.find((item) => item.path === ccrRemoteControlPathPrefix);
  const response = createRawResponse();
  const reply = createReply({ raw: response });
  const payload = await route.handler({
    request: {
      headers: {},
      method: "GET",
      raw: { headers: {}, method: "GET", url: `${ccrRemoteControlPathPrefix}?api_key=client-key` },
      url: `${ccrRemoteControlPathPrefix}?api_key=client-key`
    },
    reply
  });

  assert.equal(payload, reply);
  assert.equal(reply.hijacked, true);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(JSON.parse(response.body).name, "ccr-remote-control");
});

test("CCR router core plugin serves public model discovery before built-in gateway routes", async () => {
  const config = createDefaultAppConfig();
  config.Providers = [{
    models: ["alpha", "beta"],
    name: "Primary",
    type: "openai_chat_completions"
  }];
  config.APIKEY = "client-key";
  config.APIKEYS = [{ createdAt: new Date(0).toISOString(), id: "profile:limited", key: "client-key" }];
  config.profile.profiles = [{
    ...config.profile.profiles[0],
    availableModels: ["Primary/alpha"],
    enabled: true,
    id: "limited",
    model: "Primary/alpha",
    name: "Limited"
  }];

  const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config } } });
  const route = plugin.httpRoutes.find((item) => item.path === "/v1/models");
  assert.equal(route.priority, "pre");

  const payload = await route.handler({
    request: { headers: { authorization: "Bearer client-key" }, method: "GET", url: "/v1/models" },
    reply: createReply()
  });

  assert.deepEqual(payload.data.map((model) => model.id), ["Primary/alpha"]);
});

test("CCR router core plugin rejects profile-disallowed routed models", async () => {
  const config = createDefaultAppConfig();
  config.Providers = [{
    models: ["alpha", "beta"],
    name: "Primary",
    type: "openai_chat_completions"
  }];
  config.APIKEY = "client-key";
  config.APIKEYS = [{ createdAt: new Date(0).toISOString(), id: "profile:limited", key: "client-key" }];
  config.profile.profiles = [{
    ...config.profile.profiles[0],
    availableModels: ["Primary/alpha"],
    enabled: true,
    id: "limited",
    model: "Primary/alpha",
    name: "Limited"
  }];

  const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config } } });
  const transform = plugin.requestTransforms.find((item) => item.key === ccrRouterRequestTransformKey);
  const transformed = await transform.transform({
    request: {
      headers: { authorization: "Bearer client-key" },
      method: "POST",
      url: "/v1/chat/completions"
    },
    requestBody: {
      messages: [{ role: "user", content: "hello" }],
      model: "Primary/beta"
    },
    route: {
      method: "POST",
      url: "/v1/chat/completions"
    }
  });

  assert.equal(transformed.ok, false);
  assert.equal(transformed.status, 403);
  assert.equal(transformed.details.code, "profile_model_not_allowed");
});

function createReply(overrides = {}) {
  return {
    code(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    hijack() {
      this.hijacked = true;
    },
    hijacked: false,
    ...overrides,
    send(payload) {
      this.payload = payload;
      return payload;
    },
    statusCode: 200
  };
}

function createRawResponse() {
  return {
    body: "",
    headers: {},
    statusCode: 0,
    end(chunk) {
      if (chunk !== undefined) {
        this.body += String(chunk);
      }
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    }
  };
}

function multiAgentNamespaceTool() {
  return {
    description: "Tools for spawning and managing sub-agents.",
    name: "multi_agent_v1",
    tools: [{
      additionalProperties: false,
      description: "Spawn a sub-agent.",
      name: "spawn_agent",
      parameters: {
        properties: {
          message: { type: "string" }
        },
        type: "object"
      },
      type: "function"
    }, {
      additionalProperties: false,
      description: "Wait for agents.",
      name: "wait_agent",
      parameters: {
        properties: {
          targets: { items: { type: "string" }, type: "array" }
        },
        required: ["targets"],
        type: "object"
      },
      type: "function"
    }],
    type: "namespace"
  };
}
