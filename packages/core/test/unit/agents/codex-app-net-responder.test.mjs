import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  codexAppApiBaseUrl,
  codexVirtualAccountRoutes,
  ensureCodexAppNetResponder,
  matchCodexVirtualRoute,
  startCodexAppNetResponder
} from "@ccr/core/agents/codex/app-net-responder.ts";
import { codexAppNetResponderEnv, codexElectronArgsForTest } from "@ccr/core/agents/codex/app-launch.ts";

test("virtual account routes match the gated Codex desktop endpoints", () => {
  const routes = codexVirtualAccountRoutes();
  assert.equal(matchCodexVirtualRoute("/wham/accounts/check", routes)?.prefix, "/wham/accounts/check");
  assert.equal(matchCodexVirtualRoute("/accounts/ccr-virtual-account/settings", routes)?.pattern, "^/accounts/[^/]+/settings$");
  assert.equal(matchCodexVirtualRoute("/accounts/optimized/check", routes)?.prefix, "/accounts/optimized/check");
  assert.equal(matchCodexVirtualRoute("/accounts/check/v4-2023-04-27", routes)?.prefix, "/accounts/check/");
  assert.equal(matchCodexVirtualRoute("/backend-api/accounts/check/v4-2023-04-27", routes)?.prefix, "/backend-api/accounts/check/");
  assert.equal(matchCodexVirtualRoute("/backend-api/conversation", routes), undefined);
  assert.equal(matchCodexVirtualRoute("https://chatgpt.com/wham/usage", routes), undefined);
});

test("account inventory exposes the requesting account in record form", () => {
  const routes = codexVirtualAccountRoutes();
  const route = matchCodexVirtualRoute("/accounts/check/v4-2023-04-27", routes);
  const inventory = route?.bodyFor?.({ accountId: "acct-9" });
  const entry = inventory?.accounts?.["acct-9"];
  assert.equal(entry?.account?.account_id, "acct-9");
  assert.equal(entry?.account?.is_deactivated, false);
  assert.equal(entry?.account?.account_user_role, "account-owner");
  assert.equal(entry?.account?.structure, "personal");
  assert.equal(entry?.account?.plan_type, "plus");
  assert.equal(entry?.account?.is_zdr, false);
  assert.equal(typeof entry?.account?.account_user_id, "string");
  assert.equal(entry?.can_access_with_session, true);
  assert.deepEqual(inventory?.account_ordering, ["acct-9"]);
});

test("optimized account check returns the single account detail consumed by the composer", () => {
  const details = matchCodexVirtualRoute("/accounts/optimized/check")?.bodyFor?.({ accountId: "acct-9" });
  assert.equal(details.accounts, undefined);
  assert.equal(details.account.account_id, "acct-9");
  // The desktop trial/view-only selector dereferences account_user as soon
  // as the query resolves; an inventory here caused the fatal is_trial error.
  assert.equal(details.account_user.is_trial === true || details.account_user.seat_type === "view_only", false);
  assert.equal(details.entitlement.has_active_subscription, true);
  assert.deepEqual(details.features, []);
  const inventory = matchCodexVirtualRoute("/accounts/check/v4-2023-04-27")?.bodyFor?.({ accountId: "acct-9" });
  assert.deepEqual(inventory.accounts["acct-9"], details);
});

