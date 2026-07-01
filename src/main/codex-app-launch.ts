import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppConfig, ProfileConfig } from "../shared/app";
import { botGatewayProfileEnv } from "./bot-gateway-env";
import { codexModelCatalogJson } from "./codex-model-catalog";
import { buildProfileLaunchPlan, resolveCodexConfigFile } from "./profile-launch-core";
import { normalizeWindowsDesktopAppCandidate, windowsDesktopAppCandidates } from "./windows-app-discovery";
import { writeZcodeGatewayConfig, zcodeHomeFromConfigFile } from "./zcode-profile-config";

type CodexAppLookupResult = {
  checked: string[];
  executable?: string;
};

type CodexCompatibleAppKind = "codex" | "zcode";

type CodexCompatibleAppSpec = {
  bundledCliNames: string[];
  defaultCliCommand: string;
  displayName: string;
  envPathKeys: string[];
  kind: CodexCompatibleAppKind;
  linuxCandidates: string[];
  macAppNames: string[];
  modelCatalogFilename: string;
  userDataDirName: string;
  windowsAppDirs: string[];
  windowsExeNames: string[];
  windowsPackageKeywords: string[];
  windowsVendorDirs: string[];
  windowsWhereNames: string[];
};

export type CodexAppLaunchResult = {
  child: ChildProcess;
  command: string;
  pidIsLauncher?: boolean;
  pid?: number;
  userDataDir: string;
};

export type CodexCompatibleAppModelCatalogWriteResult = {
  changed: boolean;
  file: string;
  userDataDir: string;
};

const codexAppSpec: CodexCompatibleAppSpec = {
  bundledCliNames: ["codex", "Codex", "OpenAI Codex"],
  defaultCliCommand: "codex",
  displayName: "Codex App",
  envPathKeys: ["CCR_CODEX_APP_PATH", "CODEX_APP_PATH", "CODEXL_CODEX_PATH"],
  kind: "codex",
  linuxCandidates: [
    "/opt/Codex/codex",
    "/opt/Codex/Codex",
    "/opt/OpenAI Codex/codex",
    "/opt/OpenAI Codex/Codex",
    "/usr/local/bin/codex-app",
    "/usr/bin/codex-app"
  ],
  macAppNames: ["Codex.app", "OpenAI Codex.app"],
  modelCatalogFilename: "ccr-codex-model-catalog.json",
  userDataDirName: "codex-app-user-data",
  windowsAppDirs: ["Codex", "OpenAI Codex", "OpenAICodex"],
  windowsExeNames: [
    "Codex.exe",
    "codex.exe",
    "OpenAI Codex.exe",
    "OpenAICodex.exe",
    "OpenAICodexApp.exe",
    "codex-app.exe",
    "openai-codex.exe"
  ],
  windowsPackageKeywords: ["codex", "openaicodex"],
  windowsVendorDirs: ["OpenAI"],
  windowsWhereNames: [
    "Codex",
    "codex",
    "OpenAI Codex",
    "OpenAICodex",
    "OpenAICodexApp",
    "codex-app",
    "openai-codex"
  ]
};

const zcodeAppSpec: CodexCompatibleAppSpec = {
  bundledCliNames: ["glm/zcode.cjs", "zcode", "ZCode", "Z Code", "z-code", "zai-code", "codex", "Codex"],
  defaultCliCommand: "zcode",
  displayName: "ZCode App",
  envPathKeys: ["CCR_ZCODE_APP_PATH", "ZCODE_APP_PATH", "CODEXL_ZCODE_PATH"],
  kind: "zcode",
  linuxCandidates: [
    "/opt/ZCode/zcode",
    "/opt/ZCode/ZCode",
    "/opt/Z Code/zcode",
    "/opt/Z.AI Code/zcode",
    "/usr/local/bin/zcode",
    "/usr/bin/zcode",
    "/usr/local/bin/z-code",
    "/usr/bin/z-code",
    "/usr/local/bin/zai-code",
    "/usr/bin/zai-code"
  ],
  macAppNames: ["ZCode.app", "Z Code.app", "Z.AI Code.app", "ZAI Code.app"],
  modelCatalogFilename: "ccr-zcode-model-catalog.json",
  userDataDirName: "zcode-app-user-data",
  windowsAppDirs: ["ZCode", "Z Code", "ZAI Code", "Z.AI Code", "Zhipu ZCode"],
  windowsExeNames: [
    "ZCode.exe",
    "zcode.exe",
    "Z Code.exe",
    "ZAI Code.exe",
    "ZAICode.exe",
    "z-code.exe",
    "zai-code.exe"
  ],
  windowsPackageKeywords: ["zcode", "z-code", "zaicode", "zai-code"],
  windowsVendorDirs: ["ZCode", "Z.AI", "ZAI", "Zhipu", "ZhipuAI"],
  windowsWhereNames: [
    "ZCode",
    "zcode",
    "Z Code",
    "ZAI Code",
    "ZAICode",
    "z-code",
    "zai-code"
  ]
};

