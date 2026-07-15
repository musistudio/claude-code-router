import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { windowsSystemCommand } from "@ccr/core/platform/windows-system";

export type WindowsDesktopAppDiscoveryOptions = {
  appDirs: string[];
  exeNames: string[];
  packageKeywords: string[];
  vendorDirs: string[];
  whereNames: string[];
};

export type WindowsDesktopAppNormalizeOptions = {
  exeNames: string[];
  packageKeywords: string[];
};

export function windowsDesktopAppCandidates(options: WindowsDesktopAppDiscoveryOptions): string[] {
  if (process.platform !== "win32") {
    return [];
  }

  const candidates: string[] = [];
  for (const root of windowsInstallRoots()) {
    const installRoots = [
      root,
      path.join(root, "Programs"),
      ...options.vendorDirs.flatMap((vendor) => [
        path.join(root, vendor),
        path.join(root, "Programs", vendor)
      ]),
      path.join(root, "Microsoft", "WindowsApps")
    ];

    for (const installRoot of installRoots) {
      for (const exeName of options.exeNames) {
        pushUnique(candidates, path.join(installRoot, exeName));
      }
      for (const dirName of options.appDirs) {
        const appDir = path.join(installRoot, dirName);
        pushUnique(candidates, appDir);
        for (const exeName of options.exeNames) {
          pushUnique(candidates, path.join(appDir, exeName));
        }
      }
    }
  }

  for (const candidate of windowsAppExecutionAliasCandidates(options)) {
    pushUnique(candidates, candidate);
  }
  for (const candidate of windowsShortcutTargetCandidates(options)) {
    pushUnique(candidates, candidate);
  }
  for (const candidate of windowsMsixPackageCandidates(options)) {
    pushUnique(candidates, candidate);
  }
  for (const candidate of windowsWhereCandidates(options.whereNames)) {
    pushUnique(candidates, candidate);
  }
  return candidates;
}

function windowsShortcutTargetCandidates(options: WindowsDesktopAppDiscoveryOptions): string[] {
  const names = unique([
    ...options.packageKeywords,
    ...options.appDirs,
    ...options.exeNames.map((name) => path.basename(name, path.extname(name)))
  ].map((name) => name.trim()).filter(Boolean));
  if (names.length === 0) {
    return [];
  }

  const pattern = names.map(escapeRegExp).join("|");
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue';",
    "$roots = @(",
    "  [Environment]::GetFolderPath('Programs'),",
    "  [Environment]::GetFolderPath('CommonPrograms'),",
    "  [Environment]::GetFolderPath('Desktop'),",
    "  [Environment]::GetFolderPath('CommonDesktopDirectory')",
    ") | Where-Object { $_ } | Select-Object -Unique;",
    `$pattern = '${powerShellSingleQuotedString(pattern)}';`,
    "$shell = New-Object -ComObject WScript.Shell;",
    "Get-ChildItem -LiteralPath $roots -Filter '*.lnk' -File -Recurse |",
    "  Where-Object { $_.BaseName -match $pattern } |",
    "  ForEach-Object {",
    "    try {",
    "      $target = $shell.CreateShortcut($_.FullName).TargetPath;",
    "      if ($target) { $target }",
    "    } catch {}",
    "  }"
  ].join(" ");

  const result = spawnSync(windowsSystemCommand("powershell.exe"), [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script
  ], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function normalizeWindowsDesktopAppCandidate(
  candidate: string,
  options: WindowsDesktopAppNormalizeOptions
): string | undefined {
  if (isDirectory(candidate)) {
    return windowsExecutableInDir(candidate, options);
  }
  if (!isFile(candidate)) {
    return undefined;
  }

  const fileName = path.basename(candidate);
  if (matchesKnownExeName(fileName, options.exeNames)) {
    return candidate;
  }
  if (isLikelyWindowsPackagedAppPath(candidate) && windowsExecutableNameLooksLikeApp(fileName, options.packageKeywords)) {
    return candidate;
  }

  const parent = path.basename(path.dirname(candidate)).toLowerCase();
  if (parent === "resources") {
    const appDir = path.dirname(path.dirname(candidate));
    return windowsExecutableInDir(appDir, options);
  }
  return undefined;
}

function windowsInstallRoots(): string[] {
  return unique([
    process.env.LOCALAPPDATA,
    process.env.APPDATA,
    process.env.ProgramFiles,
    process.env.PROGRAMFILES,
    process.env["ProgramFiles(x86)"],
    process.env["PROGRAMFILES(X86)"],
    process.env.ProgramW6432,
    process.env.PROGRAMW6432,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local") : undefined,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Roaming") : undefined,
    path.join(os.homedir(), "AppData", "Local"),
    path.join(os.homedir(), "AppData", "Roaming")
  ].filter((value): value is string => Boolean(value?.trim())));
}

function windowsAppExecutionAliasCandidates(options: WindowsDesktopAppDiscoveryOptions): string[] {
  const roots = unique([
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Microsoft", "WindowsApps") : undefined,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local", "Microsoft", "WindowsApps") : undefined,
    path.join(os.homedir(), "AppData", "Local", "Microsoft", "WindowsApps")
  ].filter((value): value is string => Boolean(value?.trim())));

  const candidates: string[] = [];
  const aliasNames = windowsAliasNames(options);
  for (const root of roots) {
    for (const aliasName of aliasNames) {
      pushUnique(candidates, path.join(root, aliasName));
    }

    for (const entry of readDirectoryEntries(root)) {
      if (entry.toLowerCase().endsWith(".exe") && windowsExecutableNameLooksLikeApp(entry, options.packageKeywords)) {
        pushUnique(candidates, path.join(root, entry));
      }
    }
  }
  return candidates;
}

