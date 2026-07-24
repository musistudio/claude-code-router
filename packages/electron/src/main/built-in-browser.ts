import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  screen,
  session,
  shell,
  WebContentsView,
  type ContextMenuParams,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
  type WebContents
} from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AppConfig,
  BuiltInBrowserAutomationHandoff,
  BuiltInBrowserAutomationHandoffKind,
  BuiltInBrowserState,
  BuiltInBrowserTabState,
  ChromeLoginImportRequest,
  GatewayPluginAppConfig,
  InstalledBrowserApp
} from "@ccr/core/contracts/app";
import { IPC_CHANNELS } from "@ccr/core/contracts/ipc-channels";
import { APP_NAME } from "@ccr/core/config/constants";
import { pluginService } from "@ccr/core/plugins/service";
import { chromeLoginImportService } from "./chrome-login-import";

type BrowserTab = BuiltInBrowserTabState & {
  view: WebContentsView;
};

export type BrowserAutomationEvent = {
  errorCode?: number;
  errorDescription?: string;
  handoffId?: string;
  handoffStatus?: "completed" | "dismissed";
  kind: string;
  seq: number;
  summary?: string;
  tabId?: string;
  title?: string;
  ts: number;
  url?: string;
  windowId?: string;
};

export type BrowserAutomationEventListener = (event: BrowserAutomationEvent) => void;

const browserChromeBaseHeight = 82;
const browserHandoffToolbarHeight = 44;
const browserHomeUrl = "about:blank";
const browserPartition = "persist:ccr-built-in-browser";
const browserAutomationWindowId = "ccr-built-in-browser";
const maxAutomationEventHistory = 512;
const maxAutomationEventAgeMs = 60_000;
const titleBarHeight = 46;

class BuiltInBrowserService {
  private activeTabId?: string;
  private apps: InstalledBrowserApp[] = [];
  private automationHandoff?: BuiltInBrowserAutomationHandoff;
  private automationEventSeq = 0;
  private readonly automationEvents = new EventEmitter();
  private readonly automationEventHistory: BrowserAutomationEvent[] = [];
  private hideWindowAfterAutomationHandoff = false;
  private proxyConfigKey = "";
  private tabOrder: string[] = [];
  private tabs = new Map<string, BrowserTab>();
  private window?: BrowserWindow;

  constructor() {
    this.registerIpcHandlers();
  }

  async open(config: AppConfig): Promise<void> {
    await this.syncProxy(config);

    const window = this.ensureWindow();
    if (window.isMinimized()) {
      window.restore();
    }
    this.layoutActiveView();
    window.show();
    window.focus();
    this.sendState();
  }

  async openHidden(config: AppConfig): Promise<void> {
    await this.syncProxy(config);
    this.ensureWindow();
    this.layoutActiveView();
    this.sendState();
  }

  async syncProxy(config: AppConfig): Promise<void> {
    this.syncApps(config);

    const browserSession = session.fromPartition(browserPartition);
    const proxyConfig = { mode: "system" as const };
    const nextKey = JSON.stringify(proxyConfig);
    if (nextKey === this.proxyConfigKey) {
      return;
    }

    await browserSession.setProxy(proxyConfig);
    await browserSession.forceReloadProxyConfig();
    this.proxyConfigKey = nextKey;
  }

  private syncApps(config: AppConfig): void {
    const nextApps = resolveInstalledBrowserApps(config, pluginService.getApps());
    if (JSON.stringify(nextApps) === JSON.stringify(this.apps)) {
      return;
    }
    this.apps = nextApps;
    this.sendState();
  }

  async clearProxy(): Promise<void> {
    const browserSession = session.fromPartition(browserPartition);
    const proxyConfig = { mode: "system" as const };
    await browserSession.setProxy(proxyConfig);
    await browserSession.forceReloadProxyConfig();
    this.proxyConfigKey = JSON.stringify(proxyConfig);
  }

  getAutomationState(): BuiltInBrowserState {
    return this.getState();
  }

