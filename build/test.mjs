import esbuild from "esbuild";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const testsOutDir = path.join(projectRoot, "dist", "tests");
const rendererRoot = path.join(projectRoot, "src", "renderer");
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
  const entryPoints = findTestFiles(suite.testDir);
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
    plugins: [rendererAliasPlugin()],
    target: "node22"
  });
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

function resolveRendererImport(importPath) {
  const basePath = path.resolve(rendererRoot, importPath);
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
