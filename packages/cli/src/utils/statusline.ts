import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "child_process";
import { tmpdir } from "node:os";
import { CONFIG_FILE, HOME_DIR, readPresetFile, getPresetDir, loadConfigFromManifest } from "@CCR/shared";
import JSON5 from "json5";

export interface StatusLineModuleConfig {
    type: string;
    icon?: string;
    text: string;
    color?: string;
    background?: string;
    scriptPath?: string;
    options?: Record<string, any>;
}

export interface StatusLineThemeConfig {
    modules: StatusLineModuleConfig[];
}

export interface StatusLineInput {
    hook_event_name: string;
    session_id: string;
    transcript_path: string;
    cwd: string;
    model: {
        id: string;
        display_name: string;
    };
    workspace: {
        current_dir: string;
        project_dir: string;
    };
    version?: string;
    output_style?: {
        name: string;
    };
    cost?: {
        total_cost_usd: number;
        total_duration_ms: number;
        total_api_duration_ms: number;
        total_lines_added: number;
        total_lines_removed: number;
    };
    context_window?: {
        total_input_tokens: number;
        total_output_tokens: number;
        context_window_size: number;
        current_usage: {
            input_tokens: number;
            output_tokens: number;
            cache_creation_input_tokens: number;
            cache_read_input_tokens: number;
        } | null;
    };
}

export interface AssistantMessage {
    type: "assistant";
    message: {
        model: string;
        usage: {
            input_tokens: number;
            output_tokens: number;
        };
    };
}

// ANSI Color codes
const COLORS: Record<string, string> = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    // Standard colors
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    // Bright colors
    bright_black: "\x1b[90m",
    bright_red: "\x1b[91m",
    bright_green: "\x1b[92m",
    bright_yellow: "\x1b[93m",
    bright_blue: "\x1b[94m",
    bright_magenta: "\x1b[95m",
    bright_cyan: "\x1b[96m",
    bright_white: "\x1b[97m",
    // Background colors
    bg_black: "\x1b[40m",
    bg_red: "\x1b[41m",
    bg_green: "\x1b[42m",
    bg_yellow: "\x1b[43m",
    bg_blue: "\x1b[44m",
    bg_magenta: "\x1b[45m",
    bg_cyan: "\x1b[46m",
    bg_white: "\x1b[47m",
    // Bright background colors
    bg_bright_black: "\x1b[100m",
    bg_bright_red: "\x1b[101m",
    bg_bright_green: "\x1b[102m",
    bg_bright_yellow: "\x1b[103m",
    bg_bright_blue: "\x1b[104m",
    bg_bright_magenta: "\x1b[105m",
    bg_bright_cyan: "\x1b[106m",
    bg_bright_white: "\x1b[107m",
};

// Use TrueColor (24-bit color) to support hexadecimal colors
const TRUE_COLOR_PREFIX = "\x1b[38;2;";
const TRUE_COLOR_BG_PREFIX = "\x1b[48;2;";

// Convert hexadecimal color to RGB format
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    // Remove # and spaces
    hex = hex.replace(/^#/, '').trim();

    // Handle shorthand form (#RGB -> #RRGGBB)
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }

    if (hex.length !== 6) {
        return null;
    }

    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Validate RGB values
    if (isNaN(r) || isNaN(g) || isNaN(b) || r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
        return null;
    }

    return { r, g, b };
}

// Get color code
function getColorCode(colorName: string): string {
    // Check if it's a hexadecimal color
    if (colorName.startsWith('#') || /^[0-9a-fA-F]{6}$/.test(colorName) || /^[0-9a-fA-F]{3}$/.test(colorName)) {
        const rgb = hexToRgb(colorName);
        if (rgb) {
            return `${TRUE_COLOR_PREFIX}${rgb.r};${rgb.g};${rgb.b}m`;
        }
    }

    // Default to empty string
    return "";
}


