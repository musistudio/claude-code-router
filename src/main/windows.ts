import { app, BrowserWindow, screen, type Rectangle } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadPersistedAppSetting, replacePersistedAppSetting } from "./app-config-store";
import { APP_NAME, IPC_CHANNELS, ONBOARDING_FINISHED_FILE } from "./constants";

type WindowName = "main" | string;
type WindowBounds = { height: number; width: number; x?: number; y?: number };

const titleBarHeight = 46;
const mainWindowDefaultHeight = 760;
const mainWindowDefaultWidth = 1180;
const mainWindowMargin = 48;
const mainWindowMinHeight = 420;
const mainWindowMinWidth = 360;
const mainWindowBoundsSettingKey = "mainWindowBounds";
const mainWindowBoundsSaveDelayMs = 500;

class WindowsManager {
  private windows = new Map<WindowName, BrowserWindow>();

  createMainWindow(): BrowserWindow {
    const existing = this.getWindow("main");
    if (existing) {
      existing.focus();
      return existing;
    }

    const window = new BrowserWindow({
      ...getMainWindowDefaultBounds(),
      minHeight: mainWindowMinHeight,
      minWidth: mainWindowMinWidth,
      show: false,
      title: APP_NAME,
      ...(process.platform === "darwin"
        ? {
            titleBarStyle: "hiddenInset" as const,
            trafficLightPosition: {
              x: 16,
              y: Math.round((titleBarHeight - 14) / 2)
            }
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

    const contentReady = new Promise<void>((resolve) => {
      window.once("ready-to-show", () => resolve());
    });
    void Promise.all([contentReady, restoreMainWindowBounds(window)]).then(() => {
      if (!window.isDestroyed()) {
        window.show();
      }
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

app.on("before-quit", () => {
  windowsManager.broadcast(IPC_CHANNELS.appBeforeQuit);
});

function fitWindowSize(preferred: number, minimum: number, available: number): number {
  return Math.max(minimum, Math.min(preferred, available > 0 ? available : preferred));
}

function getMainWindowDefaultBounds(): WindowBounds {
  const { height: availableHeight, width: availableWidth } = screen.getPrimaryDisplay().workAreaSize;

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

// Restores the user's last window position/size instead of forcing a
// full-workarea size on every launch. A full-workarea size is only applied
// once, the very first time a window is created after onboarding finishes
// (before any bounds have been saved) -- from then on, whatever the user
// resizes/moves the window to is remembered on subsequent launches.
async function restoreMainWindowBounds(window: BrowserWindow): Promise<void> {
  const stored = await loadStoredMainWindowBounds();
  if (window.isDestroyed()) {
    return;
  }

  if (stored) {
    window.setBounds(stored);
  } else if (existsSync(ONBOARDING_FINISHED_FILE)) {
    window.setBounds(getMainWindowScreenBounds());
  }

  registerMainWindowBoundsPersistence(window);
}

function registerMainWindowBoundsPersistence(window: BrowserWindow): void {
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const scheduleSave = () => {
    if (window.isDestroyed() || window.isMinimized()) {
      return;
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void replacePersistedAppSetting(mainWindowBoundsSettingKey, window.getBounds());
    }, mainWindowBoundsSaveDelayMs);
  };

  window.on("resize", scheduleSave);
  window.on("move", scheduleSave);
  window.on("close", () => {
    clearTimeout(saveTimer);
    if (!window.isMinimized()) {
      void replacePersistedAppSetting(mainWindowBoundsSettingKey, window.getBounds());
    }
  });
}

async function loadStoredMainWindowBounds(): Promise<Rectangle | undefined> {
  const raw = await loadPersistedAppSetting(mainWindowBoundsSettingKey);
  const bounds = parseMainWindowBounds(raw);
  if (!bounds) {
    return undefined;
  }
  return isBoundsOnAnyDisplay(bounds) ? bounds : undefined;
}

function parseMainWindowBounds(value: unknown): Rectangle | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const { height, width, x, y } = value as Record<string, unknown>;
  if (typeof height !== "number" || typeof width !== "number" || typeof x !== "number" || typeof y !== "number") {
    return undefined;
  }
  return { height, width, x, y };
}

function isBoundsOnAnyDisplay(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some((display) => rectanglesIntersect(bounds, display.workArea));
}

function rectanglesIntersect(a: Rectangle, b: Rectangle): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
