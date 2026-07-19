import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { grokCandidate, importGrokProvider } from "@ccr/core/agents/local-providers/grok.ts";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { writeCoreGatewayConfig } from "@ccr/core/gateway/core-runtime/config-writer.ts";
import { isCoreGatewayHealthy, spawnGatewayProcess } from "@ccr/core/gateway/core-runtime/supervisor.ts";
import { coreGatewayAuthHeader } from "@ccr/core/gateway/internal/shared.ts";
import { MediaService } from "@ccr/core/media/service.ts";
import {
  MEDIA_ARTIFACT_PATH_PREFIX,
  handleMediaArtifactRequest,
  handleMediaToolsMcpRequest
} from "@ccr/core/mcp/grok-media-mcp.ts";
import { getSystemProxyUrlForProtocol } from "@ccr/core/proxy/system-proxy-fetch.ts";

const localGatewayEntry = process.env.CCR_LIVE_AI_GATEWAY_ENTRY;
const liveEnabled = process.env.CCR_LIVE_GROK_MEDIA === "1";

test("Fusion generates image and video through the local ai-gateway", { skip: !liveEnabled }, async () => {
  assert.ok(localGatewayEntry, "CCR_LIVE_AI_GATEWAY_ENTRY is required");
  assert.ok(existsSync(localGatewayEntry), `Local ai-gateway entry does not exist: ${localGatewayEntry}`);

  const candidate = grokCandidate();
  assert.equal(candidate.importable, true, candidate.detail);
  const imported = await importGrokProvider(candidate, []);
  const providerName = imported.provider.name;
  const providerId = "grok-cli-api";
  const providerProtocol = imported.provider.protocol;
  const imageModel = "grok-imagine-image-quality";
  const videoModel = "grok-imagine-video";
  assert.ok(imported.provider.models.includes(imageModel));
  assert.ok(imported.provider.models.includes(videoModel));

  const configRoot = mkdtempSync(path.join(os.tmpdir(), "ccr-fusion-live-config-"));
  const artifactRoot = path.join(os.tmpdir(), `ccr-fusion-live-artifacts-${Date.now()}`);
  const config = createDefaultAppConfig({ generatedConfigFile: path.join(configRoot, "gateway.config.json") });
  const corePort = await availablePort();
  const coreEndpoint = `http://127.0.0.1:${corePort}`;
  const coreAuthToken = randomBytes(32).toString("base64url");
  const upstreamProxyUrl = await getSystemProxyUrlForProtocol("https", config);
  const toolNames = {
    imageEdit: "image_edit_grok_live",
    imageGenerate: "image_generate_grok_live",
    jobCancel: "media_job_cancel_grok_live",
    jobGet: "media_job_get_grok_live",
    videoGenerate: "video_generate_grok_live"
  };

  config.gateway.coreHost = "127.0.0.1";
  config.gateway.corePort = corePort;
  config.gateway.enabled = true;
  config.mediaTools = {
    ...config.mediaTools,
    artifactTtlHours: 24,
    enabled: true,
    jobTimeoutMs: 12 * 60 * 1000
  };
  config.Providers = [{
    ...imported.provider,
    id: providerId,
    type: providerProtocol
  }];
  config.providerPlugins = materializeProviderPlugins(
    imported.providerPlugins,
    providerName,
    providerId,
    providerProtocol
  );
  config.virtualModelProfiles = [{
    baseModel: { fixedModel: `${providerName}/grok-4.5`, mode: "fixed" },
    displayName: "Grok Live Media",
    enabled: true,
    id: "grok-live-media",
    key: "grok-live-media",
    match: { exactAliases: ["grok-live-media"], prefixes: [], suffixes: [] },
    materialization: { enabled: true, includeInGatewayModels: true },
    metadata: {
      fusionMedia: {
        imageEditToolName: toolNames.imageEdit,
        imageGenerateToolName: toolNames.imageGenerate,
        imageModelSelector: `${providerName}/${imageModel}`,
        jobCancelToolName: toolNames.jobCancel,
        jobGetToolName: toolNames.jobGet,
        videoModelSelector: `${providerName}/${videoModel}`,
        videoStartToolName: toolNames.videoGenerate
      }
    },
    tools: Object.values(toolNames).map((name) => ({ name, visibility: "client" }))
  }];

  const service = new MediaService(artifactRoot);
  let child;
  let mcpServer;
  let completed = false;
  const gatewayOutput = [];
  try {
    mcpServer = createServer(async (request, response) => {
      const requestUrl = new URL(request.url ?? "/", mcpEndpoint(mcpServer));
      if (requestUrl.pathname === "/mcp") {
        await handleMediaToolsMcpRequest(request, response, service);
        return;
      }
      if (requestUrl.pathname.startsWith(MEDIA_ARTIFACT_PATH_PREFIX)) {
        handleMediaArtifactRequest(request, response, requestUrl, service);
        return;
      }
      response.writeHead(404).end();
    });
    await listen(mcpServer);
    config.gateway.host = "127.0.0.1";
    config.gateway.port = Number(new URL(mcpEndpoint(mcpServer)).port);

    service.start(config, mcpEndpoint(mcpServer), {
      authHeader: coreGatewayAuthHeader,
      authToken: coreAuthToken,
      baseUrl: coreEndpoint
    });
    await writeCoreGatewayConfig(
      config,
      randomBytes(24).toString("base64url"),
      randomBytes(24).toString("base64url"),
      coreAuthToken,
      undefined,
      upstreamProxyUrl
    );
    enableGatewayDiagnostics(config.gateway.generatedConfigFile);

    const previousEntry = process.env.CCR_GATEWAY_ENTRY;
    process.env.CCR_GATEWAY_ENTRY = localGatewayEntry;
    try {
      child = spawnGatewayProcess(config, upstreamProxyUrl, randomUUID(), coreAuthToken);
    } finally {
      restoreEnv("CCR_GATEWAY_ENTRY", previousEntry);
    }
    capture(child.stdout, gatewayOutput);
    capture(child.stderr, gatewayOutput);
    child.on("error", (error) => gatewayOutput.push(`child process error: ${error.message}\n`));
    await waitForGateway(coreEndpoint, child, gatewayOutput);
    console.log(`LIVE_PHASE gateway_ready endpoint=${coreEndpoint} proxy=${upstreamProxyUrl ? "configured" : "direct"}`);

    const listed = await mcpRequest(mcpServer, "tools/list");
    assert.deepEqual(
      listed.tools.map((tool) => tool.name),
      [toolNames.imageGenerate, toolNames.imageEdit, toolNames.videoGenerate, toolNames.jobGet, toolNames.jobCancel]
    );
    console.log(`LIVE_PHASE fusion_tools_discovered count=${listed.tools.length}`);

    const imageJob = parseToolResult(await mcpRequest(mcpServer, "tools/call", {
      arguments: {
        aspect_ratio: "1:1",
        idempotency_key: `ccr-live-image-${randomUUID()}`,
        prompt: "A clean integration-test illustration: one glossy teal sphere floating over a soft white background, subtle studio shadow, no text, square composition."
      },
      name: toolNames.imageGenerate
    }));
    assertSucceededArtifact(imageJob, "image/");
    await assertArtifactUrl(imageJob.artifact.url, imageJob.artifact.sizeBytes);
    console.log(`LIVE_PHASE image_succeeded id=${imageJob.id} bytes=${imageJob.artifact.sizeBytes} mime=${imageJob.artifact.mimeType}`);

    let videoJob = parseToolResult(await mcpRequest(mcpServer, "tools/call", {
      arguments: {
        duration: 6,
        idempotency_key: `ccr-live-video-${randomUUID()}`,
        prompt: "A glossy teal sphere slowly rotates while floating over a soft white studio background, fixed camera, gentle shadow movement, no text.",
        resolution: "480p"
      },
      name: toolNames.videoGenerate
    }));
    assert.ok(["queued", "running"].includes(videoJob.status), JSON.stringify(videoJob));
    console.log(`LIVE_PHASE video_submitted id=${videoJob.id} status=${videoJob.status}`);
    videoJob = await waitForVideo(mcpServer, toolNames.jobGet, videoJob.id);
    assertSucceededArtifact(videoJob, "video/");
    await assertArtifactUrl(videoJob.artifact.url, videoJob.artifact.sizeBytes);
    console.log(`LIVE_PHASE video_succeeded id=${videoJob.id} bytes=${videoJob.artifact.sizeBytes} mime=${videoJob.artifact.mimeType}`);

    console.log(`CCR_FUSION_LIVE_RESULT=${JSON.stringify({
      aiGatewayEntry: localGatewayEntry,
      artifactRoot,
      image: publicArtifactSummary(imageJob),
      provider: providerName,
      video: publicArtifactSummary(videoJob)
    })}`);
    completed = true;
  } catch (error) {
    const diagnostics = sanitizeGatewayOutput(gatewayOutput.join(""));
    if (diagnostics) console.error(`LOCAL_AI_GATEWAY_DIAGNOSTICS\n${diagnostics}`);
    if (process.env.CCR_LIVE_KEEP_CONFIG === "1") console.error(`LIVE_CONFIG_ROOT=${configRoot}`);
    throw error;
  } finally {
    await service.stop();
    if (mcpServer) await close(mcpServer);
    if (child && child.exitCode === null && !child.killed) child.kill();
    if (child && child.exitCode === null) await waitForExit(child, 5000);
    if (completed || process.env.CCR_LIVE_KEEP_CONFIG !== "1") {
      rmSync(configRoot, { force: true, recursive: true });
    }
  }
});

