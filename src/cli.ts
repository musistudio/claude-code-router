#!/usr/bin/env node
import { run } from "./index";
import { showStatus } from "@/utils/status";
import { executeCodeCommand } from "@/utils/codeCommand";
import { cleanupPidFile, isServiceRunning } from "@/utils/processCheck";
import { version } from "../package.json";
import { spawn } from "child_process";
import {getPidFile, getReferenceCountFile, isDevMode, PID_FILE, REFERENCE_COUNT_FILE} from "@/constants";
import fs, { existsSync, readFileSync } from "fs";
import {join} from "path";

const command = process.argv[2];

const HELP_TEXT = `
Usage: ccr [command]

Commands:
  start         Start server 
  stop          Stop server
  restart       Restart server
  status        Show server status
  code          Execute claude command
  -v, version   Show version information
  -h, help      Show help information

Example:
  ccr start
  ccr code "Write a Hello World"
`;

// Ensure service is fully initialized before proceeding with commands
async function waitForService(
  timeout = 10000,
  initialDelay = 1000
): Promise<boolean> {

  // Wait for an initial period to let the service initialize
  await new Promise((resolve) => setTimeout(resolve, initialDelay));

  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (isServiceRunning(getPidFile())) {
      // Wait for an additional short period to ensure service is fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function main() {
// Handle CLI commands with appropriate service management actions
  switch (command) {
    // Start the router service in background mode
    case "start":
      await run();
      break;
    // Stop the service and clean up PID/reference files
    case "stop":
      try {
        const pidFile = getPidFile()
        const referenceCountFile = getReferenceCountFile()
        const pid = parseInt(readFileSync(pidFile, "utf-8"));
        process.kill(pid);
        cleanupPidFile(pidFile);
        if (existsSync(referenceCountFile)) {
          try {
            fs.unlinkSync(referenceCountFile);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        console.log(
          "claude code router service has been successfully stopped."
        );
      } catch (e) {
        console.log(
          "Failed to stop the service. It may have already been stopped."
        );
        const pidFile = getPidFile()
        cleanupPidFile(pidFile);
      }
      break;
    case "status":
      await showStatus();
      break;
    // Execute Claude Code command with auto-start capability if service isn't running
    case "code":
      {
        const pidFile = getPidFile()
        // Auto-start service if not running before executing code command
        if (!isServiceRunning(pidFile)) {
          console.log("Service not running, starting service...");
          const cliPath = join(__dirname, "cli.js");
          const startProcessArgs = isDevMode() ? [cliPath, "start"] : [cliPath, "start"];
          const startProcess = spawn("node",startProcessArgs, {
            detached: true,
            stdio: "ignore",
            env: {
              ...process.env,
              SERVICE_PORT: process.env.SERVICE_PORT || isDevMode() ? "3457" : "3456",
              NODE_ENV: process.env.NODE_ENV || isDevMode() ? "Development" : "production",
            }
          });


          startProcess.on("error", (error) => {
            console.error("Failed to start service:", error.message);
            process.exit(1);
          });

          // 处理子进程输出
          startProcess.stdout?.on('data', (data) => {
            console.log(`输出: ${data}`);
          });
          startProcess.unref();
          if (await waitForService()) {
            await executeCodeCommand(process.argv.slice(3));
          } else {
            console.error(
                "Service startup timeout, please manually run `ccr start` to start the service"
            );
            process.exit(1);
          }
        } else {
          await executeCodeCommand(process.argv.slice(3));
        }
      }
      break;
    case "-v":
    case "version":
      console.log(`claude-code-router version: ${version}`);
      break;
    // Gracefully stop and restart the service with cleanup
    case "restart":
      // Stop the service if it's running
      const pidFile = getPidFile();
      try {
        const pid = parseInt(readFileSync(pidFile, "utf-8"));
        process.kill(pid);
        cleanupPidFile(pidFile);
        if (existsSync(REFERENCE_COUNT_FILE)) {
          try {
            fs.unlinkSync(REFERENCE_COUNT_FILE);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        console.log("claude code router service has been stopped.");
      } catch (e) {
        // If the service was not running or failed to stop, log a message
        console.log(`${isDevMode() ? "Development" : ""}Service was not running or failed to stop. cleaning up PID file ${pidFile}.`);

        cleanupPidFile(pidFile);
      }

      // Start the service again in the background
      console.log(` ${isDevMode() ? "Development" : ""}. Starting claude code router service... please wait.`);
      const cliPath = join(__dirname, "cli.js");
      const startProcess = spawn("node", [cliPath, "start"], {
        detached: true,
        stdio: "ignore",
        env: {
            ...process.env,
        }
      });

      startProcess.on("error", (error) => {
        console.error("Failed to start service:", error);
        process.exit(1);
      });

      startProcess.unref();
      console.log(`${isDevMode() ? "Development" : ""}✅ Service started successfully in the background.`);

      break;
    case "-h":
    case "help":
      console.log(HELP_TEXT);
      break;
    default:
      console.log(HELP_TEXT);
      process.exit(1);
  }
}

main().catch(console.error);
