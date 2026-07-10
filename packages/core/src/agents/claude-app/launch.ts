import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppConfig, ProfileConfig } from "@ccr/core/contracts/app";
import { botGatewayProfileEnv } from "@ccr/core/agents/bot-gateway/env";
import { prepareClaudeAppCdpUserDataDir, reserveClaudeAppCdpPort, scheduleClaudeAppDesignCdp } from "@ccr/core/agents/claude-app/cdp";
import { claudeCodeUtcTimezoneEnvOverride } from "@ccr/core/agents/claude-code/environment";
import { resolveClaudeCodeSettingsFile } from "@ccr/core/profiles/launch-core";
import { normalizeWindowsDesktopAppCandidate, windowsDesktopAppCandidates } from "@ccr/core/platform/windows-app-discovery";

type ClaudeAppLookupResult = {
  checked: string[];
  executable?: string;
};

export type ClaudeAppLaunchResult = {
  child: ChildProcess;
  command: string;
  cdpPort?: number;
  claudeDesignProxy?: boolean;
  pidIsLauncher?: boolean;
  pid?: number;
  userDataDir: string;
};

const macClaudeAppNames = ["Claude.app", "Claude Desktop.app"];
const windowsClaudeAppDirs = ["Claude", "Claude Desktop", "ClaudeDesktop", "AnthropicClaude"];
const windowsClaudeExeNames = [
  "Claude.exe",
  "claude.exe",
  "Claude Desktop.exe",
  "ClaudeDesktop.exe",
  "AnthropicClaude.exe",
  "claude-desktop.exe"
];
const windowsClaudePackageKeywords = ["claude", "anthropic"];

type ClaudeAppCandidateOptions = {
  allowGenericExecutable?: boolean;
};

export async function launchClaudeAppProfile(configDir: string, profile: ProfileConfig, config?: AppConfig): Promise<ClaudeAppLaunchResult> {
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
  prepareClaudeAppCdpUserDataDir(userDataDir);
  const shouldOpenDesign = shouldOpenClaudeAppDesign(config);
  const cdpPort = await reserveClaudeAppCdpPort(console, shouldOpenDesign);

  const appEnv: Record<string, string> = {
    ...profileEnv(profile),
    ...claudeCodeModelEnv(profile),
    ...(config ? botGatewayProfileEnv(config, profile, "app") : {}),
    CLAUDE_CONFIG_DIR: settingsDir,
    CLAUDE_USER_DATA_DIR: userDataDir,
    CCR_CLAUDE_APP_USER_DATA_PATH: userDataDir,
    CCR_PROFILE_SURFACE: "app",
    ELECTRON_ENABLE_LOGGING: "1",
    ...claudeCodeUtcTimezoneEnvOverride()
  };
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...appEnv
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const designUrl = claudeAppDesignUrl(config);
  const proxyUrl = claudeAppProxyUrl(config);
  const launch = claudeAppLaunchCommand(lookup.executable, userDataDir, cdpPort, proxyUrl, appEnv);
  const child = spawn(launch.command, launch.args, {
    detached: true,
    env,
    stdio: "ignore"
  });
  child.unref();
  scheduleClaudeAppDesignCdp({
    cdpPort,
    designUrl,
    enabled: shouldOpenDesign,
    logger: console
  });

  return {
    child,
    claudeDesignProxy: Boolean(proxyUrl),
    command: launch.command,
    ...(cdpPort ? { cdpPort } : {}),
    ...(launch.pidIsLauncher ? { pidIsLauncher: launch.pidIsLauncher } : {}),
    pid: child.pid,
    userDataDir
  };
}

export function resolveClaudeAppProfileUserDataDir(configDir: string, profile: ProfileConfig): string {
  const settingsFile = resolveClaudeCodeSettingsFile(configDir, profile);
  return claudeElectronUserDataDir(path.dirname(settingsFile), profile);
}

function shouldOpenClaudeAppDesign(config: AppConfig | undefined): boolean {
  return Boolean(claudeDesignPluginConfig(config));
}

