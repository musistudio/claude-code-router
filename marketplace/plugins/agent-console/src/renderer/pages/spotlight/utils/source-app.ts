export type SpotlightSourceApp = {
  iconDataUrl?: string;
  name: string;
};

export function normalizeSpotlightSourceApp(payload: unknown): SpotlightSourceApp | null {
  if (!payload || typeof payload !== "object") return null;

  const sourceApp = payload as Partial<SpotlightSourceApp>;
  const name = typeof sourceApp.name === "string" ? sourceApp.name.trim() : "";
  if (!name) return null;

  const iconDataUrl = typeof sourceApp.iconDataUrl === "string" ? sourceApp.iconDataUrl : "";
  return {
    ...(iconDataUrl ? { iconDataUrl } : {}),
    name
  };
}
