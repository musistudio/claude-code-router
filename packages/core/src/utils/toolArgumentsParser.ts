import JSON5 from "json5";
import { jsonrepair } from "jsonrepair";

// 预编译正则，提升超大字符串下的清洗性能
const STOP_TOKENS_REGEX = /<\|im_end\|>|<\|im_start\|>|<\|endoftext\|>|<\|file_separator\|>/g;
const MARKDOWN_CODE_BLOCK_REGEX = /^```(?:json|bash|typescript|javascript|python)?\s*([\s\S]*?)\s*```$/i;

/**
 * Parse tool call arguments function
 * First try standard JSON parsing, then JSON5 parsing, finally use jsonrepair for safe repair
 */
export function parseToolArguments(argsString: string, logger?: any): string {
  if (!argsString || argsString.trim() === "" || argsString === "{}") {
    return "{}";
  }

  // 1. 高性能清理停止符
  let cleanedArgs = argsString.replace(STOP_TOKENS_REGEX, "").trim();

  // 2. 深度清洗：剥离模型幻觉出的 Markdown 代码包裹
  // 例如：```json\n{"path": "..."}\n``` -> {"path": "..."}
  const markdownMatch = cleanedArgs.match(MARKDOWN_CODE_BLOCK_REGEX);
  if (markdownMatch && markdownMatch[1]) {
    cleanedArgs = markdownMatch[1].trim();
    logger?.debug(`Stripped markdown code block wrapper from tool arguments`);
  }

  try {
    // First attempt: Standard JSON parsing
    JSON.parse(cleanedArgs);
    return cleanedArgs;
  } catch (jsonError: any) {
    try {
      // Second attempt: JSON5 parsing for relaxed syntax
      const args = JSON5.parse(cleanedArgs);
      return JSON.stringify(args);
    } catch (json5Error: any) {
      try {
        // Third attempt: Safe JSON repair
        const repairedJson = jsonrepair(cleanedArgs);
        return repairedJson;
      } catch (repairError: any) {
        logger?.error(
          `JSON/JSON5/Repair all failed for tool args. Input: ${cleanedArgs.slice(0, 500)}...`
        );
        return "{}";
      }
    }
  }
}