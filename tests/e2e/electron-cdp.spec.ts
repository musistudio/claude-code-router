import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import electronModule from "electron";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";

const projectRoot = path.resolve(__dirname, "..", "..");
const host = "127.0.0.1";
const startupTimeoutMs = 30_000;
const shutdownTimeoutMs = 10_000;
const hookTimeoutMs = (startupTimeoutMs * 3) + shutdownTimeoutMs + 20_000;
const electronExecutable = electronModule as unknown as string;

type ElectronCdpRuntime = {
  browser: Browser;
  cdpUrl: string;
  child: ElectronChild;
  gatewayPort: number;
  mainPage: Page;
  output: ProcessOutput;
  testHome: string;
};

type ElectronChild = ChildProcessByStdio<null, Readable, Readable>;
type ProcessOutput = {
  stderr: string;
  stdout: string;
};

let runtime: ElectronCdpRuntime | undefined;

test.skip(
  process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY,
  "Electron CDP E2E requires a desktop session on Linux."
);

test.beforeAll(async () => {
  test.setTimeout(hookTimeoutMs);
  runtime = await startElectronOverCdp();
});

test.afterAll(async () => {
  test.setTimeout(shutdownTimeoutMs + 5_000);
  const current = runtime;
  runtime = undefined;
  if (!current) {
    return;
  }

  try {
    await stopElectronOverCdp(current);
  } finally {
    removeElectronTestHome(current.testHome);
  }
});

test("exposes the desktop renderer through CDP", async () => {
  const current = requireRuntime();
  expect(current.cdpUrl).toBe(`http://${host}:${new URL(current.cdpUrl).port}`);
  expect(current.mainPage.url()).toContain("/pages/home/index.html");
  await expect(current.mainPage).toHaveTitle("Claude Code Router");
});

test("loads the Electron preload bridge and IPC contract", async () => {
  const current = requireRuntime();
  const page = current.mainPage;

  await page.waitForFunction(() => {
    return Boolean(window.ccr?.getAppInfo && document.querySelector("#root")?.childElementCount);
  });

  const appInfo = await page.evaluate(async () => window.ccr?.getAppInfo());
  expect(appInfo?.desktop).toBe(true);
  expect(appInfo?.name).toBe("Claude Code Router");
  expect(appInfo?.configDir).toContain(current.testHome);
  expect(appInfo?.configDbFile).toContain("config.sqlite");

  const config = await page.evaluate(async () => window.ccr?.getConfig());
  expect(config?.gateway.enabled).toBe(false);
  expect(config?.gateway.port).toBe(current.gatewayPort);
  expect(config?.routerEndpoint).toBe(`http://${host}:${current.gatewayPort}`);
  expect(config?.APIKEYS.some((item) => item.key === "sk-electron-cdp-legacy")).toBe(true);

  const gatewayStatus = await page.evaluate(async () => window.ccr?.getGatewayStatus());
  expect(gatewayStatus?.state).toBe("stopped");

  const configDir = path.join(current.testHome, ".claude-code-router");
  const configDbFile = path.join(configDir, "config.sqlite");
  expect(existsSync(configDbFile)).toBe(true);
  expect(existsSync(path.join(configDir, "config.json"))).toBe(false);
  expect(existsSync(path.join(current.testHome, "user-data", "api-keys.sqlite"))).toBe(false);

  const tables = readSqliteRows<{ name: string }>(
    configDbFile,
    "SELECT name FROM sqlite_master WHERE type = 'table'"
  );
  expect(tables.map((item) => item.name)).toEqual(expect.arrayContaining([
    "api_keys",
    "app_config",
    "config_schema_migrations",
    "legacy_storage_backups",
    "runtime_state"
  ]));
});

test("starts the managed gateway from IPC without runtime config JSON", async () => {
  const current = requireRuntime();
  const status = await current.mainPage.evaluate(async () => {
    const config = await window.ccr?.getConfig();
    if (!config) {
      throw new Error("Config bridge is unavailable.");
    }
    config.Providers = [{
      api_base_url: "http://127.0.0.1:9/v1",
      api_key: "e2e-provider-key",
      id: "electron-cdp-provider",
      models: ["electron-cdp-model"],
      name: "Electron CDP Provider",
      type: "openai_chat_completions"
    }];
    config.preferredProvider = "Electron CDP Provider";
    config.gateway.enabled = true;
    await window.ccr?.saveConfig(config, { applyProfile: false });
    return window.ccr?.getGatewayStatus();
  });

  expect(status?.state).toBe("running");
  const configDir = path.join(current.testHome, ".claude-code-router");
  expect(existsSync(path.join(configDir, "gateway.config.json"))).toBe(false);
  expect(existsSync(path.join(configDir, "gateway-runtime.json"))).toBe(false);

  const runtimeMarker = readGatewayRuntimeMarker(path.join(configDir, "config.sqlite"));
  expect(runtimeMarker).toMatchObject({
    pid: expect.any(Number),
    runtimeId: expect.any(String)
  });

  await current.mainPage.evaluate(() => window.ccr?.stopGateway());

  expect(readGatewayRuntimeMarker(path.join(configDir, "config.sqlite"))).toBeUndefined();
});

