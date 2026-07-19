import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { normalizeGrokProviderMediaCapabilities } from "@ccr/core/agents/local-providers/grok.ts";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { GatewayMediaExecutor } from "@ccr/core/media/executors.ts";
import { MediaService, mediaServiceForTest, resolveProviderMediaTarget } from "@ccr/core/media/service.ts";
import { MEDIA_ARTIFACT_PATH_PREFIX, handleMediaArtifactRequest, handleMediaToolsMcpRequest } from "@ccr/core/mcp/grok-media-mcp.ts";

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("ccr-grok-media-test")
]);
const mp4 = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from("ftyp"),
  Buffer.from("mp42ccr-grok-media-test")
]);

test("media tools bind profile-specific runtime names to gateway media models", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-media-bindings-"));
  const config = mediaConfig("https://media.example");
  const service = new MediaService(root);
  service.start(config, "http://127.0.0.1:3456");
  t.after(async () => {
    await service.stop();
    rmSync(root, { force: true, recursive: true });
  });

  assert.deepEqual(service.toolBindings(), [
    { modelSelector: "Media Provider/grok-imagine-image-quality", name: "image_generate_test", operation: "image-generate" },
    { modelSelector: "Media Provider/grok-imagine-image-quality", name: "image_edit_test", operation: "image-edit" },
    { modelSelector: "Media Provider/grok-imagine-video", name: "video_generate_test", operation: "video-generate" },
    { modelSelector: "Media Provider/grok-imagine-video", name: "media_job_get_test", operation: "job-get" },
    { modelSelector: "Media Provider/grok-imagine-video", name: "media_job_cancel_test", operation: "job-cancel" }
  ]);
  const target = resolveProviderMediaTarget(config, "Media Provider/grok-imagine-image-quality");
  assert.deepEqual({ model: target.model, providerName: target.providerName }, {
    model: "grok-imagine-image-quality",
    providerName: "Media Provider"
  });
  assert.match(target.providerSelector, /::openai_image_generations::cred:/);
  assert.equal(target.providerBaseUrl, "https://media.example/v1");
});

test("media artifact downloads reject private-network URLs from public providers", async () => {
  const executor = new GatewayMediaExecutor({
    model: "image-model",
    providerBaseUrl: "https://8.8.8.8/v1",
    providerName: "Public Media Provider",
    providerSelector: "public-media::openai_image_generations"
  }, { baseUrl: "http://127.0.0.1:3457" });

  await assert.rejects(
    executor.download({ remoteUrl: "http://127.0.0.1/private.png" }, new AbortController().signal),
    /private or non-public address/
  );

  const localExecutor = new GatewayMediaExecutor({
    model: "image-model",
    providerBaseUrl: "http://127.0.0.1:3000/v1",
    providerName: "Local Media Provider",
    providerSelector: "local-media::openai_image_generations"
  }, { baseUrl: "http://127.0.0.1:3457" });
  await assert.rejects(
    localExecutor.download({ remoteUrl: "http://127.0.0.1:3001/private.png" }, new AbortController().signal),
    /outside the configured provider origin/
  );
});

test("implicit media input roots reject the filesystem root and home directory", () => {
  const home = path.resolve(os.homedir());
  assert.equal(mediaServiceForTest.isSafeImplicitWorkingDirectory(path.parse(home).root, home), false);
  assert.equal(mediaServiceForTest.isSafeImplicitWorkingDirectory(home, home), false);
  assert.equal(mediaServiceForTest.isSafeImplicitWorkingDirectory(path.join(home, "workspace", "project"), home), true);
});

