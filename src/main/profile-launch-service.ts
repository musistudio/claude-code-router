import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppConfig, ProfileOpenCommandResult, ProfileOpenRequest, ProfileOpenResult } from "../shared/app";
import { botGatewayProfileEnv } from "./bot-gateway-env";
import { applyClaudeAppGatewayConfig } from "./claude-app-gateway-service";
import { launchClaudeAppProfile, resolveClaudeAppProfileUserDataDir } from "./claude-app-launch";
import { launchCodexAppProfile } from "./codex-app-launch";
import { CONFIGDIR } from "./constants";
import { buildProfileLaunchPlan, findProfileForOpen, profileOpenCommand, resolveProfileOpenSurface } from "./profile-launch-core";
import { applyProfileConfig } from "./profile-service";

const ccrPathBlockStart = "# >>> Claude Code Router CLI >>>";
const ccrPathBlockEnd = "# <<< Claude Code Router CLI <<<";

export async function getProfileOpenCommand(config: AppConfig, request: ProfileOpenRequest): Promise<ProfileOpenCommandResult> {
  await applyProfileConfig(config);
  const profile = findProfileForOpen(config, request.profileId);
  const surface = resolveProfileOpenSurface(profile, request.surface);
  ensureCcrCliLauncher();
  return {
    command: profileOpenCommand(profile, surface, "ccr", commandProfileRef(config, profile)),
    profileId: profile.id,
    profileName: profile.name,
    surface
  };
}

export async function openProfileFromCcr(config: AppConfig, request: ProfileOpenRequest): Promise<ProfileOpenResult> {
  const profile = findProfileForOpen(config, request.profileId);
  const surface = resolveProfileOpenSurface(profile, request.surface);
  if (profile.agent === "claude-code" && surface === "app") {
    return openClaudeAppProfile(config, profile);
  }
  if (profile.agent === "codex" && surface === "app") {
    return openCodexAppProfile(config, profile);
  }
  const plan = buildProfileLaunchPlan(CONFIGDIR, profile, surface);
  if (path.isAbsolute(plan.command) && !existsSync(plan.command)) {
    throw new Error(`Profile launcher was not found: ${plan.command}. Re-save the profile and try again.`);
  }

  const child = spawn(plan.command, plan.args, {
    detached: true,
    env: {
      ...process.env,
      ...plan.env,
      ...botGatewayProfileEnv(config, profile)
    },
    stdio: "ignore"
  });
  child.unref();

  return {
    message: `Opened ${profile.name || profile.id}.`,
    profileId: profile.id,
    profileName: profile.name,
    surface
  };
}

function openCodexAppProfile(config: AppConfig, profile: ReturnType<typeof findProfileForOpen>): ProfileOpenResult {
  launchCodexAppProfile(CONFIGDIR, profile, config);
  return {
    message: `Opened Codex App with ${profile.name || profile.id}.`,
    profileId: profile.id,
    profileName: profile.name,
    surface: "app"
  };
}

async function openClaudeAppProfile(config: AppConfig, profile: ReturnType<typeof findProfileForOpen>): Promise<ProfileOpenResult> {
  const token = findProfileApiKey(config, profile);
  if (!token) {
    throw new Error(`No CCR API key was found for profile "${profile.name || profile.id}". Re-save the profile and try again.`);
  }

  const profileGatewayConfig = {
    ...config,
    APIKEY: token,
    APIKEYS: [
      {
        createdAt: new Date().toISOString(),
        id: profileApiKeyId(profile),
        key: token,
        name: `Profile: ${profile.name?.trim() || profile.id || profile.agent}`
      }
    ],
    Router: {
      ...config.Router,
      ...(profile.model.trim() ? { default: profile.model.trim() } : {})
    }
  };
  applyClaudeAppGatewayConfig(profileGatewayConfig);
  applyClaudeAppGatewayConfig(profileGatewayConfig, {
    backup: false,
    dataDir: resolveClaudeAppProfileUserDataDir(CONFIGDIR, profile)
  });
  launchClaudeAppProfile(CONFIGDIR, profile);
  return {
    message: `Opened Claude App with ${profile.name || profile.id}.`,
    profileId: profile.id,
    profileName: profile.name,
    surface: "app"
  };
}

function commandProfileRef(config: AppConfig, profile: ReturnType<typeof findProfileForOpen>): string {
  const name = profile.name?.trim();
  if (!name) {
    return profile.id;
  }
  const normalizedName = name.toLowerCase();
  const duplicateName = config.profile.profiles.some((item) =>
    item.enabled &&
    item.id !== profile.id &&
    item.name.trim().toLowerCase() === normalizedName
  );
  return duplicateName ? profile.id : name;
}

