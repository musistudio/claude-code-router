#!/usr/bin/env node
import { installSocketTypeOfServiceCompat } from "@ccr/core/platform/socket-compat";
import { startWebManagementServer } from "@ccr/core/web/management-server";

installSocketTypeOfServiceCompat();

type CoreServerOptions = {
  help: boolean;
  host?: string;
  open: boolean;
  port?: number;
  startGateway: boolean;
};

export async function runCoreServer(args = process.argv.slice(2)): Promise<void> {
  const options = parseCoreServerArgs(args);
  if (options.help) {
    printHelp();
    return;
  }

  const runtime = await startWebManagementServer({
    host: options.host,
    open: options.open,
    port: options.port,
    startGateway: options.startGateway
  });
  process.stdout.write(`CCR core server is running at ${runtime.url}\n`);

  let closing = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (closing) {
      return;
    }
    closing = true;
    void runtime.close().finally(() => {
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await new Promise(() => undefined);
}

function parseCoreServerArgs(args: string[]): CoreServerOptions {
  const options: CoreServerOptions = {
    help: false,
    open: false,
    startGateway: true
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--open") {
      options.open = true;
      continue;
    }
    if (arg === "--no-open") {
      options.open = false;
      continue;
    }
    if (arg === "--gateway") {
      options.startGateway = true;
      continue;
    }
    if (arg === "--no-gateway") {
      options.startGateway = false;
      continue;
    }
    if (arg === "--host") {
      index += 1;
      options.host = requiredArg(args[index], "--host");
      continue;
    }
    if (arg.startsWith("--host=")) {
      options.host = requiredArg(arg.slice("--host=".length), "--host");
      continue;
    }
    if (arg === "--port") {
      index += 1;
      options.port = parsePort(requiredArg(args[index], "--port"));
      continue;
    }
    if (arg.startsWith("--port=")) {
      options.port = parsePort(requiredArg(arg.slice("--port=".length), "--port"));
      continue;
    }
    throw new Error(`Unknown core server option: ${arg}`);
  }

  return options;
}

function printHelp(): void {
  process.stdout.write([
    "Usage:",
    "  ccr-core-server [--host <host>] [--port <port>] [--no-gateway]",
    "",
    "Options:",
    "  --host <host>    Management server host. Defaults to CCR_WEB_HOST or 127.0.0.1.",
    "  --port <port>    Management server port. Defaults to CCR_WEB_PORT or 3458.",
    "  --no-gateway     Start only the web management server.",
    "",
    "Environment:",
    "  CCR_WEB_AUTH_TOKEN  Use this token for management UI and RPC authentication."
  ].join("\n") + "\n");
}

function requiredArg(value: string | undefined, flag: string): string {
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

runCoreServer().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
