import electron from "electron";
import esbuild from "esbuild";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, watch } from "node:fs";
import path from "node:path";
import {
  buildStyles,
  cleanDist,
  browserRendererHtmlInput,
  cliSourceRoot,
  coreSourceRoot,
  copyAppAssets,
  copyBrowserRendererHtml,
  copyCliRuntimeToElectronDist,
  copyMarketplacePlugins,
  copyModelCatalog,
  copyRendererHtml,
  copyTrayRendererHtml,
  createBrowserRendererBuildOptions,
  createCliBuildOptions,
  createMainBuildOptions,
  createRendererBuildOptions,
  createTrayRendererBuildOptions,
  createWebClientBridgeBuildOptions,
  appAssetsInput,
  modelCatalogInput,
  projectRoot,
  rendererRoot,
  rendererHtmlInput,
  syncUiRendererToRuntimeDists,
  trayRendererHtmlInput,
  watchPlugin
} from "./esbuild.config.mjs";

let electronProcess = null;
let restartTimer = null;
let pendingRestartReasons = [];
const watchSignatures = new Map();
let shuttingDown = false;
const restartDelayMs = 160;
const styleBuildDelayMs = 160;
const stylePollIntervalMs = 1000;
const ignoredSignatureEntries = new Set([".DS_Store"]);
let styleBuildTimer = null;
let styleBuildInFlight = false;
let queuedStyleBuildReason = null;
const ready = {
  browser: false,
  cli: false,
  main: false,
  renderer: false,
  tray: false,
  webBridge: false
};
const devTarget = parseDevTarget(process.argv.slice(2));
const enabled = {
  cli: devTarget === "cli" || devTarget === "electron",
  electron: devTarget === "electron",
  ui: true
};
const coreSharedSourceRoot = path.join(coreSourceRoot, "shared");
const styleWatchRoots = [rendererRoot, coreSharedSourceRoot].filter((watchRoot) => existsSync(watchRoot));
const activeReadyNames = new Set([
  ...(enabled.ui ? ["browser", "renderer", "tray", "webBridge"] : []),
  ...(enabled.cli ? ["cli"] : []),
  ...(enabled.electron ? ["main"] : [])
]);

function parseDevTarget(args) {
  const target = args[0] ?? "electron";
  if (target === "--help" || target === "-h") {
    console.log("Usage: node build/dev.mjs [ui|cli|electron]");
    process.exit(0);
  }
  if (target === "ui" || target === "cli" || target === "electron") {
    return target;
  }
  console.error(`Unknown dev target "${target}". Expected ui, cli, or electron.`);
  process.exit(2);
}

function logDev(message) {
  console.log(`[dev] ${new Date().toISOString()} ${message}`);
}

function relativePath(file) {
  return path.relative(projectRoot, file) || ".";
}

function readyState() {
  return Object.entries(ready)
    .filter(([name]) => activeReadyNames.has(name))
    .map(([name, value]) => `${name}:${value ? "ready" : "pending"}`)
    .join(" ");
}

function describeWatchEvent(label, watchedPath, eventType, filename, isDirectory = false) {
  const changedPath = filename
    ? path.join(isDirectory ? watchedPath : path.dirname(watchedPath), String(filename))
    : watchedPath;
  return `${label} ${eventType} ${relativePath(changedPath)}`;
}

function contentSignature(targetPath) {
  try {
    return readContentSignature(targetPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      key: `error:${message}`,
      summary: `signature-error=${message}`
    };
  }
}

function readContentSignature(targetPath) {
  if (!existsSync(targetPath)) {
    return {
      key: "missing",
      summary: "missing"
    };
  }

  const stats = statSync(targetPath);
  if (stats.isDirectory()) {
    return directorySignature(targetPath);
  }

  const content = readFileSync(targetPath);
  const hash = createHash("sha1").update(content).digest("hex").slice(0, 12);
  return {
    key: `file:${hash}`,
    summary: `size=${stats.size} mtime=${stats.mtime.toISOString()} ctime=${stats.ctime.toISOString()} sha1=${hash}`
  };
}

function directorySignature(targetPath) {
  const files = listDirectoryFiles(targetPath);
  const hash = createHash("sha1");
  let newestMtimeMs = 0;

  for (const file of files) {
    const absolutePath = path.join(targetPath, file);
    const stats = statSync(absolutePath);
    newestMtimeMs = Math.max(newestMtimeMs, stats.mtimeMs);
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(absolutePath));
    hash.update("\0");
  }

  const digest = hash.digest("hex").slice(0, 12);
  const newestMtime = newestMtimeMs > 0 ? new Date(newestMtimeMs).toISOString() : "none";
  return {
    key: `dir:${digest}`,
    summary: `files=${files.length} newestMtime=${newestMtime} sha1=${digest}`
  };
}