function ensureCcrCliLauncher(): string {
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { recursive: true });

  const runtimeFile = path.join(binDir, "ccr-cli.js");
  const runtimeSource = findBundledCcrCliSource();
  writeFileIfChanged(runtimeFile, readFileSync(runtimeSource, "utf8"));
  chmodSafe(runtimeFile);

  const launcherFile = path.join(binDir, process.platform === "win32" ? "ccr.cmd" : "ccr");
  const launcherContent = process.platform === "win32"
    ? windowsCcrLauncher(runtimeFile)
    : posixCcrLauncher(runtimeFile);
  writeFileIfChanged(launcherFile, launcherContent);
  chmodSafe(launcherFile);
  ensureCcrBinOnPath(binDir);

  return launcherFile;
}

function findBundledCcrCliSource(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    path.join(__dirname, "cli.js"),
    ...(resourcesPath
      ? [
          path.join(resourcesPath, "app.asar", "dist", "main", "cli.js"),
          path.join(resourcesPath, "app", "dist", "main", "cli.js")
        ]
      : []),
    path.join(process.cwd(), "dist", "main", "cli.js")
  ];
  const source = candidates.find((candidate) => existsSync(candidate));
  if (!source) {
    throw new Error(`CCR CLI runtime was not found. Rebuild or reinstall CCR and try again. Checked: ${candidates.join(", ")}`);
  }
  return source;
}

function posixCcrLauncher(runtimeFile: string): string {
  return [
    "#!/bin/sh",
    'if [ -n "$CCR_NODE_BIN" ]; then',
    `  exec "$CCR_NODE_BIN" ${shQuote(runtimeFile)} "$@"`,
    "fi",
    "if command -v node >/dev/null 2>&1; then",
    `  exec node ${shQuote(runtimeFile)} "$@"`,
    "fi",
    `ELECTRON_RUN_AS_NODE=1 exec ${shQuote(process.execPath)} ${shQuote(runtimeFile)} "$@"`
  ].join("\n") + "\n";
}

function windowsCcrLauncher(runtimeFile: string): string {
  return [
    "@echo off",
    "setlocal",
    `set "CCR_CLI_RUNTIME=${cmdEnvValue(runtimeFile)}"`,
    "if defined CCR_NODE_BIN (",
    '  "%CCR_NODE_BIN%" "%CCR_CLI_RUNTIME%" %*',
    "  exit /b %ERRORLEVEL%",
    ")",
    "where node >nul 2>nul",
    "if %ERRORLEVEL%==0 (",
    '  node "%CCR_CLI_RUNTIME%" %*',
    "  exit /b %ERRORLEVEL%",
    ")",
    "set \"ELECTRON_RUN_AS_NODE=1\"",
    `${cmdQuote(process.execPath)} "%CCR_CLI_RUNTIME%" %*`,
    "exit /b %ERRORLEVEL%"
  ].join("\r\n") + "\r\n";
}

function writeFileIfChanged(file: string, content: string): void {
  if (existsSync(file) && readFileSync(file, "utf8") === content) {
    return;
  }
  writeFileSync(file, content, "utf8");
}

function ensureCcrBinOnPath(binDir: string): void {
  prependProcessPath(binDir);
  try {
    if (process.platform === "win32") {
      ensureWindowsUserPath(binDir);
      return;
    }
    ensurePosixShellPath(binDir);
  } catch (error) {
    console.warn(`[profile] Failed to persist ccr PATH: ${formatError(error)}`);
  }
}

function prependProcessPath(binDir: string): void {
  const pathKey = process.platform === "win32"
    ? Object.keys(process.env).find((key) => key.toLowerCase() === "path") || "Path"
    : "PATH";
  const delimiter = path.delimiter;
  const currentPath = process.env[pathKey] || "";
  const segments = currentPath.split(delimiter).filter(Boolean);
  if (pathSegmentsInclude(segments, binDir)) {
    return;
  }
  process.env[pathKey] = [binDir, ...segments].join(delimiter);
}

