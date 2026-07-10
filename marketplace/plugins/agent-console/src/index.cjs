"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const PLUGIN_ID = "agent-console";
const DEFAULT_APP_ROOT = "/Users/jinhuilee/products/CCR/app";
const DEFAULT_RENDERER_ROOT = path.join(__dirname, "dist", "renderer");
const DEFAULT_ROUTE_PREFIX = "/plugins/agent-console";
const DEFAULT_RENDERER_ENTRY_PATH = "/pages/home/";
const DEFAULT_LAUNCHER_NAME = "Agent Console";
const LEGACY_LAUNCHER_NAME = "CCR Agent Console";
const MAC_LAUNCHER_APPS_DIR_NAME = "CCR Apps";
const DEFAULT_LAUNCHER_BUNDLE_ID = "com.claudecoderouter.plugin.agent-console.launcher";
const READY_PREFIX = "AGENT_CONSOLE_HEADLESS_READY ";
const DEFAULT_STARTUP_WAIT_MS = 15000;
const DEFAULT_CODEX_CONTEXT_WINDOW_TOKENS = 128000;
const OPENAI_REASONING_EFFORTS = ["minimal", "low", "medium", "high"];
const OPENAI_EXTENDED_REASONING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh"];
let modelCatalogIndex;

module.exports = {
  async setup(ctx) {
    const options = isRecord(ctx.pluginConfig) ? ctx.pluginConfig : {};
    const routePrefix = normalizeRoutePrefix(stringValue(options.routePrefix) || DEFAULT_ROUTE_PREFIX);
    const appRoot = resolveAppRoot(options);
    const fallbackRendererRoot = path.join(appRoot, "dist", "renderer");
    const rendererRoot = path.resolve(
      stringValue(options.rendererRoot) ||
        stringValue(options.pwaRoot) ||
        (rendererDistExists(DEFAULT_RENDERER_ROOT) ? DEFAULT_RENDERER_ROOT : fallbackRendererRoot)
    );
    const electronPath = resolveElectronPath(options, appRoot);
    const launchMode = stringValue(options.launchMode || options.startMode).toLowerCase();
    const launchApp = options.launch !== false;
    const launchOnSetup = launchApp && (
      options.launch === true ||
      options.launchOnSetup === true ||
      options.launchOnStartup === true ||
      launchMode === "startup" ||
      launchMode === "eager"
    );
    const startupWaitMs = parsePositiveInteger(options.startupWaitMs) || DEFAULT_STARTUP_WAIT_MS;
    const bridgeHost = stringValue(options.bridgeHost) || "127.0.0.1";
    const bridgePort = parsePort(options.bridgePort) || await pickOpenPort(bridgeHost);
    const bridgeUrl = `ws://${bridgeHost}:${bridgePort}/pwa`;
    const gatewayUrl = trimTrailingSlash(stringValue(options.gatewayUrl) || configuredGatewayUrl(ctx.config));
    const gatewayApiKey = stringValue(options.gatewayApiKey) || configuredGatewayApiKey(ctx.config);
    const appUrl = buildRendererAppUrl(gatewayUrl, routePrefix, bridgeUrl);
    const launcherUrl = `ccr://plugin/${encodeURIComponent(PLUGIN_ID)}/open`;
    const launcherBundleId = stringValue(options.launcherBundleId) || DEFAULT_LAUNCHER_BUNDLE_ID;
    const runtimeConfigFile = path.join(ctx.paths.pluginDataDir, "ccr-runtime-config.json");
    const modelCatalogFile = path.join(ctx.paths.pluginDataDir, "ccr-codex-model-catalog.json");
    fs.mkdirSync(ctx.paths.pluginDataDir, { recursive: true });
    const runtimeConfig = buildRuntimeConfig(ctx.config, {
      apiKey: gatewayApiKey,
      defaultModel: stringValue(options.defaultModel),
      gatewayUrl,
      modelCatalogFile,
      openAiBaseUrl: stringValue(options.openAiBaseUrl)
    });
    const codexModelCatalog = buildCodexModelCatalog(runtimeConfig.models);
    fs.writeFileSync(modelCatalogFile, `${JSON.stringify(codexModelCatalog, null, 2)}\n`, "utf8");
    const codexRuntime = ensureAgentConsoleCodexRuntime(ctx, options, runtimeConfig);
    const claudeCodeRuntime = ensureAgentConsoleClaudeCodeRuntime(ctx, options, runtimeConfig, codexRuntime.runtimeFile);
    if (codexRuntime.command) {
      runtimeConfig.codex = {
        ...(isRecord(runtimeConfig.codex) ? runtimeConfig.codex : {}),
        command: codexRuntime.command,
        env: codexRuntime.env
      };
    }
    if (claudeCodeRuntime.command) {
      runtimeConfig.claudeCode = {
        ...(isRecord(runtimeConfig.claudeCode) ? runtimeConfig.claudeCode : {}),
        command: claudeCodeRuntime.command,
        env: claudeCodeRuntime.env
      };
    }
    const runtime = {
      appRoot,
      appUrl,
      bridgeHost,
      bridgePort,
      bridgeUrl,
      child: null,
      electronPath,
      lastError: "",
      launchApp,
      launchOnOpen: launchApp && !launchOnSetup,
      launchOnSetup,
      launcherError: "",
      launcherInstalled: false,
      launcherPath: "",
      launcherUrl,
      rendererRoot,
      ready: false,
      readyPayload: null,
      routePrefix,
      runtimeStartedAt: null,
      runtimeConfigFile,
      startPromise: null,
      startupWaitMs,
      startedAt: new Date().toISOString()
    };

    if (!fs.existsSync(path.join(rendererRoot, "pages", "home", "index.html"))) {
      ctx.logger.warn(`Agent Console Electron renderer dist is missing at ${rendererRoot}. Run npm --prefix marketplace/plugins/agent-console run build in the CCR project before opening it.`);
    }

    fs.writeFileSync(runtimeConfigFile, `${JSON.stringify(runtimeConfig, null, 2)}\n`, "utf8");

    const launcher = canUsePermission(ctx, "system-launcher")
      ? ensureSystemLauncher(ctx, options, launcherUrl, launcherBundleId)
      : {
          error: "Agent Console system launcher requires the system-launcher permission.",
          installed: false
        };
    runtime.launcherError = launcher.error || "";
    runtime.launcherInstalled = launcher.installed;
    runtime.launcherPath = launcher.path || "";

    if (!launchApp) {
      runtime.ready = true;
    } else if (launchOnSetup) {
      try {
        startAgentConsole(ctx, runtime, options);
      } catch (error) {
        ctx.logger.warn(`Agent Console startup launch failed: ${formatError(error)}`);
      }
    }

    ctx.registerGatewayRoute({
      auth: "none",
      id: "agent-console-status",
      methods: ["GET"],
      path: `${routePrefix}/__status`,
      handler(_request, response, helpers) {
        helpers.sendJson(response, 200, statusPayload(runtime));
      }
    });

    ctx.registerGatewayRoute({
      auth: "none",
      id: "agent-console-renderer",
      methods: ["GET", "HEAD"],
      pathPrefix: routePrefix,
      async handler(request, response) {
        await serveRenderer(ctx, runtime, options, request, response);
      }
    });

    ctx.registerApp({
      description: "Agent Console Electron renderer backed by the local CCR gateway.",
      icon: "terminal-square",
      id: PLUGIN_ID,
      name: "Agent Console",
      url: appUrl
    });

    ctx.logger.info(`Agent Console registered at ${appUrl}`);
    if (runtime.launcherInstalled) {
      ctx.logger.info(`Agent Console system launcher is available at ${runtime.launcherPath}.`);
    }

    return {
      stop(event) {
        stopAgentConsole(runtime);
        if (event?.reason === "disabled") {
          removeSystemLauncher(ctx, runtime, launcherBundleId);
        }
      }
    };
  }
};

function startAgentConsole(ctx, runtime, options) {
  if (!runtime.launchApp) return;
  if (runtime.child) return;
  if (!runtime.electronPath) {
    runtime.ready = false;
    runtime.lastError = `Electron executable was not found under ${runtime.appRoot}.`;
    ctx.logger.warn(runtime.lastError);
    throw new Error(runtime.lastError);
  }

  runtime.ready = false;
  runtime.readyPayload = null;
  runtime.lastError = "";
  runtime.runtimeStartedAt = new Date().toISOString();
  runtime.child = launchAgentConsole(ctx, runtime, options);
}

async function ensureAgentConsoleStarted(ctx, runtime, options) {
  if (!runtime.launchApp || runtime.ready) {
    return;
  }

  if (!runtime.child) {
    if (!runtime.startPromise) {
      runtime.startPromise = Promise.resolve()
        .then(() => startAgentConsole(ctx, runtime, options))
        .finally(() => {
          runtime.startPromise = null;
        });
    }
    await runtime.startPromise;
  }

  await waitForAgentConsoleReady(runtime, runtime.startupWaitMs);
}