  getAutomationWindowId(): string {
    return browserAutomationWindowId;
  }

  getAutomationEvents(options: { replayRecentMs?: number } = {}): BrowserAutomationEvent[] {
    const replayRecentMs = Math.max(0, Math.floor(options.replayRecentMs ?? 0));
    const cutoff = replayRecentMs > 0 ? Date.now() - replayRecentMs : 0;
    this.pruneAutomationEventHistory();
    return this.automationEventHistory
      .filter((event) => event.ts >= cutoff)
      .map((event) => ({ ...event }));
  }

  requestAutomationHandoff(request: {
    kind?: BuiltInBrowserAutomationHandoffKind;
    message?: string;
    reason?: string;
    sessionId?: string;
    tabId?: string;
  }): BuiltInBrowserAutomationHandoff {
    const existingWindow = this.window && !this.window.isDestroyed() ? this.window : undefined;
    if (!this.automationHandoff) {
      this.hideWindowAfterAutomationHandoff = !existingWindow || !existingWindow.isVisible() || existingWindow.isMinimized();
    }
    const tab = this.getTab(request.tabId);
    if (request.tabId && tab?.id) {
      this.selectTab(request.tabId);
    }
    const targetTab = tab || this.getTab();
    const handoff: BuiltInBrowserAutomationHandoff = {
      id: randomUUID(),
      kind: request.kind || "other",
      message: request.message?.trim() || defaultAutomationHandoffMessage(request.kind),
      ...(request.reason?.trim() ? { reason: request.reason.trim() } : {}),
      requestedAt: Date.now(),
      ...(request.sessionId?.trim() ? { sessionId: request.sessionId.trim() } : {}),
      status: "pending",
      tabId: targetTab?.id || request.tabId || this.activeTabId
    };
    this.automationHandoff = handoff;
    this.layoutActiveView();
    this.showAutomationWindow();
    this.sendState();
    this.emitAutomationEvent({
      handoffId: handoff.id,
      kind: "handoff.requested",
      summary: handoff.message,
      tabId: handoff.tabId,
      title: targetTab?.title,
      url: targetTab?.url
    });
    return handoff;
  }

  resolveAutomationHandoff(status: "completed" | "dismissed" = "completed"): BuiltInBrowserState {
    const handoff = this.automationHandoff;
    const shouldHideWindow = this.hideWindowAfterAutomationHandoff;
    this.automationHandoff = undefined;
    this.hideWindowAfterAutomationHandoff = false;
    this.layoutActiveView();
    this.sendState();
    if (handoff) {
      const tab = this.getTab(handoff.tabId);
      if (shouldHideWindow) {
        this.hideAutomationWindow();
      }
      this.emitAutomationEvent({
        handoffId: handoff.id,
        handoffStatus: status,
        kind: status === "completed" ? "handoff.completed" : "handoff.dismissed",
        summary: status === "completed" ? "User completed the requested browser handoff." : "User dismissed the requested browser handoff.",
        tabId: handoff.tabId,
        title: tab?.title,
        url: tab?.url
      });
    }
    return this.getState();
  }

  subscribeAutomationEvents(
    listener: BrowserAutomationEventListener,
    options: { replayRecentMs?: number } = {}
  ): () => void {
    this.automationEvents.on("event", listener);
    const replayRecentMs = Math.max(0, Math.floor(options.replayRecentMs ?? 0));
    if (replayRecentMs > 0) {
      const cutoff = Date.now() - replayRecentMs;
      this.pruneAutomationEventHistory();
      for (const event of this.automationEventHistory) {
        if (event.ts >= cutoff) {
          listener(event);
        }
      }
    }
    return () => this.automationEvents.off("event", listener);
  }

  createAutomationTab(url = browserHomeUrl): BuiltInBrowserTabState {
    const tab = this.createTab(url);
    const { view: _view, ...state } = tab;
    return state;
  }

