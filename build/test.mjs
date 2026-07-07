import esbuild from "esbuild";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const testsOutDir = path.join(projectRoot, "dist", "tests");
const rendererRoot = path.join(projectRoot, "packages", "ui", "src");
const cliSourceRoot = path.join(projectRoot, "packages", "cli", "src");
const coreSourceRoot = path.join(projectRoot, "packages", "core", "src");
const testSuites = [
  { name: "main", testDir: path.join(projectRoot, "tests", "main") },
  { name: "renderer", testDir: path.join(projectRoot, "tests", "renderer") }
];
const requestedSuites = new Set(process.argv.slice(2));
const suiteNames = new Set(testSuites.map((suite) => suite.name));
const unknownSuites = [...requestedSuites].filter((suite) => !suiteNames.has(suite));
const selectedSuites = requestedSuites.size === 0
  ? testSuites
  : testSuites.filter((suite) => requestedSuites.has(suite.name));

if (unknownSuites.length > 0) {
  throw new Error(`Unknown test suite: ${unknownSuites.join(", ")}`);
}

rmSync(testsOutDir, { force: true, recursive: true });

for (const suite of selectedSuites) {
  const entryPoints = [
    ...findTestFiles(suite.testDir),
    ...runtimeEntryPointsForSuite(suite.name)
  ];
  if (entryPoints.length === 0) {
    continue;
  }

  await esbuild.build({
    absWorkingDir: projectRoot,
    bundle: true,
    entryNames: "[name]",
    entryPoints,
    external: [
      "better-sqlite3",
      "electron"
    ],
    format: "cjs",
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
    outdir: path.join(testsOutDir, suite.name),
    platform: "node",
    plugins: [rendererAliasPlugin(), packageAliasPlugin()],
    target: "node22"
  });
}

function runtimeEntryPointsForSuite(suiteName) {
  if (suiteName !== "main") {
    return [];
  }
  return [
    path.join(coreSourceRoot, "mcp", "fusion-vision-mcp.ts"),
    path.join(coreSourceRoot, "mcp", "toolhub-mcp.ts")
  ];
}

function findTestFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const files = [];
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    const stat = statSync(file);
    if (stat.isDirectory()) {
      files.push(...findTestFiles(file));
    } else if (/\.(test|spec)\.(mjs|ts|tsx)$/.test(name)) {
      files.push(file);
    }
  }
  return files.sort();
}

function rendererAliasPlugin() {
  return {
    name: "renderer-test-alias",
    setup(build) {
      build.onResolve({ filter: /^@\// }, (args) => {
        return { path: resolveRendererImport(args.path.slice(2)) };
      });
    }
  };
}

function packageAliasPlugin() {
  return {
    name: "test-package-alias",
    setup(build) {
      build.onResolve({ filter: /^@ccr\/cli\// }, (args) => {
        return { path: resolvePackageImport(cliSourceRoot, args.path.slice("@ccr/cli/".length)) };
      });
      build.onResolve({ filter: /^@ccr\/core\// }, (args) => {
        return { path: resolvePackageImport(coreSourceRoot, args.path.slice("@ccr/core/".length)) };
      });
    }
  };
}

function resolveRendererImport(importPath) {
  return resolvePackageImport(rendererRoot, importPath);
}

function resolvePackageImport(rootDir, importPath) {
  const basePath = path.resolve(rootDir, importPath);
  const candidates = [
    basePath,
    `${basePath}.tsx`,
    `${basePath}.ts`,
    `${basePath}.jsx`,
    `${basePath}.js`,
    `${basePath}.json`,
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
