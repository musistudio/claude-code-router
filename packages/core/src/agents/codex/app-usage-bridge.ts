import { CdpClient } from "@ccr/core/agents/cdp-client";
import { waitForCodexDevToolsPort, waitForCodexPageTarget } from "@ccr/core/agents/codex/media-preview-bridge";
import { codexAppUsageInjectionScript, codexNativeUsageData, type CodexAppUsage } from "@ccr/core/agents/codex/app-usage";
import { readCodexAppProfileUsage } from "@ccr/core/agents/codex/app-usage-service";
import type { ProfileConfig } from "@ccr/core/contracts/app";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { CONFIGDIR } from "@ccr/core/config/constants";

const bindingName = "__ccrProviderUsageRequest";

type UsagePageTarget = { type?: string; url?: string; webSocketDebuggerUrl?: string };
type UsageWindowState = { navigation: boolean; root: boolean; buttons: number };

export async function selectCodexAppUsageWindow<T extends UsagePageTarget>(targets: T[], inspect: (page: T) => Promise<UsageWindowState | undefined>) {
  const pages = targets.filter(page => page.type === "page" && page.webSocketDebuggerUrl && page.url?.startsWith("app://"));
  let target: T | undefined;
  let bestScore = -1;
  let navigationPages = 0;
  for (const page of pages) {
    try {
      const value = await inspect(page);
      if (value?.navigation) navigationPages++;
      const score = value ? Number(value.navigation) * 1000 + Number(value.root) * 100 + Math.min(value.buttons, 99) : -1;
      if (score > bestScore) { bestScore = score; target = page; }
    } catch {
      // Auxiliary windows may close while target discovery is in progress.
    }
  }
  return { target, candidatePages: pages.length, navigationPages };
}

/** A separate bridge so the sidebar is available even when media tools are disabled. */
export class CodexAppUsageBridge {
  private client?: CdpClient;
  private stopped = true;
  private runPromise?: Promise<void>;
  private scriptId?: string;
  private diagnosticSignature?: string;

  constructor(private readonly options: { profile: ProfileConfig; userDataDir: string; logger?: Pick<Console, "warn"> }) {}

  start(): void {
    if (!this.stopped || this.runPromise) return;
    this.stopped = false;
    this.runPromise = this.run().finally(() => { this.runPromise = undefined; });
  }

