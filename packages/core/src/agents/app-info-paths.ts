import type { AppInfo } from "@ccr/core/contracts/app";
import { findInstalledCodexAppExecutable, findInstalledWorkbuddyAppExecutable } from "@ccr/core/agents/codex/app-launch";
import { findInstalledOpenCodeAppExecutable } from "@ccr/core/agents/opencode/app-launch";

type AppPaths = Pick<AppInfo, "chatgptAppPath" | "opencodeAppPath" | "workbuddyAppPath">;

export function createAppInfoPathReader(load: () => AppPaths, now: () => number = Date.now): () => AppPaths {
  let cached: AppPaths | undefined;
  let expiresAt = 0;
  return () => {
    if (!cached || now() >= expiresAt) {
      cached = load();
      expiresAt = now() + 30_000;
    }
    return { ...cached };
  };
}

// Launchers still discover afresh; only the informational RPC uses this cache.
export const getAppInfoPaths = createAppInfoPathReader(() => ({
  chatgptAppPath: findInstalledCodexAppExecutable().executable,
  opencodeAppPath: findInstalledOpenCodeAppExecutable().executable,
  workbuddyAppPath: findInstalledWorkbuddyAppExecutable().executable
}));
