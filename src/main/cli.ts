#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppConfig, ProfileOpenSurface } from "../shared/app";
import { botGatewayProfileEnv } from "./bot-gateway-env";
import { launchCodexAppProfile, launchZcodeAppProfile } from "./codex-app-launch";
import { createBetterSqliteDatabase } from "./sqlite-native";
import { buildProfileLaunchPlan, findProfileForOpen, profileLaunchSpawnCommand, resolveProfileOpenSurface } from "./profile-launch-core";

type CliOptions = {
  agentArgs: string[];
  help: boolean;
  profileRef: string;
  surface?: ProfileOpenSurface;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.profileRef) {
    printHelp(options.help ? 0 : 2);
    return;
  }

  const configFile = process.env.CCR_CONFIG_FILE?.trim() || defaultConfigFile();
  const configDir = path.dirname(configFile);
  const config = readConfig(configFile, process.env.CCR_CONFIG_DB_FILE?.trim() || defaultConfigDbFile(configFile));
  const profile = findProfileForOpen(config, options.profileRef);
  const surface = options.surface ?? (profile.agent === "zcode" || profile.surface === "app" ? "app" : "cli");
  const resolvedSurface = resolveProfileOpenSurface(profile, surface);
  if (profile.agent === "zcode" && options.agentArgs.length > 0) {
    throw new Error("ZCode profiles can only open the app; agent arguments are not supported.");
  }
  if ((profile.agent === "codex" || profile.agent === "zcode") && resolvedSurface === "app" && options.agentArgs.length === 0) {
    if (profile.agent === "zcode") {
      const launch = launchZcodeAppProfile(configDir, profile, config);
      const spawnError = await waitForImmediateSpawnError(launch.child, 500);
      if (spawnError) {
        throw new Error(`Failed to open ZCode App: ${spawnError}`);
      }
      process.stdout.write(`Opened ZCode App with ${profile.name || profile.id}.\n`);
    } else {
      const launch = launchCodexAppProfile(configDir, profile, config);
      const spawnError = await waitForImmediateSpawnError(launch.child, 500);
      if (spawnError) {
        throw new Error(`Failed to open Codex App: ${spawnError}`);
      }
      process.stdout.write(`Opened Codex App with ${profile.name || profile.id}.\n`);
    }
    return;
  }

  const plan = buildProfileLaunchPlan(configDir, profile, resolvedSurface, options.agentArgs);

  if (path.isAbsolute(plan.command) && !existsSync(plan.command)) {
    throw new Error(`Profile launcher was not found: ${plan.command}. Open CCR once or re-save the profile.`);
  }

  const childEnv = {
    ...process.env,
    ...plan.env,
    ...botGatewayProfileEnv(config, profile, resolvedSurface)
  };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const launch = profileLaunchSpawnCommand(plan);
  const child = spawn(launch.command, launch.args, {
    env: childEnv,
    stdio: "inherit"
  });
  const code = await waitForChild(child);
  process.exitCode = code;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    agentArgs: [],
    help: false,
    profileRef: ""
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      options.agentArgs.push(...args.slice(index + 1));
      break;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--app") {
      options.surface = "app";
      continue;
    }
    if (arg === "--cli") {
      options.surface = "cli";
      continue;
    }
    if (!options.profileRef) {
      options.profileRef = arg;
      continue;
    }
    options.agentArgs.push(arg);
  }
  return options;
}

function readConfig(jsonFile: string, dbFile: string): AppConfig {
  const sqliteConfig = readSqliteConfig(dbFile);
  if (sqliteConfig) {
    return normalizeCliConfig(sqliteConfig, dbFile);
  }
  if (!existsSync(jsonFile)) {
    throw new Error(`CCR config was not found: ${dbFile}`);
  }
  const parsed = JSON.parse(readFileSync(jsonFile, "utf8")) as Partial<AppConfig>;
  return normalizeCliConfig(parsed, jsonFile);
}

function readSqliteConfig(file: string): Partial<AppConfig> | undefined {
  if (!existsSync(file)) {
    return undefined;
  }
  let database: ReturnType<typeof createBetterSqliteDatabase> | undefined;
  try {
    database = createBetterSqliteDatabase(file);
    const row = database.prepare("SELECT value_json FROM app_config WHERE key = ? LIMIT 1").get("default") as { value_json?: unknown } | undefined;
    return typeof row?.value_json === "string"
      ? JSON.parse(row.value_json) as Partial<AppConfig>
      : undefined;
  } catch {
    return undefined;
  } finally {
    database?.close();
  }
}

function normalizeCliConfig(parsed: Partial<AppConfig>, source: string): AppConfig {
  if (!parsed.profile || !Array.isArray(parsed.profile.profiles)) {
    throw new Error(`CCR config has no profiles: ${source}`);
  }
  return {
    ...parsed,
    profile: {
      ...parsed.profile,
      profiles: parsed.profile.profiles
    } as AppConfig["profile"]
  } as AppConfig;
}

function defaultConfigDbFile(configFile: string): string {
  return path.join(path.dirname(configFile), "config.sqlite");
}

function defaultConfigFile(): string {
  return path.join(defaultConfigDir(), "config.json");
}

function defaultConfigDir(): string {
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA ||
        process.env.LOCALAPPDATA ||
        (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Roaming") : path.join(os.homedir(), "AppData", "Roaming")),
      "Claude Code Router"
    );
  }
  return path.join(os.homedir(), ".claude-code-router");
}

function printHelp(exitCode: number): void {
  const output = [
    "Usage:",
    "  ccr <profile-name-or-id> [--cli|--app] [-- <agent args>]",
    "",
    "Examples:",
    "  ccr Codex",
    "  ccr default-codex -- --model gpt-5-codex",
    "  ccr default-codex --app",
    "  ccr ZCode"
  ].join("\n");
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${output}\n`);
  process.exitCode = exitCode;
}

function waitForChild(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve(code ?? (signal === "SIGINT" ? 130 : 1)));
    child.on("error", (error) => {
      process.stderr.write(`${formatError(error)}\n`);
      resolve(1);
    });
  });
}

function waitForImmediateSpawnError(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (message: string | undefined) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      child.off("error", onError);
      child.off("spawn", onSpawn);
      resolve(message);
    };
    const onError = (error: Error) => finish(formatError(error));
    const onSpawn = () => finish(undefined);
    child.once("error", onError);
    child.once("spawn", onSpawn);
    timer = setTimeout(() => finish(undefined), timeoutMs);
    timer.unref?.();
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  process.stderr.write(`${formatError(error)}\n`);
  process.exitCode = 1;
});