test("applies Workbuddy profiles through the desktop bridge", async () => {
  const current = requireRuntime();
  const profileId = "workbuddy-e2e";
  const result = await current.mainPage.evaluate(async (input) => {
    const config = await window.ccr?.getConfig();
    if (!config) {
      throw new Error("Config bridge is unavailable.");
    }
    config.APIKEYS = [];
    config.Providers = [{
      api_base_url: "http://127.0.0.1:9/v1",
      api_key: "e2e-provider-key",
      id: "workbuddy-e2e-provider",
      models: ["gpt-5-codex"],
      name: "Workbuddy E2E Provider",
      type: "openai_responses"
    }];
    config.preferredProvider = "Workbuddy E2E Provider";
    config.gateway.enabled = false;
    config.profile = {
      ...config.profile,
      enabled: true,
      profiles: [{
        agent: "workbuddy",
        cliMiddleware: true,
        codexCliPath: "",
        codexHome: "",
        configFile: "~/.workbuddy/config.toml",
        configFormat: "separate_profile_files",
        enabled: true,
        env: {},
        id: input.profileId,
        managedCompact: false,
        model: "Workbuddy E2E Provider/gpt-5-codex",
        name: "Workbuddy E2E",
        providerId: "claude-code-router",
        providerName: "Claude Code Router",
        showAllSessions: true,
        scope: "ccr",
        surface: "app"
      }]
    };

    const saved = await window.ccr?.saveConfig(config, { applyProfile: false });
    const applyResult = await window.ccr?.applyProfile();
    return { applyResult, saved };
  }, { profileId });

  expect(result.saved?.profile.profiles).toHaveLength(1);
  expect(result.saved?.profile.profiles[0]?.agent).toBe("workbuddy");
  expect(result.saved?.profile.profiles[0]?.showAllSessions).toBe(false);
  expect(result.saved?.profile.profiles[0]?.surface).toBe("app");

  const workbuddyStatus = result.applyResult?.clients.find((client) => client.client === "workbuddy");
  expect(workbuddyStatus?.ok, workbuddyStatus?.message).toBe(true);

  const configDir = path.join(current.testHome, ".claude-code-router");
  const profileHome = path.join(configDir, "profiles", profileId, "workbuddy");
  const configFile = path.join(profileHome, "config.toml");
  const launcherFile = path.join(
    configDir,
    "bin",
    process.platform === "win32"
      ? `ccr-codex-cli-stdio-${profileId}.cmd`
      : `ccr-codex-cli-stdio-${profileId}`
  );
  expect(workbuddyStatus?.path).toBe(configFile);

  const toml = readFileSync(configFile, "utf8");
  expect(toml).toContain('model_provider = "claude-code-router"');
  expect(toml).toContain('model = "Workbuddy E2E Provider/gpt-5-codex"');
  expect(toml).toContain(`model_catalog_json = "${path.join(profileHome, "ccr-model-catalog.json")}"`);
  expect(toml).toContain(`base_url = "http://${host}:${current.gatewayPort}/v1"`);
  expect(toml).toContain('wire_api = "responses"');
  expect(toml).not.toContain("show_all_sessions = true");

  const workbuddyModelsFile = path.join(profileHome, "models.json");
  expect(existsSync(workbuddyModelsFile)).toBe(true);
  const workbuddyModels = JSON.parse(readFileSync(workbuddyModelsFile, "utf8"));
  expect(workbuddyModels.availableModels).toEqual(["Workbuddy E2E Provider/gpt-5-codex"]);
  expect(workbuddyModels.models).toHaveLength(1);
  expect(workbuddyModels.models[0]).toMatchObject({
    apiKey: "${CCR_PROFILE_API_KEY}",
    id: "Workbuddy E2E Provider/gpt-5-codex",
    supportsToolCall: true,
    tags: ["chat", "custom"],
    url: `http://${host}:${current.gatewayPort}/v1`,
    vendor: "Workbuddy E2E Provider"
  });

  const launcher = readFileSync(launcherFile, "utf8");
  expect(launcher).toContain(profileHome);
  expect(launcher).toContain("WORKBUDDY_HOME");
  expect(launcher).toContain("WORKBUDDY_CONFIG_DIR");
  expect(launcher).toContain("CODEBUDDY_CONFIG_DIR");
  expect(launcher).toContain("CCR_REAL_CODEX_CLI_PATH");
  expect(launcher).toContain("codebuddy");

  const virtualAuthFile = workbuddyVirtualAuthFile(profileHome);
  expect(existsSync(virtualAuthFile)).toBe(true);
  const virtualSession = JSON.parse(readFileSync(virtualAuthFile, "utf8"));
  expect(virtualSession.auth.accessToken).toBe("ccr-local-profile");
  expect(virtualSession.auth.domain).toBe("www.workbuddy.ai");
  expect(virtualSession.account.uid).toBe("ccr-local-profile");
  expect(virtualSession.accounts).toHaveLength(1);
  expect(virtualSession.allAccounts).toHaveLength(1);
});

