import { spawn } from "child_process";
import {
  incrementReferenceCount,
  decrementReferenceCount,
} from "./processCheck";
import { closeService } from "./close";

export async function executeCodeCommand(args: string[] = []) {
  // Set environment variables
  const env = {
    ...process.env,
    HTTPS_PROXY: undefined,
    HTTP_PROXY: undefined,
    ALL_PROXY: undefined,
    https_proxy: undefined,
    http_proxy: undefined,
    all_proxy: undefined,
    DISABLE_PROMPT_CACHING: "1",
    ANTHROPIC_AUTH_TOKEN: "test",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:3456`,
    API_TIMEOUT_MS: "600000",
  };

  // Increment reference count when command starts
  incrementReferenceCount();

  // Execute claude command
  const claudePath = process.env.CLAUDE_PATH || "claude";
  const claudeProcess = spawn(claudePath, args, {
    env,
    stdio: "inherit",
    shell: false
  });

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
