import { BrowserWindow, Menu, Tray, app, nativeImage, screen } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import { loadAppConfig } from "./config";
import { APP_NAME } from "./constants";
import { getProviderAccountSnapshots } from "./provider-account-service";
import { getTodayUsageTotals, onUsageRecorded } from "./usage-store";
import type { AppConfig, ProviderAccountMeter, TrayBalanceProgressConfig, TrayIconPreference } from "../shared/app";

const popoverMenuWidth = 420;
const popoverPreferredHeight = 740;
const popoverDetailGap = 12;
const popoverDetailTopOffset = 0;
const popoverDetailWidth = 420;
const popoverMargin = 8;
const trayMenuBarIconSize = 20;
const trayTokenFallbackTitle = "0 tokens";
const trayIconFallbackPath = path.join(__dirname, "../assets/tray.png");
const trayMascotIconIds = ["violet", "orange", "cyan"] as const;

type TrayMascotIconId = (typeof trayMascotIconIds)[number];

const trayMascotIconPaths: Record<TrayMascotIconId, string> = {
  cyan: path.join(__dirname, "../assets/tray-cyan.png"),
  orange: path.join(__dirname, "../assets/tray-orange.png"),
  violet: path.join(__dirname, "../assets/tray-violet.png")
};

class TrayController {
  private activeDetailProvider?: string;
  private detailCloseTimer?: NodeJS.Timeout;
  private detailOpen = false;
  private detailPopover?: BrowserWindow;
  private ignorePopoverBlurUntil = 0;
  private popover?: BrowserWindow;
  private randomTrayIconDateKey?: string;
  private resolvedRandomTrayIcon?: TrayMascotIconId;
  private refreshTimer?: NodeJS.Timeout;
  private tray?: Tray;
  private trayBalanceProgress?: TrayBalanceProgressConfig;
  private trayIconPreference: TrayIconPreference = "random";
  private trayTotalTokens = 0;
  private unsubscribeUsageUpdates?: () => void;

  start(): void {
    if (!supportsTrayPlatform() || this.tray) {
      return;
    }

    const icon = createTrayIcon(this.resolveTrayIconId("random"));
    this.tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    this.applyTrayTitle(trayTokenFallbackTitle);
    this.tray.on("click", () => this.togglePopover());
    this.tray.on("right-click", () => this.showContextMenu());
    void this.refreshIconFromConfig();

    this.unsubscribeUsageUpdates = onUsageRecorded(() => {
      this.refreshUsageTitle();
    });
    this.refreshUsageTitle();
    this.refreshTimer = setInterval(() => {
      this.refreshUsageTitle();
    }, 15_000);
  }

  hidePopover(): void {
    this.clearDetailCloseTimer();
    this.detailOpen = false;
    this.activeDetailProvider = undefined;
    this.hideDetailPopover();
    if (this.popover && !this.popover.isDestroyed()) {
      this.popover.hide();
    }
  }

  destroy(): void {
    this.clearDetailCloseTimer();
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this.unsubscribeUsageUpdates?.();
    this.unsubscribeUsageUpdates = undefined;
    if (this.detailPopover && !this.detailPopover.isDestroyed()) {
      this.detailPopover.destroy();
      this.detailPopover = undefined;
    }
    if (this.popover && !this.popover.isDestroyed()) {
      this.popover.destroy();
      this.popover = undefined;
    }
    if (this.tray) {
      this.tray.destroy();
      this.tray = undefined;
    }
  }

  refreshUsageTitle(): void {
    this.refreshRandomTrayIconForCurrentDay();
    void this.refreshTrayTitle();
  }

