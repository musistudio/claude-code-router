"use strict";

const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const DEFAULT_CURSOR_HOSTS = [
  "api.cursor.sh",
  "api2.cursor.sh",
  "api3.cursor.sh",
  "api4.cursor.sh",
  "api.cursor.com",
  "api2.cursor.com",
  "*.cursor.sh",
  "*.cursor.com",
  "*.cursorapi.com"
];

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

const INTERNAL_HEADER_PREFIX = "x-ccr-";
const DEFAULT_GATEWAY_URL = "http://127.0.0.1:3456";
const MAX_JSON_SCAN_DEPTH = 8;
const DEFAULT_BIDI_WAIT_MS = 15000;
const DEFAULT_BIDI_SETTLE_MS = 500;
const DEFAULT_BIDI_MAX_SETTLE_MS = 2000;
const DEFAULT_BIDI_MISSING_CONTEXT_WAIT_MS = 6000;
const DEFAULT_BIDI_SESSION_TTL_MS = 10 * 60 * 1000;
const DEFAULT_CURSOR_CONTEXT_TTL_MS = 2 * 60 * 1000;
const DEFAULT_CURSOR_CONTEXT_MAX_ENTRIES = 64;
const DEFAULT_GATEWAY_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_CURSOR_TOOL_BRIDGE_TIMEOUT_MS = 2 * 60 * 1000;
const DEFAULT_CURSOR_TOOL_BRIDGE_MAX_ROUNDS = 8;
const DEFAULT_PASSTHROUGH_LOG_LIMIT = 3;
const DEFAULT_DECODE_DIAGNOSTIC_SAMPLE_LIMIT = 8;
const DEFAULT_DECODE_DIAGNOSTIC_SAMPLE_CHARS = 180;
const DEFAULT_DECODE_DUMP_DIR = path.join(os.tmpdir(), "ccr-cursor-decode-dumps");
const DEFAULT_DECODE_TREE_DEPTH = 12;
const CURSOR_PROXY_ROUTE_TYPES = new Set(["always", "image", "long-context", "model", "model-prefix", "thinking", "web-search"]);
const CURSOR_NATIVE_RPC_PATH_PATTERN = /^\/(?:aiserver|agent)\.v\d+\.[^/]+\/[^/]+$/i;
const CURSOR_NATIVE_LLM_SERVICE_PATTERN =
  /^(?:AiService|AgentService|ChatService|ComposerService|CppService|TerminalService)$/i;
const CURSOR_NATIVE_LLM_METHOD_PATTERN =
  /^(?:(?:Stream|Run|Generate|Create|Submit|Start).*(?:Agent|Chat|Completion|Completions|Composer|Cpp|Edit|Edits|Inline|Message|Prompt|Response|Terminal)|Complete(?:Chat|Completion|Edit|Inline|Terminal).*)$/i;
const CURSOR_NATIVE_SUPPORTED_TOOL_FIELDS = new Set([29, 51]);
const CURSOR_NATIVE_SUPPORTED_TOOL_ENUM_NAMES = new Map([
  [1, "READ_SEMSEARCH_FILES"],
  [3, "RIPGREP_SEARCH"],
  [5, "READ_FILE"],
  [6, "LIST_DIR"],
  [8, "FILE_SEARCH"],
  [9, "SEMANTIC_SEARCH_FULL"],
  [39, "LIST_DIR_V2"],
  [40, "READ_FILE_V2"],
  [41, "RIPGREP_RAW_SEARCH"],
  [42, "GLOB_FILE_SEARCH"]
]);
const CURSOR_NATIVE_SUPPORTED_TOOL_TO_SPEC_NAME = new Map([
  [3, "grep_search"],
  [5, "read_file"],
  [6, "list_dir"],
  [8, "glob_file_search"],
  [9, "codebase_search"],
  [39, "list_dir"],
  [40, "read_file"],
  [41, "grep_search"],
  [42, "glob_file_search"]
]);
const CURSOR_NATIVE_BUILTIN_TOOL_NAMES = [
  "read_file",
  "list_dir",
  "grep_search",
  "glob_file_search",
  "codebase_search",
  "shell",
  "delete_file",
  "edit_file",
  "read_lints",
  "web_search",
  "web_fetch",
  "task",
  "await_task",
  "todo_read",
  "todo_write",
  "ask_question",
  "switch_mode",
  "generate_image",
  "list_mcp_resources",
  "read_mcp_resource",
  "get_mcp_tools",
  "call_mcp_tool",
  "set_active_branch"
];
const CURSOR_SYSTEM_PROMPT_KEYS = [
  "customInstruction",
  "customInstructions",
  "developer",
  "developerInstruction",
  "developerInstructions",
  "developerPrompt",
  "globalInstruction",
  "globalInstructions",
  "instructions",
  "roleInstruction",
  "roleInstructions",
  "system",
  "systemInstruction",
  "systemInstructions",
  "systemPrompt",
  "system_prompt"
];
const CURSOR_TOOL_KEYS = [
  "availableTools",
  "available_tools",
  "availableToolSchemas",
  "available_tool_schemas",
  "clientSideToolDefinitions",
  "clientSideTools",
  "functionDefinitions",
  "function_definitions",
  "functions",
  "mcpTools",
  "mcp_tools",
  "toolSchemas",
  "tool_schemas",
  "toolDefinitions",
  "tool_definitions",
  "tools"
];
const CURSOR_TOOL_CHOICE_KEYS = [
  "toolChoice",
  "toolSelection",
  "tool_choice",
  "tool_selection"
];
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

module.exports = {
  async setup(ctx) {
    const options = isRecord(ctx.pluginConfig) ? ctx.pluginConfig : {};
    const gatewayUrl = trimTrailingSlash(stringValue(options.gatewayUrl) || configuredGatewayUrl(ctx.config));
    const gatewayApiKey = stringValue(options.gatewayApiKey) || configuredGatewayApiKey(ctx.config);
    const hosts = normalizeStringList(options.hosts, options.host) || DEFAULT_CURSOR_HOSTS;
    const paths = options.paths === false ? undefined : normalizePathList(options.paths);

    const runtime = {
      bidiSessionTtlMs: numberOption(options.bidiSessionTtlMs, DEFAULT_BIDI_SESSION_TTL_MS),
      bidiMaxSettleMs: numberOption(options.bidiMaxSettleMs, DEFAULT_BIDI_MAX_SETTLE_MS),
      bidiMissingContextWaitMs: numberOption(options.bidiMissingContextWaitMs, DEFAULT_BIDI_MISSING_CONTEXT_WAIT_MS),
      bidiSettleMs: numberOption(options.bidiSettleMs, DEFAULT_BIDI_SETTLE_MS),
      bidiSessions: new Map(),
      bidiWaitMs: numberOption(options.bidiWaitMs, DEFAULT_BIDI_WAIT_MS),
      cursorContextCollector: options.cursorContextCollector !== false,
      cursorContextMaxEntries: numberOption(options.cursorContextMaxEntries, DEFAULT_CURSOR_CONTEXT_MAX_ENTRIES),
      cursorContextTtlMs: numberOption(options.cursorContextTtlMs, DEFAULT_CURSOR_CONTEXT_TTL_MS),
      cursorContexts: new Map(),
      cursorBidiProto: options.cursorBidiProto !== false,
      cursorConnectJson: options.cursorConnectJson !== false,
      cursorNativeProto: options.cursorNativeProto !== false,
      cursorNativeLlmMethods: normalizeStringList(options.cursorNativeLlmMethods, options.cursorNativeLlmMethod) || [],
      decodeDiagnosticSampleChars: numberOption(
        options.decodeDiagnosticSampleChars ?? options.cursorDecodeDiagnosticSampleChars,
        DEFAULT_DECODE_DIAGNOSTIC_SAMPLE_CHARS
      ),
      decodeDiagnosticSampleLimit: numberOption(
        options.decodeDiagnosticSampleLimit ?? options.cursorDecodeDiagnosticSampleLimit,
        DEFAULT_DECODE_DIAGNOSTIC_SAMPLE_LIMIT
      ),
      decodeDumpDir: stringValue(options.decodeDumpDir) ||
        stringValue(options.cursorDecodeDumpDir) ||
        stringValue(process.env.CCR_CURSOR_DECODE_DUMP_DIR) ||
        DEFAULT_DECODE_DUMP_DIR,
      decodeDumpFull: options.decodeDumpFull !== false && options.cursorDecodeDumpFull !== false,
      decodeDiagnostics: options.decodeDiagnostics !== false && options.cursorDecodeDiagnostics !== false,
      decodeTreeDepth: numberOption(options.decodeTreeDepth ?? options.cursorDecodeTreeDepth, DEFAULT_DECODE_TREE_DEPTH),
      forwardDecodedCursorTools: options.forwardDecodedCursorTools !== false && options.cursorForwardDecodedTools !== false,
      forwardCursorNativeBuiltinTools: options.forwardCursorNativeBuiltinTools !== false &&
        options.cursorForwardNativeBuiltinTools !== false,
      bridgeOpenAIToolCalls: options.bridgeOpenAIToolCalls !== false && options.cursorBridgeOpenAIToolCalls !== false,
      showUnbridgedToolCallWarning: options.showUnbridgedToolCallWarning === true ||
        options.cursorShowUnbridgedToolCallWarning === true,
      toolCallBridgeTimeoutMs: numberOption(
        options.toolCallBridgeTimeoutMs ?? options.cursorToolCallBridgeTimeoutMs,
        DEFAULT_CURSOR_TOOL_BRIDGE_TIMEOUT_MS
      ),
      maxToolCallRounds: numberOption(
        options.maxToolCallRounds ?? options.cursorMaxToolCallRounds,
        DEFAULT_CURSOR_TOOL_BRIDGE_MAX_ROUNDS
      ),
      inlineToolCallContinuation: options.inlineToolCallContinuation === true ||
        options.cursorInlineToolCallContinuation === true,
      cursorMcpSkipApproval: options.cursorMcpSkipApproval === true || options.mcpSkipApproval === true,
      chatCompletionSystemPrompt: stringValue(options.systemPrompt) ||
        stringValue(options.openaiSystemPrompt) ||
        stringValue(options.defaultSystemPrompt),
      chatCompletionToolChoice: normalizeToolChoice(
        options.toolChoice ?? options.openaiToolChoice ?? options.defaultToolChoice
      ),
      chatCompletionTools: normalizeConfiguredTools(options.tools ?? options.openaiTools ?? options.defaultTools),
      defaultModel: stringValue(options.defaultModel) || configuredDefaultModel(ctx.config),
      fallbackToCursor: options.fallbackToCursor !== false,
      gatewayApiKey,
      gatewayTimeoutMs: numberOption(options.gatewayTimeoutMs, DEFAULT_GATEWAY_TIMEOUT_MS),
      gatewayUrl,
      logger: ctx.logger,
      options,
      passthroughLogCounts: new Map(),
      passthroughLogLimit: numberOption(options.passthroughLogLimit, DEFAULT_PASSTHROUGH_LOG_LIMIT),
      routing: normalizeCursorProxyRouting(options.routing, options),
      targetModel: stringValue(options.targetModel),
      targetProvider: stringValue(options.targetProvider),
      targetProviders: stringValue(options.targetProviders),
      warnedMissingChatContext: false,
      warnedSuppressedDecodedCursorTools: false
    };

    const backend = await ctx.registerHttpBackend({
      id: "cursor-proxy-adapter",
      async handler(request, response) {
        await handleCursorProxyRequest(runtime, request, response);
      }
    });

    hosts.forEach((host, index) => {
      ctx.registerProxyRoute({
        host,
        id: `cursor-proxy-${host.replace(/[^a-z0-9]+/gi, "-") || index}`,
        paths,
        preserveHost: true,
        upstream: backend.url
      });
    });

    ctx.registerGatewayRoute({
      auth: "none",
      handler(_request, response, helpers) {
        helpers.sendJson(response, 200, {
          backend: backend.url,
          bidiMaxSettleMs: runtime.bidiMaxSettleMs,
          bidiMissingContextWaitMs: runtime.bidiMissingContextWaitMs,
          bidiSettleMs: runtime.bidiSettleMs,
          cursorBidiProto: runtime.cursorBidiProto,
          cursorConnectJson: runtime.cursorConnectJson,
          cursorNativeProto: runtime.cursorNativeProto,
          fallbackToCursor: runtime.fallbackToCursor,
          gatewayUrl,
          hosts,
          collector: {
            auth: options.collectorAuth === "gateway" ? "gateway" : "none",
            contexts: runtime.cursorContexts.size,
            enabled: runtime.cursorContextCollector,
            endpoints: runtime.cursorContextCollector ? ["POST /plugins/cursor-proxy/collector"] : [],
            maxEntries: runtime.cursorContextMaxEntries,
            ttlMs: runtime.cursorContextTtlMs
          },
          debug: {
            auth: options.debugAuth === "gateway" ? "gateway" : "none",
            endpoints: ["GET /plugins/cursor-proxy/debug/sessions"]
          },
          openaiCompatContext: {
            systemPrompt: Boolean(runtime.chatCompletionSystemPrompt),
            toolChoice: runtime.chatCompletionToolChoice !== undefined,
            tools: runtime.chatCompletionTools.length
          },
          agentRunToolForwarding: {
            bridgeOpenAIToolCalls: runtime.bridgeOpenAIToolCalls,
            cursorMcpSkipApproval: runtime.cursorMcpSkipApproval,
            forwardDecodedCursorTools: runtime.forwardDecodedCursorTools,
            forwardCursorNativeBuiltinTools: runtime.forwardCursorNativeBuiltinTools,
            inlineToolCallContinuation: runtime.inlineToolCallContinuation,
            maxToolCallRounds: runtime.maxToolCallRounds,
            toolCallBridgeTimeoutMs: runtime.toolCallBridgeTimeoutMs,
            showUnbridgedToolCallWarning: runtime.showUnbridgedToolCallWarning
          },
          paths: paths || ["*"],
          plugin: "cursor-proxy",
          routing: {
            defaultTarget: runtime.routing.defaultTarget || undefined,
            enabled: runtime.routing.enabled,
            rules: runtime.routing.rules.length
          },
          sessions: runtime.bidiSessions.size,
          targetModel: runtime.targetModel || undefined,
          targetProvider: runtime.targetProvider || undefined,
          targetProviders: runtime.targetProviders || undefined
        });
      },
      id: "cursor-proxy-status",
      method: "GET",
      path: "/plugins/cursor-proxy"
    });

    ctx.registerGatewayRoute({
      auth: options.debugAuth === "gateway" ? "gateway" : "none",
      handler(_request, response, helpers) {
        helpers.sendJson(response, 200, {
          collector: {
            contexts: runtime.cursorContexts.size,
            ttlMs: runtime.cursorContextTtlMs
          },
          plugin: "cursor-proxy",
          sessions: describeBidiSessions(runtime)
        });
      },
      id: "cursor-proxy-debug-sessions",
      method: "GET",
      path: "/plugins/cursor-proxy/debug/sessions"
    });

    if (runtime.cursorContextCollector) {
      ctx.registerGatewayRoute({
        auth: options.collectorAuth === "gateway" ? "gateway" : "none",
        handler(request, response, helpers) {
          return handleCursorContextCollector(runtime, request, response, helpers);
        },
        id: "cursor-proxy-context-collector",
        method: "POST",
        pathPrefix: "/plugins/cursor-proxy/collector"
      });
    }

    ctx.logger.info(
      `Cursor proxy adapter listening at ${backend.url} for ${hosts.join(", ")} ` +
      `(${paths?.join(", ") || "all paths"}) and forwarding JSON and Cursor Agent LLM traffic to ${gatewayUrl}`
    );
  }
};

async function handleCursorProxyRequest(runtime, request, response) {
  const originalUrl = originalRequestUrl(request);
  const url = new URL(request.url || "/", "http://cursor-proxy.local");
  const method = (request.method || "GET").toUpperCase();

  if (method === "OPTIONS") {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  const requestBody = await readRequestBody(request);
  if (runtime.cursorBidiProto) {
    const handled = await handleCursorBidiProtoRequest(runtime, request, response, url, requestBody, originalUrl);
    if (handled) {
      return;
    }
  }
  if (runtime.cursorNativeProto) {
    const handled = await handleCursorNativeProtoRequest(runtime, request, response, url, requestBody);
    if (handled) {
      return;
    }
  }

  const route = resolveGatewayRoute(runtime, request, url, requestBody);

    if (!route) {
      if (runtime.fallbackToCursor && originalUrl) {
        logCursorPassthrough(runtime, method, url.pathname, request.headers);
        await forwardToUrl({
        body: requestBody,
        headers: buildPassthroughHeaders(request.headers, originalUrl),
        method,
        response,
        url: originalUrl
      });
      return;
    }

    sendJson(response, 415, {
      error: {
        code: "unsupported_cursor_request",
        message:
          "Cursor proxy could not map this request to a CCR gateway protocol. " +
          "OpenAI, Anthropic, Gemini JSON requests and Cursor Agent RunSSE protobuf requests are supported; other native Cursor RPC is passed through when fallbackToCursor is enabled."
      }
    });
    return;
  }

  await forwardToUrl({
    body: route.body,
    headers: buildGatewayHeaders(runtime, request.headers, route, route.body),
    method: route.method,
    response,
    url: new URL(route.path, runtime.gatewayUrl)
  });
}

async function handleCursorContextCollector(runtime, request, response, helpers) {
  const body = await helpers.readBody(request);
  const payload = readJsonLikePayload(body);
  if (!isRecord(payload)) {
    helpers.sendJson(response, 400, {
      error: {
        code: "invalid_cursor_context",
        message: "Cursor context collector expects a JSON object."
      }
    });
    return;
  }

  const chatRequest = normalizeCollectedCursorChatRequest(runtime, payload);
  if (!chatRequest) {
    helpers.sendJson(response, 400, {
      error: {
        code: "unsupported_cursor_context",
        message:
          "Cursor context collector could not find chat messages, system instructions, or tools in this payload."
      }
    });
    return;
  }

  const keys = collectCursorContextKeys(payload, chatRequest);
  const stored = storeCursorContext(runtime, {
    chatRequest,
    createdAt: Date.now(),
    keys,
    summary: summarizeChatRequest(chatRequest)
  });

  helpers.sendJson(response, 200, {
    contextKeys: stored.keys,
    stored: true,
    summary: formatChatSummary(stored.summary)
  });
}

async function handleCursorBidiProtoRequest(runtime, request, response, url, requestBody) {
  const method = (request.method || "GET").toUpperCase();
  const path = normalizePath(url.pathname);
  if (method !== "POST") {
    return false;
  }

  if (path === "/aiserver.v1.BidiService/BidiAppend") {
    const append = decodeBidiAppendRequest(requestBody);
    if (!append.requestId) {
      const waitingSession = findSingleWaitingBidiSession(runtime);
      if (!waitingSession) {
        return false;
      }
      append.requestId = waitingSession.requestId;
      runtime.logger?.debug?.(
        `Cursor proxy inferred BidiAppend request id ${append.requestId} from the only waiting RunSSE session ` +
        `(seq=${append.appendSeqno}, body=${requestBody.length}, body_hex=${append.bodyHex}, decoded_body=${append.rpcBodyEncoding}, ` +
        `decoded_hex=${append.rpcBodyHex}, fields=${formatProtoFieldSummary(append.rpcBody)}).`
      );
    }

    const session = getBidiSession(runtime, append.requestId, true);
    const runRequest = appendBidiSessionRequest(session, append);
    if (runRequest) {
      setBidiSessionRunRequest(session, runRequest);
      runtime.logger?.debug?.(
        `Cursor proxy captured AgentRunRequest for Bidi request ${append.requestId} ` +
        `(seq=${append.appendSeqno}, appends=${session.appends.size}, ${formatAgentRunRequestSummary(runtime, runRequest)}).`
      );
    } else if (session.waiters.length > 0) {
      runtime.logger?.debug?.(
        `Cursor proxy buffered BidiAppend for ${append.requestId} but has not decoded AgentRunRequest yet ` +
        `(seq=${append.appendSeqno}, body=${requestBody.length}, body_hex=${append.bodyHex}, decoded_body=${append.rpcBodyEncoding}, ` +
        `decoded_hex=${append.rpcBodyHex}, data=${append.data.length}, ` +
        `data_bytes=${append.dataBytes.length}, data_hex=${append.dataHex}, data_binary=${append.dataBinary.length}, appends=${session.appends.size}, ` +
        `combined_data=${combinedAppendDataLength(session)}, combined_data_bytes=${combinedAppendDataBytesLength(session)}, combined_data_binary=${combinedAppendDataBinaryLength(session)}, ` +
        `fields=${formatProtoFieldSummary(append.rpcBody)}, data_binary_fields=${formatProtoFieldSummary(append.dataBinary)}).`
      );
      logCursorDecodeDiagnostics(
        runtime,
        "debug",
        `Cursor proxy BidiAppend decode diagnostics for ${append.requestId}: ` +
          formatBidiSessionDecodeDiagnostic(runtime, session)
      );
    }

    sendBinary(response, 200, Buffer.alloc(0), protoHeaders());
    return true;
  }

  if (path === "/agent.v1.AgentService/RunSSE") {
    const runSse = decodeRunSseRequest(requestBody);
    const requestId = runSse.requestId || (runSse.runRequest ? createSyntheticBidiRequestId() : "");
    if (!requestId) {
      logCursorDecodeDiagnostics(
        runtime,
        "warn",
        `Cursor proxy could not identify AgentService/RunSSE request id ` +
          `(body=${requestBody.length}, decoded_body=${runSse.rpcBodyEncoding}, fields=${formatProtoFieldSummary(runSse.rpcBody)}, ` +
          `candidates=${formatCandidateBufferSummary(runtime, runSse.candidates)}).`
      );
      return false;
    }

    const session = getBidiSession(runtime, requestId, true);
    session.lastSeen = Date.now();
    if (runSse.runRequest) {
      setBidiSessionRunRequest(session, runSse.runRequest);
      runtime.logger?.debug?.(
        `Cursor proxy captured AgentRunRequest from AgentService/RunSSE body for Bidi request ${requestId} ` +
        `(body=${requestBody.length}, fields=${formatProtoFieldSummary(runSse.rpcBody)}, ` +
        `${formatAgentRunRequestSummary(runtime, runSse.runRequest)}).`
      );
      const chatRequest = convertAgentRunRequestToOpenAIChat(runtime, runSse.runRequest);
      if (chatRequest && isSimplifiedAgentChatRequest(chatRequest)) {
        logCursorDecodeDiagnostics(
          runtime,
          "warn",
          `Cursor proxy RunSSE AgentRunRequest decoded without Cursor context for ${requestId}: ` +
            formatAgentRunRequestDecodeDiagnostic(runtime, runSse.runRequest, chatRequest) +
            `; runsse_candidates=${formatCandidateBufferSummary(runtime, runSse.candidates)}`
        );
      } else {
        logCursorDecodeDiagnostics(
          runtime,
          "debug",
          `Cursor proxy RunSSE decode diagnostics for ${requestId}: ` +
            formatAgentRunRequestDecodeDiagnostic(runtime, runSse.runRequest, chatRequest) +
            `; runsse_candidates=${formatCandidateBufferSummary(runtime, runSse.candidates)}`
        );
      }
    }
    if (!session.runRequest) {
      const runRequest = extractAgentRunRequestFromBidiSession(session);
      if (runRequest) {
        setBidiSessionRunRequest(session, runRequest);
      }
    }
    runtime.logger?.debug?.(`Cursor proxy handling AgentService/RunSSE for Bidi request ${requestId}.`);
    await handleAgentRunSse(runtime, request, response, session);
    return true;
  }

  return false;
}

async function handleAgentRunSse(runtime, request, response, session) {
  response.writeHead(200, corsHeaders(connectProtoHeaders()));

  const initialRunRequest = session.runRequest || await waitForBidiRunRequest(session, runtime.bidiWaitMs);
  if (!initialRunRequest) {
    runtime.logger?.warn?.(
      `Cursor proxy timed out waiting for BidiAppend AgentRunRequest for ${session.requestId} ` +
      `(${formatBidiSessionDiagnostic(session)}).`
    );
    writeCursorConnectMessage(response, encodeCursorAgentTextDelta(
      "Cursor proxy did not receive the AgentRunRequest payload for this RunSSE request."
    ));
    writeCursorConnectMessage(response, encodeCursorAgentTurnEnded());
    finishCursorConnectStream(response);
    return;
  }

  await waitForBidiRunRequestSettle(session, runtime.bidiSettleMs, runtime.bidiMaxSettleMs);
  const runRequest = session.runRequest || initialRunRequest;
  let chatRequest = convertAgentRunRequestToOpenAIChat(runtime, runRequest);
  if (!chatRequest) {
    runtime.logger?.warn?.(`Cursor proxy could not decode AgentRunRequest ${session.requestId} into chat messages.`);
    writeCursorConnectMessage(response, encodeCursorAgentTextDelta(
      "Cursor proxy could not decode this Cursor Agent request into a gateway chat request."
    ));
    writeCursorConnectMessage(response, encodeCursorAgentTurnEnded());
    finishCursorConnectStream(response);
    return;
  }

  chatRequest = applyCollectedCursorContext(runtime, session, runRequest, chatRequest);

  if (isSimplifiedAgentChatRequest(chatRequest) && runtime.bidiMissingContextWaitMs > 0) {
    const richer = await waitForRicherBidiChatRequest(runtime, session, runtime.bidiMissingContextWaitMs, chatRequest);
    if (richer) {
      chatRequest = richer.chatRequest;
    }
  }

  chatRequest = applyCollectedCursorContext(runtime, session, session.runRequest || runRequest, chatRequest);
  logAgentChatConversion(runtime, session, chatRequest);
  await streamAgentChatWithCursorToolBridge(runtime, request, response, session, chatRequest);
}

async function streamAgentChatWithCursorToolBridge(runtime, request, response, session, initialChatRequest) {
  let chatRequest = initialChatRequest;
  let runRequest = session.runRequest;
  let observedRunRequestVersion = session.runRequestVersion || 0;
  const maxRounds = Math.max(1, Math.trunc(Number(runtime.maxToolCallRounds) || DEFAULT_CURSOR_TOOL_BRIDGE_MAX_ROUNDS));

  for (let round = 0; round < maxRounds; round += 1) {
    const bridgeContext = buildCursorToolBridgeContext(runtime, session, runRequest, chatRequest, round);
    const outcome = await streamGatewayChatToCursor(runtime, request, response, chatRequest, bridgeContext);
    if (!outcome || outcome.type !== "tool_calls") {
      return;
    }
    if (runtime.inlineToolCallContinuation !== true) {
      runtime.logger?.debug?.(
        `Cursor proxy handed bridged tool_calls to Cursor Agent for ${session.requestId}; ` +
        `ending this RunSSE so Cursor can execute tools and send the next AgentRunRequest ` +
        `(${summarizeGatewayToolCalls(outcome.toolCalls)}).`
      );
      writeCursorConnectMessage(response, encodeCursorAgentTurnEnded());
      finishCursorConnectStream(response);
      return;
    }

    const nextRunRequest = await waitForBidiRunRequestAfter(
      session,
      observedRunRequestVersion,
      runtime.toolCallBridgeTimeoutMs
    );
    if (!nextRunRequest) {
      runtime.logger?.warn?.(
        `Cursor proxy bridged upstream tool_calls to Cursor Agent for ${session.requestId}, ` +
        `but did not receive a follow-up AgentRunRequest with tool results within ` +
        `${runtime.toolCallBridgeTimeoutMs}ms (${summarizeGatewayToolCalls(outcome.toolCalls)}).`
      );
      writeCursorConnectMessage(response, encodeCursorAgentTextDelta(
        "\n\n[Cursor proxy] Cursor did not return tool results after the proxy emitted Cursor Agent tool events."
      ));
      writeCursorConnectMessage(response, encodeCursorAgentTurnEnded());
      finishCursorConnectStream(response);
      return;
    }

    observedRunRequestVersion = session.runRequestVersion || observedRunRequestVersion;
    await waitForBidiRunRequestSettle(session, runtime.bidiSettleMs, runtime.bidiMaxSettleMs);
    runRequest = session.runRequest || nextRunRequest;

    let nextChatRequest = convertAgentRunRequestToOpenAIChat(runtime, runRequest);
    if (!nextChatRequest) {
      runtime.logger?.warn?.(
        `Cursor proxy received follow-up AgentRunRequest for ${session.requestId}, ` +
        "but could not decode it into OpenAI chat messages after tool execution."
      );
      writeCursorConnectMessage(response, encodeCursorAgentTextDelta(
        "\n\n[Cursor proxy] Cursor returned a follow-up payload, but the proxy could not decode the tool result context."
      ));
      writeCursorConnectMessage(response, encodeCursorAgentTurnEnded());
      finishCursorConnectStream(response);
      return;
    }

    nextChatRequest = applyCollectedCursorContext(runtime, session, runRequest, nextChatRequest);
    const resultMessages = findToolResultMessages(nextChatRequest?.messages, outcome.toolCalls);
    logCursorToolBridgeFollowUp(
      runtime,
      session,
      runRequest,
      nextChatRequest,
      outcome.toolCalls,
      resultMessages,
      round + 1
    );
    if (resultMessages.length === 0) {
      runtime.logger?.warn?.(
        `Cursor proxy received a follow-up AgentRunRequest for ${session.requestId} after bridging ` +
        `tool_calls, but decoded no matching tool result messages; stopping instead of repeating the ` +
        `same tool call (${summarizeGatewayToolCalls(outcome.toolCalls)}, ${formatChatRequestSummary(nextChatRequest)}).`
      );
      writeCursorConnectMessage(response, encodeCursorAgentTextDelta(
        "\n\n[Cursor proxy] Cursor returned a follow-up request, but the proxy decoded no matching tool result message. " +
        "Stopped before repeating the same tool call; check cursor-proxy decode dumps/logs for the follow-up payload."
      ));
      writeCursorConnectMessage(response, encodeCursorAgentTurnEnded());
      finishCursorConnectStream(response);
      return;
    }
    writeCursorMcpToolResultEvents(runtime, response, outcome.toolCalls, bridgeContext, nextChatRequest, outcome.modelCallId);
    chatRequest = mergeToolCallContinuationChatRequest(chatRequest, outcome.toolCalls, nextChatRequest);
    logAgentToolContinuation(runtime, session, outcome.toolCalls, chatRequest, round + 1);
  }

  runtime.logger?.warn?.(
    `Cursor proxy stopped tool-call bridge for ${session.requestId} after ${maxRounds} rounds ` +
    `(${formatChatRequestSummary(chatRequest)}).`
  );
  writeCursorConnectMessage(response, encodeCursorAgentTextDelta(
    `\n\n[Cursor proxy] Stopped after ${maxRounds} tool-call bridge rounds.`
  ));
  writeCursorConnectMessage(response, encodeCursorAgentTurnEnded());
  finishCursorConnectStream(response);
}

async function handleCursorNativeProtoRequest(runtime, request, response, url, requestBody) {
  const method = (request.method || "GET").toUpperCase();
  const path = normalizePath(url.pathname);
  if (method !== "POST" || !isCursorNativeLlmRpcPath(runtime, path) || requestBody.length === 0) {
    return false;
  }

  const chatRequest = convertCursorNativeRequestToOpenAIChat(runtime, path, requestBody);
  if (!chatRequest) {
    return false;
  }

  runtime.logger?.debug?.(
    `Cursor proxy converted native Cursor RPC ${path} to OpenAI chat ` +
    `(messages=${Array.isArray(chatRequest.messages) ? chatRequest.messages.length : 0}, ` +
    `tools=${Array.isArray(chatRequest.tools) ? chatRequest.tools.length : 0}).`
  );
  if (isSimplifiedAgentChatRequest(chatRequest)) {
    logCursorDecodeDiagnostics(
      runtime,
      "warn",
      `Cursor proxy native Cursor RPC ${path} decoded without system/tools: ` +
        formatCursorNativeProtoDecodeDiagnostic(runtime, path, requestBody, chatRequest)
    );
  }
  response.writeHead(200, corsHeaders(connectProtoHeaders()));
  await streamGatewayChatToCursor(runtime, request, response, chatRequest);
  return true;
}

function convertCursorNativeRequestToOpenAIChat(runtime, path, requestBody) {
  const candidateBuffers = cursorNativeCandidateBuffers(requestBody);
  const runRequest = extractAgentRunRequestFromCandidates(candidateBuffers);
  if (runRequest) {
    return convertAgentRunRequestToOpenAIChat(runtime, runRequest);
  }

  const decodedValues = collectCursorNativeDecodedValues(candidateBuffers);
  const fromDecodedValues = convertCursorDecodedValuesToOpenAIChat(runtime, path, decodedValues, {
    loosePromptFallback: false,
    requireInteractiveMessage: true
  });
  if (fromDecodedValues) {
    return fromDecodedValues;
  }

  const jsonPayload = readJsonLikePayload(requestBody);
  if (jsonPayload !== undefined) {
    return convertCursorJsonPayloadToOpenAIChat(runtime, path, jsonPayload);
  }

  return undefined;
}

function cursorNativeCandidateBuffers(body) {
  const candidates = [];
  const decoded = decodeCursorProtoBody(body);
  candidates.push(decoded.body);
  candidates.push(...binaryCandidateBuffers(body));
  if (decoded.body && !decoded.body.equals?.(body)) {
    candidates.push(...binaryCandidateBuffers(decoded.body));
  }
  return uniqueBuffers(candidates);
}

function collectCursorNativeDecodedValues(candidateBuffers) {
  const values = [];
  for (const buffer of candidateBuffers) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      continue;
    }
    if (looksLikeTextBuffer(buffer)) {
      values.push(buffer.toString("utf8"));
      const parsed = readJsonText(buffer.toString("utf8"));
      if (parsed !== undefined) {
        values.push(parsed);
      }
    }
    for (const item of decodeAllProtoStrings(buffer)) {
      if (!item.value || looksLikeNoiseString(item.value)) {
        continue;
      }
      values.push(item.value);
      const parsed = readJsonText(item.value);
      if (parsed !== undefined) {
        values.push(parsed);
      }
      for (const decoded of decodeEmbeddedStringValues(item.value)) {
        values.push(decoded);
      }
    }
  }
  return uniqueDecodedValues(values);
}

