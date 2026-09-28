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

test("retries a failed provider creation without adding a duplicate", async ({ page }) => {
  await prepareProviderRegressionPage(page);
  const saves = await interceptProviderRpc(page, true);
  const dialog = await fillNewProvider(page, "Retry Provider");

  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Simulated provider save failure");
  await expect(dialog.getByRole("button", { name: "Done", exact: true })).toBeEnabled();
  expect(saves.attempts).toBe(1);
  expect(await persistedProviderNames(page)).toEqual([configOnlyProvider.name]);

  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => persistedProviderNames(page)).toEqual([configOnlyProvider.name, "Retry Provider"]);
  expect(saves.attempts).toBe(2);
  await page.reload();
  await waitForBridge(page);
  expect(await persistedProviderNames(page)).toEqual([configOnlyProvider.name, "Retry Provider"]);
});

test("discarding a failed provider creation never saves the abandoned draft", async ({ page }) => {
  await prepareProviderRegressionPage(page);
  const saves = await interceptProviderRpc(page, true);
  const dialog = await fillNewProvider(page, "Discarded Provider");

  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Simulated provider save failure");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Unsaved changes", exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(confirmation).toBeHidden();

  // Observe past the autosave debounce, including a real navigation, so a
  // rejected form candidate cannot leak into an unrelated settings save.
  await page.getByRole("button", { name: "Global Routing", exact: true }).click();
  await page.getByRole("button", { name: "Providers", exact: true }).click();
  expect(saves.attempts).toBe(1);
  expect(await persistedProviderNames(page)).toEqual([configOnlyProvider.name]);
  const extraSave = await page.waitForRequest((request) => {
    return request.url().endsWith("/api/ccr/rpc") && request.postDataJSON()?.method === "saveConfig";
  }, { timeout: 1500 }).then(() => true, (error: Error) => {
    if (error.name === "TimeoutError") return false;
    throw error;
  });
  expect(extraSave).toBe(false);
  expect(saves.attempts).toBe(1);
  await page.reload();
  await waitForBridge(page);
  expect(await persistedProviderNames(page)).toEqual([configOnlyProvider.name]);
});

test("renaming a provider in the dialog keeps saved routing and model references", async ({ page }) => {
  await prepareProviderRegressionPage(page, true);
  await interceptProviderRpc(page, false);
  await page.locator(`button[aria-label="Edit ${configOnlyProvider.name}"]:visible`).first().click();
  const dialog = page.getByRole("dialog", { name: "Edit Provider", exact: true });
  await dialog.getByLabel("Name", { exact: true }).fill("Renamed Provider");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect.poll(async () => page.evaluate(async () => {
    const config = await window.ccr!.getConfig();
    return {
      providerId: config.Providers[0]?.id,
      providerName: config.Providers[0]?.name,
      preferredProvider: config.preferredProvider,
      fallbackModels: config.Router.fallback.models,
      conditionModel: config.Router.rules[0]?.condition?.right,
      rewrittenModel: config.Router.rules[0]?.rewrites?.[0]?.value,
      ruleFallbackModels: config.Router.rules[0]?.fallback?.models,
      profileModel: config.profile.profiles[0]?.model,
      availableModels: config.profile.profiles[0]?.availableModels,
      toolModel: config.toolHub.llm.model
    };
  })).toEqual({
    providerId: "config-only-id",
    providerName: "Renamed Provider",
    preferredProvider: "Renamed Provider",
    fallbackModels: ["Renamed Provider/config-only-model"],
    conditionModel: "Renamed Provider/config-only-model",
    rewrittenModel: "Renamed Provider/config-only-model",
    ruleFallbackModels: ["Renamed Provider/config-only-model"],
    profileModel: "Renamed Provider/config-only-model",
    availableModels: ["Renamed Provider/config-only-model"],
    toolModel: "Renamed Provider/config-only-model"
  });
  await page.reload();
  await waitForBridge(page);
  expect(await persistedProviderNames(page)).toEqual(["Renamed Provider"]);
});