  async refreshIconFromConfig(config?: AppConfig): Promise<void> {
    if (!supportsTrayPlatform() || !this.tray) {
      return;
    }

    const nextConfig = config ?? await loadAppConfig();
    const nextPreference = normalizeTrayIconPreference(nextConfig.trayIcon);
    if (nextPreference === "random" && this.trayIconPreference !== "random") {
      this.randomTrayIconDateKey = undefined;
      this.resolvedRandomTrayIcon = undefined;
    }
    this.trayIconPreference = nextPreference;
    this.trayBalanceProgress = normalizeTrayBalanceProgressConfig(nextConfig.trayBalanceProgress);
    if (nextPreference === "progress" && this.trayBalanceProgress) {
      await this.refreshBalanceProgressTrayIcon();
      return;
    }
    this.applyTrayIcon(this.resolveTrayIconId(nextPreference));
  }

  setDetailOpen(open: boolean, _provider?: string): void {
    if (open) {
      this.detailOpen = false;
      this.hideDetailPopover();
      this.repositionMenu(false);
      return;
    }
    this.scheduleDetailClose();
  }

  private togglePopover(): void {
    if (this.popover?.isVisible()) {
      this.hidePopover();
      return;
    }
    this.showPopover();
  }

  private showPopover(): void {
    const popover = this.ensurePopover();
    this.clearDetailCloseTimer();
    this.detailOpen = false;
    this.activeDetailProvider = undefined;
    this.hideDetailPopover();
    const { menu } = resolvePopoverLayout(this.tray?.getBounds(), false);

    popover.setBounds(menu, false);
    this.ignorePopoverBlurUntil = Date.now() + 120;
    popover.show();
    popover.focus();
    popover.moveTop();
  }