function convertCursorDecodedValuesToOpenAIChat(runtime, path, values, options = {}) {
  if (!Array.isArray(values) || values.length === 0) {
    return undefined;
  }

  const messages = extractMessagesFromValues(values);
  if (messages.length === 0) {
    const prompt = findFirstStringFromValues(values, [
      "input",
      "instruction",
      "message",
      "prompt",
      "query",
      "text",
      "userMessage",
      "user_message"
    ]) || (options.loosePromptFallback === false ? undefined : findBestPromptStringFromValues(values));
    if (prompt) {
      messages.push({ content: prompt, role: "user" });
    }
  }
  if (messages.length === 0) {
    return undefined;
  }

  const systemPrompt = selectPreferredSystemPrompt(
    extractSystemPromptFromValues(values),
    findBestSystemPromptStringFromValues(values)
  );
  if (systemPrompt && !messages.some((message) => message.role === "system")) {
    messages.unshift({ content: systemPrompt, role: "system" });
  }

  const compactedMessages = compactChatMessages(messages);
  if (compactedMessages.length === 0) {
    return undefined;
  }
  if (options.requireInteractiveMessage !== false && !hasInteractiveChatMessage(compactedMessages)) {
    return undefined;
  }

  const tools = extractToolsFromValues(values);
  const toolChoice = extractToolChoiceFromValues(values);
  const model =
    findFirstStringFromValues(values, ["model", "modelName", "selectedModel", "intentModel", "chatModel"]) ||
    runtime.defaultModel ||
    "cursor-proxy";

  return compactObject({
    frequency_penalty: findFirstNumberFromValues(values, ["frequency_penalty", "frequencyPenalty"]),
    max_tokens: findFirstNumberFromValues(values, ["max_tokens", "maxTokens", "maxOutputTokens", "output_tokens"]),
    messages: compactedMessages,
    model,
    presence_penalty: findFirstNumberFromValues(values, ["presence_penalty", "presencePenalty"]),
    stream: path.toLowerCase().includes("stream") || findFirstBooleanFromValues(values, ["stream", "shouldStream"]) !== false,
    temperature: findFirstNumberFromValues(values, ["temperature"]),
    tool_choice: toolChoice,
    tools: tools.length > 0 ? tools : undefined,
    top_p: findFirstNumberFromValues(values, ["top_p", "topP"])
  });
}

function hasInteractiveChatMessage(messages) {
  return messages.some((message) => ["assistant", "tool", "user"].includes(message.role));
}

function normalizeCollectedCursorChatRequest(runtime, payload) {
  const candidates = collectCursorContextPayloadCandidates(payload);
  for (const candidate of candidates) {
    const direct = normalizeCollectedOpenAIChatPayload(runtime, candidate);
    if (direct) {
      return direct;
    }

    const converted = convertCursorDecodedValuesToOpenAIChat(runtime, "/collector", [candidate], {
      loosePromptFallback: false,
      requireInteractiveMessage: false
    });
    if (converted) {
      return converted;
    }
  }
  return undefined;
}

function collectCursorContextPayloadCandidates(payload) {
  const candidates = [];
  const add = (value) => {
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value === "string") {
      const parsed = readJsonText(value);
      if (parsed !== undefined) {
        candidates.push(parsed);
      }
      return;
    }
    candidates.push(value);
  };

  if (isRecord(payload)) {
    for (const key of [
      "openai",
      "openaiRequest",
      "openai_request",
      "chat",
      "chatRequest",
      "chat_request",
      "request",
      "body",
      "payload",
      "message"
    ]) {
      add(payload[key]);
    }
  }
  add(payload);
  return uniqueDecodedValues(candidates);
}

function normalizeCollectedOpenAIChatPayload(runtime, payload) {
  if (!isRecord(payload)) {
    return undefined;
  }

  const messages = Array.isArray(payload.messages)
    ? compactChatMessages(payload.messages.map((message) => isRecord(message) ? message : undefined).filter(Boolean))
    : extractMessages(payload);
  const systemPrompt = extractSystemPrompt(payload);
  if (systemPrompt && !messages.some((message) => message.role === "system")) {
    messages.unshift({ content: systemPrompt, role: "system" });
  }

  const compactedMessages = compactChatMessages(messages);
  const tools = Array.isArray(payload.tools) ? normalizeToolList(payload.tools) : extractTools(payload);
  const toolChoice = normalizeToolChoice(payload.tool_choice ?? payload.toolChoice) ?? extractToolChoice(payload);

  if (
    compactedMessages.length === 0 &&
    tools.length === 0 &&
    !systemPrompt &&
    toolChoice === undefined
  ) {
    return undefined;
  }

  return compactObject({
    frequency_penalty: numberFromParameter(payload.frequency_penalty ?? payload.frequencyPenalty),
    max_tokens: numberFromParameter(payload.max_tokens ?? payload.maxTokens ?? payload.maxOutputTokens ?? payload.output_tokens),
    messages: compactedMessages.length > 0 ? compactedMessages : undefined,
    model: stringValue(payload.model) ||
      stringValue(payload.modelName) ||
      stringValue(payload.selectedModel) ||
      runtime.defaultModel ||
      "cursor-proxy",
    parallel_tool_calls: typeof payload.parallel_tool_calls === "boolean" ? payload.parallel_tool_calls : undefined,
    presence_penalty: numberFromParameter(payload.presence_penalty ?? payload.presencePenalty),
    reasoning_effort: payload.reasoning_effort,
    reasoning_split: payload.reasoning_split,
    response_format: isRecord(payload.response_format) ? payload.response_format : undefined,
    stream: payload.stream === undefined ? true : Boolean(payload.stream),
    temperature: numberFromParameter(payload.temperature),
    tool_choice: toolChoice,
    tools: tools.length > 0 ? tools : undefined,
    top_p: numberFromParameter(payload.top_p ?? payload.topP)
  });
}

function convertCursorJsonPayloadToOpenAIChat(runtime, path, payload) {
  const unwrapped = unwrapCursorJson(payload);
  if (unwrapped === undefined) {
    return undefined;
  }
  const converted = convertCursorDecodedValuesToOpenAIChat(runtime, path, [unwrapped], {
    loosePromptFallback: false,
    requireInteractiveMessage: true
  });
  if (converted) {
    return converted;
  }
  const body = Buffer.from(`${JSON.stringify(unwrapped)}\n`, "utf8");
  return convertCursorJsonToOpenAIChat(runtime, path, body);
}

function decodeBidiAppendRequest(body) {
  const decodedBody = decodeCursorProtoBody(body);
  const rpcBody = decodedBody.body;
  const dataBytes = concatProtoBytesFields(rpcBody, 1);
  const dataBinary = concatProtoBytesFields(rpcBody, 4);
  return {
    appendSeqno: decodeProtoIntField(rpcBody, 3),
    bodyHex: body.subarray(0, 32).toString("hex"),
    data: dataBytes.length > 0 ? dataBytes.toString("utf8") : "",
    dataBytes,
    dataHex: dataBytes.subarray(0, 32).toString("hex"),
    dataBinary,
    rawBody: body,
    rpcBody,
    rpcBodyEncoding: decodedBody.encoding,
    rpcBodyHex: rpcBody.subarray(0, 32).toString("hex"),
    requestId: decodeBidiAppendRequestId(rpcBody)
  };
}

function decodeBidiAppendRequestId(rpcBody) {
  const requestIdMessage = decodeProtoMessageFields(rpcBody, 2)[0];
  return decodeProtoStringField(requestIdMessage, 1) ||
    decodeProtoStringField(rpcBody, 2) ||
    findFirstUuidString(requestIdMessage) ||
    findFirstUuidString(rpcBody) ||
    "";
}

function decodeRunSseRequest(body) {
  const decodedBody = decodeCursorProtoBody(body);
  const rpcBody = decodedBody.body;
  const candidates = runSseCandidateBuffers(body, rpcBody);
  return {
    candidates,
    rpcBodyEncoding: decodedBody.encoding,
    requestId: decodeBidiRequestId(rpcBody),
    rpcBody,
    runRequest: extractAgentRunRequestFromCandidates(candidates)
  };
}

function decodeBidiRequestId(body) {
  return decodeProtoStringField(body, 1) ||
    decodeProtoStringField(decodeProtoMessageFields(body, 1)[0], 1) ||
    findFirstUuidString(body) ||
    "";
}

function findFirstUuidString(buffer) {
  for (const item of decodeAllProtoStrings(buffer)) {
    const match = item.value.match(UUID_PATTERN);
    if (match) {
      return match[0];
    }
  }
  return "";
}

function createSyntheticBidiRequestId() {
  return `runsse-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function decodeCursorProtoBody(body) {
  const fallbackBody = decodeConnectEnvelope(body);
  const candidates = [];
  const addCandidate = (buffer, encoding) => {
    if (Buffer.isBuffer(buffer) && buffer.length > 0) {
      candidates.push({ body: buffer, encoding });
    }
  };

  addCandidate(fallbackBody, "connect");
  for (const frame of decodeConnectMessages(body)) {
    addCandidate(frame, "connect-frame");
  }

  const decompressedBody = decompressConnectPayload(body);
  if (decompressedBody) {
    addCandidate(decompressedBody, "compressed");
    for (const frame of decodeConnectMessages(decompressedBody)) {
      addCandidate(frame, "compressed-connect-frame");
    }
  }

  for (const candidate of candidates) {
    if (hasReadableProtoFields(candidate.body)) {
      return candidate;
    }
  }
  return { body: fallbackBody, encoding: "raw" };
}

function appendBidiSessionRequest(session, append) {
  session.lastSeen = Date.now();
  session.appendSeqno = append.appendSeqno;
  let key = append.appendSeqno || session.appends.size + 1;
  while (session.appends.has(key)) {
    key += 1e-6;
  }
  session.appends.set(key, append);
  while (session.appends.size > 128) {
    const firstKey = session.appends.keys().next().value;
    session.appends.delete(firstKey);
  }
  return extractAgentRunRequestFromBidiSession(session);
}

function extractAgentRunRequestFromBidiSession(session) {
  return extractAgentRunRequestFromCandidates(bidiSessionCandidateBuffers(session));
}

function bidiSessionCandidateBuffers(session) {
  const appends = sortedBidiAppends(session);
  const candidates = [];

  const combinedDataBinary = Buffer.concat(appends.map((append) => append.dataBinary).filter((buffer) => buffer.length > 0));
  if (combinedDataBinary.length > 0) {
    candidates.push(combinedDataBinary);
    candidates.push(...decodeConnectMessages(combinedDataBinary));
  }

  const combinedDataBytes = Buffer.concat(appends.map((append) => append.dataBytes).filter((buffer) => buffer.length > 0));
  if (combinedDataBytes.length > 0) {
    candidates.push(combinedDataBytes);
    candidates.push(...decodeConnectMessages(combinedDataBytes));
  }

  const combinedData = appends.map((append) => append.data || "").join("");
  if (combinedData) {
    candidates.push(...stringCandidateBuffers(combinedData));
    candidates.push(...stringCandidateBuffers(combinedData.replace(/\s+/g, "")));
  }

  for (const append of appends) {
    candidates.push(...bidiAppendCandidateBuffers(append));
  }

  return candidates;
}

function runSseCandidateBuffers(body, rpcBody) {
  const candidates = [];
  candidates.push(...binaryCandidateBuffers(rpcBody));
  candidates.push(...binaryCandidateBuffers(body));
  return candidates;
}

function sortedBidiAppends(session) {
  return [...session.appends.entries()]
    .sort((left, right) => Number(left[0]) - Number(right[0]))
    .map((entry) => entry[1]);
}

function combinedAppendDataLength(session) {
  return sortedBidiAppends(session).reduce((total, append) => total + append.data.length, 0);
}

function combinedAppendDataBytesLength(session) {
  return sortedBidiAppends(session).reduce((total, append) => total + append.dataBytes.length, 0);
}

function combinedAppendDataBinaryLength(session) {
  return sortedBidiAppends(session).reduce((total, append) => total + append.dataBinary.length, 0);
}

function formatBidiSessionDiagnostic(session) {
  const appends = sortedBidiAppends(session);
  const lastAppend = appends[appends.length - 1];
  return [
    `appends=${session.appends.size}`,
    `last_seq=${lastAppend?.appendSeqno || session.appendSeqno || 0}`,
    `combined_data=${combinedAppendDataLength(session)}`,
    `combined_data_bytes=${combinedAppendDataBytesLength(session)}`,
    `combined_data_binary=${combinedAppendDataBinaryLength(session)}`,
    `last_data=${lastAppend?.data.length || 0}`,
    `last_data_bytes=${lastAppend?.dataBytes.length || 0}`,
    `last_data_hex=${lastAppend?.dataHex || ""}`,
    `last_data_binary=${lastAppend?.dataBinary.length || 0}`,
    `last_fields=${lastAppend ? formatProtoFieldSummary(lastAppend.rpcBody) : "empty"}`,
    `last_data_binary_fields=${lastAppend ? formatProtoFieldSummary(lastAppend.dataBinary) : "empty"}`,
    `append_details=${formatBidiAppendDetails(appends)}`
  ].join(", ");
}

function formatBidiAppendDetails(appends) {
  if (!appends.length) {
    return "empty";
  }
  return appends.slice(-16).map((append) => {
    return [
      `seq:${append.appendSeqno || 0}`,
      `data:${append.data.length}`,
      `data_bytes:${append.dataBytes.length}`,
      `data_hex:${append.dataHex}`,
      `data_binary:${append.dataBinary.length}`,
      `fields:${formatProtoFieldSummary(append.rpcBody)}`,
      `data_binary_fields:${formatProtoFieldSummary(append.dataBinary)}`
    ].join("/");
  }).join("|");
}

function extractAgentRunRequestFromBidiAppend(append) {
  return extractAgentRunRequestFromCandidates(bidiAppendCandidateBuffers(append));
}

function bidiAppendCandidateBuffers(append) {
  const candidates = [];
  candidates.push(...binaryCandidateBuffers(append.rawBody));
  candidates.push(...binaryCandidateBuffers(append.rpcBody));
  if (append.dataBinary.length > 0) {
    candidates.push(...binaryCandidateBuffers(append.dataBinary));
  }
  if (append.dataBytes.length > 0) {
    candidates.push(...binaryCandidateBuffers(append.dataBytes));
  }
  if (append.data) {
    candidates.push(...stringCandidateBuffers(append.data));
  }
  return candidates;
}

function binaryCandidateBuffers(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return [];
  }
  const candidates = [buffer];
  const framed = decodeConnectMessages(buffer);
  if (framed.length > 0 && !(framed.length === 1 && framed[0] === buffer)) {
    candidates.push(...framed);
  }
  const decompressed = decompressConnectPayload(buffer);
  if (decompressed && decompressed.length > 0 && !decompressed.equals(buffer)) {
    candidates.push(decompressed);
    candidates.push(...decodeConnectMessages(decompressed));
  }
  candidates.push(...lengthPrefixedCandidateBuffers(buffer));

  if (looksLikeTextBuffer(buffer)) {
    candidates.push(...stringCandidateBuffers(buffer.toString("utf8")));
  }
  return candidates;
}

function lengthPrefixedCandidateBuffers(buffer) {
  const candidates = [];
  const varintLength = readProtoVarint(buffer, 0);
  if (varintLength) {
    const start = varintLength.offset;
    const end = start + Number(varintLength.value);
    if (end > start && end <= buffer.length) {
      candidates.push(buffer.subarray(start, end));
    }
  }

  if (buffer.length >= 4) {
    const bigEndianLength = buffer.readUInt32BE(0);
    if (bigEndianLength > 0 && bigEndianLength <= buffer.length - 4) {
      candidates.push(buffer.subarray(4, 4 + bigEndianLength));
    }
    const littleEndianLength = buffer.readUInt32LE(0);
    if (littleEndianLength > 0 && littleEndianLength <= buffer.length - 4) {
      candidates.push(buffer.subarray(4, 4 + littleEndianLength));
    }
  }

  return candidates;
}

function looksLikeTextBuffer(buffer) {
  const sampleLength = Math.min(buffer.length, 512);
  if (sampleLength === 0) {
    return false;
  }
  let textLike = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    const byte = buffer[index];
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) {
      textLike += 1;
    }
  }
  return textLike / sampleLength > 0.9;
}

function stringCandidateBuffers(value) {
  const candidates = [];
  const text = String(value || "");
  if (!text) {
    return candidates;
  }
  candidates.push(Buffer.from(text, "utf8"));
  const trimmed = text.trim();
  if (!trimmed) {
    return candidates;
  }
  for (const candidate of base64CandidateBuffers(trimmed)) {
    candidates.push(candidate);
  }
  if (/^(?:[0-9a-f]{2})+$/i.test(trimmed)) {
    candidates.push(Buffer.from(trimmed, "hex"));
  }
  if (/%[0-9a-f]{2}/i.test(trimmed)) {
    try {
      candidates.push(...stringCandidateBuffers(decodeURIComponent(trimmed)));
    } catch {
      // Not URI encoded.
    }
  }
  const parsed = readJsonText(trimmed);
  if (parsed) {
    for (const item of findStringValuesByKeys(parsed, ["data", "dataBinary", "data_binary", "payload", "message"])) {
      candidates.push(...stringCandidateBuffers(item));
    }
  }
  return candidates;
}

function decodeEmbeddedStringValues(value, depth = 0) {
  if (depth > 3 || typeof value !== "string") {
    return [];
  }
  const trimmed = value.trim();
  if (!trimmed || looksLikeNoiseString(trimmed)) {
    return [];
  }

  const decoded = [];
  const parsed = readJsonText(trimmed);
  if (parsed !== undefined) {
    decoded.push(parsed);
    for (const item of findStringValuesByKeys(parsed, ["body", "data", "dataBinary", "data_binary", "message", "payload", "request"])) {
      decoded.push(...decodeEmbeddedStringValues(item, depth + 1));
    }
  }

  if (/%[0-9a-f]{2}/i.test(trimmed)) {
    try {
      const uriDecoded = decodeURIComponent(trimmed);
      if (uriDecoded !== trimmed) {
        decoded.push(uriDecoded);
        decoded.push(...decodeEmbeddedStringValues(uriDecoded, depth + 1));
      }
    } catch {
      // Not URI encoded.
    }
  }

  for (const buffer of base64CandidateBuffers(trimmed)) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      continue;
    }
    if (looksLikeTextBuffer(buffer)) {
      const text = buffer.toString("utf8").trim();
      if (text && text !== trimmed && !looksLikeNoiseString(text)) {
        decoded.push(text);
        decoded.push(...decodeEmbeddedStringValues(text, depth + 1));
      }
    }
    for (const item of decodeAllProtoStrings(buffer)) {
      if (item.value && !looksLikeNoiseString(item.value)) {
        decoded.push(item.value);
        decoded.push(...decodeEmbeddedStringValues(item.value, depth + 1));
      }
    }
  }

  return uniqueDecodedValues(decoded);
}

function uniqueBuffers(buffers) {
  const result = [];
  const seen = new Set();
  for (const buffer of buffers) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      continue;
    }
    const key = `${buffer.length}:${buffer.subarray(0, 32).toString("hex")}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(buffer);
  }
  return result;
}

function uniqueDecodedValues(values) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }
    const key = typeof value === "string" ? `s:${value}` : `j:${safeJsonStringify(value)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function base64CandidateBuffers(text) {
  const candidates = [];
  const compact = text.replace(/\s+/g, "");
  if (!compact || compact.length < 4) {
    return candidates;
  }
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    candidates.push(Buffer.from(padBase64(compact), "base64"));
  }
  if (/^[A-Za-z0-9_-]+={0,2}$/.test(compact)) {
    candidates.push(Buffer.from(padBase64(compact), "base64url"));
  }
  return candidates;
}

function padBase64(value) {
  const remainder = value.length % 4;
  return remainder === 0 ? value : `${value}${"=".repeat(4 - remainder)}`;
}

function extractAgentRunRequestFromCandidates(candidates) {
  const uniqueCandidates = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (!Buffer.isBuffer(candidate) || candidate.length === 0) {
      continue;
    }
    const key = `${candidate.length}:${candidate.subarray(0, 16).toString("hex")}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueCandidates.push(candidate);
    const runRequest = extractAgentRunRequest(candidate, 0);
    if (runRequest) {
      return runRequest;
    }
  }
  for (const candidate of uniqueCandidates) {
    const runRequest = extractAgentRunRequestFromOffsets(candidate);
    if (runRequest) {
      return runRequest;
    }
  }
  return undefined;
}

function extractAgentRunRequest(message, depth) {
  if (!Buffer.isBuffer(message) || message.length === 0 || depth > 8) {
    return undefined;
  }

  if (looksLikeAgentRunRequest(message)) {
    return message;
  }

  const runRequest = decodeProtoMessageFields(message, 1)[0];
  if (looksLikeAgentRunRequest(runRequest)) {
    return runRequest;
  }

  for (const field of readLengthDelimitedProtoFields(message)) {
    const nested = extractAgentRunRequest(field.value, depth + 1);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function extractAgentRunRequestFromOffsets(message) {
  if (!Buffer.isBuffer(message) || message.length < 2) {
    return undefined;
  }
  const maxOffset = Math.min(16, message.length - 1);
  for (let offset = 1; offset <= maxOffset; offset += 1) {
    const nested = extractAgentRunRequest(message.subarray(offset), 1);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function looksLikeAgentRunRequest(message) {
  if (!Buffer.isBuffer(message) || message.length === 0) {
    return false;
  }
  return Boolean(
    looksLikeConversationState(decodeProtoMessageFields(message, 1)[0]) ||
    looksLikeConversationAction(decodeProtoMessageFields(message, 2)[0]) ||
    looksLikeModelDetails(decodeProtoMessageFields(message, 3)[0]) ||
    looksLikeRequestedModel(decodeProtoMessageFields(message, 9)[0]) ||
    decodeProtoStringField(message, 5) ||
    decodeProtoStringField(message, 8) ||
    decodeProtoStringField(message, 18)
  );
}

function looksLikeConversationState(message) {
  return Buffer.isBuffer(message) && (
    decodeProtoStringFields(message, 1).length > 0 ||
    decodeProtoMessageFields(message, 8).length > 0
  );
}

function looksLikeConversationAction(message) {
  if (!Buffer.isBuffer(message)) {
    return false;
  }
  const userMessageAction = decodeProtoMessageFields(message, 1)[0];
  const startPlanAction = decodeProtoMessageFields(message, 6)[0];
  return Boolean(
    decodeUserMessage(decodeProtoMessageFields(userMessageAction, 1)[0]) ||
    decodeProtoMessageFields(userMessageAction, 4).some((item) => decodeUserMessage(item)) ||
    decodeUserMessage(decodeProtoMessageFields(startPlanAction, 1)[0])
  );
}

function looksLikeModelDetails(message) {
  return Buffer.isBuffer(message) && Boolean(decodeProtoStringField(message, 1));
}

function looksLikeRequestedModel(message) {
  return Buffer.isBuffer(message) && Boolean(decodeProtoStringField(message, 1));
}

function getBidiSession(runtime, requestId, create) {
  cleanupBidiSessions(runtime);
  let session = runtime.bidiSessions.get(requestId);
  if (!session && create) {
    session = {
      createdAt: Date.now(),
      lastSeen: Date.now(),
      lastRunRequestAt: 0,
      requestId,
      runRequest: undefined,
      appends: new Map(),
      waiters: []
    };
    runtime.bidiSessions.set(requestId, session);
  }
  return session;
}

function findSingleWaitingBidiSession(runtime) {
  cleanupBidiSessions(runtime);
  const waitingSessions = [...runtime.bidiSessions.values()].filter((session) => session.waiters.length > 0);
  return waitingSessions.length === 1 ? waitingSessions[0] : undefined;
}

function cleanupBidiSessions(runtime) {
  const now = Date.now();
  for (const [requestId, session] of runtime.bidiSessions) {
    if (now - session.lastSeen > runtime.bidiSessionTtlMs) {
      runtime.bidiSessions.delete(requestId);
    }
  }
}

function describeBidiSessions(runtime) {
  cleanupBidiSessions(runtime);
  return [...runtime.bidiSessions.values()]
    .map((session) => describeBidiSession(runtime, session))
    .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
    .slice(0, 25);
}

function describeBidiSession(runtime, session) {
  const appends = sortedBidiAppends(session);
  const chatRequest = session.runRequest ? convertAgentRunRequestToOpenAIChat(runtime, session.runRequest) : undefined;
  return {
    ageMs: Date.now() - session.createdAt,
    appendDetails: formatBidiAppendDetails(appends),
    appendSeqno: session.appendSeqno || 0,
    appends: appends.length,
    chat: chatRequest ? summarizeChatRequest(chatRequest) : undefined,
    combinedDataBinaryBytes: combinedAppendDataBinaryLength(session),
    combinedDataBytes: combinedAppendDataBytesLength(session),
    combinedDataTextBytes: combinedAppendDataLength(session),
    decodedHints: summarizeBidiDecodedHints(session),
    lastRunRequestAt: session.lastRunRequestAt || 0,
    lastSeenAgoMs: Date.now() - session.lastSeen,
    lastSeenAt: session.lastSeen,
    requestId: session.requestId,
    waiters: session.waiters.length
  };
}

function summarizeBidiDecodedHints(session) {
  const strings = [];
  const addStringsFromBuffer = (buffer) => {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return;
    }
    if (looksLikeTextBuffer(buffer)) {
      strings.push(buffer.toString("utf8"));
    }
    for (const item of decodeAllProtoStrings(buffer)) {
      strings.push(item.value);
    }
  };

  for (const append of sortedBidiAppends(session)) {
    addStringsFromBuffer(append.rpcBody);
    addStringsFromBuffer(append.dataBytes);
    addStringsFromBuffer(append.dataBinary);
  }

  const uniqueStrings = [...new Set(strings.filter((value) => value && !looksLikeNoiseString(value)))];
  const toolKeyPattern = new RegExp(`\\b(?:${CURSOR_TOOL_KEYS.map(escapeRegExp).join("|")})\\b`, "i");
  return {
    jsonLikeStrings: uniqueStrings.filter((value) => readJsonText(value) !== undefined).length,
    maxStringLength: uniqueStrings.reduce((max, value) => Math.max(max, value.length), 0),
    strings: uniqueStrings.length,
    systemLikeStrings: uniqueStrings.filter(looksLikeSystemPromptText).length,
    toolLikeStrings: uniqueStrings.filter((value) => toolKeyPattern.test(value)).length
  };
}

function setBidiSessionRunRequest(session, runRequest) {
  session.runRequest = runRequest;
  session.lastRunRequestAt = Date.now();
  session.runRequestVersion = (session.runRequestVersion || 0) + 1;
  const waiters = session.waiters.splice(0);
  waiters.forEach((resolve) => resolve(runRequest));
}

function waitForBidiRunRequest(session, timeoutMs) {
  if (session.runRequest) {
    return Promise.resolve(session.runRequest);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const index = session.waiters.indexOf(done);
      if (index >= 0) {
        session.waiters.splice(index, 1);
      }
      resolve(undefined);
    }, timeoutMs);
    const done = (runRequest) => {
      clearTimeout(timer);
      resolve(runRequest);
    };
    session.waiters.push(done);
  });
}

