import { readClaudeCodeOauth, readGrokAuth, readKimiAuth, resolveGrokAuth, resolveKimiAuth } from "@ccr/core/agents/local-providers/service";
import { grokAccessTokenExpired, grokClientVersion } from "@ccr/core/agents/local-providers/grok";
import { kimiAccessTokenExpired, kimiIdentityHeaders } from "@ccr/core/agents/local-providers/kimi";
import { transformCodexApplyPatchBridgeRequestBody } from "@ccr/core/gateway/features/codex-patch-bridge";
import { claudeCodeOauthBetaHeader, claudeCodeOauthRequiredBeta } from "@ccr/core/gateway/internal/shared";
import { isRecord, stringValue } from "@ccr/core/gateway/internal/value";
import { mergeAnthropicBetaValues } from "@ccr/core/providers/oauth-plugin";

const configProviderPluginKeyPrefix = "config:";
const localAgentProviderPluginKeyPrefix = "ccr-local-agent-";

type HeaderRecord = Record<string, string>;

type UpstreamRequest = {
  body?: unknown;
  bodyEncoding?: "bytes" | "form" | "json" | "none" | "text";
  headers?: HeaderRecord;
  method?: string;
  url: string;
};

type ProviderPluginInput = {
  model?: string;
  request?: {
    headers?: Record<string, string | string[] | undefined>;
  };
  upstreamRequest: UpstreamRequest;
};

type ProviderHookResult = {
  ok: true;
  value: UpstreamRequest;
} | {
  error: string;
  ok: false;
};

type ProviderHook = {
  authenticate?: (input: ProviderPluginInput) => Promise<ProviderHookResult> | ProviderHookResult;
  key: string;
  provider?: string;
  providerName?: string;
  transformRequest?: (input: ProviderPluginInput) => Promise<ProviderHookResult> | ProviderHookResult;
};

type LocalAgentOauthKind = "claude-code" | "grok" | "kimi";

export function createGatewayPlugin(input: { config?: Record<string, unknown> } = {}) {
  return {
    providerHooks: localAgentOauthProviderHooks(input.config)
  };
}

export function localAgentOauthProviderHooks(config: Record<string, unknown> | undefined): ProviderHook[] {
  const providerPlugins = Array.isArray(config?.providerPlugins) ? config.providerPlugins : [];
  return providerPlugins
    .map(localAgentOauthProviderHook)
    .filter((hook): hook is ProviderHook => Boolean(hook));
}

export function isLocalAgentOauthProviderPlugin(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return localAgentOauthKind(value) !== undefined;
}

function localAgentOauthProviderHook(plugin: unknown): ProviderHook | undefined {
  if (!isRecord(plugin)) {
    return undefined;
  }
  const kind = localAgentOauthKind(plugin);
  const key = stringValue(plugin.key);
  if (!kind || !key) {
    return undefined;
  }

  const hook: ProviderHook = {
    key: `${configProviderPluginKeyPrefix}${key}`,
    provider: stringValue(plugin.provider),
    providerName: stringValue(plugin.providerName)
  };

  if (kind === "grok") {
    hook.authenticate = (input) => authenticateWithBearer(input, () => resolveLiveGrokAccessToken(plugin), plugin, "Grok CLI access token was not found.");
    hook.transformRequest = (input) => transformGrokRequest(input, plugin);
    return hook;
  }

  if (kind === "kimi") {
    hook.authenticate = (input) => authenticateWithBearer(input, () => resolveLiveKimiAccessToken(plugin), plugin, "Kimi CLI access token was not found.");
    hook.transformRequest = (input) => transformWithHeaders(input, kimiIdentityHeaders());
    return hook;
  }

  hook.authenticate = (input) => authenticateClaudeCode(input, plugin);
  return hook;
}

function localAgentOauthKind(plugin: Record<string, unknown>): LocalAgentOauthKind | undefined {
  const key = stringValue(plugin.key)?.toLowerCase();
  if (!key?.startsWith(localAgentProviderPluginKeyPrefix)) {
    return undefined;
  }
  if (key.includes("grok-cli-oauth")) {
    return "grok";
  }
  if (key.includes("kimi-cli-oauth")) {
    return "kimi";
  }
  if (key.includes("claude-code-oauth")) {
    return "claude-code";
  }
  return undefined;
}

async function authenticateWithBearer(
  input: ProviderPluginInput,
  tokenResolver: () => Promise<string | undefined> | string | undefined,
  plugin: Record<string, unknown>,
  missingTokenError: string
): Promise<ProviderHookResult> {
  const token = await tokenResolver() || originalBearerToken(plugin);
  if (!token) {
    return { error: missingTokenError, ok: false };
  }
  return {
    ok: true,
    value: {
      ...input.upstreamRequest,
      headers: withBearerAuth(input.upstreamRequest.headers, token, originalRemoveHeaders(plugin))
    }
  };
}

