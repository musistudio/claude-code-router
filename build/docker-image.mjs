import { spawnSync } from "node:child_process";
import { prepareLocalGatewayPackage, projectRoot } from "./docker-local-gateway.mjs";

const imageName = process.env.CCR_DOCKER_IMAGE || "claude-code-router:local";
const args = process.argv.slice(2);

prepareLocalGatewayPackage();

const dockerArgs = ["build", "-t", imageName, ".", ...args];
const result = spawnSync("docker", dockerArgs, {
  cwd: projectRoot,
  stdio: "inherit"
});

process.exit(result.status ?? 1);