function waitForBidiRunRequestAfter(session, runRequestVersion, timeoutMs) {
  const observedVersion = Math.max(0, Number(runRequestVersion) || 0);
  if ((session.runRequestVersion || 0) > observedVersion && session.runRequest) {
    return Promise.resolve(session.runRequest);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const index = session.waiters.indexOf(done);
      if (index >= 0) {
        session.waiters.splice(index, 1);
      }
      resolve(undefined);
    }, timeoutMs);
    const done = (runRequest) => {
      clearTimeout(timer);
      if ((session.runRequestVersion || 0) > observedVersion) {
        resolve(runRequest);
      } else {
        resolve(undefined);
      }
    };
    session.waiters.push(done);
  });
}

async function waitForBidiRunRequestSettle(session, settleMs, maxSettleMs) {
  const settleWindow = Math.max(0, Number(settleMs) || 0);
  const maxWindow = Math.max(settleWindow, Number(maxSettleMs) || 0);
  if (!session.runRequest || settleWindow <= 0 || maxWindow <= 0) {
    return;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < maxWindow) {
    const updatedAt = session.lastRunRequestAt || startedAt;
    const quietFor = Date.now() - updatedAt;
    if (quietFor >= settleWindow) {
      return;
    }
    const remainingSettle = settleWindow - quietFor;
    const remainingMax = maxWindow - (Date.now() - startedAt);
    await sleep(Math.max(1, Math.min(remainingSettle, remainingMax)));
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRicherBidiChatRequest(runtime, session, timeoutMs, baseChatRequest) {
  const startedAt = Date.now();
  const deadline = startedAt + Math.max(0, Number(timeoutMs) || 0);
  let observedRunRequestAt = session.lastRunRequestAt || startedAt;
  let currentChatRequest = baseChatRequest;

  while (Date.now() < deadline) {
    if (session.runRequest) {
      const decoded = convertAgentRunRequestToOpenAIChat(runtime, session.runRequest);
      if (decoded) {
        currentChatRequest = decoded;
      }
    }

    const collected = findCollectedCursorContext(runtime, session, session.runRequest, currentChatRequest);
    if (collected) {
      runtime.logger?.debug?.(
        `Cursor proxy found collected Cursor context for ${session.requestId} after ` +
        `${Date.now() - startedAt}ms (${formatChatRequestSummary(collected.chatRequest)}).`
      );
      return { chatRequest: collected.chatRequest, runRequest: session.runRequest };
    }

    if ((session.lastRunRequestAt || 0) > observedRunRequestAt && session.runRequest) {
      observedRunRequestAt = session.lastRunRequestAt;
      const chatRequest = currentChatRequest || convertAgentRunRequestToOpenAIChat(runtime, session.runRequest);
      if (chatRequest && !isSimplifiedAgentChatRequest(chatRequest)) {
        runtime.logger?.debug?.(
          `Cursor proxy found richer AgentRunRequest for ${session.requestId} after ` +
          `${Date.now() - startedAt}ms (${formatChatRequestSummary(chatRequest)}).`
        );
        return { chatRequest, runRequest: session.runRequest };
      }
    }
    await sleep(Math.min(100, Math.max(1, deadline - Date.now())));
  }

  return undefined;
}

function collectCursorContextKeys(payload, chatRequest) {
  const keys = new Set();
  const add = (value) => {
    const text = stringValue(value);
    if (!text) {
      return;
    }
    keys.add(text);
    for (const match of text.matchAll(new RegExp(UUID_PATTERN.source, "ig"))) {
      keys.add(match[0]);
    }
  };

  if (isRecord(payload)) {
    for (const key of [
      "requestId",
      "request_id",
      "bidiRequestId",
      "bidi_request_id",
      "runId",
      "run_id",
      "conversationId",
      "conversation_id",
      "clientRequestId",
      "client_request_id",
      "chatId",
      "chat_id",
      "threadId",
      "thread_id",
      "sessionId",
      "session_id",
      "traceId",
      "trace_id"
    ]) {
      add(payload[key]);
    }
  }

  for (const value of findStringValuesByKeys(payload, [
    "requestId",
    "request_id",
    "bidiRequestId",
    "bidi_request_id",
    "conversationId",
    "conversation_id",
    "clientRequestId",
    "client_request_id"
  ])) {
    add(value);
  }

  add(lastUserMessageText(chatRequest));
  if (keys.size === 0) {
    keys.add("__latest__");
  }
  keys.add("__latest__");
  return [...keys];
}

function storeCursorContext(runtime, context) {
  cleanupCursorContexts(runtime);
  const keys = context.keys.length > 0 ? context.keys : ["__latest__"];
  const stored = { ...context, keys };
  for (const key of keys) {
    runtime.cursorContexts.set(key, stored);
  }
  trimCursorContexts(runtime);
  return stored;
}

function cleanupCursorContexts(runtime) {
  const ttlMs = Math.max(0, Number(runtime.cursorContextTtlMs) || 0);
  if (ttlMs <= 0) {
    return;
  }
  const now = Date.now();
  for (const [key, context] of runtime.cursorContexts) {
    if (now - context.createdAt > ttlMs) {
      runtime.cursorContexts.delete(key);
    }
  }
}

function trimCursorContexts(runtime) {
  const maxEntries = Math.max(1, Number(runtime.cursorContextMaxEntries) || DEFAULT_CURSOR_CONTEXT_MAX_ENTRIES);
  while (runtime.cursorContexts.size > maxEntries) {
    let oldestKey;
    let oldestAt = Infinity;
    for (const [key, context] of runtime.cursorContexts) {
      if (context.createdAt < oldestAt) {
        oldestAt = context.createdAt;
        oldestKey = key;
      }
    }
    if (!oldestKey) {
      return;
    }
    runtime.cursorContexts.delete(oldestKey);
  }
}

function findCollectedCursorContext(runtime, session, runRequest, chatRequest) {
  if (!runtime.cursorContextCollector || !runtime.cursorContexts?.size) {
    return undefined;
  }
  cleanupCursorContexts(runtime);

  const keys = new Set([session?.requestId]);
  if (runRequest) {
    for (const item of decodeAllProtoStrings(runRequest)) {
      for (const match of item.value.matchAll(new RegExp(UUID_PATTERN.source, "ig"))) {
        keys.add(match[0]);
      }
    }
  }
  for (const key of keys) {
    const context = key ? runtime.cursorContexts.get(key) : undefined;
    if (context) {
      return context;
    }
  }

  if (chatRequest) {
    const matchedByPrompt = findCollectedCursorContextByPrompt(runtime, chatRequest);
    if (matchedByPrompt) {
      return matchedByPrompt;
    }
  }

  if (!chatRequest) {
    const latest = runtime.cursorContexts.get("__latest__");
    return latest && Date.now() - latest.createdAt <= runtime.cursorContextTtlMs ? latest : undefined;
  }
  return undefined;
}

function findCollectedCursorContextByPrompt(runtime, chatRequest) {
  const prompt = lastUserMessageText(chatRequest);
  if (!prompt) {
    return undefined;
  }

  const uniqueContexts = uniqueContextsNewestFirst(runtime.cursorContexts);
  return uniqueContexts.find((context) => chatRequestContainsUserText(context.chatRequest, prompt));
}

function uniqueContextsNewestFirst(contextsByKey) {
  const seen = new Set();
  const contexts = [];
  for (const context of contextsByKey.values()) {
    if (seen.has(context)) {
      continue;
    }
    seen.add(context);
    contexts.push(context);
  }
  return contexts.sort((left, right) => right.createdAt - left.createdAt);
}

function chatRequestContainsUserText(chatRequest, text) {
  const normalizedNeedle = normalizePromptFingerprint(text);
  if (!normalizedNeedle) {
    return false;
  }
  return (Array.isArray(chatRequest?.messages) ? chatRequest.messages : []).some((message) => {
    if (message.role !== "user") {
      return false;
    }
    const normalizedContent = normalizePromptFingerprint(stringifyContent(message.content));
    return normalizedContent === normalizedNeedle ||
      normalizedContent.includes(normalizedNeedle) ||
      normalizedNeedle.includes(normalizedContent);
  });
}

function normalizePromptFingerprint(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(-4000);
}

function lastUserMessageText(chatRequest) {
  const messages = Array.isArray(chatRequest?.messages) ? chatRequest.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return stringifyContent(messages[index].content) || "";
    }
  }
  return "";
}

function applyCollectedCursorContext(runtime, session, runRequest, chatRequest) {
  const collected = findCollectedCursorContext(runtime, session, runRequest, chatRequest);
  if (!collected) {
    return chatRequest;
  }

  const merged = mergeCollectedCursorChatRequest(chatRequest, collected.chatRequest);
  runtime.logger?.debug?.(
    `Cursor proxy applied collected Cursor context for ${session.requestId} ` +
    `(${formatChatRequestSummary(merged)}).`
  );
  return merged;
}

function mergeCollectedCursorChatRequest(baseRequest, collectedRequest) {
  const baseMessages = Array.isArray(baseRequest?.messages) ? baseRequest.messages : [];
  const collectedMessages = Array.isArray(collectedRequest?.messages) ? collectedRequest.messages : [];
  const collectedHasInteractiveMessage = hasInteractiveChatMessage(collectedMessages);
  const messages = collectedHasInteractiveMessage
    ? collectedMessages
    : compactChatMessages([
        ...collectedMessages,
        ...baseMessages
      ]);

  return compactObject({
    ...baseRequest,
    ...collectedRequest,
    messages: messages.length > 0 ? messages : baseMessages,
    model: stringValue(collectedRequest?.model) || stringValue(baseRequest?.model) || "cursor-proxy",
    stream: true,
    tool_choice: collectedRequest?.tool_choice ?? baseRequest?.tool_choice,
    tools: Array.isArray(collectedRequest?.tools) && collectedRequest.tools.length > 0
      ? collectedRequest.tools
      : baseRequest?.tools
  });
}

function convertAgentRunRequestToOpenAIChat(runtime, runRequest) {
  const messages = [];
  const contextValues = decodeAgentRunRequestContextValues(runRequest);
  const fallbackSystemPrompt = decodeProtoStringField(runRequest, 5);
  const systemPrompt = composeAgentSystemPrompt(
    contextValues,
    selectPreferredSystemPrompt(
      decodeProtoStringField(runRequest, 8),
      extractSystemPromptFromValues(contextValues),
      findBestSystemPromptStringFromValues(contextValues),
      looksLikeSystemPromptText(fallbackSystemPrompt) ? fallbackSystemPrompt : undefined
    )
  );
  if (systemPrompt) {
    messages.push({ content: systemPrompt, role: "system" });
  }

  const conversationState = decodeProtoMessageFields(runRequest, 1)[0];
  if (conversationState) {
    messages.push(...decodeConversationStateMessages(conversationState));
  }

  const action = decodeProtoMessageFields(runRequest, 2)[0];
  if (action) {
    messages.push(...decodeConversationActionMessages(action));
  }

  const compactedMessages = compactChatMessages(messages);
  if (compactedMessages.length === 0) {
    const fallbackPrompt = decodeAllProtoStrings(runRequest)
      .map((item) => item.value)
      .filter((value) => value.length > 3 && !looksLikeNoiseString(value))
      .sort((a, b) => b.length - a.length)[0];
    if (fallbackPrompt) {
      compactedMessages.push({ content: fallbackPrompt, role: "user" });
    }
  }
  if (compactedMessages.length === 0) {
    return undefined;
  }

  const requestedModel = decodeProtoMessageFields(runRequest, 9)[0];
  const modelDetails = decodeProtoMessageFields(runRequest, 3)[0];
  const parameters = decodeRequestedModelParameters(requestedModel);
  const decodedTools = uniqueTools([
    ...extractToolsFromValues(contextValues),
    ...extractCursorNativeToolsFromRunRequest(runtime, runRequest, contextValues, systemPrompt)
  ]);
  const tools = shouldForwardDecodedCursorTools(runtime) ? decodedTools : [];
  const toolChoice = tools.length > 0 ? extractToolChoiceFromValues(contextValues) : undefined;
  const model =
    decodeProtoStringField(requestedModel, 1) ||
    decodeProtoStringField(modelDetails, 1) ||
    decodeProtoStringField(runRequest, 18) ||
    runtime.defaultModel ||
    "cursor-proxy";

  return compactObject({
    max_tokens: numberFromParameter(parameters.max_tokens || parameters.maxTokens || parameters.output_tokens),
    messages: compactedMessages,
    model,
    stream: true,
    temperature: numberFromParameter(parameters.temperature),
    tool_choice: toolChoice,
    tools: tools.length > 0 ? tools : undefined,
    top_p: numberFromParameter(parameters.top_p || parameters.topP)
  });
}

function logAgentChatConversion(runtime, session, chatRequest) {
  const summary = summarizeChatRequest(chatRequest);
  const decodedToolSummary = summarizeDecodedCursorToolForwarding(runtime, session?.runRequest, chatRequest);
  const diagnostic =
    `${formatChatSummary(summary)}, ` +
    `decoded_tools=${decodedToolSummary.decodedTools}, ` +
    `native_tool_enums=${decodedToolSummary.nativeToolEnums}, ` +
    `suppressed_decoded_tools=${decodedToolSummary.suppressedTools}, ` +
    `appends=${session.appends.size}, last_seq=${session.appendSeqno || 0}`;
  const dumpPath = writeAgentRunRequestDecodeDump(runtime, session, session.runRequest, chatRequest, "initial");
  const dumpSuffix = dumpPath ? ` decode_dump=${dumpPath}` : "";
  const missingSystem = summary.system === 0;
  const missingTools = summary.tools === 0 && decodedToolSummary.suppressedTools === 0;

  if (decodedToolSummary.suppressedTools > 0 && runtime.warnedSuppressedDecodedCursorTools !== true) {
    runtime.warnedSuppressedDecodedCursorTools = true;
    runtime.logger?.warn?.(
      `Cursor proxy decoded ${decodedToolSummary.suppressedTools} Cursor tools from AgentRunRequest, ` +
      "but did not forward them to the upstream model because config.forwardDecodedCursorTools=false. " +
      "OpenAI tool_calls -> Cursor Agent tool events bridge is available when decoded tools are forwarded." +
      dumpSuffix
    );
  }

  if (summary.simplified || missingSystem || missingTools) {
    const missingContext = [
      missingSystem ? "system" : "",
      missingTools ? "tools" : ""
    ].filter(Boolean).join("/") || "context";
    runtime.logger?.warn?.(
      `Cursor proxy decoded AgentRunRequest ${session.requestId} without ${missingContext} (${diagnostic}). ` +
      "The decoded Cursor payload does not expose Agent context; post full Cursor hook context to " +
      "/plugins/cursor-proxy/collector, or configure cursor-proxy config.systemPrompt/config.tools " +
      `for static fallback context if this Cursor flow omits it.${dumpSuffix}`
    );
    logCursorDecodeDiagnostics(
      runtime,
      "warn",
      `Cursor proxy AgentRunRequest detailed decode diagnostics for ${session.requestId}: ` +
        formatAgentRunRequestDecodeDiagnostic(runtime, session.runRequest, chatRequest) +
        `; bidi_session=${formatBidiSessionDecodeDiagnostic(runtime, session)}`
    );
    return;
  }

  runtime.logger?.debug?.(`Cursor proxy decoded AgentRunRequest ${session.requestId} (${diagnostic}).${dumpSuffix}`);
  if (Buffer.isBuffer(session.runRequest)) {
    const contextValues = decodeAgentRunRequestContextValues(session.runRequest);
    const systemPrompt = chatRequest?.messages?.find((message) => message?.role === "system")?.content;
    const nativeExtraction = describeCursorNativeToolExtraction(runtime, session.runRequest, contextValues, systemPrompt);
    runtime.logger?.debug?.(
      `Cursor proxy native tool extraction for ${session.requestId}: ` +
      safeJsonStringify(nativeExtraction)
    );
  }
}

function formatAgentRunRequestSummary(runtime, runRequest) {
  const chatRequest = convertAgentRunRequestToOpenAIChat(runtime, runRequest);
  return chatRequest ? formatChatRequestSummary(chatRequest) : "chat=unavailable";
}

function formatChatRequestSummary(chatRequest) {
  return formatChatSummary(summarizeChatRequest(chatRequest));
}

function formatChatSummary(summary) {
  return [
    `messages=${summary.messages}`,
    `system=${summary.system}`,
    `user=${summary.user}`,
    `assistant=${summary.assistant}`,
    `tools=${summary.tools}`,
    `roles=${summary.roles.join(",") || "none"}`
  ].join(", ");
}

function summarizeChatRequest(chatRequest) {
  const messages = Array.isArray(chatRequest?.messages) ? chatRequest.messages : [];
  const roles = messages.map((message) => normalizeRole(stringValue(message.role)) || "unknown");
  const system = roles.filter((role) => role === "system").length;
  const user = roles.filter((role) => role === "user").length;
  const assistant = roles.filter((role) => role === "assistant").length;
  const tools = Array.isArray(chatRequest?.tools) ? chatRequest.tools.length : 0;
  return {
    assistant,
    messages: messages.length,
    roles,
    simplified: messages.length > 0 && system === 0 && tools === 0 && roles.every((role) => role === "user"),
    system,
    tools,
    user
  };
}

function shouldForwardDecodedCursorTools(runtime) {
  return runtime?.forwardDecodedCursorTools === true;
}

function summarizeDecodedCursorToolForwarding(runtime, runRequest, chatRequest) {
  const contextValues = Buffer.isBuffer(runRequest) ? decodeAgentRunRequestContextValues(runRequest) : [];
  const decodedTools = Buffer.isBuffer(runRequest)
    ? uniqueTools([
      ...extractToolsFromValues(contextValues),
      ...extractCursorNativeToolsFromRunRequest(runtime, runRequest, contextValues)
    ])
    : [];
  const forwardedTools = Array.isArray(chatRequest?.tools) ? chatRequest.tools.length : 0;
  const forwardDecodedCursorTools = shouldForwardDecodedCursorTools(runtime);
  return {
    decodedTools: decodedTools.length,
    forwardDecodedCursorTools,
    forwardedTools,
    nativeToolEnums: Buffer.isBuffer(runRequest) ? extractCursorSupportedToolEnums(runRequest).length : 0,
    suppressedTools: forwardDecodedCursorTools ? 0 : decodedTools.length
  };
}

function shouldLogDecodeDiagnostics(runtime) {
  return runtime?.decodeDiagnostics !== false;
}

function logCursorDecodeDiagnostics(runtime, level, message) {
  if (!shouldLogDecodeDiagnostics(runtime)) {
    return;
  }
  const logger = runtime?.logger;
  if (level === "warn") {
    logger?.warn?.(message);
    return;
  }
  logger?.debug?.(message);
}

function formatAgentRunRequestDecodeDiagnostic(runtime, runRequest, chatRequest) {
  if (!Buffer.isBuffer(runRequest)) {
    return safeJsonStringify({ error: "missing-run-request" });
  }

  const embeddedPayloads = decodeJsonPayloadsFromProtoStrings(runRequest);
  const contextValues = decodeAgentRunRequestContextValues(runRequest);
  const fallbackSystemPrompt = decodeProtoStringField(runRequest, 5);
  const systemPrompt = composeAgentSystemPrompt(
    contextValues,
    selectPreferredSystemPrompt(
      decodeProtoStringField(runRequest, 8),
      extractSystemPromptFromValues(contextValues),
      findBestSystemPromptStringFromValues(contextValues),
      looksLikeSystemPromptText(fallbackSystemPrompt) ? fallbackSystemPrompt : undefined
    )
  );
  const tools = extractToolsFromValues(contextValues);
  const toolChoice = extractToolChoiceFromValues(contextValues);
  const toolFilePaths = extractCursorToolFilePaths(contextValues);
  const instructionFilePaths = extractCursorInstructionFilePaths(contextValues);
  const instructionTexts = extractCursorInstructionTexts(contextValues);
  const nativeSupportedTools = extractCursorSupportedToolEnums(runRequest);
  const nativeTools = extractCursorNativeToolsFromRunRequest(runtime, runRequest, contextValues, systemPrompt);
  const decodedTools = uniqueTools([...tools, ...nativeTools]);
  const toolForwarding = summarizeDecodedCursorToolForwarding(runtime, runRequest, chatRequest);
  const nativeExtraction = describeCursorNativeToolExtraction(runtime, runRequest, contextValues, systemPrompt);

  return safeJsonStringify(compactObject({
    bytes: runRequest.length,
    chat: chatRequest ? summarizeChatRequest(chatRequest) : undefined,
    contextValues: summarizeDecodedValuesForDiagnostics(runtime, contextValues),
    directStrings: compactObject({
      field5: summarizeLogString(runtime, fallbackSystemPrompt),
      field8: summarizeLogString(runtime, decodeProtoStringField(runRequest, 8)),
      field18: summarizeLogString(runtime, decodeProtoStringField(runRequest, 18))
    }),
    embeddedJson: summarizeJsonPayloadsForDiagnostics(runtime, embeddedPayloads),
    extracted: compactObject({
      instructionFiles: instructionFilePaths.length,
      instructionFileSamples: instructionFilePaths.slice(0, decodeDiagnosticSampleLimit(runtime)),
      instructionTexts: instructionTexts.length,
      nativeExtraction,
      nativeSupportedToolEnums: summarizeCursorSupportedToolEnums(runtime, nativeSupportedTools),
      nativeToolNames: summarizeToolNamesForDiagnostics(runtime, nativeTools),
      nativeTools: nativeTools.length,
      systemPrompt: summarizeLogString(runtime, systemPrompt),
      toolFiles: toolFilePaths.length,
      toolFileSamples: toolFilePaths.slice(0, decodeDiagnosticSampleLimit(runtime)),
      toolChoice,
      toolForwarding,
      toolNames: summarizeToolNamesForDiagnostics(runtime, decodedTools),
      tools: decodedTools.length
    }),
    fields: formatProtoFieldSummary(runRequest),
    shapeReasons: agentRunRequestShapeReasons(runRequest),
    strings: summarizeProtoStringsForDiagnostics(runtime, decodeAllProtoStrings(runRequest)),
    topLevel: summarizeAgentRunRequestTopLevel(runRequest)
  }));
}

function formatBidiSessionDecodeDiagnostic(runtime, session) {
  if (!session) {
    return safeJsonStringify({ error: "missing-session" });
  }
  const appends = sortedBidiAppends(session);
  return safeJsonStringify({
    appendDetails: formatBidiAppendDetails(appends),
    appends: appends.length,
    candidates: summarizeCandidateBuffersForDiagnostics(runtime, bidiSessionCandidateBuffers(session)),
    combinedDataBinaryBytes: combinedAppendDataBinaryLength(session),
    combinedDataBytes: combinedAppendDataBytesLength(session),
    combinedDataTextBytes: combinedAppendDataLength(session),
    decodedHints: summarizeBidiDecodedHints(session),
    lastRunRequestAt: session.lastRunRequestAt || 0,
    requestId: session.requestId
  });
}

function formatCursorNativeProtoDecodeDiagnostic(runtime, path, requestBody, chatRequest) {
  const candidates = cursorNativeCandidateBuffers(requestBody);
  const runRequest = extractAgentRunRequestFromCandidates(candidates);
  return safeJsonStringify(compactObject({
    candidates: summarizeCandidateBuffersForDiagnostics(runtime, candidates),
    chat: summarizeChatRequest(chatRequest),
    path,
    requestBytes: Buffer.isBuffer(requestBody) ? requestBody.length : 0,
    runRequest: runRequest ? JSON.parse(formatAgentRunRequestDecodeDiagnostic(runtime, runRequest, chatRequest)) : undefined
  }));
}

function writeAgentRunRequestDecodeDump(runtime, session, runRequest, chatRequest, label = "") {
  if (!shouldLogDecodeDiagnostics(runtime) || runtime?.decodeDumpFull === false || !Buffer.isBuffer(runRequest)) {
    return "";
  }
  const dumpDir = stringValue(runtime.decodeDumpDir) || DEFAULT_DECODE_DUMP_DIR;
  try {
    fs.mkdirSync(dumpDir, { recursive: true });
    const labelSuffix = label ? `-${sanitizeRouteId(label)}` : "";
    const fileName = `${sanitizeRouteId(session?.requestId || "agent-run")}${labelSuffix}-${Date.now()}.json`;
    const filePath = path.join(dumpDir, fileName);
    fs.writeFileSync(
      filePath,
      `${JSON.stringify(buildAgentRunRequestDecodeDump(runtime, session, runRequest, chatRequest, label), null, 2)}\n`,
      "utf8"
    );
    return filePath;
  } catch (error) {
    runtime?.logger?.warn?.(`Cursor proxy failed to write full decode dump: ${formatError(error)}`);
    return "";
  }
}