  selectAutomationTab(tabId: string): BuiltInBrowserState {
    this.selectTab(tabId);
    return this.getState();
  }

  closeAutomationTab(tabId: string): BuiltInBrowserState {
    this.closeTab(tabId);
    return this.getState();
  }

  async navigateAutomationTab(url: string, tabId?: string): Promise<BuiltInBrowserState> {
    const tab = this.getTab(tabId);
    if (!tab) {
      throw new Error("Browser tab was not found.");
    }

    const nextUrl = normalizeBrowserUrl(url);
    tab.url = nextUrl;
    if (tab.id === this.activeTabId) {
      this.layoutActiveView();
    }
    this.sendState();
    void tab.view.webContents.loadURL(nextUrl).catch((error) => {
      this.emitAutomationEvent({
        kind: "page.load_failed",
        summary: `Navigation request failed: ${formatError(error)}`,
        tabId: tab.id,
        title: tab.title,
        url: nextUrl
      });
    });
    this.emitAutomationEvent({
      kind: "page.navigation_requested",
      summary: `Navigation requested: ${nextUrl}`,
      tabId: tab.id,
      title: tab.title,
      url: nextUrl
    });
    return this.getState();
  }

  goBackAutomationTab(tabId?: string): BuiltInBrowserState {
    const tab = this.getTab(tabId);
    tab?.view.webContents.navigationHistory.goBack();
    if (tab) {
      this.emitAutomationEvent({
        kind: "tab.go_back",
        summary: `Go back in tab ${tab.id}.`,
        tabId: tab.id,
        title: tab.title,
        url: tab.url
      });
    }
    return this.getState();
  }

  goForwardAutomationTab(tabId?: string): BuiltInBrowserState {
    const tab = this.getTab(tabId);
    tab?.view.webContents.navigationHistory.goForward();
    if (tab) {
      this.emitAutomationEvent({
        kind: "tab.go_forward",
        summary: `Go forward in tab ${tab.id}.`,
        tabId: tab.id,
        title: tab.title,
        url: tab.url
      });
    }
    return this.getState();
  }

  reloadAutomationTab(tabId?: string): BuiltInBrowserState {
    const tab = this.getTab(tabId);
    tab?.view.webContents.reload();
    if (tab) {
      this.emitAutomationEvent({
        kind: "tab.reload",
        summary: `Reload tab ${tab.id}.`,
        tabId: tab.id,
        title: tab.title,
        url: tab.url
      });
    }
    return this.getState();
  }

  getAutomationWebContents(tabId?: string): WebContents {
    const tab = this.getTab(tabId);
    if (!tab || tab.view.webContents.isDestroyed()) {
      throw new Error("Browser tab is unavailable.");
    }
    return tab.view.webContents;
  }