async function authenticateClaudeCode(
  input: ProviderPluginInput,
  plugin: Record<string, unknown>
): Promise<ProviderHookResult> {
  const token = readClaudeCodeOauth()?.accessToken || originalBearerToken(plugin);
  if (!token) {
    return { error: "Claude Code access token was not found.", ok: false };
  }
  const headers = withBearerAuth(input.upstreamRequest.headers, token, originalRemoveHeaders(plugin));
  headers[claudeCodeOauthBetaHeader] = mergeAnthropicBetaValues(
    requestHeader(input.request?.headers, claudeCodeOauthBetaHeader),
    originalAnthropicBetaDefault(plugin),
    claudeCodeOauthRequiredBeta
  );
  return {
    ok: true,
    value: {
      ...input.upstreamRequest,
      headers
    }
  };
}

async function resolveLiveGrokAccessToken(plugin: Record<string, unknown>): Promise<string | undefined> {
  const auth = await resolveGrokAuth().catch(() => readGrokAuth());
  if (auth?.accessToken && !grokAccessTokenExpired(auth)) {
    return auth.accessToken;
  }
  return originalBearerToken(plugin);
}

async function resolveLiveKimiAccessToken(plugin: Record<string, unknown>): Promise<string | undefined> {
  const reference = kimiOauthReference(plugin);
  const auth = await resolveKimiAuth(reference).catch(() => readKimiAuth(reference));
  if (auth?.accessToken && !kimiAccessTokenExpired(auth)) {
    return auth.accessToken;
  }
  return originalBearerToken(plugin);
}

function transformWithHeaders(input: ProviderPluginInput, headers: HeaderRecord): ProviderHookResult {
  return {
    ok: true,
    value: {
      ...input.upstreamRequest,
      headers: {
        ...(input.upstreamRequest.headers ?? {}),
        ...headers
      }
    }
  };
}

function transformGrokRequest(input: ProviderPluginInput, plugin: Record<string, unknown>): ProviderHookResult {
  const headers = {
    ...(input.upstreamRequest.headers ?? {}),
    "x-grok-client-identifier": "xai-grok-cli",
    "x-grok-client-version": grokClientVersion(),
    "x-grok-model-override": input.model || originalRequestHeader(plugin, "x-grok-model-override") || ""
  };
  const body = transformGrokResponsesBody(input.upstreamRequest.body);
  return {
    ok: true,
    value: {
      ...input.upstreamRequest,
      body: body.changed ? body.value : input.upstreamRequest.body,
      headers
    }
  };
}

function transformGrokResponsesBody(value: unknown): { value: unknown; changed: boolean } {
  if (!isRecord(value)) {
    return { value, changed: false };
  }
  const patched = transformCodexApplyPatchBridgeRequestBody(value);
  const sanitizedOptions = sanitizeGrokUnsupportedResponsesOptions(patched.body);
  const sanitized = sanitizeGrokResponsesTools(sanitizedOptions.value);
  return {
    value: sanitized.value,
    changed: patched.changed || sanitizedOptions.changed || sanitized.changed
  };
}

function sanitizeGrokUnsupportedResponsesOptions(body: Record<string, unknown>): {
  value: Record<string, unknown>;
  changed: boolean;
} {
  let next: Record<string, unknown> | undefined;
  for (const key of grokUnsupportedResponsesOptions) {
    if (Object.hasOwn(body, key)) {
      next ??= { ...body };
      delete next[key];
    }
  }
  return next ? { value: next, changed: true } : { value: body, changed: false };
}

function sanitizeGrokResponsesTools(body: Record<string, unknown>): { value: Record<string, unknown>; changed: boolean } {
  if (!Array.isArray(body.tools)) {
    return { value: body, changed: false };
  }

  let changed = false;
  const removedToolNames = new Set<string>();
  const tools = body.tools.filter((tool) => {
    const supported = isGrokSupportedResponsesTool(tool);
    if (!supported) {
      changed = true;
      const name = responseToolName(tool);
      if (name) {
        removedToolNames.add(name);
      }
    }
    return supported;
  });

  if (!changed) {
    return { value: body, changed: false };
  }

  const next = { ...body };
  if (tools.length > 0) {
    next.tools = tools;
  } else {
    delete next.tools;
    delete next.parallel_tool_calls;
  }
  if (tools.length === 0 || grokToolChoiceNamesRemovedTool(next.tool_choice, removedToolNames)) {
    delete next.tool_choice;
  }
  return { value: next, changed: true };
}

function isGrokSupportedResponsesTool(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return grokSupportedResponsesToolTypes.has(stringValue(value.type) ?? "");
}