function buildAgentRunRequestDecodeDump(runtime, session, runRequest, chatRequest, label = "") {
  const contextValues = decodeAgentRunRequestContextValues(runRequest);
  const embeddedPayloads = decodeJsonPayloadsFromProtoStrings(runRequest);
  const toolFilePaths = extractCursorToolFilePaths(contextValues);
  const instructionFilePaths = extractCursorInstructionFilePaths(contextValues);
  const tools = extractToolsFromValues(contextValues);
  const nativeSupportedTools = extractCursorSupportedToolEnums(runRequest);
  const nativeTools = extractCursorNativeToolsFromRunRequest(
    runtime,
    runRequest,
    contextValues,
    chatRequest?.messages?.find((message) => message?.role === "system")?.content
  );
  const appends = session ? sortedBidiAppends(session) : [];
  const toolForwarding = summarizeDecodedCursorToolForwarding(runtime, runRequest, chatRequest);

  return {
    appends: appends.map((append) => ({
      appendSeqno: append.appendSeqno,
      dataBase64: append.dataBytes.length > 0 ? append.dataBytes.toString("base64") : undefined,
      dataBinaryBase64: append.dataBinary.length > 0 ? append.dataBinary.toString("base64") : undefined,
      dataBytes: append.dataBytes.length,
      dataText: append.data || undefined,
      requestId: append.requestId,
      rpcBodyBase64: append.rpcBody.length > 0 ? append.rpcBody.toString("base64") : undefined,
      rpcBodyBytes: append.rpcBody.length,
      rpcBodyEncoding: append.rpcBodyEncoding
    })),
    chatRequest,
    contextValues: contextValues.map((value) => serializeDiagnosticValue(value)),
    embeddedJsonPayloads: embeddedPayloads.map((value) => serializeDiagnosticValue(value)),
    extracted: {
      instructionFileContents: instructionFilePaths.map((filePath) => ({
        content: readTextFileIfSmall(filePath, 256 * 1024),
        path: filePath
      })),
      instructionFilePaths,
      nativeSupportedTools,
      nativeExtraction: describeCursorNativeToolExtraction(
        runtime,
        runRequest,
        contextValues,
        chatRequest?.messages?.find((message) => message?.role === "system")?.content
      ),
      nativeToolNames: nativeTools.map((tool) => stringValue(tool?.function?.name) || stringValue(tool?.name) || "unknown"),
      nativeTools,
      systemPrompt: chatRequest?.messages?.find((message) => message?.role === "system")?.content,
      toolFileContents: toolFilePaths.map((filePath) => ({
        json: readJsonText(readTextFileIfSmall(filePath, 256 * 1024)),
        path: filePath
      })),
      toolFilePaths,
      toolForwarding,
      toolNames: uniqueTools([...tools, ...nativeTools])
        .map((tool) => stringValue(tool?.function?.name) || stringValue(tool?.name) || stringValue(tool?.type) || "unknown"),
      tools: uniqueTools([...tools, ...nativeTools])
    },
    label,
    proto: decodeProtoTree(runRequest, {
      maxDepth: Math.max(1, Math.trunc(Number(runtime?.decodeTreeDepth) || DEFAULT_DECODE_TREE_DEPTH)),
      path: ""
    }),
    raw: {
      base64: runRequest.toString("base64"),
      bytes: runRequest.length,
      fieldSummary: formatProtoFieldSummary(runRequest),
      hex: runRequest.toString("hex")
    },
    requestId: session?.requestId || "",
    strings: decodeAllProtoStringsWithPaths(runRequest),
    summary: {
      chat: chatRequest ? summarizeChatRequest(chatRequest) : undefined,
      contextValues: summarizeDecodedValuesForDiagnostics(runtime, contextValues),
      embeddedJson: summarizeJsonPayloadsForDiagnostics(runtime, embeddedPayloads),
      fields: formatProtoFieldSummary(runRequest),
      shapeReasons: agentRunRequestShapeReasons(runRequest)
    },
    timestamp: new Date().toISOString()
  };
}

function decodeProtoTree(buffer, options = {}, depth = 0, seen = new Set()) {
  if (!Buffer.isBuffer(buffer)) {
    return { error: "not-buffer" };
  }
  const maxDepth = Math.max(0, Math.trunc(Number(options.maxDepth) || DEFAULT_DECODE_TREE_DEPTH));
  const currentPath = stringValue(options.path) || "";
  const key = `${buffer.length}:${buffer.subarray(0, 32).toString("hex")}`;
  if (seen.has(key)) {
    return { bytes: buffer.length, circular: true, path: currentPath };
  }
  seen.add(key);

  const fields = [];
  forEachProtoField(buffer, (field) => {
    const fieldPath = currentPath ? `${currentPath}.${field.fieldNumber}` : String(field.fieldNumber);
    fields.push(decodeProtoFieldForDump(field, fieldPath, maxDepth, depth, seen));
  });
  seen.delete(key);

  return {
    bytes: buffer.length,
    fields,
    path: currentPath
  };
}

function decodeProtoFieldForDump(field, fieldPath, maxDepth, depth, seen) {
  const base = {
    fieldNumber: field.fieldNumber,
    path: fieldPath,
    wireType: field.wireType,
    wireTypeName: protoWireTypeName(field.wireType)
  };
  if (field.wireType === 0) {
    return { ...base, value: field.value.toString() };
  }
  if (field.wireType === 1 || field.wireType === 5) {
    return {
      ...base,
      base64: field.value.toString("base64"),
      bytes: field.value.length,
      hex: field.value.toString("hex")
    };
  }
  if (field.wireType !== 2) {
    return base;
  }

  const text = field.value.length > 0 && looksLikeTextBuffer(field.value) ? field.value.toString("utf8") : undefined;
  const parsedJson = text !== undefined ? readJsonText(text) : undefined;
  const canNest = depth < maxDepth && field.value.length > 0 && hasReadableProtoFields(field.value);
  return compactObject({
    ...base,
    base64: field.value.toString("base64"),
    bytes: field.value.length,
    children: canNest ? decodeProtoTree(field.value, { maxDepth, path: fieldPath }, depth + 1, seen).fields : undefined,
    json: parsedJson !== undefined ? serializeDiagnosticValue(parsedJson) : undefined,
    text
  });
}

function decodeAllProtoStringsWithPaths(buffer, pathPrefix = "", depth = 0) {
  if (!Buffer.isBuffer(buffer) || depth > 12) {
    return [];
  }
  const values = [];
  forEachProtoField(buffer, (field) => {
    const fieldPath = pathPrefix ? `${pathPrefix}.${field.fieldNumber}` : String(field.fieldNumber);
    if (field.wireType !== 2 || field.value.length === 0) {
      return;
    }
    if (looksLikeTextBuffer(field.value)) {
      const text = field.value.toString("utf8");
      values.push({
        fieldNumber: field.fieldNumber,
        length: text.length,
        path: fieldPath,
        value: text
      });
    }
    values.push(...decodeAllProtoStringsWithPaths(field.value, fieldPath, depth + 1));
  });
  return values;
}

function protoWireTypeName(wireType) {
  if (wireType === 0) {
    return "varint";
  }
  if (wireType === 1) {
    return "fixed64";
  }
  if (wireType === 2) {
    return "length-delimited";
  }
  if (wireType === 5) {
    return "fixed32";
  }
  return "unknown";
}

function serializeDiagnosticValue(value, seen = new Set()) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Buffer.isBuffer(value)) {
    return {
      base64: value.toString("base64"),
      bytes: value.length,
      hex: value.toString("hex")
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeDiagnosticValue(item, seen));
  }
  if (isRecord(value)) {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
    const result = {};
    for (const [key, rawValue] of Object.entries(value)) {
      result[key] = serializeDiagnosticValue(rawValue, seen);
    }
    seen.delete(value);
    return result;
  }
  return value;
}

function formatCandidateBufferSummary(runtime, candidates) {
  return safeJsonStringify(summarizeCandidateBuffersForDiagnostics(runtime, candidates));
}

function summarizeCandidateBuffersForDiagnostics(runtime, candidates) {
  const unique = uniqueBuffers(Array.isArray(candidates) ? candidates : []);
  return {
    samples: unique
      .slice(0, decodeDiagnosticSampleLimit(runtime))
      .map((buffer, index) => summarizeBufferForDiagnostics(runtime, buffer, index)),
    total: Array.isArray(candidates) ? candidates.length : 0,
    unique: unique.length
  };
}

function summarizeBufferForDiagnostics(runtime, buffer, index) {
  const strings = decodeAllProtoStrings(buffer);
  return compactObject({
    bytes: Buffer.isBuffer(buffer) ? buffer.length : 0,
    fields: formatProtoFieldSummary(buffer),
    headHex: Buffer.isBuffer(buffer) ? buffer.subarray(0, 32).toString("hex") : undefined,
    index,
    shapeReasons: agentRunRequestShapeReasons(buffer),
    strings: summarizeProtoStringsForDiagnostics(runtime, strings),
    textSample: Buffer.isBuffer(buffer) && looksLikeTextBuffer(buffer)
      ? truncateForLog(runtime, buffer.toString("utf8"))
      : undefined
  });
}

function summarizeAgentRunRequestTopLevel(runRequest) {
  const conversationState = decodeProtoMessageFields(runRequest, 1)[0];
  const action = decodeProtoMessageFields(runRequest, 2)[0];
  const modelDetails = decodeProtoMessageFields(runRequest, 3)[0];
  const requestedModel = decodeProtoMessageFields(runRequest, 9)[0];
  return compactObject({
    action: summarizeProtoBufferForDiagnostics(action),
    conversationActionMessages: action ? decodeConversationActionMessages(action).length : 0,
    conversationState: summarizeProtoBufferForDiagnostics(conversationState),
    conversationStateMessages: conversationState ? decodeConversationStateMessages(conversationState).length : 0,
    modelDetails: summarizeProtoBufferForDiagnostics(modelDetails),
    requestedModel: summarizeProtoBufferForDiagnostics(requestedModel)
  });
}

function summarizeProtoBufferForDiagnostics(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return undefined;
  }
  return {
    bytes: buffer.length,
    fields: formatProtoFieldSummary(buffer),
    strings: decodeAllProtoStrings(buffer).length
  };
}

function agentRunRequestShapeReasons(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return [];
  }
  const reasons = [];
  const conversationState = decodeProtoMessageFields(buffer, 1)[0];
  const conversationAction = decodeProtoMessageFields(buffer, 2)[0];
  const modelDetails = decodeProtoMessageFields(buffer, 3)[0];
  const requestedModel = decodeProtoMessageFields(buffer, 9)[0];
  const field5 = decodeProtoStringField(buffer, 5);
  const field8 = decodeProtoStringField(buffer, 8);
  const field18 = decodeProtoStringField(buffer, 18);
  if (looksLikeConversationState(conversationState)) {
    reasons.push("field1:conversation_state");
  }
  if (looksLikeConversationAction(conversationAction)) {
    reasons.push("field2:conversation_action");
  }
  if (looksLikeModelDetails(modelDetails)) {
    reasons.push("field3:model_details");
  }
  if (looksLikeRequestedModel(requestedModel)) {
    reasons.push("field9:requested_model");
  }
  if (field5) {
    reasons.push(`field5:string:${field5.length}`);
  }
  if (field8) {
    reasons.push(`field8:string:${field8.length}`);
  }
  if (field18) {
    reasons.push(`field18:string:${field18.length}`);
  }
  return reasons;
}

