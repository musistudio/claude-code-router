import { expect, test, type APIRequestContext } from "@playwright/test";
import { disposeCliWebRuntime, startCliWebServer, type CliWebRuntime } from "./cli-web-runtime";

test.use({ locale: "en-US", ...(process.env.CCR_TEST_BROWSER_CHANNEL ? { channel: process.env.CCR_TEST_BROWSER_CHANNEL } : {}) });

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

test("authenticates before loading saved configuration and recovers from expired tokens", async ({ page, request }) => {
  const { baseUrl, token } = requireRuntime();
  const rpc = async (method: string, args: unknown[] = []) => {
    const response = await request.post(`${baseUrl}/api/ccr/rpc`, { data: { method, args }, headers: { "x-ccr-web-auth": token } });
    expect(response.status()).toBe(200);
    return (await response.json()).value;
  };
  const config = await rpc("getConfig");
  config.Providers = [{ id: "saved", name: "Saved Provider", models: ["saved-model"], type: "openai_chat_completions", api_base_url: "http://127.0.0.1:9/v1", api_key: "synthetic-provider-key" }];
  await rpc("saveConfig", [config, { applyProfile: false }]);
  await rpc("setOnboardingFinished");
  const methods: string[] = [];
  page.on("request", request => {
    if (request.url().endsWith("/api/ccr/rpc")) methods.push(request.postDataJSON().method);
  });
  const dialog = page.getByRole("dialog", { name: "Management authentication" });
  const input = page.getByLabel("Management token", { exact: true });
  await page.goto(baseUrl);
  await expect(dialog).toBeVisible();
  expect(methods.every(method => method === "getAppInfo")).toBe(true);
  await expect(input).toHaveAttribute("type", "password");
  await input.fill("incorrect-token");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("missing or invalid");
  expect(await page.evaluate(() => sessionStorage.getItem("ccr.webAuthToken"))).toBeNull();
  expect(methods).not.toContain("saveConfig");
  await input.fill(token);
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("body")).toContainText("Overview");
  await page.reload();
  await expect(page.locator("body")).toContainText("Overview");
  await expect(dialog).not.toBeVisible();
  await page.goto(`${baseUrl}/?ccr_web_token=expired-token`);
  await expect(dialog).toBeVisible();
  expect(page.url()).not.toContain("ccr_web_token");
  await page.reload(); // The invalid session token also requires authentication.
  await expect(dialog).toBeVisible();
  await input.fill(token);
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator("body")).toContainText("Overview");
  await page.route("**/api/ccr/rpc", route => route.fulfill({ status: 401, json: { ok: false, error: { message: "Token expired" } } }));
  await expect(dialog).toBeVisible();
  await page.unroute("**/api/ccr/rpc");
  await input.fill(token);
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator("body")).toContainText("Overview");
  expect((await rpc("getConfig")).Providers.map((provider: { name: string }) => provider.name)).toEqual(["Saved Provider"]);
  expect(methods).not.toContain("saveConfig");
});

test("keeps startup failures outside onboarding and retries the existing token", async ({ page }) => {
  const { baseUrl, token } = requireRuntime();
  await page.route("**/api/ccr/rpc", route => route.fulfill({ status: 503, json: { ok: false, error: { message: "Unavailable" } } }));
  await page.goto(`${baseUrl}/?ccr_web_token=${token}`);
  const dialog = page.getByRole("dialog", { name: "Management authentication" });
  await expect(dialog.getByRole("alert")).toContainText("Unable to reach");
  await page.unroute("**/api/ccr/rpc");
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("body")).toContainText("Overview");
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
