import { createHash } from "node:crypto";
import type { AppConfig } from "@ccr/core/contracts/app";

export const gatewayRuntimeConfigControlPath = "/__ccr/runtime/config";

export function gatewayRuntimeConfigRevision(config: AppConfig | undefined): string | undefined {
  if (!config) {
    return undefined;
  }
  return createHash("sha256")
    .update(stableJson(config))
    .digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
