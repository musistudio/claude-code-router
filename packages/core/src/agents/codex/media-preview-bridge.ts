import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { CdpClient } from "@ccr/core/agents/cdp-client";
import { MEDIA_ARTIFACT_PATH_PREFIX } from "@ccr/core/mcp/grok-media-config";

type CodexMediaPreviewLogger = Pick<Console, "info" | "warn">;

type CodexMediaPreviewBridgeOptions = {
  endpoint: string;
  logger?: CodexMediaPreviewLogger;
  profileId: string;
  userDataDir: string;
};

type DevToolsTarget = {
  id?: string;
  title?: string;
  type?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
};

type RuntimeBindingCalledParams = {
  executionContextId?: number;
  name?: string;
  payload?: string;
};

type MediaPreviewBindingRequest = {
  key?: unknown;
  url?: unknown;
};

type ValidatedArtifactUrl = {
  artifactId: string;
  url: URL;
};

type LoadedMediaArtifact = {
  bytes: Buffer;
  mimeType: string;
};

const codexDevToolsActivePortFile = "DevToolsActivePort";
const codexMediaPreviewBinding = "__ccrMediaPreviewRequest";
const codexMediaPreviewConnectTimeoutMs = 20_000;
const codexMediaPreviewFetchTimeoutMs = 60_000;
const codexMediaPreviewPollIntervalMs = 250;
const codexMediaPreviewReconnectDelayMs = 1_000;
const codexMediaPreviewChunkBytes = 384 * 1024;
const codexMediaPreviewMaxImageBytes = 15 * 1024 * 1024;
const codexMediaPreviewMaxVideoBytes = 25 * 1024 * 1024;
const codexMediaPreviewMaxResidentBytes = 50 * 1024 * 1024;
const codexMediaPreviewMaxResidentVideos = 2;

export function shouldEnableCodexMediaPreviewBridge(mediaToolsEnabled: boolean): boolean {
  if (!mediaToolsEnabled) return false;
  const configured = process.env.CCR_CODEX_INLINE_VIDEO_PREVIEW?.trim().toLowerCase();
  return configured !== "0" && configured !== "false" && configured !== "off";
}

export function prepareCodexAppCdpUserDataDir(userDataDir: string): void {
  rmSync(path.join(userDataDir, codexDevToolsActivePortFile), { force: true });
}

export class CodexAppMediaPreviewBridge {
  readonly signature: string;
  private readonly activeDownloads = new Set<AbortController>();
  private client?: CdpClient;
  private readonly inFlight = new Set<string>();
  private readonly logger: CodexMediaPreviewLogger;
  private runPromise?: Promise<void>;
  private stopped = true;

  constructor(private readonly options: CodexMediaPreviewBridgeOptions) {
    this.logger = options.logger || console;
    this.signature = `${path.resolve(options.userDataDir)}\u0000${new URL(options.endpoint).origin}`;
  }

  start(): void {
    if (!this.stopped && this.runPromise) return;
    this.stopped = false;
    this.runPromise = this.run().finally(() => {
      this.runPromise = undefined;
    });
  }

  stop(): void {
    this.stopped = true;
    for (const controller of this.activeDownloads) controller.abort();
    this.activeDownloads.clear();
    this.client?.close();
    this.client = undefined;
    this.inFlight.clear();
  }

  private async run(): Promise<void> {
    let announced = false;
    let warned = false;
    while (!this.stopped) {
      let client: CdpClient | undefined;
      try {
        const port = await waitForCodexDevToolsPort(this.options.userDataDir, codexMediaPreviewConnectTimeoutMs, () => this.stopped);
        if (this.stopped) return;
        const target = await waitForCodexPageTarget(port, codexMediaPreviewConnectTimeoutMs, () => this.stopped);
        if (!target.webSocketDebuggerUrl) throw new Error("Codex App page target has no debugger URL.");
        client = await CdpClient.connect(target.webSocketDebuggerUrl, { label: "Codex App" });
        if (this.stopped) {
          client.close();
          return;
        }
        this.client = client;
        await this.install(client);
        if (!announced) {
          announced = true;
          this.logger.info(`[profile] Enabled Codex App inline media previews for profile ${this.options.profileId}.`);
        }
        warned = false;
        await client.waitForClose();
      } catch (error) {
        if (!this.stopped && !warned) {
          warned = true;
          this.logger.warn(`[profile] Codex App inline media bridge is waiting to reconnect: ${redactBridgeError(error)}`);
        }
      } finally {
        if (this.client === client) this.client = undefined;
        client?.close();
      }
      if (!this.stopped) await sleep(codexMediaPreviewReconnectDelayMs);
    }
  }