  private registerIpcHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.browserGetState, (event) => {
      this.assertBrowserSender(event);
      return this.getState();
    });
    ipcMain.handle(IPC_CHANNELS.browserStartChromeLoginImport, async (event, request: ChromeLoginImportRequest) => {
      this.assertBrowserSender(event);
      return await chromeLoginImportService.createJob(request);
    });
    ipcMain.handle(IPC_CHANNELS.browserGetChromeLoginImport, (event, id: string) => {
      this.assertBrowserSender(event);
      return chromeLoginImportService.getJob(typeof id === "string" ? id : "");
    });
    ipcMain.handle(IPC_CHANNELS.browserNewTab, (event, url?: string) => {
      this.assertBrowserSender(event);
      this.createTab(url);
      return this.getState();
    });
    ipcMain.handle(IPC_CHANNELS.browserSelectTab, (event, tabId: string) => {
      this.assertBrowserSender(event);
      this.selectTab(tabId);
      return this.getState();
    });
    ipcMain.handle(IPC_CHANNELS.browserCloseTab, (event, tabId: string) => {
      this.assertBrowserSender(event);
      this.closeTab(tabId);
      return this.getState();
    });
    ipcMain.handle(IPC_CHANNELS.browserNavigate, (event, url: string, tabId?: string) => {
      this.assertBrowserSender(event);
      this.navigate(url, tabId);
      return this.getState();
    });
    ipcMain.handle(IPC_CHANNELS.browserBack, (event, tabId?: string) => {
      this.assertBrowserSender(event);
      this.getTab(tabId)?.view.webContents.navigationHistory.goBack();
      return this.getState();
    });
    ipcMain.handle(IPC_CHANNELS.browserForward, (event, tabId?: string) => {
      this.assertBrowserSender(event);
      this.getTab(tabId)?.view.webContents.navigationHistory.goForward();
      return this.getState();
    });
    ipcMain.handle(IPC_CHANNELS.browserReload, (event, tabId?: string) => {
      this.assertBrowserSender(event);
      this.getTab(tabId)?.view.webContents.reload();
      return this.getState();
    });
    ipcMain.handle(IPC_CHANNELS.browserResolveAutomationHandoff, (event, status?: string) => {
      this.assertBrowserSender(event);
      return this.resolveAutomationHandoff(status === "dismissed" ? "dismissed" : "completed");
    });
  }

  private ensureWindow(): BrowserWindow {
    const window = this.window && !this.window.isDestroyed() ? this.window : this.createWindow();
    if (this.tabs.size === 0) {
      this.createTab(browserHomeUrl);
    }
    return window;
  }

  private showAutomationWindow(): void {
    const window = this.ensureWindow();
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
  }

  private hideAutomationWindow(): void {
    const window = this.window;
    if (window && !window.isDestroyed()) {
      window.hide();
    }
  }

  private createWindow(): BrowserWindow {
    const { height: availableHeight, width: availableWidth } = screen.getPrimaryDisplay().workAreaSize;
    const minHeight = 560;
    const minWidth = 820;
    const height = fitWindowSize(840, minHeight, availableHeight - 48);
    const width = fitWindowSize(1180, minWidth, availableWidth - 48);

    const window = new BrowserWindow({
      height,
      minHeight,
      minWidth,
      show: false,
      title: `${APP_NAME} APPs`,
      ...(process.platform === "darwin"
        ? {
            titleBarStyle: "hiddenInset" as const,
            trafficLightPosition: {
              x: 16,
              y: Math.round((titleBarHeight - 14) / 2)
            }
          }
        : { titleBarStyle: "hidden" as const }),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "browser-preload.js"),
        sandbox: true,
        webSecurity: true
      },
      width
    });

    this.window = window;
    window.on("resize", () => this.layoutActiveView());
    window.on("closed", () => {
      this.destroyTabs();
      if (this.window === window) {
        this.window = undefined;
      }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("did-finish-load", () => this.sendState());

    void window.loadURL(this.resolveRendererUrl("pages/browser/index.html")).catch((error) => {
      console.warn(`[browser] Failed to load browser chrome: ${formatError(error)}`);
    });
    return window;
  }

  private createTab(url = browserHomeUrl): BrowserTab {
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: browserPartition,
        sandbox: true,
        webSecurity: true
      }
    });
    const tab: BrowserTab = {
      canGoBack: false,
      canGoForward: false,
      id: randomUUID(),
      isLoading: false,
      title: "New Tab",
      url: normalizeBrowserUrl(url),
      view
    };

    this.tabs.set(tab.id, tab);
    this.tabOrder.push(tab.id);
    this.configureTab(tab);
    this.window?.contentView.addChildView(view);
    view.setVisible(false);
    this.selectTab(tab.id);
    void view.webContents.loadURL(tab.url).catch((error) => {
      this.emitAutomationEvent({
        kind: "page.load_failed",
        summary: `Initial tab load failed: ${formatError(error)}`,
        tabId: tab.id,
        title: tab.title,
        url: tab.url
      });
    });
    this.sendState();
    this.emitAutomationEvent({
      kind: "tab.created",
      summary: `Created tab ${tab.id}.`,
      tabId: tab.id,
      title: tab.title,
      url: tab.url
    });
    return tab;
  }

  private configureTab(tab: BrowserTab): void {
    const { webContents } = tab.view;
    webContents.setWindowOpenHandler(({ url }) => {
      if (isHttpUrl(url)) {
        const opened = this.createTab(url);
        this.emitAutomationEvent({
          kind: "tab.opened",
          summary: `Opened new tab from window.open: ${url}`,
          tabId: opened.id,
          title: opened.title,
          url: opened.url
        });
      }
      return { action: "deny" };
    });
    webContents.on("context-menu", (_event, params) => {
      this.showContextMenu(tab, params);
    });
    webContents.on("page-title-updated", (_event, title) => {
      tab.title = title || titleFromUrl(tab.url);
      this.sendState();
      this.emitAutomationEvent({
        kind: "page.title",
        summary: `Title updated: ${tab.title}`,
        tabId: tab.id,
        title: tab.title,
        url: tab.url
      });
    });
    webContents.on("did-start-loading", () => {
      tab.isLoading = true;
      this.updateTabNavigationState(tab);
      this.emitAutomationEvent({
        kind: "page.loading_started",
        summary: `Loading started: ${tab.url}`,
        tabId: tab.id,
        title: tab.title,
        url: tab.url
      });
    });
    webContents.on("did-stop-loading", () => {
      tab.isLoading = false;
      this.updateTabNavigationState(tab);
      this.emitAutomationEvent({
        kind: "page.loading_stopped",
        summary: `Loading stopped: ${tab.url}`,
        tabId: tab.id,
        title: tab.title,
        url: tab.url
      });
    });
    webContents.on("did-navigate", (_event, url) => {
      tab.url = url;
      tab.title = tab.title || titleFromUrl(url);
      if (tab.id === this.activeTabId) {
        this.layoutActiveView();
      }
      this.updateTabNavigationState(tab);
      this.emitAutomationEvent({
        kind: "page.navigation",
        summary: `Navigated to ${url}`,
        tabId: tab.id,
        title: tab.title,
        url
      });
    });
    webContents.on("did-navigate-in-page", (_event, url) => {
      tab.url = url;
      if (tab.id === this.activeTabId) {
        this.layoutActiveView();
      }
      this.updateTabNavigationState(tab);
      this.emitAutomationEvent({
        kind: "page.navigation_in_page",
        summary: `In-page navigation to ${url}`,
        tabId: tab.id,
        title: tab.title,
        url
      });
    });
    webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
      if (errorCode !== -3) {
        tab.isLoading = false;
        tab.url = validatedUrl || tab.url;
        if (tab.id === this.activeTabId) {
          this.layoutActiveView();
        }
        this.updateTabNavigationState(tab);
        this.emitAutomationEvent({
          errorCode,
          errorDescription,
          kind: "page.load_failed",
          summary: `Load failed (${errorCode}): ${errorDescription}`,
          tabId: tab.id,
          title: tab.title,
          url: tab.url
        });
      }
    });
    webContents.on("dom-ready", () => {
      this.emitAutomationEvent({
        kind: "page.dom_ready",
        summary: `DOM ready: ${tab.url}`,
        tabId: tab.id,
        title: tab.title,
        url: tab.url
      });
    });
    webContents.on("console-message", (_event, level, message) => {
      if (level >= 2) {
        this.emitAutomationEvent({
          kind: "runtime.console",
          summary: message,
          tabId: tab.id,
          title: tab.title,
          url: tab.url
        });
      }
    });
    webContents.on("destroyed", () => {
      if (this.tabs.get(tab.id) === tab) {
        this.tabs.delete(tab.id);
        this.tabOrder = this.tabOrder.filter((id) => id !== tab.id);
        if (this.activeTabId === tab.id) {
          this.activeTabId = this.tabOrder[0];
        }
        this.sendState();
        this.emitAutomationEvent({
          kind: "tab.destroyed",
          summary: `Destroyed tab ${tab.id}.`,
          tabId: tab.id,
          title: tab.title,
          url: tab.url
        });
      }
    });
  }

  private showContextMenu(tab: BrowserTab, params: ContextMenuParams): void {
    const window = this.window;
    if (!window || window.isDestroyed() || tab.view.webContents.isDestroyed()) {
      return;
    }

    const { webContents } = tab.view;
    const { navigationHistory } = webContents;
    const template: MenuItemConstructorOptions[] = [
      {
        click: () => navigationHistory.goBack(),
        enabled: navigationHistory.canGoBack(),
        label: "Back"
      },
      {
        click: () => navigationHistory.goForward(),
        enabled: navigationHistory.canGoForward(),
        label: "Forward"
      },
      {
        click: () => webContents.reload(),
        label: "Reload"
      },
      { type: "separator" }
    ];

    if (isHttpUrl(params.linkURL)) {
      template.push(
        {
          click: () => this.createTab(params.linkURL),
          label: "Open Link in New Tab"
        },
        {
          click: () => {
            void shell.openExternal(params.linkURL);
          },
          label: "Open Link in System Browser"
        },
        {
          click: () => clipboard.writeText(params.linkURL),
          label: "Copy Link"
        },
        { type: "separator" }
      );
    }

    if (params.isEditable) {
      template.push(
        {
          click: () => webContents.cut(),
          enabled: params.editFlags.canCut,
          label: "Cut"
        },
        {
          click: () => webContents.copy(),
          enabled: params.editFlags.canCopy,
          label: "Copy"
        },
        {
          click: () => webContents.paste(),
          enabled: params.editFlags.canPaste,
          label: "Paste"
        },
        {
          click: () => webContents.selectAll(),
          enabled: params.editFlags.canSelectAll,
          label: "Select All"
        },
        { type: "separator" }
      );
    } else if (params.selectionText.trim()) {
      template.push(
        {
          click: () => webContents.copy(),
          label: "Copy"
        },
        { type: "separator" }
      );
    }

    template.push(
      {
        click: () => webContents.openDevTools({ mode: "detach" }),
        enabled: !webContents.isDevToolsOpened(),
        label: "Open DevTools"
      },
      {
        click: () => webContents.inspectElement(params.x, params.y),
        label: "Inspect Element"
      }
    );

    Menu.buildFromTemplate(template).popup({ window });
  }

  private selectTab(tabId: string): void {
    const selected = this.tabs.get(tabId);
    if (!selected) {
      return;
    }

    this.activeTabId = tabId;
    for (const tab of this.tabs.values()) {
      tab.view.setVisible(tab.id === tabId && !isBrowserHomeUrl(tab.url));
    }
    this.window?.contentView.addChildView(selected.view);
    this.layoutActiveView();
    if (isBrowserHomeUrl(selected.url)) {
      this.window?.webContents.focus();
    } else {
      selected.view.webContents.focus();
    }
    this.sendState();
    this.emitAutomationEvent({
      kind: "tab.activated",
      summary: `Activated tab ${tabId}.`,
      tabId,
      title: selected.title,
      url: selected.url
    });
  }

  private closeTab(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      return;
    }

    this.window?.contentView.removeChildView(tab.view);
    this.tabs.delete(tabId);
    this.tabOrder = this.tabOrder.filter((id) => id !== tabId);
    tab.view.webContents.close({ waitForBeforeUnload: false });
    this.emitAutomationEvent({
      kind: "tab.closed",
      summary: `Closed tab ${tabId}.`,
      tabId,
      title: tab.title,
      url: tab.url
    });

    if (this.tabOrder.length === 0) {
      this.createTab(browserHomeUrl);
      return;
    }

    if (this.activeTabId === tabId) {
      this.selectTab(this.tabOrder[Math.max(0, this.tabOrder.length - 1)]);
      return;
    }

    this.sendState();
  }

  private navigate(url: string, tabId?: string): void {
    const tab = this.getTab(tabId);
    if (!tab) {
      return;
    }

    const nextUrl = normalizeBrowserUrl(url);
    tab.url = nextUrl;
    if (tab.id === this.activeTabId) {
      this.layoutActiveView();
    }
    void tab.view.webContents.loadURL(nextUrl).catch((error) => {
      this.emitAutomationEvent({
        kind: "page.load_failed",
        summary: `Navigation request failed: ${formatError(error)}`,
        tabId: tab.id,
        title: tab.title,
        url: nextUrl
      });
    });
    this.sendState();
    this.emitAutomationEvent({
      kind: "page.navigation_requested",
      summary: `Navigation requested: ${nextUrl}`,
      tabId: tab.id,
      title: tab.title,
      url: nextUrl
    });
  }

  private getTab(tabId?: string): BrowserTab | undefined {
    return this.tabs.get(tabId || this.activeTabId || "");
  }

  private updateTabNavigationState(tab: BrowserTab): void {
    tab.canGoBack = tab.view.webContents.navigationHistory.canGoBack();
    tab.canGoForward = tab.view.webContents.navigationHistory.canGoForward();
    this.sendState();
  }

  private layoutActiveView(): void {
    const window = this.window;
    const activeTab = this.getTab();
    if (!window || window.isDestroyed() || !activeTab) {
      return;
    }

    if (isBrowserHomeUrl(activeTab.url)) {
      activeTab.view.setVisible(false);
      return;
    }

    const { height, width } = window.getContentBounds();
    activeTab.view.setVisible(true);
    activeTab.view.setBounds({
      height: Math.max(0, height - this.browserChromeHeight()),
      width,
      x: 0,
      y: this.browserChromeHeight()
    });
  }

  private browserChromeHeight(): number {
    return browserChromeBaseHeight + (this.automationHandoff ? browserHandoffToolbarHeight : 0);
  }

  private getState(): BuiltInBrowserState {
    return {
      activeTabId: this.activeTabId,
      apps: this.apps.map((app) => ({ ...app })),
      ...(this.automationHandoff ? { automationHandoff: { ...this.automationHandoff } } : {}),
      tabs: this.tabOrder
        .map((id) => this.tabs.get(id))
        .filter((tab): tab is BrowserTab => Boolean(tab))
        .map(({ view: _view, ...tab }) => tab)
    };
  }

  private sendState(): void {
    const window = this.window;
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
      return;
    }
    window.webContents.send(IPC_CHANNELS.browserStateChanged, this.getState());
  }

  private assertBrowserSender(event: IpcMainInvokeEvent): void {
    if (!this.window || event.sender !== this.window.webContents) {
      throw new Error("Browser controls are only available from the built-in browser window.");
    }
  }

  private destroyTabs(): void {
    for (const tab of this.tabs.values()) {
      if (!tab.view.webContents.isDestroyed()) {
        tab.view.webContents.close({ waitForBeforeUnload: false });
      }
    }
    this.tabs.clear();
    this.tabOrder = [];
    this.activeTabId = undefined;
  }

  private emitAutomationEvent(event: Omit<BrowserAutomationEvent, "seq" | "ts" | "windowId">): void {
    const nextEvent: BrowserAutomationEvent = {
      ...event,
      seq: ++this.automationEventSeq,
      ts: Date.now(),
      windowId: browserAutomationWindowId
    };
    this.automationEventHistory.push(nextEvent);
    this.pruneAutomationEventHistory(nextEvent.ts);
    this.automationEvents.emit("event", nextEvent);
  }

  private pruneAutomationEventHistory(now = Date.now()): void {
    while (this.automationEventHistory.length > 0 && now - this.automationEventHistory[0].ts > maxAutomationEventAgeMs) {
      this.automationEventHistory.shift();
    }
    if (this.automationEventHistory.length > maxAutomationEventHistory) {
      this.automationEventHistory.splice(0, this.automationEventHistory.length - maxAutomationEventHistory);
    }
  }

  private resolveRendererUrl(relativeHtmlPath: string): string {
    return pathToFileURL(path.join(__dirname, "../renderer", relativeHtmlPath)).toString();
  }
}

