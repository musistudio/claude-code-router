import { expect, test, type Page } from "@playwright/test";
import { codexAppUsageInjectionScript, codexNativeUsageData, type CodexAppUsage } from "../../packages/core/src/agents/codex/app-usage";

test.use({ ...(process.env.CCR_TEST_BROWSER_CHANNEL ? { channel: process.env.CCR_TEST_BROWSER_CHANNEL } : {}) });
type UsageRequest = { id: number; model: string };
type UsageWindow = Window & {
  __ccrProviderUsage: { receive(id: number, usage: CodexAppUsage, native: ReturnType<typeof codexNativeUsageData>): void; dispose(): void };
  nativeUsage: { data: Record<string, unknown>; set(data: Record<string, unknown>): void; initial: Record<string, unknown> };
  __STATSIG__: { firstInstance: { getFeatureGate(name: string): { value: boolean } } };
};
const initial = { model: "DeepSeek/chat", models: ["DeepSeek/chat", "Coding Plan/coder"] };
const script = codexAppUsageInjectionScript(initial);

async function setup(page: Page, contextDependency = false): Promise<UsageRequest[]> {
  const requests: UsageRequest[] = [];
  await page.exposeFunction("__ccrProviderUsageRequest", (payload: string) => { const value = JSON.parse(payload); if (value.kind !== "diagnostic") requests.push(value); });
  await page.setContent('<nav data-app-navigation-rail></nav><main><button id="model" aria-haspopup="menu"><span>DeepSeek/chat</span><span> Medium</span></button></main>');
  await page.evaluate(contextDependency => {
    const initial = { user_id: "user-9", account_id: "account-9", plan_type: "pro", credits: { balance: "10" }, ambient_usage: { default: { source: { heading: "Your Pro plan" } } } };
    const listeners = new Set<(event: unknown) => void>();
    const query = { queryKey: ["rate-limit-status", "user-9", "account-9"], state: { data: initial as Record<string, unknown> }, setData(data: Record<string, unknown>) { this.state.data = structuredClone(data); for (const listener of listeners) listener({ type: "updated", query: this }); render(); } };
    const unrelated = { queryKey: ["rate-limit-status", "image-generation", "thread-9"], state: { data: null } };
    const cache = { getAll: () => [query, unrelated], subscribe(listener: (event: unknown) => void) { listeners.add(listener); return () => listeners.delete(listener); } };
    const client = { getQueryCache: () => cache, setQueryData(_key: unknown[], data: Record<string, unknown>) { query.setData(data); } };
    const rail = document.querySelector("nav")!;
    const display = { loadingStatus: "Ready", getFeatureGate(_name: string) { return { value: false, details: {} }; }, $emt() { render(); } };
    Object.assign(window, { __STATSIG__: { firstInstance: display } });
    function render() {
      const visible = display.getFeatureGate("3538455134").value && Boolean(query.state.data?.ambient_usage);
      if (!visible) { rail.querySelector("button")?.remove(); return; }
      if (rail.querySelector("button")) return;
      const button = document.createElement("button");
      button.setAttribute("aria-label", "Usage");
      button.setAttribute("aria-expanded", "false");
      button.textContent = "official component";
      button.addEventListener("click", () => button.setAttribute("aria-expanded", "true"));
      rail.append(button);
    }
    // The actual desktop exposes its query client through a React context ancestor.
    const chain = new Map([[Symbol(), { queryClient: client }]]);
    Object.assign(rail, { __reactFiber$test: { return: contextDependency
      ? { dependencies: { firstContext: { memoizedValue: chain } } }
      : { memoizedProps: { value: chain } } } });
    Object.defineProperty(window, "nativeUsage", { value: { get data() { return query.state.data; }, initial, set(data: Record<string, unknown>) { query.setData(data); } } });
  }, contextDependency);
  await page.evaluate(script);
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  return requests;
}
function usage(model = initial.model, remaining = 0): CodexAppUsage {
  return { enabled: true, model, models: initial.models, provider: model.split("/")[0], snapshots: [{ provider: model.split("/")[0], source: "http-json", status: "ok", updatedAt: "2026-11-17T00:00:00Z", meters: [{ id: "balance", kind: "balance", label: "账户余额", remaining, unit: "CNY" }] }] };
}
async function receive(page: Page, request: UsageRequest, value: CodexAppUsage): Promise<void> {
  await page.evaluate(({ id, value, native }) => (window as unknown as UsageWindow).__ccrProviderUsage.receive(id, value, native), { id: request.id, value, native: codexNativeUsageData(value) });
}

test("feeds the official query cache, preserves the component and opens its native menu on hover", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const requests = await setup(page);
  expect(await page.evaluate(() => (window as unknown as UsageWindow).__STATSIG__.firstInstance.getFeatureGate("3538455134").value)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as UsageWindow).__STATSIG__.firstInstance.getFeatureGate("unrelated-permission").value)).toBe(false);
  const before = await page.locator("nav").innerHTML();
  await receive(page, requests.at(-1)!, usage());
  expect(await page.locator("nav").innerHTML()).toBe(before);
  await expect(page.getByRole("button", { name: "Usage", exact: true })).toBeVisible();
  const native = await page.evaluate(() => (window as unknown as UsageWindow).nativeUsage.data);
  expect(native.credits).toMatchObject({ balance: "0", has_credits: false });
  expect(native.ambient_usage).toMatchObject({ default: { source: { heading: "额度来源：DeepSeek" }, menu: { rows: expect.any(Array) } } });
  expect(native.user_id).toBe("user-9");
  expect(native.account_id).toBe("account-9");
  await page.getByRole("button", { name: "Usage", exact: true }).hover();
  await expect(page.getByRole("button", { name: "Usage", exact: true })).toHaveAttribute("aria-expanded", "true");
  expect(await page.locator("[data-ccr-provider-usage],#ccr-provider-usage-details").count()).toBe(0);
  expect(errors).toEqual([]);
});