async function waitForAgentConsoleReady(runtime, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (runtime.ready) {
      return;
    }
    if (!runtime.child) {
      throw new Error(runtime.lastError || "Agent Console headless runtime exited before it became ready.");
    }
    await delay(100);
  }
  throw new Error(`Agent Console headless runtime did not become ready within ${timeoutMs}ms.${runtime.lastError ? ` Last error: ${runtime.lastError}` : ""}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function launchAgentConsole(ctx, runtime, options) {
  const userDataDir = path.resolve(stringValue(options.userDataDir) || path.join(ctx.paths.pluginDataDir, "user-data"));
  fs.mkdirSync(userDataDir, { recursive: true });

  const env = {
    ...process.env,
    AGENT_APP_PWA_BRIDGE_HOST: runtime.bridgeHost,
    AGENT_APP_PWA_BRIDGE_PORT: String(runtime.bridgePort),
    AGENT_CONSOLE_CCR_CONFIG_FILE: runtime.runtimeConfigFile,
    AGENT_CONSOLE_HEADLESS: "1",
    AGENT_CONSOLE_USER_DATA_DIR: userDataDir,
    ELECTRON_ENABLE_LOGGING: process.env.ELECTRON_ENABLE_LOGGING || "1"
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const args = [...(normalizeStringArray(options.electronArgs) || []), runtime.appRoot];
  const child = spawn(runtime.electronPath, args, {
    cwd: runtime.appRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => handleAgentConsoleOutput(ctx, runtime, chunk));
  child.stderr.on("data", (chunk) => handleAgentConsoleOutput(ctx, runtime, chunk));
  child.once("error", (error) => {
    runtime.ready = false;
    runtime.lastError = error.message;
    ctx.logger.error("Agent Console failed to launch.", error);
  });
  child.once("exit", (code, signal) => {
    runtime.child = null;
    runtime.ready = false;
    runtime.lastError = `Agent Console exited with code ${code ?? "null"} signal ${signal ?? "null"}.`;
    ctx.logger.warn(runtime.lastError);
  });

  ctx.logger.info(`Launching Agent Console headless runtime with ${runtime.electronPath}.`);
  return child;
}

function handleAgentConsoleOutput(ctx, runtime, chunk) {
  for (const line of String(chunk).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(READY_PREFIX)) {
      const payloadText = trimmed.slice(READY_PREFIX.length).trim();
      try {
        runtime.readyPayload = JSON.parse(payloadText);
      } catch {
        runtime.readyPayload = { raw: payloadText };
      }
      runtime.ready = true;
      runtime.lastError = "";
      ctx.logger.info("Agent Console headless runtime is ready.");
      continue;
    }
    if (/failed|error/i.test(trimmed)) {
      runtime.lastError = trimmed.slice(0, 1000);
      ctx.logger.warn(trimmed);
    } else {
      ctx.logger.debug(trimmed);
    }
  }
}

function stopAgentConsole(runtime) {
  const child = runtime.child;
  if (!child) return;
  runtime.child = null;
  if (!child.killed) {
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        child.kill("SIGKILL");
      }
    }, 3000).unref();
  }
}

function statusPayload(runtime) {
  return {
    appRoot: runtime.appRoot,
    appUrl: runtime.appUrl,
    bridgeUrl: runtime.bridgeUrl,
    childPid: runtime.child?.pid ?? null,
    electronPath: runtime.electronPath || null,
    lastError: runtime.lastError,
    launchApp: runtime.launchApp,
    launchOnOpen: runtime.launchOnOpen,
    launchOnSetup: runtime.launchOnSetup,
    launcherError: runtime.launcherError,
    launcherInstalled: runtime.launcherInstalled,
    launcherPath: runtime.launcherPath,
    launcherUrl: runtime.launcherUrl,
    pwaRoot: runtime.rendererRoot,
    ready: runtime.ready,
    readyPayload: runtime.readyPayload,
    rendererRoot: runtime.rendererRoot,
    routePrefix: runtime.routePrefix,
    runtimeStartedAt: runtime.runtimeStartedAt,
    runtimeConfigFile: runtime.runtimeConfigFile,
    runtimeState: runtime.launchApp
      ? runtime.ready
        ? "ready"
        : runtime.child
          ? "starting"
          : "idle"
      : "disabled",
    startedAt: runtime.startedAt
  };
}

function ensureSystemLauncher(ctx, options, launcherUrl, launcherBundleId) {
  if (options.systemLauncher === false || options.createSystemLauncher === false) {
    return { installed: false };
  }
  if (process.platform !== "darwin") {
    return {
      error: `System launcher creation is only implemented for macOS. Current platform: ${process.platform}.`,
      installed: false
    };
  }

  const launcherName = stringValue(options.launcherName) || DEFAULT_LAUNCHER_NAME;
  const explicitLauncherPath = Boolean(stringValue(options.launcherPath));
  const launcherPath = path.resolve(
    stringValue(options.launcherPath) ||
      defaultMacLauncherAppPath(launcherName)
  );

  if (!explicitLauncherPath) {
    const legacyLauncherPaths = [legacyMacLauncherAppPath(launcherName)];
    if (launcherName === DEFAULT_LAUNCHER_NAME) {
      legacyLauncherPaths.push(legacyMacLauncherAppPath(LEGACY_LAUNCHER_NAME));
    }

    for (const legacyPath of legacyLauncherPaths) {
      try {
        migrateLegacyMacLauncherApp({
          bundleId: launcherBundleId,
          legacyPath,
          launcherPath
        });
      } catch (error) {
        ctx.logger.warn(`Failed to rename legacy Agent Console launcher: ${formatError(error)}`);
      }
    }
  }

  try {
    installMacLauncherApp({
      bundleId: launcherBundleId,
      launcherName,
      launcherPath,
      launcherUrl
    });
    return {
      installed: true,
      path: launcherPath
    };
  } catch (error) {
    const message = `Failed to install Agent Console system launcher: ${formatError(error)}`;
    ctx.logger.warn(message);
    return {
      error: message,
      installed: false,
      path: launcherPath
    };
  }
}

function canUsePermission(ctx, permission) {
  return Array.isArray(ctx.permissions) && ctx.permissions.includes(permission);
}

function migrateLegacyMacLauncherApp({ bundleId, legacyPath, launcherPath }) {
  if (legacyPath === launcherPath || fs.existsSync(launcherPath) || !fs.existsSync(legacyPath)) {
    return;
  }
  if (!fs.statSync(legacyPath).isDirectory()) {
    return;
  }

  const infoPath = path.join(legacyPath, "Contents", "Info.plist");
  if (!fs.existsSync(infoPath)) {
    return;
  }

  const info = fs.readFileSync(infoPath, "utf8");
  if (!info.includes(`<string>${escapeXml(bundleId)}</string>`)) {
    return;
  }

  fs.mkdirSync(path.dirname(launcherPath), { recursive: true });
  fs.renameSync(legacyPath, launcherPath);
}

function defaultMacLauncherAppPath(launcherName) {
  return path.join(macLauncherAppsDir(), `${safeMacFileName(launcherName)}.app`);
}

function legacyMacLauncherAppPath(launcherName) {
  return path.join(os.homedir(), "Applications", `${safeMacFileName(launcherName)}.app`);
}

function macLauncherAppsDir() {
  return path.join(os.homedir(), "Applications", MAC_LAUNCHER_APPS_DIR_NAME);
}

function installMacLauncherApp({ bundleId, launcherName, launcherPath, launcherUrl }) {
  if (fs.existsSync(launcherPath) && !fs.statSync(launcherPath).isDirectory()) {
    throw new Error(`${launcherPath} exists and is not a directory.`);
  }

  const contentsDir = path.join(launcherPath, "Contents");
  const macOsDir = path.join(contentsDir, "MacOS");
  const resourcesDir = path.join(contentsDir, "Resources");
  const executableName = safeMacExecutableName(launcherName);
  const executablePath = path.join(macOsDir, executableName);

  fs.mkdirSync(macOsDir, { recursive: true });
  fs.mkdirSync(resourcesDir, { recursive: true });
  writeTextIfChanged(path.join(contentsDir, "Info.plist"), macLauncherInfoPlist({
    bundleId,
    executableName,
    launcherName
  }));
  writeTextIfChanged(path.join(contentsDir, "PkgInfo"), "APPL????");
  writeTextIfChanged(executablePath, macLauncherScript(launcherUrl));
  fs.chmodSync(executablePath, 0o755);
}

function removeSystemLauncher(ctx, runtime, bundleId) {
  if (process.platform !== "darwin" || !runtime.launcherInstalled || !runtime.launcherPath) {
    return;
  }

  try {
    uninstallMacLauncherApp({
      bundleId,
      launcherPath: runtime.launcherPath
    });
    runtime.launcherInstalled = false;
    runtime.launcherPath = "";
  } catch (error) {
    ctx.logger.warn(`Failed to remove Agent Console system launcher: ${formatError(error)}`);
  }
}

function uninstallMacLauncherApp({ bundleId, launcherPath }) {
  const resolvedLauncherPath = path.resolve(launcherPath);
  if (!resolvedLauncherPath.endsWith(".app") || !fs.existsSync(resolvedLauncherPath)) {
    return;
  }
  if (!fs.statSync(resolvedLauncherPath).isDirectory()) {
    return;
  }

  const infoPath = path.join(resolvedLauncherPath, "Contents", "Info.plist");
  if (!fs.existsSync(infoPath)) {
    return;
  }

  const info = fs.readFileSync(infoPath, "utf8");
  if (!info.includes(`<string>${escapeXml(bundleId)}</string>`)) {
    return;
  }

  fs.rmSync(resolvedLauncherPath, { force: true, recursive: true });
  if (path.dirname(resolvedLauncherPath) === macLauncherAppsDir()) {
    try {
      fs.rmdirSync(macLauncherAppsDir());
    } catch {
      // Keep the shared launcher directory when it still contains other apps.
    }
  }
}

function macLauncherInfoPlist({ bundleId, executableName, launcherName }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>${escapeXml(launcherName)}</string>
  <key>CFBundleExecutable</key>
  <string>${escapeXml(executableName)}</string>
  <key>CFBundleIdentifier</key>
  <string>${escapeXml(bundleId)}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${escapeXml(launcherName)}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.15</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;
}

function macLauncherScript(launcherUrl) {
  const quotedUrl = shellSingleQuote(launcherUrl);
  return `#!/bin/sh
if /usr/bin/open -b com.claudecoderouter.desktop ${quotedUrl} >/dev/null 2>&1; then
  exit 0
fi
/usr/bin/open ${quotedUrl}
`;
}

function writeTextIfChanged(filePath, content) {
  if (fs.existsSync(filePath)) {
    try {
      if (fs.readFileSync(filePath, "utf8") === content) {
        return;
      }
    } catch {
      // Fall through and rewrite unreadable stale files.
    }
  }
  fs.writeFileSync(filePath, content, "utf8");
}

function safeMacFileName(value) {
  return value.replace(/[/:]/g, "-").trim() || "Agent Console";
}

function safeMacExecutableName(value) {
  return value.replace(/[^A-Za-z0-9_-]+/g, "").trim() || "AgentConsole";
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function serveRenderer(ctx, runtime, options, request, response) {
  const requestUrl = new URL(request.url || "/", "http://localhost");
  const routePath = requestUrl.pathname;
  if (routePath === runtime.routePrefix || routePath === `${runtime.routePrefix}/`) {
    response.writeHead(308, {
      "cache-control": "no-store",
      "location": rendererEntryLocation(runtime.routePrefix, requestUrl.search)
    });
    response.end();
    return;
  }
  const relativeUrlPath = routePath.slice(runtime.routePrefix.length) || "/";
  const relativeFilePath = decodeURIComponent(relativeUrlPath.split("/").filter(Boolean).join("/"));
  if (relativeFilePath === "__agent-console-preload.js") {
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/javascript; charset=utf-8"
    });
    response.end(agentConsolePreloadScript(runtime.bridgeUrl));
    return;
  }
  const candidateFile = relativeFilePath
    ? path.join(runtime.rendererRoot, relativeFilePath)
    : path.join(runtime.rendererRoot, "pages", "home", "index.html");
  const filePath = safeFilePath(runtime.rendererRoot, candidateFile) || path.join(runtime.rendererRoot, "pages", "home", "index.html");
  const resolvedFile = directoryIndexFile(filePath) || (fileExists(filePath) ? filePath : "");
  const fallbackFile = path.join(runtime.rendererRoot, "pages", "home", "index.html");
  const existingFile = resolvedFile || (shouldFallbackToHome(relativeFilePath) ? fallbackFile : "");
  if (!safeFilePath(runtime.rendererRoot, existingFile) || !fileExists(existingFile)) {
    sendText(response, 404, "Agent Console renderer asset was not found.");
    return;
  }

  const isRendererHtml = path.basename(existingFile) === "index.html";
  if (isRendererHtml) {
    try {
      await ensureAgentConsoleStarted(ctx, runtime, options);
    } catch (error) {
      sendText(response, 503, `Agent Console runtime is not available. ${formatError(error)}`);
      return;
    }
  }

  if (request.method === "HEAD") {
    response.writeHead(200, headersForFile(existingFile));
    response.end();
    return;
  }

  if (isRendererHtml) {
    const html = fs.readFileSync(existingFile, "utf8");
    response.writeHead(200, {
      ...headersForFile(existingFile),
      "cache-control": "no-store"
    });
    response.end(injectAgentConsolePreload(html, runtime.routePrefix));
    return;
  }

  response.writeHead(200, headersForFile(existingFile));
  fs.createReadStream(existingFile).pipe(response);
}

function injectAgentConsolePreload(html, routePrefix) {
  const script = `<script src="${routePrefix}/__agent-console-preload.js"></script>`;
  if (html.includes(script)) {
    return html;
  }
  if (html.includes("</head>")) {
    return html.replace("</head>", `${script}</head>`);
  }
  return `${script}${html}`;
}

function buildRendererAppUrl(gatewayUrl, routePrefix, bridgeUrl) {
  const params = new URLSearchParams();
  params.set("mode", "main");
  params.set("agentBridge", bridgeUrl);
  return `${gatewayUrl}${routePrefix}${DEFAULT_RENDERER_ENTRY_PATH}?${params.toString()}`;
}

function rendererEntryLocation(routePrefix, search) {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  if (!params.has("mode")) {
    params.set("mode", "main");
  }
  const query = params.toString();
  return `${routePrefix}${DEFAULT_RENDERER_ENTRY_PATH}${query ? `?${query}` : ""}`;
}

function agentConsolePreloadScript(bridgeUrl) {
  return `
(() => {
  if (window.agentConsole) return;
  window.__AGENT_CONSOLE_BRIDGE_URLS__ = ${JSON.stringify([bridgeUrl])};
  try { window.localStorage.setItem("agentConsolePwaBridgeUrl", ${JSON.stringify(bridgeUrl)}); } catch (_) {}

  class AgentConsoleBridge {
    constructor() {
      this.connectPromise = null;
      this.nextId = 1;
      this.pending = new Map();
      this.socket = null;
      this.subscribers = new Map();
    }
    invoke(channel, ...args) {
      return this.ensureSocket().then((socket) => new Promise((resolve, reject) => {
        const id = this.nextId++;
        this.pending.set(id, { reject, resolve });
        socket.send(JSON.stringify({ args, channel, id, type: "invoke" }));
      }));
    }
    send(channel, ...args) {
      void this.ensureSocket().then((socket) => {
        socket.send(JSON.stringify({ args, channel, type: "send" }));
      });
    }
    on(channel, callback) {
      let callbacks = this.subscribers.get(channel);
      if (!callbacks) {
        callbacks = new Set();
        this.subscribers.set(channel, callbacks);
      }
      callbacks.add(callback);
      return () => callbacks.delete(callback);
    }
    ensureSocket() {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) return Promise.resolve(this.socket);
      if (this.connectPromise) return this.connectPromise;
      this.connectPromise = this.connect().finally(() => {
        this.connectPromise = null;
      });
      return this.connectPromise;
    }
    connect() {
      const urls = Array.isArray(window.__AGENT_CONSOLE_BRIDGE_URLS__) && window.__AGENT_CONSOLE_BRIDGE_URLS__.length
        ? window.__AGENT_CONSOLE_BRIDGE_URLS__
        : [window.localStorage.getItem("agentConsolePwaBridgeUrl")].filter(Boolean);
      let index = 0;
      const tryNext = (lastError) => {
        const url = urls[index++];
        if (!url) return Promise.reject(lastError || new Error("Agent Console bridge is not available."));
        return new Promise((resolve, reject) => {
          const socket = new WebSocket(url);
          const timer = window.setTimeout(() => {
            socket.close();
            reject(new Error("Agent Console bridge connection timed out."));
          }, 5000);
          socket.addEventListener("open", () => {
            window.clearTimeout(timer);
            this.socket = socket;
            socket.addEventListener("message", (event) => this.handleMessage(event));
            socket.addEventListener("close", () => this.handleClose(socket));
            resolve(socket);
          }, { once: true });
          socket.addEventListener("error", () => {
            window.clearTimeout(timer);
            reject(new Error("Failed to connect Agent Console bridge."));
          }, { once: true });
        }).catch(tryNext);
      };
      return tryNext();
    }
    handleClose(socket) {
      if (this.socket === socket) this.socket = null;
      for (const pending of this.pending.values()) {
        pending.reject(new Error("Agent Console bridge disconnected."));
      }
      this.pending.clear();
    }
    handleMessage(event) {
      if (typeof event.data !== "string") return;
      let message;
      try { message = JSON.parse(event.data); } catch (_) { return; }
      if (message.type === "event") {
        for (const callback of this.subscribers.get(message.channel) || []) callback(message.payload);
        return;
      }
      if (message.type !== "result" || typeof message.id !== "number") return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        const error = new Error(message.error.message || "Agent Console bridge request failed.");
        error.name = message.error.name || error.name;
        if (message.error.stack) error.stack = message.error.stack;
        pending.reject(error);
      } else {
        pending.resolve(message.result);
      }
    }
  }

  const bridge = new AgentConsoleBridge();
  const invoke = (channel) => (...args) => bridge.invoke(channel, ...args);
  const on = (channel) => (callback) => bridge.on(channel, callback);
  const unavailable = (feature) => () => Promise.reject(new Error(feature + " is not available in CCR plugin mode."));
  const isRecord = (value) => value && typeof value === "object" && !Array.isArray(value);
  let activeProjectPath = null;
  const withActiveProject = (payload) => {
    if (!activeProjectPath || (payload && typeof payload === "object" && !Array.isArray(payload) && (payload.cwd || payload.projectPath))) {
      return payload;
    }
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return { ...payload, projectPath: activeProjectPath };
    }
    return { projectPath: activeProjectPath };
  };
  const invokeWithActiveProject = (channel) => (payload) => bridge.invoke(channel, withActiveProject(payload));
  const browserUnavailableState = () => Promise.resolve({
    activeTabId: null,
    hiddenHostReady: false,
    importedProfiles: [],
    origins: [],
    settings: {
      browserUseEnabled: false,
      coachmarkDismissed: true,
      hiddenHostEnabled: false,
      requireOriginApproval: true
    },
    tabs: []
  });
  const isSmallChatMode = () => new URLSearchParams(window.location.search).get("mode") === "small-chat";
  const ensurePluginSmallWindowVisuals = () => {
    if (!isSmallChatMode() || document.getElementById("agent-console-plugin-small-window-styles")) return;
    const style = document.createElement("style");
    style.id = "agent-console-plugin-small-window-styles";
    style.textContent = [
      ":root[data-window-mode='small-chat'] .small-chat-window{--foreground:rgba(250,252,255,.98);--muted:rgba(148,163,184,.12);--muted-foreground:rgba(226,232,240,.84);--card-foreground:rgba(250,252,255,.98);--accent:rgba(20,184,166,.14);--accent-foreground:rgba(204,251,241,.98);--popover:rgba(8,13,24,.92);--popover-foreground:rgba(241,245,249,.94);--primary:#5eead4;--secondary-foreground:rgba(241,245,249,.95);--border:rgba(226,232,240,.2);--card:rgba(12,20,34,.64);--chatbot-foreground:rgba(250,252,255,.98);--chatbot-user-message-foreground:rgba(250,252,255,.98);--markdown-foreground:rgba(242,246,252,.95);--markdown-heading-foreground:rgba(255,255,255,.98);--markdown-blockquote-foreground:rgba(226,232,240,.86);--markdown-link-foreground:#93c5fd;--markdown-inline-code-background:rgba(15,23,42,.72);--markdown-inline-code-foreground:#e0f2fe;--markdown-code-block-background:rgba(5,10,18,.72);--markdown-code-block-foreground:rgba(241,245,249,.96);--markdown-code-block-border:rgba(226,232,240,.18);background:rgba(7,12,22,.62)!important;color:rgba(250,252,255,.98)!important;text-shadow:0 1px 2px rgba(0,0,0,.48)!important;box-shadow:0 24px 70px rgba(0,0,0,.36),inset 0 1px 0 rgba(255,255,255,.14)!important;-webkit-backdrop-filter:blur(28px) saturate(1.28) brightness(.86)!important;backdrop-filter:blur(28px) saturate(1.28) brightness(.86)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window::before{background:linear-gradient(180deg,rgba(255,255,255,.06),transparent 28%),linear-gradient(180deg,rgba(2,6,12,.2),rgba(2,6,12,.34))!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window-header{background:linear-gradient(180deg,rgba(7,12,22,.54),rgba(7,12,22,.18) 76%,transparent)!important;border-color:rgba(226,232,240,.14)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window .chatbot-bottom-overlay{background:linear-gradient(180deg,transparent 0%,rgba(7,12,22,.24) 42%,rgba(7,12,22,.62) 100%)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window .markdown-stream-panel,:root[data-window-mode='small-chat'] .small-chat-window .markdown-stream-panel p,:root[data-window-mode='small-chat'] .small-chat-window .markdown-stream-panel li,:root[data-window-mode='small-chat'] .small-chat-window .markdown-stream-panel blockquote{color:var(--markdown-foreground)!important;text-shadow:0 1px 2px rgba(0,0,0,.42)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window .markdown-stream-panel h1,:root[data-window-mode='small-chat'] .small-chat-window .markdown-stream-panel h2,:root[data-window-mode='small-chat'] .small-chat-window .markdown-stream-panel h3,:root[data-window-mode='small-chat'] .small-chat-window .markdown-stream-panel h4{color:var(--markdown-heading-foreground)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window .chatbot-user-message{background:rgba(18,30,50,.62)!important;border-color:rgba(226,232,240,.18)!important;color:rgba(250,252,255,.98)!important;-webkit-backdrop-filter:blur(18px) saturate(1.24)!important;backdrop-filter:blur(18px) saturate(1.24)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window .home-composer,:root[data-window-mode='small-chat'] .small-chat-window .chat-floating-composer{background:rgba(10,17,29,.68)!important;border-color:rgba(226,232,240,.2)!important;color:rgba(250,252,255,.98)!important;-webkit-backdrop-filter:blur(30px) saturate(1.42)!important;backdrop-filter:blur(30px) saturate(1.42)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window textarea,:root[data-window-mode='small-chat'] .small-chat-window input{color:rgba(250,252,255,.98)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window textarea::placeholder,:root[data-window-mode='small-chat'] .small-chat-window input::placeholder{color:rgba(226,232,240,.76)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window .home-composer-toolbar{background:rgba(255,255,255,.055)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window .bg-popover,:root[data-window-mode='small-chat'] .small-chat-window .codex-dialog,:root[data-window-mode='small-chat'] .small-chat-window [role='menu']{background:rgba(8,13,24,.94)!important;border-color:rgba(148,163,184,.28)!important;color:rgba(241,245,249,.94)!important;box-shadow:0 18px 48px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.08)!important;-webkit-backdrop-filter:blur(24px) saturate(1.24) brightness(.9)!important;backdrop-filter:blur(24px) saturate(1.24) brightness(.9)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window .text-popover-foreground{color:rgba(241,245,249,.92)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window .codex-dialog .text-muted-foreground,:root[data-window-mode='small-chat'] .small-chat-window [role='menu'] .text-muted-foreground,:root[data-window-mode='small-chat'] .small-chat-window .bg-popover .text-muted-foreground{color:rgba(203,213,225,.72)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window .codex-dialog button,:root[data-window-mode='small-chat'] .small-chat-window [role='menu'] button,:root[data-window-mode='small-chat'] .small-chat-window .bg-popover button{color:rgba(226,232,240,.9)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window .codex-dialog button:hover,:root[data-window-mode='small-chat'] .small-chat-window .codex-dialog button:focus-visible,:root[data-window-mode='small-chat'] .small-chat-window [role='menu'] button:hover,:root[data-window-mode='small-chat'] .small-chat-window [role='menu'] button:focus-visible,:root[data-window-mode='small-chat'] .small-chat-window .bg-popover button:hover,:root[data-window-mode='small-chat'] .small-chat-window .bg-popover button:focus-visible{background:rgba(148,163,184,.14)!important;color:rgba(255,255,255,.96)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window .codex-dialog button.bg-accent,:root[data-window-mode='small-chat'] .small-chat-window [role='menu'] button.bg-accent,:root[data-window-mode='small-chat'] .small-chat-window .bg-popover button.bg-accent{background:rgba(20,184,166,.16)!important;color:rgba(204,251,241,.98)!important;box-shadow:inset 0 0 0 1px rgba(45,212,191,.22)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window .codex-dialog button.bg-accent:hover,:root[data-window-mode='small-chat'] .small-chat-window .codex-dialog button.bg-accent:focus-visible,:root[data-window-mode='small-chat'] .small-chat-window [role='menu'] button.bg-accent:hover,:root[data-window-mode='small-chat'] .small-chat-window [role='menu'] button.bg-accent:focus-visible,:root[data-window-mode='small-chat'] .small-chat-window .bg-popover button.bg-accent:hover,:root[data-window-mode='small-chat'] .small-chat-window .bg-popover button.bg-accent:focus-visible{background:rgba(20,184,166,.22)!important;color:rgba(240,253,250,.98)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window-header button{color:rgba(226,232,240,.78)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window-header button:hover,:root[data-window-mode='small-chat'] .small-chat-window-header button:focus-visible{background:rgba(148,163,184,.14)!important;color:rgba(255,255,255,.96)!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window-header button:active{background:rgba(148,163,184,.2)!important;color:rgba(255,255,255,.98)!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window-header button.text-primary{background:rgba(20,184,166,.1)!important;color:#99f6e4!important;}",
      ":root[data-window-mode='small-chat'] .small-chat-window-header button.text-primary:hover,:root[data-window-mode='small-chat'] .small-chat-window-header button.text-primary:focus-visible{background:rgba(20,184,166,.16)!important;color:#ccfbf1!important;}"
    ].join("");
    document.head.appendChild(style);
  };
  ensurePluginSmallWindowVisuals();
  const getSmallWindowId = () => {
    const value = new URLSearchParams(window.location.search).get("windowId");
    if (!value || !/^\\d+$/.test(value)) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) ? id : null;
  };
  let smallWindowPinned = false;
  const getSmallWindowState = () => Promise.resolve({
    id: getSmallWindowId(),
    isSmallWindow: isSmallChatMode(),
    minHeight: 460,
    minWidth: 360,
    pinned: smallWindowPinned
  });
  const openSmallWindow = (payload) => {
    const windowId = Date.now();
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "small-chat");
    url.searchParams.set("windowId", String(windowId));
    url.searchParams.delete("openingTransition");
    const threadId = isRecord(payload) && typeof payload.threadId === "string" ? payload.threadId.trim() : "";
    if (threadId) {
      url.searchParams.set("threadId", threadId);
    } else {
      url.searchParams.delete("threadId");
    }
    const childWindow = window.open(
      url.toString(),
      "agent-console-small-chat-" + windowId,
      "popup,width=420,height=640,resizable=yes"
    );
    if (!childWindow) {
      return Promise.reject(new Error("Unable to open Agent Console small window."));
    }
    try { childWindow.focus(); } catch (_) {}
    return Promise.resolve({ success: true });
  };
  const setSmallWindowPinned = (payload) => {
    smallWindowPinned = Boolean(isRecord(payload) && payload.pinned);
    if (isSmallChatMode()) {
      try {
        window.open("ccr-plugin-window://set-pinned?pinned=" + (smallWindowPinned ? "1" : "0"), "_blank", "noopener,noreferrer");
      } catch (_) {}
    }
    return getSmallWindowState();
  };
  const menuState = { close: null };
  const ensureMenuStyles = () => {
    if (document.getElementById("agent-console-plugin-menu-styles")) return;
    const style = document.createElement("style");
    style.id = "agent-console-plugin-menu-styles";
    style.textContent = [
      ".agent-console-plugin-menu{position:fixed;z-index:2147483647;min-width:198px;max-width:320px;padding:6px;border:1px solid color-mix(in srgb,var(--border,#d4d4d8) 85%,transparent);border-radius:8px;background:var(--popover,var(--background,#fff));color:var(--popover-foreground,var(--foreground,#111827));box-shadow:0 16px 48px rgba(15,23,42,.2);font:13px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}",
      ".agent-console-plugin-menu-submenu{position:absolute;left:calc(100% + 6px);top:-6px;display:none;min-width:198px;max-width:320px;padding:6px;border:1px solid color-mix(in srgb,var(--border,#d4d4d8) 85%,transparent);border-radius:8px;background:var(--popover,var(--background,#fff));color:var(--popover-foreground,var(--foreground,#111827));box-shadow:0 16px 48px rgba(15,23,42,.2);}",
      ".agent-console-plugin-menu-row{position:relative;}",
      ".agent-console-plugin-menu-row:hover>.agent-console-plugin-menu-submenu,.agent-console-plugin-menu-row:focus-within>.agent-console-plugin-menu-submenu{display:block;}",
      ".agent-console-plugin-menu-item{box-sizing:border-box;display:flex;width:100%;height:28px;align-items:center;gap:8px;border:0;border-radius:6px;background:transparent;color:inherit;padding:0 10px;text-align:left;white-space:nowrap;font:inherit;}",
      ".agent-console-plugin-menu-item:not([aria-disabled='true']):hover,.agent-console-plugin-menu-item:not([aria-disabled='true']):focus-visible{background:var(--accent,#f4f4f5);color:var(--accent-foreground,inherit);outline:none;}",
      ".agent-console-plugin-menu-item[aria-disabled='true']{opacity:.45;}",
      ".agent-console-plugin-menu-icon{width:16px;height:16px;flex:0 0 16px;object-fit:contain;}",
      ".agent-console-plugin-menu-label{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;}",
      ".agent-console-plugin-menu-arrow{margin-left:16px;opacity:.65;}",
      ".agent-console-plugin-menu-separator{height:1px;margin:5px 6px;background:var(--border,#e4e4e7);}"
    ].join("");
    document.head.appendChild(style);
  };
  const normalizeMenuItems = (value, depth) => {
    if (!Array.isArray(value)) return [];
    const items = [];
    for (const item of value) {
      if (!isRecord(item)) continue;
      if (item.type === "separator") {
        items.push({ type: "separator" });
        continue;
      }
      const label = typeof item.label === "string" ? item.label : "";
      if (!label) continue;
      const submenu = depth < 4 ? normalizeMenuItems(item.submenu, depth + 1) : [];
      const hasSubmenu = submenu.some((child) => child.type !== "separator");
      const id = typeof item.id === "string" ? item.id : "";
      if (!hasSubmenu && !id) continue;
      items.push({
        enabled: item.enabled !== false,
        icon: typeof item.icon === "string" && item.icon.startsWith("data:image/") ? item.icon : "",
        id,
        label,
        submenu: hasSubmenu ? submenu : [],
        type: "normal"
      });
    }
    return trimMenuSeparators(items);
  };
  const trimMenuSeparators = (items) => {
    const next = [];
    let lastWasSeparator = true;
    for (const item of items) {
      if (item.type === "separator") {
        if (!lastWasSeparator) next.push(item);
        lastWasSeparator = true;
      } else {
        next.push(item);
        lastWasSeparator = false;
      }
    }
    while (next.length && next[next.length - 1].type === "separator") next.pop();
    return next;
  };
  const hasMenuAction = (items) => items.some((item) => item.type !== "separator" && (item.id || hasMenuAction(item.submenu || [])));
  const renderMenuItems = (items, parent, settle) => {
    for (const item of items) {
      if (item.type === "separator") {
        const separator = document.createElement("div");
        separator.className = "agent-console-plugin-menu-separator";
        separator.setAttribute("role", "separator");
        parent.appendChild(separator);
        continue;
      }
      const row = document.createElement("div");
      row.className = "agent-console-plugin-menu-row";
      const button = document.createElement("button");
      button.className = "agent-console-plugin-menu-item";
      button.type = "button";
      button.setAttribute("role", "menuitem");
      if (!item.enabled) {
        button.setAttribute("aria-disabled", "true");
        button.tabIndex = -1;
      }
      if (item.icon) {
        const icon = document.createElement("img");
        icon.alt = "";
        icon.className = "agent-console-plugin-menu-icon";
        icon.src = item.icon;
        button.appendChild(icon);
      }
      const label = document.createElement("span");
      label.className = "agent-console-plugin-menu-label";
      label.textContent = item.label;
      button.appendChild(label);
      if (item.submenu && item.submenu.length) {
        const arrow = document.createElement("span");
        arrow.className = "agent-console-plugin-menu-arrow";
        arrow.textContent = "\\u203a";
        button.appendChild(arrow);
      } else if (item.id) {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (item.enabled) settle(item.id);
        });
      }
      row.appendChild(button);
      if (item.submenu && item.submenu.length) {
        const submenu = document.createElement("div");
        submenu.className = "agent-console-plugin-menu-submenu";
        submenu.setAttribute("role", "menu");
        renderMenuItems(item.submenu, submenu, settle);
        row.appendChild(submenu);
      }
      parent.appendChild(row);
    }
  };
  const popupNativeMenu = (payload) => {
    const record = isRecord(payload) ? payload : {};
    const items = normalizeMenuItems(record.items, 0);
    if (!hasMenuAction(items)) return Promise.resolve({ actionId: null, success: true });
    ensureMenuStyles();
    if (menuState.close) menuState.close(null);
    return new Promise((resolve) => {
      let settled = false;
      const menu = document.createElement("div");
      menu.className = "agent-console-plugin-menu";
      menu.setAttribute("role", "menu");
      menu.tabIndex = -1;
      const settle = (actionId) => {
        if (settled) return;
        settled = true;
        if (menu.parentNode) menu.parentNode.removeChild(menu);
        document.removeEventListener("mousedown", onDocumentMouseDown, true);
        document.removeEventListener("keydown", onDocumentKeyDown, true);
        if (menuState.close === settle) menuState.close = null;
        resolve({ actionId: actionId || null, success: true });
      };
      const onDocumentMouseDown = (event) => {
        if (!menu.contains(event.target)) settle(null);
      };
      const onDocumentKeyDown = (event) => {
        if (event.key === "Escape") settle(null);
      };
      renderMenuItems(items, menu, settle);
      document.body.appendChild(menu);
      const width = menu.offsetWidth || 220;
      const height = menu.offsetHeight || 32;
      const requestedX = Number.isFinite(record.x) ? Math.round(record.x) : Math.round(window.innerWidth / 2 - width / 2);
      const requestedY = Number.isFinite(record.y) ? Math.round(record.y) : Math.round(window.innerHeight / 2 - height / 2);
      const x = Math.max(8, Math.min(requestedX, window.innerWidth - width - 8));
      const y = Math.max(8, Math.min(requestedY, window.innerHeight - height - 8));
      menu.style.left = x + "px";
      menu.style.top = y + "px";
      menuState.close = settle;
      setTimeout(() => {
        document.addEventListener("mousedown", onDocumentMouseDown, true);
        document.addEventListener("keydown", onDocumentKeyDown, true);
        menu.focus({ preventScroll: true });
      }, 0);
    });
  };

  window.agentConsole = {
    agent: {
      abortRun: invoke("agent-console:agent:abort-run"),
      addExistingProject: invoke("agent-console:agent:add-existing-project"),
      checkoutProjectBranch: invoke("agent-console:agent:checkout-project-branch"),
      createBlankProject: invoke("agent-console:agent:create-blank-project"),
      deleteThread: invoke("agent-console:agent:delete-thread"),
      forkThread: invoke("agent-console:agent:fork-thread"),
      getProviderCapabilities: invoke("agent-console:agent:get-provider-capabilities"),
      getProviderSessionMessages: invoke("agent-console:agent:get-provider-session-messages"),
      getThreadMessages: invoke("agent-console:agent:get-thread-messages"),
      getUsageAnalytics: invoke("agent-console:agent:get-usage-analytics"),
      listPendingInteractions: invoke("agent-console:agent:list-pending-interactions"),
      listProjectBranches: invoke("agent-console:agent:list-project-branches"),
      listProjects: invoke("agent-console:agent:list-projects"),
      listProviderSessions: invoke("agent-console:agent:list-provider-sessions"),
      listProviders: invoke("agent-console:agent:list-providers"),
      onEvent: on("agent-console:agent:event"),
      renameThread: invoke("agent-console:agent:rename-thread"),
      removeProject: invoke("agent-console:agent:remove-project"),
      restoreProviderSession: invoke("agent-console:agent:restore-provider-session"),
      resolveApproval: invoke("agent-console:agent:resolve-approval"),
      resolveQuestion: invoke("agent-console:agent:resolve-question"),
      sendMessage: invoke("agent-console:send-message"),
      startThread: invoke("agent-console:start-thread")
    },
    automations: {
      create: invoke("agent-console:automation:create"),
      delete: invoke("agent-console:automation:delete"),
      list: invoke("agent-console:automation:list"),
      onEvent: on("agent-console:automation:event"),
      runNow: invoke("agent-console:automation:run-now"),
      setEnabled: invoke("agent-console:automation:set-enabled"),
      update: invoke("agent-console:automation:update")
    },
    browser: {
      activateTab: unavailable("Browser tools"),
      callAutomationTool: unavailable("Browser automation"),
      closeTab: unavailable("Browser tools"),
      createTab: unavailable("Browser tools"),
      dismissCoachmark: browserUnavailableState,
      getAutomationMcpAddress: unavailable("Browser automation"),
      getState: browserUnavailableState,
      goBack: unavailable("Browser tools"),
      goForward: unavailable("Browser tools"),
      importProfile: unavailable("Browser profile import"),
      listProfileImportCandidates: () => Promise.resolve([]),
      navigate: unavailable("Browser tools"),
      onStateChange: () => () => {},
      reload: unavailable("Browser tools"),
      setBounds: () => Promise.resolve({ success: true }),
      setOriginAutomationAllowed: browserUnavailableState,
      setTheme: () => Promise.resolve({ success: true }),
      updateSettings: browserUnavailableState,
      stop: unavailable("Browser tools")
    },
    bot: {
      connect: invoke("agent-console:bot:connect"),
      createIntegration: invoke("agent-console:bot:create-integration"),
      disconnect: invoke("agent-console:bot:disconnect"),
      getStatus: invoke("agent-console:bot:status"),
      getIntegrationStatus: invoke("agent-console:bot:integration-status"),
      listChannels: invoke("agent-console:bot:list-channels"),
      listEvents: invoke("agent-console:bot:list-events"),
      listIntegrations: invoke("agent-console:bot:list-integrations"),
      processNext: invoke("agent-console:bot:process-next"),
      startQrLogin: invoke("agent-console:bot:start-qr-login"),
      startIntegration: invoke("agent-console:bot:start-integration"),
      stopIntegration: invoke("agent-console:bot:stop-integration"),
      waitQrLogin: invoke("agent-console:bot:wait-qr-login")
    },
    clipboard: { writeText: invoke("agent-console:clipboard:write-text") },
    workspace: {
      setActiveProject: (payload) => {
        activeProjectPath = payload && typeof payload === "object" ? payload.projectPath || payload.cwd || null : null;
        return bridge.invoke("agent-console:workspace:set-active-project", payload);
      }
    },
    files: {
      chooseAttachments: invoke("agent-console:files:choose-attachments"),
      createFile: invokeWithActiveProject("agent-console:files:create-file"),
      getRoot: invokeWithActiveProject("agent-console:files:get-root"),
      readDirectory: invokeWithActiveProject("agent-console:files:read-directory"),
      readFile: invokeWithActiveProject("agent-console:files:read-file"),
      writeFile: invokeWithActiveProject("agent-console:files:write-file")
    },
    ipc: {
      invoke: (channel, ...args) => bridge.invoke(channel, ...args),
      send: (channel, ...args) => bridge.send(channel, ...args),
      on: (channel, callback) => bridge.on(channel, callback)
    },
    nativeMenu: { popup: popupNativeMenu },
    git: {
      applyShelf: invoke("agent-console:git:apply-shelf"),
      checkoutBranch: invoke("agent-console:git:checkout-branch"),
      checkoutRevision: invoke("agent-console:git:checkout-revision"),
      cherryPickCommit: invoke("agent-console:git:cherry-pick-commit"),
      commit: invoke("agent-console:git:commit"),
      compareWithLocal: invoke("agent-console:git:compare-with-local"),
      createAutosquashCommit: invoke("agent-console:git:create-autosquash-commit"),
      createBranchAtCommit: invoke("agent-console:git:create-branch-at-commit"),
      createPatch: invoke("agent-console:git:create-patch"),
      createShelf: invoke("agent-console:git:create-shelf"),
      createTagAtCommit: invoke("agent-console:git:create-tag-at-commit"),
      discard: invoke("agent-console:git:discard"),
      dropCommit: invoke("agent-console:git:drop-commit"),
      dropShelf: invoke("agent-console:git:drop-shelf"),
      editCommitMessage: invoke("agent-console:git:edit-commit-message"),
      fetch: invoke("agent-console:git:fetch"),
      getCommitDetails: invoke("agent-console:git:get-commit-details"),
      getDiff: invoke("agent-console:git:get-diff"),
      getFileDiff: invoke("agent-console:git:get-file-diff"),
      getInteractiveRebasePlan: invoke("agent-console:git:get-interactive-rebase-plan"),
      getLog: invoke("agent-console:git:get-log"),
      getState: invoke("agent-console:git:get-state"),
      mergeBranch: invoke("agent-console:git:merge-branch"),
      pull: invoke("agent-console:git:pull"),
      push: invoke("agent-console:git:push"),
      pushUpToCommit: invoke("agent-console:git:push-up-to-commit"),
      rebaseBranch: invoke("agent-console:git:rebase-branch"),
      resetCurrentBranchToCommit: invoke("agent-console:git:reset-current-branch-to-commit"),
      revertCommit: invoke("agent-console:git:revert-commit"),
      runInteractiveRebase: invoke("agent-console:git:run-interactive-rebase"),
      showRepositoryAtRevision: invoke("agent-console:git:show-repository-at-revision"),
      stage: invoke("agent-console:git:stage"),
      undoCommit: invoke("agent-console:git:undo-commit"),
      unstage: invoke("agent-console:git:unstage"),
      viewCommitInBrowser: invoke("agent-console:git:view-commit-in-browser")
    },
    shell: {
      getEnvironment: invoke("agent-console:environment"),
      showItemInFolder: invoke("agent-console:shell:show-item-in-folder"),
      startThread: invoke("agent-console:start-thread"),
      sendMessage: invoke("agent-console:send-message"),
      runCommand: invoke("agent-console:run-command"),
      updateSetting: invoke("agent-console:update-setting")
    },
    settings: {
      get: invoke("agent-console:settings:get"),
      resetSpotlightShortcut: invoke("agent-console:settings:reset-spotlight-shortcut"),
      setAgentEnvironment: invoke("agent-console:settings:set-agent-environment"),
      setAgentProviderEnabled: invoke("agent-console:settings:set-agent-provider-enabled"),
      setAgentProviders: invoke("agent-console:settings:set-agent-providers"),
      setSubagents: invoke("agent-console:settings:set-subagents"),
      setSpotlightShortcut: invoke("agent-console:settings:set-spotlight-shortcut")
    },
    plugins: {
      get: invoke("agent-console:plugins:get"),
      reload: invoke("agent-console:plugins:reload"),
      install: invoke("agent-console:plugins:install"),
      update: invoke("agent-console:plugins:update"),
      uninstall: invoke("agent-console:plugins:uninstall"),
      enable: invoke("agent-console:plugins:enable"),
      disable: invoke("agent-console:plugins:disable"),
      grantPermissions: invoke("agent-console:plugins:grant-permissions"),
      revokePermissions: invoke("agent-console:plugins:revoke-permissions"),
      setConfiguration: invoke("agent-console:plugins:set-configuration"),
      onCommand: on("agent-console:plugins:command")
    },
    smallWindow: {
      close: () => {
        window.close();
        return Promise.resolve({ success: true });
      },
      create: openSmallWindow,
      getState: getSmallWindowState,
      notifyOpeningTransitionReady: getSmallWindowState,
      onOpeningTransitionStart: () => () => {},
      setPinned: setSmallWindowPinned
    },
    voice: { transcribeAudio: invoke("agent-console:voice:transcribe") },
    terminal: {
      activateSession: invoke("agent-console:terminal:activate-session"),
      closeSession: invoke("agent-console:terminal:close-session"),
      createSession: invoke("agent-console:terminal:create-session"),
      getBacklog: invoke("agent-console:terminal:get-backlog"),
      getState: invoke("agent-console:terminal:get-state"),
      killSession: invoke("agent-console:terminal:kill-session"),
      onOutput: on("agent-console:terminal:output"),
      onStateChange: on("agent-console:terminal:state-changed"),
      resize: invoke("agent-console:terminal:resize"),
      write: invoke("agent-console:terminal:write")
    },
    toolhub: {
      clearCache: invoke("toolhub:clear-cache"),
      getSettings: invoke("toolhub:get-settings"),
      installServer: invoke("toolhub:install-server"),
      listServers: invoke("toolhub:list-servers"),
      listTools: invoke("toolhub:list-tools"),
      removeServer: invoke("toolhub:remove-server"),
      refresh: invoke("toolhub:refresh"),
      setBuiltinMcpServerEnabled: invoke("toolhub:set-builtin-mcp-server-enabled"),
      setEnabled: invoke("toolhub:set-enabled"),
      setLlmConfig: invoke("toolhub:set-llm-config"),
      updateServer: invoke("toolhub:update-server")
    }
  };
})();
`;
}

function directoryIndexFile(filePath) {
  try {
    if (!fs.statSync(filePath).isDirectory()) {
      return "";
    }
    const indexFile = path.join(filePath, "index.html");
    return fileExists(indexFile) ? indexFile : "";
  } catch {
    return "";
  }
}

function shouldFallbackToHome(relativeFilePath) {
  return !relativeFilePath || !path.extname(relativeFilePath);
}

function headersForFile(filePath) {
  return {
    "cache-control": isImmutableAsset(filePath) ? "public, max-age=31536000, immutable" : "no-cache",
    "content-type": contentType(filePath)
  };
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js" || extension === ".mjs") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".ico") return "image/x-icon";
  if (extension === ".woff") return "font/woff";
  if (extension === ".woff2") return "font/woff2";
  return "application/octet-stream";
}

function isImmutableAsset(filePath) {
  return path.normalize(filePath).split(path.sep).includes("assets");
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  response.end(`${message}\n`);
}

function safeFilePath(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relativePath = path.relative(resolvedRoot, resolvedCandidate);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return "";
  return resolvedCandidate;
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function rendererDistExists(rendererRoot) {
  return fileExists(path.join(rendererRoot, "pages", "home", "index.html"));
}

function buildRuntimeConfig(config, options) {
  const gatewayUrl = trimTrailingSlash(options.gatewayUrl || configuredGatewayUrl(config));
  const openAiBaseUrl = trimTrailingSlash(options.openAiBaseUrl || `${gatewayUrl}/v1`);
  const models = availableGatewayModels(config);
  const defaultModel = options.defaultModel ||
    stringValue(config?.Router?.default) ||
    models.find((model) => model.isDefault)?.model ||
    models[0]?.model ||
    "";

  return {
    apiKey: options.apiKey || configuredGatewayApiKey(config),
    claudeCode: {
      defaultModel,
      models
    },
    codex: {
      defaultModel,
      modelCatalogFile: options.modelCatalogFile,
      models
    },
    defaultModel,
    gatewayUrl,
    models,
    openAiBaseUrl
  };
}

function ensureAgentConsoleCodexRuntime(ctx, options, runtimeConfig) {
  if (options.codexMiddleware === false) {
    return { command: "", env: {}, runtimeFile: "" };
  }

  const providerId = "claude-code-router";
  const binDir = path.join(ctx.paths.pluginDataDir, "bin");
  const codexHome = path.resolve(stringValue(options.codexHome) || path.join(ctx.paths.pluginDataDir, "codex-home"));
  const configFile = path.join(codexHome, "config.toml");
  const runtimeFile = path.join(binDir, "ccr-codex-cli-middleware.js");
  const commandFile = path.join(binDir, process.platform === "win32" ? "ccr-agent-console-codex.cmd" : "ccr-agent-console-codex");
  const realCodexCli = stringValue(options.codexCliPath || options.codexCommand) || "codex";
  const model = stringValue(runtimeConfig.codex?.defaultModel) || stringValue(runtimeConfig.defaultModel) || runtimeConfig.models?.[0]?.model || "";
  const openAiBaseUrl = trimTrailingSlash(stringValue(runtimeConfig.openAiBaseUrl) || `${stringValue(runtimeConfig.gatewayUrl)}/v1`);
  const apiKey = stringValue(runtimeConfig.apiKey);
  const modelCatalogFile = stringValue(runtimeConfig.codex?.modelCatalogFile) || path.join(ctx.paths.pluginDataDir, "ccr-codex-model-catalog.json");

  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  writeTextIfChanged(configFile, agentConsoleCodexConfigToml({
    apiKey,
    baseUrl: openAiBaseUrl,
    model,
    modelCatalogFile,
    providerId
  }));
  try {
    fs.chmodSync(configFile, 0o600);
  } catch {
    // Best effort on filesystems that do not support chmod.
  }

  const runtimeScript = agentConsoleCodexMiddlewareRuntimeScript();
  writeTextIfChanged(runtimeFile, runtimeScript);
  writeTextIfChanged(commandFile, process.platform === "win32"
    ? agentConsoleCodexMiddlewareCmd({
        codexHome,
        model,
        modelCatalogFile,
        providerId,
        realCodexCli,
        runtimeFile
      })
    : agentConsoleCodexMiddlewareShell({
        codexHome,
        model,
        modelCatalogFile,
        providerId,
        realCodexCli,
        runtimeFile
      }));
  try {
    fs.chmodSync(runtimeFile, 0o755);
    fs.chmodSync(commandFile, 0o755);
  } catch {
    // Best effort on filesystems that do not support chmod.
  }

  return {
    command: commandFile,
    env: {
      CODEX_HOME: codexHome,
      CCR_CODEX_MODEL_CATALOG_FILE: modelCatalogFile,
      CCR_CODEX_MODEL_PROVIDER: providerId,
      CCR_CODEX_PROFILE: providerId,
      CCR_CODEX_PROFILE_CONFIG_FORMAT: "separate_profile_files",
      CCR_CODEX_REMOTE_FRONTEND_MODE: "app",
      CCR_PROFILE_SCOPE: "ccr",
      CODEXL_CODEX_MODEL_CATALOG_FILE: modelCatalogFile,
      CODEXL_CODEX_MODEL_PROVIDER: providerId,
      CODEXL_CODEX_PROFILE: providerId,
      CODEXL_CODEX_PROFILE_CONFIG_FORMAT: "separate_profile_files"
    },
    runtimeFile
  };
}

function ensureAgentConsoleClaudeCodeRuntime(ctx, options, runtimeConfig, sharedRuntimeFile) {
  if (options.claudeCodeMiddleware === false || options.claudeMiddleware === false) {
    return { command: "", env: {} };
  }

  const binDir = path.join(ctx.paths.pluginDataDir, "bin");
  const settingsDir = path.join(ctx.paths.pluginDataDir, "claude-code", "claude");
  const settingsFile = path.join(settingsDir, "settings.json");
  const runtimeFile = ensureAgentConsoleCliMiddlewareRuntime(ctx, sharedRuntimeFile);
  const apiKeyHelperFile = path.join(binDir, process.platform === "win32" ? "ccr-agent-console-claude-code-api-key.cmd" : "ccr-agent-console-claude-code-api-key");
  const commandFile = path.join(binDir, process.platform === "win32" ? "ccr-agent-console-claude-code.cmd" : "ccr-agent-console-claude-code");
  const realClaudeCli = stringValue(options.claudeCodeCommand || options.claudeCodeCliPath || options.claudeCommand || options.claudeCliPath) || "claude";
  const model = stringValue(runtimeConfig.claudeCode?.defaultModel) || stringValue(runtimeConfig.defaultModel) || runtimeConfig.models?.[0]?.model || "";
  const gatewayUrl = trimTrailingSlash(stringValue(runtimeConfig.gatewayUrl));
  const apiKey = stringValue(runtimeConfig.apiKey);
  const baseEnv = agentConsoleClaudeCodeBaseEnv({ gatewayUrl, model, settingsDir });
  const remoteEndpoint = `${gatewayUrl}/__ccr/remote`;

  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(settingsDir, { recursive: true, mode: 0o700 });
  writeTextIfChanged(settingsFile, agentConsoleClaudeCodeSettingsJson({
    apiKeyHelperFile,
    env: baseEnv
  }));
  writeTextIfChanged(apiKeyHelperFile, process.platform === "win32"
    ? agentConsoleApiKeyHelperCmd(apiKey)
    : agentConsoleApiKeyHelperShell(apiKey));
  writeTextIfChanged(commandFile, process.platform === "win32"
    ? agentConsoleClaudeCodeMiddlewareCmd({
        apiKeyHelperFile,
        baseEnv,
        realClaudeCli,
        remoteEndpoint,
        runtimeFile
      })
    : agentConsoleClaudeCodeMiddlewareShell({
        apiKeyHelperFile,
        baseEnv,
        realClaudeCli,
        remoteEndpoint,
        runtimeFile
      }));
  try {
    fs.chmodSync(settingsFile, 0o600);
    fs.chmodSync(apiKeyHelperFile, 0o700);
    fs.chmodSync(commandFile, 0o755);
  } catch {
    // Best effort on filesystems that do not support chmod.
  }

  return {
    command: commandFile,
    env: {
      ...baseEnv,
      CCR_CLAUDE_CODE_WRAPPER: "1",
      CCR_REAL_CLAUDE_CODE_BIN: realClaudeCli,
      CODEXL_CLAUDE_CODE_BIN: realClaudeCli,
      CCR_REMOTE_SYNC_API_KEY_HELPER: apiKeyHelperFile,
      CCR_REMOTE_SYNC_ENABLED: "1",
      CCR_REMOTE_SYNC_ENDPOINT: remoteEndpoint,
      CCR_REMOTE_SYNC_PROFILE_ID: "agent-console-claude-code",
      CCR_REMOTE_SYNC_PROFILE_NAME: "Agent Console Claude Code"
    }
  };
}

function ensureAgentConsoleCliMiddlewareRuntime(ctx, runtimeFile) {
  const binDir = path.join(ctx.paths.pluginDataDir, "bin");
  const file = stringValue(runtimeFile) || path.join(binDir, "ccr-codex-cli-middleware.js");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeTextIfChanged(file, agentConsoleCodexMiddlewareRuntimeScript());
  try {
    fs.chmodSync(file, 0o755);
  } catch {
    // Best effort on filesystems that do not support chmod.
  }
  return file;
}

function agentConsoleClaudeCodeBaseEnv({ gatewayUrl, model, settingsDir }) {
  const env = {
    ANTHROPIC_API_BASE_URL: gatewayUrl,
    ANTHROPIC_BASE_URL: gatewayUrl,
    CLAUDE_AGENT_API_BASE_URL: gatewayUrl,
    CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
    CLAUDE_CONFIG_DIR: settingsDir
  };
  if (model) {
    env.ANTHROPIC_MODEL = model;
    env.CCR_CLAUDE_CODE_MODEL = model;
    env.CODEXL_CLAUDE_CODE_MODEL = model;
  }
  const timezoneEnv = agentConsoleClaudeCodeTimezoneEnv();
  return Object.keys(timezoneEnv).length ? { ...env, ...timezoneEnv } : env;
}

function agentConsoleClaudeCodeSettingsJson({ apiKeyHelperFile, env }) {
  return `${JSON.stringify({
    apiKeyHelper: process.platform === "win32" ? `"${apiKeyHelperFile}"` : apiKeyHelperFile,
    env
  }, null, 2)}\n`;
}

function agentConsoleApiKeyHelperShell(apiKey) {
  return [
    "#!/bin/sh",
    `printf '%s\\n' ${shellSingleQuote(apiKey)}`,
    ""
  ].join("\n");
}

function agentConsoleApiKeyHelperCmd(apiKey) {
  return [
    "@echo off",
    `echo ${cmdValue(apiKey)}`,
    ""
  ].join("\r\n");
}

function agentConsoleClaudeCodeMiddlewareShell({ apiKeyHelperFile, baseEnv, realClaudeCli, remoteEndpoint, runtimeFile }) {
  return [
    "#!/bin/sh",
    ...Object.entries(baseEnv).map(([key, value]) => `export ${key}=${shellSingleQuote(value)}`),
    "export CCR_CLAUDE_CODE_WRAPPER=1",
    `export CCR_REAL_CLAUDE_CODE_BIN=${shellSingleQuote(realClaudeCli)}`,
    `export CODEXL_CLAUDE_CODE_BIN=${shellSingleQuote(realClaudeCli)}`,
    "if [ -z \"${CCR_PROFILE_SURFACE:-}\" ]; then CCR_PROFILE_SURFACE=app; fi",
    "export CCR_PROFILE_SURFACE",
    "if [ -z \"${CCR_REMOTE_SYNC_ENABLED:-}\" ]; then CCR_REMOTE_SYNC_ENABLED=1; fi",
    `if [ -z "\${CCR_REMOTE_SYNC_ENDPOINT:-}" ]; then CCR_REMOTE_SYNC_ENDPOINT=${shellSingleQuote(remoteEndpoint)}; fi`,
    `if [ -z "\${CCR_REMOTE_SYNC_API_KEY_HELPER:-}" ]; then CCR_REMOTE_SYNC_API_KEY_HELPER=${shellSingleQuote(apiKeyHelperFile)}; fi`,
    "if [ -z \"${CCR_REMOTE_SYNC_PROFILE_ID:-}\" ]; then CCR_REMOTE_SYNC_PROFILE_ID=agent-console-claude-code; fi",
    "if [ -z \"${CCR_REMOTE_SYNC_PROFILE_NAME:-}\" ]; then CCR_REMOTE_SYNC_PROFILE_NAME='Agent Console Claude Code'; fi",
    "export CCR_REMOTE_SYNC_ENABLED CCR_REMOTE_SYNC_ENDPOINT CCR_REMOTE_SYNC_API_KEY_HELPER CCR_REMOTE_SYNC_PROFILE_ID CCR_REMOTE_SYNC_PROFILE_NAME",
    "if [ -n \"${CCR_NODE_BIN:-}\" ]; then",
    `  exec "$CCR_NODE_BIN" ${shellSingleQuote(runtimeFile)} "$@"`,
    "fi",
    "if command -v node >/dev/null 2>&1; then",
    `  exec node ${shellSingleQuote(runtimeFile)} "$@"`,
    "fi",
    `ELECTRON_RUN_AS_NODE=1 exec ${shellSingleQuote(process.execPath)} ${shellSingleQuote(runtimeFile)} "$@"`,
    ""
  ].join("\n");
}

function agentConsoleClaudeCodeMiddlewareCmd({ apiKeyHelperFile, baseEnv, realClaudeCli, remoteEndpoint, runtimeFile }) {
  const quotedRuntime = cmdQuote(runtimeFile);
  const quotedHost = cmdQuote(process.execPath);
  return [
    "@echo off",
    ...Object.entries(baseEnv).map(([key, value]) => cmdSetLine(key, value)),
    cmdSetLine("CCR_CLAUDE_CODE_WRAPPER", "1"),
    cmdSetLine("CCR_REAL_CLAUDE_CODE_BIN", realClaudeCli),
    cmdSetLine("CODEXL_CLAUDE_CODE_BIN", realClaudeCli),
    `if not defined CCR_PROFILE_SURFACE ${cmdSetLine("CCR_PROFILE_SURFACE", "app")}`,
    `if not defined CCR_REMOTE_SYNC_ENABLED ${cmdSetLine("CCR_REMOTE_SYNC_ENABLED", "1")}`,
    `if not defined CCR_REMOTE_SYNC_ENDPOINT ${cmdSetLine("CCR_REMOTE_SYNC_ENDPOINT", remoteEndpoint)}`,
    `if not defined CCR_REMOTE_SYNC_API_KEY_HELPER ${cmdSetLine("CCR_REMOTE_SYNC_API_KEY_HELPER", apiKeyHelperFile)}`,
    `if not defined CCR_REMOTE_SYNC_PROFILE_ID ${cmdSetLine("CCR_REMOTE_SYNC_PROFILE_ID", "agent-console-claude-code")}`,
    `if not defined CCR_REMOTE_SYNC_PROFILE_NAME ${cmdSetLine("CCR_REMOTE_SYNC_PROFILE_NAME", "Agent Console Claude Code")}`,
    "if defined CCR_NODE_BIN (",
    `  "%CCR_NODE_BIN%" ${quotedRuntime} %*`,
    "  exit /b %ERRORLEVEL%",
    ")",
    "where node >nul 2>nul",
    "if %ERRORLEVEL%==0 (",
    `  node ${quotedRuntime} %*`,
    "  exit /b %ERRORLEVEL%",
    ")",
    "set \"ELECTRON_RUN_AS_NODE=1\"",
    `${quotedHost} ${quotedRuntime} %*`,
    "exit /b %ERRORLEVEL%",
    ""
  ].join("\r\n");
}

function agentConsoleClaudeCodeTimezoneEnv() {
  let timeZone = "";
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return {};
  }
  const normalized = timeZone.trim().toLowerCase();
  return [
    "asia/chongqing",
    "asia/chungking",
    "asia/harbin",
    "asia/kashgar",
    "asia/shanghai",
    "asia/urumqi",
    "china standard time",
    "prc"
  ].includes(normalized)
    ? { TZ: "UTC" }
    : {};
}

function agentConsoleCodexConfigToml({ apiKey, baseUrl, model, modelCatalogFile, providerId }) {
  return [
    `model_provider = ${tomlString(providerId)}`,
    `model = ${tomlString(model)}`,
    `model_catalog_json = ${tomlString(modelCatalogFile)}`,
    "",
    `[model_providers.${tomlKey(providerId)}]`,
    `name = ${tomlString("Claude Code Router")}`,
    `base_url = ${tomlString(baseUrl)}`,
    `experimental_bearer_token = ${tomlString(apiKey)}`,
    'wire_api = "responses"',
    ""
  ].join("\n");
}

function agentConsoleCodexMiddlewareShell({ codexHome, model, modelCatalogFile, providerId, realCodexCli, runtimeFile }) {
  return [
    "#!/bin/sh",
    `export CODEX_HOME=${shellSingleQuote(codexHome)}`,
    "if [ -z \"${CCR_REAL_CODEX_CLI_PATH:-}\" ]; then",
    `  CCR_REAL_CODEX_CLI_PATH=${shellSingleQuote(realCodexCli)}`,
    "fi",
    "export CCR_REAL_CODEX_CLI_PATH",
    `export CCR_CODEX_PROFILE=${shellSingleQuote(providerId)}`,
    `export CCR_CODEX_MODEL=${shellSingleQuote(model)}`,
    `export CCR_CODEX_MODEL_CATALOG_FILE=${shellSingleQuote(modelCatalogFile)}`,
    `export CCR_CODEX_MODEL_PROVIDER=${shellSingleQuote(providerId)}`,
    "export CCR_CODEX_PROFILE_CONFIG_FORMAT=separate_profile_files",
    "export CCR_PROFILE_SCOPE=ccr",
    "export CCR_CODEX_REMOTE_FRONTEND_MODE=app",
    "if [ -z \"${CODEXL_REAL_CODEX_CLI_PATH:-}\" ]; then",
    "  CODEXL_REAL_CODEX_CLI_PATH=$CCR_REAL_CODEX_CLI_PATH",
    "fi",
    "export CODEXL_REAL_CODEX_CLI_PATH",
    `export CODEXL_CODEX_PROFILE=${shellSingleQuote(providerId)}`,
    `export CODEXL_CODEX_MODEL=${shellSingleQuote(model)}`,
    `export CODEXL_CODEX_MODEL_CATALOG_FILE=${shellSingleQuote(modelCatalogFile)}`,
    `export CODEXL_CODEX_MODEL_PROVIDER=${shellSingleQuote(providerId)}`,
    "export CODEXL_CODEX_PROFILE_CONFIG_FORMAT=separate_profile_files",
    "export CODEXL_CODEX_CORE_MODE=app",
    "if [ -n \"${CCR_NODE_BIN:-}\" ]; then",
    `  exec "$CCR_NODE_BIN" ${shellSingleQuote(runtimeFile)} "$@"`,
    "fi",
    "if command -v node >/dev/null 2>&1; then",
    `  exec node ${shellSingleQuote(runtimeFile)} "$@"`,
    "fi",
    `ELECTRON_RUN_AS_NODE=1 exec ${shellSingleQuote(process.execPath)} ${shellSingleQuote(runtimeFile)} "$@"`,
    ""
  ].join("\n");
}

function agentConsoleCodexMiddlewareCmd({ codexHome, model, modelCatalogFile, providerId, realCodexCli, runtimeFile }) {
  const quotedRuntime = cmdQuote(runtimeFile);
  const quotedHost = cmdQuote(process.execPath);
  return [
    "@echo off",
    cmdSetLine("CODEX_HOME", codexHome),
    `if not defined CCR_REAL_CODEX_CLI_PATH ${cmdSetLine("CCR_REAL_CODEX_CLI_PATH", realCodexCli)}`,
    cmdSetLine("CCR_CODEX_PROFILE", providerId),
    cmdSetLine("CCR_CODEX_MODEL", model),
    cmdSetLine("CCR_CODEX_MODEL_CATALOG_FILE", modelCatalogFile),
    cmdSetLine("CCR_CODEX_MODEL_PROVIDER", providerId),
    cmdSetLine("CCR_CODEX_PROFILE_CONFIG_FORMAT", "separate_profile_files"),
    cmdSetLine("CCR_PROFILE_SCOPE", "ccr"),
    cmdSetLine("CCR_CODEX_REMOTE_FRONTEND_MODE", "app"),
    "if not defined CODEXL_REAL_CODEX_CLI_PATH set \"CODEXL_REAL_CODEX_CLI_PATH=%CCR_REAL_CODEX_CLI_PATH%\"",
    cmdSetLine("CODEXL_CODEX_PROFILE", providerId),
    cmdSetLine("CODEXL_CODEX_MODEL", model),
    cmdSetLine("CODEXL_CODEX_MODEL_CATALOG_FILE", modelCatalogFile),
    cmdSetLine("CODEXL_CODEX_MODEL_PROVIDER", providerId),
    cmdSetLine("CODEXL_CODEX_PROFILE_CONFIG_FORMAT", "separate_profile_files"),
    cmdSetLine("CODEXL_CODEX_CORE_MODE", "app"),
    "if defined CCR_NODE_BIN (",
    `  "%CCR_NODE_BIN%" ${quotedRuntime} %*`,
    "  exit /b %ERRORLEVEL%",
    ")",
    "where node >nul 2>nul",
    "if %ERRORLEVEL%==0 (",
    `  node ${quotedRuntime} %*`,
    "  exit /b %ERRORLEVEL%",
    ")",
    "set \"ELECTRON_RUN_AS_NODE=1\"",
    `${quotedHost} ${quotedRuntime} %*`,
    "exit /b %ERRORLEVEL%",
    ""
  ].join("\r\n");
}

function agentConsoleCodexMiddlewareRuntimeScript() {
  const moduleRuntime = agentConsoleCodexMiddlewareRuntimeFromModule();
  if (moduleRuntime) return moduleRuntime;

  const source = fs.readFileSync(agentConsoleCodexMiddlewareSourceFile(), "utf8");
  const marker = "return String.raw`";
  const start = source.indexOf(marker);
  if (start < 0) {
    throw new Error("Unable to locate Codex middleware runtime template.");
  }
  const templateStart = start + marker.length;
  for (let index = templateStart; index < source.length; index += 1) {
    if (source[index] !== "`" || isEscapedTemplateBacktick(source, index)) continue;
    return source.slice(templateStart, index).replace(/\\`/g, "`");
  }
  throw new Error("Unable to read Codex middleware runtime template.");
}

