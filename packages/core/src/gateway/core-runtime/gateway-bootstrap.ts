import { createRequire } from "node:module";
import path from "node:path";

type GatewayStartMessage = {
  config: Record<string, unknown>;
  gatewayEntry: string;
  protocolVersion: 1;
  type: "gateway:start";
};

type MutableFs = {
  existsSync: (file: unknown) => boolean;
  readFileSync: (file: unknown, options?: unknown) => unknown;
  renameSync: (oldPath: unknown, newPath: unknown) => void;
  writeFileSync: (file: unknown, data: unknown, options?: unknown) => void;
};

const requireFromHere = createRequire(__filename);
const virtualConfigPath = path.resolve(process.cwd(), `.ccr-gateway-config-${process.pid}`);
let started = false;

process.once("disconnect", () => {
  process.exit(0);
});

process.on("message", (message: unknown) => {
  if (started) {
    return;
  }
  try {
    const start = parseStartMessage(message);
    started = true;
    installVirtualConfigFile(start.config);
    process.env.GATEWAY_CONFIG_PATH = virtualConfigPath;
    requireFromHere(start.gatewayEntry);
    process.send?.({ protocolVersion: 1, type: "gateway:config-accepted" });
  } catch (error) {
    console.error(`[gateway-bootstrap] ${formatError(error)}`);
    process.exit(1);
  }
});

function installVirtualConfigFile(config: Record<string, unknown>): void {
  const fs = requireFromHere("node:fs") as MutableFs;
  const content = `${JSON.stringify(config)}\n`;
  const originalExistsSync = fs.existsSync.bind(fs);
  const originalReadFileSync = fs.readFileSync.bind(fs);
  const originalRenameSync = fs.renameSync.bind(fs);
  const originalWriteFileSync = fs.writeFileSync.bind(fs);

  fs.existsSync = (file) => isVirtualConfigPath(file) || originalExistsSync(file);
  fs.readFileSync = (file, options) => {
    if (!isVirtualConfigPath(file)) {
      return originalReadFileSync(file, options);
    }
    return readsText(options) ? content : Buffer.from(content, "utf8");
  };
  fs.writeFileSync = (file, data, options) => {
    if (isManagedConfigPath(file)) {
      throw new Error("Gateway configuration is managed by Claude Code Router.");
    }
    originalWriteFileSync(file, data, options);
  };
  fs.renameSync = (oldPath, newPath) => {
    if (isManagedConfigPath(oldPath) || isManagedConfigPath(newPath)) {
      throw new Error("Gateway configuration is managed by Claude Code Router.");
    }
    originalRenameSync(oldPath, newPath);
  };
}

function parseStartMessage(value: unknown): GatewayStartMessage {
  if (!isObject(value) || value.type !== "gateway:start" || value.protocolVersion !== 1) {
    throw new Error("Invalid gateway start message.");
  }
  if (!isObject(value.config)) {
    throw new Error("Gateway start message does not include a configuration object.");
  }
  if (typeof value.gatewayEntry !== "string" || !value.gatewayEntry.trim()) {
    throw new Error("Gateway start message does not include a runtime entry.");
  }
  return {
    config: value.config,
    gatewayEntry: path.resolve(value.gatewayEntry),
    protocolVersion: 1,
    type: "gateway:start"
  };
}

function readsText(options: unknown): boolean {
  if (typeof options === "string") {
    return Boolean(options);
  }
  return isObject(options) && typeof options.encoding === "string" && Boolean(options.encoding);
}

function isVirtualConfigPath(value: unknown): boolean {
  return typeof value === "string" && path.resolve(value) === virtualConfigPath;
}

function isManagedConfigPath(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const resolved = path.resolve(value);
  return resolved === virtualConfigPath || resolved.startsWith(`${virtualConfigPath}.`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack || error.message : String(error);
}
