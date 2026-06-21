import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppConfig, ProfileConfig } from "../shared/app";
import { botGatewayProfileEnv } from "./bot-gateway-env";
import { codexModelCatalogBase64 } from "./codex-model-catalog";
import { buildProfileLaunchPlan, resolveCodexConfigFile } from "./profile-launch-core";

type CodexAppLookupResult = {
  checked: string[];
  executable?: string;
};

export type CodexAppLaunchResult = {
  command: string;
  pid?: number;
  userDataDir: string;
};

const macCodexAppNames = ["Codex.app", "OpenAI Codex.app"];
const windowsCodexAppDirs = ["Codex", "OpenAI Codex", "OpenAICodex"];
const windowsCodexExeNames = ["Codex.exe", "codex.exe", "OpenAI Codex.exe", "OpenAICodex.exe"];

export function launchCodexAppProfile(configDir: string, profile: ProfileConfig, config?: AppConfig): CodexAppLaunchResult {
  const lookup = findInstalledCodexAppExecutable();
  if (!lookup.executable) {
    throw new Error([
      "Codex App was not found. Install Codex App or set CODEX_APP_PATH to its executable, then try again.",
      lookup.checked.length ? `Checked: ${lookup.checked.join(", ")}` : ""
    ].filter(Boolean).join(" "));
  }

  const plan = buildProfileLaunchPlan(configDir, profile, "app");
  if (path.isAbsolute(plan.command) && !existsSync(plan.command)) {
    throw new Error(`Profile launcher was not found: ${plan.command}. Re-save the profile and try again.`);
  }

  const configFile = resolveCodexConfigFile(configDir, profile);
  const codexHome = path.dirname(configFile);
  const userDataDir = codexElectronUserDataDir(codexHome, profile);
  mkdirSync(userDataDir, { recursive: true });
  const modelCatalogBase64 = codexModelCatalogBase64(config, profile.model);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...plan.env,
    ...(config ? botGatewayProfileEnv(config, profile, "app") : {}),
    ...codexProfileEnv(profile),
    CODEX_CLI_PATH: plan.command,
    CODEX_ELECTRON_USER_DATA_PATH: userDataDir,
    CODEX_HOME: codexHome,
    CODEXL_PROFILE_SURFACE: "app",
    CODEXL_CODEX_MODEL_CATALOG_B64: modelCatalogBase64,
    CCR_PROFILE_SURFACE: "app",
    CCR_CODEX_MODEL_CATALOG_B64: modelCatalogBase64,
    ELECTRON_ENABLE_LOGGING: "1"
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(lookup.executable, codexElectronArgs(userDataDir), {
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

function codexProfileEnv(profile: ProfileConfig): Record<string, string> {
  const providerId = sanitizeCodexProviderId(profile.providerId || "") || "claude-code-router";
  const realCliPath = profile.codexCliPath?.trim() || "codex";
  const remoteFrontendMode = normalizeCodexRemoteFrontendMode(profile.remoteFrontendMode);
  return {
    ...(profile.model.trim() ? { CCR_CODEX_MODEL: profile.model.trim() } : {}),
    CCR_CODEX_MODEL_PROVIDER: providerId,
    CCR_CODEX_PROFILE: providerId,
    CCR_CODEX_REMOTE_FRONTEND_MODE: remoteFrontendMode,
    CCR_REAL_CODEX_CLI_PATH: realCliPath,
    CODEXL_CODEX_CORE_MODE: remoteFrontendMode,
    CODEXL_CODEX_MODEL_PROVIDER: providerId,
    CODEXL_CODEX_PROFILE: providerId,
    CODEXL_CODEX_WORKSPACE_NAME: profile.name || providerId,
    CODEXL_REAL_CODEX_CLI_PATH: realCliPath
  };
}

function codexElectronArgs(userDataDir: string): string[] {
  return [
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--remote-allow-origins=*",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows"
  ];
}

function codexElectronUserDataDir(codexHome: string, profile: ProfileConfig): string {
  return path.join(
    codexHome,
    ".claude-code-router",
    "codex-app-user-data",
    sanitizeProfilePathSegment(profile.id || profile.name || "default") || "default"
  );
}

function findInstalledCodexAppExecutable(): CodexAppLookupResult {
  const checked: string[] = [];
  const envCandidate = findFirstExecutable(envCodexAppPathCandidates(), checked);
  if (envCandidate) {
    return { checked, executable: envCandidate };
  }

  if (process.platform === "darwin") {
    return { checked, executable: findFirstExecutable(macCodexAppCandidates(), checked) };
  }
  if (process.platform === "win32") {
    return { checked, executable: findFirstExecutable(windowsCodexAppCandidates(), checked) };
  }
  return { checked, executable: findFirstExecutable(linuxCodexAppCandidates(), checked) };
}

function findFirstExecutable(candidates: string[], checked: string[]): string | undefined {
  for (const candidate of candidates) {
    if (!candidate || checked.includes(candidate)) {
      continue;
    }
    checked.push(candidate);
    const executable = normalizeCodexAppCandidate(candidate);
    if (executable) {
      return executable;
    }
  }
  return undefined;
}

function envCodexAppPathCandidates(): string[] {
  return ["CCR_CODEX_APP_PATH", "CODEX_APP_PATH", "CODEXL_CODEX_PATH"]
    .map((key) => process.env[key]?.trim() || "")
    .filter(Boolean)
    .map(resolveUserPath);
}

function macCodexAppCandidates(): string[] {
  const roots = [
    "/Applications",
    path.join(os.homedir(), "Applications")
  ];
  return roots.flatMap((root) => macCodexAppNames.map((name) => path.join(root, name)));
}

function windowsCodexAppCandidates(): string[] {
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
      path.join(root, "Programs", "OpenAI"),
      path.join(root, "OpenAI"),
      path.join(root, "Microsoft", "WindowsApps")
    ];
    for (const installRoot of installRoots) {
      for (const exeName of windowsCodexExeNames) {
        pushUnique(candidates, path.join(installRoot, exeName));
      }
      for (const dirName of windowsCodexAppDirs) {
        const appDir = path.join(installRoot, dirName);
        pushUnique(candidates, appDir);
        for (const exeName of windowsCodexExeNames) {
          pushUnique(candidates, path.join(appDir, exeName));
        }
      }
    }
  }

  for (const whereCandidate of windowsWhereCodexCandidates()) {
    pushUnique(candidates, whereCandidate);
  }
  return candidates;
}

function linuxCodexAppCandidates(): string[] {
  return [
    "/opt/Codex/codex",
    "/opt/Codex/Codex",
    "/opt/OpenAI Codex/codex",
    "/opt/OpenAI Codex/Codex",
    "/usr/local/bin/codex-app",
    "/usr/bin/codex-app"
  ];
}

function normalizeCodexAppCandidate(candidate: string): string | undefined {
  if (process.platform === "darwin") {
    if (candidate.endsWith(".app")) {
      return executableFromMacAppBundle(candidate);
    }
    return isFile(candidate) ? candidate : undefined;
  }
  if (process.platform === "win32") {
    return normalizeWindowsCodexAppCandidate(candidate);
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
  for (const name of [appName, "Codex", "OpenAI Codex", "codex"]) {
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

function normalizeWindowsCodexAppCandidate(candidate: string): string | undefined {
  if (isDirectory(candidate)) {
    return windowsCodexExecutableInDir(candidate);
  }
  if (!isFile(candidate)) {
    return undefined;
  }
  const fileName = path.basename(candidate).toLowerCase();
  if (windowsCodexExeNames.some((name) => name.toLowerCase() === fileName)) {
    return candidate;
  }

  const parent = path.basename(path.dirname(candidate)).toLowerCase();
  if (parent === "resources") {
    const appDir = path.dirname(path.dirname(candidate));
    return windowsCodexExecutableInDir(appDir);
  }
  return undefined;
}

function windowsCodexExecutableInDir(dir: string): string | undefined {
  if (!isDirectory(dir)) {
    return undefined;
  }

  for (const exeName of windowsCodexExeNames) {
    const candidate = path.join(dir, exeName);
    if (isFile(candidate)) {
      return candidate;
    }
  }

  for (const nested of ["app", "current", "Current"]) {
    const candidate = windowsCodexExecutableInDir(path.join(dir, nested));
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
      const candidate = windowsCodexExecutableInDir(versionedDir);
      if (candidate) {
        return candidate;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function windowsWhereCodexCandidates(): string[] {
  if (process.platform !== "win32") {
    return [];
  }
  const candidates: string[] = [];
  for (const name of ["Codex", "codex", "OpenAI Codex"]) {
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

function normalizeCodexRemoteFrontendMode(value: ProfileConfig["remoteFrontendMode"]): "app" | "cli" | "claude-code" {
  return value === "cli" || value === "claude-code" ? value : "app";
}

function sanitizeCodexProviderId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
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
