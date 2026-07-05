const chinaTimeZones = new Set([
  "asia/chongqing",
  "asia/chungking",
  "asia/harbin",
  "asia/kashgar",
  "asia/shanghai",
  "asia/urumqi",
  "china standard time",
  "prc"
]);

export function claudeCodeUtcTimezoneEnvOverride(timeZone = currentTimeZone()): Record<string, string> {
  return isChinaTimeZone(timeZone) ? { TZ: "UTC" } : {};
}

export function currentTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function isChinaTimeZone(timeZone: string | undefined): boolean {
  const normalized = timeZone?.trim().toLowerCase();
  return Boolean(normalized && chinaTimeZones.has(normalized));
}
