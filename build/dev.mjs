import electron from "electron";
import esbuild from "esbuild";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, watch } from "node:fs";
import path from "node:path";
import {
  binPath,
  buildStyles,
  cleanDist,
  browserRendererHtmlInput,
  copyAppAssets,
  copyBrowserRendererHtml,
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
  cssInput,
  cssOutput,
  appAssetsInput,
  modelCatalogInput,
  projectRoot,
  rendererHtmlInput,
  trayRendererHtmlInput,
  watchPlugin
} from "./esbuild.config.mjs";

let electronProcess = null;
let restartTimer = null;
let pendingRestartReasons = [];
const watchSignatures = new Map();
let shuttingDown = false;
const restartDelayMs = 160;
const ignoredSignatureEntries = new Set([".DS_Store"]);
const ready = {
  browser: false,
  cli: false,
  main: false,
  renderer: false,
  tray: false,
  webBridge: false
};

function logDev(message) {
  console.log(`[dev] ${new Date().toISOString()} ${message}`);
}

function relativePath(file) {
  return path.relative(projectRoot, file) || ".";
}

function readyState() {
  return Object.entries(ready)
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
  scheduleRestart(reason);
}

function markReady(name, reason = `${name} esbuild completed`) {
  if (name === "browser" || name === "cli" || name === "main" || name === "renderer" || name === "tray" || name === "webBridge") {
    ready[name] = true;
  }
  logDev(`build ready: ${reason}; ${readyState()}`);
  if (ready.browser && ready.cli && ready.main && ready.renderer && ready.tray && ready.webBridge) {
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
      NODE_ENV: "development",
      CCR_DEV: "1"
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

logDev("starting dev build");
cleanDist();
copyAppAssets();
copyMarketplacePlugins();
copyModelCatalog();
copyBrowserRendererHtml();
copyRendererHtml();
copyTrayRendererHtml();
await buildStyles({ minify: false });

const tailwindProcess = spawn(binPath("tailwindcss"), ["-i", cssInput, "-o", cssOutput, "--watch"], {
  cwd: projectRoot,
  stdio: "inherit",
  shell: process.platform === "win32"
});
logDev(`Tailwind watcher started pid=${tailwindProcess.pid ?? "unknown"} input=${relativePath(cssInput)} output=${relativePath(cssOutput)}`);
tailwindProcess.on("exit", (code, signal) => {
  logDev(`Tailwind watcher exited code=${code ?? "null"} signal=${signal ?? "null"}`);
});

rememberWatchSignature("home html", rendererHtmlInput);
rememberWatchSignature("browser html", browserRendererHtmlInput);
rememberWatchSignature("tray html", trayRendererHtmlInput);
rememberWatchSignature("app assets", appAssetsInput);
if (existsSync(modelCatalogInput)) {
  rememberWatchSignature("model catalog", modelCatalogInput);
}

const htmlWatcher = watch(rendererHtmlInput, { persistent: true }, (eventType, filename) => {
  handleWatchedInput("home html", rendererHtmlInput, eventType, filename, undefined, copyRendererHtml);
});

const browserHtmlWatcher = watch(browserRendererHtmlInput, { persistent: true }, (eventType, filename) => {
  handleWatchedInput("browser html", browserRendererHtmlInput, eventType, filename, undefined, copyBrowserRendererHtml);
});

const trayHtmlWatcher = watch(trayRendererHtmlInput, { persistent: true }, (eventType, filename) => {
  handleWatchedInput("tray html", trayRendererHtmlInput, eventType, filename, undefined, copyTrayRendererHtml);
});

const appAssetsWatcher = watch(appAssetsInput, { persistent: true }, (eventType, filename) => {
  handleWatchedInput("app assets", appAssetsInput, eventType, filename, { isDirectory: true }, copyAppAssets);
});

const modelCatalogWatcher = existsSync(modelCatalogInput)
  ? watch(modelCatalogInput, { persistent: true }, (eventType, filename) => {
      handleWatchedInput("model catalog", modelCatalogInput, eventType, filename, undefined, copyModelCatalog);
    })
  : { close: () => undefined };

const mainContext = await esbuild.context(
  createMainBuildOptions({
    mode: "development",
    plugins: [watchPlugin("main", (name) => markReady(name))]
  })
);

const cliContext = await esbuild.context(
  createCliBuildOptions({
    mode: "development",
    plugins: [watchPlugin("cli", (name) => markReady(name))]
  })
);

const rendererContext = await esbuild.context(
  createRendererBuildOptions({
    mode: "development",
    plugins: [
      watchPlugin("renderer", (name) => {
        copyRendererHtml();
        markReady(name);
      })
    ]
  })
);

const trayRendererContext = await esbuild.context(
  createTrayRendererBuildOptions({
    mode: "development",
    plugins: [
      watchPlugin("tray", (name) => {
        copyTrayRendererHtml();
        markReady(name);
      })
    ]
  })
);

const browserRendererContext = await esbuild.context(
  createBrowserRendererBuildOptions({
    mode: "development",
    plugins: [
      watchPlugin("browser", (name) => {
        copyBrowserRendererHtml();
        markReady(name);
      })
    ]
  })
);

const webClientBridgeContext = await esbuild.context(
  createWebClientBridgeBuildOptions({
    mode: "development",
    plugins: [watchPlugin("webBridge", (name) => markReady(name))]
  })
);

await Promise.all([mainContext.watch(), cliContext.watch(), rendererContext.watch(), trayRendererContext.watch(), browserRendererContext.watch(), webClientBridgeContext.watch()]);
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
  tailwindProcess.kill();
  htmlWatcher.close();
  browserHtmlWatcher.close();
  trayHtmlWatcher.close();
  appAssetsWatcher.close();
  modelCatalogWatcher.close();
  await Promise.all([mainContext.dispose(), cliContext.dispose(), rendererContext.dispose(), trayRendererContext.dispose(), browserRendererContext.dispose(), webClientBridgeContext.dispose()]);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
