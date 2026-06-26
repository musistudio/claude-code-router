#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppConfig, ProfileOpenSurface } from "../shared/app";
import { botGatewayProfileEnv } from "./bot-gateway-env";
import { launchCodexAppProfile, launchZcodeAppProfile } from "./codex-app-launch";
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
  const config = readConfig(configFile);
  const profile = findProfileForOpen(config, options.profileRef);
  const surface = options.surface ?? (profile.agent === "zcode" || profile.surface === "app" ? "app" : "cli");
  const resolvedSurface = resolveProfileOpenSurface(profile, surface);
  if (profile.agent === "zcode" && options.agentArgs.length > 0) {
    throw new Error("ZCode profiles can only open the app; agent arguments are not supported.");
  }
  if ((profile.agent === "codex" || profile.agent === "zcode") && resolvedSurface === "app" && options.agentArgs.length === 0) {
    if (profile.agent === "zcode") {
      launchZcodeAppProfile(configDir, profile, config);
      process.stdout.write(`Opened ZCode App with ${profile.name || profile.id}.\n`);
    } else {
      launchCodexAppProfile(configDir, profile, config);
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
    stdio: "inherit",
    windowsVerbatimArguments: !!launch.windowsVerbatimArguments
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

function readConfig(file: string): AppConfig {
  if (!existsSync(file)) {
    throw new Error(`CCR config was not found: ${file}`);
  }
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<AppConfig>;
  if (!parsed.profile || !Array.isArray(parsed.profile.profiles)) {
    throw new Error(`CCR config has no profiles: ${file}`);
  }
  return {
    ...parsed,
    profile: {
      ...parsed.profile,
      profiles: parsed.profile.profiles
    } as AppConfig["profile"]
  } as AppConfig;
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

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  process.stderr.write(`${formatError(error)}\n`);
  process.exitCode = 1;
});
