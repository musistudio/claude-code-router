import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeWindowsDesktopAppCandidate, windowsDesktopAppCandidates } from "@ccr/core/platform/windows-app-discovery";
import { windowsSystemCommand } from "@ccr/core/platform/windows-system";
import type { ProfileConfig } from "@ccr/core/contracts/app";

export type OpenCodeAppLookupResult = {
  checked: string[];
  executable?: string;
};

export type OpenCodeAppLaunchResult = {
  child: ChildProcess;
  command: string;
  pid?: number;
  userDataDir: string;
};

const windowsExeNames = ["OpenCode.exe", "opencode-desktop.exe"];
const windowsPackageKeywords = ["opencode", "opencode-desktop"];

export function findInstalledOpenCodeAppExecutable(profileAppPath?: string): OpenCodeAppLookupResult {
  const checked: string[] = [];
  const candidates = [
    ...(profileAppPath?.trim() ? [resolveUserPath(profileAppPath)] : []),
    ...["CCR_OPENCODE_APP_PATH", "OPENCODE_APP_PATH"].map((key) => process.env[key]?.trim() || "").filter(Boolean).map(resolveUserPath),
    ...platformCandidates()
  ];
  for (const candidate of candidates) {
    if (!candidate || checked.includes(candidate)) {
      continue;
    }
    checked.push(candidate);
    const executable = normalizeCandidate(candidate);
    if (executable) {
      return { checked, executable };
    }
  }
  return { checked };
}

export function findRunningOpenCodeAppPid(profileAppPath?: string): number | undefined {
  const executable = findInstalledOpenCodeAppExecutable(profileAppPath).executable;
  if (!executable) {
    return undefined;
  }
  return process.platform === "win32"
    ? findWindowsExecutablePid(executable)
    : findPosixExecutablePid(executable);
}

export function launchOpenCodeAppProfile(
  _configDir: string,
  profile: ProfileConfig,
  configFile: string,
  inlineConfig: string,
  extraEnv: Record<string, string> = {}
): OpenCodeAppLaunchResult {
  const lookup = findInstalledOpenCodeAppExecutable(profile.appPath);
  if (!lookup.executable) {
    throw new Error([
      "OpenCode App was not found. Install OpenCode App or set OPENCODE_APP_PATH to its executable, then try again.",
      lookup.checked.length ? `Checked: ${lookup.checked.join(", ")}` : ""
    ].filter(Boolean).join(" "));
  }
  const userDataDir = resolveOpenCodeDesktopUserDataDir();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...profile.env,
    ...extraEnv,
    CCR_PROFILE_SURFACE: "app",
    OPENCODE_CLIENT: "desktop",
    OPENCODE_CONFIG: configFile,
    OPENCODE_CONFIG_CONTENT: inlineConfig
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(lookup.executable, openCodeAppLaunchArgs(), {
    detached: true,
    env,
    stdio: "ignore"
  });
  child.unref();
  return {
    child,
    command: lookup.executable,
    pid: child.pid,
    userDataDir
  };
}

export function openCodeAppLaunchSignature(
  profile: ProfileConfig,
  configFile: string,
  inlineConfig: string,
  extraEnv: Record<string, string> = {}
): string {
  const env = Object.fromEntries(Object.entries({
    ...profile.env,
    ...extraEnv,
    CCR_PROFILE_SURFACE: "app",
    OPENCODE_CLIENT: "desktop",
    OPENCODE_CONFIG: configFile,
    OPENCODE_CONFIG_CONTENT: inlineConfig
  }).sort(([left], [right]) => left.localeCompare(right)));
  return createHash("sha256")
    .update(JSON.stringify({
      appPath: profile.appPath?.trim() || "",
      env
    }))
    .digest("hex");
}

export function openCodeAppLaunchArgs(): string[] {
  // OpenCode Desktop resets Electron's userData path before acquiring its
  // single-instance lock, so --user-data-dir is ignored. CCR treats the app as
  // single-instance and switches managed profiles in launch-service instead.
  return [
    "--remote-debugging-port=0",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling"
  ];
}

export function resolveOpenCodeDesktopUserDataDir(): string {
  const appDataDir = process.platform === "win32"
    ? process.env.APPDATA?.trim() || path.join(os.homedir(), "AppData", "Roaming")
    : process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support")
      : process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), ".config");
  return path.join(resolveUserPath(appDataDir), "ai.opencode.desktop");
}

export function openCodeDesktopCommandNames(platform: NodeJS.Platform = process.platform): string[] {
  return platform === "linux"
    ? ["ai.opencode.desktop", "opencode-desktop", "OpenCode"]
    : ["opencode-desktop", "OpenCode"];
}

