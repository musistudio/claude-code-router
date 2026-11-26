import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin.ts";
import {
  ccrAnthropicBillingHeader,
  encodeCcrAnthropicBillingHeader
} from "@ccr/core/gateway/core-runtime/router-plugin-contract.ts";
import { GatewayRequestPipeline } from "@ccr/core/gateway/request/pipeline.ts";
import { pluginService } from "@ccr/core/plugins/service.ts";
import { toCoreGatewayProviders } from "@ccr/core/providers/runtime-topology.ts";

const billingBlock = {
  text: "x-anthropic-billing-header: cc_version=2.1.332; cc_entrypoint=cli; cch=7f9a1;",
  type: "text"
};

const cachedSystemBlock = {
  cache_control: { type: "ephemeral" },
  text: "Classify whether this action is safe.",
  type: "text"
};

const prependedRuleBlock = {
  text: "Injected by route rewrite rule.",
  type: "text"
};

const corePluginBlock = {
  text: "Injected by core beforeRouting plugin.",
  type: "text"
};

const hostPluginBlock = {
  text: "Injected by host request transform plugin.",
  type: "text"
};

test("#1999 gateway preserves x-anthropic-billing-header only for official Anthropic across router rewrites, plugins, pipeline, conversions, and fallbacks", { timeout: 30000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ccr-billing-header-"));
  const captured = [];
  let failTarget = null;

  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const target = request.headers["x-test-upstream-target"];
    captured.push({ body, headers: { ...request.headers }, path: request.url, target });

    response.setHeader("content-type", "application/json");
    if (failTarget && target === failTarget) {
      response.statusCode = 502;
      response.end(JSON.stringify({ error: { message: "synthetic fallback trigger", type: "api_error" } }));
      return;
    }
    if (request.url.endsWith("/chat/completions")) {
      response.end(JSON.stringify({
        choices: [{ finish_reason: "stop", index: 0, message: { content: "ok", role: "assistant" } }],
        id: "chat-test",
        model: body.model,
        object: "chat.completion",
        usage: { completion_tokens: 1, prompt_tokens: 10, total_tokens: 11 }
      }));
      return;
    }
    if (request.url.endsWith("/responses")) {
      response.end(JSON.stringify({
        id: "resp-test",
        model: body.model,
        object: "response",
        output: [{ content: [{ annotations: [], text: "ok", type: "output_text" }], id: "msg-test", role: "assistant", type: "message" }],
        status: "completed",
        usage: { input_tokens: 10, output_tokens: 1, total_tokens: 11 }
      }));
      return;
    }
    if (request.url.includes(":generateContent")) {
      response.end(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "ok" }], role: "model" }, finishReason: "STOP" }],
        usageMetadata: { candidatesTokenCount: 1, promptTokenCount: 10, totalTokenCount: 11 }
      }));
      return;
    }
    response.end(JSON.stringify({
      content: [{ text: "ok", type: "text" }],
      id: "msg-test",
      model: body.model,
      role: "assistant",
      stop_reason: "end_turn",
      type: "message",
      usage: { input_tokens: 10, output_tokens: 1 }
    }));
  });

  let child;
  let exited;
  let output = "";
  try {
    await listen(upstream);
    const upstreamOrigin = `http://127.0.0.1:${upstream.address().port}`;
    const reservation = createServer();
    await listen(reservation);
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));

    const appConfig = createDefaultAppConfig();
    appConfig.observability.requestLogs = false;
    appConfig.contextArchive.enabled = false;
    appConfig.Providers = [
      { api_base_url: "https://api.anthropic.com", api_key: "test-only", id: "official-anthropic", models: ["claude-sonnet-4-6"], name: "official-anthropic", type: "anthropic_messages" },
      { api_base_url: "https://third-party.example", api_key: "test-only", id: "third-party-anthropic", models: ["claude-sonnet-4-6"], name: "third-party-anthropic", type: "anthropic_messages" },
      { api_base_url: "https://openai-compat.example/v1", api_key: "test-only", id: "openai-chat", models: ["claude-sonnet-4-6"], name: "openai-chat", type: "openai_chat_completions" },
      { api_base_url: "https://openai-compat.example/v1", api_key: "test-only", id: "openai-responses", models: ["claude-sonnet-4-6"], name: "openai-responses", type: "openai_responses" },
      { api_base_url: "https://generativelanguage.googleapis.com/v1beta", api_key: "test-only", id: "gemini-native", models: ["claude-sonnet-4-6"], name: "gemini-native", type: "gemini_generate_content" }
    ];
    appConfig.Router.rules = [{
      condition: { left: "request.headers.x-apply-prepend-rule", operator: "==", right: "1" },
      enabled: true,
      id: "prepend-system-rule",
      name: "Prepend system instruction",
      rewrites: [{ key: "request.body.system", operation: "array-prepend", value: JSON.stringify(prependedRuleBlock) }],
      type: "condition"
    }, {
      condition: { left: "request.headers.x-apply-set-string-rule", operator: "==", right: "1" },
      enabled: true,
      id: "set-string-system-rule",
      name: "Set string system instruction",
      rewrites: [{ key: "request.body.system", operation: "set", value: "replacement prompt" }],
      type: "condition"
    }];

    const configFile = path.join(root, "gateway.json");
    const corePrependPluginFile = path.join(root, "core-prepend-plugin.cjs");
    const redirectFile = path.join(root, "loopback-transport.cjs");
    writeFileSync(corePrependPluginFile, `exports.createGatewayPlugin = () => ({ requestTransforms: [{
      key: 'test-core-prepend-system',
      stage: 'beforeRouting',
      transform({ model, request, requestBody }) {
        if (request?.headers?.['x-apply-core-plugin-prepend'] !== '1' || !requestBody || typeof requestBody !== 'object') {
          return undefined;
        }
        const system = Array.isArray(requestBody.system) ? requestBody.system : [];
        return {
          ...(model !== undefined ? { model } : {}),
          requestBody: {
            ...requestBody,
            system: [${JSON.stringify(corePluginBlock)}, ...system]
          }
        };
      }
    }] });`);

    writeFileSync(redirectFile, `exports.createGatewayPlugin = () => ({ providerHooks: [{
      key: 'test-loopback-transport',
      transformRequest({ upstreamRequest, targetProviderConfig }) {
        const url = new URL(upstreamRequest.url);
        return {
          ok: true,
          value: {
            ...upstreamRequest,
            headers: {
              ...upstreamRequest.headers,
              'x-test-upstream-target': targetProviderConfig?.name || url.hostname
            },
            url: ${JSON.stringify(upstreamOrigin)} + url.pathname + url.search
          }
        };
      }
    }] });`);

    writeFileSync(configFile, JSON.stringify({
      host: "127.0.0.1",
      logging: { enabled: false },
      port,
      plugins: [
        {
          config: { appConfig, coreAuthToken: "test-core-token", publicGatewayMode: false },
          key: "ccr-router-plugin",
          modulePath: path.resolve(".test-dist/core/runtime/router-plugin.js")
        },
        { key: "test-core-prepend", modulePath: corePrependPluginFile },
        { key: "ccr-upstream-header-sanitizer", modulePath: path.resolve(".test-dist/core/runtime/upstream-header-sanitizer.js") },
        { key: "test-transport", modulePath: redirectFile }
      ],
      providers: appConfig.Providers.flatMap((provider) => toCoreGatewayProviders(provider)).filter(Boolean)
    }));

    child = spawn(process.execPath, [path.resolve("node_modules/@the-next-ai/ai-gateway/dist/index.js")], {
      cwd: root,
      env: {
        ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE,
        GATEWAY_CONFIG_PATH: configFile,
        PATH: process.env.PATH
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    exited = once(child, "exit");
    child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-8000); });
    child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-8000); });

    const origin = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (child.exitCode !== null) throw new Error(output);
      try { ready = (await fetch(`${origin}/health`, { signal: AbortSignal.timeout(500) })).ok; } catch {}
      if (ready) break;
      await delay(50);
    }
    assert.ok(ready, output);

    // 1. Official Anthropic classifier request (billing block only) preserves system and never leaks internal carrier header.
    const classifierResponse = await fetch(`${origin}/v1/messages?beta=true`, {
      body: JSON.stringify({
        max_tokens: 16,
        messages: [{ content: "Evaluate tool call", role: "user" }],
        model: "official-anthropic/claude-sonnet-4-6",
        system: [billingBlock]
      }),
      headers: { "content-type": "application/json", "user-agent": "claude-cli/2.1.332" },
      method: "POST",
      signal: AbortSignal.timeout(5000)
    });
    assert.equal(classifierResponse.status, 200, await classifierResponse.text());
    assert.deepEqual(captured.at(-1).body.system, [billingBlock]);
    assert.equal(ccrAnthropicBillingHeader in captured.at(-1).headers, false);

    // 2. Official Anthropic with billing + cache_control block preserves the full array.
    const cachedResponse = await fetch(`${origin}/v1/messages`, {
      body: JSON.stringify({
        max_tokens: 16,
        messages: [{ content: "Evaluate tool call", role: "user" }],
        model: "official-anthropic/claude-sonnet-4-6",
        system: [billingBlock, cachedSystemBlock]
      }),
      headers: { "content-type": "application/json", "user-agent": "claude-cli/2.1.332" },
      method: "POST",
      signal: AbortSignal.timeout(5000)
    });
    assert.equal(cachedResponse.status, 200, await cachedResponse.text());
    assert.deepEqual(captured.at(-1).body.system, [billingBlock, cachedSystemBlock]);

    // 3. Third-party anthropic_messages passthrough strips the billing block.
    const thirdPartyResponse = await fetch(`${origin}/v1/messages`, {
      body: JSON.stringify({
        max_tokens: 16,
        messages: [{ content: "Evaluate tool call", role: "user" }],
        model: "third-party-anthropic/claude-sonnet-4-6",
        system: [billingBlock, cachedSystemBlock]
      }),
      headers: { "content-type": "application/json", "user-agent": "claude-cli/2.1.332" },
      method: "POST",
      signal: AbortSignal.timeout(5000)
    });
    assert.equal(thirdPartyResponse.status, 200, await thirdPartyResponse.text());
    assert.deepEqual(captured.at(-1).body.system, [cachedSystemBlock]);
    assert.equal(ccrAnthropicBillingHeader in captured.at(-1).headers, false);

    // 4. Route rule with array-prepend on request.body.system keeps billing block first on
    // official Anthropic and strips it completely on third-party providers.
    const officialPrependResponse = await fetch(`${origin}/v1/messages`, {
      body: JSON.stringify({
        max_tokens: 16,
        messages: [{ content: "Evaluate tool call", role: "user" }],
        model: "official-anthropic/claude-sonnet-4-6",
        system: [billingBlock, cachedSystemBlock]
      }),
      headers: {
        "content-type": "application/json",
        "user-agent": "claude-cli/2.1.332",
        "x-apply-prepend-rule": "1"
      },
      method: "POST",
      signal: AbortSignal.timeout(5000)
    });
    assert.equal(officialPrependResponse.status, 200, await officialPrependResponse.text());
    assert.deepEqual(captured.at(-1).body.system, [billingBlock, prependedRuleBlock, cachedSystemBlock]);

    const thirdPartyPrependResponse = await fetch(`${origin}/v1/messages`, {
      body: JSON.stringify({
        max_tokens: 16,
        messages: [{ content: "Evaluate tool call", role: "user" }],
        model: "third-party-anthropic/claude-sonnet-4-6",
        system: [billingBlock, cachedSystemBlock]
      }),
      headers: {
        "content-type": "application/json",
        "user-agent": "claude-cli/2.1.332",
        "x-apply-prepend-rule": "1"
      },
      method: "POST",
      signal: AbortSignal.timeout(5000)
    });
    assert.equal(thirdPartyPrependResponse.status, 200, await thirdPartyPrependResponse.text());
    assert.deepEqual(captured.at(-1).body.system, [prependedRuleBlock, cachedSystemBlock]);

    // 5. Route rule setting request.body.system to a scalar string preserves the string type on
    // third-party targets while wrapping it behind the billing block on official Anthropic.
    const thirdPartyStringSetResponse = await fetch(`${origin}/v1/messages`, {
      body: JSON.stringify({
        max_tokens: 16,
        messages: [{ content: "Evaluate tool call", role: "user" }],
        model: "third-party-anthropic/claude-sonnet-4-6",
        system: [billingBlock, cachedSystemBlock]
      }),
      headers: {
        "content-type": "application/json",
        "user-agent": "claude-cli/2.1.332",
        "x-apply-set-string-rule": "1"
      },
      method: "POST",
      signal: AbortSignal.timeout(5000)
    });
    assert.equal(thirdPartyStringSetResponse.status, 200, await thirdPartyStringSetResponse.text());
    assert.equal(captured.at(-1).body.system, "replacement prompt");

    const officialStringSetResponse = await fetch(`${origin}/v1/messages`, {
      body: JSON.stringify({
        max_tokens: 16,
        messages: [{ content: "Evaluate tool call", role: "user" }],
        model: "official-anthropic/claude-sonnet-4-6",
        system: [billingBlock, cachedSystemBlock]
      }),
      headers: {
        "content-type": "application/json",
        "user-agent": "claude-cli/2.1.332",
        "x-apply-set-string-rule": "1"
      },
      method: "POST",
      signal: AbortSignal.timeout(5000)
    });
    assert.equal(officialStringSetResponse.status, 200, await officialStringSetResponse.text());
    assert.deepEqual(captured.at(-1).body.system, [billingBlock, { text: "replacement prompt", type: "text" }]);

    // 6. Configured core beforeRouting plugin prepending to system keeps billing block at index 0
    // on official Anthropic and never leaks it to third-party targets.
    const corePluginOfficialResponse = await fetch(`${origin}/v1/messages`, {
      body: JSON.stringify({
        max_tokens: 16,
        messages: [{ content: "Evaluate tool call", role: "user" }],
        model: "official-anthropic/claude-sonnet-4-6",
        system: [billingBlock, cachedSystemBlock]
      }),
      headers: {
        "content-type": "application/json",
        "user-agent": "claude-cli/2.1.332",
        "x-apply-core-plugin-prepend": "1"
      },
      method: "POST",
      signal: AbortSignal.timeout(5000)
    });
    assert.equal(corePluginOfficialResponse.status, 200, await corePluginOfficialResponse.text());
    assert.deepEqual(captured.at(-1).body.system, [billingBlock, corePluginBlock, cachedSystemBlock]);
    assert.equal(ccrAnthropicBillingHeader in captured.at(-1).headers, false);

    const corePluginThirdPartyResponse = await fetch(`${origin}/v1/messages`, {
      body: JSON.stringify({
        max_tokens: 16,
        messages: [{ content: "Evaluate tool call", role: "user" }],
        model: "third-party-anthropic/claude-sonnet-4-6",
        system: [billingBlock, cachedSystemBlock]
      }),
      headers: {
        "content-type": "application/json",
        "user-agent": "claude-cli/2.1.332",
        "x-apply-core-plugin-prepend": "1"
      },
      method: "POST",
      signal: AbortSignal.timeout(5000)
    });
    assert.equal(corePluginThirdPartyResponse.status, 200, await corePluginThirdPartyResponse.text());
    assert.deepEqual(captured.at(-1).body.system, [corePluginBlock, cachedSystemBlock]);

    // 7. Host GatewayRequestPipeline + host prompt-prepending plugin preserves exact ordering on
    // official Anthropic, strips on third-party, and rejects client-spoofed carrier headers.
    const hostRouter = new ClaudeCodeRouterPlugin(appConfig);
    const hostPipeline = new GatewayRequestPipeline({
      getBrowserWebSearchMcpIntegration: () => undefined,
      getConfig: () => appConfig,
      getCoreAuthToken: () => "test-core-token",
      getPlugin: () => hostRouter,
      getStatus: () => ({ coreEndpoint: origin, endpoint: origin })
    });
    const hostTransform = {
      id: "test-host-prepend-system",
      pluginId: "test-host-plugin",
      transform(input) {
        if (input.headers["x-apply-host-plugin-prepend"] !== "1" || !input.body) {
          return undefined;
        }
        const system = Array.isArray(input.body.system) ? input.body.system : [];
        return {
          body: {
            ...input.body,
            system: [hostPluginBlock, ...system]
          }
        };
      }
    };
    pluginService.gatewayRequestTransforms.push(hostTransform);
    try {
      const hostOfficialStatus = await invokePipeline(hostPipeline, "/v1/messages", {
        "content-type": "application/json",
        "user-agent": "claude-cli/2.1.332",
        "x-apply-host-plugin-prepend": "1"
      }, {
        max_tokens: 16,
        messages: [{ content: "Evaluate tool call", role: "user" }],
        model: "official-anthropic/claude-sonnet-4-6",
        system: [billingBlock, cachedSystemBlock]
      });
      assert.equal(hostOfficialStatus, 200);
      assert.deepEqual(captured.at(-1).body.system, [billingBlock, hostPluginBlock, cachedSystemBlock]);
      assert.equal(ccrAnthropicBillingHeader in captured.at(-1).headers, false);

      const hostThirdPartyStatus = await invokePipeline(hostPipeline, "/v1/messages", {
        "content-type": "application/json",
        "user-agent": "claude-cli/2.1.332",
        "x-apply-host-plugin-prepend": "1"
      }, {
        max_tokens: 16,
        messages: [{ content: "Evaluate tool call", role: "user" }],
        model: "third-party-anthropic/claude-sonnet-4-6",
        system: [billingBlock, cachedSystemBlock]
      });
      assert.equal(hostThirdPartyStatus, 200);
      assert.deepEqual(captured.at(-1).body.system, [hostPluginBlock, cachedSystemBlock]);

      const spoofedStatus = await invokePipeline(hostPipeline, "/v1/messages", {
        "content-type": "application/json",
        [ccrAnthropicBillingHeader]: encodeCcrAnthropicBillingHeader(billingBlock)
      }, {
        max_tokens: 16,
        messages: [{ content: "Plain request", role: "user" }],
        model: "official-anthropic/claude-sonnet-4-6",
        system: [cachedSystemBlock]
      });
      assert.equal(spoofedStatus, 200);
      assert.deepEqual(captured.at(-1).body.system, [cachedSystemBlock]);
    } finally {
      const idx = pluginService.gatewayRequestTransforms.indexOf(hostTransform);
      if (idx >= 0) pluginService.gatewayRequestTransforms.splice(idx, 1);
    }

    // 8. Generic clients sending colonless lookalikes OR ordinary prose with the literal colon
    // prefix as their sole system block stay completely intact on third-party targets.
    for (const ordinaryBlock of [
      { text: "x-anthropic-billing-header-examples are the topic.", type: "text" },
      { text: "x-anthropic-billing-header: the topic for today", type: "text" }
    ]) {
      const ordinaryResponse = await fetch(`${origin}/v1/messages`, {
        body: JSON.stringify({
          max_tokens: 16,
          messages: [{ content: "Explain examples", role: "user" }],
          model: "third-party-anthropic/claude-sonnet-4-6",
          system: [ordinaryBlock]
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(5000)
      });
      assert.equal(ordinaryResponse.status, 200, await ordinaryResponse.text());
      assert.deepEqual(captured.at(-1).body.system, [ordinaryBlock]);
    }

    // 9. A following system block sharing the delimiter prefix never suppresses official restoration.
    const topicCollisionBlock = { text: "x-anthropic-billing-header: the topic for today", type: "text" };
    const collisionResponse = await fetch(`${origin}/v1/messages`, {
      body: JSON.stringify({
        max_tokens: 16,
        messages: [{ content: "Discuss", role: "user" }],
        model: "official-anthropic/claude-sonnet-4-6",
        system: [billingBlock, topicCollisionBlock]
      }),
      headers: { "content-type": "application/json", "user-agent": "claude-cli/2.1.332" },
      method: "POST",
      signal: AbortSignal.timeout(5000)
    });
    assert.equal(collisionResponse.status, 200, await collisionResponse.text());
    assert.deepEqual(captured.at(-1).body.system, [billingBlock, topicCollisionBlock]);

    // 10. Converted protocols (Chat, Responses, Gemini) receive no billing header.
    for (const provider of ["openai-chat", "openai-responses", "gemini-native"]) {
      const convertedResponse = await fetch(`${origin}/v1/messages`, {
        body: JSON.stringify({
          max_tokens: 16,
          messages: [{ content: "Evaluate tool call", role: "user" }],
          model: `${provider}/claude-sonnet-4-6`,
          system: [billingBlock, cachedSystemBlock]
        }),
        headers: { "content-type": "application/json", "user-agent": "claude-cli/2.1.332" },
        method: "POST",
        signal: AbortSignal.timeout(5000)
      });
      assert.equal(convertedResponse.status, 200, await convertedResponse.text());
      assert.doesNotMatch(JSON.stringify(captured.at(-1).body), /x-anthropic-billing-header/);
    }

    // 11. Fallback: official -> third-party and third-party -> official.
    captured.length = 0;
    failTarget = "official-anthropic";
    const officialToThirdParty = await fetch(`${origin}/v1/messages`, {
      body: JSON.stringify({
        max_tokens: 16,
        messages: [{ content: "Evaluate tool call", role: "user" }],
        model: "claude-sonnet-4-6",
        system: [billingBlock]
      }),
      headers: {
        "content-type": "application/json",
        "x-ccr-routed-model": "claude-sonnet-4-6",
        "x-target-providers": "official-anthropic,third-party-anthropic"
      },
      method: "POST",
      signal: AbortSignal.timeout(5000)
    });
    assert.equal(officialToThirdParty.status, 200, await officialToThirdParty.text());
    assert.equal(captured.length, 2);
    assert.equal(captured[0].target, "official-anthropic");
    assert.deepEqual(captured[0].body.system, [billingBlock]);
    assert.equal(captured[1].target, "third-party-anthropic");
    assert.equal("system" in captured[1].body, false);

    captured.length = 0;
    failTarget = "third-party-anthropic";
    const thirdPartyToOfficial = await fetch(`${origin}/v1/messages`, {
      body: JSON.stringify({
        max_tokens: 16,
        messages: [{ content: "Evaluate tool call", role: "user" }],
        model: "claude-sonnet-4-6",
        system: [billingBlock]
      }),
      headers: {
        "content-type": "application/json",
        "x-ccr-routed-model": "claude-sonnet-4-6",
        "x-target-providers": "third-party-anthropic,official-anthropic"
      },
      method: "POST",
      signal: AbortSignal.timeout(5000)
    });
    assert.equal(thirdPartyToOfficial.status, 200, await thirdPartyToOfficial.text());
    assert.equal(captured.length, 2);
    assert.equal(captured[0].target, "third-party-anthropic");
    assert.equal("system" in captured[0].body, false);
    assert.equal(captured[1].target, "official-anthropic");
    assert.deepEqual(captured[1].body.system, [billingBlock]);
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      const force = setTimeout(() => child.kill("SIGKILL"), 2000);
      await exited;
      clearTimeout(force);
    }
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
    rmSync(root, { force: true, recursive: true });
  }
});

async function invokePipeline(pipeline, requestPath, headers, body) {
  const request = Readable.from([Buffer.from(JSON.stringify(body))]);
  request.method = "POST";
  request.url = requestPath;
  request.headers = { ...headers };
  let statusCode = 0;
  const response = new Writable({ write(_chunk, _encoding, done) { done(); } });
  response.writeHead = (code) => { statusCode = code; return response; };
  await pipeline.proxyRequest(request, response, requestPath);
  return statusCode;
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
}
