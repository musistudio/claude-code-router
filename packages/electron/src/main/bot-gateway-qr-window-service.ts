import { BrowserWindow, shell } from "electron";
import type {
  BotGatewayQrWindowCloseRequest,
  BotGatewayQrWindowCloseResult,
  BotGatewayQrWindowOpenRequest,
  BotGatewayQrWindowOpenResult
} from "@ccr/core/contracts/app";

const qrWindows = new Map<string, BrowserWindow>();

export async function openBotGatewayQrWindow(
  request: BotGatewayQrWindowOpenRequest
): Promise<BotGatewayQrWindowOpenResult> {
  const sessionId = request.sessionId.trim();
  if (!sessionId) {
    throw new Error("QR window sessionId is required.");
  }

  const url = parseQrWindowUrl(request.url);
  const existing = qrWindows.get(sessionId);
  if (existing && !existing.isDestroyed()) {
    if (existing.webContents.getURL() !== url) {
      await loadQrWindowUrl(existing, url, Boolean(request.waitForScan));
    }
    existing.show();
    existing.focus();
    if (request.waitForScan) {
      return { opened: true, ...await waitForQrWindowClose(existing) };
    }
    return { opened: true };
  }

  const window = new BrowserWindow({
    height: 760,
    minHeight: 560,
    minWidth: 380,
    show: true,
    title: request.title?.trim() || "Weixin Login",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    },
    width: 460
  });

  qrWindows.set(sessionId, window);
  window.on("closed", () => {
    if (qrWindows.get(sessionId) === window) {
      qrWindows.delete(sessionId);
    }
  });
  window.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (isHttpUrl(targetUrl)) {
      void shell.openExternal(targetUrl);
    }
    return { action: "deny" };
  });

  window.show();
  window.focus();
  await loadQrWindowUrl(window, url, Boolean(request.waitForScan));
  if (!window.isDestroyed()) {
    window.show();
    window.focus();
  }
  if (request.waitForScan) {
    return { opened: true, ...await waitForQrWindowClose(window) };
  }
  return { opened: true };
}

export function closeBotGatewayQrWindow(
  request: BotGatewayQrWindowCloseRequest
): BotGatewayQrWindowCloseResult {
  const sessionId = request.sessionId.trim();
  const window = qrWindows.get(sessionId);
  if (!window || window.isDestroyed()) {
    qrWindows.delete(sessionId);
    return { closed: false };
  }
  qrWindows.delete(sessionId);
  window.close();
  return { closed: true };
}

function parseQrWindowUrl(value: string): string {
  const trimmed = value.trim();
  if (!isHttpUrl(trimmed)) {
    throw new Error("Only http and https QR login URLs can be opened.");
  }
  return new URL(trimmed).toString();
}

async function loadQrWindowUrl(window: BrowserWindow, url: string, allowClosed: boolean) {
  try {
    await window.loadURL(url);
  } catch (error) {
    if (allowClosed && window.isDestroyed()) {
      return;
    }
    throw error;
  }
}

async function waitForQrWindowClose(
  window: BrowserWindow
): Promise<Omit<BotGatewayQrWindowOpenResult, "opened">> {
  if (window.isDestroyed()) {
    return { observed: true, reason: "closed" };
  }
  return new Promise((resolve) => {
    const onClosed = () => resolve({ observed: true, reason: "closed" });
    window.once("closed", onClosed);
  });
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
