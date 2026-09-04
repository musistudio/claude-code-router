import path from "node:path";
import { pathToFileURL } from "node:url";

const BOT_GATEWAY_SDK_PACKAGE = "@the-next-ai/bot-gateway-sdk";

export function botGatewaySdkImportSpecifier(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return BOT_GATEWAY_SDK_PACKAGE;
  }
  if (path.isAbsolute(trimmed)) {
    return pathToFileURL(trimmed).href;
  }
  if (path.win32.isAbsolute(trimmed)) {
    return pathToFileURL(trimmed, { windows: true }).href;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}
