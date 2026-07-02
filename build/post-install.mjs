import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const require = createRequire(__filename);
const projectRoot = path.resolve(path.dirname(__filename), "..");

function getSqliteBinaryPaths() {
  try {
    const mainPath = require.resolve("better-sqlite3");
    const releaseDir = path.join(path.dirname(mainPath), "..", "build", "Release");
    const sourceFile = path.join(releaseDir, "better_sqlite3.node");
    const nodeDest = path.join(releaseDir, "better_sqlite3_node.node");
    const electronDest = path.join(releaseDir, "better_sqlite3_electron.node");
    return { sourceFile, nodeDest, electronDest };
  } catch {
    return null;
  }
}

function findElectronRebuildCli(dir) {
  const searchDirs = [
    path.join(dir, "node_modules"),
    path.join(dir, "node_modules", ".pnpm")
  ];
  
  for (const searchDir of searchDirs) {
    if (!fs.existsSync(searchDir)) continue;
    
    // Check if directly under node_modules
    const directPath = path.join(searchDir, "@electron", "rebuild", "lib", "cli.js");
    if (fs.existsSync(directPath)) return directPath;
    
    // Look under .pnpm for pnpm virtual store directories
    try {
      const files = fs.readdirSync(searchDir);
      for (const file of files) {
        if (file.startsWith("@electron+rebuild@")) {
          const pnpmPath = path.join(searchDir, file, "node_modules", "@electron", "rebuild", "lib", "cli.js");
          if (fs.existsSync(pnpmPath)) return pnpmPath;
        }
      }
    } catch {
      // Ignored
    }
  }
  return null;
}

function getElectronVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    const rawVersion = pkg.devDependencies?.electron || pkg.dependencies?.electron || "42.3.3";
    return rawVersion.replace(/^[~^]/, "");
  } catch {
    return "42.3.3";
  }
}

function detectRebuildCommand() {
  if (fs.existsSync(path.join(projectRoot, "pnpm-lock.yaml"))) {
    return "pnpm rebuild better-sqlite3";
  }
  if (fs.existsSync(path.join(projectRoot, "yarn.lock"))) {
    return "yarn rebuild better-sqlite3";
  }
  return "npm rebuild better-sqlite3";
}

function main() {
  const paths = getSqliteBinaryPaths();
  if (!paths) {
    console.log("[post-install] better-sqlite3 not found. Skipping caching.");
    return;
  }

  // 1. Cache the initial Node.js binary (built by npm install)
  if (fs.existsSync(paths.sourceFile)) {
    try {
      fs.copyFileSync(paths.sourceFile, paths.nodeDest);
      console.log(`[post-install] Cached host Node.js SQLite binary to: ${path.basename(paths.nodeDest)}`);
    } catch (error) {
      console.error("[post-install] Failed to cache Node.js SQLite binary:", error.message);
    }
  }

  // 2. Build for Electron in-place in workspace
  const rebuildCli = findElectronRebuildCli(projectRoot);
  if (!rebuildCli) {
    console.error("[post-install] Could not find @electron/rebuild CLI. Cannot build Electron SQLite binary.");
    return;
  }

  const electronVersion = getElectronVersion();
  const rebuildCmd = `node "${rebuildCli}" -v ${electronVersion} -f -w better-sqlite3`;
  console.log(`[post-install] Building Electron SQLite binary (version ${electronVersion}) via: ${rebuildCmd}`);
  try {
    execSync(rebuildCmd, { cwd: projectRoot, stdio: "inherit" });
  } catch (error) {
    console.error("[post-install] Failed to compile Electron SQLite binary:", error.message);
  }

  // 3. Cache the newly compiled Electron binary
  if (fs.existsSync(paths.sourceFile)) {
    try {
      fs.copyFileSync(paths.sourceFile, paths.electronDest);
      console.log(`[post-install] Cached Electron SQLite binary to: ${path.basename(paths.electronDest)}`);
    } catch (error) {
      console.error("[post-install] Failed to cache Electron SQLite binary:", error.message);
    }
  }

  // 4. Rebuild back for Node.js
  const restoreCmd = detectRebuildCommand();
  console.log(`[post-install] Restoring host Node.js SQLite binary via: ${restoreCmd}`);
  try {
    execSync(restoreCmd, { cwd: projectRoot, stdio: "inherit" });
  } catch (error) {
    console.error("[post-install] Failed to restore Node.js SQLite binary:", error.message);
  }

  // 5. Ensure the restored active file is cached to Node.js destination
  if (fs.existsSync(paths.sourceFile)) {
    try {
      fs.copyFileSync(paths.sourceFile, paths.nodeDest);
    } catch (error) {
      // Ignored
    }
  }
}

main();