function windowsAliasNames(options: WindowsDesktopAppDiscoveryOptions): string[] {
  const names = [...options.exeNames];
  for (const name of options.whereNames) {
    names.push(name);
    if (!name.toLowerCase().endsWith(".exe")) {
      names.push(`${name}.exe`);
    }
  }
  return unique(names.filter((name) => name.trim().length > 0));
}

function windowsMsixPackageCandidates(options: WindowsDesktopAppDiscoveryOptions): string[] {
  const candidates: string[] = [];
  for (const installLocation of windowsMsixInstallLocations(options.packageKeywords)) {
    pushWindowsExecutableCandidates(candidates, installLocation, options);
  }
  return candidates;
}

function windowsMsixInstallLocations(packageKeywords: string[]): string[] {
  const locations: string[] = [];

  for (const root of windowsPackageRoots()) {
    for (const entry of readDirectoryEntries(root)) {
      if (nameContainsKeyword(entry, packageKeywords)) {
        pushUnique(locations, path.join(root, entry));
      }
    }
  }

  for (const installLocation of windowsAppxPackageInstallLocations(packageKeywords)) {
    pushUnique(locations, installLocation);
  }
  return locations;
}

function windowsPackageRoots(): string[] {
  return unique([
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "WindowsApps") : undefined,
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, "WindowsApps") : undefined,
    process.env.ProgramW6432 ? path.join(process.env.ProgramW6432, "WindowsApps") : undefined,
    process.env.PROGRAMW6432 ? path.join(process.env.PROGRAMW6432, "WindowsApps") : undefined,
    "C:\\Program Files\\WindowsApps"
  ].filter((value): value is string => Boolean(value?.trim())));
}

function windowsAppxPackageInstallLocations(packageKeywords: string[]): string[] {
  if (packageKeywords.length === 0) {
    return [];
  }

  const pattern = packageKeywords.map(escapeRegExp).join("|");
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue';",
    `$pattern = '${powerShellSingleQuotedString(pattern)}';`,
    "Get-AppxPackage | Where-Object {",
    "  ($_.Name -match $pattern) -or",
    "  ($_.PackageFullName -match $pattern) -or",
    "  ($_.InstallLocation -match $pattern)",
    "} | ForEach-Object { $_.InstallLocation }"
  ].join(" ");

  const result = spawnSync(windowsSystemCommand("powershell.exe"), [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script
  ], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function pushWindowsExecutableCandidates(
  candidates: string[],
  installLocation: string,
  options: WindowsDesktopAppDiscoveryOptions
): void {
  pushUnique(candidates, installLocation);
  for (const exeName of options.exeNames) {
    pushUnique(candidates, path.join(installLocation, exeName));
  }
  for (const nested of ["app", "current", "Current", "bin", path.join("app", "bin")]) {
    const nestedDir = path.join(installLocation, nested);
    pushUnique(candidates, nestedDir);
    for (const exeName of options.exeNames) {
      pushUnique(candidates, path.join(nestedDir, exeName));
    }
  }
}

function windowsWhereCandidates(names: string[]): string[] {
  const candidates: string[] = [];
  for (const name of names) {
    const result = spawnSync(windowsSystemCommand("where.exe"), [name], {
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

function windowsExecutableInDir(
  dir: string,
  options: WindowsDesktopAppNormalizeOptions
): string | undefined {
  if (!isDirectory(dir)) {
    return undefined;
  }

  for (const exeName of options.exeNames) {
    const candidate = path.join(dir, exeName);
    if (isFile(candidate)) {
      return candidate;
    }
  }

  const looseExecutable = readDirectoryEntries(dir)
    .filter((entry) => entry.toLowerCase().endsWith(".exe"))
    .map((entry) => path.join(dir, entry))
    .find((entry) => isFile(entry) && windowsExecutableNameLooksLikeApp(path.basename(entry), options.packageKeywords));
  if (looseExecutable) {
    return looseExecutable;
  }

  for (const nested of ["app", "current", "Current", "bin", path.join("app", "bin")]) {
    const candidate = windowsExecutableInDir(path.join(dir, nested), options);
    if (candidate) {
      return candidate;
    }
  }

  const versionedDirs = readDirectoryEntries(dir)
    .filter((entry) => entry.toLowerCase().startsWith("app-") || nameContainsKeyword(entry, options.packageKeywords))
    .map((entry) => path.join(dir, entry))
    .filter(isDirectory)
    .sort()
    .reverse();
  for (const versionedDir of versionedDirs) {
    const candidate = windowsExecutableInDir(versionedDir, options);
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

function readDirectoryEntries(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function matchesKnownExeName(fileName: string, exeNames: string[]): boolean {
  const normalized = fileName.toLowerCase();
  return exeNames.some((name) => name.toLowerCase() === normalized);
}

function windowsExecutableNameLooksLikeApp(fileName: string, packageKeywords: string[]): boolean {
  return fileName.toLowerCase().endsWith(".exe") && nameContainsKeyword(fileName, packageKeywords);
}

function nameContainsKeyword(value: string, packageKeywords: string[]): boolean {
  const normalized = value.toLowerCase();
  return packageKeywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function isLikelyWindowsPackagedAppPath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/").toLowerCase();
  return normalized.includes("/microsoft/windowsapps/") || normalized.includes("/windowsapps/");
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

function unique(values: string[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    pushUnique(result, value);
  }
  return result;
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function powerShellSingleQuotedString(value: string): string {
  return value.replace(/'/g, "''");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
