import esbuild from "esbuild";
import { spawn } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireFromHere = createRequire(import.meta.url);

export const projectRoot = path.resolve(__dirname, "..");
export const packagesRoot = path.join(projectRoot, "packages");
export const cliRoot = path.join(packagesRoot, "cli");
export const coreRoot = path.join(packagesRoot, "core");
export const electronRoot = path.join(packagesRoot, "electron");
export const uiRoot = path.join(packagesRoot, "ui");
export const cliSourceRoot = path.join(cliRoot, "src");
export const coreSourceRoot = path.join(coreRoot, "src");
export const electronSourceRoot = path.join(electronRoot, "src");
export const uiSourceRoot = path.join(uiRoot, "src");
export const legacyDistDir = path.join(projectRoot, "dist");
export const cliDistDir = path.join(cliRoot, "dist");
export const coreDistDir = path.join(coreRoot, "dist");
export const electronDistDir = path.join(electronRoot, "dist");
export const uiDistDir = path.join(uiRoot, "dist");
export const distDir = electronDistDir;
export const cliMainOutDir = path.join(cliDistDir, "main");
export const coreMainOutDir = path.join(coreDistDir, "main");
export const electronMainOutDir = path.join(electronDistDir, "main");
export const mainOutDir = electronMainOutDir;
export const gatewayPackageRoot = path.dirname(requireFromHere.resolve("@the-next-ai/ai-gateway/package.json"));
export const gatewayRuntimeInput = path.join(gatewayPackageRoot, "bin", "next-ai-gateway.js");
export const electronGatewayRuntimeOutput = path.join(electronMainOutDir, "next-ai-gateway.js");
export const botGatewaySdkPackageRoot = path.dirname(requireFromHere.resolve("@the-next-ai/bot-gateway-sdk/package.json"));
export const botGatewaySdkEntryInput = path.join(botGatewaySdkPackageRoot, "dist", "index.js");
export const botGatewaySdkRunnerInput = path.join(botGatewaySdkPackageRoot, "bin", "bot-gateway-stdio.mjs");
export const electronBotGatewaySdkRootDir = path.join(electronMainOutDir, "bot-gateway-sdk");
export const electronBotGatewaySdkDistDir = path.join(electronBotGatewaySdkRootDir, "dist");
export const electronBotGatewaySdkBinDir = path.join(electronBotGatewaySdkRootDir, "bin");
export const electronBotGatewaySdkPackageOutput = path.join(electronBotGatewaySdkRootDir, "package.json");
export const electronBotGatewaySdkEntryOutput = path.join(electronBotGatewaySdkDistDir, "index.js");
export const electronBotGatewaySdkRunnerOutput = path.join(electronBotGatewaySdkBinDir, "bot-gateway-stdio.mjs");
export const rendererOutDir = path.join(uiDistDir, "renderer");
export const cliRendererOutDir = path.join(cliDistDir, "renderer");
export const coreRendererOutDir = path.join(coreDistDir, "renderer");
export const electronRendererOutDir = path.join(electronDistDir, "renderer");
export const runtimeRendererOutDirs = [cliRendererOutDir, coreRendererOutDir, electronRendererOutDir];
export const appAssetsDir = path.join(electronDistDir, "assets");
export const rendererAssetsDir = path.join(rendererOutDir, "assets");
export const cliMarketplacePluginsDir = path.join(cliDistDir, "marketplace", "plugins");
export const coreMarketplacePluginsDir = path.join(coreDistDir, "marketplace", "plugins");
export const electronMarketplacePluginsDir = path.join(electronDistDir, "marketplace", "plugins");
export const marketplacePluginsDir = electronMarketplacePluginsDir;
export const appAssetsInput = path.join(electronRoot, "assets");
export const modelCatalogInput = path.join(coreRoot, "models.json");
export const cliModelCatalogOutput = path.join(cliDistDir, "models.json");
export const coreModelCatalogOutput = path.join(coreDistDir, "models.json");
export const electronModelCatalogOutput = path.join(electronDistDir, "models.json");
export const modelCatalogOutput = electronModelCatalogOutput;
export const rendererRoot = uiSourceRoot;
export const rendererHtmlInput = path.join(rendererRoot, "pages", "home", "index.html");
export const rendererHtmlOutput = path.join(rendererOutDir, "pages", "home", "index.html");
export const browserRendererHtmlInput = path.join(rendererRoot, "pages", "browser", "index.html");
export const browserRendererHtmlOutput = path.join(rendererOutDir, "pages", "browser", "index.html");
export const trayRendererHtmlInput = path.join(rendererRoot, "pages", "tray", "index.html");
export const trayRendererHtmlOutput = path.join(rendererOutDir, "pages", "tray", "index.html");
export const cssInput = path.join(rendererRoot, "styles", "globals.css");
export const cssOutput = path.join(rendererAssetsDir, "main.css");
export const webClientBridgeOutput = path.join(rendererAssetsDir, "web-client-bridge.js");
export const electronUndiciProxyAgentInput = path.join(coreSourceRoot, "proxy", "undici-proxy-agent.ts");
const lightweightMcpBundleNames = ["browser-web-search-proxy-mcp.js", "fusion-vision-mcp.js", "fusion-tool-fallback-mcp.js"];
const lightweightMcpBundleMaxBytes = 128 * 1024;
const forbiddenLightweightMcpInputs = [
  { prefix: "packages/core/src/config/", reason: "config modules can pull in native storage side effects" },
  { prefix: "packages/core/src/storage/", reason: "native SQLite storage is not allowed in lightweight MCP subprocesses" },
  { prefix: "packages/electron/src/", reason: "Electron runtime modules are not allowed in lightweight MCP subprocesses" },
  { prefix: "packages/ui/src/", reason: "UI modules do not belong in stdio MCP subprocesses" },
  { prefix: "node_modules/better-sqlite3/", reason: "native SQLite is not allowed in lightweight MCP subprocesses" },
  { prefix: "node_modules/electron/", reason: "Electron runtime modules are not allowed in lightweight MCP subprocesses" }
];
const forbiddenLightweightMcpExternalImports = new Set(["better-sqlite3", "electron"]);

