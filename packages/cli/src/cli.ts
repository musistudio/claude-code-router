#!/usr/bin/env node
import { Command } from 'commander';
import { spawn, exec } from "child_process";
import fs, { existsSync, readFileSync } from "fs";
import { join } from "path";
import {cleanupPidFile, getServiceInfo, isServiceRunning} from "./utils/processCheck";
import {PID_FILE, REFERENCE_COUNT_FILE} from "./constants";
import {parseStatusLineData, StatusLineInput} from "./utils/statusline";
import {executeCodeCommand} from "./utils/codeCommand";
import {backupConfigFile, initDir, writeConfigFile} from "./utils";
import {showStatus} from "./utils/status";
import {run} from "./index";

const program = new Command();

const packageJson = require("../package.json");
const version = packageJson.version;

async function waitForService(
  timeout = 10000,
  initialDelay = 1000
): Promise<boolean> {
  // Wait for an initial period to let the service initialize
  await new Promise((resolve) => setTimeout(resolve, initialDelay));

  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const isRunning = await isServiceRunning()
    if (isRunning) {
      // Wait for an additional short period to ensure service is fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

// Define commands
program
  .name('ccr')
  .description('Claude Code Router - Route Claude Code requests to different LLM providers')
  .version(version);

program
  .command('start')
  .description('Start server')
  .action(() => {
    run();
  });

program
  .command('stop')
  .description('Stop server')
  .action(async () => {
    try {
      const pid = parseInt(readFileSync(PID_FILE, "utf-8"));
      process.kill(pid);
      cleanupPidFile();
      if (existsSync(REFERENCE_COUNT_FILE)) {
        try {
          fs.unlinkSync(REFERENCE_COUNT_FILE);
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
      cleanupPidFile();
    }
  });

program
  .command('restart')
  .description('Restart server')
  .action(async () => {
    try {
      const pid = parseInt(readFileSync(PID_FILE, "utf-8"));
      process.kill(pid);
      cleanupPidFile();
      if (existsSync(REFERENCE_COUNT_FILE)) {
        try {
          fs.unlinkSync(REFERENCE_COUNT_FILE);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      console.log("claude code router service has been stopped.");
    } catch (e) {
      console.log("Service was not running or failed to stop.");
      cleanupPidFile();
    }

    // Start the service again in the background
    console.log("Starting claude code router service...");
    const cliPath = join(__dirname, "cli.js");
    const startProcess = spawn("node", [cliPath, "start"], {
      detached: true,
      stdio: "ignore",
    });

    startProcess.on("error", (error) => {
      console.error("Failed to start service:", error);
      process.exit(1);
    });

    startProcess.unref();
    console.log("✅ Service started successfully in the background.");
  });

program
  .command('status')
  .description('Show server status')
  .action(async () => {
    await showStatus();
  });

program
  .command('statusline')
  .description('Integrated statusline')
  .action(() => {
    // 从stdin读取JSON输入
    let inputData = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("readable", () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        inputData += chunk;
      }
    });

    process.stdin.on("end", async () => {
      try {
        const input: StatusLineInput = JSON.parse(inputData);
        const statusLine = await parseStatusLineData(input);
        console.log(statusLine);
      } catch (error) {
        console.error("Error parsing status line data:", error);
        process.exit(1);
      }
    });
  });

program
  .command('code')
  .description('Execute claude command')
  .argument('[prompt...]', 'command to execute')
  .action(async (prompt) => {
    const isRunning = await isServiceRunning();
    if (!isRunning) {
      console.log("Service not running, starting service...");
      const cliPath = join(__dirname, "cli.js");
      const startProcess = spawn("node", [cliPath, "start"], {
        detached: true,
        stdio: "ignore",
      });

      startProcess.on("error", (error) => {
        console.error("Failed to start service:", error.message);
        process.exit(1);
      });

      startProcess.unref();

      if (await waitForService()) {
        // Join all code arguments into a single string to preserve spaces within quotes
        const codeArgs = prompt ? prompt.join(' ') : '';
        executeCodeCommand([codeArgs]);
      } else {
        console.error(
          "Service startup timeout, please manually run `ccr start` to start the service"
        );
        process.exit(1);
      }
    } else {
      // Join all code arguments into a single string to preserve spaces within quotes
      const codeArgs = prompt ? prompt.join(' ') : '';
      executeCodeCommand([codeArgs]);
    }
  });

program
  .command('ui')
  .description('Open the web UI in browser')
  .action(async () => {
    const isRunning = await isServiceRunning();

    // Check if service is running
    if (!isRunning) {
      console.log("Service not running, starting service...");
      const cliPath = join(__dirname, "cli.js");
      const startProcess = spawn("node", [cliPath, "start"], {
        detached: true,
        stdio: "ignore",
      });

      startProcess.on("error", (error) => {
        console.error("Failed to start service:", error.message);
        process.exit(1);
      });

      startProcess.unref();

      if (!(await waitForService())) {
        // If service startup fails, try to start with default config
        console.log(
          "Service startup timeout, trying to start with default configuration..."
        );
        // 使用已导入的函数

        try {
          // Initialize directories
          await initDir();

          // Backup existing config file if it exists
          const backupPath = await backupConfigFile();
          if (backupPath) {
            console.log(
              `Backed up existing configuration file to ${backupPath}`
            );
          }

          // Create a minimal default config file
          await writeConfigFile({
            PORT: 3456,
            Providers: [],
            Router: {},
          });
          console.log(
            "Created minimal default configuration file at ~/.claude-code-router/config.json"
          );
          console.log(
            "Please edit this file with your actual configuration."
          );

          // Try starting the service again
          const restartProcess = spawn("node", [cliPath, "start"], {
            detached: true,
            stdio: "ignore",
          });

          restartProcess.on("error", (error) => {
            console.error(
              "Failed to start service with default config:",
              error.message
            );
            process.exit(1);
          });

          restartProcess.unref();

          if (!(await waitForService(15000))) {
            // Wait a bit longer for the first start
            console.error(
              "Service startup still failing. Please manually run `ccr start` to start the service and check the logs."
            );
            process.exit(1);
          }
        } catch (error: any) {
          console.error(
            "Failed to create default configuration:",
            error.message
          );
          process.exit(1);
        }
      }
    }

    // Get service info and open UI
    const serviceInfo = await getServiceInfo();

    // Add temporary API key as URL parameter if successfully generated
    const uiUrl = `${serviceInfo.endpoint}/ui/`;

    console.log(`Opening UI at ${uiUrl}`);

    // Open URL in browser based on platform
    const platform = process.platform;
    let openCommand = "";

    if (platform === "win32") {
      // Windows
      openCommand = `start ${uiUrl}`;
    } else if (platform === "darwin") {
      // macOS
      openCommand = `open ${uiUrl}`;
    } else if (platform === "linux") {
      // Linux
      openCommand = `xdg-open ${uiUrl}`;
    } else {
      console.error("Unsupported platform for opening browser");
      process.exit(1);
    }

    exec(openCommand, (error) => {
      if (error) {
        console.error("Failed to open browser:", error.message);
        process.exit(1);
      }
    });
  });

program.parse();
