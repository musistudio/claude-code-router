import type { MorphRouterConfig, MorphRouterModelConfig, MorphRouterPolicy } from "../../../../shared/app";

export const MORPH_ROUTER_POLICY_OPTIONS: Array<{ label: string; value: MorphRouterPolicy }> = [
  { label: "Balanced", value: "balanced" },
  { label: "Cost efficient", value: "cost_efficient" },
  { label: "Capability heavy", value: "capability_heavy" },
  { label: "Domain skills", value: "domain_skills" }
];

// A row keeps every configured target so editing one mapping never silently
// drops the fallback targets of another (multi-target chains are config-first
// but must survive a round-trip through the UI).
export type MorphRouterModelRow = { name: string; route: string; fallbackRoutes: string[] };

export function readMorphRouterModelRows(models: MorphRouterConfig["models"]): MorphRouterModelRow[] {
  const toRow = (name: string, entry: string | MorphRouterModelConfig | undefined): MorphRouterModelRow => {
    const [route = "", ...fallbackRoutes] = allMorphRouterRoutes(entry);
    return { name, route, fallbackRoutes };
  };
  if (Array.isArray(models)) {
    return models.map((entry) => toRow(entry?.name ?? "", entry));
  }
  if (models && typeof models === "object") {
    return Object.entries(models).map(([name, entry]) => toRow(name, entry));
  }
  return [];
}

export function allMorphRouterRoutes(entry: string | MorphRouterModelConfig | undefined): string[] {
  if (!entry) {
    return [];
  }
  if (typeof entry === "string") {
    return [entry];
  }
  if (typeof entry.route === "string") {
    return [entry.route];
  }
  const list = entry.targets ?? entry.routes ?? [];
  return list.map((target) => (typeof target === "string" ? target : target?.route ?? "")).filter(Boolean);
}

// Serialize rows back to config, collapsing single-target rows to a plain route
// string and preserving multi-target rows as a `targets` array.
export function morphRowsToModels(rows: MorphRouterModelRow[]): Record<string, string | MorphRouterModelConfig> {
  const models: Record<string, string | MorphRouterModelConfig> = {};
  for (const row of rows) {
    const name = row.name.trim();
    const route = row.route.trim();
    if (!name || !route) {
      continue;
    }
    const fallbackRoutes = row.fallbackRoutes.map((value) => value.trim()).filter(Boolean);
    models[name] = fallbackRoutes.length > 0 ? { targets: [route, ...fallbackRoutes] } : route;
  }
  return models;
}
