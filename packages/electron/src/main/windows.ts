import { app, BrowserWindow, screen, shell } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_NAME, IPC_CHANNELS } from "@ccr/core/config/constants";
import { configureClaudeDesignWindowCdp, type ClaudeDesignWindowCdpOptions } from "./claude-design-window";

type WindowName = "main" | string;
type WindowBounds = { height: number; width: number; x?: number; y?: number };
type PluginAppWindowOptions = {
  claudeDesignCdp?: ClaudeDesignWindowCdpOptions;
  id: string;
  title: string;
  url: string;
};

const titleBarHeight = 46;
const macOSTrafficLightDiameter = 14;
const mainWindowTrafficLightPosition = {
  x: 16,
  y: Math.round((titleBarHeight - macOSTrafficLightDiameter) / 2)
};
const pluginAppTrafficLightPosition = {
  x: 16,
  y: 10
};
const mainWindowDefaultHeight = 760;
const mainWindowDefaultWidth = 1180;
const mainWindowMargin = 48;
const mainWindowMinHeight = 420;
const mainWindowMinWidth = 360;
const pluginAppWindowDefaultHeight = 760;
const pluginAppWindowDefaultWidth = 1180;
const pluginAppWindowMinHeight = 520;
const pluginAppWindowMinWidth = 760;
const pluginSmallWindowDefaultHeight = 640;
const pluginSmallWindowDefaultWidth = 420;
const pluginSmallWindowMinHeight = 460;
const pluginSmallWindowMinWidth = 360;
const pluginAppDiagnostics = new WeakSet<object>();
const pluginAppScreenshotCaptures = new WeakSet<object>();
const pluginAppScriptRuns = new WeakSet<object>();

class WindowsManager {
  private onboardingFinished = false;
  private windows = new Map<WindowName, BrowserWindow>();

  setOnboardingFinished(finished: boolean): void {
    this.onboardingFinished = finished;
  }