function summarizeProtoStringsForDiagnostics(runtime, strings) {
  const values = Array.isArray(strings)
    ? strings.filter((item) => item && typeof item.value === "string" && item.value.length > 0)
    : [];
  const unique = [];
  const seen = new Set();
  const toolKeyPattern = new RegExp(`\\b(?:${CURSOR_TOOL_KEYS.map(escapeRegExp).join("|")})\\b`, "i");
  for (const item of values) {
    const key = `${item.fieldNumber}:${item.value}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }
  return {
    count: values.length,
    jsonLike: values.filter((item) => readJsonText(item.value) !== undefined).length,
    jsonLikeSamples: sampleProtoStringItemsForDiagnostics(
      runtime,
      unique.filter((item) => readJsonText(item.value) !== undefined)
    ),
    maxLength: values.reduce((max, item) => Math.max(max, item.value.length), 0),
    samples: unique
      .filter((item) => !looksLikeNoiseString(item.value))
      .slice(0, decodeDiagnosticSampleLimit(runtime))
      .map((item) => ({
        field: item.fieldNumber,
        length: item.value.length,
        sample: truncateForLog(runtime, item.value)
      })),
    systemLike: values.filter((item) => looksLikeSystemPromptText(item.value)).length,
    systemLikeSamples: sampleProtoStringItemsForDiagnostics(
      runtime,
      unique.filter((item) => looksLikeSystemPromptText(item.value))
    ),
    toolKeyLike: values.filter((item) => toolKeyPattern.test(item.value)).length,
    toolKeyLikeSamples: sampleProtoStringItemsForDiagnostics(
      runtime,
      unique.filter((item) => toolKeyPattern.test(item.value))
    ),
    unique: unique.length
  };
}

function sampleProtoStringItemsForDiagnostics(runtime, items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item.value === "string" && !looksLikeNoiseString(item.value))
    .slice(0, decodeDiagnosticSampleLimit(runtime))
    .map((item) => ({
      field: item.fieldNumber,
      length: item.value.length,
      sample: truncateForLog(runtime, item.value)
    }));
}

function summarizeDecodedValuesForDiagnostics(runtime, values) {
  const list = Array.isArray(values) ? values : [];
  const strings = list.filter((value) => typeof value === "string");
  const records = list.filter(isRecord);
  const arrays = list.filter(Array.isArray);
  const toolKeyPattern = new RegExp(`\\b(?:${CURSOR_TOOL_KEYS.map(escapeRegExp).join("|")})\\b`, "i");
  return {
    arrays: arrays.length,
    records: records.length,
    samples: list
      .filter((value) => typeof value === "string" && !looksLikeNoiseString(value))
      .slice(0, decodeDiagnosticSampleLimit(runtime))
      .map((value) => ({
        length: value.length,
        sample: truncateForLog(runtime, value)
      })),
    strings: strings.length,
    systemLike: strings.filter(looksLikeSystemPromptText).length,
    systemLikeSamples: strings
      .filter(looksLikeSystemPromptText)
      .slice(0, decodeDiagnosticSampleLimit(runtime))
      .map((value) => ({
        length: value.length,
        sample: truncateForLog(runtime, value)
      })),
    toolKeyLike: strings.filter((value) => toolKeyPattern.test(value)).length,
    toolKeyLikeSamples: strings
      .filter((value) => toolKeyPattern.test(value))
      .slice(0, decodeDiagnosticSampleLimit(runtime))
      .map((value) => ({
        length: value.length,
        sample: truncateForLog(runtime, value)
      })),
    total: list.length
  };
}

function summarizeJsonPayloadsForDiagnostics(runtime, payloads) {
  const values = Array.isArray(payloads) ? payloads : [];
  return {
    count: values.length,
    samples: values
      .slice(0, decodeDiagnosticSampleLimit(runtime))
      .map((value) => summarizeJsonPayloadForDiagnostics(runtime, value))
  };
}

function summarizeJsonPayloadForDiagnostics(runtime, value) {
  const tools = extractTools(value);
  const messages = extractMessages(value);
  return compactObject({
    keys: isRecord(value) ? Object.keys(value).slice(0, 24) : undefined,
    messageRoles: messages.map((message) => normalizeRole(stringValue(message.role)) || "unknown").slice(0, 16),
    messages: messages.length,
    systemPrompt: summarizeLogString(runtime, extractSystemPrompt(value)),
    toolChoice: extractToolChoice(value),
    toolNames: summarizeToolNamesForDiagnostics(runtime, tools),
    tools: tools.length,
    type: Array.isArray(value) ? "array" : typeof value
  });
}

function summarizeToolNamesForDiagnostics(runtime, tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return [];
  }
  return tools
    .slice(0, decodeDiagnosticSampleLimit(runtime))
    .map((tool) => stringValue(tool?.function?.name) || stringValue(tool?.name) || stringValue(tool?.type) || "unknown");
}

function summarizeLogString(runtime, value) {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  return {
    length: value.length,
    sample: truncateForLog(runtime, value)
  };
}

function truncateForLog(runtime, value) {
  const text = String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "?");
  const maxLength = Math.max(16, Math.trunc(Number(runtime?.decodeDiagnosticSampleChars) || DEFAULT_DECODE_DIAGNOSTIC_SAMPLE_CHARS));
  return text.length > maxLength ? `${text.slice(0, maxLength)}...<${text.length}>` : text;
}

function decodeDiagnosticSampleLimit(runtime) {
  return Math.max(1, Math.trunc(Number(runtime?.decodeDiagnosticSampleLimit) || DEFAULT_DECODE_DIAGNOSTIC_SAMPLE_LIMIT));
}

function isSimplifiedAgentChatRequest(chatRequest) {
  return summarizeChatRequest(chatRequest).simplified;
}

function decodeConversationStateMessages(conversationState) {
  const messages = [];
  for (const rawJson of decodeProtoStringFields(conversationState, 1)) {
    const parsed = readJsonText(rawJson);
    const normalized = normalizeMessages(parsed);
    if (normalized.length > 0) {
      messages.push(...normalized);
    } else if (parsed !== undefined && typeof parsed !== "string") {
      const embeddedMessages = extractMessages(parsed);
      const systemPrompt = extractSystemPrompt(parsed);
      if (systemPrompt) {
        messages.push({ content: systemPrompt, role: "system" });
      }
      if (embeddedMessages.length > 0) {
        messages.push(...embeddedMessages);
      }
    } else if (typeof parsed === "string" && parsed.trim()) {
      messages.push({ content: parsed.trim(), role: "system" });
    } else if (rawJson.trim()) {
      messages.push({ content: rawJson.trim(), role: "system" });
    }
  }

  for (const turn of decodeProtoMessageFields(conversationState, 8)) {
    messages.push(...decodeConversationTurnMessages(turn));
  }
  return messages;
}

function decodeConversationTurnMessages(turn) {
  const messages = [];
  const agentTurn = decodeProtoMessageFields(turn, 1)[0];
  if (!agentTurn) {
    return messages;
  }

  const userMessage = decodeUserMessage(decodeProtoMessageFields(agentTurn, 1)[0]);
  if (userMessage) {
    messages.push({ content: userMessage, role: "user" });
  }

  const assistantChunks = [];
  for (const step of decodeProtoMessageFields(agentTurn, 2)) {
    const assistantMessage = decodeProtoMessageFields(step, 1)[0];
    const text = decodeProtoStringField(assistantMessage, 1);
    if (text) {
      assistantChunks.push(text);
    }
  }
  if (assistantChunks.length > 0) {
    messages.push({ content: assistantChunks.join("\n"), role: "assistant" });
  }
  return messages;
}

function decodeConversationActionMessages(action) {
  const messages = [];
  const userMessageAction = decodeProtoMessageFields(action, 1)[0];
  if (userMessageAction) {
    for (const prepend of decodeProtoMessageFields(userMessageAction, 4)) {
      const text = decodeUserMessage(prepend);
      if (text) {
        messages.push({ content: text, role: "user" });
      }
    }
    const text = decodeUserMessage(decodeProtoMessageFields(userMessageAction, 1)[0]);
    if (text) {
      messages.push({ content: text, role: "user" });
    }
  }

  const startPlanAction = decodeProtoMessageFields(action, 6)[0];
  const startPlanUserMessage = decodeUserMessage(decodeProtoMessageFields(startPlanAction, 1)[0]);
  if (startPlanUserMessage) {
    messages.push({ content: startPlanUserMessage, role: "user" });
  }

  return messages;
}

function decodeUserMessage(message) {
  return decodeProtoStringField(message, 1) || decodeProtoStringField(message, 8) || "";
}

function decodeRequestedModelParameters(requestedModel) {
  const result = {};
  for (const parameter of decodeProtoMessageFields(requestedModel, 3)) {
    const id = decodeProtoStringField(parameter, 1);
    const value = decodeProtoStringField(parameter, 2);
    if (id && value) {
      result[id] = value;
    }
  }
  return result;
}

function compactChatMessages(messages) {
  const result = [];
  for (const message of messages) {
    if (!message?.role) {
      continue;
    }
    const content = normalizeChatMessageContent(message.content);
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls.filter(Boolean) : undefined;
    const functionCall = isRecord(message.function_call) ? message.function_call : undefined;
    if (!hasChatMessageContent(content) && (!toolCalls || toolCalls.length === 0) && !functionCall) {
      continue;
    }
    const compacted = compactObject({
      ...message,
      content: hasChatMessageContent(content) ? content : message.role === "assistant" ? "" : undefined,
      function_call: functionCall,
      tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined
    });
    const last = result[result.length - 1];
    if (isDuplicateSystemMessage(last, compacted)) {
      continue;
    }
    if (canMergeChatMessages(last, compacted)) {
      last.content = `${last.content}\n\n${compacted.content.trim()}`;
    } else {
      result.push(compacted);
    }
  }
  return result;
}

function isDuplicateSystemMessage(left, right) {
  return left?.role === "system" &&
    right?.role === "system" &&
    typeof left.content === "string" &&
    typeof right.content === "string" &&
    left.content.trim() === right.content.trim() &&
    !hasChatToolFields(left) &&
    !hasChatToolFields(right);
}

function canMergeChatMessages(left, right) {
  return left?.role === right?.role &&
    typeof left.content === "string" &&
    typeof right.content === "string" &&
    !hasChatToolFields(left) &&
    !hasChatToolFields(right);
}

function hasChatToolFields(message) {
  return Boolean(
    message?.function_call ||
    message?.name ||
    message?.tool_call_id ||
    (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0)
  );
}

function hasChatMessageContent(content) {
  if (typeof content === "string") {
    return content.trim().length > 0;
  }
  if (Array.isArray(content)) {
    return content.length > 0;
  }
  return content !== undefined && content !== null;
}

function normalizeChatMessageContent(content) {
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content.filter((item) => item !== undefined && item !== null);
  }
  return content;
}

function numberFromParameter(value) {
  if (value === undefined) {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function looksLikeNoiseString(value) {
  return /^[0-9a-f-]{16,}$/i.test(value) ||
    /^cursor[-_a-z0-9.]*$/i.test(value) ||
    value.startsWith("data:") ||
    value.startsWith("file:") ||
    value.startsWith("vscode:");
}

function looksLikeSystemPromptText(value) {
  if (!value || value.length < 20 || looksLikeNoiseString(value)) {
    return false;
  }
  return /\b(system|developer|instruction|assistant|rules?|tools?|you are|you should|must)\b/i.test(value) ||
    /你是|系统|规则|工具|助手|必须|请遵守/.test(value);
}

function routeJsonRequestBody(runtime, requestBody) {
  const payload = readJsonLikePayload(requestBody);
  if (!isRecord(payload)) {
    return { body: requestBody, routed: false };
  }

  const routedPayload = { ...payload };
  const decision = applyCursorProxyRouting(runtime, routedPayload);
  if (!decision.routed) {
    return { body: requestBody, routed: false };
  }

  return {
    body: Buffer.from(`${JSON.stringify(routedPayload)}\n`, "utf8"),
    routed: true
  };
}

function prepareOpenAIChatRequestBody(runtime, requestBody) {
  const payload = readJsonLikePayload(requestBody);
  if (!isRecord(payload)) {
    return { body: requestBody, routed: false };
  }

  const preparedPayload = { ...payload };
  const contextChanged = applyOpenAICompatChatContext(runtime, preparedPayload);
  const usageChanged = ensureOpenAIStreamUsage(preparedPayload);
  const changed = contextChanged || usageChanged;
  const decision = applyCursorProxyRouting(runtime, preparedPayload);
  if (!changed && !decision.routed) {
    return { body: requestBody, routed: false };
  }

  return {
    body: Buffer.from(`${JSON.stringify(preparedPayload)}\n`, "utf8"),
    routed: decision.routed
  };
}

function ensureOpenAIStreamUsage(body) {
  if (body.stream !== true) {
    return false;
  }

  const streamOptions = isRecord(body.stream_options) ? { ...body.stream_options } : {};
  if (streamOptions.include_usage === true) {
    return false;
  }
  body.stream_options = { ...streamOptions, include_usage: true };
  return true;
}

function applyOpenAICompatChatContext(runtime, body) {
  if (!Array.isArray(body.messages)) {
    return false;
  }

  let changed = applyCollectedOpenAICompatChatContext(runtime, body);
  const messages = body.messages.filter((message) => isRecord(message));
  const missingSystem = !hasSystemInstruction(body, messages);
  const missingTools = !Array.isArray(body.tools) || body.tools.length === 0;
  const missingToolChoice = body.tool_choice === undefined && body.toolChoice === undefined;
  const simplified = isSimplifiedOpenAICompatChat(body, messages);

  if (missingSystem && runtime.chatCompletionSystemPrompt) {
    body.messages = [
      { content: runtime.chatCompletionSystemPrompt, role: "system" },
      ...body.messages
    ];
    changed = true;
  }

  if (missingTools && runtime.chatCompletionTools.length > 0) {
    body.tools = runtime.chatCompletionTools;
    changed = true;
  }

  if (missingToolChoice && body.tools && runtime.chatCompletionToolChoice !== undefined) {
    body.tool_choice = runtime.chatCompletionToolChoice;
    changed = true;
  }

  if (simplified && !changed && runtime.warnedMissingChatContext !== true) {
    runtime.warnedMissingChatContext = true;
    runtime.logger?.warn?.(
      "Cursor proxy received an OpenAI-compatible chat request with only user messages and no system/tools. " +
      "The incoming request does not contain Cursor Agent context; configure cursor-proxy config.systemPrompt/config.tools " +
      "or use Cursor's native Agent traffic so the proxy can forward tools and system prompts."
    );
  }

  return changed;
}

function applyCollectedOpenAICompatChatContext(runtime, body) {
  const collected = findCollectedCursorContext(runtime, undefined, undefined, body);
  if (!collected) {
    return false;
  }

  const merged = mergeCollectedCursorChatRequest(body, collected.chatRequest);
  for (const key of Object.keys(body)) {
    delete body[key];
  }
  Object.assign(body, merged);
  runtime.logger?.debug?.(
    `Cursor proxy applied collected Cursor context to OpenAI-compatible request ` +
    `(${formatChatRequestSummary(body)}).`
  );
  return true;
}

function hasSystemInstruction(body, messages) {
  return Boolean(
    body.system !== undefined ||
    body.systemPrompt !== undefined ||
    body.instructions !== undefined ||
    messages.some((message) => normalizeRole(stringValue(message.role)) === "system")
  );
}

function isSimplifiedOpenAICompatChat(body, messages) {
  return messages.length > 0 &&
    messages.every((message) => normalizeRole(stringValue(message.role)) === "user") &&
    !hasSystemInstruction(body, messages) &&
    (!Array.isArray(body.tools) || body.tools.length === 0);
}

function applyCursorProxyRouting(runtime, body) {
  if (!isRecord(body)) {
    return { requestedModel: "", routed: false };
  }

  const requestedModel = stringValue(body.model) || runtime.defaultModel || "cursor-proxy";
  const routing = runtime.routing;
  if (routing && routing.enabled !== false) {
    const route = resolveCursorProxyRoute(routing, body, requestedModel);
    if (route?.target) {
      body.model = route.target;
      runtime.logger?.debug?.(
        `Cursor proxy routed model ${requestedModel || "<empty>"} to ${route.target} (${route.reason}).`
      );
      return {
        requestedModel,
        reason: route.reason,
        routed: true,
        routedModel: route.target
      };
    }
  }

  const legacyTarget = normalizeRouteTarget(
    composeRouteTarget(runtime.targetProvider, runtime.targetModel) ||
    stringValue(runtime.targetModel)
  );
  if (legacyTarget) {
    body.model = legacyTarget;
    return {
      requestedModel,
      reason: "legacy-target",
      routed: true,
      routedModel: legacyTarget
    };
  }

  if (isCursorDefaultModel(requestedModel) && runtime.defaultModel && runtime.defaultModel !== requestedModel) {
    body.model = runtime.defaultModel;
    return {
      requestedModel,
      reason: "configured-default-model",
      routed: true,
      routedModel: runtime.defaultModel
    };
  }

  return { requestedModel, routed: false };
}

function resolveCursorProxyRoute(routing, body, requestedModel) {
  for (const rule of routing.rules || []) {
    if (rule.enabled === false || !rule.target) {
      continue;
    }
    if (matchesCursorProxyRouteRule(rule, body, requestedModel)) {
      return {
        reason: rule.id ? `plugin-rule:${rule.id}` : `plugin-rule:${rule.type}`,
        target: rule.target
      };
    }
  }

  if (routing.defaultTarget) {
    return {
      reason: "plugin-default",
      target: routing.defaultTarget
    };
  }

  return undefined;
}

function matchesCursorProxyRouteRule(rule, body, requestedModel) {
  switch (rule.type) {
    case "always":
      return true;
    case "image":
      return hasImageContent(body?.messages) || hasImageContent(body?.input);
    case "long-context":
      return estimateTokenCount(body) > (rule.threshold || 200000);
    case "model":
      return Boolean(rule.model && requestedModel === rule.model);
    case "model-prefix":
      return Boolean(rule.pattern && requestedModel?.startsWith(rule.pattern));
    case "thinking":
      return Boolean(body?.thinking || body?.reasoning || body?.reasoning_effort);
    case "web-search":
      return hasWebSearchTool(body?.tools);
    default:
      return false;
  }
}

function normalizeCursorProxyRouting(value, options = {}) {
  const fallbackTarget = normalizeRouteTarget(
    composeRouteTarget(options.targetProvider, options.targetModel) ||
    stringValue(options.targetModel)
  );
  const record = isRecord(value) ? value : {};
  const rules = [];

  if (isRecord(record.modelMap)) {
    for (const [model, target] of Object.entries(record.modelMap)) {
      const normalizedTarget = normalizeRouteTarget(stringValue(target));
      const normalizedModel = stringValue(model);
      if (!normalizedModel || !normalizedTarget) {
        continue;
      }
      rules.push({
        enabled: true,
        id: `model-${sanitizeRouteId(normalizedModel)}`,
        model: normalizedModel,
        name: normalizedModel,
        target: normalizedTarget,
        type: "model"
      });
    }
  }

  if (Array.isArray(record.rules)) {
    record.rules.forEach((rule, index) => {
      const normalized = normalizeCursorProxyRoutingRule(rule, index);
      if (normalized) {
        rules.push(normalized);
      }
    });
  }

  return {
    defaultTarget: normalizeRouteTarget(stringValue(record.default) || stringValue(record.defaultTarget)) || fallbackTarget,
    enabled: value === false ? false : record.enabled !== false,
    rules
  };
}

function normalizeCursorProxyRoutingRule(value, index) {
  if (!isRecord(value)) {
    return undefined;
  }

  const type = stringValue(value.type) || "model";
  if (!CURSOR_PROXY_ROUTE_TYPES.has(type)) {
    return undefined;
  }

  const target = normalizeRouteTarget(
    stringValue(value.target) ||
    composeRouteTarget(value.targetProvider, value.targetModel) ||
    stringValue(value.targetModel)
  );
  if (!target) {
    return undefined;
  }

  const model = stringValue(value.model) || stringValue(value.sourceModel);
  const pattern = stringValue(value.pattern) || (type === "model-prefix" ? model : undefined);
  const threshold = positiveNumber(value.threshold) || positiveNumber(value.tokenThreshold);
  const id = stringValue(value.id) || `${type}-${index + 1}`;
  return {
    enabled: value.enabled !== false,
    id,
    name: stringValue(value.name) || id,
    ...(model ? { model } : {}),
    ...(pattern ? { pattern } : {}),
    target,
    ...(threshold ? { threshold } : {}),
    type
  };
}

function normalizeRouteTarget(value) {
  const raw = stringValue(value);
  if (!raw) {
    return undefined;
  }

  const commaIndex = raw.indexOf(",");
  if (commaIndex > 0 && commaIndex < raw.length - 1) {
    const provider = raw.slice(0, commaIndex).trim();
    const model = raw.slice(commaIndex + 1).trim();
    return provider && model ? `${provider}/${model}` : undefined;
  }

  return raw;
}

function composeRouteTarget(providerValue, modelValue) {
  const provider = stringValue(providerValue);
  const model = stringValue(modelValue);
  if (provider && model) {
    return `${provider}/${model}`;
  }
  return model || provider;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function hasWebSearchTool(tools) {
  return Array.isArray(tools) && tools.some((tool) => isRecord(tool) && stringValue(tool.type)?.startsWith("web_search"));
}

function hasImageContent(value) {
  return value !== undefined && JSON.stringify(value).includes("\"image\"");
}

function estimateTokenCount(body) {
  return Math.max(1, Math.ceil(JSON.stringify(body || {}).length / 4));
}

function isCursorDefaultModel(model) {
  const normalized = stringValue(model).toLowerCase();
  return normalized === "default" || normalized === "auto" || normalized === "cursor-default";
}

function sanitizeRouteId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "route";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function streamGatewayChatToCursor(runtime, request, response, chatRequest, bridgeContext) {
  const requestBody = { ...chatRequest, stream: true };
  ensureOpenAIStreamUsage(requestBody);
  const routingDecision = applyCursorProxyRouting(runtime, requestBody);
  const body = Buffer.from(`${JSON.stringify(requestBody)}\n`, "utf8");
  const headers = buildGatewayHeaders(
    runtime,
    {},
    { body, method: "POST", path: "/v1/chat/completions", protocol: "openai", skipRuntimeTargetHeaders: routingDecision.routed },
    body
  );
  const targetUrl = new URL("/v1/chat/completions", runtime.gatewayUrl);
  const transport = targetUrl.protocol === "https:" ? https : http;

  return await new Promise((resolve) => {
    let settled = false;
    const streamState = createGatewayStreamState();
    const finishTurn = (outcome = { type: "done" }) => {
      if (!settled) {
        settled = true;
        writeCursorConnectMessage(response, encodeCursorAgentTurnEnded());
        finishCursorConnectStream(response);
        resolve(outcome);
      }
    };
    const finishToolBridge = () => {
      if (settled) {
        return;
      }

      const toolCalls = finalizeGatewayToolCalls(streamState);
      if (toolCalls.length === 0 && streamState.finishReason !== "tool_calls") {
        finishTurn({ type: "done" });
        return;
      }

      const summary = summarizeGatewayToolCalls(toolCalls);
      const canBridge = bridgeContext && runtime.bridgeOpenAIToolCalls === true && toolCalls.length > 0;
      if (!canBridge) {
        handleUnbridgedGatewayToolCalls(runtime, response, toolCalls, streamState, bridgeContext);
        finishTurn({ finishReason: streamState.finishReason, toolCalls, type: "done" });
        return;
      }

      const bridgeResult = bridgeGatewayToolCallsToCursor(runtime, response, toolCalls, bridgeContext, streamState);
      if (bridgeResult.sent !== toolCalls.length || bridgeResult.missing.length > 0) {
        handleUnbridgedGatewayToolCalls(runtime, response, toolCalls, streamState, bridgeContext, bridgeResult);
        finishTurn({ finishReason: streamState.finishReason, toolCalls, type: "done" });
        return;
      }

      settled = true;
      runtime.logger?.debug?.(
        `Cursor proxy bridged upstream tool_calls to Cursor Agent ` +
        `(${summary || "tool_calls requested"}, model_call_id=${streamState.modelCallId || "unknown"}).`
      );
      resolve({
        finishReason: streamState.finishReason,
        modelCallId: streamState.modelCallId,
        toolCalls,
        type: "tool_calls"
      });
    };

    const upstreamRequest = transport.request(
      {
        headers,
        hostname: targetUrl.hostname,
        method: "POST",
        path: `${targetUrl.pathname}${targetUrl.search}`,
        port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
        protocol: targetUrl.protocol
      },
      (upstreamResponse) => {
        const chunks = [];
        let sseBuffer = "";
        const statusCode = upstreamResponse.statusCode || 502;
        const contentType = readHeader(upstreamResponse.headers["content-type"]).toLowerCase();

        upstreamResponse.on("data", (chunk) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          if (statusCode >= 400 || !contentType.includes("event-stream")) {
            chunks.push(buffer);
            return;
          }
          sseBuffer += buffer.toString("utf8");
          const lines = sseBuffer.split(/\r?\n/);
          sseBuffer = lines.pop() || "";
          for (const line of lines) {
            handleGatewayStreamLine(response, line, streamState);
          }
        });

        upstreamResponse.once("end", () => {
          if (statusCode >= 400) {
            const message = Buffer.concat(chunks).toString("utf8").trim() || `Gateway returned HTTP ${statusCode}.`;
            writeCursorConnectMessage(response, encodeCursorAgentTextDelta(message));
            finishTurn({ statusCode, type: "done" });
            return;
          } else if (!contentType.includes("event-stream")) {
            const text = Buffer.concat(chunks).toString("utf8");
            collectGatewayToolCallsFromJsonText(text, streamState);
            const message = extractTextFromGatewayJson(text);
            if (message) {
              writeCursorConnectMessage(response, encodeCursorAgentTextDelta(message));
            }
            finishToolBridge();
            return;
          } else if (sseBuffer.trim()) {
            handleGatewayStreamLine(response, sseBuffer, streamState);
          }
          finishToolBridge();
        });

        upstreamResponse.once("error", (error) => {
          writeCursorConnectMessage(response, encodeCursorAgentTextDelta(formatError(error)));
          finishTurn({ error, type: "done" });
        });
      }
    );

    upstreamRequest.once("error", (error) => {
      writeCursorConnectMessage(response, encodeCursorAgentTextDelta(formatError(error)));
      finishTurn({ error, type: "done" });
    });
    upstreamRequest.setTimeout(runtime.gatewayTimeoutMs, () => {
      upstreamRequest.destroy(new Error(`Cursor proxy gateway request to ${targetUrl.toString()} timed out.`));
    });
    upstreamRequest.end(body);
  });
}

function createGatewayStreamState() {
  return {
    finishReason: "",
    modelCallId: "",
    toolCallIndexKeys: new Map(),
    toolCallParts: new Map(),
    toolCalls: []
  };
}

function handleGatewayStreamLine(response, line, streamState) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return;
  }
  const data = trimmed.slice(5).trim();
  if (!data || data === "[DONE]") {
    return;
  }
  const payload = readJsonText(data);
  if (!payload) {
    return;
  }
  const text = extractTextFromGatewayPayload(payload);
  if (text) {
    writeCursorConnectMessage(response, encodeCursorAgentTextDelta(text));
  }
  collectGatewayToolCallsFromPayload(payload, streamState);
}

function extractTextFromGatewayPayload(payload) {
  return stringifyContent(payload.choices?.[0]?.delta?.content) ||
    stringifyContent(payload.choices?.[0]?.message?.content) ||
    stringifyContent(payload.delta) ||
    stringifyContent(payload.output_text) ||
    "";
}

function collectGatewayToolCallsFromJsonText(text, streamState) {
  const payload = readJsonText(text);
  if (!payload) {
    return;
  }
  collectGatewayToolCallsFromPayload(payload, streamState);
}

function collectGatewayToolCallsFromPayload(payload, streamState) {
  if (!isRecord(payload) || !streamState) {
    return;
  }
  if (typeof payload.id === "string" && payload.id) {
    streamState.modelCallId = payload.id;
  }
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  choices.forEach((choice) => {
    if (!isRecord(choice)) {
      return;
    }
    const finishReason = stringValue(choice.finish_reason);
    if (finishReason) {
      streamState.finishReason = finishReason;
    }
    const indexOffset = streamState.toolCallParts.size;
    collectGatewayToolCallDeltas(choice.delta?.tool_calls, streamState, indexOffset);
    collectGatewayToolCallDeltas(choice.message?.tool_calls, streamState, indexOffset);
    collectGatewayToolCallDeltas(choice.tool_calls, streamState, indexOffset);
  });
  collectGatewayToolCallDeltas(payload.tool_calls, streamState, streamState.toolCallParts.size);
}

function collectGatewayToolCallDeltas(value, streamState, indexOffset) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  values.forEach((item, index) => {
    applyGatewayToolCallDelta(item, streamState, indexOffset + index);
  });
}

function applyGatewayToolCallDelta(value, streamState, fallbackIndex) {
  if (!isRecord(value)) {
    return;
  }
  const raw = unwrapToolCall(value);
  if (!isRecord(raw)) {
    return;
  }
  const fn = isRecord(raw.function) ? raw.function : raw;
  const rawIndex = Number(raw.index);
  const index = Number.isInteger(rawIndex) ? rawIndex : fallbackIndex;
  const id = stringValue(raw.id) || stringValue(raw.tool_call_id) || stringValue(raw.toolCallId) || stringValue(raw.callId);
  const indexKey = `index:${index}`;
  const mappedKey = streamState.toolCallIndexKeys.get(indexKey);
  let key = id || mappedKey || indexKey;
  let part = streamState.toolCallParts.get(key);
  if (id && mappedKey && mappedKey !== id && streamState.toolCallParts.has(mappedKey)) {
    part = streamState.toolCallParts.get(mappedKey);
    streamState.toolCallParts.delete(mappedKey);
  } else if (id && !mappedKey && streamState.toolCallParts.has(indexKey)) {
    part = streamState.toolCallParts.get(indexKey);
    streamState.toolCallParts.delete(indexKey);
  }
  if (id) {
    key = id;
    streamState.toolCallIndexKeys.set(indexKey, id);
  }
  part = part || {
    arguments: "",
    id: id || `call_${index + 1}`,
    index,
    name: "",
    type: stringValue(raw.type) || "function"
  };

  if (id) {
    part.id = id;
  }
  const name =
    stringValue(fn.name) ||
    stringValue(raw.name) ||
    stringValue(raw.toolName) ||
    stringValue(raw.functionName);
  if (name) {
    part.name = name;
  }
  const rawArguments = firstDefined(fn.arguments, raw.arguments, fn.input, raw.input, raw.args, fn.parameters, raw.parameters);
  if (typeof rawArguments === "string") {
    part.arguments += rawArguments;
  } else if (rawArguments !== undefined) {
    part.arguments = normalizeToolArguments(rawArguments);
  }
  if (part.type !== "function") {
    part.type = "function";
  }
  streamState.toolCallParts.set(key, part);
}

function finalizeGatewayToolCalls(streamState) {
  const parts = [...(streamState?.toolCallParts?.values?.() || [])]
    .sort((left, right) => (left.index || 0) - (right.index || 0));
  const calls = parts
    .filter((part) => part.name)
    .map((part, index) => ({
      function: {
        arguments: part.arguments || "{}",
        name: part.name
      },
      id: part.id || `call_${index + 1}`,
      type: "function"
    }));
  const normalized = uniqueToolCalls([
    ...normalizeToolCallList(streamState?.toolCalls),
    ...calls
  ]);
  if (streamState) {
    streamState.toolCalls = normalized;
  }
  return normalized;
}

function summarizeGatewayToolCalls(toolCalls) {
  const calls = Array.isArray(toolCalls) ? toolCalls : [];
  return calls
    .slice(0, 5)
    .map((call) => {
      const name = stringValue(call?.function?.name) || stringValue(call?.name) || "unknown";
      const args = stringValue(call?.function?.arguments) || stringValue(call?.arguments) || "";
      return args ? `${name}(${truncateForLog(undefined, args)})` : name;
    })
    .join(", ");
}

function buildCursorToolBridgeContext(runtime, session, runRequest, chatRequest, round) {
  const contextValues = Buffer.isBuffer(runRequest) ? decodeAgentRunRequestContextValues(runRequest) : [];
  const toolIndex = buildCursorMcpToolIndex(contextValues);
  const decodedTools = Array.isArray(chatRequest?.tools) ? chatRequest.tools.length : 0;
  const nativeToolNames = (Array.isArray(chatRequest?.tools) ? chatRequest.tools : [])
    .map((tool) => stringValue(tool?.function?.name) || stringValue(tool?.name))
    .filter((name) => lookupCursorNativeToolSpec(name));
  runtime.logger?.debug?.(
    `Cursor proxy prepared tool bridge context for ${session.requestId} ` +
    `(round=${round}, decoded_tools=${decodedTools}, cursor_native_tools=${nativeToolNames.length}, ` +
    `cursor_native_names=${nativeToolNames.slice(0, decodeDiagnosticSampleLimit(runtime)).join(",") || "none"}, ` +
    `cursor_mcp_tools=${toolIndex.tools.length}, ` +
    `providers=${[...new Set(toolIndex.tools.map((tool) => tool.providerIdentifier))].join(",") || "none"}).`
  );
  return {
    chatRequest,
    round,
    runRequest,
    session,
    toolIndex
  };
}

function buildCursorMcpToolIndex(values) {
  const byName = new Map();
  const tools = [];
  for (const filePath of extractCursorToolFilePaths(values)) {
    const metadata = readCursorMcpToolMetadata(filePath);
    if (!metadata) {
      continue;
    }
    tools.push(metadata);
    addCursorMcpToolIndexEntry(byName, metadata.name, metadata);
    addCursorMcpToolIndexEntry(byName, metadata.toolName, metadata);
    addCursorMcpToolIndexEntry(byName, `${metadata.providerIdentifier}.${metadata.toolName}`, metadata);
    addCursorMcpToolIndexEntry(byName, `${metadata.providerIdentifier}_${metadata.toolName}`, metadata);
    addCursorMcpToolIndexEntry(byName, `${metadata.providerIdentifier}:${metadata.toolName}`, metadata);
  }
  return { byName, tools };
}

function addCursorMcpToolIndexEntry(index, name, metadata) {
  const key = normalizeToolBridgeName(name);
  if (!key || index.has(key)) {
    return;
  }
  index.set(key, metadata);
}

function lookupCursorMcpToolMetadata(bridgeContext, name) {
  const index = bridgeContext?.toolIndex?.byName;
  if (!(index instanceof Map)) {
    return undefined;
  }
  return index.get(normalizeToolBridgeName(name));
}

function normalizeToolBridgeName(value) {
  return String(value || "").trim().toLowerCase();
}

function readCursorMcpToolMetadata(filePath) {
  const pathMetadata = parseCursorMcpToolFilePath(filePath);
  if (!pathMetadata) {
    return undefined;
  }
  const text = readTextFileIfSmall(filePath, 512 * 1024);
  const parsed = readJsonText(text);
  if (!isRecord(parsed)) {
    return {
      ...pathMetadata,
      name: pathMetadata.toolName
    };
  }
  const name = stringValue(parsed.name) || pathMetadata.toolName;
  return {
    ...pathMetadata,
    description: stringValue(parsed.description),
    name,
    schema: isRecord(parsed.arguments) ? parsed.arguments : isRecord(parsed.parameters) ? parsed.parameters : undefined
  };
}

function parseCursorMcpToolFilePath(filePath) {
  const normalized = normalizeCursorMcpFilePath(filePath);
  if (!normalized) {
    return undefined;
  }
  const parts = normalized.split(path.sep);
  const markerIndex = parts.lastIndexOf("mcps");
  if (markerIndex < 0 || parts[markerIndex + 2] !== "tools") {
    return undefined;
  }
  const providerIdentifier = parts[markerIndex + 1];
  const fileName = parts[markerIndex + 3] || "";
  const toolName = fileName.endsWith(".json") ? fileName.slice(0, -".json".length) : path.basename(fileName, ".json");
  if (!providerIdentifier || !toolName) {
    return undefined;
  }
  return {
    filePath: normalized,
    providerIdentifier,
    toolName
  };
}

function bridgeGatewayToolCallsToCursor(runtime, response, toolCalls, bridgeContext, streamState) {
  const missing = [];
  let sent = 0;
  toolCalls.forEach((call, index) => {
    const name = stringValue(call?.function?.name) || stringValue(call?.name);
    const nativeSpec = lookupCursorNativeToolSpec(name);
    if (nativeSpec) {
      runtime.logger?.debug?.(
        `Cursor proxy bridging OpenAI tool_call ${name || `call_${index + 1}`} ` +
        `to Cursor native ${nativeSpec.name} (field=${nativeSpec.toolCallField}).`
      );
      writeCursorConnectMessage(
        response,
        encodeCursorAgentNativeToolCallStarted(call, nativeSpec, {
          modelCallId: streamState?.modelCallId
        })
      );
      sent += 1;
      return;
    }
    const metadata = lookupCursorMcpToolMetadata(bridgeContext, name);
    if (!metadata) {
      missing.push(name || `call_${index + 1}`);
      return;
    }
    runtime.logger?.debug?.(
      `Cursor proxy bridging OpenAI tool_call ${name || `call_${index + 1}`} ` +
      `to Cursor MCP ${metadata.providerIdentifier}/${metadata.toolName}.`
    );
    writeCursorConnectMessage(
      response,
      encodeCursorAgentMcpToolCallStarted(call, metadata, {
        modelCallId: streamState?.modelCallId,
        skipApproval: runtime.cursorMcpSkipApproval
      })
    );
    sent += 1;
  });
  return { missing, sent };
}

function handleUnbridgedGatewayToolCalls(runtime, response, toolCalls, streamState, bridgeContext, bridgeResult) {
  const summary = summarizeGatewayToolCalls(toolCalls);
  const missing = Array.isArray(bridgeResult?.missing) ? bridgeResult.missing : [];
  const reason = runtime.bridgeOpenAIToolCalls !== true
    ? "tool bridge disabled"
	    : !bridgeContext
	      ? "no Cursor Agent bridge context"
	      : toolCalls.length === 0
	        ? "finish_reason=tool_calls but no complete tool_calls were decoded"
	        : missing.length > 0
	          ? `missing Cursor tool metadata for ${missing.join(", ")}`
	          : "tool bridge could not emit all tool events";
  runtime.logger?.warn?.(
    `Cursor proxy received upstream tool_calls but could not bridge them to Cursor Agent ` +
    `(${reason}; ${summary || "tool_calls requested"}; model_call_id=${streamState?.modelCallId || "unknown"}).`
  );
  if (runtime?.showUnbridgedToolCallWarning === true) {
	    writeCursorConnectMessage(response, encodeCursorAgentTextDelta(
	      `\n\n[Cursor proxy] Upstream requested tool execution (${summary || "tool_calls"}), ` +
	      `but the proxy could not emit Cursor Agent tool events: ${reason}.`
	    ));
  }
}

function writeCursorMcpToolResultEvents(runtime, response, toolCalls, bridgeContext, chatRequest, modelCallId) {
  const resultMessages = findToolResultMessages(chatRequest?.messages, toolCalls);
  if (resultMessages.length === 0) {
    runtime.logger?.debug?.(
      `Cursor proxy did not find decoded tool result messages for completed Cursor MCP tool events ` +
      `(${summarizeGatewayToolCalls(toolCalls)}).`
    );
    return;
  }

  for (const call of toolCalls) {
    const name = stringValue(call?.function?.name);
    const metadata = lookupCursorMcpToolMetadata(bridgeContext, name);
    if (!metadata) {
      continue;
    }
    const resultMessage = findToolResultMessageForCall(resultMessages, call);
    if (!resultMessage) {
      continue;
    }
    writeCursorConnectMessage(
      response,
      encodeCursorAgentMcpToolCallCompleted(call, metadata, resultMessage, {
        modelCallId,
        skipApproval: runtime.cursorMcpSkipApproval
      })
    );
  }
}

function findToolResultMessages(messages, toolCalls) {
  const ids = new Set((Array.isArray(toolCalls) ? toolCalls : []).map((call) => call.id).filter(Boolean));
  const names = new Set((Array.isArray(toolCalls) ? toolCalls : [])
    .map((call) => stringValue(call?.function?.name))
    .filter(Boolean));
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.role === "tool")
    .filter((message) => {
      const id = stringValue(message.tool_call_id);
      const name = stringValue(message.name);
      return (id && ids.has(id)) || (name && names.has(name)) || (ids.size === 0 && names.size === 0);
    });
}

function findToolResultMessageForCall(messages, call) {
  const id = stringValue(call?.id);
  const name = stringValue(call?.function?.name);
  return (Array.isArray(messages) ? messages : []).find((message) => {
    const messageId = stringValue(message.tool_call_id);
    const messageName = stringValue(message.name);
    return (id && messageId === id) || (name && messageName === name);
  }) || (Array.isArray(messages) ? messages[0] : undefined);
}

function mergeToolCallContinuationChatRequest(previousRequest, toolCalls, nextRequest) {
  const previousMessages = Array.isArray(previousRequest?.messages) ? previousRequest.messages : [];
  const nextMessages = Array.isArray(nextRequest?.messages) ? nextRequest.messages : [];
  const assistantToolCallMessage = createAssistantToolCallMessage(toolCalls);
  const mergedMessages = [];
  appendUniqueChatMessages(mergedMessages, previousMessages);
  if (!hasAssistantToolCallsForIds(mergedMessages, toolCalls)) {
    appendUniqueChatMessages(mergedMessages, [assistantToolCallMessage]);
  }
  appendUniqueChatMessages(mergedMessages, nextMessages);

  return compactObject({
    ...previousRequest,
    ...nextRequest,
    messages: compactChatMessages(mergedMessages),
    stream: true,
    tool_choice: nextRequest?.tool_choice ?? previousRequest?.tool_choice,
    tools: Array.isArray(nextRequest?.tools) && nextRequest.tools.length > 0
      ? nextRequest.tools
      : previousRequest?.tools
  });
}

function createAssistantToolCallMessage(toolCalls) {
  return {
    content: "",
    role: "assistant",
    tool_calls: normalizeToolCallList(toolCalls)
  };
}

function appendUniqueChatMessages(target, messages) {
  const seen = new Set(target.map(chatMessageFingerprint));
  for (const message of Array.isArray(messages) ? messages : []) {
    const fingerprint = chatMessageFingerprint(message);
    if (!fingerprint || seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    target.push(message);
  }
}

function chatMessageFingerprint(message) {
  if (!isRecord(message)) {
    return "";
  }
  return safeJsonStringify(compactObject({
    content: message.content,
    function_call: message.function_call,
    name: message.name,
    role: message.role,
    tool_call_id: message.tool_call_id,
    tool_calls: message.tool_calls
  }));
}

function hasAssistantToolCallsForIds(messages, toolCalls) {
  const ids = new Set((Array.isArray(toolCalls) ? toolCalls : []).map((call) => call.id).filter(Boolean));
  if (ids.size === 0) {
    return false;
  }
  return (Array.isArray(messages) ? messages : []).some((message) => {
    if (message?.role !== "assistant" || !Array.isArray(message.tool_calls)) {
      return false;
    }
    return message.tool_calls.some((call) => ids.has(call.id));
  });
}

function logAgentToolContinuation(runtime, session, toolCalls, chatRequest, round) {
  runtime.logger?.debug?.(
    `Cursor proxy continuing Agent RunSSE after Cursor tool results for ${session.requestId} ` +
    `(round=${round}, tool_calls=${summarizeGatewayToolCalls(toolCalls) || "none"}, ` +
    `${formatChatRequestSummary(chatRequest)}).`
  );
}

function logCursorToolBridgeFollowUp(runtime, session, runRequest, chatRequest, toolCalls, resultMessages, round) {
  const dumpPath = writeAgentRunRequestDecodeDump(
    runtime,
    session,
    runRequest,
    chatRequest,
    `tool-bridge-round-${round}`
  );
  const resultSummary = (Array.isArray(resultMessages) ? resultMessages : [])
    .slice(0, decodeDiagnosticSampleLimit(runtime))
    .map((message) => {
      const id = stringValue(message.tool_call_id) || "no-id";
      const name = stringValue(message.name) || "no-name";
      const content = truncateForLog(runtime, stringifyContent(message.content) || "");
      return `${name}/${id}:${content}`;
    })
    .join(" | ") || "none";
  runtime.logger?.debug?.(
    `Cursor proxy decoded tool bridge follow-up for ${session.requestId} ` +
    `(round=${round}, tool_calls=${summarizeGatewayToolCalls(toolCalls) || "none"}, ` +
    `result_messages=${Array.isArray(resultMessages) ? resultMessages.length : 0}, ` +
    `results=${resultSummary}, ${formatChatRequestSummary(chatRequest)}` +
    `${dumpPath ? `, decode_dump=${dumpPath}` : ""}).`
  );
  if (!Array.isArray(resultMessages) || resultMessages.length > 0) {
    return;
  }
  logCursorDecodeDiagnostics(
    runtime,
    "warn",
    `Cursor proxy tool bridge follow-up for ${session.requestId} did not decode any matching tool result messages; ` +
      `tool_calls=${summarizeGatewayToolCalls(toolCalls) || "none"}; ` +
      `run_request=${formatAgentRunRequestDecodeDiagnostic(runtime, runRequest, chatRequest)}; ` +
      `bidi_session=${formatBidiSessionDecodeDiagnostic(runtime, session)}`
  );
}

function extractTextFromGatewayJson(text) {
  const payload = readJsonText(text);
  if (!payload) {
    return text.trim();
  }
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined;
  const hasToolCalls = normalizeToolCallList(choice?.message?.tool_calls).length > 0 ||
    normalizeToolCallList(choice?.delta?.tool_calls).length > 0 ||
    normalizeToolCallList(payload.tool_calls).length > 0;
  return stringifyContent(payload.choices?.[0]?.message?.content) ||
    stringifyContent(payload.choices?.[0]?.delta?.content) ||
    stringifyContent(payload.output_text) ||
    stringifyContent(payload.content) ||
    (hasToolCalls ? "" : text.trim());
}

function writeCursorConnectMessage(response, message) {
  if (!response.writableEnded) {
    response.write(connectEnvelope(0, message));
  }
}

function finishCursorConnectStream(response) {
  if (!response.writableEnded) {
    response.end(connectEnvelope(0x02, Buffer.from("{}", "utf8")));
  }
}

function encodeCursorAgentTextDelta(text) {
  return protoMessage(1, protoMessage(1, protoRawString(1, text)));
}

function encodeCursorAgentTurnEnded() {
  return protoMessage(1, protoMessage(14, Buffer.alloc(0)));
}

function encodeCursorAgentMcpToolCallStarted(call, metadata, options = {}) {
  const update = Buffer.concat([
    protoString(1, call.id),
    protoMessage(2, encodeCursorMcpToolCall(call, metadata, undefined, options)),
    protoString(3, options.modelCallId)
  ]);
  return protoMessage(1, protoMessage(2, update));
}

function encodeCursorAgentMcpToolCallCompleted(call, metadata, resultMessage, options = {}) {
  const update = Buffer.concat([
    protoString(1, call.id),
    protoMessage(2, encodeCursorMcpToolCall(call, metadata, resultMessage, options)),
    protoString(3, options.modelCallId)
  ]);
  return protoMessage(1, protoMessage(3, update));
}

function encodeCursorAgentNativeToolCallStarted(call, spec, options = {}) {
  const update = Buffer.concat([
    protoString(1, call.id),
    protoMessage(2, encodeCursorNativeToolCall(call, spec)),
    protoString(3, options.modelCallId)
  ]);
  return protoMessage(1, protoMessage(2, update));
}

function encodeCursorNativeToolCall(call, spec) {
  const args = parseToolArgumentsObject(call?.function?.arguments);
  return protoMessage(spec.toolCallField, protoMessage(1, spec.encodeArgs(args, call)));
}

function encodeCursorMcpToolCall(call, metadata, resultMessage, options = {}) {
  const mcpToolCall = Buffer.concat([
    protoMessage(1, encodeCursorMcpArgs(call, metadata, options)),
    resultMessage ? protoMessage(2, encodeCursorMcpResult(resultMessage)) : Buffer.alloc(0)
  ]);
  return protoMessage(15, mcpToolCall);
}

function encodeCursorMcpArgs(call, metadata, options = {}) {
  const args = parseToolArgumentsObject(call?.function?.arguments);
  return Buffer.concat([
    protoString(1, stringValue(call?.function?.name) || metadata.name || metadata.toolName),
    encodeProtoStringValueMapField(2, args),
    protoString(3, call?.id),
    protoString(4, metadata.providerIdentifier),
    protoString(5, metadata.toolName || metadata.name),
    options.skipApproval ? protoBool(8, true) : Buffer.alloc(0)
  ]);
}

function encodeCursorMcpResult(resultMessage) {
  const text = stringifyContent(resultMessage?.content) || "";
  const textContent = protoRawString(1, text);
  const contentItem = protoMessage(1, textContent);
  const success = protoMessage(1, contentItem);
  return protoMessage(1, success);
}

function parseToolArgumentsObject(value) {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = readJsonText(value);
    if (isRecord(parsed)) {
      return parsed;
    }
    if (parsed !== undefined) {
      return { value: parsed };
    }
    return value.trim() ? { input: value } : {};
  }
  if (value === undefined || value === null) {
    return {};
  }
  return { value };
}

function encodeCursorNativeReadArgs(args) {
  return Buffer.concat([
    protoString(1, stringArg(args, ["path", "file", "file_path", "target_file"])),
    optionalProtoInt(2, numberArg(args, ["offset", "start_line"])),
    optionalProtoInt(3, numberArg(args, ["limit", "num_lines", "line_count"])),
    optionalProtoBool(5, booleanArg(args, ["include_line_numbers", "includeLineNumbers"]))
  ]);
}

function encodeCursorNativeLsArgs(args, call) {
  const ignore = arrayArg(args, ["ignore", "ignores", "exclude"]).filter((item) => typeof item === "string");
  return Buffer.concat([
    protoString(1, stringArg(args, ["path", "directory", "dir", "target_directory"]) || "."),
    Buffer.concat(ignore.map((item) => protoString(2, item))),
    protoString(3, call?.id)
  ]);
}

function encodeCursorNativeGrepArgs(args, call) {
  return Buffer.concat([
    protoString(1, stringArg(args, ["pattern", "query", "regex"])),
    protoString(2, stringArg(args, ["path", "target_directory", "directory"])),
    protoString(3, stringArg(args, ["glob", "include", "include_pattern"])),
    protoString(4, stringArg(args, ["output_mode", "outputMode"])),
    optionalProtoInt(5, numberArg(args, ["context_before", "contextBefore"])),
    optionalProtoInt(6, numberArg(args, ["context_after", "contextAfter"])),
    optionalProtoInt(7, numberArg(args, ["context"])),
    optionalProtoBool(8, booleanArg(args, ["case_insensitive", "caseInsensitive", "ignore_case"])),
    protoString(9, stringArg(args, ["type"])),
    optionalProtoInt(10, numberArg(args, ["head_limit", "headLimit", "limit"])),
    optionalProtoBool(11, booleanArg(args, ["multiline"])),
    protoString(12, stringArg(args, ["sort"])),
    optionalProtoBool(13, booleanArg(args, ["sort_ascending", "sortAscending"])),
    protoString(14, call?.id),
    optionalProtoInt(16, numberArg(args, ["offset"]))
  ]);
}

function encodeCursorNativeGlobArgs(args) {
  return Buffer.concat([
    protoString(1, stringArg(args, ["target_directory", "targetDirectory", "path", "directory"])),
    protoString(2, stringArg(args, ["glob_pattern", "globPattern", "pattern", "query"]) || "*")
  ]);
}

function encodeCursorNativeSemSearchArgs(args) {
  const targetDirectories = arrayArg(args, ["target_directories", "targetDirectories", "directories"])
    .filter((item) => typeof item === "string");
  return Buffer.concat([
    protoString(1, stringArg(args, ["query", "question"])),
    Buffer.concat(targetDirectories.map((item) => protoString(2, item))),
    protoString(3, stringArg(args, ["explanation", "reason"]))
  ]);
}

function encodeCursorNativeShellArgs(args, call) {
  const simpleCommands = arrayArg(args, ["simple_commands", "simpleCommands"])
    .filter((item) => typeof item === "string");
  return Buffer.concat([
    protoString(1, stringArg(args, ["command", "cmd"])),
    protoString(2, stringArg(args, ["working_directory", "workingDirectory", "cwd", "path"])),
    optionalProtoInt(3, numberArg(args, ["timeout", "timeout_ms", "timeoutMs"])),
    protoString(4, call?.id),
    Buffer.concat(simpleCommands.map((item) => protoString(5, item))),
    optionalProtoBool(11, booleanArg(args, ["is_background", "isBackground", "background"])),
    optionalProtoBool(12, booleanArg(args, ["skip_approval", "skipApproval"])),
    optionalProtoInt(13, timeoutBehaviorArg(args)),
    optionalProtoInt(14, numberArg(args, ["hard_timeout", "hardTimeout"])),
    protoString(15, stringArg(args, ["description", "reason"])),
    optionalProtoBool(17, booleanArg(args, ["close_stdin", "closeStdin"]))
  ]);
}

function encodeCursorNativeDeleteArgs(args, call) {
  return Buffer.concat([
    protoString(1, stringArg(args, ["path", "file", "file_path", "target_file"])),
    protoString(2, call?.id)
  ]);
}

function encodeCursorNativeEditArgs(args) {
  return Buffer.concat([
    protoString(1, stringArg(args, ["path", "file", "file_path", "target_file"])),
    protoRawString(6, stringArg(args, ["stream_content", "streamContent", "content", "file_text", "text", "new_content"]))
  ]);
}

function encodeCursorNativeReadLintsArgs(args) {
  const paths = arrayArg(args, ["paths", "path", "files", "file"])
    .filter((item) => typeof item === "string");
  return Buffer.concat(paths.map((item) => protoString(1, item)));
}

function encodeCursorNativeWebSearchArgs(args, call) {
  return Buffer.concat([
    protoString(1, stringArg(args, ["search_term", "searchTerm", "query", "q"])),
    protoString(2, call?.id)
  ]);
}

function encodeCursorNativeUrlArgs(args, call) {
  return Buffer.concat([
    protoString(1, stringArg(args, ["url", "uri"])),
    protoString(2, call?.id)
  ]);
}

function encodeCursorNativeTaskArgs(args) {
  const attachments = arrayArg(args, ["attachments", "files", "paths"])
    .filter((item) => typeof item === "string");
  const respondingToMessageIds = arrayArg(args, ["responding_to_message_ids", "respondingToMessageIds"])
    .filter((item) => typeof item === "string");
  return Buffer.concat([
    protoString(1, stringArg(args, ["description", "title", "summary"])),
    protoRawString(2, stringArg(args, ["prompt", "task", "input", "instructions"])),
    protoString(4, stringArg(args, ["model"])),
    protoString(5, stringArg(args, ["resume", "resume_from_id", "resumeFromId"])),
    protoString(6, stringArg(args, ["agent_id", "agentId"])),
    Buffer.concat(attachments.map((item) => protoString(7, item))),
    optionalProtoInt(8, taskModeArg(args)),
    Buffer.concat(respondingToMessageIds.map((item) => protoString(9, item))),
    optionalProtoInt(10, taskEnvironmentArg(args))
  ]);
}

function encodeCursorNativeAwaitArgs(args) {
  return Buffer.concat([
    protoString(1, stringArg(args, ["task_id", "taskId", "id"])),
    optionalProtoInt(2, numberArg(args, ["block_until_ms", "blockUntilMs", "timeout_ms", "timeoutMs"])),
    protoString(3, stringArg(args, ["regex", "pattern"]))
  ]);
}

function encodeCursorNativeReadTodosArgs(args) {
  const statuses = arrayArg(args, ["status_filter", "statusFilter", "statuses", "status"])
    .map(todoStatusArg)
    .filter((value) => value > 0);
  const ids = arrayArg(args, ["id_filter", "idFilter", "ids", "id"])
    .filter((item) => typeof item === "string");
  return Buffer.concat([
    Buffer.concat(statuses.map((item) => optionalProtoInt(1, item))),
    Buffer.concat(ids.map((item) => protoString(2, item)))
  ]);
}

function encodeCursorNativeUpdateTodosArgs(args) {
  const todos = arrayArg(args, ["todos", "items"])
    .filter(isRecord)
    .map(encodeCursorNativeTodoItem);
  return Buffer.concat([
    Buffer.concat(todos.map((item) => protoMessage(1, item))),
    optionalProtoBool(2, booleanArg(args, ["merge"]))
  ]);
}

function encodeCursorNativeTodoItem(item) {
  const dependencies = arrayArg(item, ["dependencies", "depends_on", "dependsOn"])
    .filter((value) => typeof value === "string");
  return Buffer.concat([
    protoString(1, stringArg(item, ["id"])),
    protoRawString(2, stringArg(item, ["content", "text", "title"])),
    optionalProtoInt(3, todoStatusArg(item?.status)),
    optionalProtoInt(4, numberArg(item, ["created_at", "createdAt"])),
    optionalProtoInt(5, numberArg(item, ["updated_at", "updatedAt"])),
    Buffer.concat(dependencies.map((dependency) => protoString(6, dependency)))
  ]);
}

function encodeCursorNativeAskQuestionArgs(args, call) {
  const questions = arrayArg(args, ["questions", "items"])
    .filter(isRecord)
    .map(encodeCursorNativeQuestion);
  return Buffer.concat([
    protoString(1, stringArg(args, ["title", "header"])),
    Buffer.concat(questions.map((question) => protoMessage(2, question))),
    optionalProtoBool(5, booleanArg(args, ["run_async", "runAsync"])),
    protoString(6, stringArg(args, ["async_original_tool_call_id", "asyncOriginalToolCallId"]))
  ]);
}

function encodeCursorNativeQuestion(question) {
  const options = arrayArg(question, ["options", "choices"])
    .filter(isRecord)
    .map(encodeCursorNativeQuestionOption);
  return Buffer.concat([
    protoString(1, stringArg(question, ["id"])),
    protoRawString(2, stringArg(question, ["prompt", "question", "text"])),
    Buffer.concat(options.map((option) => protoMessage(3, option))),
    optionalProtoBool(4, booleanArg(question, ["allow_multiple", "allowMultiple", "multiple"]))
  ]);
}

function encodeCursorNativeQuestionOption(option) {
  return Buffer.concat([
    protoString(1, stringArg(option, ["id", "value"])),
    protoRawString(2, stringArg(option, ["label", "text", "description"]))
  ]);
}

function encodeCursorNativeSwitchModeArgs(args, call) {
  return Buffer.concat([
    protoString(1, stringArg(args, ["target_mode_id", "targetModeId", "mode", "mode_id"])),
    protoRawString(2, stringArg(args, ["explanation", "reason"])),
    protoString(3, call?.id)
  ]);
}

function encodeCursorNativeGenerateImageArgs(args) {
  const references = arrayArg(args, ["reference_image_paths", "referenceImagePaths", "references"])
    .filter((item) => typeof item === "string");
  return Buffer.concat([
    protoRawString(1, stringArg(args, ["description", "prompt"])),
    protoString(2, stringArg(args, ["file_path", "filePath", "path"])),
    Buffer.concat(references.map((item) => protoString(5, item)))
  ]);
}

function encodeCursorNativeListMcpResourcesArgs(args) {
  return protoString(1, stringArg(args, ["server", "provider", "provider_identifier", "providerIdentifier"]));
}

function encodeCursorNativeReadMcpResourceArgs(args, call) {
  return Buffer.concat([
    protoString(1, stringArg(args, ["server", "provider", "provider_identifier", "providerIdentifier"])),
    protoString(2, stringArg(args, ["uri", "url"])),
    protoString(3, stringArg(args, ["download_path", "downloadPath", "path"])),
    protoString(4, call?.id)
  ]);
}

function encodeCursorNativeGetMcpToolsArgs(args, call) {
  return Buffer.concat([
    protoString(1, stringArg(args, ["server", "provider", "provider_identifier", "providerIdentifier"])),
    protoString(2, stringArg(args, ["tool_name", "toolName", "name"])),
    protoString(3, stringArg(args, ["pattern", "query"])),
    protoString(4, call?.id)
  ]);
}

function encodeCursorNativeCallMcpToolArgs(args, call) {
  const server = stringArg(args, ["server", "provider", "provider_identifier", "providerIdentifier"]);
  const toolName = stringArg(args, ["tool_name", "toolName", "name"]);
  const rawArgs = firstDefined(args?.arguments, args?.args, args?.parameters, args?.input);
  const toolArgs = isRecord(rawArgs) ? rawArgs : {};
  return Buffer.concat([
    protoString(1, toolName),
    encodeProtoStringValueMapField(2, toolArgs),
    protoString(3, call?.id),
    protoString(4, server),
    protoString(5, toolName),
    optionalProtoBool(8, booleanArg(args, ["skip_approval", "skipApproval"]))
  ]);
}

function encodeCursorNativeSetActiveBranchArgs(args) {
  return Buffer.concat([
    protoString(1, stringArg(args, ["path", "repo_path", "repoPath"])),
    protoString(2, stringArg(args, ["branch_name", "branchName", "branch"]))
  ]);
}

function stringArg(args, keys) {
  for (const key of keys) {
    if (typeof args?.[key] === "string" && args[key].trim()) {
      return args[key].trim();
    }
  }
  return "";
}

function numberArg(args, keys) {
  for (const key of keys) {
    const value = args?.[key];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    const number = Number(value);
    if (Number.isFinite(number)) {
      return number;
    }
  }
  return undefined;
}

function booleanArg(args, keys) {
  for (const key of keys) {
    const value = args?.[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function arrayArg(args, keys) {
  for (const key of keys) {
    const value = args?.[key];
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      return [value.trim()];
    }
  }
  return [];
}

function timeoutBehaviorArg(args) {
  const value = stringArg(args, ["timeout_behavior", "timeoutBehavior"]).toLowerCase();
  if (value === "cancel") {
    return 1;
  }
  if (value === "background") {
    return 2;
  }
  return undefined;
}

function taskModeArg(args) {
  const value = stringArg(args, ["mode"]).toLowerCase();
  if (value === "agent" || value === "default") {
    return 1;
  }
  if (value === "ask" || value === "plan") {
    return 2;
  }
  const number = numberArg(args, ["mode"]);
  return Number.isFinite(number) ? number : undefined;
}

function taskEnvironmentArg(args) {
  const value = stringArg(args, ["environment", "env"]).toLowerCase();
  if (value === "local" || value === "ide") {
    return 1;
  }
  if (value === "cloud" || value === "remote") {
    return 2;
  }
  const number = numberArg(args, ["environment", "env"]);
  return Number.isFinite(number) ? number : undefined;
}

function todoStatusArg(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase().replace(/[-\s]+/g, "_") : "";
  if (normalized === "pending" || normalized === "todo") {
    return 1;
  }
  if (normalized === "in_progress" || normalized === "inprogress" || normalized === "doing") {
    return 2;
  }
  if (normalized === "completed" || normalized === "complete" || normalized === "done") {
    return 3;
  }
  if (normalized === "cancelled" || normalized === "canceled") {
    return 4;
  }
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function encodeProtoStringValueMapField(fieldNumber, value) {
  if (!isRecord(value)) {
    return Buffer.alloc(0);
  }
  return Buffer.concat(Object.entries(value).map(([key, rawValue]) => {
    const entry = Buffer.concat([
      protoString(1, key),
      protoMessage(2, encodeGoogleValue(rawValue))
    ]);
    return protoMessage(fieldNumber, entry);
  }));
}

function encodeGoogleStruct(value) {
  if (!isRecord(value)) {
    return Buffer.alloc(0);
  }
  return Buffer.concat(Object.entries(value).map(([key, rawValue]) => {
    const field = Buffer.concat([
      protoString(1, key),
      protoMessage(2, encodeGoogleValue(rawValue))
    ]);
    return protoMessage(1, field);
  }));
}

function encodeGoogleListValue(value) {
  const items = Array.isArray(value) ? value : [];
  return Buffer.concat(items.map((item) => protoMessage(1, encodeGoogleValue(item))));
}

function encodeGoogleValue(value) {
  if (value === null || value === undefined) {
    return Buffer.concat([protoTag(1, 0), protoVarint(0)]);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? protoDouble(2, value) : protoRawString(3, String(value));
  }
  if (typeof value === "string") {
    return protoRawString(3, value);
  }
  if (typeof value === "boolean") {
    return protoBool(4, value, true);
  }
  if (Array.isArray(value)) {
    return protoMessage(6, encodeGoogleListValue(value));
  }
  if (isRecord(value)) {
    return protoMessage(5, encodeGoogleStruct(value));
  }
  return protoRawString(3, String(value));
}

function resolveGatewayRoute(runtime, request, url, requestBody) {
  const method = (request.method || "GET").toUpperCase();
  const path = normalizePath(url.pathname);
  const search = url.search || "";

  if (method === "GET" || method === "HEAD") {
    if (isModelsPath(path)) {
      return { body: undefined, method, path: `/v1/models${search}`, protocol: "openai" };
    }
    return undefined;
  }

  if (method !== "POST" && method !== "PUT" && method !== "PATCH") {
    return undefined;
  }

  if (isOpenAIChatPath(path)) {
    const routed = prepareOpenAIChatRequestBody(runtime, requestBody);
    return {
      body: routed.body,
      method,
      path: `/v1/chat/completions${search}`,
      protocol: "openai",
      skipRuntimeTargetHeaders: routed.routed
    };
  }
  if (isOpenAIResponsesPath(path)) {
    const routed = routeJsonRequestBody(runtime, requestBody);
    return {
      body: routed.body,
      method,
      path: `/v1/responses${search}`,
      protocol: "openai",
      skipRuntimeTargetHeaders: routed.routed
    };
  }
  if (isAnthropicMessagesPath(path)) {
    const routed = routeJsonRequestBody(runtime, requestBody);
    return {
      body: routed.body,
      method,
      path: `/v1/messages${search}`,
      protocol: "anthropic",
      skipRuntimeTargetHeaders: routed.routed
    };
  }
  if (isAnthropicCountTokensPath(path)) {
    const routed = routeJsonRequestBody(runtime, requestBody);
    return {
      body: routed.body,
      method,
      path: `/v1/messages/count_tokens${search}`,
      protocol: "anthropic",
      skipRuntimeTargetHeaders: routed.routed
    };
  }
  if (isGeminiPath(path)) {
    const routed = routeJsonRequestBody(runtime, requestBody);
    return {
      body: routed.body,
      method,
      path: `${path}${search}`,
      protocol: "gemini",
      skipRuntimeTargetHeaders: routed.routed
    };
  }

  if (runtime.cursorConnectJson && isCursorConnectJsonRequest(request.headers, path)) {
    const converted = convertCursorJsonToOpenAIChat(runtime, path, requestBody);
    if (converted) {
      const routingDecision = applyCursorProxyRouting(runtime, converted);
      return {
        body: Buffer.from(`${JSON.stringify(converted)}\n`, "utf8"),
        method: "POST",
        path: "/v1/chat/completions",
        protocol: "openai",
        skipRuntimeTargetHeaders: routingDecision.routed
      };
    }
  }

  return undefined;
}

function buildGatewayHeaders(runtime, sourceHeaders, route, body) {
  const headers = copyForwardHeaders(sourceHeaders);
  delete headers.host;
  delete headers.authorization;
  delete headers["x-api-key"];
  delete headers["content-length"];
  delete headers["content-encoding"];
  delete headers["accept-encoding"];
  for (const key of Object.keys(headers)) {
    if (key.startsWith(INTERNAL_HEADER_PREFIX)) {
      delete headers[key];
    }
  }

  headers["content-type"] = route.body ? (headers["content-type"] || "application/json") : "application/json";
  headers.accept = headers.accept || "*/*";
  headers["x-ccr-client"] = "Cursor";
  headers["x-ccr-cursor-proxy"] = "1";

  if (body) {
    headers["content-length"] = String(Buffer.byteLength(body));
  }
  if (runtime.gatewayApiKey) {
    headers.authorization = `Bearer ${runtime.gatewayApiKey}`;
    headers["x-api-key"] = runtime.gatewayApiKey;
  }
  const useRuntimeTargetHeaders = route.skipRuntimeTargetHeaders !== true;
  if (route.targetProvider || (useRuntimeTargetHeaders && runtime.targetProvider)) {
    headers["x-target-provider"] = route.targetProvider || runtime.targetProvider;
  }
  if (route.targetProviders || (useRuntimeTargetHeaders && runtime.targetProviders)) {
    headers["x-target-providers"] = route.targetProviders || runtime.targetProviders;
  }
  if (route.targetModel || (useRuntimeTargetHeaders && runtime.targetModel)) {
    headers["x-target-model"] = route.targetModel || runtime.targetModel;
  }

  if (route.protocol === "anthropic") {
    headers["anthropic-version"] = headers["anthropic-version"] || "2023-06-01";
  }

  return headers;
}

function buildPassthroughHeaders(sourceHeaders, originalUrl) {
  const headers = copyForwardHeaders(sourceHeaders);
  for (const key of Object.keys(headers)) {
    if (key.startsWith(INTERNAL_HEADER_PREFIX)) {
      delete headers[key];
    }
  }
  delete headers["content-length"];
  headers.host = originalUrl.host;
  return headers;
}

function logCursorPassthrough(runtime, method, path, headers) {
  const normalizedPath = normalizePath(path);
  const key = `${method} ${normalizedPath}`;
  const count = (runtime.passthroughLogCounts.get(key) || 0) + 1;
  runtime.passthroughLogCounts.set(key, count);
  if (count > runtime.passthroughLogLimit) {
    return;
  }

  const suffix = count === runtime.passthroughLogLimit
    ? "; suppressing repeated logs for this RPC"
    : "";
  runtime.logger?.debug?.(
    `Cursor proxy passing through non-chat Cursor RPC ${method} ${normalizedPath} ` +
    `(${readHeader(headers["content-type"]) || "no content-type"})${suffix}.`
  );
}

function copyForwardHeaders(sourceHeaders) {
  const headers = {};
  for (const [key, value] of Object.entries(sourceHeaders)) {
    const normalized = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalized) || value === undefined) {
      continue;
    }
    headers[normalized] = Array.isArray(value) ? value.join(",") : String(value);
  }
  return headers;
}

async function forwardToUrl({ body, headers, method, response, url }) {
  const targetUrl = url instanceof URL ? url : new URL(url);
  const transport = targetUrl.protocol === "https:" ? https : http;

  await new Promise((resolve) => {
    const upstreamRequest = transport.request(
      {
        headers,
        hostname: targetUrl.hostname,
        method,
        path: `${targetUrl.pathname}${targetUrl.search}`,
        port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
        protocol: targetUrl.protocol
      },
      (upstreamResponse) => {
        const statusCode = upstreamResponse.statusCode || 502;
        response.writeHead(statusCode, filterResponseHeaders(upstreamResponse.headers));
        upstreamResponse.pipe(response);
        upstreamResponse.once("end", resolve);
        upstreamResponse.once("error", (error) => {
          if (!response.headersSent) {
            sendJson(response, 502, { error: { message: formatError(error) } });
          } else {
            response.destroy(error);
          }
          resolve();
        });
      }
    );

    upstreamRequest.once("error", (error) => {
      if (!response.headersSent) {
        sendJson(response, 502, { error: { message: formatError(error) } });
      } else {
        response.destroy(error);
      }
      resolve();
    });
    upstreamRequest.setTimeout(120000, () => {
      upstreamRequest.destroy(new Error(`Cursor proxy upstream request to ${targetUrl.toString()} timed out.`));
    });

    if (body && Buffer.byteLength(body) > 0 && method !== "GET" && method !== "HEAD") {
      upstreamRequest.end(body);
    } else {
      upstreamRequest.end();
    }
  });
}

function convertCursorJsonToOpenAIChat(runtime, path, body) {
  const payload = unwrapCursorJson(readJsonLikePayload(body));
  if (!payload) {
    return undefined;
  }

  const messages = extractMessages(payload);
  if (messages.length === 0) {
    const prompt = findFirstStringByKeys(payload, ["prompt", "query", "instruction", "text"]);
    if (prompt) {
      messages.push({ content: prompt, role: "user" });
    }
  }
  if (messages.length === 0) {
    return undefined;
  }

  const systemPrompt = extractSystemPrompt(payload);
  if (systemPrompt && !messages.some((message) => message.role === "system")) {
    messages.unshift({ content: systemPrompt, role: "system" });
  }
  const compactedMessages = compactChatMessages(messages);
  if (compactedMessages.length === 0) {
    return undefined;
  }
  const tools = extractTools(payload);
  const toolChoice = extractToolChoice(payload);

  const model =
    findFirstStringByKeys(payload, ["model", "modelName", "selectedModel", "intentModel", "chatModel"]) ||
    runtime.defaultModel ||
    "cursor-proxy";
  const stream = path.toLowerCase().includes("stream") || Boolean(findFirstBooleanByKeys(payload, ["stream", "shouldStream"]));

  return compactObject({
    frequency_penalty: findFirstNumberByKeys(payload, ["frequency_penalty", "frequencyPenalty"]),
    max_tokens: findFirstNumberByKeys(payload, ["max_tokens", "maxTokens", "maxOutputTokens"]),
    messages: compactedMessages,
    model,
    presence_penalty: findFirstNumberByKeys(payload, ["presence_penalty", "presencePenalty"]),
    stream,
    temperature: findFirstNumberByKeys(payload, ["temperature"]),
    tool_choice: toolChoice,
    tools: tools.length > 0 ? tools : undefined,
    top_p: findFirstNumberByKeys(payload, ["top_p", "topP"])
  });
}

function extractMessages(value) {
  const candidates = [];
  const rootMessages = normalizeMessages(value);
  if (rootMessages.length > 0) {
    candidates.push(rootMessages);
  }
  walkJson(value, (item) => {
    if (!Array.isArray(item) || item.length === 0) {
      return;
    }
    const normalizedItems = item.map(normalizeMessages);
    const messages = normalizedItems.flat();
    const matchedItems = normalizedItems.filter((messagesForItem) => messagesForItem.length > 0).length;
    if (messages.length > 0 && matchedItems >= Math.ceil(item.length * 0.5)) {
      candidates.push(messages);
    }
  });
  candidates.sort((a, b) => scoreMessages(b) - scoreMessages(a));
  return candidates[0] || [];
}

function extractMessagesFromValues(values) {
  const candidates = [];
  for (const value of values) {
    const messages = extractMessages(value);
    if (messages.length > 0) {
      candidates.push(messages);
    }
  }
  candidates.sort((a, b) => scoreMessages(b) - scoreMessages(a));
  return [...(candidates[0] || [])];
}

function scoreMessages(messages) {
  return messages.length * 10 +
    messages.filter((message) => message.role === "system").length * 4 +
    messages.filter((message) => message.role === "tool").length * 3 +
    messages.filter((message) => Array.isArray(message.tool_calls) && message.tool_calls.length > 0).length * 3;
}

function normalizeMessages(value) {
  const messages = [];
  const message = normalizeMessage(value);
  if (message) {
    messages.push(message);
  }
  const toolResults = normalizeToolResultMessages(value);
  if (toolResults.length > 0) {
    messages.push(...toolResults);
  }
  return messages;
}

function normalizeMessage(value) {
  if (!isRecord(value)) {
    return undefined;
  }

  const role = normalizeRole(
    stringValue(value.role) ||
      stringValue(value.speaker) ||
      stringValue(value.author) ||
      stringValue(value.type) ||
      stringValue(value.kind)
  );
  if (!role) {
    return undefined;
  }

  const content = normalizeMessageContent(value);
  const toolCalls = normalizeToolCallsFromMessage(value);
  const functionCall = normalizeFunctionCall(value.function_call || value.functionCall);
  if (!hasChatMessageContent(content) && toolCalls.length === 0 && !functionCall) {
    return undefined;
  }

  return compactObject({
    content,
    function_call: functionCall,
    name: role === "tool" ? stringValue(value.name) || stringValue(value.toolName) || stringValue(value.functionName) : undefined,
    role,
    tool_call_id: role === "tool" ? toolCallIdFromRecord(value) : undefined,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined
  });
}

function normalizeRole(value) {
  if (!value) {
    return undefined;
  }
  const normalized = value.toLowerCase().replace(/^role_/, "").replace(/[-\s]+/g, "_");
  if (["customer", "human", "human_message", "request", "user", "user_message"].includes(normalized)) {
    return "user";
  }
  if (["agent", "ai", "assistant", "assistant_message", "bot", "model", "model_message"].includes(normalized)) {
    return "assistant";
  }
  if (["developer", "developer_message", "system", "system_message"].includes(normalized)) {
    return "system";
  }
  if (["function", "function_result", "tool", "tool_result", "tool_result_error", "tool_response"].includes(normalized)) {
    return "tool";
  }
  return undefined;
}

function normalizeMessageContent(value) {
  for (const key of [
    "bubbleText",
    "content",
    "displayText",
    "markdown",
    "message",
    "observation",
    "output",
    "plainText",
    "prompt",
    "rawText",
    "result",
    "text",
    "userMessage",
    "value",
    "error"
  ]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const content = normalizeContentValue(value[key]);
      if (hasChatMessageContent(content)) {
        return content;
      }
    }
  }
  return undefined;
}

function normalizeContentValue(value) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = [];
    const text = [];
    for (const item of value) {
      if (isToolCallContentBlock(item) || isToolResultContentBlock(item)) {
        continue;
      }
      const part = normalizeOpenAIContentPart(item);
      if (part) {
        parts.push(part);
        continue;
      }
      const itemText = stringifyContent(item);
      if (itemText) {
        text.push(itemText);
      }
    }
    if (parts.length > 0 && parts.every((part) => part.type === "text")) {
      return [...text, ...parts.map((part) => part.text)].filter(Boolean).join("\n");
    }
    if (parts.length > 0 && text.length === 0) {
      return parts;
    }
    if (parts.length > 0 || text.length > 0) {
      return [
        ...text.map((item) => ({ text: item, type: "text" })),
        ...parts
      ];
    }
    return undefined;
  }
  if (isRecord(value)) {
    if (isToolCallContentBlock(value) || isToolResultContentBlock(value)) {
      return undefined;
    }
    const part = normalizeOpenAIContentPart(value);
    if (part?.type === "text") {
      return part.text;
    }
    if (part) {
      return [part];
    }
    const text = stringifyContent(value);
    if (text) {
      return text;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function normalizeOpenAIContentPart(value) {
  if (!isRecord(value)) {
    return undefined;
  }
  const type = stringValue(value.type)?.toLowerCase();
  if ((type === "text" || type === "input_text") && typeof value.text === "string") {
    return { text: value.text, type: "text" };
  }
  if (type === "image_url" && (isRecord(value.image_url) || typeof value.image_url === "string")) {
    return {
      image_url: typeof value.image_url === "string" ? { url: value.image_url } : value.image_url,
      type: "image_url"
    };
  }
  if ((type === "image" || type === "input_image") && typeof value.url === "string") {
    return { image_url: { url: value.url }, type: "image_url" };
  }
  return undefined;
}

function normalizeToolCallsFromMessage(value) {
  const calls = [];
  for (const key of ["tool_calls", "toolCalls", "function_calls", "functionCalls", "calls"]) {
    calls.push(...normalizeToolCallList(value[key]));
  }
  calls.push(...normalizeToolCallList(value.tool_call || value.toolCall));
  if (Array.isArray(value.content)) {
    for (const block of value.content) {
      if (isToolCallContentBlock(block)) {
        calls.push(...normalizeToolCallList(block));
      }
    }
  }
  return uniqueToolCalls(calls);
}

function normalizeToolCallList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map(normalizeToolCall).filter(Boolean);
}

function normalizeToolCall(value, index) {
  const raw = unwrapToolCall(value);
  if (!isRecord(raw)) {
    return undefined;
  }
  const fn = isRecord(raw.function) ? raw.function : raw;
  const name =
    stringValue(fn.name) ||
    stringValue(raw.name) ||
    stringValue(raw.toolName) ||
    stringValue(raw.functionName);
  if (!name) {
    return undefined;
  }
  const args = firstDefined(fn.arguments, raw.arguments, fn.input, raw.input, raw.args, fn.parameters, raw.parameters);
  return {
    function: {
      arguments: normalizeToolArguments(args),
      name
    },
    id: stringValue(raw.id) || stringValue(raw.tool_call_id) || stringValue(raw.toolCallId) || stringValue(raw.callId) || `call_${index + 1}`,
    type: "function"
  };
}

function unwrapToolCall(value) {
  if (!isRecord(value)) {
    return value;
  }
  if (isRecord(value.toolCall)) {
    return value.toolCall;
  }
  if (isRecord(value.tool_call)) {
    return value.tool_call;
  }
  if (isRecord(value.functionCall)) {
    return value.functionCall;
  }
  if (isRecord(value.function_call)) {
    return value.function_call;
  }
  return value;
}

function normalizeFunctionCall(value) {
  if (!isRecord(value)) {
    return undefined;
  }
  const name = stringValue(value.name) || stringValue(value.functionName);
  if (!name) {
    return undefined;
  }
  return {
    arguments: normalizeToolArguments(firstDefined(value.arguments, value.input, value.args, value.parameters)),
    name
  };
}

function normalizeToolResultMessages(value) {
  if (!isRecord(value)) {
    return [];
  }
  const blocks = [];
  if (Array.isArray(value.content)) {
    blocks.push(...value.content);
  }
  if (isToolResultContentBlock(value)) {
    blocks.push(value);
  }
  return blocks.map(normalizeToolResultBlock).filter(Boolean);
}

function normalizeToolResultBlock(value) {
  const raw = unwrapToolResult(value);
  if (!isRecord(raw)) {
    return undefined;
  }
  const toolCallId = toolCallIdFromRecord(raw) || stringValue(raw.tool_use_id) || stringValue(raw.toolUseId);
  const name = stringValue(raw.name) || stringValue(raw.toolName) || stringValue(raw.functionName);
  const content = normalizeContentValue(firstDefined(raw.content, raw.result, raw.output, raw.text, raw.error)) || "";
  if (!toolCallId && !name) {
    return undefined;
  }
  return compactObject({
    content,
    name,
    role: "tool",
    tool_call_id: toolCallId
  });
}

function unwrapToolResult(value) {
  if (!isRecord(value)) {
    return value;
  }
  if (isRecord(value.toolResult)) {
    return value.toolResult;
  }
  if (isRecord(value.tool_result)) {
    return value.tool_result;
  }
  return value;
}

function isToolCallContentBlock(value) {
  const raw = unwrapToolCall(value);
  if (!isRecord(raw)) {
    return false;
  }
  const type = stringValue(raw.type)?.toLowerCase().replace(/[-\s]+/g, "_");
  return Boolean(
    type === "tool_call" ||
    type === "tool_use" ||
    type === "function_call" ||
    isRecord(value.toolCall) ||
    isRecord(value.tool_call) ||
    isRecord(value.functionCall) ||
    isRecord(value.function_call)
  );
}

function isToolResultContentBlock(value) {
  const raw = unwrapToolResult(value);
  if (!isRecord(raw)) {
    return false;
  }
  const type = stringValue(raw.type)?.toLowerCase().replace(/[-\s]+/g, "_");
  return Boolean(
    type === "tool_result" ||
    type === "tool_result_error" ||
    type === "function_result" ||
    isRecord(value.toolResult) ||
    isRecord(value.tool_result)
  );
}

function toolCallIdFromRecord(value) {
  return stringValue(value.tool_call_id) ||
    stringValue(value.toolCallId) ||
    stringValue(value.callId) ||
    stringValue(value.id);
}

function uniqueToolCalls(calls) {
  const result = [];
  const seen = new Set();
  for (const call of calls) {
    const key = call.id || `${call.function?.name}:${call.function?.arguments}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(call);
  }
  return result;
}