  private ensurePopover(): BrowserWindow {
    if (this.popover && !this.popover.isDestroyed()) {
      return this.popover;
    }

    this.popover = new BrowserWindow({
      acceptFirstMouse: true,
      alwaysOnTop: true,
      backgroundColor: "#00000000",
      frame: false,
      fullscreenable: false,
      hasShadow: true,
      height: popoverPreferredHeight,
      maximizable: false,
      minimizable: false,
      movable: false,
      roundedCorners: true,
      resizable: false,
      show: false,
      skipTaskbar: true,
      title: `${APP_NAME} Usage`,
      transparent: true,
      vibrancy: "hud",
      visualEffectState: "active",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "preload.js"),
        sandbox: true,
        webSecurity: true
      },
      width: popoverMenuWidth
    });

    this.popover.setAlwaysOnTop(true, "pop-up-menu");
    this.popover.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.popover.on("blur", () => this.handlePopoverBlur());
    this.popover.on("closed", () => {
      this.popover = undefined;
    });

    void this.popover.loadURL(createTrayPageUrl("menu"));
    return this.popover;
  }

  private ensureDetailPopover(provider?: string): BrowserWindow {
    if (this.detailPopover && !this.detailPopover.isDestroyed()) {
      return this.detailPopover;
    }

    this.detailPopover = new BrowserWindow({
      acceptFirstMouse: true,
      alwaysOnTop: true,
      backgroundColor: "#00000000",
      frame: false,
      fullscreenable: false,
      hasShadow: true,
      height: popoverPreferredHeight - popoverDetailTopOffset,
      maximizable: false,
      minimizable: false,
      movable: false,
      roundedCorners: true,
      resizable: false,
      show: false,
      skipTaskbar: true,
      title: `${APP_NAME} Usage Detail`,
      transparent: true,
      vibrancy: "hud",
      visualEffectState: "active",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "preload.js"),
        sandbox: true,
        webSecurity: true
      },
      width: popoverDetailWidth
    });

    this.detailPopover.setAlwaysOnTop(true, "pop-up-menu");
    this.detailPopover.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.detailPopover.on("blur", () => this.handlePopoverBlur());
    this.detailPopover.on("closed", () => {
      this.detailPopover = undefined;
    });

    this.activeDetailProvider = normalizeDetailProvider(provider);
    void this.detailPopover.loadURL(createTrayPageUrl("detail", this.activeDetailProvider));
    return this.detailPopover;
  }

  private showContextMenu(): void {
    const menu = Menu.buildFromTemplate([
      {
        enabled: false,
        label: formatTokenTitle(this.trayTotalTokens)
      },
      { type: "separator" },
      {
        click: () => this.showPopover(),
        label: "Show Usage"
      },
      { type: "separator" },
      {
        click: () => app.quit(),
        label: `Quit ${APP_NAME}`
      }
    ]);

    this.tray?.popUpContextMenu(menu);
  }

  private showDetailPopover(provider?: string): void {
    if (!this.popover || this.popover.isDestroyed() || !this.popover.isVisible()) {
      return;
    }

    this.clearDetailCloseTimer();
    this.detailOpen = true;

    const { detail, menu } = resolvePopoverLayout(this.tray?.getBounds(), true);
    if (detail.width < 320) {
      this.detailOpen = false;
      return;
    }

    this.popover.setBounds(menu, false);

    const detailPopover = this.ensureDetailPopover(provider);
    const nextProvider = normalizeDetailProvider(provider);
    if (this.activeDetailProvider !== nextProvider) {
      this.activeDetailProvider = nextProvider;
      void detailPopover.loadURL(createTrayPageUrl("detail", nextProvider));
    }

    detailPopover.setBounds(detail, false);
    this.ignorePopoverBlurUntil = Date.now() + 120;
    detailPopover.showInactive();
    detailPopover.moveTop();
  }

  private scheduleDetailClose(): void {
    this.clearDetailCloseTimer();
    this.detailCloseTimer = setTimeout(() => {
      this.detailCloseTimer = undefined;
      this.detailOpen = false;
      this.hideDetailPopover();
      this.repositionMenu(false);
    }, 140);
  }

  private clearDetailCloseTimer(): void {
    if (this.detailCloseTimer) {
      clearTimeout(this.detailCloseTimer);
      this.detailCloseTimer = undefined;
    }
  }

  private hideDetailPopover(): void {
    if (this.detailPopover && !this.detailPopover.isDestroyed()) {
      this.detailPopover.hide();
    }
  }

  private repositionMenu(detailOpen = this.detailOpen): void {
    if (!this.popover || this.popover.isDestroyed() || !this.popover.isVisible()) {
      return;
    }
    const { menu } = resolvePopoverLayout(this.tray?.getBounds(), detailOpen);
    this.popover.setBounds(menu, false);
  }

  private handlePopoverBlur(): void {
    setTimeout(() => {
      if (Date.now() < this.ignorePopoverBlurUntil) {
        return;
      }
      const focused = BrowserWindow.getFocusedWindow();
      if (focused && (focused === this.popover || focused === this.detailPopover)) {
        return;
      }
      this.hidePopover();
    }, 30);
  }

  private async refreshTrayTitle(): Promise<void> {
    if (!this.tray) {
      return;
    }

    try {
      const totals = await getTodayUsageTotals(undefined, { includeProxy: true });
      this.trayTotalTokens = Math.max(0, totals.totalTokens);
      if (this.trayIconPreference === "progress" && this.trayBalanceProgress) {
        await this.refreshBalanceProgressTrayIcon();
      }
      this.applyTrayTitle(formatTokenTitle(totals.totalTokens));
    } catch {
      this.applyTrayTitle(trayTokenFallbackTitle);
    }
  }

  private applyTrayTitle(title: string): void {
    if (!this.tray) {
      return;
    }
    if (supportsTrayTitle()) {
      this.tray.setTitle(title);
    }
    this.tray.setToolTip(`${APP_NAME} Usage\n${title}`);
  }

  private applyTrayIcon(iconId: TrayMascotIconId): void {
    if (!this.tray) {
      return;
    }
    const icon = createTrayIcon(iconId);
    this.tray.setImage(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  }

  private applyProgressTrayIcon(progress: number): void {
    if (!this.tray) {
      return;
    }
    const icon = createTrayProgressIcon(progress);
    this.tray.setImage(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  }

  private async refreshBalanceProgressTrayIcon(): Promise<void> {
    if (!this.trayBalanceProgress) {
      return;
    }
    try {
      const snapshots = await getProviderAccountSnapshots(this.trayBalanceProgress.provider);
      const snapshot = snapshots.find((account) => account.provider === this.trayBalanceProgress?.provider) ?? snapshots[0];
      const meter = snapshot?.meters.find((candidate) => candidate.id === this.trayBalanceProgress?.meterId);
      this.applyProgressTrayIcon(meter ? calculateTrayBalanceProgress(meter) : 0);
    } catch {
      this.applyProgressTrayIcon(0);
    }
  }

  private refreshRandomTrayIconForCurrentDay(): void {
    if (this.trayIconPreference !== "random") {
      return;
    }
    const previousDateKey = this.randomTrayIconDateKey;
    const previousIconId = this.resolvedRandomTrayIcon;
    const iconId = this.resolveTrayIconId("random");
    if (previousDateKey !== this.randomTrayIconDateKey || previousIconId !== iconId) {
      this.applyTrayIcon(iconId);
    }
  }

  private resolveTrayIconId(preference: TrayIconPreference): TrayMascotIconId {
    if (preference === "violet" || preference === "orange" || preference === "cyan") {
      return preference;
    }

    const dateKey = formatLocalDateKey(new Date());
    if (this.resolvedRandomTrayIcon && this.randomTrayIconDateKey === dateKey) {
      return this.resolvedRandomTrayIcon;
    }

    this.randomTrayIconDateKey = dateKey;
    this.resolvedRandomTrayIcon = trayMascotIconIds[Math.floor(Math.random() * trayMascotIconIds.length)];
    return this.resolvedRandomTrayIcon;
  }
}

const trayController = new TrayController();

export default trayController;

function supportsTrayPlatform(): boolean {
  return process.platform === "darwin" || process.platform === "win32";
}

function supportsTrayTitle(): boolean {
  return process.platform === "darwin";
}

function resolvePopoverLayout(
  trayBounds: Electron.Rectangle | undefined,
  detailOpen: boolean
): { detail: Electron.Rectangle; menu: Electron.Rectangle } {
  const anchor = trayBounds
    ? { x: trayBounds.x + trayBounds.width / 2, y: trayBounds.y + trayBounds.height / 2 }
    : screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(anchor);
  const workArea = display.workArea;
  const availableWidth = Math.max(360, workArea.width - popoverMargin * 2);
  const menuWidth = Math.min(popoverMenuWidth, availableWidth);
  const preferredGroupWidth = detailOpen ? menuWidth + popoverDetailGap + popoverDetailWidth : menuWidth;
  const groupWidth = Math.min(preferredGroupWidth, availableWidth);
  const detailWidth = detailOpen ? Math.max(0, groupWidth - menuWidth - popoverDetailGap) : 0;
  const height = Math.min(popoverPreferredHeight, Math.max(460, workArea.height - popoverMargin * 2));
  const menuX = Math.round(anchor.x - menuWidth / 2);
  const x = clamp(menuX, workArea.x + popoverMargin, workArea.x + workArea.width - groupWidth - popoverMargin);
  const y = resolvePopoverY(trayBounds, workArea, height);

  return {
    detail: {
      height: Math.max(260, height - popoverDetailTopOffset),
      width: detailWidth,
      x: x + menuWidth + popoverDetailGap,
      y: y + popoverDetailTopOffset
    },
    menu: {
      height,
      width: menuWidth,
      x,
      y
    }
  };
}

function resolvePopoverY(
  trayBounds: Electron.Rectangle | undefined,
  workArea: Electron.Rectangle,
  height: number
): number {
  if (!trayBounds) {
    const cursor = screen.getCursorScreenPoint();
    return clamp(
      cursor.y + popoverMargin,
      workArea.y + popoverMargin,
      workArea.y + workArea.height - height - popoverMargin
    );
  }

  const taskbarIsVertical = trayBounds.x + trayBounds.width <= workArea.x ||
    trayBounds.x >= workArea.x + workArea.width;
  if (taskbarIsVertical) {
    return clamp(
      Math.round(trayBounds.y + trayBounds.height / 2 - height / 2),
      workArea.y + popoverMargin,
      workArea.y + workArea.height - height - popoverMargin
    );
  }

  const topSpace = trayBounds.y - workArea.y;
  const bottomSpace = workArea.y + workArea.height - (trayBounds.y + trayBounds.height);
  const placeBelow = bottomSpace >= height + popoverMargin || bottomSpace > topSpace;
  const preferredY = placeBelow
    ? trayBounds.y + trayBounds.height + popoverMargin
    : trayBounds.y - height - popoverMargin;

  return clamp(
    Math.round(preferredY),
    workArea.y + popoverMargin,
    workArea.y + workArea.height - height - popoverMargin
  );
}

function createTrayPageUrl(mode: "detail" | "menu", provider?: string): string {
  const url = new URL(pathToFileURL(path.join(__dirname, "../renderer/pages/tray/index.html")).toString());
  url.searchParams.set("mode", mode);
  if (provider) {
    url.searchParams.set("provider", provider);
  }
  return url.toString();
}

function normalizeDetailProvider(provider?: string): string | undefined {
  const trimmed = provider?.trim();
  return trimmed ? trimmed : undefined;
}

function createTrayIcon(iconId: TrayMascotIconId): Electron.NativeImage {
  const size = trayIconPixelSize();
  const image = nativeImage.createFromPath(trayMascotIconPaths[iconId]);
  if (image.isEmpty()) {
    const fallback = nativeImage.createFromPath(trayIconFallbackPath);
    if (fallback.isEmpty()) {
      return nativeImage.createEmpty();
    }
    const fallbackIcon = fallback.resize({ height: size, width: size });
    fallbackIcon.setTemplateImage(process.platform === "darwin");
    return fallbackIcon;
  }
  const resized = image.resize({ height: size, width: size });
  resized.setTemplateImage(false);
  return resized;
}

function createTrayProgressIcon(progress: number): Electron.NativeImage {
  const size = trayIconPixelSize();
  const clamped = Math.max(0, Math.min(1, progress));
  const image = nativeImage.createFromBuffer(createBalanceProgressBarPng(clamped));
  if (image.isEmpty()) {
    return nativeImage.createEmpty();
  }
  const resized = image.resize({ height: size, width: size });
  resized.setTemplateImage(false);
  return resized;
}

function trayIconPixelSize(): number {
  return process.platform === "win32" ? 16 : trayMenuBarIconSize;
}

function normalizeTrayIconPreference(value: unknown): TrayIconPreference {
  return value === "violet" || value === "orange" || value === "cyan" || value === "progress" || value === "random"
    ? value
    : "random";
}

function normalizeTrayBalanceProgressConfig(value: unknown): TrayBalanceProgressConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const provider = readRecordString(value, "provider");
  const meterId = readRecordString(value, "meterId");
  return provider && meterId ? { meterId, provider } : undefined;
}