export const builtInBrowserService = new BuiltInBrowserService();

function fitWindowSize(preferred: number, minimum: number, available: number): number {
  return Math.max(minimum, Math.min(preferred, available > 0 ? available : preferred));
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeBrowserUrl(value: string | undefined): string {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return browserHomeUrl;
  }
  if (isBrowserHomeUrl(trimmed)) {
    return browserHomeUrl;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return isHttpUrl(trimmed) ? trimmed : `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }
  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(trimmed) || trimmed.includes(".")) {
    return `https://${trimmed}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function resolveInstalledBrowserApps(config: AppConfig, runtimeApps: InstalledBrowserApp[]): InstalledBrowserApp[] {
  const apps = new Map<string, InstalledBrowserApp>();
  for (const plugin of config.plugins ?? []) {
    if (plugin.enabled === false) {
      continue;
    }
    if (plugin.id === "claude-design") {
      continue;
    }
    for (const app of configuredBrowserAppsForPlugin(plugin.id, plugin.apps)) {
      const normalized = normalizeConfiguredBrowserApp(config, plugin.id, app, apps.size + 1);
      if (normalized) {
        apps.set(`${normalized.pluginId}:${normalized.id}`, normalized);
      }
    }
  }
  for (const app of runtimeApps) {
    if (app.pluginId === "claude-design") {
      continue;
    }
    apps.set(`${app.pluginId}:${app.id}`, { ...app });
  }
  return [...apps.values()];
}

function configuredBrowserAppsForPlugin(_pluginId: string, apps: GatewayPluginAppConfig[] | undefined): GatewayPluginAppConfig[] {
  if (apps?.length) {
    return apps;
  }
  return [];
}

function normalizeConfiguredBrowserApp(config: AppConfig, pluginId: string, app: GatewayPluginAppConfig, index: number): InstalledBrowserApp | undefined {
  const name = app.name?.trim();
  const url = app.url?.trim();
  if (!name || !url) {
    return undefined;
  }

  return {
    ...(app.description?.trim() ? { description: app.description.trim() } : {}),
    ...(app.icon?.trim() ? { icon: app.icon.trim() } : {}),
    id: app.id?.trim() || sanitizeBrowserAppId(`${name}-${url}`) || `app-${index}`,
    name,
    pluginId,
    url: resolveGatewayBrowserAppUrl(config, url)
  };
}

function resolveGatewayBrowserAppUrl(config: AppConfig, url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed === "about:blank") {
    return trimmed;
  }
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const host = normalizeGatewayBrowserAppHost(config.gateway?.host || config.HOST || "127.0.0.1");
  const port = config.gateway?.port || config.PORT || 3456;
  return `http://${host}:${port}${path}`;
}

function normalizeGatewayBrowserAppHost(host: string): string {
  if (!host || host === "0.0.0.0") return "127.0.0.1";
  if (host === "::" || host === "[::]") return "[::1]";
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeBrowserAppId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isBrowserHomeUrl(value: string): boolean {
  return value.trim().toLowerCase() === browserHomeUrl;
}

function titleFromUrl(value: string): string {
  try {
    return new URL(value).hostname || "New Tab";
  } catch {
    return "New Tab";
  }
}

function defaultAutomationHandoffMessage(kind?: BuiltInBrowserAutomationHandoffKind): string {
  if (kind === "login_required") {
    return "Please sign in on this page, then click Done.";
  }
  if (kind === "verification_code") {
    return "Please enter the verification code, then click Done.";
  }
  if (kind === "human_verification") {
    return "Please complete the human verification, then click Done.";
  }
  if (kind === "blocked") {
    return "Please resolve the blocker on this page, then click Done.";
  }
  return "Please complete the requested browser step, then click Done.";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