  createMainWindow(): BrowserWindow {
    const existing = this.getWindow("main");
    if (existing) {
      existing.focus();
      return existing;
    }

    const bounds = getMainWindowInitialBounds(this.onboardingFinished);

    const window = new BrowserWindow({
      ...bounds,
      minHeight: mainWindowMinHeight,
      minWidth: mainWindowMinWidth,
      show: false,
      title: APP_NAME,
      ...(process.platform === "darwin"
        ? {
            titleBarStyle: "hiddenInset" as const,
            trafficLightPosition: mainWindowTrafficLightPosition
          }
        : {}),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "preload.js"),
        sandbox: true,
        webSecurity: true
      }
    });

    this.windows.set("main", window);

    window.once("ready-to-show", () => {
      if (!window.isDestroyed()) {
        window.show();
      }
    });
    window.on("close", (event) => {
      if (!shouldHideMainWindowOnClose()) {
        return;
      }
      event.preventDefault();
      window.hide();
    });
    window.on("closed", () => this.windows.delete("main"));
    window.webContents.on("page-title-updated", (_event, title) => {
      window.setTitle(title || APP_NAME);
    });

    void window.loadURL(this.resolveRendererUrl("pages/home/index.html"));

    if (process.env.NODE_ENV === "development") {
      window.webContents.openDevTools({ mode: "detach" });
    }

    return window;
  }

  showMainWindow(): BrowserWindow {
    const window = this.getWindow("main") ?? this.createMainWindow();
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
    return window;
  }

  openPluginAppWindow(options: PluginAppWindowOptions): BrowserWindow {
    const windowName = `plugin-app:${options.id}`;
    const existing = this.getWindow(windowName);
    if (existing) {
      applyPluginAppMacWindowControls(existing);
      existing.setMinimumSize(pluginAppWindowMinWidth, pluginAppWindowMinHeight);
      const [width, height] = existing.getSize();
      if (width < pluginAppWindowMinWidth || height < pluginAppWindowMinHeight) {
        existing.setBounds(getPluginAppWindowInitialBounds());
      }
      if (existing.isMinimized()) {
        existing.restore();
      }
      existing.show();
      existing.focus();
      configurePluginAppDiagnostics(existing, options);
      if (options.claudeDesignCdp || existing.webContents.getURL() !== options.url) {
        void loadPluginAppWindowUrl(existing, options);
      }
      return existing;
    }

    const bounds = getPluginAppWindowInitialBounds();
    const window = new BrowserWindow({
      ...bounds,
      minHeight: pluginAppWindowMinHeight,
      minWidth: pluginAppWindowMinWidth,
      show: false,
      title: options.title,
      ...(process.platform === "darwin"
        ? {
            titleBarStyle: "hiddenInset" as const,
            trafficLightPosition: pluginAppTrafficLightPosition
          }
        : {}),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: pluginAppSessionPartition(options.id),
        sandbox: true,
        webSecurity: true
      }
    });

    this.windows.set(windowName, window);
    applyPluginAppMacWindowControls(window);

    let loadingFailurePage = false;
    window.once("ready-to-show", () => {
      if (!window.isDestroyed()) {
        window.show();
      }
    });
    window.on("closed", () => this.windows.delete(windowName));
    window.webContents.on("page-title-updated", (_event, title) => {
      window.setTitle(title || options.title);
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (isPluginSmallWindowUrl(options.url, url)) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            ...getPluginSmallWindowBounds(window),
            alwaysOnTop: false,
            backgroundColor: "#00000000",
            frame: false,
            fullscreenable: false,
            maximizable: false,
            minHeight: pluginSmallWindowMinHeight,
            minWidth: pluginSmallWindowMinWidth,
            resizable: true,
            title: `${options.title} Chat`,
            transparent: true,
            ...(process.platform === "darwin"
              ? {
                  vibrancy: "fullscreen-ui" as const,
                  visualEffectState: "active" as const
                }
              : {}),
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              partition: pluginAppSessionPartition(options.id),
              sandbox: true,
              webSecurity: true
            }
          }
        };
      }
      void shell.openExternal(url);
      return { action: "deny" };
    });
    window.webContents.on("did-create-window", (childWindow, details) => {
      configurePluginChildWindow(childWindow, {
        parentUrl: options.url,
        title: details.options.title || options.title,
        url: details.url
      });
    });
    window.webContents.on("will-navigate", (event, url) => {
      if (loadingFailurePage && url.startsWith("data:text/html")) {
        return;
      }
      if (isAllowedPluginAppNavigation(options, url)) {
        return;
      }
      event.preventDefault();
      void shell.openExternal(url);
    });
    window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame === false || window.isDestroyed() || loadingFailurePage) {
        return;
      }
      if (isPluginNavigationAbort(errorCode)) {
        return;
      }
      loadingFailurePage = true;
      void window.loadURL(pluginAppLoadFailurePageUrl({
        errorCode,
        errorDescription,
        title: options.title,
        url: validatedURL || options.url
      })).finally(() => {
        loadingFailurePage = false;
        if (!window.isDestroyed()) {
          window.show();
        }
      });
    });

    configurePluginAppDiagnostics(window, options);
    void loadPluginAppWindowUrl(window, options);
    return window;
  }

  resizeMainWindowToScreenSize(): void {
    const window = this.getWindow("main");
    if (!window) {
      return;
    }
    window.setBounds(getMainWindowScreenBounds());
  }

  getWindow(name: WindowName): BrowserWindow | undefined {
    const window = this.windows.get(name);
    if (!window || window.isDestroyed()) {
      this.windows.delete(name);
      return undefined;
    }
    return window;
  }

  broadcast(channel: string, payload?: unknown): void {
    for (const window of this.windows.values()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send(channel, payload);
      }
    }
  }

  private resolveRendererUrl(relativeHtmlPath: string): string {
    return pathToFileURL(path.join(__dirname, "../renderer", relativeHtmlPath)).toString();
  }
}

const windowsManager = new WindowsManager();

export default windowsManager;

let appIsQuitting = false;

app.on("before-quit", () => {
  appIsQuitting = true;
  windowsManager.broadcast(IPC_CHANNELS.appBeforeQuit);
});

function shouldHideMainWindowOnClose(): boolean {
  return process.platform === "win32" && !appIsQuitting;
}

function fitWindowSize(preferred: number, minimum: number, available: number): number {
  return Math.max(minimum, Math.min(preferred, available > 0 ? available : preferred));
}

function getMainWindowInitialBounds(onboardingFinished: boolean): WindowBounds {
  const { height: availableHeight, width: availableWidth } = screen.getPrimaryDisplay().workAreaSize;

  if (onboardingFinished) {
    return getMainWindowScreenBounds();
  }

  return {
    height: fitWindowSize(mainWindowDefaultHeight, mainWindowMinHeight, availableHeight - mainWindowMargin),
    width: fitWindowSize(mainWindowDefaultWidth, mainWindowMinWidth, availableWidth - mainWindowMargin)
  };
}

