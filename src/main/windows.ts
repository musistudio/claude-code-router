import { app, BrowserWindow, screen } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { APP_NAME, IPC_CHANNELS, ONBOARDING_FINISHED_FILE } from "./constants";

type WindowName = "main" | string;
type WindowBounds = { height: number; width: number; x?: number; y?: number };

const titleBarHeight = 46;
const mainWindowDefaultHeight = 760;
const mainWindowDefaultWidth = 1180;
const mainWindowMargin = 48;
const mainWindowMinHeight = 420;
const mainWindowMinWidth = 360;

class WindowsManager {
  private windows = new Map<WindowName, BrowserWindow>();

  createMainWindow(): BrowserWindow {
    const existing = this.getWindow("main");
    if (existing) {
      existing.focus();
      return existing;
    }

    const bounds = getMainWindowInitialBounds();

    const window = new BrowserWindow({
      ...bounds,
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
        : { titleBarStyle: "hidden" as const }),
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
    return `file://${path.join(__dirname, "../renderer", relativeHtmlPath)}`;
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

function getMainWindowInitialBounds(): WindowBounds {
  const { height: availableHeight, width: availableWidth } = screen.getPrimaryDisplay().workAreaSize;

  if (existsSync(ONBOARDING_FINISHED_FILE)) {
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