async function startElectronOverCdp(): Promise<ElectronCdpRuntime> {
  const cdpPort = await findAvailablePort();
  const gatewayPort = await findAvailablePort();
  const gatewayCorePort = await findAvailablePort();
  const proxyPort = await findAvailablePort();
  const testHome = mkdtempSync(path.join(os.tmpdir(), "ccr-electron-cdp-home-"));
  const output: ProcessOutput = { stderr: "", stdout: "" };
  let browser: Browser | undefined;
  let child: ElectronChild | undefined;

  try {
    writeElectronE2eConfig(testHome, {
      gatewayCorePort,
      gatewayPort,
      proxyPort
    });

    child = spawn(electronExecutable, [
      "--disable-gpu",
      "--no-sandbox",
      "--remote-allow-origins=*",
      `--remote-debugging-address=${host}`,
      `--remote-debugging-port=${cdpPort}`,
      projectRoot
    ], {
      cwd: projectRoot,
      env: {
        ...process.env,
        CCR_INTERNAL_APP_DATA_DIR: path.join(testHome, "app-data"),
        CCR_INTERNAL_HOME_DIR: testHome,
        CCR_INTERNAL_USER_DATA_DIR: path.join(testHome, "user-data"),
        ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
        HOME: testHome,
        NODE_ENV: "test"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output.stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output.stderr += chunk;
    });
    child.on("error", (error) => {
      output.stderr += `\nElectron process error: ${formatError(error)}`;
    });

    const cdpUrl = await waitForCdpUrl(child, output, cdpPort);
    browser = await chromium.connectOverCDP(cdpUrl, { timeout: startupTimeoutMs });
    const mainPage = await waitForMainPage(browser, child, output);

    return {
      browser,
      cdpUrl,
      child,
      gatewayPort,
      mainPage,
      output,
      testHome
    };
  } catch (error) {
    await browser?.close().catch(() => undefined);
    if (child) {
      await stopElectronProcess(child).catch(() => undefined);
    }
    removeElectronTestHome(testHome);
    throw error;
  }
}

async function stopElectronOverCdp(current: ElectronCdpRuntime): Promise<void> {
  await current.mainPage.evaluate(() => window.ccr?.quitApp()).catch(() => undefined);
  await current.browser.close().catch(() => undefined);
  await stopElectronProcess(current.child);
}

function writeElectronE2eConfig(
  testHome: string,
  ports: { gatewayCorePort: number; gatewayPort: number; proxyPort: number }
): void {
  const configDir = path.join(testHome, ".claude-code-router");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, "config.json"), JSON.stringify({
    HOST: host,
    PORT: ports.gatewayPort,
    Providers: [],
    autoStart: false,
    gateway: {
      corePort: ports.gatewayCorePort,
      enabled: false,
      host,
      port: ports.gatewayPort
    },
    profile: {
      enabled: false,
      profiles: []
    },
    proxy: {
      enabled: false,
      port: ports.proxyPort,
      systemProxy: false
    },
    routerEndpoint: `http://${host}:${ports.gatewayPort}`
  }, null, 2));

  const dataDir = path.join(testHome, "user-data");
  mkdirSync(dataDir, { recursive: true });
  createLegacyApiKeyDatabase(path.join(dataDir, "api-keys.sqlite"));
}