function listDirectoryFiles(targetPath, basePath = targetPath) {
  const entries = readdirSync(targetPath, { withFileTypes: true })
    .filter((entry) => !ignoredSignatureEntries.has(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(targetPath, entry.name);
    const relative = path.relative(basePath, absolutePath);
    if (entry.isDirectory()) {
      files.push(...listDirectoryFiles(absolutePath, basePath));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }

  return files;
}

function rememberWatchSignature(label, targetPath) {
  const signature = contentSignature(targetPath);
  watchSignatures.set(label, signature.key);
  logDev(`watch baseline: ${label} ${relativePath(targetPath)}; ${signature.summary}`);
}

function handleWatchedInput(label, watchedPath, eventType, filename, options, onChange) {
  const reason = describeWatchEvent(label, watchedPath, eventType, filename, options?.isDirectory);
  const signature = contentSignature(watchedPath);
  const previousSignature = watchSignatures.get(label);
  const changed = previousSignature !== signature.key;
  watchSignatures.set(label, signature.key);
  logDev(`watch event: ${reason}; ${signature.summary}; content=${changed ? "changed" : "unchanged"}`);

  if (!changed) {
    logDev(`restart skipped: ${reason} (content unchanged)`);
    return;
  }

  onChange();
  if (enabled.electron && options?.restart !== false) {
    scheduleRestart(reason);
  }
}

function scheduleStyleBuild(reason) {
  queuedStyleBuildReason = reason;
  if (styleBuildTimer) {
    clearTimeout(styleBuildTimer);
  }
  styleBuildTimer = setTimeout(() => {
    styleBuildTimer = null;
    void rebuildStyles(queuedStyleBuildReason ?? reason);
  }, styleBuildDelayMs);
}

async function rebuildStyles(reason) {
  if (styleBuildInFlight) {
    queuedStyleBuildReason = reason;
    return;
  }

  styleBuildInFlight = true;
  queuedStyleBuildReason = null;
  try {
    logDev(`rebuilding styles: ${reason}`);
    await buildStyles({ minify: false });
    syncUiRendererToRuntimeDists();
    if (enabled.electron) {
      scheduleRestart(`styles rebuilt: ${reason}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logDev(`style rebuild failed: ${message}`);
  } finally {
    styleBuildInFlight = false;
    if (queuedStyleBuildReason) {
      const queuedReason = queuedStyleBuildReason;
      queuedStyleBuildReason = null;
      scheduleStyleBuild(queuedReason);
    }
  }
}

function pollStyleWatchRoots() {
  for (const styleWatchRoot of styleWatchRoots) {
    const label = `styles ${relativePath(styleWatchRoot)}`;
    const signature = contentSignature(styleWatchRoot);
    const previousSignature = watchSignatures.get(label);
    if (previousSignature === signature.key) {
      continue;
    }

    watchSignatures.set(label, signature.key);
    logDev(`watch event: ${label}; ${signature.summary}; content=changed`);
    scheduleStyleBuild(label);
  }
}

function markReady(name, reason = `${name} esbuild completed`) {
  if (name === "browser" || name === "cli" || name === "main" || name === "renderer" || name === "tray" || name === "webBridge") {
    ready[name] = true;
  }
  logDev(`build ready: ${reason}; ${readyState()}`);
  if (enabled.electron && Array.from(activeReadyNames).every((readyName) => ready[readyName])) {
    scheduleRestart(reason);
  }
}

function scheduleRestart(reason = "unknown trigger") {
  if (shuttingDown) {
    logDev(`restart ignored during shutdown: ${reason}`);
    return;
  }
  pendingRestartReasons.push(reason);
  if (restartTimer) {
    clearTimeout(restartTimer);
    logDev(`restart rescheduled in ${restartDelayMs}ms: ${reason}`);
  } else {
    logDev(`restart scheduled in ${restartDelayMs}ms: ${reason}`);
  }
  restartTimer = setTimeout(restartElectron, restartDelayMs);
}

function restartElectron() {
  const reasons = Array.from(new Set(pendingRestartReasons));
  pendingRestartReasons = [];
  restartTimer = null;

  if (electronProcess) {
    logDev(`stopping Electron pid=${electronProcess.pid ?? "unknown"}`);
    electronProcess.kill();
    electronProcess = null;
  }

  logDev(`starting Electron; reasons=${reasons.join(" | ") || "initial start"}`);
  const child = spawn(electron, ["."], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "development"
    },
    stdio: "inherit"
  });
  electronProcess = child;
  logDev(`Electron started pid=${child.pid ?? "unknown"}`);
  child.on("exit", (code, signal) => {
    logDev(`Electron exited pid=${child.pid ?? "unknown"} code=${code ?? "null"} signal=${signal ?? "null"}`);
    if (electronProcess === child) {
      electronProcess = null;
    }
  });
}

logDev(`starting dev build target=${devTarget} ui=${enabled.ui ? "on" : "off"} cli=${enabled.cli ? "on" : "off"} electron=${enabled.electron ? "on" : "off"}`);
cleanDist();
if (enabled.electron) {
  copyAppAssets();
}
if (enabled.cli || enabled.electron) {
  copyMarketplacePlugins();
  copyModelCatalog();
}
copyBrowserRendererHtml();
copyRendererHtml();
copyTrayRendererHtml();
await buildStyles({ minify: false });
syncUiRendererToRuntimeDists();

rememberWatchSignature("home html", rendererHtmlInput);
rememberWatchSignature("browser html", browserRendererHtmlInput);
rememberWatchSignature("tray html", trayRendererHtmlInput);
for (const styleWatchRoot of styleWatchRoots) {
  rememberWatchSignature(`styles ${relativePath(styleWatchRoot)}`, styleWatchRoot);
}
if (enabled.electron) {
  rememberWatchSignature("app assets", appAssetsInput);
}
if ((enabled.cli || enabled.electron) && existsSync(modelCatalogInput)) {
  rememberWatchSignature("model catalog", modelCatalogInput);
}

const htmlWatcher = watch(rendererHtmlInput, { persistent: true }, (eventType, filename) => {
  handleWatchedInput("home html", rendererHtmlInput, eventType, filename, undefined, () => {
    copyRendererHtml();
    syncUiRendererToRuntimeDists();
  });
});

const browserHtmlWatcher = watch(browserRendererHtmlInput, { persistent: true }, (eventType, filename) => {
  handleWatchedInput("browser html", browserRendererHtmlInput, eventType, filename, undefined, () => {
    copyBrowserRendererHtml();
    syncUiRendererToRuntimeDists();
  });
});

const trayHtmlWatcher = watch(trayRendererHtmlInput, { persistent: true }, (eventType, filename) => {
  handleWatchedInput("tray html", trayRendererHtmlInput, eventType, filename, undefined, () => {
    copyTrayRendererHtml();
    syncUiRendererToRuntimeDists();
  });
});

const stylePoller = setInterval(pollStyleWatchRoots, stylePollIntervalMs);

const appAssetsWatcher = enabled.electron
  ? watch(appAssetsInput, { persistent: true }, (eventType, filename) => {
      handleWatchedInput("app assets", appAssetsInput, eventType, filename, { isDirectory: true }, copyAppAssets);
    })
  : { close: () => undefined };

const modelCatalogWatcher = (enabled.cli || enabled.electron) && existsSync(modelCatalogInput)
  ? watch(modelCatalogInput, { persistent: true }, (eventType, filename) => {
      handleWatchedInput("model catalog", modelCatalogInput, eventType, filename, undefined, copyModelCatalog);
    })
  : { close: () => undefined };

const contexts = [];

if (enabled.electron) {
  contexts.push(
    await esbuild.context(
      createMainBuildOptions({
        mode: "development",
        plugins: [watchPlugin("main", (name) => markReady(name))]
      })
    )
  );
}

if (enabled.cli) {
  contexts.push(
    await esbuild.context(
      createCliBuildOptions({
        mode: "development",
        plugins: [
          watchPlugin("cli", (name) => {
            if (enabled.electron) {
              copyCliRuntimeToElectronDist();
            }
            markReady(name);
          })
        ]
      })
    )
  );
}

if (enabled.ui) {
  contexts.push(
    await esbuild.context(
      createRendererBuildOptions({
        mode: "development",
        plugins: [
          watchPlugin("renderer", (name) => {
            copyRendererHtml();
            syncUiRendererToRuntimeDists();
            markReady(name);
          })
        ]
      })
    ),
    await esbuild.context(
      createTrayRendererBuildOptions({
        mode: "development",
        plugins: [
          watchPlugin("tray", (name) => {
            copyTrayRendererHtml();
            syncUiRendererToRuntimeDists();
            markReady(name);
          })
        ]
      })
    ),
    await esbuild.context(
      createBrowserRendererBuildOptions({
        mode: "development",
        plugins: [
          watchPlugin("browser", (name) => {
            copyBrowserRendererHtml();
            syncUiRendererToRuntimeDists();
            markReady(name);
          })
        ]
      })
    ),
    await esbuild.context(
      createWebClientBridgeBuildOptions({
        mode: "development",
        plugins: [
          watchPlugin("webBridge", (name) => {
            syncUiRendererToRuntimeDists();
            markReady(name);
          })
        ]
      })
    )
  );
}

await Promise.all(contexts.map((context) => context.watch()));
logDev("watchers are active");

async function shutdown() {
  logDev("shutting down dev build");
  shuttingDown = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
  }
  if (electronProcess) {
    electronProcess.kill();
  }
  if (styleBuildTimer) {
    clearTimeout(styleBuildTimer);
  }
  htmlWatcher.close();
  browserHtmlWatcher.close();
  trayHtmlWatcher.close();
  clearInterval(stylePoller);
  appAssetsWatcher.close();
  modelCatalogWatcher.close();
  await Promise.all(contexts.map((context) => context.dispose()));
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