test("an imported Grok Agent supplies OAuth-backed Grok API media models without an API key", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-grok-agent-media-"));
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  config.mediaTools.enabled = true;
  config.Providers = [normalizeGrokProviderMediaCapabilities({
    apiKey: "ccr-local-agent-login",
    baseUrl: "https://cli-chat-proxy.grok.com/v1",
    models: ["grok-4.5"],
    name: "Imported Grok"
  })];
  config.virtualModelProfiles = [{
    baseModel: { fixedModel: "Imported Grok/grok-4.5", mode: "fixed" },
    displayName: "Legacy Grok Media",
    enabled: true,
    id: "legacy-grok-media",
    key: "legacy-grok-media",
    match: { exactAliases: ["legacy-grok-media"], prefixes: [], suffixes: [] },
    metadata: {
      fusionMedia: {
        imageGenerateToolName: "image_generate_imported",
        imageModelSelector: "grok-cli",
        videoModelSelector: "grok-cli",
        videoStartToolName: "video_generate_imported"
      }
    },
    tools: []
  }];
  const service = new MediaService(root);
  service.start(config, "http://127.0.0.1:3456");
  t.after(async () => {
    await service.stop();
    rmSync(root, { force: true, recursive: true });
  });

  assert.deepEqual(service.toolBindings(), [
    { modelSelector: "Imported Grok/grok-imagine-image-quality", name: "image_generate_imported", operation: "image-generate" },
    { modelSelector: "Imported Grok/grok-imagine-video", name: "video_generate_imported", operation: "video-generate" }
  ]);
  const target = resolveProviderMediaTarget(config, "Imported Grok/grok-imagine-image-quality", "image-generate");
  assert.equal(target.model, "grok-imagine-image-quality");
  assert.equal(target.providerName, "Imported Grok");
  assert.match(target.providerSelector, /::openai_image_generations$/);
});

