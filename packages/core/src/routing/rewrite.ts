import type {
  RequestRouteTraceChange,
  RouterRuleRewrite,
  RouterRuleRewriteOperation
} from "@ccr/core/contracts/app";
import { normalizeRouteSelector } from "@ccr/core/routing/model-registry";

type HeaderValue = string | string[] | undefined;

export type RouteRewriteRequest = {
  body: Record<string, unknown>;
  headers: Record<string, HeaderValue>;
};

export type CompiledRouteRewrite = {
  key: string;
  match?: unknown;
  operation: RouterRuleRewriteOperation;
  path: string[];
  scope: "body" | "headers";
  value?: unknown;
};

export type RouteRewriteCompileResult = {
  error?: string;
  rewrite?: CompiledRouteRewrite;
};

const protectedHeaderNames = new Set([
  "api-key",
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "host",
  "keep-alive",
  "proxy-authorization",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "x-api-key",
  "x-client-request-id",
  "x-goog-api-key"
]);
const unsafePathSegments = new Set(["__proto__", "constructor", "prototype"]);
const rewriteOperations = new Set<RouterRuleRewriteOperation>([
  "array-append",
  "array-prepend",
  "array-remove",
  "array-replace",
  "delete",
  "set"
]);

export function compileConfiguredRouteRewrite(rewrite: RouterRuleRewrite): RouteRewriteCompileResult {
  return compileRouteRewrite(rewrite, true);
}

export function compileScriptRouteRewrite(value: unknown): RouteRewriteCompileResult {
  if (!isRecord(value)) {
    return { error: "Script rewrite must be an object." };
  }
  const key = typeof value.key === "string" ? value.key : undefined;
  const operation = typeof value.operation === "string" ? value.operation : "set";
  if (!key || !rewriteOperations.has(operation as RouterRuleRewriteOperation)) {
    return { error: "Script rewrite requires a supported operation and a non-empty key." };
  }
  return compileRouteRewrite({
    key,
    ...(Object.hasOwn(value, "match") ? { match: value.match } : {}),
    operation: operation as RouterRuleRewriteOperation,
    ...(Object.hasOwn(value, "value") ? { value: value.value } : {})
  }, false);
}

function compileRouteRewrite(
  rewrite: { key: string; match?: unknown; operation?: RouterRuleRewriteOperation; value?: unknown },
  configured: boolean
): RouteRewriteCompileResult {
  const key = rewrite.key.trim();
  const operation = rewrite.operation ?? "set";
  if (!key || !rewriteOperations.has(operation)) {
    return { error: "Route rewrite requires a supported operation and a non-empty key." };
  }
  const parsedPath = parseRewritePath(key, !configured);
  if (parsedPath.error || !parsedPath.scope || !parsedPath.path) {
    return { error: parsedPath.error ?? `Unsupported route rewrite path "${key}".` };
  }

  if (operation !== "delete" && !Object.hasOwn(rewrite, "value")) {
    return { error: `Route rewrite "${key}" requires a value.` };
  }
  if (operation === "array-replace" && !Object.hasOwn(rewrite, "match")) {
    return { error: `Route rewrite "${key}" requires a match value.` };
  }

  let value = rewrite.value;
  let match = rewrite.match;
  if (configured) {
    value = parsedPath.scope === "headers"
      ? value
      : typeof value === "string" ? configuredRewriteValue(key, value) : value;
    match = typeof match === "string" ? parseRewriteLiteral(match) : match;
  }
  if (parsedPath.scope === "headers" && operation !== "delete" && typeof value !== "string") {
    return { error: `Header rewrite "${key}" requires a string value.` };
  }
  if (!isJsonValue(value) || !isJsonValue(match)) {
    return { error: `Route rewrite "${key}" contains a non-JSON value.` };
  }

  return {
    rewrite: {
      key,
      ...(operation === "array-replace" ? { match } : {}),
      operation,
      path: parsedPath.path,
      scope: parsedPath.scope,
      ...(operation === "delete" ? {} : { value })
    }
  };
}

