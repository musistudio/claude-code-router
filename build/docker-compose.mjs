import { spawnSync } from "node:child_process";
import { prepareLocalGatewayPackage, projectRoot } from "./docker-local-gateway.mjs";

const args = process.argv.slice(2);
const composeArgs = args.length > 0 ? args : ["up", "-d", "--build"];

prepareLocalGatewayPackage();

const result = spawnSync("docker", ["compose", ...composeArgs], {
  cwd: projectRoot,
  stdio: "inherit"
});

process.exit(result.status ?? 1);
