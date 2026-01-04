import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { pathAliasPlugin } from "./esbuild-plugin-path-alias";

const watch = process.argv.includes("--watch");

// Get the absolute path to the src directory (ES module compatible)
// @ts-ignore
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseUrl = path.resolve(__dirname, "..");

const baseConfig: esbuild.BuildOptions = {
  entryPoints: ["src/server.ts"],
  bundle: true,
  minify: true,
  sourcemap: true,
  platform: "node",
  target: "node18",
  plugins: [
    // Add path alias plugin to resolve @/ imports
    pathAliasPlugin({
      alias: {
        "@/*": "src/*",
      },
      baseUrl,
    }),
  ],
  external: ["fastify", "dotenv", "@fastify/cors", "undici", "tiktoken", "@CCR/shared", "lru-cache"],
};

// Generate type declarations with resolved path aliases
function generateTypeDeclarations() {
  console.log("Skipping type declaration generation (using manual plugins.d.ts)...");
  // Type declarations are manually maintained in dist/plugins.d.ts
  // This avoids issues with @/ path aliases in auto-generated declarations
}

// Replace @/ paths with relative paths in .d.ts files
function replacePathAliases(dir: string, baseDir = dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      replacePathAliases(fullPath, baseDir);
    } else if (file.endsWith(".d.ts")) {
      let content = fs.readFileSync(fullPath, "utf-8");

      // Replace @/ imports with relative paths
      content = content.replace(/from\s+["']@(\/[^"']+)["']/g, (_, importPath) => {
        const absolutePath = path.resolve(baseUrl, "src", importPath.slice(2));
        const currentDir = path.dirname(fullPath);
        const relativePath = path.relative(currentDir, absolutePath);
        const normalizedPath = relativePath.split(path.sep).join("/");
        return `from "${normalizedPath}"`;
      });

      fs.writeFileSync(fullPath, content);
    }
  }
}

// Copy .d.ts files maintaining directory structure
function copyDtsFiles(sourceDir: string, targetDir: string) {
  const files = fs.readdirSync(sourceDir);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  for (const file of files) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    const stat = fs.statSync(sourcePath);

    if (stat.isDirectory()) {
      copyDtsFiles(sourcePath, targetPath);
    } else if (file.endsWith(".d.ts")) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

const cjsConfig: esbuild.BuildOptions = {
  ...baseConfig,
  outdir: "dist/cjs",
  format: "cjs",
  outExtension: { ".js": ".cjs" },
};

const esmConfig: esbuild.BuildOptions = {
  ...baseConfig,
  outdir: "dist/esm",
  format: "esm",
  outExtension: { ".js": ".mjs" },
};

async function build() {
  console.log("Building CJS and ESM versions...");

  // First, generate type declarations
  generateTypeDeclarations();

  const cjsCtx = await esbuild.context(cjsConfig);
  const esmCtx = await esbuild.context(esmConfig);

  if (watch) {
    console.log("Watching for changes...");
    await Promise.all([
      cjsCtx.watch(),
      esmCtx.watch(),
    ]);
  } else {
    await Promise.all([
      cjsCtx.rebuild(),
      esmCtx.rebuild(),
    ]);

    await Promise.all([
      cjsCtx.dispose(),
      esmCtx.dispose(),
    ]);

    console.log("✅ Build completed successfully!");
    console.log("  - CJS: dist/cjs/server.cjs");
    console.log("  - ESM: dist/esm/server.mjs");
    console.log("  - Types: dist/*.d.ts");
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