function parseRewritePath(key: string, protectHeaders: boolean): { error?: string; path?: string[]; scope?: "body" | "headers" } {
  const parts = key.split(".").map((part) => part.trim()).filter(Boolean);
  const [requestScope, section, ...rest] = parts;
  if (requestScope !== "request") {
    return { error: `Route rewrite path "${key}" must start with request.` };
  }
  if (rest.length === 0 || rest.some((part) => unsafePathSegments.has(part.toLowerCase()))) {
    return { error: `Route rewrite path "${key}" is empty or unsafe.` };
  }
  if (section === "header" || section === "headers") {
    const name = rest.join(".").toLowerCase();
    if (protectHeaders && (protectedHeaderNames.has(name) || name.startsWith("x-auth-") || name.startsWith("x-ccr-"))) {
      return { error: `Route rewrite cannot modify protected header "${name}".` };
    }
    return { path: [name], scope: "headers" };
  }
  if (section === "body") {
    return { path: rest, scope: "body" };
  }
  return { error: `Unsupported route rewrite path "${key}".` };
}

export function applyCompiledRouteRewrite(
  rewrite: CompiledRouteRewrite,
  request: RouteRewriteRequest
): RequestRouteTraceChange | undefined {
  if (rewrite.scope === "headers") {
    const name = rewrite.path[0];
    const before = request.headers[name];
    if (rewrite.operation === "delete") {
      delete request.headers[name];
    } else {
      request.headers[name] = rewrite.value as string;
    }
    return createReportedRewriteChange("headers", `/headers/${escapeJsonPointer(name)}`, before, request.headers[name]);
  }

  const before = readPathValue(request.body, rewrite.path);
  applyBodyRewrite(request.body, rewrite);
  const after = readPathValue(request.body, rewrite.path);
  return createReportedRewriteChange(
    "body",
    `/body/${rewrite.path.map(escapeJsonPointer).join("/")}`,
    before,
    after
  );
}

export function isBodyModelCompiledRewrite(rewrite: CompiledRouteRewrite): boolean {
  return rewrite.scope === "body" && rewrite.path.length === 1 && rewrite.path[0] === "model";
}

export function effectiveBodyModelRewriteValue(rewrites: readonly CompiledRouteRewrite[]): string | undefined {
  let value: string | undefined;
  for (const rewrite of rewrites) {
    if (!isBodyModelCompiledRewrite(rewrite)) continue;
    if (rewrite.operation === "delete") value = undefined;
    else if (rewrite.operation === "set" && typeof rewrite.value === "string") value = rewrite.value;
  }
  return value;
}

export function effectiveTargetProviderName(rewrites: readonly CompiledRouteRewrite[]): string | undefined {
  const headers: Record<string, string> = {};
  for (const rewrite of rewrites) {
    if (rewrite.scope !== "headers" || !isTargetProviderHeader(rewrite.path[0])) continue;
    if (rewrite.operation === "delete") delete headers[rewrite.path[0]];
    else if (rewrite.operation === "set" && typeof rewrite.value === "string") headers[rewrite.path[0]] = rewrite.value;
  }
  const provider = headers["x-target-provider"] || headers["x-gateway-target-provider"];
  if (provider?.trim()) return provider.trim();
  return headers["x-target-providers"]?.split(",").map((item) => item.trim()).find(Boolean);
}

