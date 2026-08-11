import { spawn, type ChildProcess } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppConfig, ProfileConfig } from "@ccr/core/contracts/app";
import { botGatewayProfileEnv } from "@ccr/core/agents/bot-gateway/env";
import { normalizeWindowsDesktopAppCandidate, windowsDesktopAppCandidates } from "@ccr/core/platform/windows-app-discovery";
import { codeBuddyHomeFromModelsConfigFile, resolveCodeBuddyModelsConfigFile, writeCodeBuddyModelsConfig } from "@ccr/core/agents/codebuddy/models-config";

export type CodeBuddyAppLookupResult = {
  checked: string[];
  executable?: string;
};

type CodeBuddyAppSpec = {
  displayName: string;
  envPathKeys: string[];
  linuxCandidates: string[];
  macAppNames: string[];
  userDataDirName: string;
  windowsAppDirs: string[];
  windowsExeNames: string[];
  windowsPackageKeywords: string[];
  windowsVendorDirs: string[];
  windowsWhereNames: string[];
};

export type CodeBuddyAppLaunchResult = {
  child: ChildProcess;
  command: string;
  pid?: number;
  userDataDir: string;
};

const codeBuddyAppSpec: CodeBuddyAppSpec = {
  displayName: "CodeBuddy",
  envPathKeys: ["CCR_CODEBUDDY_APP_PATH", "CODEBUDDY_APP_PATH", "CODEBUDDY_IDE_PATH"],
  linuxCandidates: [
    "/opt/CodeBuddy/codebuddy",
    "/opt/CodeBuddy/CodeBuddy",
    "/opt/CodeBuddy CN/codebuddy",
    "/opt/CodeBuddy CN/CodeBuddy CN",
    "/usr/local/bin/codebuddy-ide",
    "/usr/bin/codebuddy-ide"
  ],
  macAppNames: ["CodeBuddy.app", "CodeBuddy CN.app", "CodeBuddy Code.app", "CodeBuddy IDE.app"],
  userDataDirName: "codebuddy-ide-user-data",
  windowsAppDirs: ["CodeBuddy", "CodeBuddy CN", "CodeBuddy IDE", "腾讯云代码助手"],
  windowsExeNames: ["CodeBuddy.exe", "codebuddy.exe", "CodeBuddy CN.exe", "CodeBuddyCN.exe", "CodeBuddyIDE.exe"],
  windowsPackageKeywords: ["codebuddy", "codebuddycn"],
  windowsVendorDirs: ["Tencent", "腾讯"],
  windowsWhereNames: ["CodeBuddy", "codebuddy", "CodeBuddy CN", "CodeBuddyCN", "CodeBuddyIDE"]
};

export function launchCodeBuddyAppProfile(profile: ProfileConfig, config?: AppConfig): CodeBuddyAppLaunchResult {
  const lookup = findInstalledCodeBuddyAppExecutable(profile.appPath);
  if (!lookup.executable) {
    throw new Error([
      `${codeBuddyAppSpec.displayName} was not found. Install ${codeBuddyAppSpec.displayName} or set ${codeBuddyAppSpec.envPathKeys[0]} to its executable, then try again.`,
      lookup.checked.length ? `Checked: ${lookup.checked.join(", ")}` : ""
    ].filter(Boolean).join(" "));
  }

  const configFile = resolveCodeBuddyModelsConfigFile(profile);
  const home = codeBuddyHomeFromModelsConfigFile(configFile);
  const userDataDir = codeBuddyElectronUserDataDir(home, profile);
  if (config?.APIKEY) {
    writeCodeBuddyModelsConfig(config, profile, config.APIKEY, { backup: false });
  }

  const appEnv: Record<string, string> = {
    ...(config ? botGatewayProfileEnv(config, profile, "app") : {}),
    ...(profile.model.trim() ? { CODEBUDDY_MODEL: profile.model.trim() } : {}),
    CCR_PROFILE_SURFACE: "app",
    ELECTRON_ENABLE_LOGGING: "1"
  };
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...appEnv
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const launch = codeBuddyAppLaunchCommand(lookup.executable, userDataDir);
  const child = spawn(launch.command, launch.args, {
    detached: true,
    env,
    stdio: "ignore"
  });
  child.unref();

  return {
    child,
    command: launch.command,
    pid: child.pid,
    userDataDir
  };
}

export function findInstalledCodeBuddyAppExecutable(profileAppPath?: string): CodeBuddyAppLookupResult {
  return findInstalledCodeBuddyCompatibleAppExecutable(codeBuddyAppSpec, profileAppPath);
}

