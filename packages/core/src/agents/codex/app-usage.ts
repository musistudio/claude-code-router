import type { AppConfig, ProfileConfig, ProviderAccountMeter, ProviderAccountSnapshot } from "@ccr/core/contracts/app";
import { buildCodexModelCatalogIds } from "@ccr/core/agents/codex/model-catalog";
import { profileAllowedModels } from "@ccr/core/profiles/model-allowlist";
import { resolveUsageModelAttribution } from "@ccr/core/usage/model-attribution";

export type CodexAppUsage = {
  enabled?: boolean;
  error?: boolean;
  model: string;
  models: string[];
  provider?: string;
  snapshots: ProviderAccountSnapshot[];
};

/** Only the selected provider is queried. Never send provider configuration or credentials to the page. */
export async function readCodexAppUsage(
  config: AppConfig,
  profile: ProfileConfig,
  selectedModel: string | undefined,
  readSnapshots: (provider: string) => Promise<ProviderAccountSnapshot[]>
): Promise<CodexAppUsage> {
  const models = buildCodexModelCatalogIds(config, profile.model, { allowedModels: profileAllowedModels(profile) });
  const model = selectedModel?.trim() || profile.model;
  const enabled = config.profile.enabled !== false && profile.enabled;
  const provider = enabled && models.includes(model) ? resolveUsageModelAttribution(config, model).provider : undefined;
  const snapshots = provider ? await readSnapshots(provider) : [];
  return {
    enabled, model, models, provider,
    snapshots: snapshots.map(({ provider, credentialLabel, meters, source, status, updatedAt }) => ({
      provider, credentialLabel, meters, source, status, updatedAt
    }))
  };
}

/** Self-contained so the exact same calculations can run in the renderer. */
export function codexUsageMeterMath() {
  function remaining(meter: ProviderAccountMeter): number | undefined {
    if (Number.isFinite(meter.remaining)) return meter.remaining;
    if (Number.isFinite(meter.limit) && Number.isFinite(meter.used)) return meter.limit! - meter.used!;
    return undefined;
  }
  function percent(meter: ProviderAccountMeter): number | undefined {
    const left = remaining(meter);
    const limit = meter.limit ?? (meter.unit === "%" ? 100 : undefined);
    return left !== undefined && limit !== undefined && Number.isFinite(limit) && limit > 0
      ? Math.max(0, Math.min(100, left / limit * 100)) : undefined;
  }
  function primary(snapshots: ProviderAccountSnapshot[]): ProviderAccountMeter | undefined {
    // Keep credential balances separate; they are not necessarily additive.
    const meters = snapshots.flatMap(snapshot => snapshot.meters);
    return meters.find(meter => meter.kind === "balance" && remaining(meter) !== undefined)
      ?? meters.find(meter => remaining(meter) !== undefined);
  }
  return { remaining, percent, primary };
}

export type CodexNativeUsageData = {
  ambient_usage: {
    default: {
      profile_subtext: string;
      source: { kind: "included" | "credits"; heading: string };
      menu: { rows: Array<{ label: string; value: { text: string; tone: "neutral" | "warning" }; hover?: { text: string } }>; actions: never[] };
    };
  };
  rate_limit: {
    allowed: true;
    limit_reached: false;
    primary_window: CodexNativeUsageWindow | null;
    secondary_window: CodexNativeUsageWindow | null;
  };
  credits: { has_credits: boolean; unlimited: false; balance: string } | null;
};

type CodexNativeUsageWindow = {
  used_percent: number;
  limit_window_seconds: number;
  reset_at: number | null;
  reset_after_seconds: number | null;
};

