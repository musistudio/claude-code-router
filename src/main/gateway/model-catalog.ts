import { existsSync, readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

const claudeCodeDefaultContextTokens = 200_000;
let modelCatalogIndex: ModelCatalogIndex | undefined;

export type ModelCatalogCapabilities = Record<string, unknown>;

type ModelCatalogLimits = {
  contextTokens?: number;
  inputTokens?: number;
  maxTokens?: number;
  outputTokens?: number;
  supports1MContext?: boolean;
};

type ModelCatalogModalities = {
  input?: string[];
  output?: string[];
};

export type ModelCatalogEntry = {
  aliases: string[];
  capabilities?: ModelCatalogCapabilities;
  displayName?: string;
  family?: string;
  id: string;
  limits?: ModelCatalogLimits;
  modalities?: ModelCatalogModalities;
  model?: string;
  providers?: string[];
};

type ModelCatalogIndex = {
  byKey: Map<string, ModelCatalogEntry>;
  byModelKey: Map<string, ModelCatalogEntry | undefined>;
  loadedFrom?: string;
};

export function findModelCatalogEntry(model: string): ModelCatalogEntry | undefined {
  const index = loadModelCatalogIndex();
  const candidates = modelCatalogLookupKeys(model);
  for (const key of candidates) {
    const entry = index.byKey.get(key);
    if (entry) {
      return entry;
    }
  }

  for (const key of candidates) {
    const modelKey = modelCatalogLastSegmentKey(key);
    if (!modelKey) {
      continue;
    }
    const entry = index.byModelKey.get(modelKey);
    if (entry) {
      return entry;
    }
  }

  return undefined;
}

export function modelCatalogMaxInputTokens(entry: ModelCatalogEntry | undefined): number {
  return Math.max(
    0,
    entry?.limits?.contextTokens ?? 0,
    entry?.limits?.inputTokens ?? 0
  );
}

export function claudeCodeEffectiveMaxInputTokens(entry: ModelCatalogEntry | undefined, oneMillionContext: boolean): number {
  const maxInputTokens = modelCatalogMaxInputTokens(entry);
  if (oneMillionContext) {
    return maxInputTokens || 1_000_000;
  }
  return maxInputTokens > 0 ? Math.min(maxInputTokens, claudeCodeDefaultContextTokens) : 0;
}

export function modelCatalogMaxOutputTokens(entry: ModelCatalogEntry | undefined): number {
  return Math.max(
    0,
    entry?.limits?.outputTokens ?? 0,
    entry?.limits?.maxTokens ?? 0
  );
}

export function readCatalogCapability(capabilities: ModelCatalogCapabilities, key: string): boolean {
  return capabilities[key] === true;
}

function loadModelCatalogIndex(): ModelCatalogIndex {
  if (modelCatalogIndex) {
    return modelCatalogIndex;
  }

  for (const candidate of modelCatalogPathCandidates()) {
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as unknown;
      modelCatalogIndex = buildModelCatalogIndex(parsed, candidate);
      return modelCatalogIndex;
    } catch (error) {
      console.warn(`Failed to load model catalog from ${candidate}:`, error);
    }
  }

  modelCatalogIndex = {
    byKey: new Map(),
    byModelKey: new Map()
  };
  return modelCatalogIndex;
}

function modelCatalogPathCandidates(): string[] {
  return uniqueStrings([
    process.env.CCR_MODEL_CATALOG_PATH?.trim() || "",
    process.env.CCR_MODELS_JSON_PATH?.trim() || "",
    pathResolve(process.cwd(), "models.json"),
    pathResolve(__dirname, "..", "models.json"),
    pathResolve(__dirname, "..", "assets", "models.json"),
    pathResolve(__dirname, "..", "..", "..", "models.json")
  ]);
}