function responseToolName(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return stringValue(value.name) || stringValue(value.server_label);
}

function grokToolChoiceNamesRemovedTool(value: unknown, removedToolNames: Set<string>): boolean {
  if (removedToolNames.size === 0) {
    return false;
  }
  if (!isRecord(value)) {
    return false;
  }
  const name = stringValue(value.name) || stringValue(value.server_label);
  return name ? removedToolNames.has(name) : false;
}

function withBearerAuth(
  headers: HeaderRecord | undefined,
  token: string,
  removeHeaders: string[]
): HeaderRecord {
  const next = { ...(headers ?? {}) };
  for (const name of removeHeaders) {
    deleteHeader(next, name);
  }
  setHeader(next, "authorization", `Bearer ${token}`);
  return next;
}

function originalRemoveHeaders(plugin: Record<string, unknown>): string[] {
  const auth = isRecord(plugin.auth) ? plugin.auth : undefined;
  const removeHeaders = Array.isArray(auth?.removeHeaders) ? auth.removeHeaders : [];
  return uniqueStrings([
    ...removeHeaders
      .map((value) => stringValue(value))
      .filter((value): value is string => Boolean(value)),
    "x-api-key"
  ]);
}

function originalBearerToken(plugin: Record<string, unknown>): string | undefined {
  const authorization = originalAuthHeader(plugin, "authorization");
  const prefix = "Bearer ";
  return authorization?.startsWith(prefix) ? authorization.slice(prefix.length).trim() || undefined : undefined;
}

function originalAuthHeader(plugin: Record<string, unknown>, name: string): string | undefined {
  const auth = isRecord(plugin.auth) ? plugin.auth : undefined;
  const headers = isRecord(auth?.headers) ? auth.headers : undefined;
  return recordHeader(headers, name);
}

function originalRequestHeader(plugin: Record<string, unknown>, name: string): string | undefined {
  const request = isRecord(plugin.request) ? plugin.request : undefined;
  const headers = isRecord(request?.headers) ? request.headers : undefined;
  return recordHeader(headers, name);
}

function originalAnthropicBetaDefault(plugin: Record<string, unknown>): string | undefined {
  const value = originalAuthHeaderValue(plugin, claudeCodeOauthBetaHeader);
  if (typeof value === "string") {
    return value;
  }
  if (isRecord(value)) {
    return stringValue(value.default);
  }
  return undefined;
}

function originalAuthHeaderValue(plugin: Record<string, unknown>, name: string): unknown {
  const auth = isRecord(plugin.auth) ? plugin.auth : undefined;
  const headers = isRecord(auth?.headers) ? auth.headers : undefined;
  if (!headers) {
    return undefined;
  }
  const normalizedName = name.toLowerCase();
  return Object.entries(headers).find(([key]) => key.trim().toLowerCase() === normalizedName)?.[1];
}

function recordHeader(headers: Record<string, unknown> | undefined, name: string): string | undefined {
  const value = recordHeaderValue(headers, name);
  return typeof value === "string" ? value : undefined;
}

function recordHeaderValue(headers: Record<string, unknown> | undefined, name: string): unknown {
  if (!headers) {
    return undefined;
  }
  const normalizedName = name.toLowerCase();
  return Object.entries(headers).find(([key]) => key.trim().toLowerCase() === normalizedName)?.[1];
}

function requestHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string
): string | undefined {
  if (!headers) {
    return undefined;
  }
  const normalizedName = name.toLowerCase();
  const value = Object.entries(headers).find(([key]) => key.trim().toLowerCase() === normalizedName)?.[1];
  if (Array.isArray(value)) {
    return value.join(",");
  }
  return value;
}

function setHeader(headers: HeaderRecord, name: string, value: string): void {
  deleteHeader(headers, name);
  headers[name] = value;
}

function deleteHeader(headers: HeaderRecord, name: string): void {
  const normalizedName = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.trim().toLowerCase() === normalizedName) {
      delete headers[key];
    }
  }
}

function kimiOauthReference(plugin: Record<string, unknown>): { key?: string; oauthHost?: string } | undefined {
  const oauth = isRecord(plugin.kimiOauth) ? plugin.kimiOauth : undefined;
  if (!oauth) {
    return undefined;
  }
  const key = stringValue(oauth.key);
  const oauthHost = stringValue(oauth.oauthHost) || stringValue(oauth.oauth_host);
  return key || oauthHost ? { key, oauthHost } : undefined;
}

const grokSupportedResponsesToolTypes = new Set([
  "function",
  "x_search",
  "image_generation",
  "collections_search",
  "file_search",
  "code_execution",
  "code_interpreter",
  "mcp",
  "shell"
]);

const grokUnsupportedResponsesOptions = new Set([
  "external_web_access"
]);

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(value);
  }
  return unique;
}