function agentConsoleCodexMiddlewareRuntimeFromModule() {
  const candidates = [
    "@ccr/core/agents/codex/cli-middleware-runtime",
    "@claude-code-router/core/agents/codex/cli-middleware-runtime"
  ];
  for (const candidate of candidates) {
    try {
      const runtimeModule = require(candidate);
      if (typeof runtimeModule?.codexCliMiddlewareRuntimeScript !== "function") continue;
      const script = runtimeModule.codexCliMiddlewareRuntimeScript();
      if (script) return script;
    } catch {
      // The marketplace plugin can run without core package subpath exports.
    }
  }
  return "";
}

function agentConsoleCodexMiddlewareSourceFile() {
  const candidates = [
    stringValue(process.env.CCR_CODEX_MIDDLEWARE_RUNTIME_SOURCE),
    path.resolve(__dirname, "../../../packages/core/src/agents/codex/cli-middleware-runtime.ts"),
    path.resolve(process.cwd(), "packages/core/src/agents/codex/cli-middleware-runtime.ts")
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Codex middleware runtime source was not found.");
}

function isEscapedTemplateBacktick(source, index) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function tomlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function tomlKey(value) {
  const key = String(value || "").trim();
  return /^[A-Za-z0-9_]+$/.test(key) ? key : tomlString(key);
}

function cmdSetLine(key, value) {
  return `set "${key}=${cmdValue(value)}"`;
}

function cmdValue(value) {
  return String(value ?? "").replace(/"/g, '""');
}

function cmdQuote(value) {
  return `"${cmdValue(value)}"`;
}

function buildCodexModelCatalog(models) {
  return {
    models: models.map((model, index) => {
      const reasoning = codexModelReasoningProfile(model.model);
      const contextWindowTokens = readCatalogPositiveInteger(model.contextWindowTokens || model.context_window_tokens) ||
        modelContextWindowTokens(model.model);
      return {
        additional_speed_tiers: [],
        apply_patch_tool_type: "freeform",
        availability_nux: null,
        base_instructions: "You are Codex, a coding agent.",
        context_window: contextWindowTokens,
        default_verbosity: "low",
        defaultReasoningEffort: reasoning.defaultReasoningEffort || null,
        default_reasoning_level: reasoning.defaultReasoningLevel,
        default_reasoning_effort: reasoning.defaultReasoningEffort || null,
        default_reasoning_summary: "none",
        description: `CCR gateway model ${model.model}`,
        displayName: model.displayName || model.model,
        display_name: model.displayName || model.model,
        effective_context_window_percent: 95,
        experimental_supported_tools: [],
        id: model.model,
        input_modalities: ["text", "image"],
        max_context_window: contextWindowTokens,
        model: model.model,
        priority: index,
        service_tiers: [],
        shell_type: "shell_command",
        slug: model.model,
        support_verbosity: true,
        supported_in_api: true,
        supportedReasoningEfforts: reasoning.supportedReasoningLevels.map(reasoningEffortOption),
        supported_reasoning_efforts: reasoning.supportedReasoningEfforts,
        supported_reasoning_levels: reasoning.supportedReasoningLevels,
        supports_image_detail_original: true,
        supports_parallel_tool_calls: true,
        supports_reasoning_summaries: reasoning.supportsReasoning,
        supports_search_tool: false,
        truncation_policy: { mode: "tokens", limit: 10000 },
        upgrade: null,
        visibility: "list",
        web_search_tool_type: "text"
      };
    })
  };
}

function reasoningEffortOption(level) {
  return {
    description: level.description,
    reasoningEffort: level.effort,
    reasoning_effort: level.effort
  };
}

function availableGatewayModels(config) {
  const baseEntries = [];
  for (const provider of Array.isArray(config?.Providers) ? config.Providers : []) {
    const providerName = stringValue(provider.name || provider.id || provider.provider);
    if (!providerName || !Array.isArray(provider.models)) continue;
    for (const rawModel of provider.models) {
      const modelName = stringValue(rawModel);
      if (!modelName) continue;
      const id = `${providerName}/${modelName}`;
      baseEntries.push(runtimeModelEntry(id, {
        displayName: displayModelName(provider, modelName, id),
        isDefault: id === stringValue(config?.Router?.default),
        model: id
      }));
    }
  }

  const virtualEntries = [];
  for (const profile of Array.isArray(config?.virtualModelProfiles) ? config.virtualModelProfiles : []) {
    if (!isVisibleVirtualProfile(profile)) continue;
    const displayName = stringValue(profile.displayName || profile.key || profile.id);
    for (const entry of baseEntries) {
      for (const prefix of normalizeStringArray(profile.match?.prefixes) || []) {
        const model = `${providerNameFromModel(entry.model)}/${prefix}${modelNameFromModel(entry.model)}`;
        virtualEntries.push(runtimeModelEntry(model, {
          displayName: displayName || `${prefix}${entry.displayName}`,
          model,
          reasoningModel: entry.model
        }));
      }
      for (const suffix of normalizeStringArray(profile.match?.suffixes) || []) {
        const model = `${providerNameFromModel(entry.model)}/${modelNameFromModel(entry.model)}${suffix}`;
        virtualEntries.push(runtimeModelEntry(model, {
          displayName: displayName || `${entry.displayName}${suffix}`,
          model,
          reasoningModel: entry.model
        }));
      }
    }
    for (const alias of normalizeStringArray(profile.match?.exactAliases) || []) {
      const model = alias.toLowerCase().startsWith("fusion/") ? alias : `Fusion/${alias}`;
      virtualEntries.push(runtimeModelEntry(model, {
        displayName: displayName || alias,
        model
      }));
    }
  }

  return uniqueModels([...baseEntries, ...virtualEntries]);
}

function runtimeModelEntry(model, options = {}) {
  const contextModel = options.contextModel || options.reasoningModel || model;
  const reasoning = codexModelReasoningProfile(options.reasoningModel || model);
  const contextWindowTokens = modelContextWindowTokens(contextModel);
  return {
    contextWindowTokens,
    context_window_tokens: contextWindowTokens,
    displayName: options.displayName || model,
    id: options.id || model,
    isDefault: options.isDefault === true,
    model,
    ...(reasoning.defaultReasoningEffort ? { defaultReasoningEffort: reasoning.defaultReasoningEffort } : {}),
    supportedReasoningEfforts: reasoning.supportedReasoningEfforts,
    supportedSpeeds: []
  };
}

function displayModelName(provider, modelName, fallback) {
  const displayNames = isRecord(provider.modelDisplayNames) ? provider.modelDisplayNames : {};
  return stringValue(displayNames[modelName]) || fallback;
}

function codexModelReasoningProfile(model) {
  const entry = findModelCatalogEntry(model);
  const capabilities = isRecord(entry?.capabilities) ? entry.capabilities : {};
  const effortConfig = modelCatalogReasoningEffortConfig(entry, providerNameFromModel(model));
  const fallbackEfforts = effortConfig.efforts.length === 0
    ? openAiGptReasoningFallbackEfforts(model)
    : [];
  const reasoningConfig = fallbackEfforts.length > 0
    ? { ...effortConfig, defaultEffort: "medium", efforts: fallbackEfforts, supportsReasoning: true }
    : effortConfig;
  const supportsReasoning = capabilities.reasoning === true || reasoningConfig.supportsReasoning;
  return {
    defaultReasoningEffort: defaultReasoningEffort(reasoningConfig),
    defaultReasoningLevel: defaultReasoningLevel(reasoningConfig),
    supportedReasoningEfforts: reasoningConfig.efforts,
    supportedReasoningLevels: reasoningConfig.efforts.map(reasoningLevel),
    supportsReasoning
  };
}

function modelContextWindowTokens(model) {
  return modelCatalogMaxInputTokens(findModelCatalogEntry(model)) || DEFAULT_CODEX_CONTEXT_WINDOW_TOKENS;
}

function modelCatalogMaxInputTokens(entry) {
  const limits = isRecord(entry?.limits) ? entry.limits : {};
  return Math.max(
    0,
    readCatalogPositiveInteger(limits.contextTokens),
    readCatalogPositiveInteger(limits.inputTokens)
  );
}

function openAiGptReasoningFallbackEfforts(model) {
  const modelName = normalizeModelCatalogToken(modelNameFromModel(model));
  if (openAiGptSupportsXHighFallback(modelName)) return OPENAI_EXTENDED_REASONING_EFFORTS;
  return /^gpt-[0-9]/.test(modelName) || /^o[0-9]/.test(modelName)
    ? OPENAI_REASONING_EFFORTS
    : [];
}

function openAiGptSupportsXHighFallback(modelName) {
  const match = modelName.match(/^gpt-(\d+)(?:[.-](\d+))?/);
  if (!match) return false;
  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2] || "0", 10);
  return major > 5 || (major === 5 && minor >= 6);
}