function normalizeToolArguments(value) {
  if (typeof value === "string") {
    return value.trim() || "{}";
  }
  if (value === undefined) {
    return "{}";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

function stringifyContent(value) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(stringifyContent).filter(Boolean).join("\n");
  }
  if (isRecord(value)) {
    if (typeof value.text === "string") {
      return value.text;
    }
    if (typeof value.content === "string") {
      return value.content;
    }
    if (typeof value.markdown === "string") {
      return value.markdown;
    }
    if (typeof value.value === "string") {
      return value.value;
    }
  }
  return undefined;
}

function extractSystemPrompt(value) {
  return findFirstByKeys(value, CURSOR_SYSTEM_PROMPT_KEYS, stringifyPromptCandidate);
}

function extractSystemPromptFromValues(values) {
  for (const value of values) {
    const systemPrompt = extractSystemPrompt(value);
    if (systemPrompt) {
      return systemPrompt;
    }
  }
  return undefined;
}

function selectPreferredSystemPrompt(...candidates) {
  for (const candidate of candidates) {
    const content = typeof candidate === "string" ? candidate.trim() : "";
    if (!content || isLikelyCursorInstructionText(content) || looksLikeCursorToolDescriptionText(content)) {
      continue;
    }
    return content;
  }
  return undefined;
}