const nodeExternals = [
  "electron",
  "better-sqlite3",
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`)
];

export function cleanDist() {
  rmSync(legacyDistDir, { force: true, recursive: true });
  rmSync(cliDistDir, { force: true, recursive: true });
  rmSync(coreDistDir, { force: true, recursive: true });
  rmSync(electronDistDir, { force: true, recursive: true });
  rmSync(uiDistDir, { force: true, recursive: true });
  ensureDist();
}

export function ensureDist() {
  mkdirSync(cliMainOutDir, { recursive: true });
  mkdirSync(coreMainOutDir, { recursive: true });
  mkdirSync(electronMainOutDir, { recursive: true });
  mkdirSync(electronBotGatewaySdkDistDir, { recursive: true });
  mkdirSync(electronBotGatewaySdkBinDir, { recursive: true });
  mkdirSync(appAssetsDir, { recursive: true });
  mkdirSync(cliMarketplacePluginsDir, { recursive: true });
  mkdirSync(coreMarketplacePluginsDir, { recursive: true });
  mkdirSync(electronMarketplacePluginsDir, { recursive: true });
  mkdirSync(rendererAssetsDir, { recursive: true });
  for (const outputDir of runtimeRendererOutDirs) {
    mkdirSync(path.join(outputDir, "assets"), { recursive: true });
  }
  mkdirSync(path.dirname(rendererHtmlOutput), { recursive: true });
  mkdirSync(path.dirname(browserRendererHtmlOutput), { recursive: true });
  mkdirSync(path.dirname(trayRendererHtmlOutput), { recursive: true });
}

export function copyAppAssets() {
  ensureDist();
  if (existsSync(appAssetsInput)) {
    cpSync(appAssetsInput, appAssetsDir, { recursive: true });
  }
}

export function copyModelCatalog() {
  ensureDist();
  if (existsSync(modelCatalogInput)) {
    cpSync(modelCatalogInput, cliModelCatalogOutput);
    cpSync(modelCatalogInput, coreModelCatalogOutput);
    cpSync(modelCatalogInput, electronModelCatalogOutput);
  }
}

export function copyRendererHtml() {
  copyRendererPageHtml(rendererHtmlInput, rendererHtmlOutput, "main.js", {
    beforeModuleScriptTags: ['    <script src="../../assets/web-client-bridge.js"></script>']
  });
}

export function copyTrayRendererHtml() {
  copyRendererPageHtml(trayRendererHtmlInput, trayRendererHtmlOutput, "tray.js");
}

export function copyBrowserRendererHtml() {
  copyRendererPageHtml(browserRendererHtmlInput, browserRendererHtmlOutput, "browser.js");
}

export function copyMarketplacePlugins() {
  ensureDist();
  for (const filename of ["claude-design-plugin.cjs", "cursor-proxy-plugin.cjs"]) {
    const source = path.join(projectRoot, "examples", "plugins", filename);
    if (existsSync(source)) {
      cpSync(source, path.join(cliMarketplacePluginsDir, filename));
      cpSync(source, path.join(coreMarketplacePluginsDir, filename));
      cpSync(source, path.join(electronMarketplacePluginsDir, filename));
    }
  }
}

export function syncUiRendererToRuntimeDists() {
  ensureDist();
  for (const outputDir of runtimeRendererOutDirs) {
    rmSync(outputDir, { force: true, recursive: true });
    if (existsSync(rendererOutDir)) {
      cpSync(rendererOutDir, outputDir, { recursive: true });
    }
  }
}

function copyRendererPageHtml(input, output, scriptName, options = {}) {
  ensureDist();
  const source = readFileSync(input, "utf8");
  const styleTag = '    <link rel="stylesheet" href="../../assets/main.css" />';
  const scriptTag = `    <script type="module" src="../../assets/${scriptName}"></script>`;
  let html = source.includes('<script type="module" src="./main.tsx"></script>')
    ? source.replace('    <script type="module" src="./main.tsx"></script>', scriptTag)
    : source.replace("</body>", `${scriptTag}\n  </body>`);

  for (const extraScriptTag of options.beforeModuleScriptTags ?? []) {
    if (!hasScriptTag(html, extraScriptTag)) {
      html = html.replace(scriptTag, `${extraScriptTag}\n${scriptTag}`);
    }
  }

  if (!html.includes('href="../../assets/main.css"')) {
    html = html.replace("</head>", `${styleTag}\n  </head>`);
  }

  writeFileSync(output, html, "utf8");
}

function hasScriptTag(html, scriptTag) {
  const sourceMatch = scriptTag.match(/\bsrc="([^"]+)"/);
  return sourceMatch ? html.includes(sourceMatch[1]) : html.includes(scriptTag);
}

function normalizeDuplicateShebangs(source) {
  const lines = source.split("\n");
  if (!lines[0]?.startsWith("#!")) {
    return source;
  }
  let index = 1;
  while (lines[index]?.startsWith("#!")) {
    index += 1;
  }
  return [lines[0], ...lines.slice(index)].join("\n");
}

export function createMainBuildOptions({ mode = "production", plugins = [] } = {}) {
  return {
    absWorkingDir: projectRoot,
    bundle: true,
    entryNames: "[name]",
    entryPoints: [
      path.join(electronSourceRoot, "main", "main.ts"),
      path.join(electronSourceRoot, "main", "browser-preload.ts"),
      gatewayRuntimeInput,
      path.join(coreSourceRoot, "mcp", "browser-web-search-proxy-mcp.ts"),
      path.join(coreSourceRoot, "mcp", "fusion-vision-mcp.ts"),
      path.join(coreSourceRoot, "mcp", "fusion-tool-fallback-mcp.ts"),
      path.join(coreSourceRoot, "mcp", "toolhub-mcp.ts"),
      electronUndiciProxyAgentInput,
      path.join(electronSourceRoot, "main", "preload.ts")
    ],
    external: nodeExternals,
    format: "cjs",
    legalComments: "none",
    logLevel: "info",
    metafile: true,
    minify: mode === "production",
    outdir: electronMainOutDir,
    platform: "node",
    plugins: [packageAliasPlugin(), ...plugins],
    sourcemap: mode !== "production",
    target: "node22"
  };
}

export function createCliBuildOptions({ mode = "production", plugins = [] } = {}) {
  return {
    absWorkingDir: projectRoot,
    bundle: true,
    entryNames: "[name]",
    entryPoints: [
      path.join(cliSourceRoot, "cli.ts"),
      path.join(coreSourceRoot, "mcp", "fusion-vision-mcp.ts"),
      path.join(coreSourceRoot, "mcp", "fusion-tool-fallback-mcp.ts"),
      path.join(coreSourceRoot, "mcp", "toolhub-mcp.ts")
    ],
    external: nodeExternals.filter((moduleName) => moduleName !== "electron"),
    format: "cjs",
    legalComments: "none",
    logLevel: "info",
    minify: mode === "production",
    outdir: cliMainOutDir,
    platform: "node",
    plugins: [forbidCliElectronPlugin(), packageAliasPlugin(), ...plugins],
    sourcemap: mode !== "production",
    target: "node22"
  };
}

export function createCoreServerBuildOptions({ mode = "production", plugins = [] } = {}) {
  return {
    absWorkingDir: projectRoot,
    bundle: true,
    entryNames: "[name]",
    entryPoints: [
      path.join(coreSourceRoot, "entrypoints", "server.ts"),
      path.join(coreSourceRoot, "mcp", "fusion-vision-mcp.ts"),
      path.join(coreSourceRoot, "mcp", "fusion-tool-fallback-mcp.ts"),
      path.join(coreSourceRoot, "mcp", "toolhub-mcp.ts")
    ],
    external: nodeExternals.filter((moduleName) => moduleName !== "electron"),
    format: "cjs",
    legalComments: "none",
    logLevel: "info",
    minify: mode === "production",
    outdir: coreMainOutDir,
    platform: "node",
    plugins: [forbidCliElectronPlugin(), packageAliasPlugin(), ...plugins],
    sourcemap: mode !== "production",
    target: "node22"
  };
}

export function createRendererBuildOptions({ mode = "production", plugins = [] } = {}) {
  return {
    absWorkingDir: projectRoot,
    assetNames: "assets/[name]-[hash]",
    bundle: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify(mode)
    },
    entryPoints: [path.join(rendererRoot, "pages", "home", "main.tsx")],
    format: "esm",
    jsx: "automatic",
    legalComments: "none",
    loader: {
      ".gif": "file",
      ".ico": "file",
      ".jpg": "file",
      ".jpeg": "file",
      ".png": "file",
      ".svg": "file",
      ".webp": "file"
    },
    logLevel: "info",
    minify: mode === "production",
    outfile: path.join(rendererAssetsDir, "main.js"),
    platform: "browser",
    plugins: [rendererAliasPlugin(), packageAliasPlugin(), ...plugins],
    publicPath: "../../assets",
    sourcemap: mode !== "production",
    target: "chrome120"
  };
}

export function createTrayRendererBuildOptions({ mode = "production", plugins = [] } = {}) {
  return {
    ...createRendererBuildOptions({ mode, plugins }),
    entryPoints: [path.join(rendererRoot, "pages", "tray", "main.tsx")],
    outfile: path.join(rendererAssetsDir, "tray.js")
  };
}

export function createBrowserRendererBuildOptions({ mode = "production", plugins = [] } = {}) {
  return {
    ...createRendererBuildOptions({ mode, plugins }),
    entryPoints: [path.join(rendererRoot, "pages", "browser", "main.tsx")],
    outfile: path.join(rendererAssetsDir, "browser.js")
  };
}

export function createWebClientBridgeBuildOptions({ mode = "production", plugins = [] } = {}) {
  return {
    absWorkingDir: projectRoot,
    bundle: true,
    entryPoints: [path.join(uiSourceRoot, "web-client-bridge.ts")],
    format: "iife",
    legalComments: "none",
    logLevel: "info",
    minify: mode === "production",
    outfile: webClientBridgeOutput,
    platform: "browser",
    plugins: [packageAliasPlugin(), ...plugins],
    sourcemap: mode !== "production",
    target: "chrome120"
  };
}

export function createBotGatewaySdkBuildOptions({ mode = "production", plugins = [] } = {}) {
  return {
    absWorkingDir: projectRoot,
    bundle: true,
    entryPoints: [botGatewaySdkEntryInput],
    external: [
      ...builtinModules,
      ...builtinModules.map((moduleName) => `node:${moduleName}`)
    ],
    format: "esm",
    legalComments: "none",
    logLevel: "info",
    minify: mode === "production",
    outfile: electronBotGatewaySdkEntryOutput,
    platform: "node",
    plugins,
    sourcemap: mode !== "production",
    target: "node22"
  };
}

export function watchPlugin(name, onEnd) {
  return {
    name: `${name}-watch`,
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length === 0) {
          onEnd(name);
        }
      });
    }
  };
}

export async function buildMain(options = {}) {
  const [mainBuildResult] = await Promise.all([
    esbuild.build(createMainBuildOptions(options)),
    buildBotGatewaySdkRuntime(options),
    buildCoreServer(options),
    buildCli(options)
  ]);
  copyCliRuntimeToElectronDist();
  validateLightweightMcpBundles(mainBuildResult.metafile);
}

export async function buildBotGatewaySdkRuntime(options = {}) {
  ensureDist();
  await esbuild.build(createBotGatewaySdkBuildOptions(options));
  writeFileSync(
    electronBotGatewaySdkPackageOutput,
    `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`,
    "utf8"
  );
  writeFileSync(
    electronBotGatewaySdkRunnerOutput,
    normalizeDuplicateShebangs(readFileSync(botGatewaySdkRunnerInput, "utf8")),
    "utf8"
  );
  chmodSync(electronBotGatewaySdkRunnerOutput, 0o755);
}

export async function buildCli(options = {}) {
  await esbuild.build(createCliBuildOptions(options));
}

export async function buildCoreServer(options = {}) {
  await esbuild.build(createCoreServerBuildOptions(options));
}

export async function buildRenderer(options = {}) {
  await esbuild.build(createRendererBuildOptions(options));
}

export async function buildTrayRenderer(options = {}) {
  await esbuild.build(createTrayRendererBuildOptions(options));
}

export async function buildBrowserRenderer(options = {}) {
  await esbuild.build(createBrowserRendererBuildOptions(options));
}

export async function buildWebClientBridge(options = {}) {
  await esbuild.build(createWebClientBridgeBuildOptions(options));
}

export function copyCliRuntimeToElectronDist() {
  ensureDist();
  const cliRuntime = path.join(cliMainOutDir, "cli.js");
  if (existsSync(cliRuntime)) {
    cpSync(cliRuntime, path.join(electronMainOutDir, "cli.js"));
  }
}

export async function buildStyles({ minify = false } = {}) {
  ensureDist();
  const args = ["-i", cssInput, "-o", cssOutput];
  if (minify) {
    args.push("--minify");
  }
  await runCommand(binPath("tailwindcss"), args);
}

export function binPath(name) {
  const extension = process.platform === "win32" ? ".cmd" : "";
  return path.join(projectRoot, "node_modules", ".bin", `${name}${extension}`);
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${path.basename(command)} exited with code ${code}`));
    });
  });
}