export function launchCodexAppProfile(configDir: string, profile: ProfileConfig, config?: AppConfig): CodexAppLaunchResult {
  return launchCodexCompatibleAppProfile(configDir, profile, codexAppSpec, config);
}

export function launchZcodeAppProfile(configDir: string, profile: ProfileConfig, config?: AppConfig): CodexAppLaunchResult {
  return launchCodexCompatibleAppProfile(configDir, profile, zcodeAppSpec, config);
}

export function refreshCodexCompatibleAppProfileFiles(
  configDir: string,
  profile: ProfileConfig,
  config?: AppConfig
): { modelCatalogChanged: boolean; modelCatalogFile: string; userDataDir: string } {
  const spec = profile.agent === "zcode" ? zcodeAppSpec : codexAppSpec;
  if (spec.kind === "zcode" && config?.APIKEY) {
    writeZcodeGatewayConfig(config, profile, config.APIKEY, { backup: false });
  }
  const modelCatalog = writeCodexCompatibleAppModelCatalog(configDir, profile, config);
  return {
    modelCatalogChanged: modelCatalog.changed,
    modelCatalogFile: modelCatalog.file,
    userDataDir: modelCatalog.userDataDir
  };
}

export function writeCodexCompatibleAppModelCatalog(
  configDir: string,
  profile: ProfileConfig,
  config?: AppConfig
): CodexCompatibleAppModelCatalogWriteResult {
  const spec = profile.agent === "zcode" ? zcodeAppSpec : codexAppSpec;
  const configFile = resolveCodexConfigFile(configDir, profile);
  const codexHome = codexCompatibleHomeFromConfigFile(spec, configFile);
  const userDataDir = codexElectronUserDataDir(codexHome, profile, spec);
  mkdirSync(userDataDir, { recursive: true });
  const file = codexAppModelCatalogFile(userDataDir, spec);
  const content = codexModelCatalogJson(config, profile.model);
  const previous = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (previous !== content) {
    writeFileSync(file, content, "utf8");
  }
  return { changed: previous !== content, file, userDataDir };
}

function launchCodexCompatibleAppProfile(
  configDir: string,
  profile: ProfileConfig,
  spec: CodexCompatibleAppSpec,
  config?: AppConfig
): CodexAppLaunchResult {
  const lookup = findInstalledCodexAppExecutable(spec);
  if (!lookup.executable) {
    throw new Error([
      `${spec.displayName} was not found. Install ${spec.displayName} or set ${spec.envPathKeys[1]} to its executable, then try again.`,
      lookup.checked.length ? `Checked: ${lookup.checked.join(", ")}` : ""
    ].filter(Boolean).join(" "));
  }

  const plan = buildProfileLaunchPlan(configDir, profile, "app");
  if (path.isAbsolute(plan.command) && !existsSync(plan.command)) {
    throw new Error(`Profile launcher was not found: ${plan.command}. Re-save the profile and try again.`);
  }

  const configFile = resolveCodexConfigFile(configDir, profile);
  const codexHome = codexCompatibleHomeFromConfigFile(spec, configFile);
  const { modelCatalogFile, userDataDir } = refreshCodexCompatibleAppProfileFiles(configDir, profile, config);

  const appEnv: Record<string, string> = {
    ...plan.env,
    ...(config ? botGatewayProfileEnv(config, profile, "app") : {}),
    ...codexProfileEnv(profile, lookup.executable, spec),
    CODEXL_PROFILE_SURFACE: "app",
    CCR_PROFILE_SURFACE: "app",
    ...codexAppAgentEnv(spec, plan.command, codexHome, userDataDir, modelCatalogFile),
    ELECTRON_ENABLE_LOGGING: "1"
  };
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...appEnv
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CCR_CODEX_MODEL_CATALOG_B64;
  delete env.CODEXL_CODEX_MODEL_CATALOG_B64;
  delete env.CCR_ZCODE_MODEL_CATALOG_B64;
  delete env.CODEXL_ZCODE_MODEL_CATALOG_B64;
  sanitizeCodexCompatibleAppEnv(env, spec.kind);

  const launch = codexAppLaunchCommand(lookup.executable, userDataDir, appEnv);
  const child = spawn(launch.command, launch.args, {
    detached: true,
    env,
    stdio: "ignore"
  });
  child.unref();

  return {
    child,
    command: launch.command,
    pidIsLauncher: launch.pidIsLauncher,
    pid: child.pid,
    userDataDir
  };
}