function claudeAppDesignUrl(config: AppConfig | undefined): string | undefined {
  const plugin = claudeDesignPluginConfig(config);
  if (!plugin) {
    return undefined;
  }
  const options = isRecord(plugin.config) ? plugin.config : {};
  const host = typeof options.host === "string" && options.host.trim() ? options.host.trim() : "claude.ai";
  return `https://${host}/design`;
}

function claudeDesignPluginConfig(config: AppConfig | undefined): AppConfig["plugins"][number] | undefined {
  return config?.plugins.find((plugin) => plugin.enabled !== false && plugin.id === "claude-design");
}

function claudeAppProxyUrl(config: AppConfig | undefined): string | undefined {
  if (!config?.proxy?.enabled) {
    return undefined;
  }
  const port = Number.isInteger(config.gateway?.port) && config.gateway.port > 0
    ? config.gateway.port
    : Number.isInteger(config.PORT) && config.PORT > 0
      ? config.PORT
      : undefined;
  if (!port) {
    return undefined;
  }
  const host = formatLoopbackGatewayHost(config.gateway?.host || "127.0.0.1");
  return `http://${host}:${port}`;
}

function formatLoopbackGatewayHost(host: string): string {
  const trimmed = host.trim();
  if (!trimmed || trimmed === "0.0.0.0" || trimmed === "::" || trimmed === "[::]") {
    return "127.0.0.1";
  }
  if (trimmed.includes(":") && !trimmed.startsWith("[")) {
    return `[${trimmed}]`;
  }
  return trimmed;
}

function claudeElectronArgs(userDataDir: string, cdpPort?: number, proxyUrl?: string): string[] {
  return [
    ...(cdpPort
      ? [
          `--remote-debugging-port=${cdpPort}`,
          "--remote-debugging-address=127.0.0.1"
        ]
      : []),
    ...(proxyUrl
      ? [
          `--proxy-server=${proxyUrl}`,
          "--proxy-bypass-list=localhost;127.0.0.1;[::1]"
        ]
      : []),
    `--user-data-dir=${userDataDir}`,
    "--remote-allow-origins=*",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows"
  ];
}

export function claudeAppLaunchCommand(
  executable: string,
  userDataDir: string,
  cdpPort: number | undefined,
  proxyUrl: string | undefined,
  env: Record<string, string>
): { args: string[]; command: string; pidIsLauncher?: boolean } {
  const args = claudeElectronArgs(userDataDir, cdpPort, proxyUrl);
  const appBundle = process.platform === "darwin" ? macAppBundleFromExecutable(executable) : undefined;
  if (appBundle) {
    return {
      args: [
        "-W",
        "-n",
        ...macOpenEnvArgs(env),
        appBundle,
        "--args",
        ...args
      ],
      command: "/usr/bin/open",
      pidIsLauncher: true
    };
  }
  return {
    args,
    command: executable
  };
}

function macAppBundleFromExecutable(executable: string): string | undefined {
  const normalized = path.normalize(executable);
  const marker = `${path.sep}Contents${path.sep}MacOS${path.sep}`;
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex <= 0) {
    return undefined;
  }
  const appBundle = normalized.slice(0, markerIndex);
  return appBundle.endsWith(".app") && isDirectory(appBundle) ? appBundle : undefined;
}

