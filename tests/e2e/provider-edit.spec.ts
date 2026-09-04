import { expect, test, type Page } from "@playwright/test";
import { disposeCliWebRuntime, startCliWebServer, type CliWebRuntime } from "./cli-web-runtime";

// The web UI defaults to the system language, and this suite asserts strings
// that are localized ("Providers" nav, the "Edit <name>" provider button
// aria-label). Pin the context to English so the spec is independent of the
// host's locale instead of hard-coding dual-language selectors.
test.use({ locale: "en-US" });

const cliWebAuthToken = "playwright-provider-edit-token";

// A provider shaped like a hand-written config entry: the dialog renders none of
// extraBody, extraHeaders or transformer, so saving must not drop them.
const configOnlyProvider = {
  api_base_url: "http://127.0.0.1:9/v1",
  api_key: "sk-config-only",
  extraBody: { default: { reasoning_effort: "high" } },
  extraHeaders: { "x-tenant": "acme" },
  models: ["config-only-model"],
  name: "config-only",
  transformer: { use: ["openrouter"] },
  type: "openai_chat_completions"
};

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

test("keeps config-only provider fields when the provider is saved from the dialog", async ({ page }) => {
  const current = requireRuntime();

  await page.goto(`${current.baseUrl}/?ccr_web_token=${current.token}`);
  await waitForBridge(page);
  await page.evaluate(async (provider) => {
    const config = await window.ccr!.getConfig();
    config.Providers = [provider];
    await window.ccr!.saveConfig(config);
    await window.ccr!.setOnboardingFinished?.();
  }, configOnlyProvider);

  await page.reload();
  await waitForBridge(page);

  await page.getByRole("button", { name: "Providers", exact: true }).click();
  const editButton = page.locator(`button[aria-label="Edit ${configOnlyProvider.name}"]:visible`).first();
  await editButton.click();

  const saveButton = page.getByRole("button", { name: /^(Save|保存)$/ });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(saveButton).toBeHidden();

  await expect.poll(async () => page.evaluate(async () => {
    const config = await window.ccr!.getConfig();
    const provider = config.Providers[0];
    return {
      extraBody: provider?.extraBody,
      extraHeaders: provider?.extraHeaders,
      transformer: provider?.transformer
    };
  })).toEqual({
    extraBody: configOnlyProvider.extraBody,
    extraHeaders: configOnlyProvider.extraHeaders,
    transformer: configOnlyProvider.transformer
  });
});

test("edits extraBody from the advanced settings section", async ({ page }) => {
  const current = requireRuntime();

  await page.goto(`${current.baseUrl}/?ccr_web_token=${current.token}`);
  await waitForBridge(page);
  await page.evaluate(async (provider) => {
    const config = await window.ccr!.getConfig();
    config.Providers = [provider];
    await window.ccr!.saveConfig(config);
    await window.ccr!.setOnboardingFinished?.();
  }, configOnlyProvider);

  await page.reload();
  await waitForBridge(page);

  await page.getByRole("button", { name: "Providers", exact: true }).click();
  await page.locator(`button[aria-label="Edit ${configOnlyProvider.name}"]:visible`).first().click();
  await page.getByRole("button", { name: /^(Advanced settings|高级设置)$/ }).click();

  // The box opens pre-filled with what the config already carries.
  const extraBodyBox = page.getByLabel(/Extra request body|附加请求体/);
  await expect(extraBodyBox).toHaveValue(JSON.stringify(configOnlyProvider.extraBody, null, 2));

  await extraBodyBox.fill('{ "default": { "reasoning_effort": "max" } }');
  const saveButton = page.getByRole("button", { name: /^(Save|保存)$/ });
  await saveButton.click();
  await expect(saveButton).toBeHidden();

  await expect.poll(async () => page.evaluate(async () => {
    const config = await window.ccr!.getConfig();
    return config.Providers[0]?.extraBody;
  })).toEqual({ default: { reasoning_effort: "max" } });
});

test("refuses to save a malformed advanced JSON box", async ({ page }) => {
  const current = requireRuntime();

  await page.goto(`${current.baseUrl}/?ccr_web_token=${current.token}`);
  await waitForBridge(page);
  await page.evaluate(async (provider) => {
    const config = await window.ccr!.getConfig();
    config.Providers = [provider];
    await window.ccr!.saveConfig(config);
    await window.ccr!.setOnboardingFinished?.();
  }, configOnlyProvider);

  await page.reload();
  await waitForBridge(page);

  await page.getByRole("button", { name: "Providers", exact: true }).click();
  await page.locator(`button[aria-label="Edit ${configOnlyProvider.name}"]:visible`).first().click();
  await page.getByRole("button", { name: /^(Advanced settings|高级设置)$/ }).click();
  await page.getByLabel(/Extra request body|附加请求体/).fill("{ not json");
  await page.getByRole("button", { name: /^(Save|保存)$/ }).click();

  await expect(page.getByText(/Extra request body JSON is invalid|附加请求体不是合法的 JSON/)).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => {
    const config = await window.ccr!.getConfig();
    return config.Providers[0]?.extraBody;
  })).toEqual(configOnlyProvider.extraBody);
});

async function waitForBridge(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.ccr?.getConfig), undefined, { timeout: 20_000 });
}

function requireRuntime(): CliWebRuntime {
  if (!runtime) {
    throw new Error("CLI web runtime was not started.");
  }
  return runtime;
}
