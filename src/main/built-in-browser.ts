import { randomUUID } from "node:crypto";
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
  type MenuItemConstructorOptions
} from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AppConfig, BuiltInBrowserState, BuiltInBrowserTabState, GatewayPluginAppConfig, InstalledBrowserApp } from "../shared/app";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import { APP_NAME } from "./constants";
import { pluginService } from "./plugins/service";
import { proxyService } from "./proxy/service";

type BrowserTab = BuiltInBrowserTabState & {
  view: WebContentsView;
};

const browserChromeHeight = 82;
const browserHomeUrl = "about:blank";
const browserPartition = "persist:ccr-built-in-browser";
const titleBarHeight = 46;

class BuiltInBrowserService {
  private activeTabId?: string;
  private apps: InstalledBrowserApp[] = [];
  private proxyConfigKey = "";
  private tabOrder: string[] = [];
  private tabs = new Map<string, BrowserTab>();
  private window?: BrowserWindow;

  constructor() {
    this.registerIpcHandlers();
  }

  async open(config: AppConfig): Promise<void> {
    await this.syncProxy(config);

    const window = this.window && !this.window.isDestroyed() ? this.window : this.createWindow();
    if (this.tabs.size === 0) {
      this.createTab(browserHomeUrl);
    }
    if (window.isMinimized()) {
      window.restore();
    }
    this.layoutActiveView();
    window.show();
    window.focus();
    this.sendState();
  }

  async syncProxy(config: AppConfig): Promise<void> {
    this.syncApps(config);

    const browserSession = session.fromPartition(browserPartition);
    if (config.proxy.enabled) {
      await proxyService.refreshUpstreamProxyFromCurrentSystem();
    }
    const proxyStatus = proxyService.getStatus();
    const shouldUseProxy = Boolean(
      config.proxy.enabled &&
      proxyStatus.state === "running" &&
      proxyStatus.endpoint
    );
    const proxyConfig = shouldUseProxy
      ? {
          mode: "fixed_servers" as const,
          proxyBypassRules: "<-loopback>",
          proxyRules: electronProxyRules(proxyStatus.endpoint)
        }
      : {
          mode: "direct" as const
        };
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
    await browserSession.setProxy({ mode: "direct" });
    await browserSession.forceReloadProxyConfig();
    this.proxyConfigKey = JSON.stringify({ mode: "direct" });
  }

  private registerIpcHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.browserGetState, (event) => {
      this.assertBrowserSender(event);
      return this.getState();
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
    window.once("ready-to-show", () => {
      if (!window.isDestroyed()) {
        window.show();
      }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("did-finish-load", () => this.sendState());

    void window.loadURL(this.resolveRendererUrl("pages/browser/index.html"));
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
    void view.webContents.loadURL(tab.url);
    this.sendState();
    return tab;
  }

  private configureTab(tab: BrowserTab): void {
    const { webContents } = tab.view;
    webContents.setWindowOpenHandler(({ url }) => {
      if (isHttpUrl(url)) {
        this.createTab(url);
      }
      return { action: "deny" };
    });
    webContents.on("context-menu", (_event, params) => {
      this.showContextMenu(tab, params);
    });
    webContents.on("page-title-updated", (_event, title) => {
      tab.title = title || titleFromUrl(tab.url);
      this.sendState();
    });
    webContents.on("did-start-loading", () => {
      tab.isLoading = true;
      this.updateTabNavigationState(tab);
    });
    webContents.on("did-stop-loading", () => {
      tab.isLoading = false;
      this.updateTabNavigationState(tab);
    });
    webContents.on("did-navigate", (_event, url) => {
      tab.url = url;
      tab.title = tab.title || titleFromUrl(url);
      if (tab.id === this.activeTabId) {
        this.layoutActiveView();
      }
      this.updateTabNavigationState(tab);
    });
    webContents.on("did-navigate-in-page", (_event, url) => {
      tab.url = url;
      if (tab.id === this.activeTabId) {
        this.layoutActiveView();
      }
      this.updateTabNavigationState(tab);
    });
    webContents.on("did-fail-load", (_event, errorCode, _errorDescription, validatedUrl) => {
      if (errorCode !== -3) {
        tab.isLoading = false;
        tab.url = validatedUrl || tab.url;
        if (tab.id === this.activeTabId) {
          this.layoutActiveView();
        }
        this.updateTabNavigationState(tab);
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
    void tab.view.webContents.loadURL(nextUrl);
    this.sendState();
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
      height: Math.max(0, height - browserChromeHeight),
      width,
      x: 0,
      y: browserChromeHeight
    });
  }

  private getState(): BuiltInBrowserState {
    return {
      activeTabId: this.activeTabId,
      apps: this.apps.map((app) => ({ ...app })),
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
    return trimmed;
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
    const configuredApps = plugin.apps?.length ? plugin.apps : defaultBrowserAppsForPlugin(plugin);
    for (const app of configuredApps) {
      const normalized = normalizeConfiguredBrowserApp(plugin.id, app, apps.size + 1);
      if (normalized) {
        apps.set(`${normalized.pluginId}:${normalized.id}`, normalized);
      }
    }
  }
  for (const app of runtimeApps) {
    apps.set(`${app.pluginId}:${app.id}`, { ...app });
  }
  return [...apps.values()];
}

function defaultBrowserAppsForPlugin(plugin: AppConfig["plugins"][number]): GatewayPluginAppConfig[] {
  if (plugin.id !== "claude-design") {
    return [];
  }
  const config = isPlainRecord(plugin.config) ? plugin.config : {};
  const host = stringValue(config.host) || "claude.ai";
  return [
    {
      description: "Open Claude Design through the CCR browser proxy.",
      id: "claude-design",
      name: "Claude Design",
      url: `https://${host}/design`
    }
  ];
}

function normalizeConfiguredBrowserApp(pluginId: string, app: GatewayPluginAppConfig, index: number): InstalledBrowserApp | undefined {
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
    url
  };
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

function electronProxyRules(endpoint: string): string {
  const parsed = new URL(endpoint);
  const host = parsed.hostname.includes(":") ? `[${parsed.hostname}]` : parsed.hostname;
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  return `http=${host}:${port};https=${host}:${port}`;
}