test("follows model selection, ignores delayed replies, and survives official polling responses", async ({ page }) => {
  const requests = await setup(page);
  const previous = requests.at(-1)!;
  await page.locator("#model span").first().evaluate(el => { el.textContent = "Coding Plan/coder"; });
  await expect.poll(() => requests.at(-1)?.model).toBe("Coding Plan/coder");
  const current = requests.at(-1)!;
  const value = usage(current.model);
  value.snapshots[0].meters = [{ id: "weekly", kind: "quota", label: "每周限额", remaining: 77, limit: 100, used: 23, unit: "%", window: "weekly", resetAt: "2026-11-24T00:00:00Z" }];
  await receive(page, current, value);
  await receive(page, previous, usage());
  await page.evaluate(() => { const state = (window as unknown as UsageWindow).nativeUsage; state.set({ ...state.initial, originalPoll: true }); });
  const native = await page.evaluate(() => (window as unknown as UsageWindow).nativeUsage.data);
  expect(native.originalPoll).toBe(true);
  expect(native.rate_limit).toMatchObject({ primary_window: { used_percent: 23, limit_window_seconds: 604800 }, secondary_window: null });
  expect(native.ambient_usage).toMatchObject({ default: { source: { heading: "额度来源：Coding Plan" } } });
});

test("reads the main window's React 19 context dependency", async ({ page }) => {
  const requests = await setup(page, true);
  await receive(page, requests.at(-1)!, usage());
  expect(await page.evaluate(() => (window as unknown as UsageWindow).nativeUsage.data.ambient_usage)).toMatchObject({ default: { source: { heading: "额度来源：DeepSeek" } } });
});

test("adapts the existing native indicator for a single 5h quota without changing the real window", async ({ page }) => {
  const requests = await setup(page, true);
  await page.evaluate(() => {
    const props = { source: { kind: "included", heading: "额度来源：DeepSeek" }, remaining: null as unknown, reserveRemaining: null, creditBalance: null, interactive: true };
    const state = { current: { kind: "included", remaining: null as unknown }, face: 0, rotation: 0, transition: null };
    const hook = { memoizedState: state, queue: { dispatch(update: (current: typeof state) => typeof state) { hook.memoizedState = update(hook.memoizedState); } } };
    const button = document.querySelector('nav button')!;
    const committedProps = { children: true };
    Object.assign(button, {
      __reactProps$indicator: committedProps,
      __reactFiber$indicator: {
        memoizedProps: { children: false },
        child: { memoizedProps: { ...props, source: { ...props.source, heading: "Previous provider" } }, memoizedState: hook },
        alternate: { memoizedProps: committedProps, child: { memoizedProps: props, memoizedState: hook } }
      }
    });
    Object.assign(window, { nativeIndicator: { props, hook } });
  });
  const value = usage();
  value.snapshots[0].meters = [{ id: "5h", kind: "quota", label: "5h quota", remaining: 99, limit: 100, used: 1, unit: "%", window: "5h" }];
  await receive(page, requests.at(-1)!, value);
  const readIndicator = () => page.evaluate(() => (window as unknown as { nativeIndicator: { props: { remaining: unknown; interactive: boolean }; hook: { memoizedState: { current: { remaining: unknown } } } } }).nativeIndicator);
  await expect.poll(async () => (await readIndicator()).props.remaining).toEqual({ fiveHour: 99, weekly: null });
  expect((await readIndicator()).hook.memoizedState.current.remaining).toEqual({ fiveHour: 99, weekly: null });
  const native = await page.evaluate(() => (window as unknown as UsageWindow).nativeUsage.data);
  expect(native.rate_limit).toMatchObject({ primary_window: { used_percent: 1, limit_window_seconds: 18000 }, secondary_window: null });
  await page.evaluate(() => (window as unknown as UsageWindow).__ccrProviderUsage.dispose());
  expect((await readIndicator()).props.remaining).toBeNull();
  expect((await readIndicator()).props.interactive).toBe(true);
});

test("unknown data does not become zero, and disabling or disposing restores the original native data", async ({ page }) => {
  const requests = await setup(page);
  const value = usage();
  value.snapshots[0].meters = [];
  value.snapshots[0].status = "unsupported";
  await receive(page, requests.at(-1)!, value);
  const native = await page.evaluate(() => (window as unknown as UsageWindow).nativeUsage.data);
  expect(native.credits).toBeNull();
  expect(native.ambient_usage).toMatchObject({ default: { menu: { rows: expect.arrayContaining([expect.objectContaining({ value: expect.objectContaining({ text: "供应商未提供额度数据" }) })]) } } });
  await receive(page, requests.at(-1)!, { ...value, enabled: false });
  expect(await page.evaluate(() => (window as unknown as UsageWindow).nativeUsage.data)).toEqual(await page.evaluate(() => (window as unknown as UsageWindow).nativeUsage.initial));
  await receive(page, requests.at(-1)!, value);
  await page.evaluate(() => (window as unknown as UsageWindow).__ccrProviderUsage.dispose());
  expect(await page.evaluate(() => (window as unknown as UsageWindow).nativeUsage.data)).toEqual(await page.evaluate(() => (window as unknown as UsageWindow).nativeUsage.initial));
  await expect(page.getByRole("button", { name: "Usage", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as UsageWindow).__STATSIG__.firstInstance.getFeatureGate("3538455134").value)).toBe(false);
});
