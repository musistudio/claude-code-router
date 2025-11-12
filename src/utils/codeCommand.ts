import { spawn, type StdioOptions } from "child_process";
import { readConfigFile } from ".";
import { closeService } from "./close";
import {
  decrementReferenceCount,
  incrementReferenceCount,
} from "./processCheck";
import { quote } from 'shell-quote';
import minimist from "minimist";


export async function executeCodeCommand(args: string[] = []) {
  // Set environment variables
  const config = await readConfigFile();
  const port = config.PORT || 3456;
  const env: Record<string, string> = {
    ANTHROPIC_AUTH_TOKEN: config?.APIKEY || "test",
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    NO_PROXY: `127.0.0.1`,
    DISABLE_TELEMETRY: 'true',
    DISABLE_COST_WARNINGS: 'true',
    API_TIMEOUT_MS: String(config.API_TIMEOUT_MS ?? 600000), // Default to 10 minutes if not set
   // Reset CLAUDE_CODE_USE_BEDROCK when running with ccr code
    CLAUDE_CODE_USE_BEDROCK: undefined,
  };
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
  args.push('--settings', `${JSON.stringify(settingsFlag)}`);

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

  // Execute claude command
  const claudePath = config?.CLAUDE_PATH || process.env.CLAUDE_PATH || "claude";

  // Security: Validate claudePath doesn't contain shell metacharacters
  if (/[;&|`$()]/.test(claudePath)) {
    console.error("Invalid CLAUDE_PATH: contains shell metacharacters");
    decrementReferenceCount();
    process.exit(1);
  }

  const stdioConfig: StdioOptions = config.NON_INTERACTIVE_MODE
    ? ["pipe", "inherit", "inherit"] // Pipe stdin for non-interactive
    : "inherit"; // Default inherited behavior

  const argsObj = minimist(args)
  const argsArr = []
  for (const [argsObjKey, argsObjValue] of Object.entries(argsObj)) {
    if (argsObjKey !== '_' && argsObj[argsObjKey]) {
      const prefix = argsObjKey.length === 1 ? '-' : '--';
      // For boolean flags, don't append the value
      if (argsObjValue === true) {
        argsArr.push(`${prefix}${argsObjKey}`);
      } else {
        // Security: Pass as separate arguments instead of concatenating
        argsArr.push(`${prefix}${argsObjKey}`);
        argsArr.push(String(argsObjValue));
      }
    }
  }

  // Security: Use spawn without shell to prevent command injection
  const claudeProcess = spawn(
    claudePath,
    argsArr,
    {
      env: process.env,
      stdio: stdioConfig,
      shell: false,
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