function rendererAliasPlugin() {
  return {
    name: "renderer-alias",
    setup(build) {
      build.onResolve({ filter: /^@\// }, (args) => {
        return { path: resolveRendererImport(args.path.slice(2)) };
      });
    }
  };
}

function packageAliasPlugin() {
  return {
    name: "ccr-package-alias",
    setup(build) {
      build.onResolve({ filter: /^@ccr\/cli\// }, (args) => {
        return { path: resolvePackageImport(cliSourceRoot, args.path.slice("@ccr/cli/".length)) };
      });
      build.onResolve({ filter: /^@ccr\/core\// }, (args) => {
        return { path: resolvePackageImport(coreSourceRoot, args.path.slice("@ccr/core/".length)) };
      });
      build.onResolve({ filter: /^@ccr\/electron\// }, (args) => {
        return { path: resolvePackageImport(electronSourceRoot, args.path.slice("@ccr/electron/".length)) };
      });
      build.onResolve({ filter: /^@ccr\/ui\// }, (args) => {
        return { path: resolvePackageImport(uiSourceRoot, args.path.slice("@ccr/ui/".length)) };
      });
    }
  };
}

function forbidCliElectronPlugin() {
  return {
    name: "forbid-cli-electron",
    setup(build) {
      build.onResolve({ filter: /^electron$/ }, () => {
        return {
          errors: [
            {
              text: "CLI bundle must not import electron. Move the dependency behind a desktop-only boundary."
            }
          ]
        };
      });
    }
  };
}

