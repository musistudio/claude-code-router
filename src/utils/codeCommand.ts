import { spawn } from "child_process";
import {
  incrementReferenceCount,
  decrementReferenceCount,
} from "./processCheck";
import { closeService } from "./close";
import { readConfigFile } from ".";
import {isDevMode} from "@/constants";

export async function executeCodeCommand(args: string[] = []) {
  // Set environment variables
  const config = await readConfigFile();
  const port = process.env.NODE_ENV === 'development' ? 3457 : (config.PORT || 3456);
  const host = config.HOST || "127.0.0.1"
  const env : {
    [key: string]: string | undefined;
  } =  {
    ...process.env,
    ANTHROPIC_BASE_URL: `http://${host}:${port}`,
    API_TIMEOUT_MS: String(config.API_TIMEOUT_MS ?? 600000), // Default to 10 minutes if not set
  };

  // Configure authentication: use API key if provided, otherwise use test token
  if (config?.APIKEY) {
    env.ANTHROPIC_API_KEY = config.APIKEY;
  } else {
    env.ANTHROPIC_AUTH_TOKEN = "test_router_token_123";
  }

  // Increment reference count to track active processes and prevent premature shutdown
  incrementReferenceCount();

  // Execute claude command
  const claudePath = process.env.CLAUDE_PATH || "claude";

  // Spawn Claude process with inherited stdio for real-time output
  const claudeProcess = spawn(claudePath, args, {
    env,
    stdio: "inherit",
    shell: false,
  });


  claudeProcess.on("error", (error) => {
    console.error(`${isDevMode() ? 'Development' :'' }. Failed to start claude command:${error.message}`);
    console.log(
      "Make sure Claude Code is installed: npm install -g @anthropic-ai/claude-code"
    );
    decrementReferenceCount();
    closeService();
    process.exit(1);
  });

  claudeProcess.on("close", (code) => {
    console.log(`${isDevMode() ? 'Development' :'' }. Claude command exited with code ${code}`);
    decrementReferenceCount();
    closeService();
    process.exit(code || 0);
  });

  claudeProcess.stderr?.on("data", (data) => {
    console.error(`Error: ${data}`);
  })

  claudeProcess.stdout?.on("data", (data) => {
    console.log(`Output: ${data}`);
  })
}
