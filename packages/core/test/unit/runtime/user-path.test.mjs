import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { installDesktopUserPath, resolveDesktopUserPath } from "@ccr/core/runtime/user-path.ts";

const finderPath = "/usr/bin:/bin:/usr/sbin:/sbin";

test("macOS GUI launch prepends the login shell PATH and keeps the inherited entries", () => {
  const shells = [];
  const resolved = resolveDesktopUserPath({
    env: { PATH: finderPath, SHELL: "/bin/zsh" },
    exists: () => false,
    home: "/Users/me",
    platform: "darwin",
    readLoginShellPath: (shell) => {
      shells.push(shell);
      return "/Users/me/.nvm/versions/node/v22.0.0/bin:/opt/homebrew/bin:/usr/bin:/bin";
    }
  });

  assert.deepEqual(shells, ["/bin/zsh"]);
  assert.equal(resolved, "/Users/me/.nvm/versions/node/v22.0.0/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin");
});

test("macOS falls back to existing well-known bin directories when the login shell gives nothing", () => {
  const present = new Set(["/opt/homebrew/bin", "/Users/me/.local/bin"]);
  const resolved = resolveDesktopUserPath({
    env: { PATH: finderPath, SHELL: "/bin/zsh" },
    exists: (directory) => present.has(directory),
    home: "/Users/me",
    platform: "darwin",
    readLoginShellPath: () => undefined
  });

  assert.equal(resolved, `${finderPath}:/opt/homebrew/bin:/Users/me/.local/bin`);
});

test("terminal launches skip the login shell", () => {
  const resolved = resolveDesktopUserPath({
    env: { PATH: `/opt/homebrew/bin:${finderPath}`, SHELL: "/bin/zsh", TERM: "xterm-256color" },
    exists: (directory) => directory === "/opt/homebrew/bin",
    home: "/Users/me",
    platform: "darwin",
    readLoginShellPath: () => assert.fail("login shell must not run for terminal launches")
  });

  assert.equal(resolved, `/opt/homebrew/bin:${finderPath}`);
});

test("non-macOS platforms keep PATH untouched", () => {
  const env = { PATH: finderPath, SHELL: "/bin/bash" };
  installDesktopUserPath({ env, platform: "linux", readLoginShellPath: () => "/elsewhere" });
  assert.equal(env.PATH, finderPath);
});

test("login shell PATH is read past rc-file banners", { skip: process.platform === "win32" || !existsSync("/bin/sh") }, () => {
  const env = { PATH: finderPath, SHELL: "/bin/sh" };
  installDesktopUserPath({ env, exists: () => false, home: "/nonexistent", platform: "darwin" });

  const entries = env.PATH.split(":");
  assert.ok(entries.length > 0);
  assert.ok(entries.every((entry) => entry.startsWith("/")), env.PATH);
  for (const entry of finderPath.split(":")) {
    assert.ok(entries.includes(entry), `${entry} must stay on PATH`);
  }
});
