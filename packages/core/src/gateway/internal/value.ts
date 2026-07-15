/** Runtime-safe readers for untyped gateway and plugin payloads. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function rawStringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function stringListValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter((item): item is string => Boolean(item))
    : [];
}

export function numberValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : undefined;
}
