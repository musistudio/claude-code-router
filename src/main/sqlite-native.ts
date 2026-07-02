import { createRequire } from "node:module";
import DatabaseConstructor, { type Database as BetterSqliteDatabase } from "better-sqlite3";

export type {
  Database as BetterSqliteDatabase,
  Statement as BetterSqliteStatement
} from "better-sqlite3";

const requireFromHere = createRequire(__filename);
let resolvedNativeBinding: string | undefined;
let nativeBindingResolved = false;

export function createBetterSqliteDatabase(filename: string): BetterSqliteDatabase {
  const nativeBinding = resolveBetterSqliteNativeBinding();
  return nativeBinding
    ? new DatabaseConstructor(filename, { nativeBinding })
    : new DatabaseConstructor(filename);
}

function resolveBetterSqliteNativeBinding(): string | undefined {
  if (nativeBindingResolved) {
    return resolvedNativeBinding;
  }
  nativeBindingResolved = true;
  const suffix = process.versions.electron ? "_electron" : "_node";
  try {
    resolvedNativeBinding = requireFromHere.resolve(`better-sqlite3/build/Release/better_sqlite3${suffix}.node`);
  } catch {
    try {
      resolvedNativeBinding = requireFromHere.resolve("better-sqlite3/build/Release/better_sqlite3.node");
    } catch {
      resolvedNativeBinding = undefined;
    }
  }
  return resolvedNativeBinding;
}
