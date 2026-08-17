import { spawn, type ChildProcessByStdio } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import type { Readable } from "node:stream";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "..", "..");
const cliPath = path.join(projectRoot, "packages", "cli", "dist", "main", "cli.js");
const host = "127.0.0.1";
const startupTimeoutMs = 10_000;
const shutdownTimeoutMs = 5_000;

export type CliWebChild = ChildProcessByStdio<null, Readable, Readable>;

export type CliWebRuntime = {
  baseUrl: string;
  child: CliWebChild;
  testHome: string;
  token: string;
};

export async function startCliWebServer(authToken: string): Promise<CliWebRuntime> {
  const port = await findAvailablePort();
  const testHome = mkdtempSync(path.join(os.tmpdir(), "ccr-playwright-home-"));
  const child = spawn(process.execPath, [
    cliPath,
    "serve",
    "--no-gateway",
    "--host",
    host,
    "--port",
    String(port),
    "--no-open"
  ], {
    cwd: projectRoot,
    env: {
      ...process.env,
      CCR_INTERNAL_APP_DATA_DIR: path.join(testHome, "app-data"),
      CCR_INTERNAL_HOME_DIR: testHome,
      CCR_INTERNAL_USER_DATA_DIR: path.join(testHome, "user-data"),
      CCR_WEB_AUTH_TOKEN: authToken,
      HOME: testHome
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const service = await new Promise<{ baseUrl: string; token: string }>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`CCR web service did not start within ${startupTimeoutMs}ms.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, startupTimeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off("data", onStdout);
      child.off("exit", onExit);
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(new Error(`CCR web service exited during startup code=${code ?? "null"} signal=${signal ?? "null"}.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    };
    const onStdout = () => {
      const match = stdout.match(/CCR web management is running at (http:\/\/[^\s]+)/);
      if (!match) {
        return;
      }
      cleanup();
      const url = new URL(match[1]);
      resolve({
        baseUrl: `${url.protocol}//${url.host}`,
        token: url.searchParams.get("ccr_web_token") ?? ""
      });
    };

    child.on("exit", onExit);
    child.stdout.on("data", onStdout);
  });

  if (!service.token) {
    await stopCliWebServer(child);
    rmSync(testHome, { force: true, recursive: true });
    throw new Error("CCR web service started without a web auth token.");
  }

  return {
    ...service,
    child,
    testHome
  };
}

export async function stopCliWebServer(child: CliWebChild): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  child.kill("SIGINT");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, shutdownTimeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function disposeCliWebRuntime(runtime: CliWebRuntime): Promise<void> {
  await stopCliWebServer(runtime.child);
  rmSync(runtime.testHome, { force: true, recursive: true });
}

async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close(() => {
        if (!port) {
          reject(new Error("Failed to allocate a local test port."));
          return;
        }
        resolve(port);
      });
    });
  });
}
