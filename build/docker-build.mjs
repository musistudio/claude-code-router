import {
  buildBrowserRenderer,
  buildCoreServer,
  buildRenderer,
  buildRequestLogBodyWorker,
  buildStyles,
  buildTrayRenderer,
  buildWebClientBridge,
  cleanDist,
  copyBrowserRendererHtml,
  copyModelCatalog,
  copyRendererHtml,
  copyTrayRendererHtml,
  syncUiRendererToRuntimeDists
} from "./esbuild.config.mjs";

const mode = process.argv.includes("--dev") ? "development" : "production";

cleanDist();
copyModelCatalog();
copyBrowserRendererHtml();
copyRendererHtml();
copyTrayRendererHtml();

await Promise.all([
  buildCoreServer({ mode }),
  buildBrowserRenderer({ mode }),
  buildRenderer({ mode }),
  buildRequestLogBodyWorker({ mode }),
  buildTrayRenderer({ mode }),
  buildWebClientBridge({ mode }),
  buildStyles({ minify: mode === "production" })
]);

syncUiRendererToRuntimeDists();

console.log(`Built Docker core server and UI assets in ${mode} mode.`);