function platformCandidates(): string[] {
  if (process.platform === "darwin") {
    return [
      "/Applications/OpenCode.app",
      path.join(os.homedir(), "Applications", "OpenCode.app")
    ];
  }
  if (process.platform === "win32") {
    return windowsDesktopAppCandidates({
      appDirs: ["OpenCode", "opencode", "OpenCode Desktop"],
      exeNames: windowsExeNames,
      packageKeywords: windowsPackageKeywords,
      vendorDirs: ["OpenCode", "Anomaly"],
      whereNames: ["OpenCode", "opencode-desktop"]
    });
  }
  const commandNames = openCodeDesktopCommandNames("linux");
  return [
    ...pathCommandCandidates(commandNames),
    ...["/opt/OpenCode", "/usr/local/bin", "/usr/bin"]
      .flatMap((directory) => commandNames.map((name) => path.join(directory, name)))
  ];
}

function normalizeCandidate(candidate: string): string | undefined {
  if (process.platform === "darwin") {
    if (candidate.endsWith(".app")) {
      return executableFromMacAppBundle(candidate);
    }
    return isFile(candidate) ? candidate : undefined;
  }
  if (process.platform === "win32") {
    return normalizeWindowsDesktopAppCandidate(candidate, { exeNames: windowsExeNames, packageKeywords: windowsPackageKeywords });
  }
  return isFile(candidate) ? candidate : undefined;
}

function executableFromMacAppBundle(appPath: string): string | undefined {
  if (!isDirectory(appPath)) {
    return undefined;
  }
  const macosDir = path.join(appPath, "Contents", "MacOS");
  const bundleExecutable = readBundleExecutable(path.join(appPath, "Contents", "Info.plist"));
  for (const name of [bundleExecutable, "OpenCode", "opencode"].filter((value): value is string => Boolean(value))) {
    const candidate = path.join(macosDir, name);
    if (isFile(candidate)) {
      return candidate;
    }
  }
  try {
    return readdirSync(macosDir).map((entry) => path.join(macosDir, entry)).find(isFile);
  } catch {
    return undefined;
  }
}

function readBundleExecutable(infoPath: string): string | undefined {
  if (!isFile(infoPath)) {
    return undefined;
  }
  try {
    return readFileSync(infoPath, "utf8").match(/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

function pathCommandCandidates(names: string[]): string[] {
  const directories = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  return directories.flatMap((directory) => names.map((name) => path.join(directory, name)));
}

function findPosixExecutablePid(executable: string): number | undefined {
  try {
    const result = spawnSync("ps", ["-Ao", "pid=,command="], { encoding: "utf8" });
    if (result.error || result.status !== 0) {
      return undefined;
    }
    const normalizedExecutable = path.resolve(executable);
    for (const line of result.stdout.split(/\r?\n/g)) {
      const match = line.match(/^\s*(\d+)\s+(.+)$/);
      if (!match) {
        continue;
      }
      const pid = Number(match[1]);
      const command = match[2].trim();
      if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid || command.includes(" --type=")) {
        continue;
      }
      if (command === normalizedExecutable || command.startsWith(`${normalizedExecutable} `)) {
        return pid;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function findWindowsExecutablePid(executable: string): number | undefined {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$executable = ${powershellString(path.resolve(executable))}`,
    `$hostPid = ${process.pid}`,
    "$selfPid = $PID",
    "Get-CimInstance Win32_Process | Where-Object {",
    "  $_.ProcessId -ne $selfPid -and",
    "  $_.ProcessId -ne $hostPid -and",
    "  $_.ExecutablePath -and",
    "  $_.ExecutablePath.Equals($executable, [System.StringComparison]::OrdinalIgnoreCase) -and",
    "  ($_.CommandLine -notmatch '\\s--type=')",
    "} | Sort-Object ProcessId | Select-Object -First 1 -ExpandProperty ProcessId"
  ].join("\n");
  try {
    const result = spawnSync(windowsSystemCommand("powershell.exe"), [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script
    ], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      windowsHide: true
    });
    if (result.error || result.status !== 0) {
      return undefined;
    }
    return result.stdout
      .split(/\r?\n/g)
      .map((line) => Number(line.trim()))
      .find((pid) => Number.isFinite(pid) && pid > 0 && pid !== process.pid);
  } catch {
    return undefined;
  }
}

function powershellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
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
    return existsSync(file) && statSync(file).isFile();
  } catch {
    return false;
  }
}

function isDirectory(file: string): boolean {
  try {
    return existsSync(file) && statSync(file).isDirectory();
  } catch {
    return false;
  }
}