function getMainWindowScreenBounds(): Required<WindowBounds> {
  const { workArea } = screen.getPrimaryDisplay();

  return {
    height: Math.max(mainWindowMinHeight, workArea.height),
    width: Math.max(mainWindowMinWidth, workArea.width),
    x: workArea.x,
    y: workArea.y
  };
}

function getPluginAppWindowInitialBounds(): WindowBounds {
  const { height: availableHeight, width: availableWidth } = screen.getPrimaryDisplay().workAreaSize;
  return {
    height: fitWindowSize(pluginAppWindowDefaultHeight, pluginAppWindowMinHeight, availableHeight - mainWindowMargin),
    width: fitWindowSize(pluginAppWindowDefaultWidth, pluginAppWindowMinWidth, availableWidth - mainWindowMargin)
  };
}

function getPluginSmallWindowBounds(parentWindow: BrowserWindow): Required<WindowBounds> {
  const parentBounds = parentWindow.getBounds();
  const { workArea } = screen.getDisplayMatching(parentBounds);
  const width = fitWindowSize(pluginSmallWindowDefaultWidth, pluginSmallWindowMinWidth, workArea.width - mainWindowMargin);
  const height = fitWindowSize(pluginSmallWindowDefaultHeight, pluginSmallWindowMinHeight, workArea.height - mainWindowMargin);
  const x = clampNumber(parentBounds.x + parentBounds.width - width - 32, workArea.x + 8, workArea.x + workArea.width - width - 8);
  const y = clampNumber(parentBounds.y + 72, workArea.y + 8, workArea.y + workArea.height - height - 8);
  return { height, width, x, y };
}

function pluginAppSessionPartition(id: string): string {
  const safeId = id
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "default";
  return `persist:ccr-plugin-app-${safeId}`;
}

function applyPluginAppMacWindowControls(window: BrowserWindow): void {
  if (process.platform !== "darwin" || window.isDestroyed()) {
    return;
  }
  window.setWindowButtonPosition(pluginAppTrafficLightPosition);
}

function configurePluginChildWindow(
  window: BrowserWindow,
  options: {
    parentUrl: string;
    title: string;
    url: string;
  }
): void {
  window.webContents.on("page-title-updated", (_event, title) => {
    window.setTitle(title || options.title);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (handlePluginChildWindowControl(window, url)) {
      return { action: "deny" };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (isSameOrigin(options.parentUrl, url) && isSamePluginRoute(options.parentUrl, url)) {
      return;
    }
    event.preventDefault();
    void shell.openExternal(url);
  });
}

function isPluginSmallWindowUrl(parentUrl: string, targetUrl: string): boolean {
  try {
    const target = new URL(targetUrl);
    return (
      isSameOrigin(parentUrl, targetUrl) &&
      isSamePluginRoute(parentUrl, targetUrl) &&
      target.searchParams.get("mode") === "small-chat"
    );
  } catch {
    return false;
  }
}

function handlePluginChildWindowControl(window: BrowserWindow, targetUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "ccr-plugin-window:") {
    return false;
  }

  if (url.hostname === "set-pinned") {
    const pinned = url.searchParams.get("pinned") === "1" || url.searchParams.get("pinned") === "true";
    window.setAlwaysOnTop(pinned, pinned ? "floating" : "normal");
    return true;
  }

  if (url.hostname === "close") {
    window.close();
    return true;
  }

  return true;
}

function isSamePluginRoute(parentUrl: string, targetUrl: string): boolean {
  const routePrefix = pluginRoutePrefix(parentUrl);
  if (!routePrefix) {
    return false;
  }
  try {
    return new URL(targetUrl).pathname.startsWith(routePrefix);
  } catch {
    return false;
  }
}

function isAllowedPluginAppNavigation(options: PluginAppWindowOptions, targetUrl: string): boolean {
  if (isSameOrigin(options.url, targetUrl)) {
    return true;
  }
  return Boolean(options.claudeDesignCdp?.backendUrl && isSameOrigin(options.claudeDesignCdp.backendUrl, targetUrl));
}

function isPluginNavigationAbort(errorCode: number): boolean {
  return errorCode === -3;
}

function pluginRoutePrefix(url: string): string | undefined {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    if (segments[0] !== "plugins" || !segments[1]) {
      return undefined;
    }
    return `/${segments[0]}/${segments[1]}/`;
  } catch {
    return undefined;
  }
}