/** Backend-driven presentation consumed by the official AmbientUsageRailMenu. */
export function codexNativeUsageData(usage: CodexAppUsage): CodexNativeUsageData {
  const math = codexUsageMeterMath();
  const rows: CodexNativeUsageData["ambient_usage"]["default"]["menu"]["rows"] = [];
  const number = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  const amount = (value: number, unit: string) => unit === "USD" || unit === "CNY"
    ? new Intl.NumberFormat(undefined, { style: "currency", currency: unit, maximumFractionDigits: 2 }).format(value)
    : `${number(value)}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`;
  const date = (value: string, full = false) => Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("zh-CN", full
      ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }
      : { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) : value;
  const row = (label: string, text: string, warning = false, hover?: string) => {
    rows.push({ label, value: { text, tone: warning ? "warning" : "neutral" }, ...(hover ? { hover: { text: hover } } : {}) });
  };
  const meters = usage.snapshots.flatMap(snapshot => snapshot.meters);
  const balance = meters.find(meter => meter.kind === "balance" && math.remaining(meter) !== undefined);
  const quota = meters.filter(meter => meter.kind !== "balance" && math.percent(meter) !== undefined);
  const seconds = (meter: ProviderAccountMeter): number | undefined => {
    const windows: Record<string, number> = { "5h": 18_000, daily: 86_400, weekly: 604_800, monthly: 2_592_000 };
    return meter.window ? windows[meter.window] : undefined;
  };
  const windowFor = (meter: ProviderAccountMeter | undefined): CodexNativeUsageWindow | null => {
    if (!meter || seconds(meter) === undefined) return null;
    const reset = meter.resetAt ? Date.parse(meter.resetAt) : NaN;
    const resetAt = Number.isFinite(reset) ? Math.floor(reset / 1000) : null;
    return {
      used_percent: 100 - math.percent(meter)!, limit_window_seconds: seconds(meter)!,
      reset_at: resetAt, reset_after_seconds: resetAt === null ? null : Math.max(0, resetAt - Math.floor(Date.now() / 1000))
    };
  };
  // Preserve the real window duration: a daily allowance must not be called weekly.
  const firstWindow = quota.find(meter => seconds(meter) === 18_000) ?? quota.find(meter => seconds(meter) !== 604_800);
  const weekly = quota.find(meter => seconds(meter) === 604_800);
  // The native single-ring presentation expects a lone weekly window in primary_window.
  const primary = firstWindow ?? weekly;
  const secondary = firstWindow ? weekly : undefined;
  const periods: Record<string, string> = { "5h": "5小时", daily: "每日", weekly: "每周", monthly: "每月" };
  let visibleMeters = 0;
  let statusShown = false;
  for (const snapshot of usage.snapshots) {
    if (snapshot.credentialLabel) row("账户", snapshot.credentialLabel);
    for (const meter of snapshot.meters) {
      const remaining = math.remaining(meter);
      if (remaining === undefined && meter.used === undefined && meter.limit === undefined) continue;
      visibleMeters++;
      const period = meter.window && periods[meter.window];
      const label = meter.kind === "quota" && period ? `${period}额度` : meter.label;
      const detail = [meter.used !== undefined ? `已用 ${amount(meter.used, meter.unit)}` : "", meter.limit !== undefined ? `总额 ${amount(meter.limit, meter.unit)}` : "", meter.resetAt ? `重置时间：${date(meter.resetAt, true)}` : ""].filter(Boolean).join("；");
      row(label, remaining === undefined ? "暂无数据" : `剩余 ${amount(remaining, meter.unit)}`, remaining !== undefined && remaining <= 0, detail || undefined);
      if (meter.resetAt) row(period ? `${period}重置` : "重置", date(meter.resetAt), false, date(meter.resetAt, true));
      for (const entry of meter.details ?? []) {
        if (entry.label || entry.description) row(entry.label || "详情", entry.description || "");
        if (entry.expiresAt) row("到期时间", date(entry.expiresAt));
      }
    }
    if (snapshot.status === "error") { row("查询状态", "查询失败，稍后自动重试", true); statusShown = true; }
    if (snapshot.status === "unsupported") { row("查询状态", "供应商未提供额度数据"); statusShown = true; }
    if (snapshot.status === "warning" || snapshot.status === "critical") { row("查询状态", "可用额度不足或部分数据暂不可用", true); statusShown = true; }
  }
  if (!visibleMeters && !statusShown) row("额度", usage.error ? "查询失败，稍后自动重试" : "暂无额度数据", Boolean(usage.error));
  const updatedAt = usage.snapshots.map(snapshot => snapshot.updatedAt).filter(value => Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  if (updatedAt) row("更新", date(updatedAt), false, date(updatedAt, true));
  const shortModel = usage.model.slice(usage.model.indexOf("/") + 1);
  row("模型", shortModel.length > 24 ? `${shortModel.slice(0, 23)}…` : shortModel, false, usage.model);
  const first = math.primary(usage.snapshots);
  const remaining = first && math.remaining(first);
  const left = balance && math.remaining(balance);
  return {
    ambient_usage: {
      default: {
        profile_subtext: first && remaining !== undefined ? `剩余 ${amount(remaining, first.unit)}` : "暂无额度数据",
        source: { kind: quota.length ? "included" : balance ? "credits" : "included", heading: `额度来源：${usage.provider || "未识别供应商"}` },
        menu: { rows, actions: [] }
      }
    },
    // This readout does not impose OpenAI subscription limits on CCR's routed model.
    rate_limit: { allowed: true, limit_reached: false, primary_window: windowFor(primary), secondary_window: windowFor(secondary) },
    credits: left === undefined ? null : { has_credits: left > 0, unlimited: false, balance: String(left) }
  };
}

export function codexAppUsageInjectionScript(initial: Pick<CodexAppUsage, "model" | "models" | "provider" | "enabled">): string {
  const { model, models, provider, enabled } = initial;
  return `(${codexAppUsageBootstrap.toString()})(${JSON.stringify({ model, models, provider, enabled })});`;
}

type NativeUsageQuery = { queryKey: unknown[]; state: { data?: Record<string, unknown> | null }; setData(data: unknown): void; getObserversCount?(): number };
type NativeQueryClient = {
  getQueryCache(): { getAll(): NativeUsageQuery[]; subscribe(listener: (event: { type?: string; query?: NativeUsageQuery }) => void): () => void };
  setQueryData(key: unknown[], data: unknown): void;
};
type NativeUsageDisplayClient = {
  loadingStatus?: string;
  getFeatureGate(name: string, options?: unknown): { value: boolean; details?: Record<string, unknown>; [key: string]: unknown };
  $emt(event: { name: string; status: string; values: Record<string, unknown> }): void;
};

/** Supplies data to the existing official component. It never creates, hides, or styles UI. */
function codexAppUsageBootstrap(initial: Pick<CodexAppUsage, "model" | "models" | "provider" | "enabled">): void {
  if (window.top !== window.self) return;
  const scope = globalThis as typeof globalThis & {
    __ccrProviderUsageRequest?: (payload: string) => void;
    __STATSIG__?: { firstInstance?: NativeUsageDisplayClient; instances?: Record<string, NativeUsageDisplayClient> };
    __ccrProviderUsage?: { dispose(): void; receive(id: number, usage: CodexAppUsage, native: CodexNativeUsageData): void };
  };
  scope.__ccrProviderUsage?.dispose();
  let model = initial.model;
  let models = initial.models;
  let enabled = initial.enabled !== false;
  let sequence = 0;
  let disposed = false;
  let applying = false;
  let client: NativeQueryClient | undefined;
  let unsubscribe: (() => void) | undefined;
  let projection: CodexNativeUsageData | undefined;
  let displayClient: NativeUsageDisplayClient | undefined;
  let originalGate: NativeUsageDisplayClient["getFeatureGate"] | undefined;
  let displayGate: NativeUsageDisplayClient["getFeatureGate"] | undefined;
  let scanTimer: ReturnType<typeof setTimeout> | undefined;
  const originals = new Map<NativeUsageQuery, Record<string, unknown> | null | undefined>();
  const owned = new WeakSet<object>();
  const hovers = new Map<HTMLElement, () => void>();
  type IndicatorProps = { source?: { kind?: string; heading?: string }; remaining?: { fiveHour?: number | null; weekly?: number | null } | null; reserveRemaining?: number | null; creditBalance?: number | null; interactive?: boolean };
  type IndicatorState = { current: { remaining?: IndicatorProps["remaining"]; [key: string]: unknown }; face: number; rotation: number; transition?: unknown };
  type IndicatorDispatch = (update: (state: IndicatorState) => IndicatorState) => void;
  const indicators = new Map<HTMLElement, { props: IndicatorProps; remaining: IndicatorProps["remaining"]; interactive: boolean | undefined; dispatch: IndicatorDispatch }>();
  let reportedState = "";

  function isDisplayClient(value: unknown): value is NativeUsageDisplayClient {
    return Boolean(value && typeof (value as NativeUsageDisplayClient).getFeatureGate === "function" && typeof (value as NativeUsageDisplayClient).$emt === "function");
  }
  function enableOfficialDisplay(): void {
    if (displayClient) return;
    const statsig = scope.__STATSIG__;
    const candidate = [statsig?.firstInstance, ...Object.values(statsig?.instances ?? {})].find(isDisplayClient);
    if (!candidate) return;
    displayClient = candidate;
    originalGate = candidate.getFeatureGate;
    displayGate = function(name, options) {
      const result = originalGate!.call(candidate, name, options);
      // This gate controls only the ambient usage presentation, not account access.
      return enabled && name === "3538455134"
        ? { ...result, value: true, details: { ...result.details, reason: "LocalOverride" } } : result;
    };
    candidate.getFeatureGate = displayGate;
    candidate.$emt({ name: "values_updated", status: candidate.loadingStatus || "Ready", values: {} });
  }
  function notifyDisplay(): void {
    displayClient?.$emt({ name: "values_updated", status: displayClient.loadingStatus || "Ready", values: {} });
  }

  function isClient(value: unknown): value is NativeQueryClient {
    return Boolean(value && typeof (value as NativeQueryClient).getQueryCache === "function" && typeof (value as NativeQueryClient).setQueryData === "function");
  }
  function findClient(element: Element): NativeQueryClient | undefined {
    const key = Object.getOwnPropertyNames(element).find(key => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
    type Fiber = { return?: unknown; memoizedProps?: { value?: unknown; queryClient?: unknown }; dependencies?: { firstContext?: { memoizedValue?: unknown; next?: unknown } } };
    let fiber = key ? (element as unknown as Record<string, unknown>)[key] as Fiber : undefined;
    function fromValue(value: unknown): NativeQueryClient | undefined {
      if (isClient(value)) return value;
      // React 19 can expose the scope chain on a consumer's context dependency.
      if (value instanceof Map) for (const node of value.values()) if (isClient(node?.queryClient)) return node.queryClient;
      return undefined;
    }
    for (let depth = 0; fiber && depth < 150; depth++, fiber = fiber.return as typeof fiber) {
      const props = fiber.memoizedProps;
      for (const value of [props?.queryClient, props?.value]) {
        const found = fromValue(value);
        if (found) return found;
      }
      let context = fiber.dependencies?.firstContext;
      for (let count = 0; context && count < 50; count++, context = context.next as typeof context) {
        const found = fromValue(context.memoizedValue);
        if (found) return found;
      }
    }
    return undefined;
  }
  function usageQuery(query: NativeUsageQuery): boolean {
    return ["rate-limit-status", "rate-limit-status-pending"].includes(String(query.queryKey[0]))
      && query.queryKey.length <= 3 && query.queryKey[1] !== "image-generation";
  }
  function write(query: NativeUsageQuery, data: Record<string, unknown>): void {
    if (!client) return;
    applying = true;
    try {
      client.setQueryData(query.queryKey, data);
      // TanStack structural sharing may store a new object instead of `data`.
      if (query.state.data) owned.add(query.state.data);
    } finally {
      applying = false;
    }
  }
  function patch(query: NativeUsageQuery): void {
    if (disposed || applying || !enabled || !projection || !usageQuery(query) || query.state.data && owned.has(query.state.data)) return;
    const original = query.state.data;
    originals.set(query, original);
    const next = {
      ...original,
      user_id: original?.user_id ?? query.queryKey[1] ?? "ccr-virtual-user",
      account_id: original?.account_id ?? query.queryKey[2] ?? "ccr-virtual-account",
      plan_type: original?.plan_type ?? "plus",
      ...projection
    };
    write(query, next);
  }
  function restore(): void {
    for (const [query, original] of originals) {
      if (query.state.data && owned.has(query.state.data)) {
        // Query.setData also accepts an undefined prior value; setQueryData does not.
        query.setData(original);
      }
    }
    originals.clear();
  }
  function apply(): void {
    if (!enabled) { restore(); return; }
    if (!client) return;
    for (const query of client.getQueryCache().getAll()) {
      if (query.state.data && owned.has(query.state.data)) {
        // Re-project a fresh supplier snapshot while retaining the native response for restoration.
        const original = originals.get(query);
        const next = { ...query.state.data, ...projection };
        write(query, next);
        originals.set(query, original);
      } else patch(query);
    }
  }
  function officialButtons(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('button')].filter(button =>
      (Boolean(button.closest('[data-app-navigation-rail],[class~="group/sidebar-rail"]')) &&
      ["Usage", "用量", "使用量", "使用情况"].includes(button.getAttribute("aria-label") || ""))
      || Boolean(projection && button.getAttribute("aria-description") === projection.ambient_usage.default.source.heading)
    );
  }
  function restoreIndicator(button: HTMLElement): void {
    const previous = indicators.get(button);
    if (!previous) return;
    previous.props.remaining = previous.remaining;
    previous.props.interactive = previous.interactive;
    if (button.isConnected) previous.dispatch(state => ({ ...state, current: { ...state.current, remaining: previous.remaining }, transition: null }));
    indicators.delete(button);
  }
  function adaptOfficialIndicator(button: HTMLElement): void {
    const window = projection?.rate_limit.primary_window;
    // The official outer menu only recognizes weekly or paired 5h/weekly data.
    // Its existing indicator also accepts a single primary percentage. Supply
    // that presentation prop without changing real quota windows in the cache.
    if (!enabled || !window || projection?.ambient_usage.default.source.kind !== "included") { restoreIndicator(button); return; }
    const percentage = Math.max(0, Math.min(100, 100 - window.used_percent));
    type Fiber = { memoizedProps?: IndicatorProps; memoizedState?: { memoizedState?: unknown; queue?: { dispatch?: IndicatorDispatch }; next?: unknown }; child?: Fiber; sibling?: Fiber; alternate?: Fiber; return?: Fiber; stateNode?: { current?: Fiber } };
    function committedFiber(fiber: Fiber): Fiber | undefined {
      const alternate = fiber.alternate;
      if (!alternate) return fiber;
      let a = fiber, b = alternate;
      // Follow both branches, including React's shared-child bailout case.
      for (let depth = 0; depth < 150; depth++) {
        const parentA = a.return;
        if (!parentA) return a.stateNode?.current ? a.stateNode.current === a ? fiber : alternate : undefined;
        const parentB = parentA.alternate;
        if (!parentB) {
          if (!parentA.return) return undefined;
          a = b = parentA.return;
          continue;
        }
        if (parentA.child === parentB.child) {
          for (let child = parentA.child; child; child = child.sibling) {
            if (child === a) return fiber;
            if (child === b) return alternate;
          }
          return undefined;
        }
        if (a.return !== b.return) { a = parentA; b = parentB; }
        else {
          let found = false;
          for (const [parent, other] of [[parentA, parentB], [parentB, parentA]]) {
            for (let child = parent.child; child; child = child.sibling) {
              if (child === a) { a = parent; b = other; found = true; break; }
              if (child === b) { b = parent; a = other; found = true; break; }
            }
            if (found) break;
          }
          if (!found) return undefined;
        }
        if (a.alternate !== b) return undefined;
      }
      return undefined;
    }
    const keys = Object.getOwnPropertyNames(button);
    const key = keys.find(key => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
    const propsKey = keys.find(key => key.startsWith("__reactProps$"));
    let root = key ? (button as unknown as Record<string, unknown>)[key] as Fiber : undefined;
    const currentProps = propsKey ? (button as unknown as Record<string, unknown>)[propsKey] : undefined;
    // DOM pointers survive alternate swaps and shared-subtree bailouts.
    const committed = root && committedFiber(root);
    if (committed) root = committed;
    else if (root?.alternate && currentProps && root.memoizedProps !== currentProps && root.alternate.memoizedProps === currentProps) root = root.alternate;
    const pending = root?.child ? [root.child] : [];
    for (let count = 0; pending.length && count < 250; count++) {
      const fiber = pending.pop()!;
      if (fiber.child) pending.push(fiber.child);
      if (fiber.sibling) pending.push(fiber.sibling);
      const props = fiber.memoizedProps;
      if (!props || props.source?.heading !== projection.ambient_usage.default.source.heading
        || !Object.prototype.hasOwnProperty.call(props, "reserveRemaining") || !Object.prototype.hasOwnProperty.call(props, "creditBalance")) continue;
      const previous = indicators.get(button);
      // Full weekly / dual-window rings keep their official behavior.
      if (props.remaining && previous?.props !== props) { restoreIndicator(button); return; }
      let hook = fiber.memoizedState;
      for (let index = 0; hook && index < 40; index++, hook = hook.next as typeof hook) {
        const state = hook.memoizedState as IndicatorState | undefined;
        if (!state?.current || typeof state.face !== "number" || typeof state.rotation !== "number" || typeof hook.queue?.dispatch !== "function") continue;
        if (previous?.props === props && props.remaining?.fiveHour === percentage) return;
        if (previous?.props !== props) {
          restoreIndicator(button);
          if (Object.isFrozen(props)) return;
          indicators.set(button, { props, remaining: props.remaining, interactive: props.interactive, dispatch: hook.queue.dispatch });
        }
        props.remaining = { fiveHour: percentage, weekly: null };
        // The inner single-ring tooltip assumes "weekly"; details still open
        // through the official outer menu with the accurate window label.
        props.interactive = false;
        const remaining = props.remaining;
        hook.queue.dispatch(current => ({ ...current, current: { ...current.current, remaining }, transition: null }));
        return;
      }
    }
  }
  function diagnostics() {
    const queries = client?.getQueryCache().getAll().filter(usageQuery) ?? [];
    return {
      nativeClientFound: Boolean(client), displayGateEnabled: Boolean(displayClient?.getFeatureGate("3538455134", { disableExposureLog: true }).value),
      usageQueryCount: queries.length,
      usageObserverCount: queries.reduce((sum, query) => sum + (query.getObserversCount?.() ?? 0), 0),
      projectionApplied: queries.some(query => Boolean(query.state.data && owned.has(query.state.data))),
      usageIdentityMatchesQuery: queries.some(query => query.queryKey.length === 3 && Boolean(query.queryKey[1]) && query.state.data?.user_id === query.queryKey[1] && query.state.data?.account_id === query.queryKey[2]),
      railFound: Boolean(document.querySelector('[data-app-navigation-rail]')),
      officialProviderDataPresent: officialButtons().some(button => button.getAttribute("aria-description") === projection?.ambient_usage.default.source.heading),
      nativeRingPresent: officialButtons().some(button => Boolean(button.querySelector('svg path[pathLength="100"]'))),
      nativeRingAdapted: indicators.size > 0,
      officialComponentPresent: officialButtons().length > 0
    };
  }
  function report(): void {
    const state = diagnostics();
    const signature = JSON.stringify(state);
    if (disposed || signature === reportedState) return;
    reportedState = signature;
    scope.__ccrProviderUsageRequest?.(JSON.stringify({ kind: "diagnostic", diagnostics: state }));
  }
  function request(): void {
    if (!disposed) scope.__ccrProviderUsageRequest?.(JSON.stringify({ id: ++sequence, model }));
  }
  function scan(): void {
    scanTimer = undefined;
    if (disposed || !document.body) return;
    enableOfficialDisplay();
    if (!client) {
      const rail = document.querySelector("[data-app-navigation-rail]") || document.querySelector('[class~="group/sidebar-rail"]');
      const seeds = [rail, document.querySelector("#root")?.firstElementChild, ...document.querySelectorAll('[data-app-navigation-rail] button')];
      for (const seed of seeds) if (seed && (client = findClient(seed))) break;
      if (client) {
        unsubscribe = client.getQueryCache().subscribe(event => {
          if (event.query && event.type !== "removed") patch(event.query);
          if (event.query && event.type === "removed") originals.delete(event.query);
        });
        apply();
      }
    }
    const triggers = document.querySelectorAll<HTMLElement>('button[aria-haspopup],button[data-testid*="model"],[role="combobox"]');
    const selected = [...triggers].filter(el => !el.closest('[role="menu"],[role="listbox"],[inert],[aria-hidden="true"]') && el.getClientRects().length > 0)
      .flatMap(el => [el.getAttribute("data-model"), el.getAttribute("aria-label"), el.textContent?.trim(), ...[...el.querySelectorAll("span")].map(span => span.textContent?.trim())])
      .find((text): text is string => Boolean(text && models.includes(text)));
    if (selected && selected !== model) {
      model = selected;
      projection = undefined;
      restore();
      request();
    }
    // Open the official menu on hover; its own React handlers render all details.
    for (const button of officialButtons()) {
      adaptOfficialIndicator(button);
      if (hovers.has(button)) continue;
      const enter = () => { if (enabled && button.getAttribute("aria-expanded") !== "true") button.click(); };
      button.addEventListener("mouseenter", enter);
      hovers.set(button, enter);
    }
    for (const [button, enter] of hovers) if (!button.isConnected) { button.removeEventListener("mouseenter", enter); hovers.delete(button); }
    for (const button of indicators.keys()) if (!button.isConnected) restoreIndicator(button);
    report();
  }
  function scheduleScan(): void {
    if (!scanTimer) scanTimer = setTimeout(scan, 100);
  }
  const observer = new MutationObserver(scheduleScan);
  const interval = setInterval(() => { scan(); request(); }, 60_000);
  function start(): void {
    if (!document.body || disposed) return;
    observer.observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["aria-label", "data-model"] });
    scan(); request();
  }
  scope.__ccrProviderUsage = {
    receive(id, usage, native) {
      if (disposed || id !== sequence || usage.model !== model) return;
      if (usage.models.length) models = usage.models;
      enabled = usage.enabled !== false;
      notifyDisplay();
      projection = native;
      apply();
      scheduleScan();
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      clearInterval(interval);
      if (scanTimer) clearTimeout(scanTimer);
      document.removeEventListener("DOMContentLoaded", start);
      unsubscribe?.();
      for (const button of indicators.keys()) restoreIndicator(button);
      restore();
      if (displayClient && originalGate && displayClient.getFeatureGate === displayGate) {
        displayClient.getFeatureGate = originalGate;
        notifyDisplay();
      }
      for (const [button, enter] of hovers) button.removeEventListener("mouseenter", enter);
      hovers.clear();
    }
  };
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start, { once: true });
}
