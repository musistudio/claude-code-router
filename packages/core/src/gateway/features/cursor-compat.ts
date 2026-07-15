/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import type { AppConfig } from "@ccr/core/contracts/app";
import { isRecord, stringValue } from "@ccr/core/gateway/internal/value";
import { serializeJsonBody, takeJsonObject } from "@ccr/core/gateway/http/body";
import type { CursorOpenAICompatContext, CursorOpenAICompatPreparation } from "@ccr/core/gateway/internal/shared";

let warnedMissingCursorOpenAICompatContext = false;


export function prepareCursorOpenAICompatChatBody(
  config: AppConfig,
  client: string | undefined,
  method: string,
  path: string,
  requestBody: Buffer
): CursorOpenAICompatPreparation | undefined {
  if ((method || "GET").toUpperCase() !== "POST" || !isOpenAICompatChatCompletionsPath(path) || client !== "Cursor") {
    return undefined;
  }

  let body: Record<string, unknown>;
  try {
    body = takeJsonObject(requestBody);
  } catch {
    return undefined;
  }
  if (!isSimplifiedCursorOpenAICompatChat(body)) {
    return undefined;
  }

  const context = readCursorOpenAICompatContext(config);
  let changed = false;
  if (context.systemPrompt) {
    body.messages = [
      { content: context.systemPrompt, role: "system" },
      ...(Array.isArray(body.messages) ? body.messages : [])
    ];
    changed = true;
  }
  if (context.tools.length > 0) {
    body.tools = context.tools;
    changed = true;
  }
  if (context.toolChoice !== undefined && context.tools.length > 0) {
    body.tool_choice = context.toolChoice;
    changed = true;
  }

  if (!changed) {
    if (!warnedMissingCursorOpenAICompatContext) {
      warnedMissingCursorOpenAICompatContext = true;
      console.warn(
        "[gateway] Cursor sent an OpenAI-compatible chat request with only user messages and no system/tools. " +
        "Configure plugins[].id=\"cursor-proxy\" config.systemPrompt/config.tools to inject fallback context, " +
        "or route Cursor native Agent traffic through the proxy."
      );
    }
    return { diagnostic: "simplified-missing-context" };
  }

  return {
    body: serializeJsonBody(body),
    diagnostic: "fallback-injected"
  };
}


function isOpenAICompatChatCompletionsPath(path: string): boolean {
  return path === "/chat/completions" ||
    path === "/v1/chat/completions" ||
    path.endsWith("/chat/completions");
}


function isSimplifiedCursorOpenAICompatChat(body: Record<string, unknown>): boolean {
  if (body.system !== undefined || body.systemPrompt !== undefined || body.instructions !== undefined) {
    return false;
  }
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    return false;
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return false;
  }
  return body.messages.every((message) =>
    isRecord(message) &&
    stringValue(message.role)?.toLowerCase() === "user"
  );
}


function readCursorOpenAICompatContext(config: AppConfig): CursorOpenAICompatContext {
  const plugin = config.plugins.find((item) => item.enabled !== false && item.id === "cursor-proxy");
  const pluginConfig = isRecord(plugin?.config) ? plugin.config : {};
  return {
    systemPrompt:
      stringValue(pluginConfig.systemPrompt) ||
      stringValue(pluginConfig.openaiSystemPrompt) ||
      stringValue(pluginConfig.defaultSystemPrompt),
    toolChoice: normalizeCursorToolChoice(
      pluginConfig.toolChoice ?? pluginConfig.openaiToolChoice ?? pluginConfig.defaultToolChoice
    ),
    tools: normalizeCursorTools(pluginConfig.tools ?? pluginConfig.openaiTools ?? pluginConfig.defaultTools)
  };
}


function normalizeCursorTools(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.map(normalizeCursorTool).filter((tool): tool is Record<string, unknown> => Boolean(tool));
  }
  if (isRecord(value)) {
    if (Array.isArray(value.tools) || isRecord(value.tools)) {
      return normalizeCursorTools(value.tools);
    }
    return Object.entries(value)
      .map(([name, item]) => normalizeCursorTool(isRecord(item) ? { ...item, name: stringValue(item.name) || name } : { description: stringValue(item), name }))
      .filter((tool): tool is Record<string, unknown> => Boolean(tool));
  }
  return [];
}


function normalizeCursorTool(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const type = stringValue(value.type);
  if (type && type.toLowerCase().startsWith("web_search")) {
    return { ...value, type };
  }

  const fn = isRecord(value.function) ? value.function : value;
  const name =
    stringValue(fn.name) ||
    stringValue(value.name) ||
    stringValue(value.toolName) ||
    stringValue(value.functionName);
  if (!name) {
    return undefined;
  }
  return {
    function: compactRecord({
      description: stringValue(fn.description) || stringValue(value.description),
      name,
      parameters: normalizeCursorToolParameters(
        fn.parameters ??
        value.parameters ??
        fn.input_schema ??
        value.input_schema ??
        fn.inputSchema ??
        value.inputSchema ??
        fn.schema ??
        value.schema
      )
    }),
    type: "function"
  };
}


function normalizeCursorToolParameters(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to an empty object schema.
    }
  }
  return { properties: {}, type: "object" };
}


function normalizeCursorToolChoice(value: unknown): unknown {
  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "auto" || normalized === "none" || normalized === "required") {
      return normalized;
    }
    return { function: { name: value.trim() }, type: "function" };
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const type = stringValue(value.type);
  if (type && ["auto", "none", "required"].includes(type.toLowerCase())) {
    return type.toLowerCase();
  }
  const fn = isRecord(value.function) ? value.function : value;
  const name = stringValue(fn.name) || stringValue(value.name) || stringValue(value.toolName);
  return name ? { function: { name }, type: "function" } : undefined;
}


function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