// Variable replacement function, supports {{var}} format variable replacement
function replaceVariables(text: string, variables: Record<string, string>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_match, varName) => {
        return variables[varName] || "";
    });
}

// Execute script and get output
async function executeScript(scriptPath: string, variables: Record<string, string>, options?: Record<string, any>): Promise<string> {
    try {
        // Check if file exists
        await fs.access(scriptPath);

        // Use require to dynamically load script module
        const scriptModule = require(scriptPath);

        // If export is a function, call it with variables
        if (typeof scriptModule === 'function') {
            const result = scriptModule(variables, options);
            // If returns a Promise, wait for it to complete
            if (result instanceof Promise) {
                return await result;
            }
            return result;
        }

        // If export is a default function, call it
        if (scriptModule.default && typeof scriptModule.default === 'function') {
            const result = scriptModule.default(variables);
            // If returns a Promise, wait for it to complete
            if (result instanceof Promise) {
                return await result;
            }
            return result;
        }

        // If export is a string, return directly
        if (typeof scriptModule === 'string') {
            return scriptModule;
        }

        // If export is a default string, return it
        if (scriptModule.default && typeof scriptModule.default === 'string') {
            return scriptModule.default;
        }

        // Default to empty string
        return "";
    } catch (error) {
        console.error(`Error executing script ${scriptPath}:`, error);
        return "";
    }
}

// Default theme configuration - using Nerd Fonts icons and beautiful color scheme
const DEFAULT_THEME: StatusLineThemeConfig = {
    modules: [
        {
            type: "workDir",
            icon: "󰉋", // nf-md-folder_outline
            text: "{{workDirName}}",
            color: "bright_blue"
        },
        {
            type: "gitBranch",
            icon: "", // nf-dev-git_branch
            text: "{{gitBranch}}",
            color: "bright_magenta"
        },
        {
            type: "model",
            icon: "󰚩", // nf-md-robot_outline
            text: "{{model}}",
            color: "bright_cyan"
        },
        {
            type: "usage",
            icon: "↑", // Up arrow
            text: "{{inputTokens}}",
            color: "bright_green"
        },
        {
            type: "usage",
            icon: "↓", // Down arrow
            text: "{{outputTokens}}",
            color: "bright_yellow"
        }
    ]
};

// Powerline style theme configuration
const POWERLINE_THEME: StatusLineThemeConfig = {
    modules: [
        {
            type: "workDir",
            icon: "󰉋", // nf-md-folder_outline
            text: "{{workDirName}}",
            color: "white",
            background: "bg_bright_blue"
        },
        {
            type: "gitBranch",
            icon: "", // nf-dev-git_branch
            text: "{{gitBranch}}",
            color: "white",
            background: "bg_bright_magenta"
        },
        {
            type: "model",
            icon: "󰚩", // nf-md-robot_outline
            text: "{{model}}",
            color: "white",
            background: "bg_bright_cyan"
        },
        {
            type: "usage",
            icon: "↑", // Up arrow
            text: "{{inputTokens}}",
            color: "white",
            background: "bg_bright_green"
        },
        {
            type: "usage",
            icon: "↓", // Down arrow
            text: "{{outputTokens}}",
            color: "white",
            background: "bg_bright_yellow"
        }
    ]
};

// Simple text theme configuration - fallback for when icons cannot be displayed
const SIMPLE_THEME: StatusLineThemeConfig = {
    modules: [
        {
            type: "workDir",
            icon: "",
            text: "{{workDirName}}",
            color: "bright_blue"
        },
        {
            type: "gitBranch",
            icon: "",
            text: "{{gitBranch}}",
            color: "bright_magenta"
        },
        {
            type: "model",
            icon: "",
            text: "{{model}}",
            color: "bright_cyan"
        },
        {
            type: "usage",
            icon: "↑",
            text: "{{inputTokens}}",
            color: "bright_green"
        },
        {
            type: "usage",
            icon: "↓",
            text: "{{outputTokens}}",
            color: "bright_yellow"
        }
    ]
};

