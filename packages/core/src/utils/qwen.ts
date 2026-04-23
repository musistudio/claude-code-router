// packages/core/src/utils/qwen.ts
export const QWEN_THINK_TAGS = {
  start: "<think>",
  end: "</think>"
};

export function extractQwenThinking(text: string): { thinking: string; content: string } {
  const startTag = QWEN_THINK_TAGS.start;
  const endTag = QWEN_THINK_TAGS.end;
  
  if (text.includes(startTag)) {
    const parts = text.split(startTag);
    const preThinking = parts[0];
    const rest = parts[1];
    
    if (rest.includes(endTag)) {
      const innerParts = rest.split(endTag);
      return {
        thinking: innerParts[0].trim(),
        content: (preThinking + (innerParts[1] || "")).trim()
      };
    }
    return {
      thinking: rest.trim(),
      content: preThinking.trim()
    };
  }
  return { thinking: "", content: text.trim() };
}

export const TOOL_NAME_MAP: Record<string, string> = {
  "run_bash_command": "Bash",
  "Bash": "Bash",
  "edit_file": "Edit",
  "Edit": "Edit",
  "read_file": "Read",
  "Read": "Read",
  "glob": "Glob",
  "Glob": "Glob",
  "grep": "Grep",
  "Grep": "Grep",
  "ls": "Ls",
  "Ls": "Ls",
  "write_file": "Write",
  "Write": "Write"
};

export const REVERSE_TOOL_NAME_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(TOOL_NAME_MAP).map(([k, v]) => [v, k])
);

export function mapToolName(name: string): string {
  return TOOL_NAME_MAP[name] || name;
}

export function unmapToolName(name: string): string {
  return REVERSE_TOOL_NAME_MAP[name] || name;
}