function composeAgentSystemPrompt(values, preferredSystemPrompt) {
  const sections = [];
  const toolDescriptionFingerprints = new Set(
    extractToolsFromValues(values)
      .map((tool) => normalizePromptFingerprint(tool?.function?.description || tool?.description))
      .filter(Boolean)
  );
  const addSection = (text) => {
    const content = typeof text === "string" ? text.trim() : "";
    if (!content || looksLikeNoiseString(content) || isCursorMcpToolFilePath(content)) {
      return;
    }
    if (looksLikeCursorToolDescriptionText(content) || toolDescriptionFingerprints.has(normalizePromptFingerprint(content))) {
      return;
    }
    if (sections.some((item) => normalizePromptFingerprint(item) === normalizePromptFingerprint(content))) {
      return;
    }
    sections.push(content);
  };

  addSection(preferredSystemPrompt);

  const workspaceContext = composeCursorWorkspaceContext(values);
  if (workspaceContext) {
    addSection(workspaceContext);
  }

  if (sections.length === 0) {
    return undefined;
  }
  return truncateComposedSystemPrompt(sections.join("\n\n---\n\n"));
}

function extractCursorInstructionTexts(values) {
  const instructions = [];
  const addInstruction = (text) => {
    const content = typeof text === "string" ? text.trim() : "";
    if (!content || !isLikelyCursorInstructionText(content)) {
      return;
    }
    if (instructions.some((item) => normalizePromptFingerprint(item) === normalizePromptFingerprint(content))) {
      return;
    }
    instructions.push(content);
  };

  for (const value of Array.isArray(values) ? values : [values]) {
    if (typeof value !== "string") {
      continue;
    }
    addInstruction(value);
  }

  for (const filePath of extractCursorInstructionFilePaths(values)) {
    const content = readTextFileIfSmall(filePath, 128 * 1024);
    if (content) {
      addInstruction(content);
    }
  }

  return instructions
    .sort((left, right) => scoreCursorInstructionText(right) - scoreCursorInstructionText(left))
    .slice(0, 12);
}

function extractCursorInstructionFilePaths(values) {
  const result = [];
  const seen = new Set();
  const addPath = (filePath) => {
    const normalized = typeof filePath === "string" ? filePath.trim() : "";
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(normalized);
  };

  for (const toolPath of extractCursorToolFilePaths(values)) {
    const marker = "/tools/";
    const markerIndex = toolPath.lastIndexOf(marker);
    if (markerIndex > 0) {
      addPath(`${toolPath.slice(0, markerIndex)}/INSTRUCTIONS.md`);
    }
  }

  for (const value of Array.isArray(values) ? values : [values]) {
    if (typeof value !== "string") {
      continue;
    }
    if (/\/mcps\/[^/]+\/INSTRUCTIONS\.md$/.test(value.trim())) {
      addPath(value.trim());
    }
    for (const match of value.matchAll(/\/[^\s"'`<>]+\/mcps\/[^\s"'`<>]+\/INSTRUCTIONS\.md/g)) {
      addPath(match[0]);
    }
  }
  return result;
}

function isLikelyCursorInstructionText(value) {
  const text = String(value || "").trim();
  if (text.length < 250 || text.length > 120000 || looksLikeNoiseString(text) || looksLikeJsonText(text)) {
    return false;
  }
  if (isCursorMcpToolFilePath(text) || looksLikeGitStatusText(text)) {
    return false;
  }
  return /\bMCP\b|\bCORE WORKFLOW\b|\bCDP USAGE\b|\bCRITICAL\b|\bYou MUST\b|\bUse [a-zA-Z0-9_]+ when\b|\ballows you to\b|A Cursor Canvas/.test(text);
}

function scoreCursorInstructionText(value) {
  const text = String(value || "");
  let score = Math.min(text.length, 10000) / 100;
  if (/\bMCP\b/.test(text)) {
    score += 50;
  }
  if (/\bCORE WORKFLOW\b|\bCDP USAGE\b/.test(text)) {
    score += 35;
  }
  if (/A Cursor Canvas/.test(text)) {
    score += 25;
  }
  if (/\bUse [a-zA-Z0-9_]+ when\b/.test(text)) {
    score += 20;
  }
  return score;
}

function composeCursorWorkspaceContext(values) {
  const strings = (Array.isArray(values) ? values : [values]).filter((value) => typeof value === "string");
  const workspaceRoot = strings.find((value) =>
    /^\/.+/.test(value) &&
    !value.includes("/.cursor/") &&
    !value.includes("/mcps/") &&
    !value.endsWith(".json") &&
    value.length < 500
  );
  const os = strings.find((value) => /^(?:darwin|linux|win32)\s+\S+/i.test(value.trim()));
  const shell = strings.find((value) => /^(?:zsh|bash|fish|pwsh|powershell|cmd)$/i.test(value.trim()));
  const timezone = strings.find((value) => /^[A-Za-z_]+\/[A-Za-z0-9_+\-]+$/.test(value.trim()));
  const gitStatus = strings.find(looksLikeGitStatusText);
  const lines = [];
  if (workspaceRoot) {
    lines.push(`Workspace root: ${workspaceRoot}`);
  }
  if (os) {
    lines.push(`OS: ${os.trim()}`);
  }
  if (shell) {
    lines.push(`Shell: ${shell.trim()}`);
  }
  if (timezone) {
    lines.push(`Timezone: ${timezone.trim()}`);
  }
  if (gitStatus) {
    lines.push(`Git status:\n${gitStatus.trim()}`);
  }
  return lines.length > 0 ? `Cursor workspace context:\n${lines.join("\n")}` : "";
}

function looksLikeGitStatusText(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 20000) {
    return false;
  }
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return false;
  }
  return lines.filter((line) => /^(?:[ MADRCU?!]{1,2}|\?\?)\s+/.test(line)).length >= Math.ceil(lines.length * 0.5);
}

function truncateComposedSystemPrompt(value) {
  const maxLength = 32000;
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n\n[Cursor context truncated at ${maxLength} characters]` : value;
}

function readTextFileIfSmall(filePath, maxBytes) {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return "";
    }
    const stat = fs.statSync(filePath);
    if (stat.size > maxBytes) {
      return "";
    }
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function stringifyPromptCandidate(value) {
  const content = normalizeContentValue(value);
  if (typeof content === "string") {
    return content.trim() || undefined;
  }
  if (Array.isArray(content)) {
    const text = stringifyContent(content).trim();
    return text || undefined;
  }
  return undefined;
}

function extractCursorNativeToolsFromValues(values) {
  const names = extractCursorNativeToolNames(values);
  return names.map((name) => cursorNativeToolSpecToOpenAITool(lookupCursorNativeToolSpec(name))).filter(Boolean);
}

function extractCursorNativeToolsFromRunRequest(runtime, runRequest, values, systemPrompt) {
  const extraction = describeCursorNativeToolExtraction(runtime, runRequest, values, systemPrompt);
  return extraction.names.map((name) => cursorNativeToolSpecToOpenAITool(lookupCursorNativeToolSpec(name))).filter(Boolean);
}

function describeCursorNativeToolExtraction(runtime, runRequest, values, systemPrompt) {
  const sourceValues = [...(Array.isArray(values) ? values : [values]), systemPrompt].filter(Boolean);
  const textNames = extractCursorNativeToolNames(sourceValues);
  const nativeSupportedTools = extractCursorSupportedToolEnums(runRequest);
  const enumNames = nativeSupportedTools
    .map((item) => CURSOR_NATIVE_SUPPORTED_TOOL_TO_SPEC_NAME.get(item.value))
    .filter(Boolean);
  const fallbackApplied = shouldForwardCursorNativeBuiltinTools(runtime) &&
    enumNames.length === 0 &&
    hasCursorWorkspaceContext(values);
  const names = uniqueStrings([
    ...textNames,
    ...enumNames,
    ...(fallbackApplied ? CURSOR_NATIVE_BUILTIN_TOOL_NAMES : [])
  ]);
  const unsupportedBuiltins = CURSOR_NATIVE_BUILTIN_TOOL_NAMES.filter((name) => !lookupCursorNativeToolSpec(name));
  return {
    enumNames: uniqueStrings(enumNames),
    enumValues: summarizeCursorSupportedToolEnums(runtime, nativeSupportedTools),
    fallbackApplied,
    fallbackReason: fallbackApplied
      ? "AgentRunRequest exposed workspace context and MCP descriptors but no Cursor native tool enum list"
      : undefined,
    forwardCursorNativeBuiltinTools: shouldForwardCursorNativeBuiltinTools(runtime),
    hasWorkspaceContext: hasCursorWorkspaceContext(values),
    names,
    textNames: uniqueStrings(textNames),
    unsupportedBuiltins
  };
}

function shouldForwardCursorNativeBuiltinTools(runtime) {
  return runtime?.forwardCursorNativeBuiltinTools !== false;
}

function hasCursorWorkspaceContext(values) {
  return Boolean(composeCursorWorkspaceContext(values));
}

function extractCursorSupportedToolEnums(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return [];
  }
  const results = [];
  const seenBuffers = new Set();
  collectCursorSupportedToolEnums(buffer, "", 0, seenBuffers, results);
  const seenValues = new Set();
  return results.filter((item) => {
    const key = `${item.path}:${item.value}`;
    if (seenValues.has(key)) {
      return false;
    }
    seenValues.add(key);
    return true;
  });
}

function collectCursorSupportedToolEnums(buffer, currentPath, depth, seenBuffers, results) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || depth > 14) {
    return;
  }
  const key = `${buffer.length}:${buffer.subarray(0, 24).toString("hex")}`;
  if (seenBuffers.has(key)) {
    return;
  }
  seenBuffers.add(key);

  forEachProtoField(buffer, (field) => {
    const fieldPath = currentPath ? `${currentPath}.${field.fieldNumber}` : String(field.fieldNumber);
    if (CURSOR_NATIVE_SUPPORTED_TOOL_FIELDS.has(field.fieldNumber)) {
      for (const value of decodeCursorSupportedToolEnumField(field)) {
        const name = CURSOR_NATIVE_SUPPORTED_TOOL_ENUM_NAMES.get(value);
        if (name) {
          results.push({
            name,
            path: fieldPath,
            value
          });
        }
      }
    }
    if (field.wireType === 2 && shouldRecurseIntoCursorProtoField(field.value, depth)) {
      collectCursorSupportedToolEnums(field.value, fieldPath, depth + 1, seenBuffers, results);
    }
  });
}

function decodeCursorSupportedToolEnumField(field) {
  if (field.wireType === 0) {
    return [Number(field.value)].filter((value) => CURSOR_NATIVE_SUPPORTED_TOOL_ENUM_NAMES.has(value));
  }
  if (field.wireType !== 2 || field.value.length === 0) {
    return [];
  }
  const values = decodePackedCursorSupportedToolEnums(field.value);
  return values.length > 0 ? values : [];
}

function decodePackedCursorSupportedToolEnums(buffer) {
  const values = [];
  let offset = 0;
  while (offset < buffer.length) {
    const value = readProtoVarint(buffer, offset);
    if (!value) {
      return [];
    }
    offset = value.offset;
    const number = Number(value.value);
    if (!CURSOR_NATIVE_SUPPORTED_TOOL_ENUM_NAMES.has(number)) {
      return [];
    }
    values.push(number);
  }
  return values;
}

function shouldRecurseIntoCursorProtoField(buffer, depth) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || depth >= 14) {
    return false;
  }
  if (looksLikeTextBuffer(buffer) && !hasReadableProtoFields(buffer)) {
    return false;
  }
  return true;
}

function summarizeCursorSupportedToolEnums(runtime, tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return [];
  }
  return tools.slice(0, decodeDiagnosticSampleLimit(runtime)).map((item) => ({
    name: item.name,
    path: item.path,
    tool: CURSOR_NATIVE_SUPPORTED_TOOL_TO_SPEC_NAME.get(item.value),
    value: item.value
  }));
}

function extractCursorNativeToolNames(values) {
  const names = new Set();
  const text = (Array.isArray(values) ? values : [values])
    .filter((value) => typeof value === "string")
    .join("\n");
  for (const spec of cursorNativeToolSpecs()) {
    for (const alias of [spec.name, ...(spec.aliases || [])]) {
      if (new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(alias)}([^A-Za-z0-9_]|$)`).test(text)) {
        names.add(spec.name);
        break;
      }
    }
  }
  return [...names];
}

function cursorNativeToolSpecToOpenAITool(spec) {
  if (!spec) {
    return undefined;
  }
  return {
    function: {
      description: spec.description,
      name: spec.name,
      parameters: spec.parameters
    },
    type: "function"
  };
}

function lookupCursorNativeToolSpec(name) {
  const normalized = normalizeToolBridgeName(name);
  return cursorNativeToolSpecs().find((spec) =>
    normalizeToolBridgeName(spec.name) === normalized ||
    (spec.aliases || []).some((alias) => normalizeToolBridgeName(alias) === normalized)
  );
}

function cursorNativeToolSpecs() {
  return [
    {
      aliases: ["Read", "read", "readFile"],
      description: "Read a file through Cursor's native read_file tool. Use this for known project files.",
      encodeArgs: encodeCursorNativeReadArgs,
      name: "read_file",
      parameters: {
        additionalProperties: false,
        properties: {
          include_line_numbers: { type: "boolean" },
          limit: { type: "integer" },
          offset: { type: "integer" },
          path: { type: "string" }
        },
        required: ["path"],
        type: "object"
      },
      toolCallField: 8
    },
    {
      aliases: ["Ls", "ListDir", "list_directory", "ls"],
      description: "List a directory through Cursor's native list_dir tool.",
      encodeArgs: encodeCursorNativeLsArgs,
      name: "list_dir",
      parameters: {
        additionalProperties: false,
        properties: {
          ignore: { items: { type: "string" }, type: "array" },
          path: { type: "string" }
        },
        required: ["path"],
        type: "object"
      },
      toolCallField: 13
    },
    {
      aliases: ["Grep", "grep", "ripgrep_search", "ripgrep_raw_search"],
      description: "Search exact text or regular expressions through Cursor's native grep_search tool.",
      encodeArgs: encodeCursorNativeGrepArgs,
      name: "grep_search",
      parameters: {
        additionalProperties: false,
        properties: {
          case_insensitive: { type: "boolean" },
          context: { type: "integer" },
          context_after: { type: "integer" },
          context_before: { type: "integer" },
          glob: { type: "string" },
          head_limit: { type: "integer" },
          multiline: { type: "boolean" },
          offset: { type: "integer" },
          output_mode: { type: "string" },
          path: { type: "string" },
          pattern: { type: "string" },
          sort: { type: "string" },
          sort_ascending: { type: "boolean" },
          type: { type: "string" }
        },
        required: ["pattern"],
        type: "object"
      },
      toolCallField: 5
    },
    {
      aliases: ["Glob", "glob", "file_search", "FileSearch"],
      description: "Find files by glob pattern through Cursor's native glob/file search tool.",
      encodeArgs: encodeCursorNativeGlobArgs,
      name: "glob_file_search",
      parameters: {
        additionalProperties: false,
        properties: {
          glob_pattern: { type: "string" },
          pattern: { type: "string" },
          target_directory: { type: "string" }
        },
        required: ["glob_pattern"],
        type: "object"
      },
      toolCallField: 4
    },
    {
      aliases: ["SemanticSearch", "semantic_search", "sem_search"],
      description: "Run Cursor's native semantic codebase search tool.",
      encodeArgs: encodeCursorNativeSemSearchArgs,
      name: "codebase_search",
      parameters: {
        additionalProperties: false,
        properties: {
          explanation: { type: "string" },
          query: { type: "string" },
          target_directories: { items: { type: "string" }, type: "array" }
        },
        required: ["query"],
        type: "object"
      },
      toolCallField: 16
    },
    {
      aliases: ["Shell", "run_terminal_cmd", "run_terminal_command", "run_terminal_command_v2"],
      description: "Run a shell command through Cursor's native shell tool.",
      encodeArgs: encodeCursorNativeShellArgs,
      name: "shell",
      parameters: {
        additionalProperties: false,
        properties: {
          close_stdin: { type: "boolean" },
          command: { type: "string" },
          description: { type: "string" },
          hard_timeout: { type: "integer" },
          is_background: { type: "boolean" },
          simple_commands: { items: { type: "string" }, type: "array" },
          skip_approval: { type: "boolean" },
          timeout: { type: "integer" },
          timeout_behavior: { enum: ["cancel", "background"], type: "string" },
          working_directory: { type: "string" }
        },
        required: ["command"],
        type: "object"
      },
      toolCallField: 1
    },
    {
      aliases: ["Delete", "delete", "delete_file"],
      description: "Delete a file through Cursor's native delete tool.",
      encodeArgs: encodeCursorNativeDeleteArgs,
      name: "delete_file",
      parameters: {
        additionalProperties: false,
        properties: {
          path: { type: "string" }
        },
        required: ["path"],
        type: "object"
      },
      toolCallField: 3
    },
    {
      aliases: ["Edit", "edit", "edit_file"],
      description: "Apply a full-file edit through Cursor's native edit tool.",
      encodeArgs: encodeCursorNativeEditArgs,
      name: "edit_file",
      parameters: {
        additionalProperties: false,
        properties: {
          content: { type: "string" },
          path: { type: "string" },
          stream_content: { type: "string" }
        },
        required: ["path", "content"],
        type: "object"
      },
      toolCallField: 12
    },
    {
      aliases: ["ReadLints", "read_lints"],
      description: "Read linter diagnostics through Cursor's native read_lints tool.",
      encodeArgs: encodeCursorNativeReadLintsArgs,
      name: "read_lints",
      parameters: {
        additionalProperties: false,
        properties: {
          paths: { items: { type: "string" }, type: "array" }
        },
        required: ["paths"],
        type: "object"
      },
      toolCallField: 14
    },
    {
      aliases: ["WebSearch", "web_search"],
      description: "Run a web search through Cursor's native web_search tool.",
      encodeArgs: encodeCursorNativeWebSearchArgs,
      name: "web_search",
      parameters: {
        additionalProperties: false,
        properties: {
          query: { type: "string" },
          search_term: { type: "string" }
        },
        required: ["query"],
        type: "object"
      },
      toolCallField: 18
    },
    {
      aliases: ["WebFetch", "web_fetch", "fetch_url"],
      description: "Fetch and convert a web page through Cursor's native web_fetch tool.",
      encodeArgs: encodeCursorNativeUrlArgs,
      name: "web_fetch",
      parameters: {
        additionalProperties: false,
        properties: {
          url: { type: "string" }
        },
        required: ["url"],
        type: "object"
      },
      toolCallField: 37
    },
    {
      aliases: ["Task", "task"],
      description: "Start a Cursor native subagent task.",
      encodeArgs: encodeCursorNativeTaskArgs,
      name: "task",
      parameters: {
        additionalProperties: false,
        properties: {
          agent_id: { type: "string" },
          attachments: { items: { type: "string" }, type: "array" },
          description: { type: "string" },
          model: { type: "string" },
          prompt: { type: "string" },
          resume: { type: "string" }
        },
        required: ["description", "prompt"],
        type: "object"
      },
      toolCallField: 19
    },
    {
      aliases: ["Await", "await", "await_task"],
      description: "Await a Cursor native background task.",
      encodeArgs: encodeCursorNativeAwaitArgs,
      name: "await_task",
      parameters: {
        additionalProperties: false,
        properties: {
          block_until_ms: { type: "integer" },
          regex: { type: "string" },
          task_id: { type: "string" }
        },
        required: ["task_id"],
        type: "object"
      },
      toolCallField: 42
    },
    {
      aliases: ["TodoRead", "ReadTodos", "todo_read"],
      description: "Read Cursor's native todo list.",
      encodeArgs: encodeCursorNativeReadTodosArgs,
      name: "todo_read",
      parameters: {
        additionalProperties: false,
        properties: {
          id_filter: { items: { type: "string" }, type: "array" },
          status_filter: {
            items: { enum: ["pending", "in_progress", "completed", "cancelled"], type: "string" },
            type: "array"
          }
        },
        type: "object"
      },
      toolCallField: 10
    },
    {
      aliases: ["TodoWrite", "todo_write"],
      description: "Update Cursor's native todo list.",
      encodeArgs: encodeCursorNativeUpdateTodosArgs,
      name: "todo_write",
      parameters: {
        additionalProperties: false,
        properties: {
          merge: { type: "boolean" },
          todos: {
            items: {
              additionalProperties: false,
              properties: {
                content: { type: "string" },
                dependencies: { items: { type: "string" }, type: "array" },
                id: { type: "string" },
                status: { enum: ["pending", "in_progress", "completed", "cancelled"], type: "string" }
              },
              required: ["content", "status"],
              type: "object"
            },
            type: "array"
          }
        },
        required: ["todos"],
        type: "object"
      },
      toolCallField: 9
    },
    {
      aliases: ["AskQuestion", "ask_question"],
      description: "Ask the user a structured question through Cursor.",
      encodeArgs: encodeCursorNativeAskQuestionArgs,
      name: "ask_question",
      parameters: {
        additionalProperties: false,
        properties: {
          questions: {
            items: {
              additionalProperties: false,
              properties: {
                allow_multiple: { type: "boolean" },
                id: { type: "string" },
                options: {
                  items: {
                    additionalProperties: false,
                    properties: {
                      id: { type: "string" },
                      label: { type: "string" }
                    },
                    required: ["id", "label"],
                    type: "object"
                  },
                  type: "array"
                },
                prompt: { type: "string" }
              },
              required: ["id", "prompt"],
              type: "object"
            },
            type: "array"
          },
          run_async: { type: "boolean" },
          title: { type: "string" }
        },
        required: ["title", "questions"],
        type: "object"
      },
      toolCallField: 23
    },
    {
      aliases: ["SwitchMode", "switch_mode"],
      description: "Switch Cursor agent mode.",
      encodeArgs: encodeCursorNativeSwitchModeArgs,
      name: "switch_mode",
      parameters: {
        additionalProperties: false,
        properties: {
          explanation: { type: "string" },
          target_mode_id: { type: "string" }
        },
        required: ["target_mode_id"],
        type: "object"
      },
      toolCallField: 25
    },
    {
      aliases: ["GenerateImage", "generate_image"],
      description: "Generate an image through Cursor's native generate_image tool.",
      encodeArgs: encodeCursorNativeGenerateImageArgs,
      name: "generate_image",
      parameters: {
        additionalProperties: false,
        properties: {
          description: { type: "string" },
          file_path: { type: "string" },
          reference_image_paths: { items: { type: "string" }, type: "array" }
        },
        required: ["description"],
        type: "object"
      },
      toolCallField: 28
    },
    {
      aliases: ["ListMcpResources", "list_mcp_resources"],
      description: "List MCP resources through Cursor.",
      encodeArgs: encodeCursorNativeListMcpResourcesArgs,
      name: "list_mcp_resources",
      parameters: {
        additionalProperties: false,
        properties: {
          server: { type: "string" }
        },
        type: "object"
      },
      toolCallField: 20
    },
    {
      aliases: ["FetchMcpResource", "ReadMcpResource", "read_mcp_resource"],
      description: "Fetch an MCP resource through Cursor.",
      encodeArgs: encodeCursorNativeReadMcpResourceArgs,
      name: "read_mcp_resource",
      parameters: {
        additionalProperties: false,
        properties: {
          download_path: { type: "string" },
          server: { type: "string" },
          uri: { type: "string" }
        },
        required: ["server", "uri"],
        type: "object"
      },
      toolCallField: 21
    },
    {
      aliases: ["GetMcpTools", "get_mcp_tools"],
      description: "Discover MCP tool schemas through Cursor.",
      encodeArgs: encodeCursorNativeGetMcpToolsArgs,
      name: "get_mcp_tools",
      parameters: {
        additionalProperties: false,
        properties: {
          pattern: { type: "string" },
          server: { type: "string" },
          tool_name: { type: "string" }
        },
        type: "object"
      },
      toolCallField: 44
    },
    {
      aliases: ["CallMcpTool", "call_mcp_tool"],
      description: "Call an MCP tool through Cursor's native MCP bridge.",
      encodeArgs: encodeCursorNativeCallMcpToolArgs,
      name: "call_mcp_tool",
      parameters: {
        additionalProperties: false,
        properties: {
          arguments: { additionalProperties: true, type: "object" },
          args: { additionalProperties: true, type: "object" },
          server: { type: "string" },
          tool_name: { type: "string" }
        },
        required: ["server", "tool_name"],
        type: "object"
      },
      toolCallField: 15
    },
    {
      aliases: ["SetActiveBranch", "set_active_branch"],
      description: "Set Cursor's active branch metadata.",
      encodeArgs: encodeCursorNativeSetActiveBranchArgs,
      name: "set_active_branch",
      parameters: {
        additionalProperties: false,
        properties: {
          branch_name: { type: "string" },
          path: { type: "string" }
        },
        required: ["path", "branch_name"],
        type: "object"
      },
      toolCallField: 46
    }
  ];
}