function ensureWindowsUserPath(binDir: string): void {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$bin = ${powershellString(binDir)}`,
    "$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')",
    "$segments = @()",
    "if (-not [string]::IsNullOrWhiteSpace($userPath)) {",
    "  $segments = $userPath -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }",
    "}",
    "$expandedBin = [Environment]::ExpandEnvironmentVariables($bin).TrimEnd('\\\\')",
    "$expandedSegments = $segments | ForEach-Object { [Environment]::ExpandEnvironmentVariables($_).TrimEnd('\\\\') }",
    "if ($expandedSegments -notcontains $expandedBin) {",
    "  [Environment]::SetEnvironmentVariable('Path', ((@($bin) + $segments) -join ';'), 'User')",
    "}"
  ].join("\n");
  const result = spawnSync("powershell.exe", [
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
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `powershell.exe exited with ${result.status}`).trim());
  }
}

function ensurePosixShellPath(binDir: string): void {
  const shellName = path.basename(process.env.SHELL || "").toLowerCase();
  if (shellName.includes("fish")) {
    ensureFishPathBlock(path.join(os.homedir(), ".config", "fish", "conf.d", "ccr.fish"), binDir);
    return;
  }
  ensureShellRcPathBlock(preferredShellRcFile(shellName), binDir);
}

function preferredShellRcFile(shellName = path.basename(process.env.SHELL || "").toLowerCase()): string {
  const home = os.homedir();
  if (shellName.includes("zsh")) {
    return path.join(home, ".zshrc");
  }
  if (shellName.includes("bash")) {
    if (process.platform === "darwin") {
      const bashProfile = path.join(home, ".bash_profile");
      return existsSync(bashProfile) ? bashProfile : path.join(home, ".bashrc");
    }
    return path.join(home, ".bashrc");
  }
  return path.join(home, ".profile");
}

function pathSegmentsInclude(segments: string[], target: string): boolean {
  if (process.platform === "win32") {
    const normalizedTarget = normalizeWindowsPathSegment(target);
    return segments.some((segment) => normalizeWindowsPathSegment(segment) === normalizedTarget);
  }
  return segments.includes(target);
}

function normalizeWindowsPathSegment(value: string): string {
  return value.trim().replace(/[\\/]+$/g, "").toLowerCase();
}

function ensureShellRcPathBlock(rcFile: string, binDir: string): void {
  mkdirSync(path.dirname(rcFile), { recursive: true });
  const source = existsSync(rcFile) ? readFileSync(rcFile, "utf8") : "";
  const block = shellRcPathBlock();
  const managedPattern = new RegExp(
    `\\n?${escapeRegExp(ccrPathBlockStart)}[\\s\\S]*?${escapeRegExp(ccrPathBlockEnd)}\\n?`,
    "m"
  );
  if (managedPattern.test(source)) {
    const next = ensureTrailingNewline(source.replace(managedPattern, `\n${block}\n`)).replace(/^\n+/, "");
    writeFileIfChanged(rcFile, next);
    return;
  }
  if (shellRcAlreadyAddsCcrBin(source, binDir)) {
    return;
  }

  const separator = source.trim() ? (source.endsWith("\n") ? "\n" : "\n\n") : "";
  writeFileIfChanged(rcFile, `${source}${separator}${block}\n`);
}

function shellRcPathBlock(): string {
  const binDir = "$HOME/.claude-code-router/bin";
  return [
    ccrPathBlockStart,
    "# Added by Claude Code Router. Enables the ccr command in new shells.",
    'case ":$PATH:" in',
    `  *":${binDir}:"*) ;;`,
    `  *) export PATH="${binDir}:$PATH" ;;`,
    "esac",
    ccrPathBlockEnd
  ].join("\n");
}

function ensureFishPathBlock(file: string, binDir: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const source = existsSync(file) ? readFileSync(file, "utf8") : "";
  const block = fishPathBlock();
  const managedPattern = new RegExp(
    `\\n?${escapeRegExp(ccrPathBlockStart)}[\\s\\S]*?${escapeRegExp(ccrPathBlockEnd)}\\n?`,
    "m"
  );
  if (managedPattern.test(source)) {
    const next = ensureTrailingNewline(source.replace(managedPattern, `\n${block}\n`)).replace(/^\n+/, "");
    writeFileIfChanged(file, next);
    return;
  }
  if (shellRcAlreadyAddsCcrBin(source, binDir)) {
    return;
  }

  const separator = source.trim() ? (source.endsWith("\n") ? "\n" : "\n\n") : "";
  writeFileIfChanged(file, `${source}${separator}${block}\n`);
}

function fishPathBlock(): string {
  return [
    ccrPathBlockStart,
    "# Added by Claude Code Router. Enables the ccr command in new shells.",
    'set -l ccr_bin "$HOME/.claude-code-router/bin"',
    "if not contains $ccr_bin $PATH",
    "    set -gx PATH $ccr_bin $PATH",
    "end",
    ccrPathBlockEnd
  ].join("\n");
}

function shellRcAlreadyAddsCcrBin(source: string, binDir: string): boolean {
  return source.includes("$HOME/.claude-code-router/bin") ||
    source.includes("~/.claude-code-router/bin") ||
    source.includes(binDir);
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function chmodSafe(file: string): void {
  if (process.platform === "win32") {
    return;
  }
  try {
    chmodSync(file, 0o755);
  } catch {
    // The launcher can still be shown; execution will surface the filesystem error.
  }
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function cmdQuote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function cmdEnvValue(value: string): string {
  return value.replace(/%/g, "%%").replace(/"/g, '""');
}

function powershellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function findProfileApiKey(config: AppConfig, profile: ReturnType<typeof findProfileForOpen>): string {
  const keyId = profileApiKeyId(profile);
  const key = config.APIKEYS.find((apiKey) => apiKey.id === keyId)?.key.trim();
  return key || config.APIKEYS.find((apiKey) => apiKey.key.trim())?.key.trim() || config.APIKEY.trim();
}

function profileApiKeyId(profile: ReturnType<typeof findProfileForOpen>): string {
  return `profile:${sanitizeProfilePathSegment(profile.id || profile.name || profile.agent) || "profile"}`;
}

function sanitizeProfilePathSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}