// Full theme configuration - showcasing all available modules
const FULL_THEME: StatusLineThemeConfig = {
    modules: [
        {
            type: "workDir",
            icon: "󰉋",
            text: "{{workDirName}}",
            color: "bright_blue"
        },
        {
            type: "gitBranch",
            icon: "",
            text: "{{gitBranch}}",
            color: "bright_magenta"
        },
        {
            type: "model",
            icon: "󰚩",
            text: "{{model}}",
            color: "bright_cyan"
        },
        {
            type: "context",
            icon: "🪟",
            text: "{{contextPercent}}% / {{contextWindowSize}}",
            color: "bright_green"
        },
        {
            type: "speed",
            icon: "⚡",
            text: "{{tokenSpeed}} t/s {{isStreaming}}",
            color: "bright_yellow"
        },
        {
            type: "cost",
            icon: "💰",
            text: "{{cost}}",
            color: "bright_magenta"
        },
        {
            type: "duration",
            icon: "⏱️",
            text: "{{duration}}",
            color: "bright_white"
        },
        {
            type: "lines",
            icon: "📝",
            text: "+{{linesAdded}}/-{{linesRemoved}}",
            color: "bright_cyan"
        }
    ]
};

// Format usage information, use k unit if greater than 1000
function formatUsage(input_tokens: number, output_tokens: number): string {
    if (input_tokens > 1000 || output_tokens > 1000) {
        const inputFormatted = input_tokens > 1000 ? `${(input_tokens / 1000).toFixed(1)}k` : `${input_tokens}`;
        const outputFormatted = output_tokens > 1000 ? `${(output_tokens / 1000).toFixed(1)}k` : `${output_tokens}`;
        return `${inputFormatted} ${outputFormatted}`;
    }
    return `${input_tokens} ${output_tokens}`;
}

// Calculate context window usage percentage
function calculateContextPercent(context_window: StatusLineInput['context_window']): number {
    if (!context_window || !context_window.current_usage) {
        return 0;
    }
    const { current_usage, context_window_size } = context_window;
    const currentTokens = current_usage.input_tokens +
                        current_usage.cache_creation_input_tokens +
                        current_usage.cache_read_input_tokens;
    return Math.round((currentTokens / context_window_size) * 100);
}

// Format cost display
function formatCost(cost_usd: number): string {
    if (cost_usd < 0.01) {
        return `${(cost_usd * 100).toFixed(2)}¢`;
    }
    return `$${cost_usd.toFixed(2)}`;
}

// Format duration
function formatDuration(ms: number): string {
    if (Number.isNaN(ms)) {
        return ''
    }
    if (ms < 1000) {
        return `${ms}ms`;
    } else if (ms < 60000) {
        return `${(ms / 1000).toFixed(1)}s`;
    } else {
        const minutes = Math.floor(ms / 60000);
        const seconds = ((ms % 60000) / 1000).toFixed(0);
        if (Number.isNaN(minutes) || Number.isNaN(seconds)) {
            return ''
        }
        return `${minutes}m${seconds}s`;
    }
}