function validateLightweightMcpBundles(metafile) {
  if (!metafile) {
    return;
  }

  const outputsByName = new Map(
    Object.entries(metafile.outputs).map(([outputPath, output]) => [path.basename(outputPath), { output, outputPath }])
  );

  for (const bundleName of lightweightMcpBundleNames) {
    const entry = outputsByName.get(bundleName);
    if (!entry) {
      continue;
    }

    const violations = [];
    if (entry.output.bytes > lightweightMcpBundleMaxBytes) {
      violations.push(`bundle size ${entry.output.bytes} bytes exceeds ${lightweightMcpBundleMaxBytes} bytes`);
    }

    for (const inputPath of Object.keys(entry.output.inputs ?? {})) {
      const normalizedInput = normalizeBuildPath(inputPath);
      for (const rule of forbiddenLightweightMcpInputs) {
        if (normalizedInput.startsWith(rule.prefix)) {
          violations.push(`${normalizedInput} (${rule.reason})`);
        }
      }
    }

    for (const imported of entry.output.imports ?? []) {
      if (imported.external && forbiddenLightweightMcpExternalImports.has(imported.path)) {
        violations.push(`${imported.path} (external native/runtime dependency is not allowed)`);
      }
    }

    if (violations.length > 0) {
      throw new Error([
        `Lightweight MCP bundle ${bundleName} crossed its dependency boundary.`,
        ...violations.map((violation) => `- ${violation}`)
      ].join("\n"));
    }
  }
}

function normalizeBuildPath(value) {
  return value.split(path.sep).join("/");
}

function resolveRendererImport(importPath) {
  return resolvePackageImport(rendererRoot, importPath);
}

function resolvePackageImport(rootDir, importPath) {
  const packageBasePath = path.resolve(rootDir, importPath);
  const candidates = [
    packageBasePath,
    `${packageBasePath}.tsx`,
    `${packageBasePath}.ts`,
    `${packageBasePath}.jsx`,
    `${packageBasePath}.js`,
    `${packageBasePath}.json`,
    `${packageBasePath}.css`,
    path.join(packageBasePath, "index.tsx"),
    path.join(packageBasePath, "index.ts"),
    path.join(packageBasePath, "index.jsx"),
    path.join(packageBasePath, "index.js")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return packageBasePath;
}
