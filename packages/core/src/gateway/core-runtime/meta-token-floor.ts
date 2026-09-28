import { isRecord } from "@ccr/core/gateway/internal/value";

type UpstreamRequest = {
  body?: unknown;
  bodyEncoding?: "bytes" | "form" | "json" | "none" | "text";
  url: string;
};

export function applyMetaTokenFloor<T extends UpstreamRequest>(request: T): T {
  if ((request.bodyEncoding ?? "json") !== "json" || !isRecord(request.body)) {
    return request;
  }
  const body = request.body;
  if (typeof body.model !== "string" || !/^meta\/muse-spark(?:-|$)/i.test(body.model)) {
    return request;
  }
  try {
    const url = new URL(request.url);
    if (url.protocol !== "https:" || url.hostname !== "openrouter.ai" || !/^\/api\/v1\/(?:messages|responses|chat\/completions)\/?$/.test(url.pathname)) {
      return request;
    }
  } catch {
    return request;
  }
  let next = body;
  for (const field of ["max_tokens", "max_completion_tokens", "max_output_tokens"]) {
    const value = body[field];
    if (typeof value === "number" && Number.isInteger(value) && value > 0 && value < 16) {
      next = { ...next, [field]: 16 };
    }
  }
  return next === body ? request : { ...request, body: next };
}
