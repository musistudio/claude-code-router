import { spawn, type StdioOptions } from "child_process";
import { readConfigFile } from ".";
import { closeService } from "./close";
import {
  decrementReferenceCount,
  incrementReferenceCount,
} from "./processCheck";
import minimist from "minimist";


export async function executeCodeCommand(args: string[] = []) {
  // Set environment variables
  const config = await readConfigFile();
  const port = config.PORT || 3456;
  const env: Record<string, string | undefined> = {
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
  const settingsFlag: Record<string, any> = {
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
      } else if (Array.isArray(argsObjValue)) {
        // Array values: add each as separate flag-value pair
        for (const item of argsObjValue) {
          argsArr.push(`${prefix}${argsObjKey} ${JSON.stringify(item)}`)
        }
      } else {
        // Single value
        argsArr.push(`${prefix}${argsObjKey} ${JSON.stringify(argsObjValue)}`)
      }
    }
  }
  const claudeProcess = spawn(
    claudePath,
    argsArr,
    {
      env: process.env,
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