test("provider image jobs use the internal media gateway, persist artifacts, and remain idempotent", async (t) => {
  const requests = [];
  let imageGenerateBody;
  let imageEditBody;
  let service;
  const server = createServer(async (request, response) => {
    requests.push({
      coreAuth: request.headers["x-ccr-core-auth"],
      method: request.method,
      targetProvider: request.headers["x-target-provider"],
      url: request.url
    });
    if (request.method === "POST" && request.url === "/v1/images/generations") {
      imageGenerateBody = JSON.parse((await consume(request)).toString("utf8"));
      json(response, { data: [{ url: `${baseUrl(server)}/artifact.png` }], usage: { cost_in_usd_ticks: 200000000 } });
      return;
    }
    if (request.method === "POST" && request.url === "/v1/images/edits") {
      imageEditBody = JSON.parse((await consume(request)).toString("utf8"));
      json(response, { data: [{ url: `${baseUrl(server)}/artifact.png` }], usage: { cost_in_usd_ticks: 300000000 } });
      return;
    }
    if (request.method === "GET" && request.url === "/artifact.png") {
      response.writeHead(200, { "content-length": png.length, "content-type": "image/png" });
      response.end(png);
      return;
    }
    if (request.url === "/mcp") {
      await handleMediaToolsMcpRequest(request, response, service);
      return;
    }
    const requestUrl = new URL(request.url, baseUrl(server));
    if (requestUrl.pathname.startsWith(MEDIA_ARTIFACT_PATH_PREFIX)) {
      handleMediaArtifactRequest(request, response, requestUrl, service);
      return;
    }
    response.writeHead(404).end();
  });
  if (!await listenOrSkip(t, server)) return;
  t.after(() => server.close());

  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-grok-media-image-"));
  service = new MediaService(root);
  t.after(async () => {
    await service.stop();
    rmSync(root, { force: true, recursive: true });
  });
  const config = mediaConfig(baseUrl(server));
  service.start(config, baseUrl(server), {
    authHeader: "x-ccr-core-auth",
    authToken: "core-test-token",
    baseUrl: baseUrl(server)
  });

  const listResponse = await fetch(`${baseUrl(server)}/mcp`, {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  const listPayload = await listResponse.json();
  assert.deepEqual(listPayload.result.tools.map((tool) => tool.name), [
    "image_generate_test",
    "image_edit_test",
    "video_generate_test",
    "media_job_get_test",
    "media_job_cancel_test"
  ]);

  const callResponse = await fetch(`${baseUrl(server)}/mcp`, {
    body: JSON.stringify({
      id: 2,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: { idempotency_key: "same-paid-request", prompt: "A blue cup" }, name: "image_generate_test" }
    }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  const callPayload = await callResponse.json();
  const first = JSON.parse(callPayload.result.content[0].text);
  const second = await service.imageGenerate({ idempotency_key: "same-paid-request", prompt: "A blue cup" }, "Media Provider/grok-imagine-image-quality");
  assert.equal(first.status, "succeeded");
  assert.equal(second.id, first.id);
  assert.equal(first.artifact.mimeType, "image/png");
  assert.equal(first.usage.costUsdTicks, 200000000);
  assert.equal(requests.filter((item) => item.url === "/v1/images/generations").length, 1);
  assert.equal(requests.find((item) => item.url === "/v1/images/generations").coreAuth, "core-test-token");
  assert.match(requests.find((item) => item.url === "/v1/images/generations").targetProvider, /::openai_image_generations::cred:/);
  assert.equal(imageGenerateBody.provider_option, undefined);
  assert.equal(imageGenerateBody.model, "grok-imagine-image-quality");

  const referenceOne = path.join(root, "reference-one.png");
  const referenceTwo = path.join(root, "reference-two.png");
  writeFileSync(referenceOne, png);
  writeFileSync(referenceTwo, png);
  const edited = await service.imageEdit({ images: [referenceOne, referenceTwo], prompt: "Combine both references" }, "Media Provider/grok-imagine-image-quality");
  assert.equal(edited.status, "succeeded");
  assert.equal(edited.usage.costUsdTicks, 300000000);
  assert.equal(imageEditBody.image, undefined);
  assert.equal(imageEditBody.images.length, 2);
  assert.ok(imageEditBody.images.every((image) => image.type === "image_url" && image.url.startsWith("data:image/png;base64,")));

  const artifactUrl = new URL(first.artifact.url);
  const resolved = service.resolveArtifact(first.artifact.id, artifactUrl.searchParams.get("token"));
  assert.equal(resolved.state, "ok");
  assert.ok(existsSync(resolved.artifact.localPath));
  assert.deepEqual(readFileSync(resolved.artifact.localPath), png);
  const rangeResponse = await fetch(first.artifact.url, { headers: { range: "bytes=0-7" } });
  assert.equal(rangeResponse.status, 206);
  assert.equal(rangeResponse.headers.get("content-range"), `bytes 0-7/${png.length}`);
  assert.equal(
    rangeResponse.headers.get("content-security-policy"),
    "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'"
  );
  assert.deepEqual(Buffer.from(await rangeResponse.arrayBuffer()), png.subarray(0, 8));

  const reloaded = new MediaService(root);
  assert.equal(reloaded.getJob(first.id).status, "succeeded");
});

test("provider video jobs return immediately and finish through asynchronous polling", async (t) => {
  let expectedReferenceCount = 0;
  const server = createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/v1/videos/generations") {
      const body = JSON.parse((await consume(request)).toString("utf8"));
      assert.equal(body.prompt, "Animate the product");
      assert.equal(body.image, undefined);
      assert.equal(body.reference_images.length, expectedReferenceCount);
      json(response, { request_id: "video-request-1" });
      return;
    }
    if (request.method === "GET" && request.url === "/v1/videos/video-request-1") {
      assert.equal(request.headers["x-target-model"], "grok-imagine-video");
      json(response, { status: "done", usage: { cost_in_usd_ticks: 500000000 }, video: { url: `${baseUrl(server)}/artifact.mp4` } });
      return;
    }
    if (request.method === "GET" && request.url === "/artifact.mp4") {
      response.writeHead(200, { "content-length": mp4.length, "content-type": "video/mp4" });
      response.end(mp4);
      return;
    }
    response.writeHead(404).end();
  });
  if (!await listenOrSkip(t, server)) return;
  t.after(() => server.close());

  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-grok-media-video-"));
  const service = new MediaService(root);
  t.after(async () => {
    await service.stop();
    rmSync(root, { force: true, recursive: true });
  });
  service.start(mediaConfig(baseUrl(server)), "http://127.0.0.1:3456", { baseUrl: baseUrl(server) });

  const references = Array.from({ length: 7 }, (_, index) => {
    const file = path.join(root, `reference-${index}.png`);
    writeFileSync(file, png);
    return file;
  });
  expectedReferenceCount = references.length;
  const started = service.videoStart({ duration: 6, images: references, prompt: "Animate the product", resolution: "480p" }, "Media Provider/grok-imagine-video");
  assert.ok(started.status === "queued" || started.status === "running");
  const completed = await waitForJob(service, started.id);
  assert.equal(completed.status, "succeeded");
  assert.equal(completed.remoteRequestId, "video-request-1");
  assert.equal(completed.artifact.mimeType, "video/mp4");
  assert.equal(completed.usage.costUsdTicks, 500000000);
  assert.deepEqual(readFileSync(completed.artifact.localPath), mp4);
});

function mediaConfig(baseUrlValue) {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  config.mediaTools = {
    ...config.mediaTools,
    artifactTtlHours: 1,
    enabled: true,
    jobTimeoutMs: 10000
  };
  config.Providers = [{
    apikey: "legacy-provider-key",
    baseUrl: `${baseUrlValue}/v1`,
    credentials: [
      { apiKey: "provider-secondary-key", enabled: true, priority: 2 },
      { api_key: "provider-primary-key", enabled: true, priority: 1 }
    ],
    extraBody: { provider_option: "enabled" },
    extraHeaders: { "x-provider-option": "enabled" },
    capabilities: [
      { baseUrl: `${baseUrlValue}/v1`, source: "detected", type: "openai_chat_completions" },
      { baseUrl: `${baseUrlValue}/v1`, source: "detected", type: "openai_image_generations" },
      { baseUrl: `${baseUrlValue}/v1`, source: "detected", type: "openai_video_generations" }
    ],
    models: ["grok-imagine-image-quality", "grok-imagine-video"],
    name: "Media Provider"
  }];
  config.virtualModelProfiles = [{
    baseModel: { fixedModel: "Media Provider/grok-imagine-image-quality", mode: "fixed" },
    displayName: "Media Test",
    enabled: true,
    execution: { clientToolsPolicy: "allow", maxToolCalls: 5, maxTurns: 6, mode: "tool_loop", streamMode: "optimistic" },
    id: "test",
    key: "test",
    match: { exactAliases: ["media-test"], prefixes: [], suffixes: [] },
    materialization: { enabled: true, includeInGatewayModels: true },
    metadata: {
      fusionMedia: {
        imageEditToolName: "image_edit_test",
        imageGenerateToolName: "image_generate_test",
        imageModelSelector: "Media Provider/grok-imagine-image-quality",
        jobCancelToolName: "media_job_cancel_test",
        jobGetToolName: "media_job_get_test",
        videoModelSelector: "Media Provider/grok-imagine-video",
        videoStartToolName: "video_generate_test"
      }
    },
    tools: ["image_generate_test", "image_edit_test", "video_generate_test", "media_job_get_test", "media_job_cancel_test"].map((name) => ({ name, visibility: "client" }))
  }];
  return config;
}

async function waitForJob(service, id) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const job = service.getJob(id);
    if (job.status === "succeeded" || job.status === "failed" || job.status === "canceled") return job;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for media job");
}

function baseUrl(server) {
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function listenOrSkip(t, server) {
  try {
    await listen(server);
    return true;
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES") {
      t.skip(`Local HTTP listen is unavailable: ${error.message}`);
      return false;
    }
    throw error;
  }
}

function consume(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.once("error", reject);
    request.once("end", () => resolve(Buffer.concat(chunks)));
  });
}

function json(response, body) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