function isSameOrigin(baseUrl: string, targetUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const target = new URL(targetUrl);
    return base.protocol === target.protocol && base.host === target.host;
  } catch {
    return false;
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function configurePluginAppDiagnostics(window: BrowserWindow, options: PluginAppWindowOptions): void {
  if (!options.claudeDesignCdp || process.env.NODE_ENV !== "development") {
    return;
  }
  if (pluginAppDiagnostics.has(window.webContents)) {
    return;
  }
  pluginAppDiagnostics.add(window.webContents);

  const prefix = `[plugin-app:${options.id}]`;
  if (!window.webContents.isDevToolsOpened()) {
    window.webContents.openDevTools({ mode: "detach" });
  }
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level < 1) {
      return;
    }
    console.warn(`${prefix} console[${level}] ${message} (${sourceId || "unknown"}:${line || 0})`);
  });
  window.webContents.on("did-start-loading", () => {
    console.info(`${prefix} did-start-loading ${window.webContents.getURL()}`);
  });
  window.webContents.on("did-start-navigation", (_event, url, isInPlace, isMainFrame) => {
    console.info(`${prefix} did-start-navigation main=${isMainFrame !== false} inPlace=${isInPlace} ${url}`);
  });
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.warn(`${prefix} did-fail-load main=${isMainFrame !== false} code=${errorCode} url=${validatedURL} ${errorDescription}`);
  });
  window.webContents.on("dom-ready", () => {
    console.info(`${prefix} dom-ready ${window.webContents.getURL()}`);
    logPluginAppPageSummary(window, prefix, "dom-ready");
  });
  window.webContents.on("did-navigate", (_event, url) => {
    console.info(`${prefix} did-navigate ${url}`);
  });
  window.webContents.on("did-redirect-navigation", (_event, url, isInPlace, isMainFrame) => {
    console.info(`${prefix} did-redirect-navigation main=${isMainFrame !== false} inPlace=${isInPlace} ${url}`);
  });
  window.webContents.on("did-finish-load", () => {
    console.info(`${prefix} did-finish-load ${window.webContents.getURL()}`);
    logPluginAppPageSummary(window, prefix, "did-finish-load");
  });
  window.webContents.on("did-stop-loading", () => {
    console.info(`${prefix} did-stop-loading ${window.webContents.getURL()}`);
    logPluginAppPageSummary(window, prefix, "did-stop-loading");
    schedulePluginAppPageSummaries(window, prefix, "did-stop-loading");
    schedulePluginAppScript(window, prefix);
    schedulePluginAppScreenshot(window, prefix);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    console.warn(`${prefix} render-process-gone ${details.reason} exitCode=${details.exitCode}`);
  });
}

function schedulePluginAppScreenshot(window: BrowserWindow, prefix: string): void {
  const targetPath = process.env.CCR_PLUGIN_APP_SCREENSHOT_PATH;
  if (!targetPath || process.env.NODE_ENV !== "development") {
    return;
  }
  const targetId = process.env.CCR_PLUGIN_APP_SCREENSHOT_ID;
  if (targetId && !prefix.includes(targetId)) {
    return;
  }
  if (pluginAppScreenshotCaptures.has(window.webContents)) {
    return;
  }
  pluginAppScreenshotCaptures.add(window.webContents);

  const delayMs = clampNumber(Number(process.env.CCR_PLUGIN_APP_SCREENSHOT_DELAY_MS) || 3_000, 250, 30_000);
  setTimeout(() => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) {
      return;
    }
    void window.webContents.capturePage().then((image) => {
      writeFileSync(targetPath, image.toPNG(), { mode: 0o600 });
      console.info(`${prefix} screenshot ${targetPath}`);
    }).catch((error: unknown) => {
      console.warn(`${prefix} screenshot failed: ${formatError(error)}`);
    });
  }, delayMs);
}

function schedulePluginAppScript(window: BrowserWindow, prefix: string): void {
  const scriptPath = process.env.CCR_PLUGIN_APP_SCRIPT_PATH;
  if (!scriptPath || process.env.NODE_ENV !== "development") {
    return;
  }
  const targetId = process.env.CCR_PLUGIN_APP_SCRIPT_ID;
  if (targetId && !prefix.includes(targetId)) {
    return;
  }
  if (process.env.CCR_PLUGIN_APP_SCRIPT_ON_EACH_LOAD !== "1" && pluginAppScriptRuns.has(window.webContents)) {
    return;
  }
  pluginAppScriptRuns.add(window.webContents);

  const delayMs = clampNumber(Number(process.env.CCR_PLUGIN_APP_SCRIPT_DELAY_MS) || 1_000, 250, 30_000);
  setTimeout(() => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) {
      return;
    }
    let script: string;
    try {
      script = readFileSync(scriptPath, "utf8");
    } catch (error) {
      console.warn(`${prefix} script read failed: ${formatError(error)}`);
      return;
    }
    void window.webContents.executeJavaScript(script, true).then((result: unknown) => {
      console.info(`${prefix} script ${scriptPath} result ${stringifyPluginAppScriptResult(result)}`);
    }).catch((error: unknown) => {
      console.warn(`${prefix} script ${scriptPath} failed: ${formatError(error)}`);
    });
  }, delayMs);
}

