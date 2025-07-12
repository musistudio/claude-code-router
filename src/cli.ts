#!/usr/bin/env node
import { run } from "./index";
import { showStatus } from "./utils/status";
import { executeCodeCommand } from "./utils/codeCommand";
import { cleanupPidFile, isServiceRunning } from "./utils/processCheck";
import { version } from "../package.json";
import { spawn } from "child_process";
import { PID_FILE, REFERENCE_COUNT_FILE } from "./constants";
import { existsSync, readFileSync } from "fs";
import { Command } from "commander";

const program = new Command();
program
  .name("ccr")
  .description("Claude Code Router CLI")
  .version(version, "-v, --version", "Show version information");

program
  .command("start")
  .description("Start service")
  .action(() => {
    run();
  });

program
  .command("stop")
  .description("Stop service")
  .action(() => {
    try {
      const pid = parseInt(readFileSync(PID_FILE, "utf-8"));
      process.kill(pid);
      cleanupPidFile();
      if (existsSync(REFERENCE_COUNT_FILE)) {
        try {
          require("fs").unlinkSync(REFERENCE_COUNT_FILE);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      console.log("claude code router service has been successfully stopped.");
    } catch (e) {
      console.log(
        "Failed to stop the service. It may have already been stopped."
      );
      cleanupPidFile();
    }
  });

program
  .command("status")
  .description("Show service status")
  .action(() => {
    showStatus();
  });

program
  .command("code <prompt...>")
  .description("Execute code command")
  .action(async (prompt: string[]) => {
    if (!isServiceRunning()) {
      console.log("Service not running, starting service...");
      const startProcess = spawn("ccr", ["start"], {
        detached: true,
        stdio: "ignore",
      });

      startProcess.on("error", (error) => {
        console.error("Failed to start service:", error);
        process.exit(1);
      });

      startProcess.unref();

      if (await waitForService()) {
        executeCodeCommand(prompt);
      } else {
        console.error(
          "Service startup timeout, please manually run `ccr start` to start the service"
        );
        process.exit(1);
      }
    } else {
      executeCodeCommand(prompt);
    }
  });

// Show help if no command is provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(1);
}

program.parse(process.argv);

async function waitForService(
  timeout = 10000,
  initialDelay = 1000
): Promise<boolean> {
  // Wait for an initial period to let the service initialize
  await new Promise((resolve) => setTimeout(resolve, initialDelay));

  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (isServiceRunning()) {
      // Wait for an additional short period to ensure service is fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}
