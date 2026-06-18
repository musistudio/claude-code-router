import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProfileConfig } from "../shared/app";
import { resolveClaudeCodeSettingsFile } from "./profile-launch-core";

type ClaudeAppLookupResult = {
  checked: string[];
  executable?: string;
};

export type ClaudeAppLaunchResult = {
  command: string;
  pid?: number;
  userDataDir: string;
};

const macClaudeAppNames = ["Claude.app", "Claude Desktop.app"];
const windowsClaudeAppDirs = ["Claude", "Claude Desktop", "ClaudeDesktop", "AnthropicClaude"];
const windowsClaudeExeNames = ["Claude.exe", "claude.exe", "Claude Desktop.exe"];

export function launchClaudeAppProfile(configDir: string, profile: ProfileConfig): ClaudeAppLaunchResult {
  const lookup = findInstalledClaudeAppExecutable();
  if (!lookup.executable) {
    throw new Error([
      "Claude App was not found. Install Claude App or set CLAUDE_APP_PATH to its executable, then try again.",
      lookup.checked.length ? `Checked: ${lookup.checked.join(", ")}` : ""
    ].filter(Boolean).join(" "));
  }

  const settingsFile = resolveClaudeCodeSettingsFile(configDir, profile);
  const settingsDir = path.dirname(settingsFile);
  const userDataDir = resolveClaudeAppProfileUserDataDir(configDir, profile);
  mkdirSync(userDataDir, { recursive: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...profileEnv(profile),
    CLAUDE_CONFIG_DIR: settingsDir,
    CLAUDE_USER_DATA_DIR: userDataDir,
    CCR_CLAUDE_APP_USER_DATA_PATH: userDataDir,
    CCR_PROFILE_SURFACE: "app",
    ELECTRON_ENABLE_LOGGING: "1"
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(lookup.executable, claudeElectronArgs(userDataDir), {
    detached: true,
    env,
    stdio: "ignore"
  });
  child.unref();

  return {
    command: lookup.executable,
    pid: child.pid,
    userDataDir
  };
}

export function resolveClaudeAppProfileUserDataDir(configDir: string, profile: ProfileConfig): string {
  const settingsFile = resolveClaudeCodeSettingsFile(configDir, profile);
  return claudeElectronUserDataDir(path.dirname(settingsFile), profile);
}

function claudeElectronArgs(userDataDir: string): string[] {
  return [
    `--user-data-dir=${userDataDir}`,
    "--remote-allow-origins=*",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows"
  ];
}

function claudeElectronUserDataDir(settingsDir: string, profile: ProfileConfig): string {
  return path.join(
    settingsDir,
    ".claude-code-router",
    "claude-app-user-data",
    sanitizeProfilePathSegment(profile.id || profile.name || "default") || "default"
  );
}

function findInstalledClaudeAppExecutable(): ClaudeAppLookupResult {
  const checked: string[] = [];
  const envCandidate = findFirstExecutable(envClaudeAppPathCandidates(), checked);
  if (envCandidate) {
    return { checked, executable: envCandidate };
  }

  if (process.platform === "darwin") {
    return { checked, executable: findFirstExecutable(macClaudeAppCandidates(), checked) };
  }
  if (process.platform === "win32") {
    return { checked, executable: findFirstExecutable(windowsClaudeAppCandidates(), checked) };
  }
  return { checked, executable: findFirstExecutable(linuxClaudeAppCandidates(), checked) };
}

function findFirstExecutable(candidates: string[], checked: string[]): string | undefined {
  for (const candidate of candidates) {
    if (!candidate || checked.includes(candidate)) {
      continue;
    }
    checked.push(candidate);
    const executable = normalizeClaudeAppCandidate(candidate);
    if (executable) {
      return executable;
    }
  }
  return undefined;
}

function envClaudeAppPathCandidates(): string[] {
  return ["CCR_CLAUDE_APP_PATH", "CLAUDE_APP_PATH"]
    .map((key) => process.env[key]?.trim() || "")
    .filter(Boolean)
    .map(resolveUserPath);
}

function macClaudeAppCandidates(): string[] {
  const roots = [
    "/Applications",
    path.join(os.homedir(), "Applications")
  ];
  return roots.flatMap((root) => macClaudeAppNames.map((name) => path.join(root, name)));
}

function windowsClaudeAppCandidates(): string[] {
  const roots = [
    process.env.LOCALAPPDATA,
    process.env.APPDATA,
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.ProgramW6432,
    path.join(os.homedir(), "AppData", "Local"),
    path.join(os.homedir(), "AppData", "Roaming")
  ].filter((value): value is string => Boolean(value?.trim()));

  const candidates: string[] = [];
  for (const root of roots) {
    const installRoots = [
      root,
      path.join(root, "Programs"),
      path.join(root, "Programs", "Anthropic"),
      path.join(root, "Anthropic"),
      path.join(root, "Microsoft", "WindowsApps")
    ];
    for (const installRoot of installRoots) {
      for (const exeName of windowsClaudeExeNames) {
        pushUnique(candidates, path.join(installRoot, exeName));
      }
      for (const dirName of windowsClaudeAppDirs) {
        const appDir = path.join(installRoot, dirName);
        pushUnique(candidates, appDir);
        for (const exeName of windowsClaudeExeNames) {
          pushUnique(candidates, path.join(appDir, exeName));
        }
      }
    }
  }

  for (const whereCandidate of windowsWhereClaudeCandidates()) {
    pushUnique(candidates, whereCandidate);
  }
  return candidates;
}

function linuxClaudeAppCandidates(): string[] {
  return [
    "/usr/bin/claude",
    "/usr/local/bin/claude",
    "/opt/Claude/claude",
    "/opt/Claude/Claude"
  ];
}

function normalizeClaudeAppCandidate(candidate: string): string | undefined {
  if (process.platform === "darwin") {
    if (candidate.endsWith(".app")) {
      return executableFromMacAppBundle(candidate);
    }
    return isFile(candidate) ? candidate : undefined;
  }
  if (process.platform === "win32") {
    return normalizeWindowsClaudeAppCandidate(candidate);
  }
  return isFile(candidate) ? candidate : undefined;
}

function executableFromMacAppBundle(appPath: string): string | undefined {
  if (!isDirectory(appPath)) {
    return undefined;
  }
  const infoPath = path.join(appPath, "Contents", "Info.plist");
  const macosDir = path.join(appPath, "Contents", "MacOS");
  const bundleExecutable = readBundleExecutable(infoPath);
  if (bundleExecutable) {
    const executable = path.join(macosDir, bundleExecutable);
    if (isFile(executable)) {
      return executable;
    }
  }

  const appName = path.basename(appPath, ".app");
  for (const name of [appName, "Claude", "claude"]) {
    const executable = path.join(macosDir, name);
    if (isFile(executable)) {
      return executable;
    }
  }

  try {
    return readdirSync(macosDir)
      .map((entry) => path.join(macosDir, entry))
      .find((entry) => isFile(entry));
  } catch {
    return undefined;
  }
}

function readBundleExecutable(infoPath: string): string | undefined {
  if (!isFile(infoPath)) {
    return undefined;
  }
  try {
    const content = readFileSync(infoPath, "utf8");
    return content.match(/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

function normalizeWindowsClaudeAppCandidate(candidate: string): string | undefined {
  if (isDirectory(candidate)) {
    return windowsClaudeExecutableInDir(candidate);
  }
  if (!isFile(candidate)) {
    return undefined;
  }
  const fileName = path.basename(candidate).toLowerCase();
  if (windowsClaudeExeNames.some((name) => name.toLowerCase() === fileName)) {
    return candidate;
  }

  const parent = path.basename(path.dirname(candidate)).toLowerCase();
  if (parent === "resources") {
    const appDir = path.dirname(path.dirname(candidate));
    return windowsClaudeExecutableInDir(appDir);
  }
  return undefined;
}

function windowsClaudeExecutableInDir(dir: string): string | undefined {
  if (!isDirectory(dir)) {
    return undefined;
  }

  for (const exeName of windowsClaudeExeNames) {
    const candidate = path.join(dir, exeName);
    if (isFile(candidate)) {
      return candidate;
    }
  }

  for (const nested of ["app", "current", "Current"]) {
    const candidate = windowsClaudeExecutableInDir(path.join(dir, nested));
    if (candidate) {
      return candidate;
    }
  }

  try {
    const versionedDirs = readdirSync(dir)
      .filter((entry) => entry.toLowerCase().startsWith("app-"))
      .map((entry) => path.join(dir, entry))
      .filter(isDirectory)
      .sort()
      .reverse();
    for (const versionedDir of versionedDirs) {
      const candidate = windowsClaudeExecutableInDir(versionedDir);
      if (candidate) {
        return candidate;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function windowsWhereClaudeCandidates(): string[] {
  if (process.platform !== "win32") {
    return [];
  }
  const candidates: string[] = [];
  for (const name of ["Claude", "claude", "Claude Desktop"]) {
    const result = spawnSync("where.exe", [name], {
      encoding: "utf8",
      windowsHide: true
    });
    if (result.status !== 0) {
      continue;
    }
    for (const line of result.stdout.split(/\r?\n/)) {
      if (line.trim()) {
        pushUnique(candidates, line.trim());
      }
    }
  }
  return candidates;
}

function profileEnv(profile: ProfileConfig): Record<string, string> {
  return Object.entries(profile.env ?? {}).reduce<Record<string, string>>((result, [key, value]) => {
    if (isEnvName(key) && typeof value === "string") {
      result[key] = value;
    }
    return result;
  }, {});
}

function isEnvName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function sanitizeProfilePathSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function resolveUserPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "~") {
    return os.homedir();
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return path.resolve(trimmed);
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

function isDirectory(file: string): boolean {
  try {
    return statSync(file).isDirectory();
  } catch {
    return false;
  }
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}
