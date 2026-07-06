import { buildBrowserRenderer, buildMain, buildRenderer, buildStyles, buildTrayRenderer, buildWebClientBridge, cleanDist, copyAppAssets, copyBrowserRendererHtml, copyMarketplacePlugins, copyModelCatalog, copyRendererHtml, copyTrayRendererHtml, syncUiRendererToRuntimeDists } from "./esbuild.config.mjs";

const mode = process.argv.includes("--dev") ? "development" : "production";

cleanDist();
copyAppAssets();
copyMarketplacePlugins();
copyModelCatalog();
copyBrowserRendererHtml();
copyRendererHtml();
copyTrayRendererHtml();

await Promise.all([
  buildMain({ mode }),
  buildBrowserRenderer({ mode }),
  buildRenderer({ mode }),
  buildTrayRenderer({ mode }),
  buildWebClientBridge({ mode }),
  buildStyles({ minify: mode === "production" })
]);

syncUiRendererToRuntimeDists();

console.log(`Built monorepo package assets in ${mode} mode.`);