// Read token-speed statistics from temp file
async function getTokenSpeedStats(sessionId: string): Promise<{
    tokensPerSecond: number;
    timeToFirstToken?: number;
} | null> {
    try {
        // Use system temp directory
        const tempDir = path.join(tmpdir(), 'claude-code-router');

        // Check if temp directory exists
        try {
            await fs.access(tempDir);
        } catch {
            return null;
        }

        const statsFilePath = path.join(tempDir, `session-${sessionId}.json`);
        try {
            await fs.access(statsFilePath);
        } catch {
            return null;
        }

        // Read stats file
        const content = await fs.readFile(statsFilePath, 'utf-8');
        const data = JSON.parse(content);

        // Check if data has tokensPerSecond
        if (data.tokensPerSecond !== undefined && data.tokensPerSecond > 0) {
            // Check if timestamp is within last 3 seconds
            const now = Date.now();
            const timestamp = data.timestamp || 0;
            const ageInSeconds = (now - timestamp) / 1000;

            // If data is older than 3 seconds, return 0 speed
            if (ageInSeconds > 3) {
                return {
                    tokensPerSecond: 0,
                    timeToFirstToken: data.timeToFirstToken
                };
            }

            const result = {
                tokensPerSecond: parseInt(data.tokensPerSecond),
                timeToFirstToken: data.timeToFirstToken
            };
            return result;
        }

        return null;
    } catch (error) {
        // Silently fail on error
        return null;
    }
}

// Read theme configuration from user home directory
async function getProjectThemeConfig(): Promise<{ theme: StatusLineThemeConfig | null, style: string }> {
    try {
        // Only use fixed configuration file in home directory
        const configPath = CONFIG_FILE;

        // Check if configuration file exists
        try {
            await fs.access(configPath);
        } catch {
            return { theme: null, style: 'default' };
        }

        const configContent = await fs.readFile(configPath, "utf-8");
        const config = JSON5.parse(configContent);

        // Check if there's StatusLine configuration
        if (config.StatusLine) {
            // Get current style, default to 'default'
            const currentStyle = config.StatusLine.currentStyle || 'default';

            // Check if there's configuration for the corresponding style
            if (config.StatusLine[currentStyle] && config.StatusLine[currentStyle].modules) {
                return { theme: config.StatusLine[currentStyle], style: currentStyle };
            }
        }
    } catch (error) {
        // Return null if reading fails
        // console.error("Failed to read theme config:", error);
    }

    return { theme: null, style: 'default' };
}

// Read theme configuration from preset
async function getPresetThemeConfig(presetName: string): Promise<{ theme: StatusLineThemeConfig | null, style: string }> {
    try {
        // Read preset manifest
        const manifest = await readPresetFile(presetName);
        if (!manifest) {
            return { theme: null, style: 'default' };
        }

        // Load preset configuration (applies userValues if present)
        const presetDir = getPresetDir(presetName);
        const config = loadConfigFromManifest(manifest, presetDir);

        // Check if there's StatusLine configuration in preset
        if (config.StatusLine) {
            // Get current style, default to 'default'
            const currentStyle = config.StatusLine.currentStyle || 'default';

            // Check if there's configuration for the corresponding style
            if (config.StatusLine[currentStyle] && config.StatusLine[currentStyle].modules) {
                return { theme: config.StatusLine[currentStyle], style: currentStyle };
            }
        }
    } catch (error) {
        // Return null if reading fails
        // console.error("Failed to read preset theme config:", error);
    }

    return { theme: null, style: 'default' };
}

// Check if simple theme should be used (fallback scheme)
// When environment variable USE_SIMPLE_ICONS is set, or when a terminal that might not support Nerd Fonts is detected
function shouldUseSimpleTheme(): boolean {
    // Check environment variable
    if (process.env.USE_SIMPLE_ICONS === 'true') {
        return true;
    }

    // Check terminal type (some common terminals that don't support complex icons)
    const term = process.env.TERM || '';
    const unsupportedTerms = ['dumb', 'unknown'];
    if (unsupportedTerms.includes(term)) {
        return true;
    }

    // By default, assume terminal supports Nerd Fonts
    return false;
}

