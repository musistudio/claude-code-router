import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(__dirname, "..");
export const dockerLocalGatewayDir = path.join(projectRoot, "docker", "local-ai-gateway");

const routerPluginSupportMarkers = [
  "requestTransforms",
  "routeResolvers",
  "httpRoutes"
];

export function resolveLocalGatewayRoot() {
  for (const envName of ["CCR_DOCKER_GATEWAY_SOURCE_DIR", "CCR_GATEWAY_SOURCE_DIR", "CCR_LOCAL_AI_GATEWAY_DIR"]) {
    const value = process.env[envName]?.trim();
    if (!value) continue;
    return path.resolve(projectRoot, value);
  }
  return path.resolve(projectRoot, "..", "..", "next-ai", "gateway");
}

export function hasLocalGatewaySource(gatewayRoot = resolveLocalGatewayRoot()) {
  return existsSync(path.join(gatewayRoot, "package.json")) &&
    existsSync(path.join(gatewayRoot, "bin", "next-ai-gateway.js"));
}

export function prepareLocalGatewayPackage(options = {}) {
  const gatewayRoot = options.gatewayRoot ?? resolveLocalGatewayRoot();
  if (!hasLocalGatewaySource(gatewayRoot)) {
    cleanLocalGatewayPackage();
    if (options.required) {
      throw new Error(`Local ai-gateway source was not found: ${gatewayRoot}`);
    }
    console.log(`[docker] Local ai-gateway source not found at ${gatewayRoot}; using package-lock dependency.`);
    return undefined;
  }

  run("npm", ["run", "build"], { cwd: gatewayRoot });
  assertGatewaySupportsRouterPlugin(gatewayRoot);

  cleanLocalGatewayPackage();
  mkdirSync(dockerLocalGatewayDir, { recursive: true });
  const result = run("npm", ["pack", "--ignore-scripts", "--pack-destination", dockerLocalGatewayDir], {
    cwd: gatewayRoot,
    capture: true
  });
  const fileName = result.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop();
  if (!fileName) {
    throw new Error("npm pack did not report a package file.");
  }
  const tarball = path.join(dockerLocalGatewayDir, fileName);
  if (!existsSync(tarball)) {
    throw new Error(`Packed ai-gateway tarball was not created: ${tarball}`);
  }
  console.log(`[docker] Packed local ai-gateway for Docker: ${path.relative(projectRoot, tarball)}`);
  return tarball;
}

export function cleanLocalGatewayPackage() {
  mkdirSync(dockerLocalGatewayDir, { recursive: true });
  for (const entry of readdirSync(dockerLocalGatewayDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".tgz")) {
      unlinkSync(path.join(dockerLocalGatewayDir, entry.name));
    }
  }
}

function assertGatewaySupportsRouterPlugin(gatewayRoot) {
  const gatewayEntry = path.join(gatewayRoot, "dist", "index.js");
  if (!existsSync(gatewayEntry)) {
    throw new Error(`Local ai-gateway build output was not found: ${gatewayEntry}`);
  }
  const source = readFileSync(gatewayEntry, "utf8");
  const missing = routerPluginSupportMarkers.filter((marker) => !source.includes(marker));
  if (missing.length > 0) {
    throw new Error(`Local ai-gateway is missing router plugin support markers: ${missing.join(", ")}`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? projectRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit"
  });
  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(" ")} failed with code ${result.status ?? "unknown"}`,
      result.stdout,
      result.stderr
    ].filter(Boolean).join("\n"));
  }
  return result.stdout?.trim() ?? "";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] ?? "prepare";
  if (command === "prepare") {
    prepareLocalGatewayPackage({ required: process.argv.includes("--required") });
  } else if (command === "clean") {
    cleanLocalGatewayPackage();
  } else {
    throw new Error(`Unknown docker local gateway command: ${command}`);
  }
}
