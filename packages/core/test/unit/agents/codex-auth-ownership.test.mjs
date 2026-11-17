import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { quarantineLegacyCodexAuth } from "@ccr/core/agents/codex/legacy-auth.ts";
import { codexAppAccountNetworkEnv, codexAppUsesSharedAccount, codexProfileEnvForTest } from "@ccr/core/agents/codex/app-launch.ts";

function auth(token = "valid-test-token") { return JSON.stringify({ auth_mode: "chatgpt", tokens: { access_token: token, refresh_token: "refresh-test" } }); }

test("#1879 retiring a managed auth copy never rewrites the shared login and is idempotent", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-auth-owner-"));
  try {
    const shared = path.join(dir, "personal", "auth.json");
    const home = path.join(dir, "managed", "profiles", "one", "codex");
    mkdirSync(path.dirname(shared), { recursive: true }); mkdirSync(home, { recursive: true });
    writeFileSync(shared, auth()); writeFileSync(path.join(home, "auth.json"), auth());
    const backup = quarantineLegacyCodexAuth(path.join(dir, "managed"), home);
    assert.ok(backup); assert.equal(existsSync(path.join(home, "auth.json")), false);
    assert.equal(readFileSync(backup, "utf8"), auth()); assert.equal(readFileSync(shared, "utf8"), auth());
    if (process.platform !== "win32") assert.equal(lstatSync(backup).mode & 0o777, 0o600);
    assert.equal(quarantineLegacyCodexAuth(path.join(dir, "managed"), home), undefined);
    const next = shared + ".tmp"; writeFileSync(next, auth("rotated-token")); renameSync(next, shared);
    assert.equal(readFileSync(backup, "utf8"), auth(), "retired snapshots cannot refresh or change the owner's chain");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("#1879 migration moves a legacy symlink itself and refuses a shared home outside CCR", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-auth-link-owner-"));
  try {
    const root = path.join(dir, "managed"); const home = path.join(root, "profile"); const personal = path.join(dir, "personal");
    mkdirSync(home, { recursive: true }); mkdirSync(personal); writeFileSync(path.join(personal, "auth.json"), auth());
    symlinkSync(path.join(personal, "auth.json"), path.join(home, "auth.json"));
    const backup = quarantineLegacyCodexAuth(root, home);
    assert.ok(lstatSync(backup).isSymbolicLink()); assert.equal(readFileSync(path.join(personal, "auth.json"), "utf8"), auth());
    assert.throws(() => quarantineLegacyCodexAuth(root, personal), /global shared-login scope/);
    assert.ok(existsSync(path.join(personal, "auth.json")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("#1881 shared accounts use the desktop's native backend connection, isolated accounts retain localhost", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-auth-network-"));
  const previous = process.env.CCR_CODEX_ISOLATED_IDENTITY;
  try {
    const home = path.join(dir, "shared"); mkdirSync(home); writeFileSync(path.join(home, "auth.json"), auth());
    const profile = { id: "shared", name: "Shared", agent: "codex", enabled: true, scope: "global", model: "P/m", codexHome: home };
    const inherited = { CODEX_API_BASE_URL: "https://localhost:8000", CCR_CODEX_WORKSPACE_BACKEND_ORIGIN: "https://localhost:8000", PRESERVED: "yes" };
    assert.equal(codexAppUsesSharedAccount(dir, profile), true);
    assert.deepEqual(codexAppAccountNetworkEnv(dir, profile, inherited), { PRESERVED: "yes" });
    assert.equal(inherited.CODEX_API_BASE_URL, "https://localhost:8000");
    assert.equal(codexAppAccountNetworkEnv(dir, { ...profile, scope: "ccr" }, inherited), inherited);
    process.env.CCR_CODEX_ISOLATED_IDENTITY = "1";
    assert.equal(codexProfileEnvForTest(profile, "/fake/ChatGPT").CCR_CODEX_ISOLATED_IDENTITY, "0", "global mode resets an inherited profile identity");
  } finally {
    if (previous === undefined) delete process.env.CCR_CODEX_ISOLATED_IDENTITY; else process.env.CCR_CODEX_ISOLATED_IDENTITY = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