export function readPathValue(value: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((current, part) => {
    if (Array.isArray(current)) {
      const index = Number(part);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    return isRecord(current) ? current[part] : undefined;
  }, value);
}

export function isSafeRouteReadPath(path: string): boolean {
  const parts = path.split(".").map((part) => part.trim()).filter(Boolean);
  return parts.length > 2 && parts[0] === "request" && parts[1] === "body" &&
    parts.slice(2).every((part) => !unsafePathSegments.has(part.toLowerCase()));
}

function applyBodyRewrite(body: Record<string, unknown>, rewrite: CompiledRouteRewrite): void {
  if (rewrite.operation === "delete") {
    deletePathValue(body, rewrite.path);
    return;
  }
  if (rewrite.operation === "set") {
    setPathValue(body, rewrite.path, cloneJsonValue(rewrite.value));
    return;
  }
  const current = readPathValue(body, rewrite.path);
  const array = Array.isArray(current) ? [...current] : [];
  if (rewrite.operation === "array-append") array.push(cloneJsonValue(rewrite.value));
  if (rewrite.operation === "array-prepend") array.unshift(cloneJsonValue(rewrite.value));
  if (rewrite.operation === "array-remove") {
    setPathValue(body, rewrite.path, array.filter((item) => !arrayElementMatches(item, rewrite.value)));
    return;
  }
  if (rewrite.operation === "array-replace") {
    setPathValue(body, rewrite.path, array.map((item) =>
      arrayElementMatches(item, rewrite.match) ? cloneJsonValue(rewrite.value) : item
    ));
    return;
  }
  setPathValue(body, rewrite.path, array);
}

export function setPathValue(target: Record<string, unknown>, path: readonly string[], value: unknown): void {
  if (path.length === 0) return;
  let current: unknown = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    const nextKey = path[index + 1];
    if (Array.isArray(current)) {
      const arrayIndex = Number(key);
      if (!Number.isInteger(arrayIndex)) return;
      if (!isRecord(current[arrayIndex]) && !Array.isArray(current[arrayIndex])) {
        current[arrayIndex] = numericPathSegment(nextKey) ? [] : {};
      }
      current = current[arrayIndex];
      continue;
    }
    if (!isRecord(current)) return;
    if (!isRecord(current[key]) && !Array.isArray(current[key])) {
      current[key] = numericPathSegment(nextKey) ? [] : {};
    }
    current = current[key];
  }
  const lastKey = path[path.length - 1];
  if (Array.isArray(current)) {
    const arrayIndex = Number(lastKey);
    if (Number.isInteger(arrayIndex)) current[arrayIndex] = value;
  } else if (isRecord(current)) {
    current[lastKey] = value;
  }
}

function deletePathValue(target: Record<string, unknown>, path: readonly string[]): void {
  if (path.length === 0) return;
  const parent = readPathValue(target, path.slice(0, -1));
  const key = path[path.length - 1];
  if (Array.isArray(parent)) {
    const index = Number(key);
    if (Number.isInteger(index)) parent.splice(index, 1);
  } else if (isRecord(parent)) {
    delete parent[key];
  }
}

function configuredRewriteValue(key: string, value: string): unknown {
  if (key === "request.body.model") return normalizeRouteSelector(value) ?? value;
  return parseRewriteLiteral(value);
}

function parseRewriteLiteral(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      // Preserve malformed JSON-shaped values as strings for compatibility.
    }
  }
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  const number = Number(trimmed);
  return trimmed && Number.isFinite(number) ? number : trimmed;
}

function arrayElementMatches(actual: unknown, expected: unknown): boolean {
  if (isRecord(expected) && isRecord(actual)) {
    return Object.entries(expected).every(([key, value]) => arrayElementMatches(actual[key], value));
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return expected.length === actual.length && expected.every((item, index) => arrayElementMatches(actual[index], item));
  }
  return Object.is(actual, expected) || comparableText(actual) === comparableText(expected);
}

function comparableText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function createReportedRewriteChange(
  scope: RequestRouteTraceChange["scope"],
  path: string,
  before: unknown,
  after: unknown
): RequestRouteTraceChange | undefined {
  if (Object.is(before, after)) return undefined;
  return {
    ...(after === undefined ? {} : { after }),
    ...(before === undefined ? {} : { before }),
    operation: before === undefined ? "add" : after === undefined ? "remove" : "replace",
    path,
    scope
  };
}

function cloneJsonValue<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function isJsonValue(value: unknown): boolean {
  if (value === undefined || value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.keys(value).every((key) =>
    !unsafePathSegments.has(key.toLowerCase()) && isJsonValue(value[key])
  );
}

function isTargetProviderHeader(name: string): boolean {
  return name === "x-target-provider" || name === "x-gateway-target-provider" || name === "x-target-providers";
}

function numericPathSegment(value: string): boolean {
  return /^\d+$/.test(value);
}

function escapeJsonPointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
