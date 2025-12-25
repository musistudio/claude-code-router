import { spawn, type StdioOptions } from "child_process";
import { readConfigFile } from ".";
import { closeService } from "./close";
import {
  decrementReferenceCount,
  incrementReferenceCount,
} from "./processCheck";
import { quote } from 'shell-quote';
import minimist from "minimist";
import { createEnvVariables } from "./createEnvVariables";


export async function executeCodeCommand(args: string[] = []) {
  // Set environment variables using shared function
  const config = await readConfigFile();
  const env = await createEnvVariables();
  const settingsFlag = {
    env
  };
  if (config?.StatusLine?.enabled) {
    settingsFlag.statusLine = {
      type: "command",
      command: "ccr statusline",
      padding: 0,
    }
  }
  // args.push('--settings', `${JSON.stringify(settingsFlag)}`);

  // Non-interactive mode for automation environments
  if (config.NON_INTERACTIVE_MODE) {
    env.CI = "true";
    env.FORCE_COLOR = "0";
    env.NODE_NO_READLINE = "1";
    env.TERM = "dumb";
  }

  // Set ANTHROPIC_SMALL_FAST_MODEL if it exists in config
  if (config?.ANTHROPIC_SMALL_FAST_MODEL) {
    env.ANTHROPIC_SMALL_FAST_MODEL = config.ANTHROPIC_SMALL_FAST_MODEL;
  }

  // Increment reference count when command starts
  incrementReferenceCount();

  // Parse arguments to handle claude-option forwarding
  // We need to manually parse because minimist doesn't handle options with values well when they're mixed
  const claudeOptions: string[] = [];
  const regularArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--claude-option' || arg === '-C') {
      // Next argument is the value for claude-option
      if (i + 1 < args.length) {
        claudeOptions.push(args[i + 1]);
        i++; // Skip the next argument since we consumed it
      }
    } else if (arg.startsWith('--claude-option=')) {
      // Handle --claude-option=value format
      const value = arg.substring('--claude-option='.length);
      claudeOptions.push(value);
    } else if (arg.startsWith('-C=')) {
      // Handle -C=value format
      const value = arg.substring('-C='.length);
      claudeOptions.push(value);
    } else {
      regularArgs.push(arg);
    }
  }

  // Execute claude command
  const claudePath = config?.CLAUDE_PATH || process.env.CLAUDE_PATH || "claude";

  const stdioConfig: StdioOptions = config.NON_INTERACTIVE_MODE
    ? ["pipe", "inherit", "inherit"] // Pipe stdin for non-interactive
    : "inherit"; // Default inherited behavior

  // Build final args for Claude Code: regular args + forwarded claude options
  const finalClaudeArgs = [
    ...regularArgs,
    ...claudeOptions.flatMap(option => {
      // Split options by spaces while preserving quoted strings
      const parts: string[] = [];
      let current = '';
      let inQuotes = false;
      let quoteChar = '';

      for (let i = 0; i < option.length; i++) {
        const char = option[i];
        if ((char === '"' || char === "'") && !inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar && inQuotes) {
          inQuotes = false;
          quoteChar = '';
        } else if (char === ' ' && !inQuotes) {
          if (current) {
            parts.push(current);
            current = '';
          }
        } else {
          current += char;
        }
      }
      if (current) {
        parts.push(current);
      }
      return parts;
    })
  ];

  const claudeProcess = spawn(
    claudePath,
    finalClaudeArgs,
    {
      env: {
        ...process.env,
        ...env
      },
      stdio: stdioConfig,
      shell: true,
    }
  );

  // Close stdin for non-interactive mode
  if (config.NON_INTERACTIVE_MODE) {
    claudeProcess.stdin?.end();
  }

  claudeProcess.on("error", (error) => {
    console.error("Failed to start claude command:", error.message);
    console.log(
      "Make sure Claude Code is installed: npm install -g @anthropic-ai/claude-code"
    );
    decrementReferenceCount();
    process.exit(1);
  });

  claudeProcess.on("close", (code) => {
    decrementReferenceCount();
    closeService();
    process.exit(code || 0);
  });
}