function extractToolsFromValues(values) {
  const tools = [];
  for (const value of values) {
    tools.push(...extractTools(value));
  }
  tools.push(...extractToolsFromCursorToolFiles(values));
  return uniqueTools(tools);
}

function extractTools(value) {
  const tools = [];
  if (typeof value === "string") {
    tools.push(...extractToolsFromCursorToolFiles([value]));
    return uniqueTools(tools);
  }
  const keySet = new Set(CURSOR_TOOL_KEYS.map((key) => key.toLowerCase()));
  walkJson(value, (item) => {
    if (!isRecord(item)) {
      return;
    }
    for (const [key, rawValue] of Object.entries(item)) {
      if (!keySet.has(key.toLowerCase())) {
        continue;
      }
      tools.push(...normalizeToolList(rawValue));
    }
  });
  return uniqueTools(tools);
}

function extractToolsFromCursorToolFiles(values) {
  const tools = [];
  for (const filePath of extractCursorToolFilePaths(values)) {
    const tool = readCursorToolDefinition(filePath);
    if (tool) {
      tools.push(tool);
    }
  }
  return uniqueTools(tools);
}

function extractCursorToolFilePaths(values) {
  const result = [];
  const seen = new Set();
  const addPath = (value) => {
    const filePath = normalizeCursorMcpFilePath(value);
    if (!filePath || seen.has(filePath)) {
      return;
    }
    seen.add(filePath);
    result.push(filePath);
  };

  for (const value of Array.isArray(values) ? values : [values]) {
    if (typeof value !== "string") {
      continue;
    }
    addPath(value);
    for (const match of value.matchAll(/\/[^\s"'`<>]+\/mcps\/[^\s"'`<>]+\/tools\/[^\s"'`<>]+\.json/g)) {
      addPath(match[0]);
    }
  }
  return result;
}

function normalizeCursorMcpFilePath(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || !text.includes("/mcps/") || !text.endsWith(".json")) {
    return "";
  }
  if (!/\/mcps\/[^/]+\/tools\/[^/]+\.json$/.test(text)) {
    return "";
  }
  return text;
}

function isCursorMcpToolFilePath(value) {
  return Boolean(normalizeCursorMcpFilePath(value));
}

function readCursorToolDefinition(filePath) {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return undefined;
    }
    const parsed = readJsonText(fs.readFileSync(filePath, "utf8"));
    if (!isRecord(parsed)) {
      return undefined;
    }
    return normalizeTool(parsed);
  } catch {
    return undefined;
  }
}

function normalizeToolList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeTool(item)).filter(Boolean);
  }
  if (isRecord(value)) {
    return Object.entries(value).map(([name, item]) => {
      if (!isRecord(item)) {
        return normalizeTool({ description: stringifyContent(item), name });
      }
      const tool = { ...item };
      if (!stringValue(tool.name)) {
        tool.name = name;
      }
      return normalizeTool(tool);
    }).filter(Boolean);
  }
  return [];
}

function normalizeConfiguredTools(value) {
  if (isRecord(value) && (Array.isArray(value.tools) || isRecord(value.tools))) {
    return normalizeToolList(value.tools);
  }
  return normalizeToolList(value);
}

function normalizeTool(value) {
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

  const parameters = normalizeToolParameters(firstDefined(
    fn.parameters,
    value.parameters,
    fn.arguments,
    value.arguments,
    fn.input_schema,
    value.input_schema,
    fn.inputSchema,
    value.inputSchema,
    fn.schema,
    value.schema
  ));
  return {
    function: compactObject({
      description: stringValue(fn.description) || stringValue(value.description),
      name,
      parameters
    }),
    type: "function"
  };
}

function normalizeToolParameters(value) {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = readJsonText(value);
    if (isRecord(parsed)) {
      return parsed;
    }
  }
  return { properties: {}, type: "object" };
}

function uniqueTools(tools) {
  const result = [];
  const seen = new Set();
  for (const tool of tools) {
    const key = tool.type === "function" ? `function:${tool.function?.name || ""}` : `${tool.type}:${tool.name || ""}`;
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(tool);
  }
  return result;
}

function extractToolChoiceFromValues(values) {
  for (const value of values) {
    const toolChoice = extractToolChoice(value);
    if (toolChoice !== undefined) {
      return toolChoice;
    }
  }
  return undefined;
}

function extractToolChoice(value) {
  return findFirstByKeys(value, CURSOR_TOOL_CHOICE_KEYS, normalizeToolChoice);
}

function normalizeToolChoice(value) {
  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim().toLowerCase();
    if (["auto", "none", "required"].includes(normalized)) {
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

function decodeJsonPayloadsFromProtoStrings(buffer) {
  const payloads = [];
  for (const item of decodeAllProtoStrings(buffer)) {
    const parsed = readJsonText(item.value);
    if (parsed !== undefined) {
      payloads.push(parsed);
    }
  }
  return payloads;
}

function decodeAgentRunRequestContextValues(buffer) {
  const values = [];
  for (const item of decodeAllProtoStrings(buffer)) {
    const text = typeof item.value === "string" ? item.value.trim() : "";
    if (!text || looksLikeNoiseString(text)) {
      continue;
    }
    values.push(text);
    const parsed = readJsonText(text);
    if (parsed !== undefined) {
      values.push(parsed);
    }
    values.push(...decodeEmbeddedStringValues(text));
  }
  return uniqueDecodedValues(values);
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

function readJsonLikePayload(body) {
  if (!body || body.length === 0) {
    return undefined;
  }
  const text = body.toString("utf8").trim();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) {
        continue;
      }
      try {
        return JSON.parse(trimmed);
      } catch {
        // Try the next line.
      }
    }
  }
  return undefined;
}

function unwrapCursorJson(value) {
  if (!isRecord(value)) {
    return value;
  }
  if (isRecord(value.message)) {
    return value.message;
  }
  if (isRecord(value.request)) {
    return value.request;
  }
  if (isRecord(value.payload)) {
    return value.payload;
  }
  return value;
}

function findFirstStringByKeys(value, keys) {
  return findFirstByKeys(value, keys, (item) => typeof item === "string" && item.trim() ? item.trim() : undefined);
}

function findFirstStringFromValues(values, keys) {
  for (const value of values) {
    const found = findFirstStringByKeys(value, keys);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function findStringValuesByKeys(value, keys) {
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  const found = [];
  walkJson(value, (item) => {
    if (!isRecord(item)) {
      return;
    }
    for (const [key, rawValue] of Object.entries(item)) {
      if (keySet.has(key.toLowerCase()) && typeof rawValue === "string" && rawValue.trim()) {
        found.push(rawValue.trim());
      }
    }
  });
  return found;
}

function findFirstNumberByKeys(value, keys) {
  return findFirstByKeys(value, keys, (item) => {
    const number = Number(item);
    return Number.isFinite(number) ? number : undefined;
  });
}

function findFirstNumberFromValues(values, keys) {
  for (const value of values) {
    const found = findFirstNumberByKeys(value, keys);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function findFirstBooleanByKeys(value, keys) {
  return findFirstByKeys(value, keys, (item) => typeof item === "boolean" ? item : undefined);
}

function findFirstBooleanFromValues(values, keys) {
  for (const value of values) {
    const found = findFirstBooleanByKeys(value, keys);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function findBestSystemPromptStringFromValues(values) {
  return values
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) =>
      looksLikeSystemPromptText(value) &&
      !isLikelyCursorInstructionText(value) &&
      !looksLikeCursorToolDescriptionText(value)
    )
    .sort((left, right) => right.length - left.length)[0];
}

function looksLikeCursorToolDescriptionText(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 1600 || looksLikeJsonText(text)) {
    return false;
  }
  const firstLine = text.split(/\r?\n/, 1)[0] || text;
  if (/\bChrome DevTools Protocol\b|\bCDP\b.*\bInput\.\*|\btarget browser tab\b/i.test(text)) {
    return true;
  }
  if (
    /^(?:Use|Call|Invoke)\s+[`'"]?[A-Za-z0-9_.:-]+[`'"]?\s+(?:to|when|for)\b/i.test(firstLine) ||
    /\b(?:browser|move_agent|cursor|mcp)_[a-z0-9_]+\b/i.test(text)
  ) {
    return true;
  }
  const startsLikeToolDescription =
    /^(?:Move|Open|Create|Rename|Navigate|Capture|Click|Type|Set|Select|Press|Scroll|Drag|Get|Highlight|List|Send|Take|Lock|Read|Write|Search|Delete|Run|Fetch|Find|Inspect|Execute|Apply)\b/.test(firstLine);
  const hasToolUsageLanguage =
    /\bUse (?:this|ONLY|instead|by default|browser_|move_agent_|cursor|the )\b/i.test(text) ||
    /\bDo not use\b|\bDo not call\b|\bMust be called\b|\bCall this\b/i.test(text) ||
    /\bDefaults? to\b|\bRequired for\b|\bOptional\b/i.test(text);
  const referencesToolName = /\b[a-z][a-z0-9]+(?:_[a-z0-9]+)+\b/.test(text);
  return startsLikeToolDescription && hasToolUsageLanguage && (referencesToolName || text.length < 900);
}

function findBestPromptStringFromValues(values) {
  return values
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) =>
      value.length > 2 &&
      value.length < 200000 &&
      !looksLikeNoiseString(value) &&
      !looksLikeSystemPromptText(value) &&
      !looksLikeJsonText(value)
    )
    .sort((left, right) => scorePromptString(right) - scorePromptString(left))[0];
}

function scorePromptString(value) {
  const hasNaturalLanguage = /[\p{L}\p{N}]/u.test(value) ? 20 : 0;
  const hasWhitespace = /\s/.test(value) ? 5 : 0;
  const lengthScore = Math.min(value.length, 4000) / 100;
  return hasNaturalLanguage + hasWhitespace + lengthScore;
}

function looksLikeJsonText(value) {
  const trimmed = String(value || "").trim();
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));
}

function findFirstByKeys(value, keys, read) {
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  let found;
  walkJson(value, (item) => {
    if (found !== undefined || !isRecord(item)) {
      return;
    }
    for (const [key, rawValue] of Object.entries(item)) {
      if (!keySet.has(key.toLowerCase())) {
        continue;
      }
      const readValue = read(rawValue);
      if (readValue !== undefined) {
        found = readValue;
        return;
      }
    }
  });
  return found;
}

function walkJson(value, visit, depth = 0, seen = new Set()) {
  if (depth > MAX_JSON_SCAN_DEPTH || value === undefined || value === null) {
    return;
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
  }

  visit(value);

  if (Array.isArray(value)) {
    value.forEach((item) => walkJson(item, visit, depth + 1, seen));
    return;
  }
  if (isRecord(value)) {
    Object.values(value).forEach((item) => walkJson(item, visit, depth + 1, seen));
  }
}

function isCursorConnectJsonRequest(headers, path) {
  const contentType = readHeader(headers["content-type"]).toLowerCase();
  return isCursorNativeRpcPath(path) && (
    contentType.includes("json") ||
    contentType.includes("connect+json") ||
    contentType === ""
  );
}

function isCursorNativeLlmRpcPath(runtime, path) {
  if (!isCursorNativeRpcPath(path)) {
    return false;
  }
  const normalized = normalizePath(path);
  const lower = normalized.toLowerCase();
  if (lower === "/aiserver.v1.bidiservice/bidiappend") {
    return false;
  }
  if (lower === "/agent.v1.agentservice/runsse") {
    return true;
  }
  if (matchesConfiguredNativeLlmMethod(runtime, normalized)) {
    return true;
  }
  const parsed = parseCursorNativeRpcPath(normalized);
  if (!parsed) {
    return false;
  }
  return CURSOR_NATIVE_LLM_SERVICE_PATTERN.test(parsed.service) &&
    CURSOR_NATIVE_LLM_METHOD_PATTERN.test(parsed.method);
}

function isCursorNativeRpcPath(path) {
  return CURSOR_NATIVE_RPC_PATH_PATTERN.test(normalizePath(path));
}

function parseCursorNativeRpcPath(path) {
  const match = normalizePath(path).match(/^\/(?:aiserver|agent)\.v\d+\.([^/]+)\/([^/]+)$/i);
  return match ? { method: match[2], service: match[1] } : undefined;
}

function matchesConfiguredNativeLlmMethod(runtime, path) {
  const configured = Array.isArray(runtime?.cursorNativeLlmMethods) ? runtime.cursorNativeLlmMethods : [];
  if (configured.length === 0) {
    return false;
  }
  const normalized = normalizePath(path).toLowerCase();
  const parsed = parseCursorNativeRpcPath(path);
  const method = parsed?.method.toLowerCase();
  return configured.some((item) => {
    const value = String(item || "").trim().toLowerCase();
    if (!value) {
      return false;
    }
    return normalized === normalizePath(value).toLowerCase() || method === value;
  });
}

function isOpenAIChatPath(path) {
  return path === "/chat/completions" || path === "/v1/chat/completions" || path.endsWith("/chat/completions");
}

function isOpenAIResponsesPath(path) {
  return path === "/responses" || path === "/v1/responses" || path.endsWith("/responses");
}

function isAnthropicMessagesPath(path) {
  return path === "/messages" || path === "/v1/messages" || path.endsWith("/v1/messages");
}

function isAnthropicCountTokensPath(path) {
  return path === "/v1/messages/count_tokens" || path.endsWith("/messages/count_tokens");
}

function isModelsPath(path) {
  return path === "/models" || path === "/v1/models" || path.startsWith("/v1/models/");
}

function isGeminiPath(path) {
  return /^\/v1(?:beta)?\/models\/[^/]+:(?:generateContent|streamGenerateContent)$/i.test(path);
}

function originalRequestUrl(request) {
  const explicit = readHeader(request.headers["x-ccr-original-url"]);
  if (explicit) {
    try {
      return new URL(explicit);
    } catch {
      return undefined;
    }
  }

  const host = readHeader(request.headers.host);
  if (!host) {
    return undefined;
  }
  return new URL(`https://${host}${request.url || "/"}`);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function filterResponseHeaders(headers) {
  const filtered = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase()) && value !== undefined) {
      filtered[key] = Array.isArray(value) ? value.map(String) : String(value);
    }
  }
  return filtered;
}

function corsHeaders(extra = {}) {
  return {
    "access-control-allow-headers": "authorization,connect-protocol-version,content-type,x-api-key,x-client-version",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS",
    "access-control-allow-origin": "*",
    ...extra
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, corsHeaders({ "content-type": "application/json" }));
  response.end(`${JSON.stringify(payload)}\n`);
}

function sendBinary(response, statusCode, body, headers) {
  response.writeHead(statusCode, corsHeaders(headers || { "content-type": "application/octet-stream" }));
  response.end(body || Buffer.alloc(0));
}

function protoHeaders(extra = {}) {
  return {
    "cache-control": "no-store",
    "connect-protocol-version": "1",
    "content-type": "application/proto",
    ...extra
  };
}

function connectProtoHeaders(extra = {}) {
  return {
    "cache-control": "no-store",
    "connect-content-encoding": "identity",
    "connect-protocol-version": "1",
    "content-type": "application/connect+proto",
    ...extra
  };
}

function connectEnvelope(flags, data) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
  const header = Buffer.alloc(5);
  header[0] = flags;
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

function decodeConnectEnvelope(buffer) {
  const messages = decodeConnectMessages(buffer);
  if (messages.length === 0) {
    return Buffer.isBuffer(buffer) ? buffer : Buffer.alloc(0);
  }
  return messages.length === 1 ? messages[0] : Buffer.concat(messages);
}

function decodeConnectMessages(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5) {
    return Buffer.isBuffer(buffer) && buffer.length > 0 ? [buffer] : [];
  }

  const frames = [];
  let offset = 0;
  while (offset + 5 <= buffer.length) {
    const flags = buffer[offset];
    if ((flags & ~0x03) !== 0) {
      return frames.length ? frames : [buffer];
    }
    const length = buffer.readUInt32BE(offset + 1);
    const start = offset + 5;
    const end = start + length;
    if (end > buffer.length) {
      return frames.length ? frames : [buffer];
    }
    if ((flags & 0x02) === 0 && length > 0) {
      const payload = buffer.subarray(start, end);
      frames.push((flags & 0x01) === 0 ? payload : decompressConnectPayload(payload) || payload);
    }
    offset = end;
  }
  if (offset === buffer.length) {
    return frames;
  }
  return frames.length > 0 && buffer.length - offset <= 4 ? frames : [buffer];
}

function decompressConnectPayload(payload) {
  for (const decompress of [zlib.gunzipSync, zlib.inflateSync, zlib.brotliDecompressSync]) {
    try {
      return decompress(payload);
    } catch {
      // Try the next compression format.
    }
  }
  return undefined;
}

function readJsonText(text) {
  if (typeof text !== "string") {
    return undefined;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function protoString(fieldNumber, value) {
  const text = stringValue(value);
  if (!text) {
    return Buffer.alloc(0);
  }
  return protoBytes(fieldNumber, Buffer.from(text, "utf8"), true);
}

function protoRawString(fieldNumber, value) {
  if (typeof value !== "string" || value.length === 0) {
    return Buffer.alloc(0);
  }
  return protoBytes(fieldNumber, Buffer.from(value, "utf8"), true);
}

function protoBytes(fieldNumber, value, includeEmpty) {
  const payload = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  if (!includeEmpty && payload.length === 0) {
    return Buffer.alloc(0);
  }
  return Buffer.concat([protoTag(fieldNumber, 2), protoVarint(payload.length), payload]);
}

function protoMessage(fieldNumber, body) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body || []);
  return Buffer.concat([protoTag(fieldNumber, 2), protoVarint(payload.length), payload]);
}

function protoBool(fieldNumber, value, includeFalse) {
  if (!value && !includeFalse) {
    return Buffer.alloc(0);
  }
  return Buffer.concat([protoTag(fieldNumber, 0), protoVarint(value ? 1 : 0)]);
}

function optionalProtoBool(fieldNumber, value) {
  return typeof value === "boolean" ? protoBool(fieldNumber, value, true) : Buffer.alloc(0);
}

function optionalProtoInt(fieldNumber, value) {
  if (!Number.isFinite(Number(value))) {
    return Buffer.alloc(0);
  }
  return Buffer.concat([protoTag(fieldNumber, 0), protoVarint(value)]);
}

function protoDouble(fieldNumber, value) {
  const buffer = Buffer.alloc(8);
  buffer.writeDoubleLE(Number(value) || 0, 0);
  return Buffer.concat([protoTag(fieldNumber, 1), buffer]);
}

function protoTag(fieldNumber, wireType) {
  return protoVarint((Number(fieldNumber) << 3) | Number(wireType));
}

function protoVarint(value) {
  let number = typeof value === "bigint" ? value : BigInt(Math.max(0, Math.trunc(Number(value) || 0)));
  const bytes = [];
  while (number >= 0x80n) {
    bytes.push(Number((number & 0x7fn) | 0x80n));
    number >>= 7n;
  }
  bytes.push(Number(number));
  return Buffer.from(bytes);
}

function decodeProtoStringField(buffer, fieldNumber) {
  const field = readProtoField(buffer, fieldNumber);
  return field?.wireType === 2 ? stringValue(field.value.toString("utf8")) : undefined;
}

function decodeProtoStringFields(buffer, fieldNumber) {
  return readProtoFields(buffer, fieldNumber)
    .filter((field) => field.wireType === 2)
    .map((field) => field.value.toString("utf8"))
    .filter((value) => value.length > 0);
}

function decodeAllProtoStrings(buffer, depth = 0) {
  if (!Buffer.isBuffer(buffer) || depth > 6) {
    return [];
  }
  const values = [];
  forEachProtoField(buffer, (field) => {
    if (field.wireType === 2 && field.value.length > 0) {
      const text = field.value.toString("utf8");
      if (/^[\t\n\r -~\u00a0-\uffff]+$/.test(text)) {
        values.push({ fieldNumber: field.fieldNumber, value: text });
      }
      values.push(...decodeAllProtoStrings(field.value, depth + 1));
    }
  });
  return values;
}

function decodeProtoBytesField(buffer, fieldNumber) {
  const field = readProtoField(buffer, fieldNumber);
  return field?.wireType === 2 ? field.value : undefined;
}

function decodeProtoBytesFields(buffer, fieldNumber) {
  return readProtoFields(buffer, fieldNumber)
    .filter((field) => field.wireType === 2)
    .map((field) => field.value);
}

function concatProtoBytesFields(buffer, fieldNumber) {
  const fields = decodeProtoBytesFields(buffer, fieldNumber).filter((value) => value.length > 0);
  return fields.length > 0 ? Buffer.concat(fields) : Buffer.alloc(0);
}

function decodeProtoMessageFields(buffer, fieldNumber) {
  return readProtoFields(buffer, fieldNumber)
    .filter((field) => field.wireType === 2)
    .map((field) => field.value);
}

function readLengthDelimitedProtoFields(buffer) {
  const fields = [];
  forEachProtoField(buffer, (field) => {
    if (field.wireType === 2 && field.value.length > 0) {
      fields.push(field);
    }
  });
  return fields;
}

function hasReadableProtoFields(buffer) {
  let found = false;
  forEachProtoField(buffer, () => {
    found = true;
  });
  return found;
}

function decodeProtoIntField(buffer, fieldNumber) {
  const field = readProtoField(buffer, fieldNumber);
  return field?.wireType === 0 ? Number(field.value) : 0;
}

function readProtoFields(buffer, targetFieldNumber) {
  if (!Buffer.isBuffer(buffer)) {
    return [];
  }
  const matches = [];
  forEachProtoField(buffer, (field) => {
    if (field.fieldNumber === targetFieldNumber) {
      matches.push({
        value: field.value,
        wireType: field.wireType
      });
    }
  });
  return matches;
}

function readProtoField(buffer, targetFieldNumber) {
  return readProtoFields(buffer, targetFieldNumber)[0];
}

function forEachProtoField(buffer, visitor) {
  if (!Buffer.isBuffer(buffer)) {
    return;
  }

  let offset = 0;
  while (offset < buffer.length) {
    const tag = readProtoVarint(buffer, offset);
    if (!tag) {
      return;
    }

    offset = tag.offset;
    const fieldNumber = Number(tag.value >> 3n);
    const wireType = Number(tag.value & 0x07n);
    if (fieldNumber <= 0) {
      return;
    }

    if (wireType === 0) {
      const value = readProtoVarint(buffer, offset);
      if (!value) {
        return;
      }
      offset = value.offset;
      visitor({ fieldNumber, value: value.value, wireType });
      continue;
    }

    if (wireType === 1) {
      if (offset + 8 > buffer.length) {
        return;
      }
      const value = buffer.subarray(offset, offset + 8);
      offset += 8;
      visitor({ fieldNumber, value, wireType });
      continue;
    }

    if (wireType === 2) {
      const length = readProtoVarint(buffer, offset);
      if (!length) {
        return;
      }
      offset = length.offset;
      const end = offset + Number(length.value);
      if (end > buffer.length) {
        return;
      }
      const value = buffer.subarray(offset, end);
      offset = end;
      visitor({ fieldNumber, value, wireType });
      continue;
    }

    if (wireType === 5) {
      if (offset + 4 > buffer.length) {
        return;
      }
      const value = buffer.subarray(offset, offset + 4);
      offset += 4;
      visitor({ fieldNumber, value, wireType });
      continue;
    }

    return;
  }
}

function readProtoVarint(buffer, offset) {
  let result = 0n;
  let shift = 0n;
  for (let index = offset; index < buffer.length; index += 1) {
    const byte = buffer[index];
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return {
        offset: index + 1,
        value: result
      };
    }
    shift += 7n;
    if (shift > 70n) {
      return undefined;
    }
  }
  return undefined;
}

function formatProtoFieldSummary(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return "empty";
  }
  const fields = [];
  forEachProtoField(buffer, (field) => {
    if (fields.length >= 12) {
      return;
    }
    fields.push(`${field.fieldNumber}:${field.wireType}:${field.wireType === 2 ? field.value.length : String(field.value)}`);
  });
  return fields.length ? fields.join(",") : `unreadable:${buffer.length}`;
}

function configuredGatewayUrl(config) {
  if (typeof config?.routerEndpoint === "string" && config.routerEndpoint.trim()) {
    return config.routerEndpoint.trim();
  }
  const host = config?.gateway?.host && config.gateway.host !== "0.0.0.0" ? config.gateway.host : "127.0.0.1";
  const port = config?.gateway?.port || config?.PORT || 3456;
  return `http://${host}:${port}`;
}

function configuredGatewayApiKey(config) {
  const apiKeys = Array.isArray(config?.APIKEYS) ? config.APIKEYS : [];
  return apiKeys.map((item) => stringValue(item?.key)).find(Boolean) || stringValue(config?.APIKEY);
}

function configuredDefaultModel(config) {
  const routerDefault = stringValue(config?.Router?.default);
  if (routerDefault) {
    return routeTargetModel(routerDefault) || routerDefault;
  }

  const preferredProvider = stringValue(config?.preferredProvider);
  const providers = Array.isArray(config?.Providers) ? config.Providers : [];
  const preferred = preferredProvider
    ? providers.find((provider) => provider?.name === preferredProvider)
    : undefined;
  return firstProviderModel(preferred) || providers.map(firstProviderModel).find(Boolean);
}

function routeTargetModel(value) {
  const parts = value.split(",");
  return parts.length > 1 ? parts.slice(1).join(",").trim() : undefined;
}

function firstProviderModel(provider) {
  return Array.isArray(provider?.models) ? provider.models.map(stringValue).find(Boolean) : undefined;
}

function normalizeStringList(...values) {
  const result = [];
  for (const value of values) {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        const normalized = stringValue(item);
        if (normalized) {
          result.push(normalized.toLowerCase());
        }
      });
      continue;
    }
    const normalized = stringValue(value);
    if (normalized) {
      result.push(normalized.toLowerCase());
    }
  }
  return result.length ? uniqueStrings(result) : undefined;
}

function normalizePathList(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result = value
    .map((item) => normalizePath(stringValue(item)))
    .filter(Boolean);
  return result.length ? uniqueStrings(result) : undefined;
}

function normalizePath(value) {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function trimTrailingSlash(value) {
  return (value || DEFAULT_GATEWAY_URL).replace(/\/+$/, "");
}

function numberOption(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function compactObject(value) {
  const result = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (rawValue !== undefined) {
      result[key] = rawValue;
    }
  }
  return result;
}

function readHeader(value) {
  if (Array.isArray(value)) {
    return value[0]?.trim() || "";
  }
  return typeof value === "string" ? value.trim() : "";
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