function materializeProviderPlugins(templates, providerName, providerId, protocol) {
  const slug = providerName.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "provider";
  const replacements = {
    __CCR_PROVIDER_INTERNAL_NAME__: `${providerId}::${protocol}`,
    __CCR_PROVIDER_NAME__: providerName,
    __CCR_PROVIDER_NAME_SLUG__: slug
  };
  return templates.map((template) => replacePlaceholders(template, replacements));
}

function enableGatewayDiagnostics(file) {
  const generated = JSON.parse(readFileSync(file, "utf8"));
  generated.logging = { accessLog: false, enabled: true, level: "info" };
  const runtimeRoot = path.join(process.cwd(), ".test-dist", "core", "runtime");
  for (const plugin of generated.plugins ?? []) {
    if (plugin.key === "ccr-upstream-header-sanitizer") {
      plugin.modulePath = path.join(runtimeRoot, "upstream-header-sanitizer.js");
    }
  }
  for (const server of generated.agent?.mcpServers ?? []) {
    if (server.name === "ccr-media-tools") {
      server.args = [path.join(runtimeRoot, "media-tools-proxy-mcp.js")];
    }
  }
  writeFileSync(file, `${JSON.stringify(generated, null, 2)}\n`, { mode: 0o600 });
}

function replacePlaceholders(value, replacements) {
  if (typeof value === "string") {
    return Object.entries(replacements).reduce((result, [search, replacement]) => result.split(search).join(replacement), value);
  }
  if (Array.isArray(value)) return value.map((item) => replacePlaceholders(item, replacements));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replacePlaceholders(item, replacements)]));
  }
  return value;
}