function stringifyPluginAppScriptResult(result: unknown): string {
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function schedulePluginAppPageSummaries(window: BrowserWindow, prefix: string, eventName: string): void {
  for (const delayMs of [1000, 3000, 8000]) {
    setTimeout(() => {
      if (window.isDestroyed() || window.webContents.isDestroyed()) {
        return;
      }
      logPluginAppPageSummary(window, prefix, `${eventName}+${delayMs}ms`);
    }, delayMs);
  }
}

function logPluginAppPageSummary(window: BrowserWindow, prefix: string, eventName: string): void {
  void window.webContents.executeJavaScript(
    "(() => { const iframeSummaries = Array.from(document.querySelectorAll('iframe')).slice(0, 5).map((iframe) => { const summary = { src: iframe.src || iframe.getAttribute('src') || '', title: iframe.title || '', bodyText: '', htmlLength: 0, readyState: '', accessError: '' }; try { const doc = iframe.contentDocument; summary.readyState = doc ? doc.readyState : ''; summary.bodyText = doc && doc.body ? doc.body.innerText.slice(0, 800) : ''; summary.htmlLength = doc && doc.documentElement ? doc.documentElement.outerHTML.length : 0; } catch (error) { summary.accessError = error instanceof Error ? error.message : String(error); } return summary; }); return { url: location.href, title: document.title, bodyText: document.body ? document.body.innerText.slice(0, 800) : '', htmlLength: document.documentElement ? document.documentElement.outerHTML.length : 0, iframeSummaries, readyState: document.readyState }; })()"
  ).then((summary: unknown) => {
    console.info(`${prefix} page-summary[${eventName}] ${JSON.stringify(summary)}`);
  }).catch((error: unknown) => {
    console.warn(`${prefix} page-summary[${eventName}] failed: ${formatError(error)}`);
  });
}

async function loadPluginAppWindowUrl(window: BrowserWindow, options: PluginAppWindowOptions): Promise<void> {
  try {
    if (options.claudeDesignCdp) {
      await configureClaudeDesignWindowCdp(window.webContents, options.claudeDesignCdp);
    }
    if (!window.isDestroyed()) {
      await window.loadURL(options.url);
    }
  } catch (error) {
    console.warn(`[window] Failed to load plugin app ${options.id}: ${formatError(error)}`);
    if (!window.isDestroyed()) {
      await window.loadURL(pluginAppLoadFailurePageUrl({
        errorCode: 0,
        errorDescription: formatError(error),
        title: options.title,
        url: options.url
      }));
    }
  }
}

function pluginAppLoadFailurePageUrl(options: {
  errorCode: number;
  errorDescription: string;
  title: string;
  url: string;
}): string {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(options.title)} failed to load</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      align-items: center;
      background: Canvas;
      color: CanvasText;
      display: flex;
      justify-content: center;
      margin: 0;
      min-height: 100vh;
    }
    main {
      box-sizing: border-box;
      max-width: 360px;
      padding: 28px;
      width: 100%;
    }
    h1 {
      font-size: 20px;
      line-height: 1.25;
      margin: 0 0 12px;
    }
    p {
      color: color-mix(in srgb, CanvasText 72%, transparent);
      font-size: 13px;
      line-height: 1.5;
      margin: 0 0 18px;
    }
    code {
      background: color-mix(in srgb, CanvasText 8%, transparent);
      border-radius: 6px;
      display: block;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      line-height: 1.45;
      margin: 0 0 18px;
      overflow-wrap: anywhere;
      padding: 10px 12px;
    }
    a {
      color: LinkText;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(options.title)} could not load</h1>
    <p>CCR could not reach the plugin page. Check that CCR is running and the plugin is enabled, then retry.</p>
    <code>${escapeHtml(options.errorDescription || `Load failed with code ${options.errorCode}`)}<br>${escapeHtml(options.url)}</code>
    <a href="${escapeHtml(options.url)}">Retry</a>
  </main>
</body>
</html>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
