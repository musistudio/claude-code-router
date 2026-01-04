import { spawn, type StdioOptions } from "child_process";
import {getSettingsPath, readConfigFile} from ".";
import {
  decrementReferenceCount,
  incrementReferenceCount,
  closeService,
} from "./processCheck";
import { quote } from 'shell-quote';
import minimist from "minimist";
import { createEnvVariables } from "./createEnvVariables";

export interface PresetConfig {
  noServer?: boolean;
  claudeCodeSettings?: {
    env?: Record<string, any>;
    statusLine?: any;
    [key: string]: any;
  };
  provider?: string;
  router?: Record<string, any>;
  StatusLine?: any;  // Preset's StatusLine configuration
  [key: string]: any;
}

export async function executeCodeCommand(
  args: string[] = [],
  presetConfig?: PresetConfig | null,
  envOverrides?: Record<string, string>,
  presetName?: string  // Preset name for statusline command
) {
  // Set environment variables using shared function
  const config = await readConfigFile();
  const env = await createEnvVariables();

  // Apply environment variable overrides (from preset's provider configuration)
  if (envOverrides) {
    Object.assign(env, envOverrides);
  }

  // Build settingsFlag
  let settingsFlag: ClaudeSettingsFlag = {
    env: env as ClaudeSettingsFlag['env']
  };

  // Add statusLine configuration
  // Priority: preset.StatusLine > global config.StatusLine
  const statusLineConfig = presetConfig?.StatusLine || config?.StatusLine;

  if (statusLineConfig?.enabled) {
    // If using preset, pass preset name to statusline command
    const statuslineCommand = presetName
      ? `ccr statusline ${presetName}`
      : "ccr statusline";

    settingsFlag.statusLine = {
      type: "command",
      command: statuslineCommand,
      padding: 0,
    }
  }

  // Merge claudeCodeSettings from preset into settingsFlag
  if (presetConfig?.claudeCodeSettings) {
    settingsFlag = {
      ...settingsFlag,
      ...presetConfig.claudeCodeSettings,
      // Deep merge env
      env: {
        ...settingsFlag.env,
        ...presetConfig.claudeCodeSettings.env,
      } as ClaudeSettingsFlag['env']
    };
  }

  // Non-interactive mode for automation environments
  if (config.NON_INTERACTIVE_MODE) {
    settingsFlag.env = {
      ...settingsFlag.env,
      CI: "true",
      FORCE_COLOR: "0",
      NODE_NO_READLINE: "1",
      TERM: "dumb"
    }
  }

  const settingsFile = await getSettingsPath(`${JSON.stringify(settingsFlag)}`)

  args.push('--settings', settingsFile);

  // Increment reference count when command starts
  incrementReferenceCount();

  // Execute claude command
  const claudePath = config?.CLAUDE_PATH || process.env.CLAUDE_PATH || "claude";

  const joinedArgs = args.length > 0 ? quote(args) : "";

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
        argsArr.push(`${prefix}${argsObjKey} ${JSON.stringify(argsObjValue)}`);
      }
    }
  }
  const claudeProcess = spawn(
    claudePath,
    argsArr,
    {
      env: {
        ...process.env,
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
