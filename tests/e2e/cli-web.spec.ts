import { expect, test, type APIRequestContext } from "@playwright/test";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import type { Readable } from "node:stream";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "..", "..");
const cliPath = path.join(projectRoot, "packages", "cli", "dist", "main", "cli.js");
const host = "127.0.0.1";
const cliWebAuthToken = "playwright-cli-web-auth-token";
const startupTimeoutMs = 10_000;
const shutdownTimeoutMs = 5_000;

type CliWebRuntime = {
  baseUrl: string;
  child: CliWebChild;
  testHome: string;
  token: string;
};

type CliWebChild = ChildProcessByStdio<null, Readable, Readable>;

let runtime: CliWebRuntime | undefined;

test.beforeAll(async () => {
  runtime = await startCliWebServer();
});

test.afterAll(async () => {
  if (!runtime) {
    return;
  }
  await stopCliWebServer(runtime.child);
  rmSync(runtime.testHome, { force: true, recursive: true });
  runtime = undefined;
});

test("uses CCR_WEB_AUTH_TOKEN for CLI web authentication", async () => {
  const current = requireRuntime();
  expect(current.token).toBe(cliWebAuthToken);
});

test("serves the management UI in a browser", async ({ page }) => {
  const current = requireRuntime();
  await page.goto(`${current.baseUrl}/?ccr_web_token=${current.token}`);
  await expect(page).toHaveTitle("Claude Code Router");
  await expect(page.locator("#root")).toBeAttached();
  await expect(page.locator("body")).toContainText(/Configure provider|Connect agent|Let's start/, { timeout: 15_000 });
  await expect(page.evaluate(() => Boolean(window.ccr?.getAppInfo))).resolves.toBe(true);
  await expect(page.evaluate(async () => {
    const presets = await window.ccr?.getProviderPresets?.();
    return presets?.map((preset) => preset.id) ?? [];
  })).resolves.toContain("openai");

  await page.getByRole("button", { name: /Select preset provider|选择 预设供应商/ }).first().click();
  await expect(page.getByRole("option", { name: "OpenAI" })).toBeVisible();
});

test("serves static assets used by the web UI", async ({ request }) => {
  const current = requireRuntime();
  await expectStaticAsset(request, current.baseUrl, "/assets/main.js", "text/javascript");
  await expectStaticAsset(request, current.baseUrl, "/assets/main.css", "text/css");
  await expectStaticAsset(request, current.baseUrl, "/assets/web-client-bridge.js", "text/javascript");
});

test("handles authenticated web RPC requests", async ({ request }) => {
  const current = requireRuntime();
  const response = await request.post(`${current.baseUrl}/api/ccr/rpc`, {
    data: { args: [], method: "getAppInfo" },
    headers: {
      "x-ccr-web-auth": current.token
    }
  });
  const payload = await response.json();

  expect(response.status()).toBe(200);
  expect(payload.ok).toBe(true);
  expect(payload.value.name).toBe("Claude Code Router");
  expect(payload.value.configDir).toContain(current.testHome);
  expect(payload.value.appConfigDbFile).toContain("config.sqlite");
  expect(payload.value.usageDbFile).toContain("usage.sqlite");
});

test("rejects RPC requests without the web auth token", async ({ request }) => {
  const current = requireRuntime();
  const response = await request.post(`${current.baseUrl}/api/ccr/rpc`, {
    data: { args: [], method: "getAppInfo" }
  });
  const payload = await response.json();

  expect(response.status()).toBe(401);
  expect(payload.ok).toBe(false);
});

async function expectStaticAsset(
  request: APIRequestContext,
  baseUrl: string,
  pathname: string,
  expectedContentType: string
) {
  const response = await request.head(`${baseUrl}${pathname}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain(expectedContentType);
  expect(Number(response.headers()["content-length"] ?? "0")).toBeGreaterThan(0);
}

async function startCliWebServer(): Promise<CliWebRuntime> {
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
      CCR_WEB_AUTH_TOKEN: cliWebAuthToken,
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

async function stopCliWebServer(child: CliWebChild): Promise<void> {
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

function requireRuntime(): CliWebRuntime {
  if (!runtime) {
    throw new Error("CLI web runtime was not started.");
  }
  return runtime;
}
