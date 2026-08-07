import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("fires once when the access token changes on disk", async () => {
  const { startLocalOauthCredentialWatch } = await import("@ccr/core/gateway/core-runtime/local-oauth-watch.ts");
  const dir = mkdtempSync(path.join(tmpdir(), "oauth-watch-"));
  const file = path.join(dir, ".credentials.json");
  let token = "tok-old";
  writeFileSync(file, JSON.stringify({ claudeAiOauth: { accessToken: token } }));

  let calls = 0;
  const stop = startLocalOauthCredentialWatch({
    files: [file],
    readAccessToken: () => token,
    onAccessTokenChanged: () => { calls += 1; },
    debounceMs: 20
  });

  token = "tok-new";
  writeFileSync(file, JSON.stringify({ claudeAiOauth: { accessToken: token } }));
  await sleep(300);
  assert.equal(calls, 1);

  stop();
  rmSync(dir, { recursive: true, force: true });
});

test("does not fire when the token is unchanged or becomes unreadable", async () => {
  const { startLocalOauthCredentialWatch } = await import("@ccr/core/gateway/core-runtime/local-oauth-watch.ts");
  const dir = mkdtempSync(path.join(tmpdir(), "oauth-watch-"));
  const file = path.join(dir, ".credentials.json");
  let token = "tok-same";
  writeFileSync(file, "{}");

  let calls = 0;
  const stop = startLocalOauthCredentialWatch({
    files: [file],
    readAccessToken: () => token,
    onAccessTokenChanged: () => { calls += 1; },
    debounceMs: 20
  });

  writeFileSync(file, '{"touched":true}');
  await sleep(250);
  token = undefined;
  writeFileSync(file, '{"touched":2}');
  await sleep(250);
  assert.equal(calls, 0);

  stop();
  rmSync(dir, { recursive: true, force: true });
});

test("close() stops future notifications", async () => {
  const { startLocalOauthCredentialWatch } = await import("@ccr/core/gateway/core-runtime/local-oauth-watch.ts");
  const dir = mkdtempSync(path.join(tmpdir(), "oauth-watch-"));
  const file = path.join(dir, ".credentials.json");
  let token = "tok-1";
  writeFileSync(file, "{}");

  let calls = 0;
  const stop = startLocalOauthCredentialWatch({
    files: [file],
    readAccessToken: () => token,
    onAccessTokenChanged: () => { calls += 1; },
    debounceMs: 20
  });

  stop();
  token = "tok-2";
  writeFileSync(file, '{"touched":true}');
  await sleep(250);
  assert.equal(calls, 0);

  rmSync(dir, { recursive: true, force: true });
});