  stop(): void {
    this.stopped = true;
    const client = this.client;
    this.client = undefined;
    if (!client) return;
    void (async () => {
      const timeout = setTimeout(() => client.close(), 1_000);
      timeout.unref();
      try {
        await client.send("Runtime.evaluate", { expression: "globalThis.__ccrProviderUsage?.dispose()" });
        if (this.scriptId) await client.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: this.scriptId });
        await client.send("Runtime.removeBinding", { name: bindingName });
      } catch {
        // The app may have already closed.
      } finally {
        clearTimeout(timeout);
        client.close();
      }
    })();
  }

  private async run(): Promise<void> {
    let warned = false;
    while (!this.stopped) {
      let client: CdpClient | undefined;
      try {
        const port = await waitForCodexDevToolsPort(this.options.userDataDir, 20_000, () => this.stopped);
        let target = await waitForCodexPageTarget(port, 20_000, () => this.stopped);
        // A Codex process can expose auxiliary pages ahead of its main window.
        // Prefer the page containing the native navigation, rather than its title.
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1_000) });
        const targets = await response.json() as Array<typeof target>;
        const selection = await selectCodexAppUsageWindow(targets, async page => {
          let probe: CdpClient | undefined;
          try {
            probe = await CdpClient.connect(page.webSocketDebuggerUrl!, { label: "Codex usage window discovery" });
            const state = await probe.send("Runtime.evaluate", {
              expression: '({navigation:!!document.querySelector("[data-app-navigation-rail],[class~=\\"group/sidebar-rail\\"]"),root:!!document.querySelector("#root"),buttons:document.querySelectorAll("button").length})', returnByValue: true
            }) as { result?: { value?: { navigation: boolean; root: boolean; buttons: number } } };
            return state.result?.value;
          } finally { probe?.close(); }
        });
        target = selection.target ?? target;
        this.log("window-selected", { candidatePages: selection.candidatePages, navigationPages: selection.navigationPages });
        if (this.stopped || !target.webSocketDebuggerUrl) return;
        client = await CdpClient.connect(target.webSocketDebuggerUrl, { label: "Codex provider usage" });
        if (this.stopped) { client.close(); return; }
        this.client = client;
        const initial = await this.readUsage(undefined, true);
        if (this.stopped) return;
        const script = codexAppUsageInjectionScript(initial);
        client.on("Runtime.bindingCalled", params => { void this.handleBinding(client!, params).catch(() => undefined); });
        await client.send("Page.enable");
        await client.send("Runtime.enable");
        await client.send("Runtime.addBinding", { name: bindingName });
        const added = await client.send("Page.addScriptToEvaluateOnNewDocument", { source: script }) as { identifier: string };
        this.scriptId = added.identifier;
        const evaluation = await client.send("Runtime.evaluate", { expression: script }) as { exceptionDetails?: unknown };
        if (evaluation.exceptionDetails) throw new Error("Codex usage bootstrap failed in the renderer.");
        this.log("adapter-installed");
        warned = false;
        await client.waitForClose();
      } catch {
        if (!this.stopped) this.log("adapter-reconnecting");
        if (!this.stopped && !warned) {
          warned = true;
          (this.options.logger ?? console).warn(`[profile] Codex provider usage is waiting to reconnect for profile ${this.options.profile.id}.`);
        }
      } finally {
        if (this.client === client) this.client = undefined;
        this.scriptId = undefined;
        client?.close();
      }
      if (!this.stopped) await new Promise(resolve => setTimeout(resolve, 1_000));
    }
  }

  private async readUsage(model?: string, initial = false): Promise<CodexAppUsage> {
    return readCodexAppProfileUsage(this.options.profile, model, initial);
  }

  private async handleBinding(client: CdpClient, value: unknown): Promise<void> {
    const params = value as { name?: string; payload?: string; executionContextId?: number };
    if (this.stopped || params.name !== bindingName || !params.payload || params.payload.length > 4096) return;
    let request: { kind?: string; id?: number; model?: string; diagnostics?: Record<string, unknown> };
    try { request = JSON.parse(params.payload); } catch { return; }
    if (request.diagnostics) {
      const diagnostics = Object.fromEntries(Object.entries(request.diagnostics).filter(([key, value]) =>
        ["nativeClientFound", "displayGateEnabled", "usageQueryCount", "usageObserverCount", "projectionApplied", "usageIdentityMatchesQuery", "railFound", "officialProviderDataPresent", "nativeRingPresent", "nativeRingAdapted", "officialComponentPresent"].includes(key)
        && (typeof value === "boolean" || typeof value === "number" && Number.isFinite(value))
      ));
      const signature = JSON.stringify(diagnostics);
      if (signature !== this.diagnosticSignature) { this.diagnosticSignature = signature; this.log("native-state", diagnostics); }
    }
    if (request.kind === "diagnostic") return;
    if (!Number.isSafeInteger(request.id) || typeof request.model !== "string") return;
    let usage: CodexAppUsage;
    try {
      usage = await this.readUsage(request.model);
    } catch {
      usage = { model: request.model, models: [], snapshots: [], error: true };
    }
    if (this.stopped || this.client !== client) return;
    this.log("data-ready", { enabled: usage.enabled !== false, providerResolved: Boolean(usage.provider), meters: usage.snapshots.reduce((sum, snapshot) => sum + snapshot.meters.length, 0) });
    const result = await client.send("Runtime.evaluate", {
      ...(params.executionContextId !== undefined ? { contextId: params.executionContextId } : {}),
      expression: `globalThis.__ccrProviderUsage?.receive(${request.id}, ${JSON.stringify(usage)}, ${JSON.stringify(codexNativeUsageData(usage))})`
    }) as { exceptionDetails?: unknown };
    if (result.exceptionDetails) this.log("data-apply-failed");
  }

  private log(event: string, fields: Record<string, unknown> = {}): void {
    void appendFile(path.join(CONFIGDIR, "codex-provider-usage.log"), JSON.stringify({ ts: Date.now(), pid: process.pid, profileId: this.options.profile.id, event, ...fields }) + "\n").catch(() => undefined);
  }
}