function createLegacyApiKeyDatabase(file: string): void {
  runElectronNode(`
    const Database = require("better-sqlite3");
    const database = new Database(process.env.CCR_E2E_SQLITE_FILE);
    database.exec(\`
      CREATE TABLE api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        encrypted_key TEXT NOT NULL,
        encryption TEXT NOT NULL DEFAULT 'plain',
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL DEFAULT '',
        limits_json TEXT NOT NULL DEFAULT ''
      )
    \`);
    database.prepare(\`
      INSERT INTO api_keys (
        id, name, encrypted_key, encryption, created_at, expires_at, limits_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    \`).run(
      "legacy-electron-cdp",
      "Legacy Electron CDP",
      "sk-electron-cdp-legacy",
      "plain",
      new Date(0).toISOString(),
      "",
      ""
    );
    database.close();
  `, file);
}

function readGatewayRuntimeMarker(file: string): Record<string, unknown> | undefined {
  const rows = readSqliteRows<{ value_json: string }>(
    file,
    "SELECT value_json FROM runtime_state WHERE key = 'gateway'"
  );
  return rows[0] ? JSON.parse(rows[0].value_json) as Record<string, unknown> : undefined;
}

function readSqliteRows<Row>(file: string, query: string): Row[] {
  const output = runElectronNode(`
    const Database = require("better-sqlite3");
    const database = new Database(process.env.CCR_E2E_SQLITE_FILE, { readonly: true });
    const rows = database.prepare(process.env.CCR_E2E_SQLITE_QUERY).all();
    database.close();
    process.stdout.write(JSON.stringify(rows));
  `, file, query);
  return JSON.parse(output || "[]") as Row[];
}

function workbuddyVirtualAuthFile(profileHome: string): string {
  const virtualHome = path.join(profileHome, ".claude-code-router", "workbuddy-app-home");
  const sharedAuthSegments = process.platform === "darwin"
    ? ["Library", "Application Support", "CodeBuddyExtension", "Data", "Public", "auth"]
    : process.platform === "win32"
      ? ["AppData", "Local", "CodeBuddyExtension", "Data", "Public", "auth"]
      : [".local", "share", "CodeBuddyExtension", "Data", "Public", "auth"];
  return path.join(virtualHome, ...sharedAuthSegments, "workbuddy-desktop-ai.info");
}

function runElectronNode(script: string, file: string, query = ""): string {
  const result = spawnSync(electronExecutable, ["-e", script], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CCR_E2E_SQLITE_FILE: file,
      CCR_E2E_SQLITE_QUERY: query,
      ELECTRON_RUN_AS_NODE: "1"
    }
  });
  if (result.status !== 0) {
    throw new Error(`Electron SQLite helper failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

async function waitForCdpUrl(child: ElectronChild, output: ProcessOutput, port: number): Promise<string> {
  const cdpUrl = `http://${host}:${port}`;
  const deadline = Date.now() + startupTimeoutMs;
  let lastError = "";

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw electronStartupError(`Electron exited before CDP became available with code ${child.exitCode}.`, output, lastError);
    }

    try {
      const response = await fetch(`${cdpUrl}/json/version`);
      if (response.ok) {
        return cdpUrl;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = formatError(error);
    }

    await delay(100);
  }

  throw electronStartupError(`Electron CDP endpoint did not start within ${startupTimeoutMs}ms.`, output, lastError);
}

async function waitForMainPage(browser: Browser, child: ElectronChild, output: ProcessOutput): Promise<Page> {
  const deadline = Date.now() + startupTimeoutMs;
  let lastSeenUrl = "";

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw electronStartupError(`Electron exited before the main window was visible with code ${child.exitCode}.`, output, lastSeenUrl);
    }

    for (const page of browser.contexts().flatMap((context) => context.pages())) {
      const url = page.url();
      lastSeenUrl = url || lastSeenUrl;
      if (url.includes("/pages/home/index.html")) {
        await page.waitForLoadState("domcontentloaded", {
          timeout: Math.max(1, deadline - Date.now())
        });
        return page;
      }
    }

    await delay(100);
  }

  throw electronStartupError(`Electron main window was not exposed through CDP within ${startupTimeoutMs}ms.`, output, lastSeenUrl);
}

async function stopElectronProcess(child: ElectronChild): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
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

function removeElectronTestHome(testHome: string): void {
  try {
    rmSync(testHome, { force: true, recursive: true });
  } catch (error) {
    console.warn(`Failed to remove Electron E2E home ${testHome}: ${formatError(error)}`);
  }
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

function requireRuntime(): ElectronCdpRuntime {
  if (!runtime) {
    throw new Error("Electron CDP runtime was not started.");
  }
  return runtime;
}

function electronStartupError(message: string, output: ProcessOutput, detail: string): Error {
  return new Error(`${message}\nlast detail:\n${detail || "(none)"}\nstdout:\n${output.stdout}\nstderr:\n${output.stderr}`);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
