import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AppConfig } from "@ccr/core/contracts/app";
import { compileCoreGatewayConfig } from "@ccr/core/gateway/core-runtime/config-compiler";
import { assertLoopbackCoreHost } from "@ccr/core/gateway/core-runtime/supervisor";
import {
  privateDirMode,
  privateFileMode,
  type BrowserWebSearchMcpIntegration
} from "@ccr/core/gateway/internal/shared";

export async function writeCoreGatewayConfig(
  config: AppConfig,
  rawTraceSyncToken: string,
  coreAuthToken: string,
  browserWebSearchMcpIntegration?: BrowserWebSearchMcpIntegration
): Promise<void> {
  assertLoopbackCoreHost(config.gateway.coreHost);
  mkdirSync(dirname(config.gateway.generatedConfigFile), {
    mode: privateDirMode,
    recursive: true
  });

  const payload = await compileCoreGatewayConfig(
    config,
    rawTraceSyncToken,
    coreAuthToken,
    browserWebSearchMcpIntegration
  );
  writePrivateTextFile(
    config.gateway.generatedConfigFile,
    `${JSON.stringify(payload, null, 2)}\n`
  );
}

function writePrivateTextFile(file: string, content: string): void {
  writeFileSync(file, content, { encoding: "utf8", mode: privateFileMode });
  if (process.platform !== "win32") {
    try {
      chmodSync(file, privateFileMode);
    } catch {
      // Best effort for filesystems that do not support chmod.
    }
  }
}
