import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const imageName = process.env.CCR_DOCKER_TEST_IMAGE || "claude-code-router:local";
const token = process.env.CCR_DOCKER_TEST_WEB_AUTH_TOKEN || "token+/&=#?";
const testId = randomUUID().slice(0, 8);
const containerName = `ccr-docker-smoke-${testId}`;
const volumeName = `ccr-docker-smoke-${testId}`;
const startupTimeoutMs = 45_000;

let containerStarted = false;
let volumeCreated = false;

try {
  if (process.env.CCR_DOCKER_TEST_SKIP_BUILD !== "1") {
    run("docker", ["build", "-t", imageName, "."], { cwd: projectRoot });
  }

  const hostPort = await findAvailablePort();
  run("docker", ["volume", "create", volumeName]);
  volumeCreated = true;
  seedLegacyDockerConfig(volumeName);

  const containerId = run("docker", [
    "run",
    "-d",
    "--name",
    containerName,
    "-p",
    `${hostPort}:8080`,
    "-e",
    `CCR_WEB_AUTH_TOKEN=${token}`,
    "-e",
    "CCR_PUBLIC_HOST=127.0.0.1",
    "-e",
    `CCR_PUBLIC_PORT=${hostPort}`,
    "-v",
    `${volumeName}:/data`,
    imageName
  ]).trim();
  containerStarted = true;
  const baseUrl = `http://127.0.0.1:${hostPort}`;

  await waitFor(async () => {
    const response = await fetch(baseUrl, { redirect: "manual" }).catch(() => undefined);
    return response?.status === 302;
  }, "Docker Nginx entrypoint");

  const ports = dockerPorts(containerId);
  assert.ok(ports["8080/tcp"], "Docker container must publish only the Nginx port");
  assert.equal(ports["3456/tcp"], undefined, "Docker container must not publish the internal gateway port");

  const redirect = await fetch(baseUrl, { redirect: "manual" });
  assert.equal(redirect.status, 302);
  const redirectLocation = redirect.headers.get("location");
  assert.equal(redirectLocation, `/pages/home/index.html?ccr_web_token=${encodeURIComponent(token)}`);

  const page = await fetch(`${baseUrl}${redirectLocation}`);
  assert.equal(page.status, 200);
  const pageHtml = await page.text();
  assert.match(pageHtml, /Claude Code Router/);
  assert.match(pageHtml, /web-client-bridge\.js/);

  const bridge = await fetch(`${baseUrl}/assets/web-client-bridge.js`);
  assert.equal(bridge.status, 200);
  assert.match(await bridge.text(), /getProviderPresets/);

  await waitFor(async () => {
    const response = await rpc(baseUrl, "getAppInfo", token).catch(() => undefined);
    return response?.status === 200;
  }, "Docker core management RPC");

  const unauthorized = await rpc(baseUrl, "getAppInfo");
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).ok, false);

  const appInfo = await rpc(baseUrl, "getAppInfo", token);
  assert.equal(appInfo.status, 200);
  const appInfoPayload = await appInfo.json();
  assert.equal(appInfoPayload.ok, true);
  assert.equal(appInfoPayload.value.configDir, "/data/.claude-code-router");

  const presets = await rpc(baseUrl, "getProviderPresets", token);
  assert.equal(presets.status, 200);
  const presetsPayload = await presets.json();
  assert.equal(presetsPayload.ok, true);
  assert.ok(presetsPayload.value.some((preset) => preset.id === "openai"));

  const usageStatsWithNullFilter = await rpc(baseUrl, "getUsageStats", token, ["7d", null]);
  assert.equal(usageStatsWithNullFilter.status, 200);
  const usageStatsPayload = await usageStatsWithNullFilter.json();
  assert.equal(usageStatsPayload.ok, true);
  assert.equal(usageStatsPayload.value.range, "7d");
  assert.doesNotMatch(run("docker", ["logs", containerId]), /Failed to read usage stats/);

  const config = await rpc(baseUrl, "getConfig", token);
  assert.equal(config.status, 200);
  const configPayload = await config.json();
  assert.equal(configPayload.ok, true);
  assert.equal(configPayload.value.routerEndpoint, baseUrl);
  assert.equal(configPayload.value.HOST, "127.0.0.1");
  assert.equal(configPayload.value.PORT, 3456);
  assert.equal(configPayload.value.gateway.host, "127.0.0.1");
  assert.equal(configPayload.value.gateway.port, 3456);

  const gatewayHealth = await fetch(`${baseUrl}/health`);
  assert.equal(gatewayHealth.status, 502, "Gateway health should be proxied by Nginx and fail while no models are configured");

  const openRouterConfig = {
    ...configPayload.value,
    Providers: [
      {
        apiKey: "test-openrouter-key",
        baseUrl: "https://openrouter.ai/api/v1",
        capabilities: [
          { baseUrl: "https://openrouter.ai/api/v1", source: "preset", type: "openai_chat_completions" },
          { baseUrl: "https://openrouter.ai/api/v1", source: "preset", type: "openai_responses" },
          { baseUrl: "https://openrouter.ai/api", endpoint: "https://openrouter.ai/api/v1/messages", source: "detected", type: "anthropic_messages" }
        ],
        models: ["qwen/qwen3.5-122b-a10b"],
        name: "OpenRouter",
        type: "openai_responses"
      }
    ],
    preferredProvider: "OpenRouter"
  };
  const savedConfig = await rpc(baseUrl, "saveConfig", token, [openRouterConfig, { applyProfile: false }]);
  assert.equal(savedConfig.status, 200);
  assert.equal((await savedConfig.json()).ok, true);

  const startedGateway = await rpc(baseUrl, "startGateway", token);
  assert.equal(startedGateway.status, 200);
  const startedGatewayPayload = await startedGateway.json();
  assert.equal(startedGatewayPayload.ok, true);
  assert.equal(startedGatewayPayload.value.state, "running");

  const restartedGateway = await rpc(baseUrl, "startGateway", token);
  assert.equal(restartedGateway.status, 200);
  const restartedGatewayPayload = await restartedGateway.json();
  assert.equal(restartedGatewayPayload.ok, true);
  assert.equal(restartedGatewayPayload.value.state, "running");

  await new Promise((resolve) => setTimeout(resolve, 1000));
  const restartedGatewayStatus = await rpc(baseUrl, "getGatewayStatus", token);
  assert.equal(restartedGatewayStatus.status, 200);
  const restartedGatewayStatusPayload = await restartedGatewayStatus.json();
  assert.equal(restartedGatewayStatusPayload.ok, true);
  assert.equal(restartedGatewayStatusPayload.value.state, "running");

  const runningGatewayHealth = await fetch(`${baseUrl}/health`);
  assert.equal(runningGatewayHealth.status, 200);
  assert.equal((await runningGatewayHealth.json()).status, "running");

  console.log(`Docker smoke test passed for ${imageName} on ${baseUrl}`);
} finally {
  if (containerStarted) {
    run("docker", ["rm", "-f", containerName], { allowFailure: true });
  }
  if (volumeCreated) {
    run("docker", ["volume", "rm", "-f", volumeName], { allowFailure: true });
  }
}

