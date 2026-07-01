export function parseNoProxy(noProxy: string | undefined): string[] {
  if (!noProxy) return [];
  return noProxy
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