  private async install(client: CdpClient): Promise<void> {
    const script = codexMediaPreviewInjectionScript(this.options.endpoint);
    client.on("Runtime.bindingCalled", (params) => {
      void this.handleBinding(client, params as RuntimeBindingCalledParams);
    });
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    try {
      await client.send("Runtime.removeBinding", { name: codexMediaPreviewBinding });
    } catch {
      // The first connection has no binding to remove.
    }
    await client.send("Runtime.addBinding", { name: codexMediaPreviewBinding });
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: script });
    await client.send("Runtime.evaluate", {
      awaitPromise: false,
      expression: script
    });
  }

  private async handleBinding(client: CdpClient, params: RuntimeBindingCalledParams): Promise<void> {
    if (this.stopped || params.name !== codexMediaPreviewBinding || typeof params.payload !== "string") return;
    let request: MediaPreviewBindingRequest;
    try {
      request = JSON.parse(params.payload) as MediaPreviewBindingRequest;
    } catch {
      return;
    }
    if (typeof request.key !== "string" || typeof request.url !== "string") return;
    let validated: ValidatedArtifactUrl;
    try {
      validated = validateCodexMediaArtifactUrl(request.url, this.options.endpoint);
    } catch {
      return;
    }
    if (request.key !== validated.artifactId || this.inFlight.has(validated.artifactId)) return;
    this.inFlight.add(validated.artifactId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), codexMediaPreviewFetchTimeoutMs);
    this.activeDownloads.add(controller);
    try {
      const artifact = await loadCodexMediaArtifact(validated, controller.signal);
      await this.sendArtifact(client, params.executionContextId, validated.artifactId, artifact);
    } catch (error) {
      await this.sendPageMessage(client, params.executionContextId, {
        key: validated.artifactId,
        type: "error"
      }).catch(() => undefined);
      if (!this.stopped) {
        this.logger.warn(`[profile] Codex App media artifact ${validated.artifactId} could not be previewed: ${redactBridgeError(error)}`);
      }
    } finally {
      clearTimeout(timeout);
      this.activeDownloads.delete(controller);
      this.inFlight.delete(validated.artifactId);
    }
  }

  private async sendArtifact(
    client: CdpClient,
    executionContextId: number | undefined,
    key: string,
    artifact: LoadedMediaArtifact
  ): Promise<void> {
    await this.sendPageMessage(client, executionContextId, {
      key,
      mimeType: artifact.mimeType,
      size: artifact.bytes.byteLength,
      type: "init"
    });
    for (let offset = 0; offset < artifact.bytes.byteLength; offset += codexMediaPreviewChunkBytes) {
      if (this.stopped) throw new Error("Media bridge stopped.");
      await this.sendPageMessage(client, executionContextId, {
        data: artifact.bytes.subarray(offset, offset + codexMediaPreviewChunkBytes).toString("base64"),
        key,
        type: "chunk"
      });
    }
    await this.sendPageMessage(client, executionContextId, { key, type: "complete" });
  }

  private async sendPageMessage(
    client: CdpClient,
    executionContextId: number | undefined,
    message: Record<string, unknown>
  ): Promise<void> {
    await client.send("Runtime.evaluate", {
      awaitPromise: false,
      ...(typeof executionContextId === "number" ? { contextId: executionContextId } : {}),
      expression: `globalThis.__ccrMediaPreviewBridge?.receive(${JSON.stringify(message)})`
    });
  }
}

