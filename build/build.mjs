import { buildBrowserRenderer, buildMain, buildRenderer, buildStyles, buildTrayRenderer, cleanDist, copyAppAssets, copyBrowserRendererHtml, copyMarketplacePlugins, copyModelCatalog, copyRendererHtml, copyTrayRendererHtml } from "./esbuild.config.mjs";

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
  buildStyles({ minify: mode === "production" })
]);

console.log(`Built Electron app assets in ${mode} mode.`);
