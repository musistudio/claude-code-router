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
export const rendererRoot = path.join(projectRoot, "src", "renderer");
export const rendererHtmlInput = path.join(rendererRoot, "pages", "home", "index.html");
export const rendererHtmlOutput = path.join(rendererOutDir, "pages", "home", "index.html");
export const browserRendererHtmlInput = path.join(rendererRoot, "pages", "browser", "index.html");
export const browserRendererHtmlOutput = path.join(rendererOutDir, "pages", "browser", "index.html");
export const trayRendererHtmlInput = path.join(rendererRoot, "pages", "tray", "index.html");
export const trayRendererHtmlOutput = path.join(rendererOutDir, "pages", "tray", "index.html");
export const cssInput = path.join(rendererRoot, "styles", "globals.css");
export const cssOutput = path.join(rendererAssetsDir, "main.css");

const nodeExternals = [
  "electron",
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
    entryNames: "[name]",
    entryPoints: [
      path.join(projectRoot, "src", "main", "main.ts"),
      path.join(projectRoot, "src", "main", "browser-preload.ts"),
      path.join(projectRoot, "src", "main", "cli.ts"),
      path.join(projectRoot, "src", "main", "mcp", "fusion-vision-mcp.ts"),
      path.join(projectRoot, "src", "main", "preload.ts")
    ],
    external: nodeExternals,
    format: "cjs",
    legalComments: "none",
    logLevel: "info",
    minify: mode === "production",
    outdir: mainOutDir,
    platform: "node",
    plugins,
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
  await esbuild.build(createMainBuildOptions(options));
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
