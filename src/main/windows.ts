import { app, BrowserWindow, screen } from "electron";
import path from "node:path";
import { APP_NAME, IPC_CHANNELS } from "./constants";

type WindowName = "main" | string;

const titleBarHeight = 46;

class WindowsManager {
  private windows = new Map<WindowName, BrowserWindow>();

  createMainWindow(): BrowserWindow {
    const existing = this.getWindow("main");
    if (existing) {
      existing.focus();
      return existing;
    }

    const { height: availableHeight, width: availableWidth } = screen.getPrimaryDisplay().workAreaSize;
    const minHeight = 420;
    const minWidth = 360;
    const height = fitWindowSize(760, minHeight, availableHeight - 48);
    const width = fitWindowSize(1180, minWidth, availableWidth - 48);

    const window = new BrowserWindow({
      height,
      minHeight,
      minWidth,
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
        webSecurity: true,
        webviewTag: true
      },
      width
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
