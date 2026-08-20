import { expect, test, type APIRequestContext } from "@playwright/test";
import { disposeCliWebRuntime, startCliWebServer, type CliWebRuntime } from "./cli-web-runtime";

const cliWebAuthToken = "playwright-cli-web-auth-token";

let runtime: CliWebRuntime | undefined;

test.beforeAll(async () => {
  runtime = await startCliWebServer(cliWebAuthToken);
});

test.afterAll(async () => {
  if (!runtime) {
    return;
  }
  await disposeCliWebRuntime(runtime);
  runtime = undefined;
});

test("uses CCR_WEB_AUTH_TOKEN for CLI web authentication", async () => {
  const current = requireRuntime();
  expect(current.token).toBe(cliWebAuthToken);
});

test("serves the management UI in a browser", async ({ page }) => {
  const current = requireRuntime();
  await page.goto(`${current.baseUrl}/?ccr_web_token=${current.token}`);
  await expect(page).toHaveTitle("Claude Code Router");
  await expect(page.locator("#root")).toBeAttached();
  await expect(page.locator("body")).toContainText(/Configure provider|Connect agent|Let's start/, { timeout: 15_000 });
  await expect(page.evaluate(() => Boolean(window.ccr?.getAppInfo))).resolves.toBe(true);
  await expect(page.evaluate(async () => {
    const presets = await window.ccr?.getProviderPresets?.();
    return presets?.map((preset) => preset.id) ?? [];
  })).resolves.toContain("openai");

  await page.getByRole("button", { name: /Select preset provider|选择 预设供应商/ }).first().click();
  await expect(page.getByRole("option", { name: "OpenAI" })).toBeVisible();
});

test("serves static assets used by the web UI", async ({ request }) => {
  const current = requireRuntime();
  await expectStaticAsset(request, current.baseUrl, "/assets/main.js", "text/javascript");
  await expectStaticAsset(request, current.baseUrl, "/assets/main.css", "text/css");
  await expectStaticAsset(request, current.baseUrl, "/assets/web-client-bridge.js", "text/javascript");
});

test("handles authenticated web RPC requests", async ({ request }) => {
  const current = requireRuntime();
  const response = await request.post(`${current.baseUrl}/api/ccr/rpc`, {
    data: { args: [], method: "getAppInfo" },
    headers: {
      "x-ccr-web-auth": current.token
    }
  });
  const payload = await response.json();

  expect(response.status()).toBe(200);
  expect(payload.ok).toBe(true);
  expect(payload.value.name).toBe("Claude Code Router");
  expect(payload.value.configDir).toContain(current.testHome);
  expect(payload.value.configDbFile).toContain("config.sqlite");
  expect(payload.value.usageDbFile).toContain("usage.sqlite");
});

test("rejects RPC requests without the web auth token", async ({ request }) => {
  const current = requireRuntime();
  const response = await request.post(`${current.baseUrl}/api/ccr/rpc`, {
    data: { args: [], method: "getAppInfo" }
  });
  const payload = await response.json();

  expect(response.status()).toBe(401);
  expect(payload.ok).toBe(false);
});

async function expectStaticAsset(
  request: APIRequestContext,
  baseUrl: string,
  pathname: string,
  expectedContentType: string
) {
  const response = await request.head(`${baseUrl}${pathname}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain(expectedContentType);
  expect(Number(response.headers()["content-length"] ?? "0")).toBeGreaterThan(0);
}

function requireRuntime(): CliWebRuntime {
  if (!runtime) {
    throw new Error("CLI web runtime was not started.");
  }
  return runtime;
}
