import esbuild from "esbuild";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const testsOutDir = path.join(projectRoot, ".test-dist");
const packageRoots = {
  cli: path.join(projectRoot, "packages", "cli", "src"),
  core: path.join(projectRoot, "packages", "core", "src"),
  electron: path.join(projectRoot, "packages", "electron", "src"),
  ui: path.join(projectRoot, "packages", "ui", "src")
};
const testProjects = {
  architecture: {
    testDir: path.join(projectRoot, "tests", "architecture")
  },
  cli: {
    runtimeEntryPoints: {
      "runtime/cli": path.join(packageRoots.cli, "cli.ts")
    },
    testDir: path.join(projectRoot, "packages", "cli", "test")
  },
  core: {
    runtimeEntryPoints: {
      "runtime/fusion-vision-mcp": path.join(packageRoots.core, "mcp", "fusion-vision-mcp.ts"),
      "runtime/request-log-worker": path.join(packageRoots.core, "observability", "request-log-worker.ts"),
      "runtime/upstream-header-sanitizer": path.join(packageRoots.core, "gateway", "core-runtime", "upstream-header-sanitizer.ts"),
      "runtime/toolhub-mcp": path.join(packageRoots.core, "mcp", "toolhub-mcp.ts")
    },
    testDir: path.join(projectRoot, "packages", "core", "test")
  },
  electron: {
    testDir: path.join(projectRoot, "packages", "electron", "test")
  },
  ui: {
    testDir: path.join(projectRoot, "packages", "ui", "test")
  }
};

const args = process.argv.slice(2);
const scopeIndex = args.indexOf("--scope");
const scope = scopeIndex >= 0 ? args[scopeIndex + 1] : undefined;
if (scopeIndex >= 0 && !scope) {
  throw new Error("--scope requires a test directory name such as unit or integration");
}
const requestedProjects = new Set(args.filter((arg, index) =>
  arg !== "--scope" && (scopeIndex < 0 || index !== scopeIndex + 1)
));
const projectNames = new Set(Object.keys(testProjects));
const unknownProjects = [...requestedProjects].filter((project) => !projectNames.has(project));
const selectedProjects = requestedProjects.size === 0
  ? Object.entries(testProjects)
  : Object.entries(testProjects).filter(([name]) => requestedProjects.has(name));

if (unknownProjects.length > 0) {
  throw new Error(`Unknown test project: ${unknownProjects.join(", ")}`);
}

for (const [name, project] of selectedProjects) {
  const projectOutDir = path.join(testsOutDir, name);
  const scopedTestDir = scope ? path.join(project.testDir, scope) : project.testDir;
  const entryPoints = testEntryPoints(scopedTestDir);
  if (!scope || scope === "integration") {
    Object.assign(entryPoints, project.runtimeEntryPoints ?? {});
  }

  rmSync(projectOutDir, { force: true, recursive: true });
  if (Object.keys(entryPoints).length === 0) {
    continue;
  }

  await esbuild.build({
    absWorkingDir: projectRoot,
    bundle: true,
    entryPoints,
    external: [
      "better-sqlite3",
      "electron"
    ],
    format: "cjs",
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
    outdir: projectOutDir,
    platform: "node",
    plugins: [rendererAliasPlugin(), packageAliasPlugin()],
    target: "node22"
  });
}

function testEntryPoints(testDir) {
  return Object.fromEntries(findTestFiles(testDir).map((file) => {
    const relative = path.relative(testDir, file).replace(/\\/g, "/");
    const outputName = `test/${relative.replace(/\.(mjs|ts|tsx)$/, "")}`;
    return [outputName, file];
  }));
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
        return { path: resolvePackageImport(packageRoots.ui, args.path.slice(2)) };
      });
    }
  };
}

function packageAliasPlugin() {
  return {
    name: "test-package-alias",
    setup(build) {
      build.onResolve({ filter: /^@ccr\/(cli|core|electron|ui)\// }, (args) => {
        const match = args.path.match(/^@ccr\/(cli|core|electron|ui)\/(.+)$/);
        if (!match) {
          return undefined;
        }
        return { path: resolvePackageImport(packageRoots[match[1]], match[2]) };
      });
    }
  };
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