function modelCatalogReasoningEffortConfig(entry, providerName) {
  if (!entry) {
    return { defaultEffort: "", efforts: [], supportsReasoning: false };
  }

  const records = sourceRecordsForProvider(entry.sourceRecords, providerName);
  const metadataValues = [
    entry.metadata,
    ...records.map((record) => record.metadata)
  ].filter(isRecord);

  let defaultEffort = "";
  let supportsReasoning = false;
  const efforts = [];
  for (const metadata of metadataValues) {
    const config = reasoningConfigFromMetadata(metadata);
    if (config.supportsReasoning) {
      supportsReasoning = true;
    }
    if (!defaultEffort && config.defaultEffort) {
      defaultEffort = config.defaultEffort;
    }
    for (const effort of config.efforts) {
      if (!efforts.includes(effort)) {
        efforts.push(effort);
      }
    }
  }

  return { defaultEffort, efforts, supportsReasoning };
}

function sourceRecordsForProvider(records, providerName) {
  const normalizedProviderName = normalizeModelCatalogToken(providerName);
  if (!normalizedProviderName) return [];
  return records.filter((record) => {
    const provider = normalizeModelCatalogToken(record.provider);
    const displayName = normalizeModelCatalogToken(record.providerName);
    return [provider, displayName].some((value) =>
      value &&
      (
        value === normalizedProviderName ||
        value.includes(normalizedProviderName) ||
        normalizedProviderName.includes(value)
      )
    );
  });
}