function calculateTrayBalanceProgress(meter: ProviderAccountMeter): number {
  if (meter.limit && meter.limit > 0) {
    if (meter.remaining !== undefined) {
      return Math.max(0, Math.min(1, meter.remaining / meter.limit));
    }
    if (meter.used !== undefined) {
      return Math.max(0, Math.min(1, 1 - meter.used / meter.limit));
    }
  }
  if (meter.unit === "%") {
    if (meter.remaining !== undefined) {
      return Math.max(0, Math.min(1, meter.remaining / 100));
    }
    if (meter.used !== undefined) {
      return Math.max(0, Math.min(1, 1 - meter.used / 100));
    }
  }
  const rawValue = meter.remaining ?? meter.limit ?? meter.used ?? 0;
  return rawValue > 0 ? 1 : 0;
}

function createBalanceProgressBarPng(progress: number): Buffer {
  const size = 36;
  const rgba = Buffer.alloc(size * size * 4);
  const clamped = Math.max(0, Math.min(1, progress));
  const track = { a: 0.48, b: 184, g: 163, r: 148 };
  const fill = clamped <= 0.05
    ? { a: 1, b: 68, g: 68, r: 248 }
    : clamped <= 0.2
      ? { a: 1, b: 36, g: 191, r: 245 }
      : { a: 1, b: 252, g: 250, r: 248 };
  const accent = { a: 0.95, b: 191, g: 212, r: 45 };
  const background = { a: 0.92, b: 42, g: 23, r: 15 };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const index = (y * size + x) * 4;
      blendPngPixel(rgba, index, background, roundedRectAlpha(px, py, 3, 3, 30, 30, 8));
      blendPngPixel(rgba, index, { a: 0.74, b: 250, g: 250, r: 248 }, roundedRectAlpha(px, py, 7, 9, 12, 2.5, 1.25));
      blendPngPixel(rgba, index, accent, roundedRectAlpha(px, py, 7, 15, 18, 2.5, 1.25));
      blendPngPixel(rgba, index, track, roundedRectAlpha(px, py, 7, 22, 22, 5, 2.5));
      blendPngPixel(rgba, index, fill, roundedRectAlpha(px, py, 7, 22, Math.max(2, 22 * clamped), 5, 2.5));
    }
  }

  return encodePngRgba(rgba, size, size);
}