async function availablePort() {
  const server = createServer();
  await listen(server);
  const port = server.address().port;
  await close(server);
  return port;
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

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function mcpEndpoint(server) {
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function mcpRequest(server, method, params) {
  const response = await fetch(`${mcpEndpoint(server)}/mcp`, {
    body: JSON.stringify({ id: randomUUID(), jsonrpc: "2.0", method, ...(params ? { params } : {}) }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  if (payload.error) throw new Error(`MCP ${method} failed: ${payload.error.message}`);
  return payload.result;
}

function parseToolResult(result) {
  assert.ok(Array.isArray(result.content));
  return JSON.parse(result.content[0].text);
}

function assertSucceededArtifact(job, mimePrefix) {
  assert.equal(job.status, "succeeded", JSON.stringify(job));
  assert.ok(job.artifact, JSON.stringify(job));
  assert.ok(job.artifact.mimeType.startsWith(mimePrefix), JSON.stringify(job.artifact));
  assert.ok(job.artifact.sizeBytes > 0);
  assert.ok(existsSync(job.artifact.localPath), job.artifact.localPath);
  assert.equal(statSync(job.artifact.localPath).size, job.artifact.sizeBytes);
}

async function assertArtifactUrl(url, expectedBytes) {
  const response = await fetch(url, { headers: { range: "bytes=0-31" } });
  assert.equal(response.status, 206);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.byteLength, Math.min(32, expectedBytes));
}

async function waitForVideo(server, jobGetToolName, jobId) {
  const deadline = Date.now() + 13 * 60 * 1000;
  let lastStatus;
  let lastProgressAt = 0;
  while (Date.now() < deadline) {
    const job = parseToolResult(await mcpRequest(server, "tools/call", {
      arguments: { job_id: jobId },
      name: jobGetToolName
    }));
    if (job.status !== lastStatus || Date.now() - lastProgressAt >= 30000) {
      console.log(`LIVE_PHASE video_poll id=${jobId} status=${job.status}`);
      lastStatus = job.status;
      lastProgressAt = Date.now();
    }
    if (["succeeded", "failed", "canceled"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`Timed out waiting for video job ${jobId}`);
}

async function waitForGateway(endpoint, child, gatewayOutput) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      throw new Error(`Local ai-gateway exited with code ${child.exitCode}: ${sanitizeGatewayOutput(gatewayOutput.join(""))}`);
    }
    if (await isCoreGatewayHealthy(endpoint)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Local ai-gateway did not become healthy: ${sanitizeGatewayOutput(gatewayOutput.join(""))}`);
}

function capture(stream, output) {
  stream?.on("data", (chunk) => {
    output.push(chunk.toString());
    if (output.length > 400) output.splice(0, output.length - 400);
  });
}

function sanitizeGatewayOutput(value) {
  return value
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{40,}/g, "[redacted]")
    .trim()
    .slice(-12000);
}

function publicArtifactSummary(job) {
  return {
    id: job.id,
    localPath: job.artifact.localPath,
    mimeType: job.artifact.mimeType,
    sha256: job.artifact.sha256,
    sizeBytes: job.artifact.sizeBytes
  };
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