test("resumes an unrelated pending autosave after the provider form save fails", async ({ page }) => {
  await prepareProviderRegressionPage(page, true);
  const saves = await interceptProviderRpc(page, true);
  const dialog = await fillNewProvider(page, "Failed Provider");

  // Keep the completed provider form open while changing an existing routing
  // setting through its real React controls. This puts a global draft edit
  // immediately before the explicit form save cancels its debounce timer.
  await page.getByRole("button", { name: "Global Routing", exact: true, includeHidden: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  const ruleRow = page.locator('[data-view="routing"] div.grid')
    .filter({ has: page.locator('[title="Router: rename-reference"]') });
  const ruleSwitch = ruleRow.getByRole("switch", { includeHidden: true });
  await expect(ruleSwitch).toBeChecked();
  await ruleSwitch.evaluate((input: HTMLInputElement) => input.click());
  await dialog.getByRole("button", { name: "Done", exact: true }).click();

  await expect(dialog.getByRole("alert")).toContainText("Simulated provider save failure");
  await expect.poll(async () => page.evaluate(async () => {
    const config = await window.ccr!.getConfig();
    return {
      names: config.Providers.map((provider) => provider.name),
      ruleEnabled: config.Router.rules[0]?.enabled
    };
  })).toEqual({ names: [configOnlyProvider.name], ruleEnabled: false });
  expect(saves.attempts).toBe(2);
  expect(saves.providerNames).toEqual([
    [configOnlyProvider.name, "Failed Provider"],
    [configOnlyProvider.name]
  ]);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Done", exact: true })).toBeEnabled();
});

async function prepareProviderRegressionPage(page: Page, withReferences = false): Promise<void> {
  const current = requireRuntime();
  await page.goto(`${current.baseUrl}/?ccr_web_token=${current.token}`);
  await waitForBridge(page);
  await page.evaluate(async ({ provider, withReferences }) => {
    const config = await window.ccr!.getConfig();
    const selector = `${provider.name}/${provider.models[0]}`;
    config.Providers = [{ ...provider, id: "config-only-id", protocolDetectionMode: "manual" }];
    config.preferredProvider = provider.name;
    config.gateway.enabled = false;
    config.proxy.enabled = false;
    config.profile.enabled = false;
    config.profile.profiles = withReferences ? [{
      agent: "codex", enabled: false, id: "rename-profile", name: "Rename profile", scope: "ccr",
      model: selector, availableModels: [selector]
    }] : [];
    config.Router.fallback = { mode: withReferences ? "model-chain" : "off", models: withReferences ? [selector] : [], retryCount: 1 };
    config.Router.rules = withReferences ? [{
      id: "rename-reference", name: "Rename reference", enabled: true, type: "condition",
      condition: { left: "request.body.model", operator: "==", right: selector },
      rewrites: [{ key: "request.body.model", operation: "set", value: selector }],
      fallback: { mode: "model-chain", models: [selector], retryCount: 1 }
    }] : [];
    config.toolHub.enabled = false;
    config.toolHub.llm.model = withReferences ? selector : "";
    await window.ccr!.saveConfig(config, { applyProfile: false });
    await window.ccr!.setOnboardingFinished?.();
  }, { provider: configOnlyProvider, withReferences });
  await page.reload();
  await waitForBridge(page);
  await page.getByRole("button", { name: "Providers", exact: true }).click();
}

async function interceptProviderRpc(page: Page, failFirstSave: boolean): Promise<{ attempts: number; providerNames: string[][] }> {
  const saves = { attempts: 0, providerNames: [] as string[][] };
  await page.route("**/api/ccr/rpc", async (route) => {
    const request = route.request().postDataJSON() as {
      args?: Array<{ candidates?: Array<{ baseUrl: string }>; Providers?: Array<{ name: string }> }>;
      method?: string;
    };
    if (request.method === "saveConfig") {
      saves.attempts += 1;
      saves.providerNames.push(request.args?.[0]?.Providers?.map((provider) => provider.name) ?? []);
      if (failFirstSave && saves.attempts === 1) {
        await route.fulfill({ status: 500, json: { ok: false, error: { message: "Simulated provider save failure" } } });
        return;
      }
    }
    if (request.method === "probeProviderCandidates") {
      const candidate = request.args?.[0]?.candidates?.[0] ?? { baseUrl: "http://127.0.0.1:9/v1" };
      await route.fulfill({ json: { ok: true, value: {
        candidate,
        probe: {
          capabilities: [{ type: "openai_chat_completions", baseUrl: candidate.baseUrl }],
          detectedProtocol: "openai_chat_completions", models: [], normalizedBaseUrl: candidate.baseUrl,
          protocols: [{ protocol: "openai_chat_completions", supported: true, endpoint: candidate.baseUrl, message: "Test endpoint" }]
        }
      } } });
      return;
    }
    if (request.method === "detectProviderIcon") {
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.continue();
  });
  return saves;
}

async function fillNewProvider(page: Page, name: string) {
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add Provider", exact: true });
  await dialog.getByRole("button", { name: "Select preset provider", exact: true }).click();
  await page.getByRole("option", { name: "Other / custom API endpoint", exact: true }).click();
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByLabel(/^API endpoint/).fill("http://127.0.0.1:9/v1");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await dialog.getByLabel("API key", { exact: true }).fill("sk-provider-e2e");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await dialog.getByRole("button", { name: "Custom model", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Custom model", exact: true }).fill("retry-model");
  await dialog.getByRole("button", { name: "Add custom model", exact: true }).click();
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Done", exact: true })).toBeEnabled();
  return dialog;
}

async function persistedProviderNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => (await window.ccr!.getConfig()).Providers.map((provider) => provider.name));
}

async function waitForBridge(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.ccr?.getConfig), undefined, { timeout: 20_000 });
}

function requireRuntime(): CliWebRuntime {
  if (!runtime) {
    throw new Error("CLI web runtime was not started.");
  }
  return runtime;
}
