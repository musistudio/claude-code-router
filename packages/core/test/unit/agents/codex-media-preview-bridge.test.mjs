import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { codexElectronArgsForTest } from "@ccr/core/agents/codex/app-launch.ts";
import {
  codexMediaPreviewBridgeForTest,
  prepareCodexAppCdpUserDataDir,
  shouldEnableCodexMediaPreviewBridge
} from "@ccr/core/agents/codex/media-preview-bridge.ts";
import { waitForTcpListener } from "../../support/loopback-listener.mjs";

const token = "A".repeat(32);
const imageId = "123e4567-e89b-42d3-a456-426614174000";
const videoId = "223e4567-e89b-42d3-a456-426614174001";
const mismatchId = "323e4567-e89b-42d3-a456-426614174002";
const redirectId = "423e4567-e89b-42d3-a456-426614174003";
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const mp4 = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from("ftypisom", "ascii"),
  Buffer.alloc(12)
]);

test("Codex inline media bridge is enabled only for configured Fusion media and honors the kill switch", () => {
  const previous = process.env.CCR_CODEX_INLINE_VIDEO_PREVIEW;
  try {
    delete process.env.CCR_CODEX_INLINE_VIDEO_PREVIEW;
    assert.equal(shouldEnableCodexMediaPreviewBridge(true), true);
    assert.equal(shouldEnableCodexMediaPreviewBridge(false), false);
    process.env.CCR_CODEX_INLINE_VIDEO_PREVIEW = "off";
    assert.equal(shouldEnableCodexMediaPreviewBridge(true), false);
    process.env.CCR_CODEX_INLINE_VIDEO_PREVIEW = "1";
    assert.equal(shouldEnableCodexMediaPreviewBridge(true), true);
  } finally {
    if (previous === undefined) delete process.env.CCR_CODEX_INLINE_VIDEO_PREVIEW;
    else process.env.CCR_CODEX_INLINE_VIDEO_PREVIEW = previous;
  }
});

test("Codex App launch uses a random loopback DevTools port and removes stale discovery state", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-codex-cdp-"));
  try {
    const activePort = path.join(root, "DevToolsActivePort");
    writeFileSync(activePort, "49152\n/devtools/browser/stale\n");
    prepareCodexAppCdpUserDataDir(root);
    assert.throws(() => readFileSync(activePort), { code: "ENOENT" });

    const args = codexElectronArgsForTest(root);
    assert.ok(args.includes("--remote-debugging-port=0"));
    assert.ok(args.includes("--remote-debugging-address=127.0.0.1"));
    assert.ok(args.includes(`--user-data-dir=${root}`));
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("Codex media artifact URLs are restricted to the configured CCR origin, current path, UUID, and token", () => {
  const endpoint = "http://127.0.0.1:3457";
  const valid = `${endpoint}/__ccr/media/artifacts/${imageId}?token=${token}`;
  assert.deepEqual(codexMediaPreviewBridgeForTest.validateUrl(valid, endpoint), {
    artifactId: imageId,
    url: valid
  });
  assert.throws(() => codexMediaPreviewBridgeForTest.validateUrl(valid.replace("127.0.0.1", "localhost"), endpoint), /origin/);
  assert.throws(() => codexMediaPreviewBridgeForTest.validateUrl(valid.replace("/__ccr/media/", "/__ccr/grok-media/"), endpoint), /artifact path/);
  assert.throws(() => codexMediaPreviewBridgeForTest.validateUrl(valid.replace(imageId, "not-an-id"), endpoint), /identifier/);
  assert.throws(() => codexMediaPreviewBridgeForTest.validateUrl(`${valid}&extra=1`, endpoint), /access token/);
  assert.throws(() => codexMediaPreviewBridgeForTest.validateUrl(valid.replace(token, "short"), endpoint), /access token/);
});

test("Codex page bootstrap uses Blob media, semantic response hooks, readiness gating, and no CSP bypass", () => {
  const script = codexMediaPreviewBridgeForTest.injectionScript("http://127.0.0.1:3457");
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /__ccrMediaPreviewRequest/);
  assert.match(script, /MutationObserver/);
  assert.match(script, /data-response-annotation-conversation/);
  assert.match(script, /Open Web preview/);
  assert.match(script, /createObjectURL/);
  assert.match(script, /canplay/);
  assert.doesNotMatch(script, /innerHTML/);
  assert.doesNotMatch(script, /setBypassCSP/);
  assert.doesNotMatch(script, /autoplay\s*=/);
});

test("Codex media loader accepts signed image and video bytes and rejects redirects and MIME mismatches", async (t) => {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const id = requestUrl.pathname.split("/").at(-1);
    if (requestUrl.searchParams.get("token") !== token) {
      response.writeHead(404).end();
      return;
    }
    if (id === imageId) {
      response.writeHead(200, { "content-length": png.byteLength, "content-type": "image/png" });
      response.end(png);
      return;
    }
    if (id === videoId) {
      response.writeHead(200, { "content-length": mp4.byteLength, "content-type": "video/mp4" });
      response.end(mp4);
      return;
    }
    if (id === mismatchId) {
      response.writeHead(200, { "content-length": png.byteLength, "content-type": "video/mp4" });
      response.end(png);
      return;
    }
    if (id === redirectId) {
      response.writeHead(302, { location: `/__ccr/media/artifacts/${imageId}?token=${token}` });
      response.end();
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  await waitForTcpListener(server);
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}`;
  const artifactUrl = (id) => `${endpoint}/__ccr/media/artifacts/${id}?token=${token}`;

  const image = await codexMediaPreviewBridgeForTest.loadArtifact(artifactUrl(imageId), endpoint);
  assert.equal(image.mimeType, "image/png");
  assert.deepEqual(image.bytes, png);
  const video = await codexMediaPreviewBridgeForTest.loadArtifact(artifactUrl(videoId), endpoint);
  assert.equal(video.mimeType, "video/mp4");
  assert.deepEqual(video.bytes, mp4);
  await assert.rejects(codexMediaPreviewBridgeForTest.loadArtifact(artifactUrl(mismatchId), endpoint), /did not match/);
  await assert.rejects(codexMediaPreviewBridgeForTest.loadArtifact(artifactUrl(redirectId), endpoint), /request failed/);
});
