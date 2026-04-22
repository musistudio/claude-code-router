import JSON5 from "json5";
import { jsonrepair } from "jsonrepair";

/**
 * Parse tool call arguments function
 * First try standard JSON parsing, then JSON5 parsing, finally use jsonrepair for safe repair
 *
 * @param argsString - Parameter string to parse
 * @returns Parsed parameter object or safe empty object
 */
export function parseToolArguments(argsString: string, logger?: any): string {
  // Handle empty or null input
  if (!argsString || argsString.trim() === "" || argsString === "{}") {
    return "{}";
  }

  // 清理 Qwen/ChatML 特有的停止符和泄露标记，防止干扰 JSON 解析
  // 命中 matched_stop: 248046 时，字符串末尾可能带有这些乱码
  let cleanedArgs = argsString.trim();
  const stopTokens = ["<|im_end|>", "<|im_start|>", "<|endoftext|>", "<|file_separator|>"];
  for (const token of stopTokens) {
    if (cleanedArgs.includes(token)) {
      cleanedArgs = cleanedArgs.split(token).join("").trim();
    }
  }

  try {
    // First attempt: Standard JSON parsing
    JSON.parse(cleanedArgs);
    logger?.debug(`工具调用参数标准JSON解析成功 / Tool arguments standard JSON parsing successful`);
    return cleanedArgs;
  } catch (jsonError: any) {
    try {
      // Second attempt: JSON5 parsing for relaxed syntax
      const args = JSON5.parse(cleanedArgs);
      logger?.debug(`Tool arguments JSON5 parsing successful`);
      return JSON.stringify(args);
    } catch (json5Error: any) {
      try {
        // Third attempt: Safe JSON repair without code execution
        const repairedJson = jsonrepair(cleanedArgs);
        logger?.debug(`Tool arguments safely repaired`);
        return repairedJson;
      } catch (repairError: any) {
        // All parsing attempts failed - log errors and return safe fallback
        logger?.error(
          `JSON parsing failed: ${jsonError.message}. ` +
          `JSON5 parsing failed: ${json5Error.message}. ` +
          `JSON repair failed: ${repairError.message}. ` +
          `Input data: ${JSON.stringify(cleanedArgs)}`
        );
        
        // Return safe empty object as fallback instead of potentially malformed input
        logger?.debug(`Returning safe empty object as fallback`);
        return "{}";
      }
    }
  }
}