function reasoningConfigFromMetadata(metadata) {
  const efforts = [];
  let defaultEffort = "";
  let supportsReasoning = false;

  const reasoning = isRecord(metadata.reasoning) ? metadata.reasoning : undefined;
  if (reasoning) {
    supportsReasoning = true;
    for (const effort of normalizeReasoningEfforts(reasoning.supported_efforts)) {
      if (!efforts.includes(effort)) {
        efforts.push(effort);
      }
    }
    defaultEffort = normalizeReasoningEffort(reasoning.default_effort);
  }

  const options = Array.isArray(metadata.reasoningOptions) ? metadata.reasoningOptions : [];
  for (const option of options) {
    if (!isRecord(option)) continue;
    const type = stringValue(option.type).toLowerCase();
    if (type === "toggle" || type === "budget_tokens") {
      supportsReasoning = true;
    }
    if (type !== "effort") continue;
    supportsReasoning = true;
    for (const effort of normalizeReasoningEfforts(option.values)) {
      if (!efforts.includes(effort)) {
        efforts.push(effort);
      }
    }
  }

  return { defaultEffort, efforts, supportsReasoning };
}

function normalizeReasoningEfforts(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeReasoningEffort)
    .filter(Boolean)
    .filter((effort, index, efforts) => efforts.indexOf(effort) === index);
}