// Check if Nerd Fonts icons can be displayed correctly
// By checking terminal font information or using heuristic methods
function canDisplayNerdFonts(): boolean {
    // If environment variable explicitly specifies simple icons, Nerd Fonts cannot be displayed
    if (process.env.USE_SIMPLE_ICONS === 'true') {
        return false;
    }

    // Check some common terminal environment variables that support Nerd Fonts
    const fontEnvVars = ['NERD_FONT', 'NERDFONT', 'FONT'];
    for (const envVar of fontEnvVars) {
        const value = process.env[envVar];
        if (value && (value.includes('Nerd') || value.includes('nerd'))) {
            return true;
        }
    }

    // Check terminal type
    const termProgram = process.env.TERM_PROGRAM || '';
    const supportedTerminals = ['iTerm.app', 'vscode', 'Hyper', 'kitty', 'alacritty'];
    if (supportedTerminals.includes(termProgram)) {
        return true;
    }

    // Check COLORTERM environment variable
    const colorTerm = process.env.COLORTERM || '';
    if (colorTerm.includes('truecolor') || colorTerm.includes('24bit')) {
        return true;
    }

    // By default, assume Nerd Fonts can be displayed (but allow users to override via environment variables)
    return process.env.USE_SIMPLE_ICONS !== 'true';
}

