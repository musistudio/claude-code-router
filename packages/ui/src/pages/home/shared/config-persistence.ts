import type { AppConfig } from "@ccr/core/contracts/app";

/** The commit belongs to the write, so the next request sees its saved state. */
export function createConfigSaveQueue() {
  let pending: Promise<unknown> = Promise.resolve();
  return {
    run<T>(write: () => Promise<T>, commit: (saved: T) => void): Promise<T> {
      const next = pending.catch(() => undefined).then(async () => {
        const saved = await write();
        commit(saved);
        return saved;
      });
      pending = next;
      return next;
    }
  };
}

export function configsEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Keep edits made since the request began, while accepting persisted changes. */
export function reconcileSavedConfig(base: AppConfig, draft: AppConfig, saved: AppConfig): AppConfig {
  const merged = mergeChanges(base, draft, saved) as AppConfig;
  return configsEqual(merged, saved) ? saved : merged;
}

function mergeChanges(base: unknown, draft: unknown, saved: unknown): unknown {
  if (configsEqual(base, draft)) return saved;
  if (isEntityList(base) && isEntityList(draft) && isEntityList(saved)) {
    return mergeEntityChanges(base, draft, saved);
  }
  if (!isRecord(base) || !isRecord(draft) || !isRecord(saved)) return draft;
  const result = { ...saved };
  for (const key of new Set([...Object.keys(base), ...Object.keys(draft)])) {
    if (configsEqual(base[key], draft[key])) continue;
    if (!(key in draft)) delete result[key];
    else result[key] = mergeChanges(base[key], draft[key], saved[key]);
  }
  return result;
}

type ConfigEntity = Record<string, unknown> & { id: string };

function isEntityList(value: unknown): value is ConfigEntity[] {
  return Array.isArray(value) && value.every((item) => isRecord(item) && typeof item.id === "string" && item.id.length > 0)
    && new Set(value.map((item) => item.id)).size === value.length;
}

function mergeEntityChanges(base: ConfigEntity[], draft: ConfigEntity[], saved: ConfigEntity[]): ConfigEntity[] {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const draftById = new Map(draft.map((item) => [item.id, item]));
  const result = new Map(saved.map((item) => [item.id, item]));
  for (const item of base) if (!draftById.has(item.id)) result.delete(item.id);
  for (const item of draft) {
    const previous = baseById.get(item.id);
    if (!configsEqual(previous, item)) {
      result.set(item.id, mergeChanges(previous, item, result.get(item.id)) as ConfigEntity);
    }
  }
  const previousOrder = base.filter((item) => draftById.has(item.id)).map((item) => item.id);
  const draftOrder = draft.filter((item) => baseById.has(item.id)).map((item) => item.id);
  if (configsEqual(previousOrder, draftOrder)) return [...result.values()];
  return [...draft.map((item) => result.get(item.id)).filter((item): item is ConfigEntity => Boolean(item)),
    ...[...result.values()].filter((item) => !draftById.has(item.id))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A key-only write must never discard unrelated, unsaved settings. */
export function mergeSavedApiKeys(config: AppConfig, saved: AppConfig): AppConfig {
  return { ...config, APIKEY: saved.APIKEY, APIKEYS: saved.APIKEYS };
}