async function waitForCodexDevToolsPort(userDataDir: string, timeoutMs: number, stopped: () => boolean): Promise<number> {
  const file = path.join(userDataDir, codexDevToolsActivePortFile);
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (!stopped() && Date.now() < deadline) {
    try {
      const firstLine = readFileSync(file, "utf8").split(/\r?\n/, 1)[0]?.trim();
      const port = Number(firstLine);
      if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
      lastError = new Error("DevToolsActivePort did not contain a valid port.");
    } catch (error) {
      lastError = error;
    }
    await sleep(codexMediaPreviewPollIntervalMs);
  }
  throw new Error(`Codex App DevTools port was not available${lastError ? `: ${redactBridgeError(lastError)}` : "."}`);
}

async function waitForCodexPageTarget(port: number, timeoutMs: number, stopped: () => boolean): Promise<DevToolsTarget> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (!stopped() && Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        redirect: "error",
        signal: AbortSignal.timeout(1_000)
      });
      if (!response.ok) throw new Error(`CDP target discovery returned HTTP ${response.status}.`);
      const targets = await response.json() as DevToolsTarget[];
      const pages = targets.filter((target) => target.type === "page" && target.webSocketDebuggerUrl);
      const target = pages.find(isCodexAppPageTarget) || pages.find((entry) => (entry.url || "").startsWith("app://"));
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await sleep(codexMediaPreviewPollIntervalMs);
  }
  throw new Error(`Codex App CDP page target was not available${lastError ? `: ${redactBridgeError(lastError)}` : "."}`);
}

function isCodexAppPageTarget(target: DevToolsTarget): boolean {
  if (target.type !== "page" || !target.webSocketDebuggerUrl) return false;
  const url = target.url || "";
  return url.startsWith("app://codex") || url.startsWith("app://chatgpt") || /\b(codex|chatgpt)\b/i.test(target.title || "");
}

function validateCodexMediaArtifactUrl(value: string, endpoint: string): ValidatedArtifactUrl {
  const expected = new URL(endpoint);
  const url = new URL(value);
  if (url.protocol !== "http:" || url.origin !== expected.origin) throw new Error("Artifact origin is not the configured CCR gateway.");
  if (url.username || url.password || url.hash) throw new Error("Artifact URL contains unsupported credentials or fragments.");
  if (!url.pathname.startsWith(MEDIA_ARTIFACT_PATH_PREFIX)) throw new Error("Artifact URL does not use the CCR media artifact path.");
  const encodedId = url.pathname.slice(MEDIA_ARTIFACT_PATH_PREFIX.length);
  if (!encodedId || encodedId.includes("/")) throw new Error("Artifact URL contains an invalid identifier.");
  const artifactId = decodeURIComponent(encodedId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(artifactId)) {
    throw new Error("Artifact URL contains an invalid identifier.");
  }
  const keys = [...url.searchParams.keys()];
  const token = url.searchParams.get("token") || "";
  if (keys.length !== 1 || keys[0] !== "token" || !/^[A-Za-z0-9_-]{32}$/.test(token)) {
    throw new Error("Artifact URL contains an invalid access token.");
  }
  return { artifactId, url };
}

async function loadCodexMediaArtifact(validated: ValidatedArtifactUrl, signal: AbortSignal): Promise<LoadedMediaArtifact> {
  let response: Response;
  try {
    response = await fetch(validated.url, {
      headers: { accept: "image/*, video/*" },
      redirect: "error",
      signal
    });
  } catch {
    throw new Error("The CCR artifact request failed.");
  }
  if (!response.ok) throw new Error(`The CCR artifact endpoint returned HTTP ${response.status}.`);
  if (response.redirected) throw new Error("The CCR artifact endpoint attempted a redirect.");
  const declaredMimeType = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  const declaredKind = mediaKind(declaredMimeType);
  if (!declaredKind) throw new Error("The CCR artifact endpoint returned a non-media content type.");
  const maxBytes = declaredKind === "video" ? codexMediaPreviewMaxVideoBytes : codexMediaPreviewMaxImageBytes;
  const declaredLength = Number(response.headers.get("content-length") || "0");
  if (declaredLength && (!Number.isSafeInteger(declaredLength) || declaredLength < 1 || declaredLength > maxBytes)) {
    throw new Error("The CCR media artifact exceeds the inline preview size limit.");
  }
  if (response.headers.get("content-encoding") && response.headers.get("content-encoding") !== "identity") {
    throw new Error("Compressed CCR media artifacts are not accepted for inline preview.");
  }
  if (!response.body) throw new Error("The CCR artifact response had no body.");
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    if (!part.value?.byteLength) continue;
    total += part.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("The CCR media artifact exceeds the inline preview size limit.");
    }
    chunks.push(Buffer.from(part.value));
  }
  if (!total) throw new Error("The CCR artifact response was empty.");
  if (declaredLength && total !== declaredLength) throw new Error("The CCR artifact response length did not match its headers.");
  const bytes = Buffer.concat(chunks, total);
  const detectedMimeType = detectMediaMimeType(bytes);
  if (!detectedMimeType || mediaKind(detectedMimeType) !== declaredKind) {
    throw new Error("The CCR artifact content did not match its declared media type.");
  }
  return { bytes, mimeType: detectedMimeType };
}

