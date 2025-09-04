import { spawn, type StdioOptions } from "child_process";
import { readConfigFile } from ".";
import { closeService } from "./close";
import {
  decrementReferenceCount,
  incrementReferenceCount,
} from "./processCheck";
import { execSync } from "child_process";
import path from "path";

// ANSI Colors for terminal output
const COLORS = {
  reset: "\x1b[0m",
  bright_blue: "\x1b[94m",
  bright_green: "\x1b[92m", 
  bright_magenta: "\x1b[95m",
  bright_cyan: "\x1b[96m",
  bright_yellow: "\x1b[93m",
  white: "\x1b[97m",
} as const;

// ANSI codes pentru cursor positioning
const ANSI = {
  saveCursor: '\x1b[s',
  restoreCursor: '\x1b[u',
  moveCursorToBottom: '\x1b[999;1H', // Move to bottom of screen
  clearLine: '\x1b[2K',
  moveCursorUp: (lines: number) => `\x1b[${lines}A`,
  moveCursorToColumn: (col: number) => `\x1b[${col}G`,
} as const;

async function createPersistentStatusLine(config: any, workDir: string = process.cwd()) {
  if (!config?.StatusLine?.enabled) return null;
  
  try {
    // Get current directory name
    const workDirName = path.basename(workDir);
    
    // Get git branch
    let gitBranch = "";
    try {
      gitBranch = execSync("git branch --show-current", {
        cwd: workDir,
        stdio: ["pipe", "pipe", "ignore"],
      }).toString().trim();
    } catch (error) {
      gitBranch = "no-git";
    }
    
    // Get current style modules
    const currentStyle = config.StatusLine.currentStyle || 'default';
    const styleConfig = config.StatusLine[currentStyle];
    
    if (!styleConfig?.modules) return null;
    
    // Build status line
    let statusLine = "";
    for (const module of styleConfig.modules) {
      let text = module.text || '';
      
      // Replace variables
      text = text.replace(/\{\{workDirName\}\}/g, workDirName);
      text = text.replace(/\{\{gitBranch\}\}/g, gitBranch);
      text = text.replace(/\{\{model\}\}/g, 'running...');
      text = text.replace(/\{\{inputTokens\}\}/g, '0');
      text = text.replace(/\{\{outputTokens\}\}/g, '0');
      
      // Apply color
      const color = COLORS[module.color as keyof typeof COLORS] || '';
      const icon = module.icon || '';
      
      statusLine += `${color}${icon} ${text}${COLORS.reset} `;
    }
    
    if (statusLine.trim()) {
      return statusLine.trim();
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

function displayPersistentStatusLine(statusLine: string) {
  // Save current cursor position, move to bottom, clear line, write status, restore cursor
  process.stdout.write(
    ANSI.saveCursor + 
    ANSI.moveCursorToBottom + 
    ANSI.clearLine + 
    statusLine + 
    ANSI.restoreCursor
  );
}

async function showTerminalStatusLine(config: any, workDir: string = process.cwd(), position: 'top' | 'bottom' = 'top') {
  if (!config?.StatusLine?.enabled) return;
  
  try {
    // Get current directory name
    const workDirName = path.basename(workDir);
    
    // Get git branch
    let gitBranch = "";
    try {
      gitBranch = execSync("git branch --show-current", {
        cwd: workDir,
        stdio: ["pipe", "pipe", "ignore"],
      }).toString().trim();
    } catch (error) {
      gitBranch = "no-git";
    }
    
    // Get current style modules
    const currentStyle = config.StatusLine.currentStyle || 'default';
    const styleConfig = config.StatusLine[currentStyle];
    
    if (!styleConfig?.modules) return;
    
    // Build status line
    let statusLine = "";
    for (const module of styleConfig.modules) {
      let text = module.text || '';
      
      // Replace variables
      text = text.replace(/\{\{workDirName\}\}/g, workDirName);
      text = text.replace(/\{\{gitBranch\}\}/g, gitBranch);
      text = text.replace(/\{\{model\}\}/g, position === 'top' ? 'starting...' : 'completed');
      text = text.replace(/\{\{inputTokens\}\}/g, '0');
      text = text.replace(/\{\{outputTokens\}\}/g, '0');
      
      // Apply color
      const color = COLORS[module.color as keyof typeof COLORS] || '';
      const icon = module.icon || '';
      
      statusLine += `${color}${icon} ${text}${COLORS.reset} `;
    }
    
    if (statusLine.trim()) {
      if (position === 'bottom') {
        // Move cursor to bottom and add status line
        console.log('\n' + '─'.repeat(60));
        console.log(statusLine.trim());
      } else {
        // Original top position
        console.log(`\n${statusLine.trim()}`);
        console.log('─'.repeat(60));
      }
    }
  } catch (error) {
    // Silently ignore statusline errors
  }
}

export async function executeCodeCommand(args: string[] = []) {
  // Set environment variables
  const config = await readConfigFile();
  const env: Record<string, string> = {
    ...process.env,
    ANTHROPIC_AUTH_TOKEN: config?.APIKEY || "test",
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${config.PORT || 3456}`,
    API_TIMEOUT_MS: String(config.API_TIMEOUT_MS ?? 600000), // Default to 10 minutes if not set
  };
  let settingsFlag: Record<string, any> | undefined;
  if (config?.StatusLine?.enabled) {
    settingsFlag = {
      statusLine: {
        type: "command",
        command: "/home/mircea/.nvm/versions/node/v22.16.0/bin/ccr statusline",
        padding: 1,
      }
    }
    const settingsArg = `--settings=${JSON.stringify(settingsFlag)}`;
    args.push(settingsArg);
  }

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

  // if (config?.APIKEY) {
  //   env.ANTHROPIC_API_KEY = config.APIKEY;
  //   delete env.ANTHROPIC_AUTH_TOKEN;
  // }

  // Nu mai afișez statusline la început

  // Increment reference count when command starts
  incrementReferenceCount();

  // Setup persistent StatusLine in terminal (every 2 seconds)
  let statusLineInterval: NodeJS.Timeout | null = null;
  if (config?.StatusLine?.enabled && !config.NON_INTERACTIVE_MODE) {
    const statusLineText = await createPersistentStatusLine(config, process.cwd());
    if (statusLineText) {
      statusLineInterval = setInterval(() => {
        displayPersistentStatusLine(statusLineText);
      }, 2000); // Update every 2 seconds
      
      // Display immediately
      displayPersistentStatusLine(statusLineText);
    }
  }

  // Execute claude command
  const claudePath = config?.CLAUDE_PATH || process.env.CLAUDE_PATH || "claude";

  // Properly join arguments to preserve spaces in quotes
  // Wrap each argument in double quotes to preserve single and double quotes inside arguments
  const joinedArgs =
    args.length > 0
      ? args.map((arg) => `"${arg.replace(/\"/g, '\\"')}"`).join(" ")
      : "";

  // 🔥 CONFIG-DRIVEN: stdio configuration based on environment
  const stdioConfig: StdioOptions = config.NON_INTERACTIVE_MODE
    ? ["pipe", "inherit", "inherit"] // Pipe stdin for non-interactive
    : "inherit"; // Default inherited behavior

  const claudeProcess = spawn(
    claudePath + (joinedArgs ? ` ${joinedArgs}` : ""),
    [],
    {
      env,
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
    
    // Clear persistent StatusLine interval
    if (statusLineInterval) {
      clearInterval(statusLineInterval);
      statusLineInterval = null;
    }
    
    decrementReferenceCount();
    process.exit(1);
  });

  claudeProcess.on("close", (code) => {
    console.log("🔄 Claude Code process closed, cleaning up services...");
    
    // Clear persistent StatusLine interval
    if (statusLineInterval) {
      clearInterval(statusLineInterval);
      statusLineInterval = null;
    }
    
    // Show terminal statusline at bottom after command completes
    showTerminalStatusLine(config, process.cwd(), 'bottom').then(() => {
      decrementReferenceCount();
      
      // Force cleanup on exit
      closeService().then(() => {
        process.exit(code || 0);
      }).catch(() => {
        process.exit(code || 0);
      });
    });
  });

  // Handle unexpected exits
  process.on('SIGINT', () => {
    console.log("🛑 Received SIGINT, cleaning up...");
    
    // Clear persistent StatusLine interval
    if (statusLineInterval) {
      clearInterval(statusLineInterval);
      statusLineInterval = null;
    }
    
    showTerminalStatusLine(config, process.cwd(), 'bottom').then(() => {
      decrementReferenceCount();
      closeService().then(() => process.exit(0));
    });
  });

  process.on('SIGTERM', () => {
    console.log("🛑 Received SIGTERM, cleaning up...");
    
    // Clear persistent StatusLine interval
    if (statusLineInterval) {
      clearInterval(statusLineInterval);
      statusLineInterval = null;
    }
    
    showTerminalStatusLine(config, process.cwd(), 'bottom').then(() => {
      decrementReferenceCount();
      closeService().then(() => process.exit(0));
    });
  });
}
