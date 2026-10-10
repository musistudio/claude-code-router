import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// A macOS app opened from Finder, the Dock or launchd inherits PATH=/usr/bin:/bin:/usr/sbin:/sbin,
// not the user's shell PATH. Every child the desktop app starts (the gateway, plugins, agent CLIs)
// inherits that, so `#!/usr/bin/env node` scripts and Homebrew/nvm tools exit 127 there while the
// same command works in a terminal.

const loginShellPathMarker = "__CCR_LOGIN_SHELL_PATH__";
const loginShellTimeoutMs = 3000;

export type UserPathOptions = {
  env?: NodeJS.ProcessEnv;
  exists?: (directory: string) => boolean;
  home?: string;
  platform?: NodeJS.Platform;
  readLoginShellPath?: (shell: string) => string | undefined;
};

export function installDesktopUserPath(options: UserPathOptions = {}): void {
  const env = options.env ?? process.env;
  const resolved = resolveDesktopUserPath(options);
  if (resolved !== undefined) {
    env.PATH = resolved;
  }
}

export function resolveDesktopUserPath(options: UserPathOptions = {}): string | undefined {
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin") {
    return undefined;
  }
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const home = options.home ?? os.homedir();
  const current = splitPath(env.PATH);

  // A terminal launch already carries the shell PATH; only GUI launches need the login shell.
  const shell = env.SHELL?.trim();
  const loginShellPath = shell && !env.TERM ? (options.readLoginShellPath ?? readLoginShellPath)(shell) : undefined;

  const wellKnown = [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    path.join(home, ".local", "bin"),
    path.join(home, ".volta", "bin"),
    path.join(home, ".bun", "bin")
  ].filter((directory) => exists(directory));

  const merged = uniquePath([...splitPath(loginShellPath), ...current, ...wellKnown]);
  return merged.join(path.delimiter);
}

function readLoginShellPath(shell: string): string | undefined {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(shell, ["-ilc", `printf '%s%s%s' '${loginShellPathMarker}' "$PATH" '${loginShellPathMarker}'`], {
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "ignore"],
    timeout: loginShellTimeoutMs,
    windowsHide: true
  });
  if (result.error || typeof result.stdout !== "string") {
    return undefined;
  }
  // Interactive rc files may print banners; keep only the marked value.
  const [, value] = result.stdout.split(loginShellPathMarker);
  return value?.trim() || undefined;
}

function splitPath(value: string | undefined): string[] {
  return (value ?? "").split(path.delimiter).map((entry) => entry.trim()).filter(Boolean);
}

function uniquePath(entries: string[]): string[] {
  return [...new Set(entries)];
}
