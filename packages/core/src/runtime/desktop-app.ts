export const CCR_DESKTOP_APP_ENV = "CCR_DESKTOP_APP";

export function markDesktopAppRuntime(): void {
  process.env[CCR_DESKTOP_APP_ENV] = "1";
}

export function isDesktopAppRuntime(): boolean {
  return process.env[CCR_DESKTOP_APP_ENV] === "1" && Boolean((process.versions as NodeJS.ProcessVersions & { electron?: string }).electron);
}
