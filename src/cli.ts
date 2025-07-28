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
      try {
        if (!existsSync(PID_FILE)) {
          console.log("Service is not running.");
          break;
        }
        const pid = parseInt(readFileSync(PID_FILE, "utf-8"));
        process.kill(pid, 'SIGTERM');
        
        // Wait for graceful shutdown
        let stopped = false;
        for (let i = 0; i < 10; i++) {
          try {
            process.kill(pid, 0); // Check if process is still running
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch {
            stopped = true;
            break;
          }
        }
        
        if (!stopped) {
          console.log("Forcing service shutdown...");
          process.kill(pid, 'SIGKILL');
        }
        
        cleanupPidFile();
        if (existsSync(REFERENCE_COUNT_FILE)) {
          try {
            fs.unlinkSync(REFERENCE_COUNT_FILE);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        console.log(
          "✅ Claude Code Router service has been successfully stopped."
        );
      } catch (e: any) {
        console.log(
          "Failed to stop the service. It may have already been stopped."
        );
        logger.debug('Stop error', { error: e });
        cleanupPidFile();
      }
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
        try {
          const pid = parseInt(readFileSync(PID_FILE, "utf-8"));
          process.kill(pid, 'SIGTERM');
          
          // Wait for graceful shutdown
          let stopped = false;
          for (let i = 0; i < 10; i++) {
            try {
              process.kill(pid, 0);
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch {
              stopped = true;
              break;
            }
          }
          
          if (!stopped) {
            process.kill(pid, 'SIGKILL');
          }
          
          cleanupPidFile();
          if (existsSync(REFERENCE_COUNT_FILE)) {
            try {
              fs.unlinkSync(REFERENCE_COUNT_FILE);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
          console.log("✅ Service stopped.");
        } catch (e) {
          logger.debug('Stop error during restart', { error: e });
          cleanupPidFile();
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
