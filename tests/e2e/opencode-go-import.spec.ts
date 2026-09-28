import { expect, test, type Page } from "@playwright/test";
import { disposeCliWebRuntime, startCliWebServer, type CliWebRuntime } from "./cli-web-runtime";

const cliWebAuthToken = "playwright-opencode-go-token";

const lockedDetail = "OpenCode Go credential was found, but no OpenCode Go models were detected. Connect OpenCode Go in OpenCode to refresh its model cache, then rescan.";
const lockedDetailZh = "已找到 OpenCode Go 凭据，但未检测到 OpenCode Go 模型。请先在 OpenCode 中连接 OpenCode Go 并刷新模型缓存，然后重新扫描。";
const availableDetail = "OpenCode Go login detected. Click Import to add it as a gateway provider.";
const availableDetailZh = "已检测到 OpenCode Go 登录态。点击导入即可添加为网关供应商。";
const genericDetail = /Cannot read local login information/;

const candidates = [
  {
    detail: lockedDetail,
    id: "opencode-go-api-anthropic-messages",
    importable: false,
    kind: "opencode",
    models: [],
    name: "OpenCode Go (Anthropic)",
    protocol: "anthropic_messages",
    sourceFile: "env:OPENCODE_GO_API_KEY",
    status: "locked"
  },
  {
    detail: availableDetail,
    id: "opencode-go-api-openai-chat-completions",
    importable: true,
    kind: "opencode",
    models: ["mimo-v2.5"],
    name: "OpenCode Go (Chat Completions)",
    protocol: "openai_chat_completions",
    sourceFile: "env:OPENCODE_GO_API_KEY",
    status: "available"
  }
];

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

test.use({ locale: "en-US" });

test("locked OpenCode Go candidates render the actionable message instead of the generic login copy", async ({ page }) => {
  const current = requireRuntime();
  await mockCandidates(page);
  await openAddProviderDialog(page, current, "Providers", "Add provider");

  await expect(page.getByText(lockedDetail)).toBeVisible();
  await expect(page.getByText(availableDetail)).toBeVisible();
  await expect(page.getByText(genericDetail)).toHaveCount(0);

  const importButtons = page.getByRole("dialog").getByRole("button", { name: "Import", exact: true });
  await expect(importButtons).toHaveCount(2);
  await expect(importButtons.nth(0)).toBeDisabled();
  await expect(importButtons.nth(1)).toBeEnabled();
});

test.describe("zh locale", () => {
  test.use({ locale: "zh-CN" });

  test("locked OpenCode Go candidates render the translated guidance", async ({ page }) => {
    const current = requireRuntime();
    await page.addInitScript(() => window.localStorage.setItem("ccr.ui.language", "zh"));
    await mockCandidates(page);
    await openAddProviderDialog(page, current, "供应商", "添加供应商");

    await expect(page.getByText(lockedDetailZh)).toBeVisible();
    await expect(page.getByText(availableDetailZh)).toBeVisible();
    await expect(page.getByText(genericDetail)).toHaveCount(0);
  });
});

async function mockCandidates(page: Page): Promise<void> {
  await page.route("**/api/ccr/rpc", async (route) => {
    const payload = route.request().postDataJSON() as { method?: string } | undefined;
    if (payload?.method === "getLocalAgentProviderCandidates") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, value: candidates })
      });
      return;
    }
    await route.continue();
  });
}

async function openAddProviderDialog(page: Page, current: CliWebRuntime, providersLabel: string, addLabel: string): Promise<void> {
  await page.goto(`${current.baseUrl}/?ccr_web_token=${current.token}`);
  await waitForBridge(page);
  await page.evaluate(async () => {
    await window.ccr?.setOnboardingFinished?.();
  });
  await page.reload();
  await waitForBridge(page);
  await page.getByRole("button", { name: providersLabel, exact: true }).click();
  await page.getByRole("button", { name: addLabel, exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
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