function codexProfileEnv(profile: ProfileConfig, appExecutable: string, spec: CodexCompatibleAppSpec): Record<string, string> {
  const providerId = sanitizeCodexProviderId(profile.providerId || "") || "claude-code-router";
  const realCliPath = profile.codexCliPath?.trim() || bundledCodexCliPath(appExecutable, spec) || spec.defaultCliCommand;
  const remoteFrontendMode = normalizeCodexRemoteFrontendMode(profile.remoteFrontendMode);
  if (spec.kind === "zcode") {
    return {
      ...(profile.model.trim() ? { CCR_ZCODE_MODEL: profile.model.trim() } : {}),
      CCR_ZCODE_MODEL_PROVIDER: providerId,
      CCR_ZCODE_PROFILE: providerId,
      CCR_ZCODE_REMOTE_FRONTEND_MODE: remoteFrontendMode,
      CCR_REAL_ZCODE_CLI_PATH: realCliPath,
      CODEXL_REAL_ZCODE_CLI_PATH: realCliPath,
      CODEXL_ZCODE_CORE_MODE: remoteFrontendMode,
      CODEXL_ZCODE_MODEL_PROVIDER: providerId,
      CODEXL_ZCODE_PROFILE: providerId,
      CODEXL_ZCODE_WORKSPACE_NAME: profile.name || providerId
    };
  }
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

function codexAppAgentEnv(
  spec: CodexCompatibleAppSpec,
  launcher: string,
  home: string,
  userDataDir: string,
  modelCatalogFile: string
): Record<string, string> {
  return spec.kind === "zcode"
    ? {
        CCR_ZCODE_MODEL_CATALOG_FILE: modelCatalogFile,
        CODEXL_ZCODE_MODEL_CATALOG_FILE: modelCatalogFile,
        ZCODE_CLI_PATH: launcher,
        ZCODE_ELECTRON_USER_DATA_PATH: userDataDir,
        ZCODE_HOME: home,
        ZCODE_STORAGE_DIR: home
      }
    : {
        CCR_CODEX_MODEL_CATALOG_FILE: modelCatalogFile,
        CODEX_CLI_PATH: launcher,
        CODEX_ELECTRON_USER_DATA_PATH: userDataDir,
        CODEX_HOME: home,
        CODEXL_CODEX_MODEL_CATALOG_FILE: modelCatalogFile
      };
}

function sanitizeCodexCompatibleAppEnv(env: NodeJS.ProcessEnv, kind: CodexCompatibleAppKind): void {
  const blockedPrefixes = kind === "zcode" ? ["CCR_CODEX_", "CODEXL_CODEX_"] : ["CCR_ZCODE_", "CODEXL_ZCODE_"];
  for (const key of Object.keys(env)) {
    if (blockedPrefixes.some((prefix) => key.startsWith(prefix))) {
      delete env[key];
    }
  }
  if (kind === "zcode") {
    delete env.CODEX_CLI_PATH;
    delete env.CODEX_ELECTRON_USER_DATA_PATH;
    delete env.CODEX_HOME;
    return;
  }
  delete env.ZCODE_CLI_PATH;
  delete env.ZCODE_ELECTRON_USER_DATA_PATH;
  delete env.ZCODE_HOME;
  delete env.ZCODE_STORAGE_DIR;
}

function bundledCodexCliPath(appExecutable: string, spec: CodexCompatibleAppSpec): string | undefined {
  if (process.platform === "darwin") {
    const appBundle = macAppBundleFromExecutable(appExecutable);
    if (!appBundle) {
      return undefined;
    }
    for (const name of spec.bundledCliNames) {
      const candidate = path.join(appBundle, "Contents", "Resources", name);
      if (isFile(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }

  if (process.platform === "win32") {
    const appDir = path.dirname(appExecutable);
    const resourceDir = path.join(appDir, "resources");
    for (const name of spec.windowsExeNames) {
      const candidate = path.join(resourceDir, name);
      if (isFile(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
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

function codexAppLaunchCommand(executable: string, userDataDir: string, env: Record<string, string>): { args: string[]; command: string; pidIsLauncher?: boolean } {
  const appBundle = process.platform === "darwin" ? macAppBundleFromExecutable(executable) : undefined;
  if (appBundle) {
    return {
      command: "/usr/bin/open",
      pidIsLauncher: true,
      args: [
        "-W",
        "-n",
        ...macOpenEnvArgs(env),
        appBundle,
        "--args",
        ...codexElectronArgs(userDataDir)
      ]
    };
  }
  return {
    command: executable,
    args: codexElectronArgs(userDataDir)
  };
}

function macOpenEnvArgs(env: Record<string, string>): string[] {
  return Object.entries(env)
    .filter(([key, value]) => isEnvName(key) && typeof value === "string")
    .flatMap(([key, value]) => ["--env", `${key}=${value}`]);
}

function macAppBundleFromExecutable(executable: string): string | undefined {
  const marker = ".app/Contents/MacOS/";
  const index = executable.indexOf(marker);
  if (index < 0) {
    return undefined;
  }
  const appBundle = executable.slice(0, index + ".app".length);
  return isDirectory(appBundle) ? appBundle : undefined;
}

function isEnvName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function codexElectronUserDataDir(codexHome: string, profile: ProfileConfig, spec: CodexCompatibleAppSpec): string {
  return path.join(
    codexHome,
    ".claude-code-router",
    spec.userDataDirName,
    sanitizeProfilePathSegment(profile.id || profile.name || "default") || "default"
  );
}

function codexAppModelCatalogFile(userDataDir: string, spec: CodexCompatibleAppSpec): string {
  return path.join(userDataDir, spec.modelCatalogFilename);
}

function codexCompatibleHomeFromConfigFile(spec: CodexCompatibleAppSpec, configFile: string): string {
  return spec.kind === "zcode" ? zcodeHomeFromConfigFile(configFile) : path.dirname(configFile);
}

function findInstalledCodexAppExecutable(spec: CodexCompatibleAppSpec): CodexAppLookupResult {
  const checked: string[] = [];
  const envCandidate = findFirstExecutable(envCodexAppPathCandidates(spec), checked, spec);
  if (envCandidate) {
    return { checked, executable: envCandidate };
  }

  if (process.platform === "darwin") {
    return { checked, executable: findFirstExecutable(macCodexAppCandidates(spec), checked, spec) };
  }
  if (process.platform === "win32") {
    return { checked, executable: findFirstExecutable(windowsCodexAppCandidates(spec), checked, spec) };
  }
  return { checked, executable: findFirstExecutable(linuxCodexAppCandidates(spec), checked, spec) };
}

function findFirstExecutable(candidates: string[], checked: string[], spec: CodexCompatibleAppSpec): string | undefined {
  for (const candidate of candidates) {
    if (!candidate || checked.includes(candidate)) {
      continue;
    }
    checked.push(candidate);
    const executable = normalizeCodexAppCandidate(candidate, spec);
    if (executable) {
      return executable;
    }
  }
  return undefined;
}

function envCodexAppPathCandidates(spec: CodexCompatibleAppSpec): string[] {
  return spec.envPathKeys
    .map((key) => process.env[key]?.trim() || "")
    .filter(Boolean)
    .map(resolveUserPath);
}

function macCodexAppCandidates(spec: CodexCompatibleAppSpec): string[] {
  const roots = [
    "/Applications",
    path.join(os.homedir(), "Applications")
  ];
  return roots.flatMap((root) => spec.macAppNames.map((name) => path.join(root, name)));
}

function windowsCodexAppCandidates(spec: CodexCompatibleAppSpec): string[] {
  return windowsDesktopAppCandidates({
    appDirs: spec.windowsAppDirs,
    exeNames: spec.windowsExeNames,
    packageKeywords: spec.windowsPackageKeywords,
    vendorDirs: spec.windowsVendorDirs,
    whereNames: spec.windowsWhereNames
  });
}

function linuxCodexAppCandidates(spec: CodexCompatibleAppSpec): string[] {
  return spec.linuxCandidates;
}

function normalizeCodexAppCandidate(candidate: string, spec: CodexCompatibleAppSpec): string | undefined {
  if (process.platform === "darwin") {
    if (candidate.endsWith(".app")) {
      return executableFromMacAppBundle(candidate, spec);
    }
    return isFile(candidate) ? candidate : undefined;
  }
  if (process.platform === "win32") {
    return normalizeWindowsCodexAppCandidate(candidate, spec);
  }
  return isFile(candidate) ? candidate : undefined;
}

function executableFromMacAppBundle(appPath: string, spec: CodexCompatibleAppSpec): string | undefined {
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
  for (const name of [appName, ...spec.bundledCliNames]) {
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

function normalizeWindowsCodexAppCandidate(candidate: string, spec: CodexCompatibleAppSpec): string | undefined {
  return normalizeWindowsDesktopAppCandidate(candidate, {
    exeNames: spec.windowsExeNames,
    packageKeywords: spec.windowsPackageKeywords
  });
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
