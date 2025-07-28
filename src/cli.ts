<<<<<<< Updated upstream
#!/usr/bin/env node
import { run } from "./index";
import { showStatus } from "./utils/status";
import { executeCodeCommand } from "./utils/codeCommand";
import { cleanupPidFile, isServiceRunning } from "./utils/processCheck";
import { version } from "../package.json";
import { spawn } from "child_process";
import { PID_FILE, REFERENCE_COUNT_FILE } from "./constants";
import fs, { existsSync, readFileSync } from "fs";
import { join } from "path";
import { logger } from "./utils/logger";
import { formatErrorMessage } from "./utils/errorHandler";
import { handleStopCommand, stopService } from "./utils/serviceControl";

const command = process.argv[2];

const HELP_TEXT = `
Usage: ccr [command] [options]

Commands:
  start         Start server 
                Options:
                  --provider <name> <url> <key> <models>  Add/update provider
                  --transformer <provider> <transformer>   Set transformer for provider
  stop          Stop server
  restart       Restart server (supports same options as start)
  status        Show server status
  code          Execute claude command
  -v, version   Show version information
  -h, help      Show help information

Example:
  ccr start
  ccr start --provider openrouter https://openrouter.ai/api/v1/chat/completions sk-xxx claude-3.5-sonnet
  ccr start --transformer openrouter openrouter
  ccr code "Write a Hello World"
`;

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

function parseStartOptions(args: string[]) {
  const options: any = {
    providers: [],
    transformers: {}
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--provider" && i + 4 < args.length) {
      const provider = {
        name: args[i + 1],
        api_base_url: args[i + 2],
        api_key: args[i + 3],
        models: args[i + 4].split(",")
      };
      options.providers.push(provider);
      i += 4;
    } else if (args[i] === "--transformer" && i + 2 < args.length) {
      const providerName = args[i + 1];
      const transformerName = args[i + 2];
      options.transformers[providerName] = {
        use: [transformerName]
      };
      i += 2;
    }
  }

  return options;
}

async function main() {
  switch (command) {
    case "start":
      try {
        const startOptions = parseStartOptions(process.argv.slice(3));
        await run(startOptions);
      } catch (error: any) {
        console.error(`Failed to start service: ${formatErrorMessage(error)}`);
        process.exit(1);
      }
      break;
    case "stop":
      await handleStopCommand();
      break;
    case "status":
      await showStatus();
      break;
    case "code":
      if (!isServiceRunning()) {
        console.log("⚡ Service not running, starting service...");
        const cliPath = join(__dirname, "cli.js");
        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: "ignore",
          env: { ...process.env, LOG_LEVEL: 'error' } // Reduce noise during auto-start
        });

        startProcess.on("error", (error) => {
          console.error("Failed to start service:", formatErrorMessage(error));
          process.exit(1);
        });

        startProcess.unref();

        console.log("⏳ Waiting for service to be ready...");
        if (await waitForService()) {
          console.log("✅ Service is ready!");
          await executeCodeCommand(process.argv.slice(3));
        } else {
          console.error(
            "❌ Service startup timeout. Please try running 'ccr start' manually first."
          );
          process.exit(1);
        }
      } else {
        await executeCodeCommand(process.argv.slice(3));
      }
      break;
    case "-v":
    case "version":
      console.log(`claude-code-router version: ${version}`);
      break;
    case "restart":
      // Stop the service if it's running
      console.log("🔄 Restarting Claude Code Router service...");
      if (existsSync(PID_FILE)) {
        const stopped = await stopService({ force: true, timeout: 5000 });
        if (stopped) {
          console.log("✅ Service stopped.");
        } else {
          logger.debug('Service may have already been stopped');
        }
      }

      // Wait a moment before restarting
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start the service again in the background with options
      console.log("🚀 Starting service...");
      const cliPath = join(__dirname, "cli.js");
      const restartArgs = ["start", ...process.argv.slice(3)];
      const startProcess = spawn("node", [cliPath, ...restartArgs], {
        detached: true,
        stdio: "ignore",
      });

      startProcess.on("error", (error) => {
        console.error("Failed to start service:", formatErrorMessage(error));
        process.exit(1);
      });

      startProcess.unref();
      
      // Wait for service to be ready
      if (await waitForService()) {
        console.log("✅ Service restarted successfully!");
      } else {
        console.error("❌ Service failed to start properly.");
        process.exit(1);
      }
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

main().catch((error) => {
  console.error("Fatal error:", formatErrorMessage(error));
  logger.error('CLI fatal error', { error });
  process.exit(1);
});
=======
#!/usr/bin/env node
import { run } from "./index";
import { showStatus } from "./utils/status";
import { executeCodeCommand } from "./utils/codeCommand";
import { cleanupPidFile, isServiceRunning } from "./utils/processCheck";
import { version } from "../package.json";
import { spawn } from "child_process";
import { PID_FILE, REFERENCE_COUNT_FILE } from "./constants";
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

async function main() {
  switch (command) {
    case "start":
      run();
      break;
    case "stop":
      try {
        const pid = parseInt(readFileSync(PID_FILE, "utf-8"), 10);
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
      break;
    case "status":
      await showStatus();
      break;
    case "code":
      if (!isServiceRunning()) {
        console.log("Service not running, starting service...");
        const cliPath = join(__dirname, "cli.js");
        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: "ignore",
        });

        // let errorMessage = "";
        // startProcess.stderr?.on("data", (data) => {
        //   errorMessage += data.toString();
        // });

        startProcess.on("error", (error) => {
          console.error("Failed to start service:", error.message);
          process.exit(1);
        });

        // startProcess.on("close", (code) => {
        //   if (code !== 0 && errorMessage) {
        //     console.error("Failed to start service:", errorMessage.trim());
        //     process.exit(1);
        //   }
        // });

        startProcess.unref();

        if (await waitForService()) {
          executeCodeCommand(process.argv.slice(3));
        } else {
          console.error(
            "Service startup timeout, please manually run `ccr start` to start the service"
          );
          process.exit(1);
        }
      } else {
        executeCodeCommand(process.argv.slice(3));
      }
      break;
    case "-v":
    case "version":
      console.log(`claude-code-router version: ${version}`);
      break;
    case "restart":
      // Stop the service if it's running
      try {
        const pid = parseInt(readFileSync(PID_FILE, "utf-8"), 10);
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
>>>>>>> Stashed changes
