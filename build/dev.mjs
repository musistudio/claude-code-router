import electron from "electron";
import esbuild from "esbuild";
import { spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
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
  createMainBuildOptions,
  createRendererBuildOptions,
  createTrayRendererBuildOptions,
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
let shuttingDown = false;
const ready = {
  browser: false,
  main: false,
  renderer: false,
  tray: false
};

function markReady(name) {
  if (name === "browser" || name === "main" || name === "renderer" || name === "tray") {
    ready[name] = true;
  }
  if (ready.browser && ready.main && ready.renderer && ready.tray) {
    scheduleRestart();
  }
}

function scheduleRestart() {
  if (shuttingDown) {
    return;
  }
  if (restartTimer) {
    clearTimeout(restartTimer);
  }
  restartTimer = setTimeout(restartElectron, 160);
}

function restartElectron() {
  if (electronProcess) {
    electronProcess.kill();
    electronProcess = null;
  }

  electronProcess = spawn(electron, ["."], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "development"
    },
    stdio: "inherit"
  });
}

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
  stdio: "inherit"
});

const htmlWatcher = watch(rendererHtmlInput, { persistent: true }, () => {
  copyRendererHtml();
  scheduleRestart();
});

const browserHtmlWatcher = watch(browserRendererHtmlInput, { persistent: true }, () => {
  copyBrowserRendererHtml();
  scheduleRestart();
});

const trayHtmlWatcher = watch(trayRendererHtmlInput, { persistent: true }, () => {
  copyTrayRendererHtml();
  scheduleRestart();
});

const appAssetsWatcher = watch(appAssetsInput, { persistent: true }, () => {
  copyAppAssets();
  scheduleRestart();
});

const modelCatalogWatcher = existsSync(modelCatalogInput)
  ? watch(modelCatalogInput, { persistent: true }, () => {
      copyModelCatalog();
      scheduleRestart();
    })
  : { close: () => undefined };

const mainContext = await esbuild.context(
  createMainBuildOptions({
    mode: "development",
    plugins: [watchPlugin("main", markReady)]
  })
);

const rendererContext = await esbuild.context(
  createRendererBuildOptions({
    mode: "development",
    plugins: [
      watchPlugin("renderer", () => {
        copyRendererHtml();
        markReady("renderer");
      })
    ]
  })
);

const trayRendererContext = await esbuild.context(
  createTrayRendererBuildOptions({
    mode: "development",
    plugins: [
      watchPlugin("tray", () => {
        copyTrayRendererHtml();
        markReady("tray");
      })
    ]
  })
);

const browserRendererContext = await esbuild.context(
  createBrowserRendererBuildOptions({
    mode: "development",
    plugins: [
      watchPlugin("browser", () => {
        copyBrowserRendererHtml();
        markReady("browser");
      })
    ]
  })
);

await Promise.all([mainContext.watch(), rendererContext.watch(), trayRendererContext.watch(), browserRendererContext.watch()]);

async function shutdown() {
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
  await Promise.all([mainContext.dispose(), rendererContext.dispose(), trayRendererContext.dispose(), browserRendererContext.dispose()]);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
