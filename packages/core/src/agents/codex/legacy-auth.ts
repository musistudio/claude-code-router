import { randomUUID } from "node:crypto";
import { chmodSync, lstatSync, readFileSync, realpathSync, renameSync } from "node:fs";
import path from "node:path";

/** Retire credentials copied by older CCR versions; never alter their original owner. */
export function quarantineLegacyCodexAuth(configDir: string, codexHome: string): string | undefined {
  const file = path.join(codexHome, "auth.json");
  let stat;
  try { stat = lstatSync(file); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  let auth: { auth_mode?: string; tokens?: { access_token?: string; refresh_token?: string } };
  try { auth = JSON.parse(readFileSync(file, "utf8")); } catch {
    throw new Error(`Cannot read Codex credentials at ${file}. Repair this profile's login before launching it.`);
  }
  if (auth?.auth_mode !== "chatgpt" && !auth?.tokens?.access_token && !auth?.tokens?.refresh_token) return undefined;
  const relative = path.relative(realpathSync(configDir), realpathSync(codexHome));
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`The isolated Codex profile contains a ChatGPT login outside its managed directory (${codexHome}). Choose a separate profile home or use the global shared-login scope.`);
  }
  const backup = `${file}.ccr-legacy-${randomUUID()}`;
  // Rename the profile entry itself, including a legacy link. Following a link
  // and rewriting its target would mutate the user's shared refresh chain.
  renameSync(file, backup);
  if (!stat.isSymbolicLink()) chmodSync(backup, 0o600);
  return backup;
}