export async function parseStatusLineData(input: StatusLineInput, presetName?: string): Promise<string> {
    try {
        // Check if simple theme should be used
        const useSimpleTheme = shouldUseSimpleTheme();

        // Check if Nerd Fonts icons can be displayed
        const canDisplayNerd = canDisplayNerdFonts();

        // Determine which theme to use: use simple theme if user forces it or Nerd Fonts cannot be displayed
        const effectiveTheme = useSimpleTheme || !canDisplayNerd ? SIMPLE_THEME : DEFAULT_THEME;

        // Get theme configuration: preset config > home directory config > default theme
        let projectTheme: StatusLineThemeConfig | null = null;
        let currentStyle = 'default';

        if (presetName) {
            // Try to get theme configuration from preset first
            const presetConfig = await getPresetThemeConfig(presetName);
            projectTheme = presetConfig.theme;
            currentStyle = presetConfig.style;
        }

        // If preset theme not found or no preset specified, try home directory config
        if (!projectTheme) {
            const homeConfig = await getProjectThemeConfig();
            projectTheme = homeConfig.theme;
            currentStyle = homeConfig.style;
        }

        const theme = projectTheme || effectiveTheme;

        // Get current working directory and Git branch
        const workDir = input.workspace.current_dir;
        let gitBranch = "";

        try {
            // Try to get Git branch name
            gitBranch = execSync("git branch --show-current", {
                cwd: workDir,
                stdio: ["pipe", "pipe", "ignore"],
            })
                .toString()
                .trim();
        } catch (error) {
            // If not a Git repository or retrieval fails, ignore error
        }

        // Read last assistant message from transcript_path file
        const transcriptContent = await fs.readFile(input.transcript_path, "utf-8");
        const lines = transcriptContent.trim().split("\n");

        // Traverse in reverse to find last assistant message
        let model = "";
        let inputTokens = 0;
        let outputTokens = 0;

        for (let i = lines.length - 1; i >= 0; i--) {
            try {
                const message: AssistantMessage = JSON.parse(lines[i]);
                if (message.type === "assistant" && message.message.model) {
                    model = message.message.model;

                    if (message.message.usage) {
                        inputTokens = message.message.usage.input_tokens;
                        outputTokens = message.message.usage.output_tokens;
                    }
                    break;
                }
            } catch (parseError) {
                // Ignore parse errors, continue searching
                continue;
            }
        }

        // If model name not retrieved from transcript, try to get from configuration file
        if (!model) {
            try {
                // Get project configuration file path
                const projectConfigPath = path.join(workDir, ".claude-code-router", "config.json");
                let configPath = projectConfigPath;

                // Check if project configuration file exists, if not use user home directory configuration file
                try {
                    await fs.access(projectConfigPath);
                } catch {
                    configPath = CONFIG_FILE;
                }

                // Read configuration file
                const configContent = await fs.readFile(configPath, "utf-8");
                const config = JSON5.parse(configContent);

                // Get model name from Router field's default content
                if (config.Router && config.Router.default) {
                    const [, defaultModel] = config.Router.default.split(",");
                    if (defaultModel) {
                        model = defaultModel.trim();
                    }
                }
            } catch (configError) {
                // If configuration file reading fails, ignore error
            }
        }

        // If still unable to get model name, use display_name from input JSON data's model field
        if (!model) {
            model = input.model.display_name;
        }

        // Get working directory name
        const workDirName = workDir.split("/").pop() || "";

        // Format usage information
        const usage = formatUsage(inputTokens, outputTokens);
        const [formattedInputTokens, formattedOutputTokens] = usage.split(" ");

        // Get token-speed statistics
        const tokenSpeedData = await getTokenSpeedStats(input.session_id);
        const formattedTokenSpeed = tokenSpeedData && tokenSpeedData.tokensPerSecond > 0
            ? tokenSpeedData.tokensPerSecond.toString()
            : '';

        // Check if streaming (has active token speed)
        const isStreaming = tokenSpeedData !== null && tokenSpeedData.tokensPerSecond > 0;

        const streamingIndicator = isStreaming ? '[Streaming]' : ''

        // Format time to first token
        let formattedTimeToFirstToken = '';
        if (tokenSpeedData?.timeToFirstToken !== undefined) {
            formattedTimeToFirstToken = formatDuration(tokenSpeedData.timeToFirstToken);
        }

        // Process context window data
        const contextPercent = input.context_window ? calculateContextPercent(input.context_window) : 0;
        const totalInputTokens = input.context_window?.total_input_tokens || 0;
        const totalOutputTokens = input.context_window?.total_output_tokens || 0;
        const contextWindowSize = input.context_window?.context_window_size || 0;

        // Process cost data
        const totalCost = input.cost?.total_cost_usd || 0;
        const formattedCost = totalCost > 0 ? formatCost(totalCost) : '';
        const totalDuration = input.cost?.total_duration_ms || 0;
        const formattedDuration = totalDuration > 0 ? formatDuration(totalDuration) : '';
        const linesAdded = input.cost?.total_lines_added || 0;
        const linesRemoved = input.cost?.total_lines_removed || 0;

        // Define variable replacement mapping
        const variables: Record<string, string> = {
            workDirName,
            gitBranch,
            model,
            inputTokens: formattedInputTokens,
            outputTokens: formattedOutputTokens,
            tokenSpeed: formattedTokenSpeed || '0',
            isStreaming: isStreaming ? 'streaming' : '',
            timeToFirstToken: formattedTimeToFirstToken,
            contextPercent: contextPercent.toString(),
            streamingIndicator,
            contextWindowSize: contextWindowSize > 1000 ? `${(contextWindowSize / 1000).toFixed(0)}k` : contextWindowSize.toString(),
            totalInputTokens: totalInputTokens > 1000 ? `${(totalInputTokens / 1000).toFixed(1)}k` : totalInputTokens.toString(),
            totalOutputTokens: totalOutputTokens > 1000 ? `${(totalOutputTokens / 1000).toFixed(1)}k` : totalOutputTokens.toString(),
            cost: formattedCost || '',
            duration: formattedDuration || '',
            linesAdded: linesAdded.toString(),
            linesRemoved: linesRemoved.toString(),
            netLines: (linesAdded - linesRemoved).toString(),
            version: input.version || '',
            sessionId: input.session_id.substring(0, 8)
        };

        // Determine the style to use
        const isPowerline = currentStyle === 'powerline';

        // Render status line based on style
        if (isPowerline) {
            return await renderPowerlineStyle(theme, variables);
        } else {
            return await renderDefaultStyle(theme, variables);
        }
    } catch (error) {
        // Return empty string on error
        return "";
    }
}