function normalizeReasoningEffort(value) {
  const normalized = stringValue(value).toLowerCase().replace(/[_\s-]+/g, "");
  if (!normalized || normalized === "default") return "";
  if (normalized === "none" || normalized === "off" || normalized === "disabled") return "none";
  if (normalized === "minimal") return "minimal";
  if (normalized === "low") return "low";
  if (normalized === "medium") return "medium";
  if (normalized === "high") return "high";
  if (normalized === "xhigh" || normalized === "extrahigh" || normalized === "max") return "xhigh";
  return "";
}

function defaultReasoningLevel(config) {
  if (!config.defaultEffort || config.defaultEffort === "none") return null;
  return config.efforts.includes(config.defaultEffort) ? config.defaultEffort : null;
}

function defaultReasoningEffort(config) {
  return defaultReasoningLevel(config) || "";
}

function reasoningLevel(effort) {
  const descriptions = {
    high: "High reasoning",
    low: "Low reasoning",
    medium: "Medium reasoning",
    minimal: "Minimal reasoning",
    none: "No reasoning",
    xhigh: "Extra high reasoning"
  };
  return {
    effort,
    description: descriptions[effort] || `${effort} reasoning`
  };
}

function findModelCatalogEntry(model) {
  const index = loadModelCatalogIndex();
  const candidates = modelCatalogLookupKeys(model);
  for (const key of candidates) {
    const entry = index.byKey.get(key);
    if (entry) return entry;
  }

  for (const key of candidates) {
    const modelKey = modelCatalogLastSegmentKey(key);
    if (!modelKey) continue;
    const entry = index.byModelKey.get(modelKey);
    if (entry) return entry;
  }

  return undefined;
}