export function refreshCodeBuddyAppProfileFiles(profile: ProfileConfig, config?: AppConfig): { configFile: string; userDataDir: string } {
  const configFile = resolveCodeBuddyModelsConfigFile(profile);
  const home = codeBuddyHomeFromModelsConfigFile(configFile);
  const userDataDir = codeBuddyElectronUserDataDir(home, profile);
  if (config?.APIKEY) {
    writeCodeBuddyModelsConfig(config, profile, config.APIKEY, { backup: false });
  }
  return { configFile, userDataDir };
}

export function codeBuddyAppLaunchCommand(executable: string, userDataDir: string): { args: string[]; command: string } {
  return {
    command: executable,
    args: codeBuddyElectronArgs(userDataDir)
  };
}

function codeBuddyElectronArgs(userDataDir: string): string[] {
  return [
    "--remote-debugging-port=0",
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${userDataDir}`,
    "--remote-allow-origins=*",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows"
  ];
}

function codeBuddyElectronUserDataDir(home: string, profile: ProfileConfig): string {
  return path.join(
    home,
    ".claude-code-router",
    codeBuddyAppSpec.userDataDirName,
    sanitizeProfilePathSegment(profile.id || profile.name || "default") || "default"
  );
}

function findInstalledCodeBuddyCompatibleAppExecutable(spec: CodeBuddyAppSpec, profileAppPath?: string): CodeBuddyAppLookupResult {
  const checked: string[] = [];
  const profileCandidate = findFirstExecutable(profileCodeBuddyAppPathCandidates(profileAppPath), checked, spec);
  if (profileCandidate) {
    return { checked, executable: profileCandidate };
  }

  const envCandidate = findFirstExecutable(envCodeBuddyAppPathCandidates(spec), checked, spec);
  if (envCandidate) {
    return { checked, executable: envCandidate };
  }

  if (process.platform === "darwin") {
    return { checked, executable: findFirstExecutable(macCodeBuddyAppCandidates(spec), checked, spec) };
  }
  if (process.platform === "win32") {
    return { checked, executable: findFirstExecutable(windowsCodeBuddyAppCandidates(spec), checked, spec) };
  }
  return { checked, executable: findFirstExecutable(linuxCodeBuddyAppCandidates(spec), checked, spec) };
}

function findFirstExecutable(candidates: string[], checked: string[], spec: CodeBuddyAppSpec): string | undefined {
  for (const candidate of candidates) {
    if (!candidate || checked.includes(candidate)) {
      continue;
    }
    checked.push(candidate);
    const executable = normalizeCodeBuddyAppCandidate(candidate, spec);
    if (executable) {
      return executable;
    }
  }
  return undefined;
}

function envCodeBuddyAppPathCandidates(spec: CodeBuddyAppSpec): string[] {
  return spec.envPathKeys
    .map((key) => process.env[key]?.trim() || "")
    .filter(Boolean)
    .map(resolveUserPath);
}

function profileCodeBuddyAppPathCandidates(value: string | undefined): string[] {
  const trimmed = value?.trim() || "";
  return trimmed ? [resolveUserPath(trimmed)] : [];
}

function macCodeBuddyAppCandidates(spec: CodeBuddyAppSpec): string[] {
  const roots = [
    "/Applications",
    path.join(os.homedir(), "Applications")
  ];
  return roots.flatMap((root) => spec.macAppNames.map((name) => path.join(root, name)));
}

function windowsCodeBuddyAppCandidates(spec: CodeBuddyAppSpec): string[] {
  return windowsDesktopAppCandidates({
    appDirs: spec.windowsAppDirs,
    exeNames: spec.windowsExeNames,
    packageKeywords: spec.windowsPackageKeywords,
    vendorDirs: spec.windowsVendorDirs,
    whereNames: spec.windowsWhereNames
  });
}

function linuxCodeBuddyAppCandidates(spec: CodeBuddyAppSpec): string[] {
  return spec.linuxCandidates;
}

function normalizeCodeBuddyAppCandidate(candidate: string, spec: CodeBuddyAppSpec): string | undefined {
  if (process.platform === "darwin") {
    if (candidate.endsWith(".app")) {
      return executableFromMacAppBundle(candidate);
    }
    return isFile(candidate) ? candidate : undefined;
  }
  if (process.platform === "win32") {
    return normalizeWindowsDesktopAppCandidate(candidate, {
      exeNames: spec.windowsExeNames,
      packageKeywords: spec.windowsPackageKeywords
    });
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
  const executable = path.join(macosDir, appName);
  if (isFile(executable)) {
    return executable;
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