function seedLegacyDockerConfig(volume) {
  const script = `
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const configDir = "/data/.claude-code-router";
const config = {
  HOST: "0.0.0.0",
  PORT: 3456,
  Providers: [],
  gateway: {
    coreHost: "127.0.0.1",
    corePort: 3457,
    enabled: true,
    host: "0.0.0.0",
    port: 3456
  },
  routerEndpoint: "http://127.0.0.1:3456"
};
fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(path.join(configDir, "app-data"), { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify(config, null, 2) + "\\n", { mode: 0o600 });
const db = new Database(path.join(configDir, "config.sqlite"));
db.exec("create table app_config (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)");
db.prepare("insert into app_config (key, value_json, updated_at) values (?, ?, ?)").run("default", JSON.stringify(config), new Date().toISOString());
db.close();
`;
  run("docker", ["run", "--rm", "-v", `${volume}:/data`, "--entrypoint", "node", imageName, "-e", script]);
}

async function rpc(baseUrl, method, authToken, args = []) {
  return fetch(`${baseUrl}/api/ccr/rpc`, {
    body: JSON.stringify({ args, method }),
    headers: {
      "content-type": "application/json",
      ...(authToken ? { "x-ccr-web-auth": authToken } : {})
    },
    method: "POST"
  });
}

function dockerPorts(containerId) {
  const raw = run("docker", ["inspect", "--format", "{{json .NetworkSettings.Ports}}", containerId]);
  return JSON.parse(raw);
}

async function waitFor(check, label) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < startupTimeoutMs) {
    try {
      if (await check()) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const logs = containerStarted
    ? run("docker", ["logs", containerName], { allowFailure: true })
    : "";
  throw new Error(`${label} was not ready within ${startupTimeoutMs}ms.${lastError ? ` Last error: ${lastError}` : ""}\n${logs}`);
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close(() => {
        if (!port) {
          reject(new Error("Failed to allocate a Docker test port."));
          return;
        }
        resolve(port);
      });
    });
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? projectRoot,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe"
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error([
      `${command} ${args.join(" ")} failed with code ${result.status ?? "unknown"}`,
      result.stdout,
      result.stderr
    ].filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}
