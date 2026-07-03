import esbuild from "esbuild";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const projectRoot = path.resolve(__dirname, "..");
export const distDir = path.join(projectRoot, "dist");
export const mainOutDir = path.join(distDir, "main");
export const rendererOutDir = path.join(distDir, "renderer");
export const appAssetsDir = path.join(distDir, "assets");
export const rendererAssetsDir = path.join(rendererOutDir, "assets");
export const marketplacePluginsDir = path.join(distDir, "marketplace", "plugins");
export const appAssetsInput = path.join(projectRoot, "assets");
export const modelCatalogInput = path.join(projectRoot, "models.json");
export const modelCatalogOutput = path.join(distDir, "models.json");
export const rendererRoot = path.join(projectRoot, "src", "renderer");
export const rendererHtmlInput = path.join(rendererRoot, "pages", "home", "index.html");
export const rendererHtmlOutput = path.join(rendererOutDir, "pages", "home", "index.html");
export const browserRendererHtmlInput = path.join(rendererRoot, "pages", "browser", "index.html");
export const browserRendererHtmlOutput = path.join(rendererOutDir, "pages", "browser", "index.html");
export const trayRendererHtmlInput = path.join(rendererRoot, "pages", "tray", "index.html");
export const trayRendererHtmlOutput = path.join(rendererOutDir, "pages", "tray", "index.html");
export const cssInput = path.join(rendererRoot, "styles", "globals.css");
export const cssOutput = path.join(rendererAssetsDir, "main.css");
export const webClientBridgeOutput = path.join(rendererAssetsDir, "web-client-bridge.js");
const lightweightMcpBundleNames = ["browser-web-search-proxy-mcp.js", "fusion-vision-mcp.js", "fusion-tool-fallback-mcp.js"];
const lightweightMcpBundleMaxBytes = 128 * 1024;
const forbiddenLightweightMcpInputs = [
  { prefix: "src/main/", reason: "main-process modules can pull in config, Electron, or native storage side effects" },
  { prefix: "src/renderer/", reason: "renderer modules do not belong in stdio MCP subprocesses" },
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
  rmSync(distDir, { force: true, recursive: true });
  ensureDist();
}

export function ensureDist() {
  mkdirSync(mainOutDir, { recursive: true });
  mkdirSync(appAssetsDir, { recursive: true });
  mkdirSync(marketplacePluginsDir, { recursive: true });
  mkdirSync(rendererAssetsDir, { recursive: true });
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
    cpSync(modelCatalogInput, modelCatalogOutput);
  }
}

export function copyRendererHtml() {
  copyRendererPageHtml(rendererHtmlInput, rendererHtmlOutput, "main.js");
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
    const target = path.join(marketplacePluginsDir, filename);
    if (existsSync(source)) {
      cpSync(source, target);
    }
  }
}

function copyRendererPageHtml(input, output, scriptName) {
  ensureDist();
  const source = readFileSync(input, "utf8");
  const styleTag = '    <link rel="stylesheet" href="../../assets/main.css" />';
  const scriptTag = `    <script type="module" src="../../assets/${scriptName}"></script>`;
  let html = source.includes('<script type="module" src="./main.tsx"></script>')
    ? source.replace('    <script type="module" src="./main.tsx"></script>', scriptTag)
    : source.replace("</body>", `${scriptTag}\n  </body>`);

  if (!html.includes('href="../../assets/main.css"')) {
    html = html.replace("</head>", `${styleTag}\n  </head>`);
  }

  writeFileSync(output, html, "utf8");
}

export function createMainBuildOptions({ mode = "production", plugins = [] } = {}) {
  return {
    absWorkingDir: projectRoot,
    bundle: true,
    define: {
      "process.env.CCR_ENV": JSON.stringify(mode),
      "process.env.NODE_ENV": JSON.stringify(mode)
    },
    entryNames: "[name]",
    entryPoints: [
      path.join(projectRoot, "src", "main", "main.ts"),
      path.join(projectRoot, "src", "main", "browser-preload.ts"),
      path.join(projectRoot, "src", "server", "mcp", "browser-web-search-proxy-mcp.ts"),
      path.join(projectRoot, "src", "server", "mcp", "fusion-vision-mcp.ts"),
      path.join(projectRoot, "src", "server", "mcp", "fusion-tool-fallback-mcp.ts"),
      path.join(projectRoot, "src", "main", "preload.ts")
    ],
    external: nodeExternals,
    format: "cjs",
    legalComments: "none",
    logLevel: "info",
    metafile: true,
    minify: mode === "production",
    outdir: mainOutDir,
    platform: "node",
    plugins,
    sourcemap: mode !== "production",
    target: "node22"
  };
}

export function createCliBuildOptions({ mode = "production", plugins = [] } = {}) {
  return {
    absWorkingDir: projectRoot,
    bundle: true,
    entryNames: "[name]",
    entryPoints: [path.join(projectRoot, "src", "main", "cli.ts")],
    external: nodeExternals.filter((moduleName) => moduleName !== "electron"),
    format: "cjs",
    legalComments: "none",
    logLevel: "info",
    minify: mode === "production",
    outdir: mainOutDir,
    platform: "node",
    plugins: [forbidCliElectronPlugin(), ...plugins],
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
    plugins: [rendererAliasPlugin(), ...plugins],
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
    entryPoints: [path.join(projectRoot, "src", "main", "web-client-bridge.ts")],
    format: "iife",
    legalComments: "none",
    logLevel: "info",
    minify: mode === "production",
    outfile: webClientBridgeOutput,
    platform: "browser",
    plugins,
    sourcemap: mode !== "production",
    target: "chrome120"
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
    esbuild.build(createCliBuildOptions(options))
  ]);
  validateLightweightMcpBundles(mainBuildResult.metafile);
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
  const basePath = path.resolve(rendererRoot, importPath);
  const candidates = [
    basePath,
    `${basePath}.tsx`,
    `${basePath}.ts`,
    `${basePath}.jsx`,
    `${basePath}.js`,
    `${basePath}.json`,
    `${basePath}.css`,
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.jsx"),
    path.join(basePath, "index.js")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return basePath;
}