// Render default style status line
async function renderDefaultStyle(
    theme: StatusLineThemeConfig,
    variables: Record<string, string>
): Promise<string> {
    const modules = theme.modules || DEFAULT_THEME.modules;
    const parts: string[] = [];

    // Iterate through module array, rendering each module (maximum 10)
    for (let i = 0; i < modules.length; i++) {
        const module = modules[i];

        const color = module.color ? getColorCode(module.color) : "";
        const background = module.background ? getColorCode(module.background) : "";
        const icon = module.icon || "";

        // If script type, execute script to get text
        let text = "";
        if (module.type === "script" && module.scriptPath) {
            text = await executeScript(module.scriptPath, variables, module.options);
        } else {
            text = replaceVariables(module.text, variables);
        }

        // Build display text
        let displayText = "";
        if (icon) {
            displayText += `${icon} `;
        }
        displayText += text;

        // Skip module if displayText is empty or only has icon without actual text
        if (!displayText || !text) {
            continue;
        }

        // Build module string
        let part = `${background}${color}`;
        part += `${displayText}${COLORS.reset}`;

        parts.push(part);
    }

    // Join all parts with spaces
    return parts.join(" ");
}

// Powerline symbols
const SEP_RIGHT = "\uE0B0"; // 

// Color numbers (256-color table)
const COLOR_MAP: Record<string, number> = {
    // Basic colors mapped to 256 colors
    black: 0,
    red: 1,
    green: 2,
    yellow: 3,
    blue: 4,
    magenta: 5,
    cyan: 6,
    white: 7,
    bright_black: 8,
    bright_red: 9,
    bright_green: 10,
    bright_yellow: 11,
    bright_blue: 12,
    bright_magenta: 13,
    bright_cyan: 14,
    bright_white: 15,
    // Bright background color mapping
    bg_black: 0,
    bg_red: 1,
    bg_green: 2,
    bg_yellow: 3,
    bg_blue: 4,
    bg_magenta: 5,
    bg_cyan: 6,
    bg_white: 7,
    bg_bright_black: 8,
    bg_bright_red: 9,
    bg_bright_green: 10,
    bg_bright_yellow: 11,
    bg_bright_blue: 12,
    bg_bright_magenta: 13,
    bg_bright_cyan: 14,
    bg_bright_white: 15,
    // Custom color mapping
    bg_bright_orange: 202,
    bg_bright_purple: 129,
};

// Get TrueColor RGB value
function getTrueColorRgb(colorName: string): { r: number; g: number; b: number } | null {
    // If predefined color, return corresponding RGB
    if (COLOR_MAP[colorName] !== undefined) {
        const color256 = COLOR_MAP[colorName];
        return color256ToRgb(color256);
    }

    // Handle hexadecimal color
    if (colorName.startsWith('#') || /^[0-9a-fA-F]{6}$/.test(colorName) || /^[0-9a-fA-F]{3}$/.test(colorName)) {
        return hexToRgb(colorName);
    }

    // Handle background color hexadecimal
    if (colorName.startsWith('bg_#')) {
        return hexToRgb(colorName.substring(3));
    }

    return null;
}

// Convert 256-color table index to RGB value
function color256ToRgb(index: number): { r: number; g: number; b: number } | null {
    if (index < 0 || index > 255) return null;

    // ANSI 256-color table conversion
    if (index < 16) {
        // Basic colors
        const basicColors = [
            [0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0],
            [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192],
            [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0],
            [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]
        ];
        return { r: basicColors[index][0], g: basicColors[index][1], b: basicColors[index][2] };
    } else if (index < 232) {
        // 216 colors: 6×6×6 color cube
        const i = index - 16;
        const r = Math.floor(i / 36);
        const g = Math.floor((i % 36) / 6);
        const b = i % 6;
        const rgb = [0, 95, 135, 175, 215, 255];
        return { r: rgb[r], g: rgb[g], b: rgb[b] };
    } else {
        // Grayscale colors
        const gray = 8 + (index - 232) * 10;
        return { r: gray, g: gray, b: gray };
    }
}

