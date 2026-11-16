import { isRecord } from "@ccr/core/gateway/internal/value";

/** Remove only declaration flags; tool schemas and message/tool-result data stay intact. */
export function withoutDeferredToolFlags(body: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(body.tools)) return body;
  const tools = body.tools.map(stripTool);
  return tools.some((tool, index) => tool !== (body.tools as unknown[])[index]) ? { ...body, tools } : body;
}

function stripTool(value: unknown): unknown {
  if (!isRecord(value)) return value;
  let result = value;
  if (Object.hasOwn(value, "defer_loading")) {
    result = { ...result };
    delete result.defer_loading;
  }
  if (isRecord(value.function)) {
    const fn = stripTool(value.function);
    if (fn !== value.function) result = { ...result, function: fn };
  }
  if (Array.isArray(value.tools)) {
    const tools = value.tools.map(stripTool);
    if (tools.some((tool, index) => tool !== (value.tools as unknown[])[index])) result = { ...result, tools };
  }
  return result;
}
