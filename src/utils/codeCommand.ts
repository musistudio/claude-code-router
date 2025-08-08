import { spawn, type StdioOptions } from "child_process";
import { readConfigFile } from ".";
import { closeService } from "./close";
import {
  decrementReferenceCount,
  incrementReferenceCount,
} from "./processCheck";

export async function executeCodeCommand(args: string[] = []) {
  // Set environment variables
  const config = await readConfigFile();
  const env: Record<string, string> = {
    ...process.env,
    ANTHROPIC_AUTH_TOKEN: "test",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${config.PORT || 3456}`,
    API_TIMEOUT_MS: String(config.API_TIMEOUT_MS ?? 600000), // Default to 10 minutes if not set
  };

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

  if (config?.APIKEY) {
    env.ANTHROPIC_API_KEY = config.APIKEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
  }

  // Increment reference count when command starts
  incrementReferenceCount();

  // Execute claude command
  const claudePath = process.env.CLAUDE_PATH || "claude";
  
  // Properly join arguments to preserve spaces in quotes
  // Wrap each argument in double quotes to preserve single and double quotes inside arguments
  const joinedArgs = args.length > 0 ? args.map(arg => `"${arg.replace(/\"/g, '\\"')}"`).join(" ") : "";

  // 🔥 CONFIG-DRIVEN: stdio configuration based on environment
  const stdioConfig: StdioOptions = config.NON_INTERACTIVE_MODE
    ? ["pipe", "inherit", "inherit"] // Pipe stdin for non-interactive
    : "inherit"; // Default inherited behavior

  const claudeProcess = spawn(claudePath + (joinedArgs ? ` ${joinedArgs}` : ""), [], {
    env,
    stdio: stdioConfig,
    shell: true,
  });

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