function macOpenEnvArgs(env: Record<string, string>): string[] {
  return Object.entries(env)
    .filter(([key, value]) => isEnvName(key) && typeof value === "string")
    .flatMap(([key, value]) => ["--env", `${key}=${value}`]);
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
  const envCandidate = findFirstExecutable(envClaudeAppPathCandidates(), checked, { allowGenericExecutable: true });
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

function findFirstExecutable(candidates: string[], checked: string[], options: ClaudeAppCandidateOptions = {}): string | undefined {
  for (const candidate of candidates) {
    if (!candidate || checked.includes(candidate)) {
      continue;
    }
    checked.push(candidate);
    const executable = normalizeClaudeAppCandidate(candidate, options);
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
  return windowsDesktopAppCandidates({
    appDirs: windowsClaudeAppDirs,
    exeNames: windowsClaudeExeNames,
    packageKeywords: windowsClaudePackageKeywords,
    vendorDirs: ["Anthropic"],
    whereNames: [
      "Claude",
      "claude",
      "Claude Desktop",
      "ClaudeDesktop",
      "AnthropicClaude",
      "claude-desktop"
    ]
  });
}

function linuxClaudeAppCandidates(): string[] {
  return [
    "/usr/bin/claude",
    "/usr/bin/claude-desktop",
    "/usr/local/bin/claude",
    "/usr/local/bin/claude-desktop",
    "/opt/Claude/claude",
    "/opt/Claude/Claude",
    "/opt/Claude Desktop/claude",
    "/opt/Claude Desktop/Claude",
    "/opt/Claude Desktop/claude-desktop",
    "/opt/ClaudeDesktop/ClaudeDesktop",
    "/opt/AnthropicClaude/AnthropicClaude"
  ];
}

export function normalizeClaudeAppCandidate(candidate: string, options: ClaudeAppCandidateOptions = {}): string | undefined {
  if (process.platform === "darwin") {
    if (candidate.endsWith(".app")) {
      return executableFromMacAppBundle(candidate);
    }
    return isFile(candidate) ? candidate : undefined;
  }
  if (process.platform === "win32") {
    const executable = normalizeWindowsClaudeAppCandidate(candidate);
    return executable && isAllowedClaudeAppExecutable(executable, options) ? executable : undefined;
  }
  return isFile(candidate) && isAllowedClaudeAppExecutable(candidate, options) ? candidate : undefined;
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
  return normalizeWindowsDesktopAppCandidate(candidate, {
    exeNames: windowsClaudeExeNames,
    packageKeywords: windowsClaudePackageKeywords
  });
}

function isAllowedClaudeAppExecutable(executable: string, options: ClaudeAppCandidateOptions): boolean {
  if (options.allowGenericExecutable || !isGenericClaudeExecutableName(executable)) {
    return true;
  }
  return hasElectronDesktopAppResources(executable);
}

function isGenericClaudeExecutableName(executable: string): boolean {
  const name = path.basename(executable).toLowerCase();
  return name === "claude" || name === "claude.exe";
}

function hasElectronDesktopAppResources(executable: string): boolean {
  const resourcesDir = path.join(path.dirname(executable), "resources");
  return isFile(path.join(resourcesDir, "app.asar")) ||
    isDirectory(path.join(resourcesDir, "app")) ||
    isDirectory(path.join(resourcesDir, "app.asar.unpacked"));
}

function profileEnv(profile: ProfileConfig): Record<string, string> {
  return Object.entries(profile.env ?? {}).reduce<Record<string, string>>((result, [key, value]) => {
    if (isEnvName(key) && typeof value === "string") {
      result[key] = value;
    }
    return result;
  }, {});
}

function claudeCodeModelEnv(profile: ProfileConfig): Record<string, string> {
  const env: Record<string, string> = {};
  const model = normalizeClientModel(profile.model);
  if (model) {
    env.ANTHROPIC_MODEL = model;
    env.CCR_CLAUDE_CODE_MODEL = model;
    env.CODEXL_CLAUDE_CODE_MODEL = model;
  }
  const smallFastModel = normalizeClientModel(profile.smallFastModel);
  if (smallFastModel) {
    env.ANTHROPIC_SMALL_FAST_MODEL = smallFastModel;
  }
  return env;
}

function normalizeClientModel(value: string | undefined): string {
  const trimmed = value?.trim() || "";
  if (!trimmed) {
    return "";
  }
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > 0 && commaIndex < trimmed.length - 1) {
    const provider = trimmed.slice(0, commaIndex).trim();
    const model = trimmed.slice(commaIndex + 1).trim();
    return provider && model ? `${provider}/${model}` : "";
  }
  return trimmed;
}

function isEnvName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