function detectMediaMimeType(buffer: Buffer): string | undefined {
  if (buffer.byteLength >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.byteLength >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.byteLength >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (["avif", "avis", "mif1", "msf1"].includes(brand)) return "image/avif";
    return "video/mp4";
  }
  if (buffer.byteLength >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "video/webm";
  return undefined;
}

function mediaKind(mimeType: string): "image" | "video" | undefined {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return undefined;
}

function codexMediaPreviewInjectionScript(endpoint: string): string {
  const expectedOrigin = new URL(endpoint).origin;
  return `(${codexMediaPreviewPageBootstrap.toString()})(${JSON.stringify({
    artifactPathPrefix: MEDIA_ARTIFACT_PATH_PREFIX,
    binding: codexMediaPreviewBinding,
    expectedOrigin,
    maxImageBytes: codexMediaPreviewMaxImageBytes,
    maxResidentBytes: codexMediaPreviewMaxResidentBytes,
    maxResidentVideos: codexMediaPreviewMaxResidentVideos,
    maxVideoBytes: codexMediaPreviewMaxVideoBytes,
    version: "2"
  })})`;
}

function codexMediaPreviewPageBootstrap(config: {
  artifactPathPrefix: string;
  binding: string;
  expectedOrigin: string;
  maxImageBytes: number;
  maxResidentBytes: number;
  maxResidentVideos: number;
  maxVideoBytes: number;
  version: string;
}): void {
  type PreviewAsset = { blobUrl: string; key: string; lastUsed: number; mimeType: string; size: number };
  type PreviewTransfer = { chunks: Uint8Array[]; mimeType: string; received: number; size: number };
  type HiddenState = { count: number; display: string; hidden: boolean };
  type PreviewScope = typeof globalThis & {
    __ccrMediaPreviewBridge?: { dispose: () => void; receive: (message: Record<string, unknown>) => void; scan: () => void; version: string };
  };
  const scope = globalThis as PreviewScope;
  const existing = scope.__ccrMediaPreviewBridge;
  if (existing?.version === config.version) {
    existing.scan();
    return;
  }
  existing?.dispose?.();

  const assets = new Map<string, PreviewAsset>();
  const failed = new Set<string>();
  const hiddenStates = new Map<HTMLElement, HiddenState>();
  const pending = new Set<string>();
  const suppressed = new Set<string>();
  const targets = new Map<string, Set<HTMLElement>>();
  const transfers = new Map<string, PreviewTransfer>();
  const wrapperFallbacks = new Map<HTMLElement, HTMLElement[]>();
  let observer: MutationObserver | undefined;
  let scanTimer: number | undefined;

  function parseArtifactUrl(raw: string): { key: string; url: string } | undefined {
    try {
      const normalized = raw.trim().replace(/[)\],.;]+$/g, "");
      const url = new URL(normalized);
      if (url.protocol !== "http:" || url.origin !== config.expectedOrigin || url.username || url.password || url.hash) return undefined;
      if (!url.pathname.startsWith(config.artifactPathPrefix)) return undefined;
      const encodedId = url.pathname.slice(config.artifactPathPrefix.length);
      if (!encodedId || encodedId.includes("/")) return undefined;
      const key = decodeURIComponent(encodedId);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) return undefined;
      const queryKeys = [...url.searchParams.keys()];
      if (queryKeys.length !== 1 || queryKeys[0] !== "token" || !/^[A-Za-z0-9_-]{32}$/.test(url.searchParams.get("token") || "")) return undefined;
      return { key, url: url.toString() };
    } catch {
      return undefined;
    }
  }

  function artifactUrls(root: HTMLElement): Array<{ key: string; url: string }> {
    const values = new Set<string>();
    for (const element of root.querySelectorAll<HTMLElement>("a[href], [src]")) {
      const value = element.getAttribute("href") || element.getAttribute("src");
      if (value) values.add(value);
    }
    for (const match of root.textContent?.match(/https?:\/\/[^\s<>"'`]+/g) || []) values.add(match);
    const parsed = new Map<string, { key: string; url: string }>();
    for (const value of values) {
      const candidate = parseArtifactUrl(value);
      if (candidate) parsed.set(candidate.key, candidate);
    }
    return [...parsed.values()];
  }

  function responseRoots(): HTMLElement[] {
    const roots = new Set<HTMLElement>();
    for (const root of document.querySelectorAll<HTMLElement>("[data-response-annotation-conversation], [data-message-author-role='assistant']")) roots.add(root);
    for (const button of document.querySelectorAll<HTMLElement>("button[aria-label='Open Web preview']")) {
      const root = button.closest<HTMLElement>("[data-response-annotation-conversation], [data-message-author-role='assistant']");
      if (root) roots.add(root);
    }
    return [...roots];
  }

  function requestArtifact(candidate: { key: string; url: string }): void {
    if (assets.has(candidate.key) || failed.has(candidate.key) || pending.has(candidate.key) || suppressed.has(candidate.key)) return;
    const binding = (scope as unknown as Record<string, unknown>)[config.binding];
    if (typeof binding !== "function") return;
    pending.add(candidate.key);
    try {
      (binding as (payload: string) => void)(JSON.stringify({ key: candidate.key, url: candidate.url }));
    } catch {
      pending.delete(candidate.key);
      failed.add(candidate.key);
    }
  }

  function scan(): void {
    for (const set of targets.values()) {
      for (const root of set) if (!root.isConnected) set.delete(root);
    }
    for (const root of responseRoots()) {
      for (const candidate of artifactUrls(root)) {
        const set = targets.get(candidate.key) || new Set<HTMLElement>();
        set.add(root);
        targets.set(candidate.key, set);
        const asset = assets.get(candidate.key);
        if (asset) attachAsset(root, asset);
        else requestArtifact(candidate);
      }
    }
  }

  function scheduleScan(): void {
    if (scanTimer !== undefined) clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => {
      scanTimer = undefined;
      scan();
    }, 120);
  }

  function wrapperFor(root: HTMLElement, key: string): HTMLElement | undefined {
    return [...root.querySelectorAll<HTMLElement>("[data-ccr-inline-media-key]")].find((element) => element.dataset.ccrInlineMediaKey === key);
  }

  function rawFallback(root: HTMLElement, key: string): HTMLElement | undefined {
    const candidates = [...root.querySelectorAll<HTMLElement>("pre, code, p")]
      .filter((element) => !element.closest("[data-ccr-inline-media-key]") && (element.textContent || "").includes(key))
      .filter((element) => element.matches("pre, code") || /<(?:img|video)\b/i.test(element.textContent || ""))
      .sort((left, right) => (left.textContent || "").length - (right.textContent || "").length);
    const selected = candidates[0];
    return selected?.matches("code") && selected.parentElement?.matches("pre") ? selected.parentElement : selected;
  }

  function previewFallback(root: HTMLElement, key: string): HTMLElement | undefined {
    const buttons = [...root.querySelectorAll<HTMLElement>("button[aria-label='Open Web preview']")];
    let button = buttons.find((item) => {
      let current: HTMLElement | null = item;
      for (let depth = 0; current && current !== root && depth < 6; depth += 1, current = current.parentElement) {
        if ((current.textContent || "").includes(key) || [...current.querySelectorAll<HTMLElement>("a[href]")].some((link) => (link.getAttribute("href") || "").includes(key))) return true;
      }
      return false;
    });
    if (!button && buttons.length === 1) button = buttons[0];
    if (!button) return undefined;
    let best = button;
    let current = button.parentElement;
    for (let depth = 0; current && current !== root && depth < 5; depth += 1, current = current.parentElement) {
      if (current.querySelector("[data-selected-text-overlay-target], [data-ccr-inline-media-key]")) break;
      const controls = current.querySelectorAll("button, input, textarea, select").length;
      const textLength = (current.textContent || "").trim().length;
      if (controls <= 4 && textLength <= 1_000) best = current;
    }
    return best;
  }

  function hideFallback(element: HTMLElement | undefined): void {
    if (!element) return;
    const state = hiddenStates.get(element);
    if (state) {
      state.count += 1;
      return;
    }
    hiddenStates.set(element, { count: 1, display: element.style.display, hidden: element.hidden });
    element.hidden = true;
    element.style.display = "none";
  }

  function restoreFallback(element: HTMLElement): void {
    const state = hiddenStates.get(element);
    if (!state) return;
    state.count -= 1;
    if (state.count > 0) return;
    element.hidden = state.hidden;
    element.style.display = state.display;
    hiddenStates.delete(element);
  }

  function removeWrapper(wrapper: HTMLElement): void {
    for (const fallback of wrapperFallbacks.get(wrapper) || []) restoreFallback(fallback);
    wrapperFallbacks.delete(wrapper);
    wrapper.remove();
  }

  function attachAsset(root: HTMLElement, asset: PreviewAsset): void {
    if (!root.isConnected || wrapperFor(root, asset.key)) return;
    asset.lastUsed = Date.now();
    const wrapper = document.createElement("div");
    wrapper.dataset.ccrInlineMediaKey = asset.key;
    wrapper.style.marginTop = "12px";
    wrapper.style.maxWidth = "680px";
    wrapper.style.width = "100%";
    const media = asset.mimeType.startsWith("video/") ? document.createElement("video") : document.createElement("img");
    media.style.background = "#000";
    media.style.borderRadius = "12px";
    media.style.display = "block";
    media.style.height = "auto";
    media.style.maxHeight = "70vh";
    media.style.objectFit = "contain";
    media.style.width = "100%";
    if (media instanceof HTMLVideoElement) {
      media.controls = true;
      media.playsInline = true;
      media.preload = "metadata";
      media.src = asset.blobUrl;
    } else {
      media.alt = "CCR generated image";
      media.decoding = "async";
      media.src = asset.blobUrl;
    }
    wrapper.append(media);
    const preview = previewFallback(root, asset.key);
    const fallbacks = [rawFallback(root, asset.key), preview]
      .filter((item): item is HTMLElement => Boolean(item));
    const overlay = root.querySelector<HTMLElement>("[data-selected-text-overlay-target]");
    if (preview?.parentElement) preview.parentElement.insertBefore(wrapper, preview);
    else if (overlay?.parentElement) overlay.insertAdjacentElement("afterend", wrapper);
    else root.append(wrapper);

    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (!ready) {
        removeWrapper(wrapper);
        failed.add(asset.key);
        return;
      }
      for (const fallback of fallbacks) hideFallback(fallback);
      wrapperFallbacks.set(wrapper, fallbacks);
    };
    const readyEvent = media instanceof HTMLVideoElement ? "canplay" : "load";
    media.addEventListener(readyEvent, () => finish(true), { once: true });
    media.addEventListener("error", () => finish(false), { once: true });
    const timeout = window.setTimeout(() => finish(false), 15_000);
    if (media instanceof HTMLImageElement && media.complete && media.naturalWidth > 0) finish(true);
    if (media instanceof HTMLVideoElement && media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) finish(true);
  }

  function evictAsset(key: string, suppress: boolean): void {
    const asset = assets.get(key);
    if (!asset) return;
    for (const wrapper of document.querySelectorAll<HTMLElement>("[data-ccr-inline-media-key]")) {
      if (wrapper.dataset.ccrInlineMediaKey === key) removeWrapper(wrapper);
    }
    URL.revokeObjectURL(asset.blobUrl);
    assets.delete(key);
    if (suppress) suppressed.add(key);
  }

  function reserveResidentSpace(size: number, mimeType: string): boolean {
    const newVideo = mimeType.startsWith("video/") ? 1 : 0;
    while (true) {
      const currentBytes = [...assets.values()].reduce((sum, item) => sum + item.size, 0);
      const currentVideos = [...assets.values()].filter((item) => item.mimeType.startsWith("video/")).length;
      if (currentBytes + size <= config.maxResidentBytes && currentVideos + newVideo <= config.maxResidentVideos) return true;
      const oldest = [...assets.values()].sort((left, right) => left.lastUsed - right.lastUsed)[0];
      if (!oldest) return false;
      evictAsset(oldest.key, true);
    }
  }

  function decodeBase64(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function receive(message: Record<string, unknown>): void {
    const key = typeof message.key === "string" ? message.key : "";
    const type = typeof message.type === "string" ? message.type : "";
    if (!key) return;
    try {
      if (type === "error") {
        transfers.delete(key);
        pending.delete(key);
        failed.add(key);
        return;
      }
      if (type === "init") {
        const mimeType = typeof message.mimeType === "string" ? message.mimeType : "";
        const size = typeof message.size === "number" ? message.size : 0;
        const max = mimeType.startsWith("video/") ? config.maxVideoBytes : config.maxImageBytes;
        if ((!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) || !Number.isSafeInteger(size) || size < 1 || size > max) throw new Error("invalid media transfer");
        transfers.set(key, { chunks: [], mimeType, received: 0, size });
        return;
      }
      const transfer = transfers.get(key);
      if (!transfer) throw new Error("missing media transfer");
      if (type === "chunk") {
        if (typeof message.data !== "string") throw new Error("invalid media chunk");
        const chunk = decodeBase64(message.data);
        transfer.received += chunk.byteLength;
        if (transfer.received > transfer.size) throw new Error("oversized media transfer");
        transfer.chunks.push(chunk);
        return;
      }
      if (type === "complete") {
        if (transfer.received !== transfer.size || !reserveResidentSpace(transfer.size, transfer.mimeType)) throw new Error("incomplete media transfer");
        const blobParts: BlobPart[] = transfer.chunks.map((chunk) => chunk.slice().buffer as ArrayBuffer);
        const blobUrl = URL.createObjectURL(new Blob(blobParts, { type: transfer.mimeType }));
        const asset = { blobUrl, key, lastUsed: Date.now(), mimeType: transfer.mimeType, size: transfer.size };
        transfers.delete(key);
        pending.delete(key);
        assets.set(key, asset);
        for (const root of targets.get(key) || []) attachAsset(root, asset);
      }
    } catch {
      transfers.delete(key);
      pending.delete(key);
      failed.add(key);
    }
  }

  function dispose(): void {
    observer?.disconnect();
    if (scanTimer !== undefined) clearTimeout(scanTimer);
    for (const wrapper of document.querySelectorAll<HTMLElement>("[data-ccr-inline-media-key]")) removeWrapper(wrapper);
    for (const asset of assets.values()) URL.revokeObjectURL(asset.blobUrl);
    assets.clear();
    transfers.clear();
  }

  function start(): void {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", start, { once: true });
      return;
    }
    observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    scan();
  }

  scope.__ccrMediaPreviewBridge = { dispose, receive, scan, version: config.version };
  start();
}

function redactBridgeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/token=[A-Za-z0-9_-]+/gi, "token=[redacted]");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const codexMediaPreviewBridgeForTest = {
  injectionScript: codexMediaPreviewInjectionScript,
  loadArtifact: async (url: string, endpoint: string): Promise<LoadedMediaArtifact> => {
    const validated = validateCodexMediaArtifactUrl(url, endpoint);
    return await loadCodexMediaArtifact(validated, AbortSignal.timeout(5_000));
  },
  validateUrl: (url: string, endpoint: string): { artifactId: string; url: string } => {
    const validated = validateCodexMediaArtifactUrl(url, endpoint);
    return { artifactId: validated.artifactId, url: validated.url.toString() };
  }
};