function loadModelCatalogIndex() {
  if (modelCatalogIndex) return modelCatalogIndex;

  const payload = loadModelCatalogPayload();
  modelCatalogIndex = buildModelCatalogIndex(payload);
  return modelCatalogIndex;
}

function loadModelCatalogPayload() {
  for (const candidate of modelCatalogPathCandidates()) {
    if (!fs.existsSync(candidate)) continue;
    try {
      return JSON.parse(fs.readFileSync(candidate, "utf8"));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function modelCatalogPathCandidates() {
  return uniqueStrings([
    stringValue(process.env.CCR_MODEL_CATALOG_PATH),
    stringValue(process.env.CCR_MODELS_JSON_PATH),
    path.resolve(process.cwd(), "models.json"),
    path.resolve(process.cwd(), "packages", "core", "models.json"),
    path.resolve(process.cwd(), "packages", "cli", "models.json"),
    path.resolve(__dirname, "models.json"),
    path.resolve(__dirname, "..", "models.json"),
    path.resolve(__dirname, "..", "..", "models.json"),
    path.resolve(__dirname, "..", "..", "..", "models.json"),
    path.resolve(__dirname, "..", "..", "..", "packages", "core", "models.json"),
    path.resolve(__dirname, "..", "..", "..", "packages", "cli", "models.json")
  ]);
}

function buildModelCatalogIndex(payload) {
  const byKey = new Map();
  const byModelKey = new Map();
  const models = isRecord(payload) && Array.isArray(payload.models) ? payload.models : [];

  for (const item of models) {
    const entry = parseModelCatalogEntry(item);
    if (!entry) continue;

    for (const key of modelCatalogEntryKeys(entry)) {
      byKey.set(key, entry);
    }

    const shortKeys = uniqueStrings([
      entry.model ? normalizeModelCatalogToken(entry.model) : "",
      ...entry.aliases.map((alias) => modelCatalogLastSegmentKey(normalizeModelCatalogKey(alias)))
    ]);
    for (const key of shortKeys) {
      if (!key) continue;
      if (byModelKey.has(key) && byModelKey.get(key) !== entry) {
        byModelKey.set(key, undefined);
      } else {
        byModelKey.set(key, entry);
      }
    }
  }

  return { byKey, byModelKey };
}

function parseModelCatalogEntry(value) {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.id);
  if (!id) return undefined;
  return {
    aliases: uniqueStrings([id, ...stringListValue(value.aliases)]),
    capabilities: isRecord(value.capabilities) ? value.capabilities : undefined,
    id,
    limits: modelCatalogLimitsValue(value.limits),
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
    model: stringValue(value.model),
    providers: stringListValue(value.providers),
    sourceRecords: sourceRecordListValue(value.sourceRecords)
  };
}

function modelCatalogLimitsValue(value) {
  if (!isRecord(value)) return undefined;
  const limits = {
    contextTokens: readCatalogPositiveInteger(value.contextTokens),
    inputTokens: readCatalogPositiveInteger(value.inputTokens)
  };
  return limits.contextTokens || limits.inputTokens ? limits : undefined;
}

function readCatalogPositiveInteger(value) {
  return parsePositiveInteger(value);
}

function sourceRecordListValue(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function modelCatalogEntryKeys(entry) {
  return uniqueStrings([
    normalizeModelCatalogKey(entry.id),
    ...entry.aliases.map(normalizeModelCatalogKey),
    ...entry.providers.map((provider) => entry.model ? normalizeModelCatalogKey(`${provider}/${entry.model}`) : "")
  ]);
}

function modelCatalogLookupKeys(value) {
  const raw = String(value || "").trim();
  const normalized = normalizeModelCatalogKey(raw);
  const withoutClaudePrefix = raw.toLowerCase().startsWith("claude-") && raw.includes("/")
    ? normalizeModelCatalogKey(raw.replace(/^claude-/i, ""))
    : "";
  return uniqueStrings([normalized, withoutClaudePrefix]);
}

function normalizeModelCatalogKey(value) {
  return String(value || "")
    .trim()
    .split("/")
    .map(normalizeModelCatalogToken)
    .filter(Boolean)
    .join("/");
}

function normalizeModelCatalogToken(value) {
  return String(value || "")
    .trim()
    .replace(/^hf:/i, "")
    .replace(/^@/, "")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function modelCatalogLastSegmentKey(value) {
  return value.split("/").filter(Boolean).at(-1) || "";
}

function isVisibleVirtualProfile(profile) {
  return profile &&
    profile.enabled !== false &&
    profile.materialization?.enabled !== false &&
    profile.materialization?.includeInGatewayModels !== false;
}

function uniqueModels(models) {
  const seen = new Set();
  const result = [];
  for (const model of models) {
    if (!model.model || seen.has(model.model)) continue;
    seen.add(model.model);
    result.push(model);
  }
  return result;
}

function providerNameFromModel(model) {
  const index = model.indexOf("/");
  return index >= 0 ? model.slice(0, index) : "Fusion";
}

function modelNameFromModel(model) {
  const index = model.indexOf("/");
  return index >= 0 ? model.slice(index + 1) : model;
}

function configuredGatewayUrl(config) {
  const gateway = isRecord(config?.gateway) ? config.gateway : {};
  const host = normalizeGatewayHost(stringValue(gateway.host) || stringValue(config?.HOST) || "127.0.0.1");
  const port = parsePort(gateway.port) || parsePort(config?.PORT) || 3456;
  return `http://${host}:${port}`;
}

function normalizeGatewayHost(host) {
  if (!host || host === "0.0.0.0") return "127.0.0.1";
  if (host === "::" || host === "[::]") return "[::1]";
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function configuredGatewayApiKey(config) {
  const apiKey = stringValue(config?.APIKEY);
  if (apiKey) return apiKey;
  const apiKeys = Array.isArray(config?.APIKEYS) ? config.APIKEYS : [];
  for (const entry of apiKeys) {
    const key = stringValue(entry?.key || entry?.apiKey || entry?.value);
    if (key) return key;
  }
  return "";
}

function resolveAppRoot(options) {
  const candidates = [
    stringValue(options.appRoot),
    stringValue(options.appPath),
    stringValue(process.env.CCR_AGENT_CONSOLE_APP_PATH),
    stringValue(process.env.AGENT_CONSOLE_APP_PATH),
    DEFAULT_APP_ROOT
  ].filter(Boolean);
  return path.resolve(expandHomePath(candidates[0]));
}

function resolveElectronPath(options, appRoot) {
  const configured = stringValue(options.electronPath) || stringValue(process.env.CCR_AGENT_CONSOLE_ELECTRON_PATH);
  const candidates = [
    configured,
    process.platform === "win32"
      ? path.join(appRoot, "node_modules", ".bin", "electron.cmd")
      : path.join(appRoot, "node_modules", ".bin", "electron"),
    path.join(appRoot, "node_modules", "electron", "dist", process.platform === "darwin" ? "Electron.app/Contents/MacOS/Electron" : "electron")
  ].filter(Boolean);
  for (const candidate of candidates) {
    const resolved = path.resolve(expandHomePath(candidate));
    if (fs.existsSync(resolved)) return resolved;
  }
  return "";
}

function pickOpenPort(host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = address && typeof address !== "string" ? address.port : 0;
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve(port);
        }
      });
    });
  });
}

function parsePort(value) {
  const port = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 0;
}

function parsePositiveInteger(value) {
  const integer = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);
  return Number.isInteger(integer) && integer > 0 ? integer : 0;
}

function normalizeRoutePrefix(value) {
  const trimmed = value.trim();
  const prefixed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return prefixed.replace(/\/+$/, "") || DEFAULT_ROUTE_PREFIX;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((item) => stringValue(item)).filter(Boolean);
  return items.length ? items : undefined;
}

function stringListValue(value) {
  return Array.isArray(value) ? value.map((item) => stringValue(item)).filter(Boolean) : [];
}

function uniqueStrings(values) {
  const seen = new Set();
  const strings = [];
  for (const value of values) {
    const trimmed = stringValue(value);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    strings.push(trimmed);
  }
  return strings;
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function expandHomePath(value) {
  if (!value.startsWith("~")) return value;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
