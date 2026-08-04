import { existsSync, watch, type FSWatcher } from "node:fs";
import { dirname } from "node:path";

export interface LocalOauthCredentialWatchOptions {
  /** Credential files to observe (missing files fall back to watching their parent dir, which catches atomic rename writes). */
  files: string[];
  /** Returns the currently valid access token, or undefined when unreadable. */
  readAccessToken: () => string | undefined;
  /** Called once per actual token change (debounced, and only when the new token differs). */
  onAccessTokenChanged: () => void;
  debounceMs?: number;
  log?: (message: string) => void;
}

/**
 * Watches local agent OAuth credential files and fires when the access token
 * changes. Claude Code rotates `~/.claude/.credentials.json` on its own
 * refresh schedule; any provider whose auth was stamped from an older copy
 * (see withClaudeCodeOauthRuntimeDefaults) starts 401ing until recompiled.
 * The watcher lets the owning service refresh as soon as the rotation lands
 * instead of at the next manual restart.
 */
export function startLocalOauthCredentialWatch(
  options: LocalOauthCredentialWatchOptions
): () => void {
  const debounceMs = options.debounceMs ?? 1500;
  const log = options.log ?? (() => {});
  let currentToken = options.readAccessToken();
  let timer: NodeJS.Timeout | undefined;
  const watchers: FSWatcher[] = [];

  const scheduleCheck = (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      const nextToken = options.readAccessToken();
      if (!nextToken || nextToken === currentToken) {
        return;
      }
      currentToken = nextToken;
      log(`[local-oauth-watch] access token changed on disk`);
      options.onAccessTokenChanged();
    }, debounceMs);
    timer.unref?.();
  };

  const watchedTargets = new Set<string>();
  for (const file of options.files) {
    const target = existsSync(file) ? file : dirname(file);
    if (watchedTargets.has(target)) {
      continue;
    }
    try {
      const watcher = watch(target, { persistent: false }, () => scheduleCheck());
      watcher.on("error", () => {
        // Watched path disappeared between the existsSync check and watch(); ignore.
      });
      watchers.push(watcher);
      watchedTargets.add(target);
    } catch {
      // Parent dir may not exist either; nothing sensible to watch.
    }
  }

  if (watchedTargets.size > 0) {
    log(`[local-oauth-watch] watching ${watchedTargets.size} credential target(s)`);
  }

  return () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    for (const watcher of watchers) {
      watcher.close();
    }
    watchers.length = 0;
  };
}