test("concurrent profile opens share a ready responder and recover after a port conflict", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-net-responder-lifecycle-"));
  const logPath = path.join(dir, "responder.log");
  const occupied = await startCodexAppNetResponder({ listenPort: 0, logPath });
  const port = occupied.port;
  let responder;
  try {
    await assert.rejects(ensureCodexAppNetResponder({ listenPort: port, logPath }), { code: "EADDRINUSE" });
    occupied.close();
    const pending = ensureCodexAppNetResponder({ listenPort: port, logPath });
    assert.equal(ensureCodexAppNetResponder({ listenPort: port, logPath }), pending);
    responder = await pending;
    assert.equal(await ensureCodexAppNetResponder({ listenPort: port, logPath }), responder);
    const inventory = await fetch(`${responder.baseUrl}/accounts/check/v4-2023-04-27`, {
      headers: { "chatgpt-account-id": "acct-9" }
    }).then((response) => response.json());
    assert.equal(inventory.accounts["acct-9"].account.plan_type, "plus");
    const optimized = await fetch(`${responder.baseUrl}/accounts/optimized/check`, {
      headers: { "chatgpt-account-id": "acct-9" }
    }).then((response) => response.json());
    assert.equal(optimized.account.account_id, "acct-9");
    assert.equal(optimized.account_user.is_trial, false);
  } finally {
    occupied.close();
    responder?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("virtual account responses keep the workspace policy machinery hidden", () => {
  const routes = codexVirtualAccountRoutes();
  const settings = matchCodexVirtualRoute("/accounts/x/settings", routes)?.body;
  assert.deepEqual(settings?.beta_settings, []);
  const accounts = matchCodexVirtualRoute("/wham/accounts/check", routes)?.bodyFor?.({ accountId: "acct-9" });
  assert.equal(accounts?.accounts?.[0]?.structure, "personal");
  assert.equal(accounts?.accounts?.[0]?.can_access_with_session, true);
  assert.equal(accounts?.accounts?.[0]?.id, "acct-9");
});

test("responder serves virtual routes over loopback HTTP and records misses", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-net-responder-"));
  const logPath = path.join(dir, "responder.log");
  const responder = await startCodexAppNetResponder({ listenPort: 0, logPath });
  try {
    const accounts = await fetch(`${responder.baseUrl}/wham/accounts/check`, {
      headers: { "chatgpt-account-id": "acct-9" }
    });
    assert.equal(accounts.status, 200);
    const accountsBody = await accounts.json();
    assert.equal(accountsBody.accounts[0].id, "acct-9");

    const settings = await fetch(`${responder.baseUrl}/accounts/ccr-virtual-account/settings`);
    assert.equal(settings.status, 200);
    assert.deepEqual((await settings.json()).beta_settings, []);

    const missed = await fetch(`${responder.baseUrl}/wham/usage`);
    assert.equal(missed.status, 404);

    const devicecheck = await fetch(`${responder.baseUrl}/devicecheck`, { method: "POST", body: "{}" });
    assert.equal(devicecheck.status, 200);
    assert.match(devicecheck.headers.get("set-cookie") || "", /_devicecheck=ccr-virtual-device/);
  } finally {
    responder.close();
  }
  assert.ok(existsSync(logPath));
  const entries = readFileSync(logPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.ok(entries.some((entry) => entry.event === "responder-started"));
  assert.ok(entries.some((entry) => entry.event === "virtual-response" && entry.url === "/wham/accounts/check"));
  assert.ok(entries.some((entry) => entry.event === "not-found" && entry.url === "/wham/usage"));
});

test("codex app env points the desktop API base at the loopback responder", () => {
  assert.equal(codexAppApiBaseUrl(), "http://localhost:8000");
  assert.equal(codexAppApiBaseUrl(8000), "http://localhost:8000");
  assert.deepEqual(codexAppNetResponderEnv("codex", 8000), { CODEX_API_BASE_URL: "http://localhost:8000" });
  assert.deepEqual(codexAppNetResponderEnv("codex", undefined), {});
  assert.deepEqual(codexAppNetResponderEnv("zcode", 8000), {});
});

test("codex electron args never carry debug injection switches", () => {
  const args = codexElectronArgsForTest("/tmp/user-data");
  assert.ok(args.includes("--remote-debugging-port=0"));
  assert.ok(args.every((arg) => !arg.startsWith("--inspect") && !arg.startsWith("--proxy-server") && !arg.startsWith("--ignore-certificate")));
});
