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
  const markdownMatch = cleanedArgs.match(MARKDOWN_CODE_BLOCK_REGEX);
  let wasMarkdownStripped = false;
  if (markdownMatch && markdownMatch[1]) {
    cleanedArgs = markdownMatch[1].trim();
    wasMarkdownStripped = true;
  }

  try {
    // 首先尝试标准解析
    JSON.parse(cleanedArgs);
    // 如果没有经过 Markdown 剥离且解析成功，直接返回原始字符串（保护格式）
    if (!wasMarkdownStripped) {
      return cleanedArgs;
    }
    // 如果剥离了 Markdown 但解析成功，则返回剥离后的干净版本
    return cleanedArgs;
  } catch (jsonError: any) {
    // 只有在标准解析失败时，才尝试高级修复
    try {
      const args = JSON5.parse(cleanedArgs);
      logger?.debug(`Tool arguments normalized via JSON5`);
      return JSON.stringify(args);
    } catch (json5Error: any) {
      try {
        const repairedJson = jsonrepair(cleanedArgs);
        logger?.debug(`Tool arguments safely repaired via jsonrepair`);
        return repairedJson;
      } catch (repairError: any) {
        logger?.error(
          `All parsing attempts failed for tool args. Falling back to empty object.`
        );
        return "{}";
      }
    }
  }
}