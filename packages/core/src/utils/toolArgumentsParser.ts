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

  try {
    // First attempt: Standard JSON parsing
    JSON.parse(argsString);
    logger?.debug(`工具调用参数标准JSON解析成功 / Tool arguments standard JSON parsing successful`);
    return argsString;
  } catch (jsonError: any) {
    try {
      // Second attempt: JSON5 parsing for relaxed syntax
      const args = JSON5.parse(argsString);
      logger?.debug(`Tool arguments JSON5 parsing successful`);
      return JSON.stringify(args);
    } catch (json5Error: any) {
      try {
        // Third attempt: Safe JSON repair without code execution
        const repairedJson = jsonrepair(argsString);
        logger?.debug(`Tool arguments safely repaired`);
        return repairedJson;
      } catch (repairError: any) {
        // All parsing attempts failed - log errors and return safe fallback
        logger?.error(
          `JSON parsing failed: ${jsonError.message}. ` +
          `JSON5 parsing failed: ${json5Error.message}. ` +
          `JSON repair failed: ${repairError.message}. ` +
          `Input data: ${JSON.stringify(argsString)}`
        );
        
        // Return safe empty object as fallback instead of potentially malformed input
        logger?.debug(`Returning safe empty object as fallback`);
        return "{}";
      }
    }
  }
}