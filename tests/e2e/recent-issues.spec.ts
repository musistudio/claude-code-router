import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { disposeCliWebRuntime, startCliWebServer, type CliWebRuntime } from "./cli-web-runtime";

test.use({ locale: "en-US", ...(process.env.CCR_TEST_BROWSER_CHANNEL ? { channel: process.env.CCR_TEST_BROWSER_CHANNEL } : {}) });
let runtime: CliWebRuntime;
test.beforeAll(async () => { runtime = await startCliWebServer("issue-audit-test-token"); });
test.afterAll(async () => { if (runtime) await disposeCliWebRuntime(runtime); });

test("#1825/#1826/#1819 stale RPC saves preserve providers, rules, fallback and detected endpoints", async ({ request }) => {
  const rpc = async (method: string, args: unknown[] = []) => request.post(`${runtime.baseUrl}/api/ccr/rpc`, { headers: { "x-ccr-web-auth": runtime.token }, data: { method, args } });
  const stale = (await (await rpc("getConfig")).json()).value;
  const peer = structuredClone(stale);
  const provider = { id: "issue-peer", name: "Peer Provider", api_base_url: "http://127.0.0.1:9/api/v3", type: "openai_chat_completions", models: ["old", "new"], capabilities: [{ type: "openai_chat_completions", baseUrl: "http://127.0.0.1:9/api/v3", source: "detected" }] };
  peer.Providers = [provider];
  peer.Router.rules = [{ id: "peer-rule", name: "Peer rule", type: "condition", enabled: true, condition: { left: "request.body.model", operator: "==", right: "alias" }, rewrite: { key: "request.body.model", operation: "set", value: "Peer Provider/new" } }];
  peer.Router.fallback = { mode: "model-chain", models: ["Peer Provider/old", "Peer Provider/new"], retryCount: 1 };
  const peerSave = await rpc("saveConfig", [peer, { applyProfile: false }]);
  expect(peerSave.status()).toBe(200);
  const saved = (await peerSave.json()).value;
  const conflict = await rpc("saveConfig", [{ ...stale, autoStart: !stale.autoStart }, { applyProfile: false }]);
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).ok).toBe(false);
  const latest = (await (await rpc("getConfig")).json()).value;
  expect(latest.Providers).toEqual(saved.Providers);
  expect(latest.Router).toEqual(saved.Router);
  expect(latest.Providers[0].models).toEqual(["old", "new"]);
  expect(latest.Providers[0].capabilities).toEqual(expect.arrayContaining([expect.objectContaining({ source: "detected", baseUrl: "http://127.0.0.1:9/api/v3" })]));
  const { configRevision, ...unversioned } = latest;
  expect((await rpc("saveConfig", [unversioned, { applyProfile: false }])).status()).toBe(409);
  expect((await rpc("saveConfig", [{ ...latest, autoStart: !latest.autoStart }, { applyProfile: false }])).status()).toBe(200);
});

test("#1800 seven heatmap rows fit their clipping ancestor across wide layouts and resizes", async ({ page }) => {
  await page.goto(`${runtime.baseUrl}/?ccr_web_token=${runtime.token}`);
  await expect.poll(() => page.evaluate(() => Boolean(window.ccr?.getConfig))).toBe(true);
  await page.evaluate(async () => {
    const config = await window.ccr!.getConfig();
    config.overviewWidgets = [{ enabled: true, id: "activity-audit", size: "4:2", type: "token-activity", variant: "heatmap" }];
    await window.ccr!.saveConfig(config, { applyProfile: false });
    await window.ccr!.setOnboardingFinished?.();
  });
  await page.reload();
  const grid = page.getByRole("img", { name: "Activity Tokens" });
  for (const width of [1200, 1920, 900, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(grid).toBeVisible();
    await expect.poll(async () => grid.evaluate(element => {
      const cells = [...element.querySelectorAll<HTMLElement>(".overview-activity-cell")];
      const rowCount = new Set(cells.map(cell => cell.style.gridRow)).size;
      let ancestor = element.parentElement;
      while (ancestor && getComputedStyle(ancestor).overflowY !== "hidden") ancestor = ancestor.parentElement;
      if (!ancestor) return { rowCount, clipped: -1 };
      const bounds = ancestor.getBoundingClientRect();
      return { rowCount, clipped: cells.filter(cell => { const r = cell.getBoundingClientRect(); return r.bottom > bounds.bottom + 0.5 || r.right > bounds.right + 0.5 || r.height <= 0; }).length };
    })).toEqual({ rowCount: 7, clipped: 0 });
  }
});

test("#1800 tray renderer shows all seven activity rows at narrow and wide widths", async ({ page }) => {
  // The web server publishes only the home document. Serve the built tray
  // document through Playwright while using the real CSS, JS and RPC bridge.
  const html = readFileSync(path.resolve("packages/ui/dist/renderer/pages/tray/index.html"), "utf8")
    .replace('<script type="module"', '<script src="/assets/web-client-bridge.js"></script><script type="module"');
  await page.route("**/pages/tray/index.html*", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto(`${runtime.baseUrl}/?ccr_web_token=${runtime.token}`);
  await expect.poll(() => page.evaluate(() => Boolean(window.ccr?.getConfig))).toBe(true);
  await page.evaluate(async () => {
    const config = await window.ccr!.getConfig();
    config.trayWidgets = [{ id: "activity", type: "activity" }];
    await window.ccr!.saveConfig(config, { applyProfile: false });
  });
  await page.goto(`${runtime.baseUrl}/pages/tray/index.html?ccr_web_token=${runtime.token}`);
  const grid = page.getByRole("img", { name: "Activity Tokens" });
  for (const width of [360, 680, 420]) {
    await page.setViewportSize({ width, height: 600 });
    await expect(grid).toBeVisible();
    await expect.poll(async () => grid.evaluate(element => {
      const cells = [...element.querySelectorAll<HTMLElement>("[data-ui-tooltip-trigger]")];
      return { rows: new Set(cells.map(cell => cell.style.gridRow)).size, clipped: cells.filter(cell => {
        const r = cell.getBoundingClientRect();
        return r.height <= 0 || r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5;
      }).length };
    })).toEqual({ rows: 7, clipped: 0 });
  }
});
