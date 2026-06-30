import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

export function copyMissingDirectoryContents(source: string, target: string, label: string): void {
  if (!source || !target || sameFilesystemPath(source, target) || !existsSync(source)) {
    return;
  }

  try {
    mkdirSync(target, { recursive: true });
    cpSync(source, target, { errorOnExist: false, force: false, recursive: true });
  } catch (error) {
    console.warn(`Failed to migrate ${label} from ${source} to ${target}: ${formatError(error)}`);
  }
}

export function sameFilesystemPath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