// Generate a seamless segment: text displayed on bgN, separator transitions from bgN to nextBgN
function segment(text: string, textFg: string, bgColor: string, nextBgColor: string | null): string {
    const bgRgb = getTrueColorRgb(bgColor);
    if (!bgRgb) {
        // If unable to get RGB, use default blue background
        const defaultBlueRgb = { r: 33, g: 150, b: 243 };
        const curBg = `\x1b[48;2;${defaultBlueRgb.r};${defaultBlueRgb.g};${defaultBlueRgb.b}m`;
        const fgColor = `\x1b[38;2;255;255;255m`;
        const body = `${curBg}${fgColor} ${text} \x1b[0m`;
        return body;
    }

    const curBg = `\x1b[48;2;${bgRgb.r};${bgRgb.g};${bgRgb.b}m`;

    // Get foreground color RGB
    let fgRgb = { r: 255, g: 255, b: 255 }; // Default foreground color is white
    const textFgRgb = getTrueColorRgb(textFg);
    if (textFgRgb) {
        fgRgb = textFgRgb;
    }

    const fgColor = `\x1b[38;2;${fgRgb.r};${fgRgb.g};${fgRgb.b}m`;
    const body = `${curBg}${fgColor} ${text} \x1b[0m`;

    if (nextBgColor != null) {
        const nextBgRgb = getTrueColorRgb(nextBgColor);
        if (nextBgRgb) {
            // Separator: foreground color is current segment's background color, background color is next segment's background color
            const sepCurFg = `\x1b[38;2;${bgRgb.r};${bgRgb.g};${bgRgb.b}m`;
            const sepNextBg = `\x1b[48;2;${nextBgRgb.r};${nextBgRgb.g};${nextBgRgb.b}m`;
            const sep = `${sepCurFg}${sepNextBg}${SEP_RIGHT}\x1b[0m`;
            return body + sep;
        }
        // If no next background color, assume terminal background is black and render black arrow
        const sepCurFg = `\x1b[38;2;${bgRgb.r};${bgRgb.g};${bgRgb.b}m`;
        const sepNextBg = `\x1b[48;2;0;0;0m`; // Black background
        const sep = `${sepCurFg}${sepNextBg}${SEP_RIGHT}\x1b[0m`;
        return body + sep;
    }

    return body;
}

// Render Powerline style status line
async function renderPowerlineStyle(
    theme: StatusLineThemeConfig,
    variables: Record<string, string>
): Promise<string> {
    const modules = theme.modules || POWERLINE_THEME.modules;
    const segments: string[] = [];

    // Iterate through module array, rendering each module (maximum 10)
    for (let i = 0; i < Math.min(modules.length, 10); i++) {
        const module = modules[i];
        const color = module.color || "white";
        const backgroundName = module.background || "";
        const icon = module.icon || "";

        // If script type, execute script to get text
        let text = "";
        if (module.type === "script" && module.scriptPath) {
            text = await executeScript(module.scriptPath, variables);
        } else if (module.type === "speed") {
            // speed module: use tokenSpeed variable
            text = replaceVariables(module.text, variables);
        } else {
            text = replaceVariables(module.text, variables);
        }

        // Build display text
        let displayText = "";
        if (icon) {
            displayText += `${icon} `;
        }
        displayText += text;

        // Skip module if displayText is empty or only has icon without actual text
        if (!displayText || !text) {
            continue;
        }

        // Get next module's background color (for separator)
        let nextBackground: string | null = null;
        if (i < modules.length - 1) {
            const nextModule = modules[i + 1];
            nextBackground = nextModule.background || null;
        }

        // Use module-defined background color, or provide default background color for Powerline style
        const actualBackground = backgroundName || "bg_bright_blue";

        // Generate segment, supports hexadecimal colors
        const segmentStr = segment(displayText, color, actualBackground, nextBackground);
        segments.push(segmentStr);
    }

    return segments.join("");
}