function buildModelCatalogIndex(payload: unknown, loadedFrom: string): ModelCatalogIndex {
  const byKey = new Map<string, ModelCatalogEntry>();
  const byModelKey = new Map<string, ModelCatalogEntry | undefined>();
  const models = isRecord(payload) && Array.isArray(payload.models) ? payload.models : [];

  for (const item of models) {
    const entry = parseModelCatalogEntry(item);
    if (!entry) {
      continue;
    }

    for (const key of modelCatalogEntryKeys(entry)) {
      byKey.set(key, entry);
    }

    const shortKeys = uniqueStrings([
      entry.model ? normalizeModelCatalogToken(entry.model) : "",
      ...entry.aliases.map((alias) => modelCatalogLastSegmentKey(normalizeModelCatalogKey(alias)))
    ]);
    for (const key of shortKeys) {
      if (!key) {
        continue;
      }
      if (byModelKey.has(key) && byModelKey.get(key) !== entry) {
        byModelKey.set(key, undefined);
      } else {
        byModelKey.set(key, entry);
      }
    }
  }

  return { byKey, byModelKey, loadedFrom };
}

function parseModelCatalogEntry(value: unknown): ModelCatalogEntry | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = stringValue(value.id);
  if (!id) {
    return undefined;
  }
  const aliases = uniqueStrings([id, ...stringListValue(value.aliases)]);
  const limits = parseModelCatalogLimits(value.limits);
  const modalities = parseModelCatalogModalities(value.modalities);
  return {
    aliases,
    capabilities: isRecord(value.capabilities) ? value.capabilities : undefined,
    displayName: stringValue(value.displayName),
    family: stringValue(value.family),
    id,
    limits,
    modalities,
    model: stringValue(value.model),
    providers: stringListValue(value.providers)
  };
}

function parseModelCatalogLimits(value: unknown): ModelCatalogLimits | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const limits: ModelCatalogLimits = {
    contextTokens: readCatalogPositiveInteger(value.contextTokens),
    inputTokens: readCatalogPositiveInteger(value.inputTokens),
    maxTokens: readCatalogPositiveInteger(value.maxTokens),
    outputTokens: readCatalogPositiveInteger(value.outputTokens),
    supports1MContext: typeof value.supports1MContext === "boolean" ? value.supports1MContext : undefined
  };
  return Object.values(limits).some((item) => item !== undefined) ? limits : undefined;
}

function parseModelCatalogModalities(value: unknown): ModelCatalogModalities | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const modalities: ModelCatalogModalities = {
    input: stringListValue(value.input),
    output: stringListValue(value.output)
  };
  return (modalities.input?.length || modalities.output?.length) ? modalities : undefined;
}

function modelCatalogEntryKeys(entry: ModelCatalogEntry): string[] {
  return uniqueStrings([
    normalizeModelCatalogKey(entry.id),
    ...entry.aliases.map(normalizeModelCatalogKey),
    ...((entry.providers ?? []).map((provider) => entry.model ? normalizeModelCatalogKey(`${provider}/${entry.model}`) : ""))
  ]);
}

function modelCatalogLookupKeys(value: string): string[] {
  const raw = String(value || "").trim();
  const normalized = normalizeModelCatalogKey(raw);
  const withoutClaudePrefix = raw.toLowerCase().startsWith("claude-") && raw.includes("/")
    ? normalizeModelCatalogKey(raw.replace(/^claude-/i, ""))
    : "";
  return uniqueStrings([normalized, withoutClaudePrefix]);
}

function normalizeModelCatalogKey(value: string): string {
  return String(value || "")
    .trim()
    .split("/")
    .map(normalizeModelCatalogToken)
    .filter(Boolean)
    .join("/");
}

function normalizeModelCatalogToken(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^hf:/i, "")
    .replace(/^@/, "")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function modelCatalogLastSegmentKey(value: string): string {
  return value.split("/").filter(Boolean).at(-1) ?? "";
}

function readCatalogPositiveInteger(value: unknown): number | undefined {
  const parsed = numberValue(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const strings: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    strings.push(trimmed);
  }
  return strings;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringListValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => stringValue(item)).filter((item): item is string => Boolean(item)) : [];
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