function roundedRectAlpha(
  px: number,
  py: number,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): number {
  const halfWidth = Math.max(0, width / 2 - radius);
  const halfHeight = Math.max(0, height / 2 - radius);
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const dx = Math.abs(px - centerX) - halfWidth;
  const dy = Math.abs(py - centerY) - halfHeight;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const inside = Math.min(Math.max(dx, dy), 0);
  return Math.max(0, Math.min(1, 0.5 - (outside + inside - radius)));
}

function readRecordString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function blendPngPixel(
  rgba: Buffer,
  index: number,
  color: { a: number; b: number; g: number; r: number },
  alpha: number
): void {
  const sourceAlpha = Math.max(0, Math.min(1, alpha * color.a));
  if (sourceAlpha <= 0) {
    return;
  }
  const targetAlpha = rgba[index + 3] / 255;
  const outAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
  rgba[index] = Math.round((color.r * sourceAlpha + rgba[index] * targetAlpha * (1 - sourceAlpha)) / outAlpha);
  rgba[index + 1] = Math.round((color.g * sourceAlpha + rgba[index + 1] * targetAlpha * (1 - sourceAlpha)) / outAlpha);
  rgba[index + 2] = Math.round((color.b * sourceAlpha + rgba[index + 2] * targetAlpha * (1 - sourceAlpha)) / outAlpha);
  rgba[index + 3] = Math.round(outAlpha * 255);
}

function encodePngRgba(rgba: Buffer, width: number, height: number): Buffer {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = y * width * 4;
    const targetOffset = y * (width * 4 + 1);
    raw[targetOffset] = 0;
    rgba.copy(raw, targetOffset + 1, sourceOffset, sourceOffset + width * 4);
  }
  return Buffer.concat([
    header,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function pngCrc32(buffer: Buffer): number {
  const table = pngCrcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let cachedPngCrcTable: Uint32Array | undefined;

function pngCrcTable(): Uint32Array {
  if (cachedPngCrcTable) {
    return cachedPngCrcTable;
  }
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  cachedPngCrcTable = table;
  return table;
}

function formatLocalDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 1000 ? 1 : 0,
    notation: value >= 10000 ? "compact" : "standard"
  }).format(value);
}

function formatTokenTitle(value: number): string {
  return `${formatCompactNumber(Math.max(0, value))} tokens`;
}
