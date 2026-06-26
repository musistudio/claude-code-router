"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const pathModule = require("node:path");
const zlib = require("node:zlib");

const DEFAULT_HOST = "claude.ai";
const DEFAULT_GATEWAY_URL = "http://127.0.0.1:3456";
const DEFAULT_GATEWAY_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_UPSTREAM_ORIGIN = "https://claude.ai";
const DEFAULT_DESIGN_ORIGIN = "https://claude.ai";
const DEFAULT_DESIGN_REFERRER = "https://claude.ai/design";
const DEFAULT_FALLBACK_ROUTE_HOSTS = ["claude.com", "www.anthropic.com", "anthropic.com"];
const CLAUDE_APP_ION_DIST_ENV_KEYS = ["CCR_CLAUDE_APP_ION_DIST_DIR", "CLAUDE_APP_ION_DIST_DIR"];
const CLAUDE_APP_PATH_ENV_KEYS = ["CCR_CLAUDE_APP_PATH", "CLAUDE_APP_PATH"];
const CLAUDE_APP_DESIGN_IFRAME_QUERY = "__ccr_design_iframe";
const CLAUDE_APP_DESIGN_PATH_QUERY = "path";
const CLAUDE_APP_DESIGN_SHELL_PATH = "/desktop-design";
const CLAUDE_APP_SPA_ROUTE_PATHS = [
  CLAUDE_APP_DESIGN_SHELL_PATH,
  "/discover/design",
  "/admin-settings/claude-design"
];
const OMELETTE_RPC_PATH_PREFIX = "/design/anthropic.omelette.api.v1alpha.OmeletteService";
const AUTH_ESCAPE_ROUTE_PATHS = ["/login", "/auth", "/oauth"];
const BOOTSTRAP_ROUTE_PATHS = ["/_bootstrap", "/api/bootstrap", "/edge-api/bootstrap"];
const REQUIRED_ROUTE_PATHS = ["/", OMELETTE_RPC_PATH_PREFIX, "/v1/design", ...CLAUDE_APP_SPA_ROUTE_PATHS, ...BOOTSTRAP_ROUTE_PATHS, ...AUTH_ESCAPE_ROUTE_PATHS];
const DEFAULT_ROUTE_PATHS = ["/design", "/v1/design", "/api", "/organizations", "/cdn-cgi", ...BOOTSTRAP_ROUTE_PATHS, ...AUTH_ESCAPE_ROUTE_PATHS];
const FALLBACK_ROUTE_PATHS = ["/app-unavailable-in-region", "/cdn-cgi", "/design", ...AUTH_ESCAPE_ROUTE_PATHS];
const DEFAULT_SCRIPT_PATH = "/design/assets/v1/index-C0BEUHEw.js";
const DEFAULT_STYLE_PATH = "/design/assets/v1/index-CqhNJH1o.css";
const DEFAULT_DESIGN_CRITICAL_MODULE_PRELOAD_PATHS = [
  "/design/assets/v1/rolldown-runtime-CMxvf4Kt.js",
  "/design/assets/v1/preload-helper-7XptfjGJ.js",
  "/design/assets/v1/react-BthIFXYf.js",
  "/design/assets/v1/client-lite-CK-dmuh6.js",
  "/design/assets/v1/useOrg-DmMewMgN.js",
  "/design/assets/v1/cn-BvRk9kiK.js",
  "/design/assets/v1/cn-D-uX0T7P.js",
  "/design/assets/v1/Button-XfKvB69T.js"
];
const DEFAULT_DESIGN_LAZY_MODULE_PRELOAD_PATHS = [
  "/design/assets/v1/Button-BtUXY0oi.js",
  "/design/assets/v1/DsBrowseModal-hSTModTp.js",
  "/design/assets/v1/Form-B3y7m-2_.js",
  "/design/assets/v1/FormList-Bv2urBSD.js",
  "/design/assets/v1/Kbd-CLyZAmwA.js",
  "/design/assets/v1/MetaText-DDKRoRv8.js",
  "/design/assets/v1/ModalHeader-Jq2fIJBg.js",
  "/design/assets/v1/ProjectsPage-PDmge7e_.js",
  "/design/assets/v1/SegmentedControl-oWx7ZWcd.js",
  "/design/assets/v1/SpinnerCursorContext-FnwGR7gg.js",
  "/design/assets/v1/Switch-C1hJI3Wa.js",
  "/design/assets/v1/TextInput-DBxrS72B.js",
  "/design/assets/v1/TextLink-CSMbfMRn.js",
  "/design/assets/v1/Tooltip-DkOyUUQf.js",
  "/design/assets/v1/client-CoyioTSK.js",
  "/design/assets/v1/client-event-bus-CUOhmLFi.js",
  "/design/assets/v1/completion-BAv5dQBO.js",
  "/design/assets/v1/components-CiWVw_5Z.js",
  "/design/assets/v1/connectrpc-B0zPEr5l.js",
  "/design/assets/v1/data-C1nvXn42.js",
  "/design/assets/v1/ds-contract-C8bG_fzg.js",
  "/design/assets/v1/ds-manifest-guards-CDOctgob.js",
  "/design/assets/v1/home-analytics-EoW6gFrM.js",
  "/design/assets/v1/host-BwlQdwMG.js",
  "/design/assets/v1/platform-BJ0ekVkb.js",
  "/design/assets/v1/registry-DDfaFazS.js",
  "/design/assets/v1/useLabelableId-YQk8Dx5K.js",
  "/design/assets/v1/useModelSelection-DahB-QBH.js",
  "/design/assets/v1/useMutation-ndQNPSAH.js",
  "/design/assets/v1/viewer-handle-BbaClWB_.js"
];
const DEFAULT_DESIGN_STYLE_PRELOAD_PATHS = [
  "/design/assets/v1/Button-C3hHoRdu.css",
  "/design/assets/v1/FormList-DPI5FmbR.css",
  "/design/assets/v1/ProjectsPage-CRTuKvXp.css",
  "/design/assets/v1/components-DnFFPXN_.css",
  "/design/assets/v1/home-analytics-DAgH1hGY.css"
];
const LEGACY_SCRIPT_PATHS = new Set([
  "/design/assets/index-DWa5J5J9.js",
  "/design/assets/index-DYd5ifc6.js",
  "/design/assets/index-BxFzSrWf.js"
]);
const LEGACY_STYLE_PATHS = new Set([
  "/design/assets/index-DZOB93ZB.css",
  "/design/assets/index-j8_-aIUE.css"
]);
const DEFAULT_EXTERNAL_ASSET_BASE_URLS = ["https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/"];
const DESIGN_INDEX_ASSET_DISCOVERY_TTL_MS = 5 * 60 * 1000;
const MAX_UPSTREAM_ASSET_REDIRECTS = 5;
const MAX_LOG_BODY_CHARS = 128 * 1024;
const COMMENT_COLLECTION = "comments";
const DESIGN_SYSTEM_COLLECTION = "design_systems";
const EVENT_COLLECTION = "events";
const PROJECT_COLLECTION = "projects";
const SESSION_COLLECTION = "sessions";
const THUMBNAIL_COLLECTION = "thumbnails";
const PROJECT_TYPE_PROJECT = 1;
const PROJECT_TYPE_TEMPLATE = 2;
const PROJECT_TYPE_DESIGN_SYSTEM = 3;
const TRANSPARENT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1" aria-hidden="true"></svg>\n`;
const QUESTION_TOOL_NAMES = new Set(["questions", "questions_v2"]);
const CLAUDE_DESIGN_ROUTE_TYPES = new Set(["always", "image", "long-context", "model", "model-prefix", "thinking", "web-search"]);
const CLAUDE_DESIGN_MODEL_ALIASES = new Map([
  ["claude-haiku-4-5-20251001", DEFAULT_GATEWAY_MODEL],
  ["claude-opus-4-6", DEFAULT_GATEWAY_MODEL],
  ["claude-opus-4-7", DEFAULT_GATEWAY_MODEL],
  ["claude-opus-4-8", DEFAULT_GATEWAY_MODEL],
  ["claude-sonnet-4-6", DEFAULT_GATEWAY_MODEL]
]);
const FALLBACK_ASSET_CACHE_PREFIX = "fallback:claude-design-v1:";
const FALLBACK_ASSET_CACHE_TTL_MS = 60 * 60 * 1000;
const OMELETTE_PREVIEW_EVAL_BRIDGE_SCRIPT = `(function(){
  if (window.__omEvalBridgeInstalled) return;
  window.__omEvalBridgeInstalled = true;
  window.addEventListener('message', function(event) {
    var message = event && event.data;
    if (!message || !message.__om_eval || typeof message.code !== 'string') return;
    if (event.source !== window.parent) return;
    var targetOrigin = event.origin && event.origin !== 'null' ? event.origin : '*';
    var reply = function(payload) {
      try {
        event.source.postMessage(Object.assign({ __om_eval_r: true, id: message.id }, payload), targetOrigin);
      } catch (_) {
        window.parent.postMessage(Object.assign({ __om_eval_r: true, id: message.id }, payload), '*');
      }
    };
    Promise.resolve()
      .then(function() { return (0, eval)(message.code); })
      .then(function(value) {
        var serialized;
        if (value !== undefined) {
          try {
            serialized = JSON.stringify(value);
          } catch (_) {
            serialized = JSON.stringify(String(value));
          }
        }
        reply(serialized === undefined ? { ok: true } : { ok: true, v: serialized });
      })
      .catch(function(error) {
        reply({ ok: false, e: error && error.message ? String(error.message) : String(error) });
      });
  });
})();`;

const DEFAULT_ME = {
  accountUuid: "12345678",
  organizationUuid: "87654321",
  email: "aa@example.com",
  displayName: "aa",
  orgName: "aa's Organization",
  growthbookPayload: "{}",
  modelPresets: [
    {
      id: DEFAULT_GATEWAY_MODEL,
      label: "Claude Sonnet 4",
      maxTokens: 1000000,
      supportsAdaptiveThinking: true,
      description: "Most efficient for everyday tasks"
    },
    {
      id: "claude-3-5-haiku-20241022",
      label: "Claude Haiku 3.5",
      maxTokens: 200000,
      description: "Fast for quick answers"
    },
    {
      id: "claude-3-5-sonnet-20241022",
      label: "Claude Sonnet 3.5",
      maxTokens: 200000,
      supportsAdaptiveThinking: true,
      overflow: true
    },
    {
      id: "claude-3-opus-20240229",
      label: "Claude Opus 3",
      maxTokens: 200000,
      supportsAdaptiveThinking: true,
      overflow: true
    }
  ],
  defaultModelId: DEFAULT_GATEWAY_MODEL,
  overrideStickyModel: true,
  isPersonalOrg: true,
  accessLevel: "ACCESS_LEVEL_FULL",
  hasOauthTokens: true,
  canManageDs: true,
  memberships: [
    {
      uuid: "123456787",
      name: "aa's Organization"
    }
  ]
};

module.exports = {
  async setup(ctx) {
    const options = isRecord(ctx.pluginConfig) ? ctx.pluginConfig : {};
    const routeHost = stringValue(options.host) || DEFAULT_HOST;
    const configuredRoutePaths = stringArray(options.paths) || DEFAULT_ROUTE_PATHS;
    const routePaths = Array.from(new Set([...REQUIRED_ROUTE_PATHS, ...configuredRoutePaths]));
    const fallbackRouteHosts = normalizeFallbackRouteHosts(options.fallbackHosts, routeHost);
    const upstreamOrigin = stringValue(options.upstreamOrigin) || DEFAULT_UPSTREAM_ORIGIN;
    const assetProxy = options.assetProxy !== false;
    const configuredAssetDir = stringValue(options.assetDir);
    const claudeAppAssetDir = (configuredAssetDir || options.claudeAppAssets === false)
      ? ""
      : resolveClaudeAppIonDistDir(options, ctx.logger);
    const assetDir = configuredAssetDir || claudeAppAssetDir;
    const usingClaudeAppAssets = Boolean(claudeAppAssetDir) ||
      Boolean(configuredAssetDir && isClaudeAppIonDistDir(expandHomePath(configuredAssetDir)));
    const assetSource = usingClaudeAppAssets ? "claude-app" : configuredAssetDir ? "configured" : "none";
    const assetPassthrough = usingClaudeAppAssets
      ? false
      : options.assetPassthrough === true ||
        (options.assetPassthrough !== false && !localAssetDirExists(assetDir));
    if (usingClaudeAppAssets && options.assetPassthrough === true) {
      ctx.logger.info("Claude Design disabled assetPassthrough because Claude app ion-dist assets must be served locally.");
    }
    const configuredScriptPath = normalizePath(stringValue(options.scriptPath) || DEFAULT_SCRIPT_PATH);
    const configuredStylePath = normalizePath(stringValue(options.stylePath) || DEFAULT_STYLE_PATH);
    const scriptPath = shouldKeepCurrentScriptPath(configuredScriptPath) ? configuredScriptPath : DEFAULT_SCRIPT_PATH;
    const stylePath = shouldKeepCurrentStylePath(configuredStylePath) ? configuredStylePath : DEFAULT_STYLE_PATH;
    const assetAutoUpdate = options.assetAutoUpdate !== false;
    const autoAnswerQuestions = options.autoAnswerQuestions !== false;
    const gatewayUrl = stringValue(options.gatewayUrl) || DEFAULT_GATEWAY_URL;
    const gatewayApiKey = stringValue(options.gatewayApiKey) || configuredGatewayApiKey(ctx.config);
    const gatewayConfigPath = stringValue(options.gatewayConfigPath) ||
      stringValue(ctx.config?.gateway?.generatedConfigFile) ||
      defaultClaudeDesignGatewayConfigPath();
    const gatewayConfig = loadClaudeDesignGatewayConfig(gatewayConfigPath, ctx.logger);
    const modelSourceConfig = claudeDesignModelSourceConfig(ctx.config, gatewayConfig);
    const configuredDefaultGatewayModel = normalizeRouteTarget(
      stringValue(options.defaultGatewayModel) ||
      stringValue(options.gatewayModel)
    );
    const defaultGatewayModel = configuredDefaultGatewayModel ||
      normalizeRouteTarget(stringValue(ctx.config?.Router?.default)) ||
      DEFAULT_GATEWAY_MODEL;
    const frontendDefaultModel = normalizeRouteTarget(
      stringValue(options.frontendDefaultModel) ||
      stringValue(options.defaultModelId) ||
      configuredDefaultGatewayModel
    ) || DEFAULT_GATEWAY_MODEL;
    const availableProviderNames = claudeDesignProviderSelectorNames(modelSourceConfig);
    const gatewayModelPresets = claudeDesignGatewayModelPresets(modelSourceConfig, frontendDefaultModel);
    const routing = normalizeClaudeDesignRouting(options.routing, options);
    const upstreamOrigins = normalizeUpstreamOrigins(options.upstreamOrigins, upstreamOrigin);
    const me = normalizeMe(options.me, frontendDefaultModel, gatewayModelPresets);
    const store = await ctx.openSqliteStore({
      filename: "claude-design.sqlite",
      migrate(database) {
        database.run(`
          CREATE TABLE IF NOT EXISTS claude_design_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            method TEXT NOT NULL,
            path TEXT NOT NULL,
            search TEXT NOT NULL DEFAULT '',
            request_headers TEXT NOT NULL DEFAULT '{}',
            request_body TEXT NOT NULL DEFAULT '',
            response_status INTEGER NOT NULL,
            response_body TEXT NOT NULL DEFAULT ''
          );
          CREATE INDEX IF NOT EXISTS claude_design_requests_created_at_idx
            ON claude_design_requests(created_at);
          CREATE INDEX IF NOT EXISTS claude_design_requests_path_idx
            ON claude_design_requests(method, path);

          CREATE TABLE IF NOT EXISTS claude_design_assets (
            path TEXT PRIMARY KEY,
            upstream_url TEXT NOT NULL,
            content_type TEXT NOT NULL,
            body_base64 TEXT NOT NULL,
            fetched_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS claude_design_responses (
            method TEXT NOT NULL,
            path TEXT NOT NULL,
            status INTEGER NOT NULL DEFAULT 200,
            headers_json TEXT NOT NULL DEFAULT '{}',
            body TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT NOT NULL,
            PRIMARY KEY (method, path)
          );

          CREATE TABLE IF NOT EXISTS claude_design_items (
            collection TEXT NOT NULL,
            uuid TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            title TEXT NOT NULL,
            model TEXT NOT NULL,
            data_json TEXT NOT NULL DEFAULT '{}',
            messages_json TEXT NOT NULL DEFAULT '[]',
            PRIMARY KEY (collection, uuid)
          );
          CREATE INDEX IF NOT EXISTS claude_design_items_updated_at_idx
            ON claude_design_items(collection, updated_at);

          CREATE TABLE IF NOT EXISTS claude_design_files (
            project_id TEXT NOT NULL,
            path TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            content_type TEXT NOT NULL DEFAULT 'text/plain',
            body_base64 TEXT NOT NULL DEFAULT '',
            version INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (project_id, path)
          );
          CREATE INDEX IF NOT EXISTS claude_design_files_project_updated_at_idx
            ON claude_design_files(project_id, updated_at);
        `);
      }
    });
    purgeBadCachedAssets(store);

    const runtime = {
      autoAnswerQuestions,
      assetProxy,
      assetAutoUpdate,
      assetDir,
      assetSource,
      assetPassthrough,
      designIndexAssets: {
        checkedAt: 0,
        html: "",
        scriptPath,
        source: "configured",
        stylePath
      },
      standaloneDesignIndexAssets: {
        checkedAt: 0,
        html: "",
        scriptPath: DEFAULT_SCRIPT_PATH,
        source: "default",
        stylePath: DEFAULT_STYLE_PATH
      },
      gatewayApiKey,
      gatewayConfigPath,
      defaultGatewayModel,
      frontendDefaultModel,
      gatewayModelPresets,
      gatewayUrl,
      logger: ctx.logger,
      me,
      routing,
      availableProviderNames,
      unavailableRouteTargetWarnings: new Set(),
      routeHost,
      fallbackRouteHosts,
      routePaths,
      scriptPath,
      store,
      stylePath,
      upstreamOrigin,
      upstreamOrigins
    };

    const backend = await ctx.registerHttpBackend({
      id: "claude-design-mock",
      async handler(request, response) {
        await handleMockRequest(runtime, request, response);
      }
    });

    if (assetPassthrough) {
      ctx.registerProxyRoute({
        host: routeHost,
        id: "claude-design-assets-passthrough",
        paths: ["/design/assets", "/assets"],
        preserveHost: false,
        upstream: upstreamOrigin
      });
    }

    ctx.registerProxyRoute({
      host: routeHost,
      id: "claude-design-proxy",
      paths: routePaths,
      preserveHost: true,
      upstream: backend.url
    });

    for (const fallbackHost of fallbackRouteHosts) {
      ctx.registerProxyRoute({
        host: fallbackHost,
        id: `claude-design-fallback-${fallbackHost}`,
        paths: FALLBACK_ROUTE_PATHS,
        preserveHost: true,
        upstream: backend.url
      });
    }

    ctx.registerGatewayRoute({
      auth: "none",
      handler(request, response, helpers) {
        return handleAdminRequest(runtime, backend, request, response, helpers);
      },
      id: "claude-design-admin",
      methods: ["DELETE", "GET", "POST", "PUT"],
      pathPrefix: "/plugins/claude-design"
    });

    ctx.logger.info(`Claude Design mock listening at ${backend.url} for ${routeHost} ${routePaths.join(", ")}`);
  }
};

async function handleMockRequest(runtime, request, response) {
  const url = new URL(request.url || "/", "http://claude-design.local");
  const method = (request.method || "GET").toUpperCase();
  const requestBody = await readRequestBody(request);
  let result;

  try {
    if (method === "OPTIONS") {
      result = {
        body: "",
        headers: corsHeaders({ "access-control-max-age": "86400" }),
        status: 204
      };
    } else if (method === "HEAD") {
      const getResult = await routeMockRequest(runtime, "GET", url, request, requestBody);
      result = { ...getResult, body: "" };
    } else {
      result = await routeMockRequest(runtime, method, url, request, requestBody);
    }
  } catch (error) {
    result = jsonResponse(500, {
      error: {
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }

  sendResponse(response, result);
  logRequest(runtime.store, {
    method,
    path: url.pathname,
    requestBody,
    requestHeaders: request.headers,
    responseBody: result.body,
    responseStatus: result.status,
    search: url.search
  });
}

async function routeMockRequest(runtime, method, url, request, requestBody) {
  const path = normalizePath(url.pathname);

  if (method === "GET" && path === "/health") {
    return jsonResponse(200, { ok: true, plugin: "claude-design" });
  }

  if (isDesignAuthEscapeRoute(path)) {
    if (method === "GET" || method === "HEAD") {
      return redirectResponse(302, "/design");
    }
    return jsonResponse(200, authSessionPayload(runtime.me));
  }

  if (method === "GET" && runtime.assetSource === "claude-app" && isDesignSpaRoute(path)) {
    if (isClaudeAppDesignIframeRequest(url, request)) {
      const assets = await resolveStandaloneDesignIndexAssets(runtime, request);
      return htmlResponse(renderDefaultDesignIndex(runtime.me, assets.scriptPath, assets.stylePath));
    }
    const redirectUrl = claudeAppDesignEntrypointRedirectUrl(url);
    if (redirectUrl) {
      return redirectResponse(302, redirectUrl);
    }
  }

  if (method === "GET" && runtime.assetSource === "claude-app" && isClaudeAppSpaRoute(path)) {
    const assets = await resolveDesignIndexAssets(runtime, request);
    return htmlResponse(renderDesignIndex(runtime.me, assets.scriptPath, assets.stylePath, assets.html));
  }

  if (method === "GET" && (path === "/" || isDesignSpaRoute(path))) {
    const assets = await resolveDesignIndexAssets(runtime, request);
    return htmlResponse(renderDesignIndex(runtime.me, assets.scriptPath, assets.stylePath, assets.html));
  }

  if (method === "GET" && path === "/app-unavailable-in-region") {
    const assets = await resolveDesignIndexAssets(runtime, request);
    return htmlResponse(renderDesignIndex(runtime.me, assets.scriptPath, assets.stylePath, assets.html));
  }

  if (method === "GET" && path === "/design/favicon.png") {
    return binaryResponse(200, Buffer.from(FAVICON_PNG_BASE64, "base64"), {
      "cache-control": "public, max-age=86400",
      "content-type": "image/png"
    });
  }

  if (method === "GET" && path === "/design/introvid.html") {
    return htmlResponse("<!doctype html><html lang=\"en\"><head><meta charset=\"UTF-8\"></head><body></body></html>\n");
  }

  if (method === "GET" && path.startsWith("/assets/")) {
    return serveAsset(runtime, `/design${path}`, request);
  }

  if (method === "GET" && path.startsWith("/design/assets/")) {
    return serveAsset(runtime, path, request);
  }

  if (method === "GET" && isClaudeAppStaticRoutePath(path)) {
    return serveAsset(runtime, path, request);
  }

  if (method === "GET" && isDesignStaticAsset(path)) {
    return serveAsset(runtime, path, request);
  }

  if (method === "GET" && path.startsWith("/cdn-cgi/")) {
    return textResponse(200, "/* Cloudflare challenge disabled by Claude Design mock. */\n", {
      "cache-control": "no-store",
      "content-type": "application/javascript; charset=utf-8"
    });
  }

  const storedResponse = readStoredResponse(runtime.store, method, path) || readStoredResponse(runtime.store, "ANY", path);
  if (storedResponse) {
    return storedResponse;
  }

  if (path.startsWith("/design/anthropic.omelette.api.v1alpha.OmeletteService/")) {
    return handleOmeletteConnectRpc(runtime, method, path, request, requestBody);
  }

  if (path.startsWith("/design/v1/design/") || path.startsWith("/v1/design/")) {
    return await handleDesignRestApi(runtime, method, path, request, requestBody);
  }

  if (isBootstrapRoutePath(path)) {
    return jsonResponse(200, bootstrapPayload(runtime.me));
  }

  const bootstrapSubresource = handleBootstrapSubresource(runtime, method, path);
  if (bootstrapSubresource) {
    return bootstrapSubresource;
  }

  if (path === "/api/auth/session" || path === "/api/session") {
    return jsonResponse(200, authSessionPayload(runtime.me));
  }

  if (path === "/api/me" || path === "/api/user" || path === "/api/account") {
    return jsonResponse(200, accountPayload(runtime.me));
  }

  if (path === "/api/organizations") {
    return jsonResponse(200, organizationsPayload(runtime.me));
  }

  if (path.startsWith("/api/organizations/")) {
    return handleOrganizationApi(runtime, method, path, request, requestBody);
  }

  if (path.startsWith("/api/")) {
    return handleGenericApi(method, path, requestBody);
  }

  return jsonResponse(404, {
    error: {
      message: `Claude Design mock has no route for ${method} ${path}`
    }
  });
}

async function handleOmeletteConnectRpc(runtime, method, path, request, requestBody) {
  if (method !== "POST") {
    return jsonResponse(405, {
      error: {
        message: `Claude Design mock only supports POST for ${path}`
      }
    });
  }

  const rpcName = path.split("/").pop();
  const isConnectProtoRequest = headerIncludes(request.headers["content-type"], "application/connect+proto");
  const rpcBody = rpcName === "Chat" || isConnectProtoRequest
    ? decodeConnectEnvelope(requestBody)
    : requestBody;
  switch (rpcName) {
    case "CreateProject": {
      const project = createOmeletteProject(runtime, rpcBody);
      return protoResponse(encodeCreateProjectResponse(project.uuid));
    }
    case "UpdateProject":
      updateOmeletteProject(runtime, rpcBody);
      return protoResponse(Buffer.alloc(0));
    case "DeleteProject":
      deleteOmeletteProject(runtime, rpcBody);
      return protoResponse(Buffer.alloc(0));
    case "BundleProject":
      return protoResponse(bundleProject(runtime, rpcBody));
    case "GetProject": {
      const projectId = decodeProtoStringField(rpcBody, 1);
      const project = getOmeletteProject(runtime, projectId);
      return protoResponse(encodeGetProjectResponse(project, runtime.me, getProjectDataBytes(runtime, project.projectId)));
    }
    case "GetProjectData": {
      const projectId = decodeProtoStringField(rpcBody, 1);
      return protoResponse(encodeGetProjectDataResponse(getProjectDataBytes(runtime, projectId)));
    }
    case "UpdateProjectData":
      return protoResponse(updateProjectDataBytes(runtime, rpcBody));
    case "GetChatMessages":
      return protoResponse(encodeGetChatMessagesResponse(runtime, rpcBody));
    case "ListChatsForExport":
      return protoResponse(listChatsForExport(runtime, rpcBody));
    case "ExportChatMessages":
      return protoResponse(exportChatMessages(runtime, rpcBody));
    case "CreateClaudeCodeSession":
      return protoResponse(createClaudeCodeSession(runtime, rpcBody));
    case "UpdateSharing":
      return protoResponse(updateOmeletteProjectSharing(runtime, rpcBody));
    case "DuplicateProject":
      return protoResponse(duplicateOmeletteProject(runtime, rpcBody, {}));
    case "RemixProject":
      return protoResponse(duplicateOmeletteProject(runtime, rpcBody, { includeChats: decodeProtoBoolField(rpcBody, 2) }));
    case "CreateTemplateFromProject":
      return protoResponse(duplicateOmeletteProject(runtime, rpcBody, { type: PROJECT_TYPE_TEMPLATE }));
    case "UpdateProjectType":
      return protoResponse(updateProjectType(runtime, rpcBody));
    case "SetProjectPublished":
      return protoResponse(setProjectPublished(runtime, rpcBody));
    case "UpdateProjectInfo":
      updateProjectInfo(runtime, rpcBody);
      return protoResponse(Buffer.alloc(0));
    case "UpdateProjectDesignSystems":
      return protoResponse(updateProjectDesignSystems(runtime, rpcBody));
    case "PatchDesignSystemBinding":
      return protoResponse(patchDesignSystemBinding(runtime, rpcBody));
    case "RefreshBoundDesignSystem":
      return protoResponse(protoInt32(1, 0));
    case "SetProjectFavorite":
      updateProjectFavorite(runtime, rpcBody);
      return protoResponse(Buffer.alloc(0));
    case "SetProjectThumbnail":
      setProjectThumbnail(runtime, rpcBody);
      return protoResponse(Buffer.alloc(0));
    case "ListFiles":
      return protoResponse(encodeListFilesResponse(runtime, rpcBody));
    case "GetFile":
      return protoResponse(encodeGetFileResponse(runtime, rpcBody));
    case "WriteFiles":
      return protoResponse(writeProjectFiles(runtime, rpcBody));
    case "DeleteFile":
      return protoResponse(deleteProjectFile(runtime, rpcBody));
    case "DeleteFiles":
      return protoResponse(deleteProjectFiles(runtime, rpcBody));
    case "CopyFile":
      return protoResponse(copyProjectFile(runtime, rpcBody));
    case "EditFile":
      return protoResponse(editProjectFile(runtime, rpcBody));
    case "GrepFiles":
      return protoResponse(grepProjectFiles(runtime, rpcBody));
    case "CreateFileStream":
      return protoResponse(createFileStream(runtime, rpcBody));
    case "WriteFileStream":
      return protoResponse(writeFileStream(runtime, rpcBody));
    case "AbortFileStream":
      return protoResponse(Buffer.alloc(0));
    case "UploadFile": {
      const responseBody = uploadFile(runtime, rpcBody);
      return isConnectProtoRequest ? connectStreamResponse([responseBody]) : protoResponse(responseBody);
    }
    case "ListProjectAssets":
      return protoResponse(listProjectAssets(runtime, rpcBody));
    case "RecordAsset":
      recordProjectAsset(runtime, rpcBody);
      return protoResponse(Buffer.alloc(0));
    case "SetAssetStatus":
      setProjectAssetStatus(runtime, rpcBody);
      return protoResponse(Buffer.alloc(0));
    case "DeleteAsset":
      deleteProjectAsset(runtime, rpcBody);
      return protoResponse(Buffer.alloc(0));
    case "GetMe":
      return protoResponse(encodeGetMeResponse(runtime.me));
    case "GetUsageStatus":
      return protoResponse(Buffer.alloc(0));
    case "UpdateOrgSettings":
      updateOrgSettings(runtime, rpcBody);
      return protoResponse(Buffer.alloc(0));
    case "GetOrgSettings":
      return protoResponse(encodeGetOrgSettingsResponse(runtime));
    case "ListOrgProjects":
      return protoResponse(encodeListProjectsResponse(runtime, decodeProtoEnumField(rpcBody, 1), decodeProtoBoolField(rpcBody, 2)));
    case "ListProjects":
      return protoResponse(encodeListProjectsResponse(runtime));
    case "MintPreviewToken":
      return protoResponse(encodeMintPreviewTokenResponse(runtime));
    case "MintHandoffToken":
    case "MintDesignSyncCode":
      return protoResponse(encodeTokenResponse());
    case "CountTokens":
      return protoResponse(await countGatewayTokens(runtime, rpcBody));
    case "Chat":
      return await chatWithGateway(runtime, rpcBody);
    case "TrackEvent":
      recordTrackEvent(runtime, rpcBody);
      return protoResponse(Buffer.alloc(0));
    case "CreateComment":
      return protoResponse(createComment(runtime, rpcBody));
    case "UpdateComment":
      return protoResponse(updateComment(runtime, rpcBody));
    case "DeleteComment":
      deleteComment(runtime, rpcBody);
      return protoResponse(Buffer.alloc(0));
    case "ListComments":
      return protoResponse(listComments(runtime, rpcBody));
    case "CreateCommentReply":
      return protoResponse(createCommentReply(runtime, rpcBody));
    case "UpdateCommentReply":
      return protoResponse(updateCommentReply(runtime, rpcBody));
    case "DeleteCommentReply":
      deleteCommentReply(runtime, rpcBody);
      return protoResponse(Buffer.alloc(0));
    case "SendCommentsToChat":
      return protoResponse(sendCommentsToChat(runtime, rpcBody));
    case "SendMultiplayerMessage":
      return protoResponse(sendMultiplayerMessage(runtime, rpcBody));
    case "DeleteAccount":
    case "DeleteOrganization":
      return protoResponse(Buffer.alloc(0));
    case "FigmaCallTool":
    case "McpCallTool":
      return protoResponse(encodeToolCallResponse(rpcName, rpcBody));
    case "FigmaDisconnect":
    case "FigmaExchangeCode":
    case "FigmaStartAuth":
    case "GithubDisconnect":
    case "GithubExchangeCode":
    case "GithubStartAuth":
      return protoResponse(encodeIntegrationAuthResponse(rpcName));
    case "FigmaListTools":
    case "GithubListRepos":
    case "GithubGetTree":
    case "GithubReadFile":
    case "GithubImportRepo":
      return protoResponse(encodeIntegrationListResponse(rpcName, rpcBody));
    case "RenewTurn":
    case "ReleaseTurn":
      return protoResponse(Buffer.alloc(0));
    case "MarkCommentsRead":
      return protoResponse(markCommentsRead(runtime, rpcBody));
    case "ListExperiences":
    case "TrackExperience":
    case "ExecuteExperienceAction":
    case "LintFiles":
    case "FigmaGetStatus":
    case "GithubGetStatus":
    case "McpListConnected":
    case "McpListConnectors":
    case "McpListDesignImportPartners":
    case "McpListTools":
      return protoResponse(Buffer.alloc(0));
    default:
      return protoResponse(Buffer.alloc(0));
  }
}

async function serveAsset(runtime, path, request) {
  const cached = readCachedAsset(runtime.store, path);
  if (cached) {
    const cachedBody = Buffer.from(cached.bodyBase64, "base64");
    const reusableFallback = isReusableFallbackAsset(cached, path);
    if ((!isFallbackAsset(cached) || reusableFallback) && isUsableServedAssetBody(path, cached.contentType, cachedBody)) {
      if (!reusableFallback) {
        recordDesignIndexAssetHint(runtime, path, "cache");
      }
      return binaryResponse(200, cachedBody, {
        "cache-control": reusableFallback ? "no-store" : "public, max-age=86400",
        "content-type": cached.contentType,
        "x-claude-design-asset-source": cached.upstreamUrl || "cache"
      });
    }
    deleteCachedAsset(runtime.store, path);
  }

  const localAsset = readLocalAsset(runtime.assetDir, path);
  if (localAsset && isUsableServedAssetBody(path, localAsset.contentType, localAsset.body)) {
    writeCachedAsset(runtime.store, path, localAsset.source, localAsset.contentType, localAsset.body);
    recordDesignIndexAssetHint(runtime, path, "local");
    return binaryResponse(200, localAsset.body, {
      "cache-control": "public, max-age=86400",
      "content-type": localAsset.contentType,
      "x-claude-design-asset-source": "local"
    });
  }

  if (runtime.assetProxy) {
    for (const origin of runtime.upstreamOrigins) {
      for (const upstreamUrl of upstreamAssetUrlCandidates(path, origin)) {
        const fetched = await fetchUpstreamAsset(upstreamUrl, request).catch((error) => {
          runtime.logger?.warn?.(
            `Claude Design failed to fetch upstream asset ${upstreamUrl.toString()}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        return undefined;
      });
      if (fetched && fetched.status >= 200 && fetched.status < 300 && isUsableServedAssetBody(path, fetched.contentType, fetched.body)) {
        writeCachedAsset(runtime.store, path, fetched.url || upstreamUrl.toString(), fetched.contentType, fetched.body);
        recordDesignIndexAssetHint(runtime, path, "remote");
        return binaryResponse(200, fetched.body, {
            "cache-control": "public, max-age=86400",
            "content-type": fetched.contentType,
            "x-claude-design-asset-source": fetched.url || upstreamUrl.toString()
          });
        }
        if (fetched) {
          logRejectedUpstreamAsset(runtime, path, upstreamUrl, fetched);
        }
      }
    }
  }

  const refreshedIndexAsset = await serveRefreshedDesignIndexAsset(runtime, path, request);
  if (refreshedIndexAsset) {
    return refreshedIndexAsset;
  }

  if (path === "/design/pictogram-bookapple.svg") {
    return textResponse(200, TRANSPARENT_SVG, {
      "cache-control": "public, max-age=86400",
      "content-type": "image/svg+xml"
    });
  }

  const fallback = fallbackDesignAsset(path);
  if (fallback) {
    if (isCacheableFallbackAsset(path)) {
      writeCachedAsset(runtime.store, path, fallbackAssetCacheSource(path), fallback.contentType, fallback.body);
    }
    return binaryResponse(200, fallback.body, {
      "cache-control": "no-store",
      "content-type": fallback.contentType,
      "x-claude-design-asset-source": "fallback"
    });
  }

  return jsonResponse(502, {
    error: {
      message: `Claude Design asset is not cached and upstream fetch failed: ${path}`,
      hint: "Provide the real Claude Design asset through config.assetDir or allow upstream asset proxying."
    }
  });
}

function logRejectedUpstreamAsset(runtime, path, upstreamUrl, fetched) {
  const message = `Claude Design rejected upstream asset ${upstreamUrl.toString()}: status=${fetched.status} content-type=${
    fetched.contentType || "unknown"
  } bytes=${fetched.body.length} final-url=${fetched.url || upstreamUrl.toString()}`;
  if (isCacheableFallbackAsset(path)) {
    runtime.logger?.debug?.(`${message}; using local fallback`);
    return;
  }
  runtime.logger?.warn?.(message);
}

async function serveRefreshedDesignIndexAsset(runtime, path, request) {
  const requestPath = normalizePath(path);
  const isScript = isDesignIndexScriptPath(requestPath);
  const isStyle = isDesignIndexStylePath(requestPath);
  if (!runtime.assetAutoUpdate || (!isScript && !isStyle)) {
    return undefined;
  }

  const refreshed = await resolveDesignIndexAssets(runtime, request, { force: true });
  const replacementPath = isScript ? refreshed.scriptPath : refreshed.stylePath;
  if (!replacementPath || replacementPath === requestPath) {
    return undefined;
  }

  const replacement = readResolvedDesignIndexAsset(runtime, replacementPath);
  if (!replacement || !isUsableDesignIndexAssetResponse(replacementPath, replacement.contentType, replacement.body)) {
    return undefined;
  }

  return binaryResponse(200, replacement.body, {
    "cache-control": "no-store",
    "content-type": replacement.contentType,
    "x-claude-design-asset-source": `${replacement.source}; replacement=${replacementPath}`
  });
}

function readResolvedDesignIndexAsset(runtime, path) {
  const cached = runtime.store ? readCachedAsset(runtime.store, path) : undefined;
  if (cached) {
    return {
      body: Buffer.from(cached.bodyBase64 || "", "base64"),
      contentType: cached.contentType,
      source: cached.upstreamUrl || "cache"
    };
  }
  const local = readLocalAsset(runtime.assetDir, path);
  return local
    ? {
        body: local.body,
        contentType: local.contentType,
        source: local.source
      }
    : undefined;
}

function fallbackDesignAsset(path) {
  if (!path.startsWith("/design/")) {
    return undefined;
  }
  if (!path.startsWith("/design/assets/") && !/\.(?:gif|png|webp|jpe?g|svg|ico)$/i.test(path)) {
    return undefined;
  }
  if (/\/QuestionsViewer-[^/]+\.js$/i.test(path)) {
    return {
      body: Buffer.from(questionsViewerFallbackModule(), "utf8"),
      contentType: "application/javascript; charset=utf-8"
    };
  }
  if (isDesignIndexScriptPath(path)) {
    return undefined;
  }
  if (path.endsWith(".js")) {
    return {
      body: Buffer.from(
        [
          "export function HandoffModal(){ return null; }",
          "export default function ClaudeDesignMissingChunk(){ return null; }"
        ].join("\n"),
        "utf8"
      ),
      contentType: "application/javascript; charset=utf-8"
    };
  }
  if (path.endsWith(".css")) {
    return {
      body: Buffer.alloc(0),
      contentType: "text/css; charset=utf-8"
    };
  }
  if (/\.(?:gif|png|webp|jpe?g|svg|ico)$/i.test(path)) {
    return {
      body: Buffer.from(TRANSPARENT_SVG, "utf8"),
      contentType: "image/svg+xml"
    };
  }
  return undefined;
}

function isCacheableFallbackAsset(path) {
  return path.startsWith("/design/assets/") &&
    !isDesignIndexScriptPath(path) &&
    !isDesignIndexStylePath(path) &&
    /\.(?:js|mjs|gif|png|webp|jpe?g|svg|ico)$/i.test(path);
}

function fallbackAssetCacheSource(path) {
  return `${FALLBACK_ASSET_CACHE_PREFIX}${path}`;
}

function isUsableAssetBody(path, contentType, body) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body || []);
  const normalizedContentType = stringValue(contentType)?.toLowerCase() || "";
  if (payload.length === 0 && /\.(?:js|mjs|css|json|wasm|png|jpe?g|gif|webp|svg|ico)$/i.test(path)) {
    return false;
  }
  if (normalizedContentType.includes("text/html") && !/\.html?$/i.test(path)) {
    return false;
  }
  if (/\.(?:js|mjs)$/i.test(path)) {
    return !normalizedContentType.includes("text/html");
  }
  if (/\.css$/i.test(path)) {
    return !normalizedContentType.includes("text/html");
  }
  return true;
}

function isUsableServedAssetBody(path, contentType, body) {
  if (!isUsableAssetBody(path, contentType, body)) {
    return false;
  }
  if (isDesignIndexScriptPath(path)) {
    return isUsableDesignIndexScriptBody(path, contentType, body);
  }
  return true;
}

function normalizeUpstreamOrigins(value, primaryOrigin) {
  const origins = [];
  const addOrigin = (origin) => {
    const raw = stringValue(origin);
    if (!raw) {
      return;
    }
    try {
      const parsed = new URL(raw);
      const normalized = `${parsed.protocol}//${parsed.host}`;
      if (!origins.includes(normalized)) {
        origins.push(normalized);
      }
    } catch {
      // Ignore malformed source origins; they cannot be used for asset proxying.
    }
  };
  addOrigin(primaryOrigin);
  if (Array.isArray(value)) {
    value.forEach(addOrigin);
  } else {
    addOrigin(value);
  }
  return origins.length > 0 ? origins : [DEFAULT_UPSTREAM_ORIGIN];
}

function upstreamAssetUrlCandidates(path, origin) {
  const requestPath = normalizePath(path);
  const candidates = [new URL(requestPath, origin)];
  if (requestPath.startsWith("/design/assets/")) {
    candidates.push(new URL(requestPath.replace(/^\/design\/assets\//, "/assets/"), origin));
    const assetName = requestPath.split("/").pop();
    if (assetName) {
      for (const baseUrl of DEFAULT_EXTERNAL_ASSET_BASE_URLS) {
        candidates.push(new URL(assetName, baseUrl));
      }
    }
  }
  const seen = new Set();
  return candidates.filter((url) => {
    const key = url.toString();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeFallbackRouteHosts(value, primaryHost) {
  const hosts = [];
  const addHost = (host) => {
    const raw = stringValue(host);
    if (!raw) {
      return;
    }
    const normalized = raw.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
    if (normalized && normalized !== primaryHost.toLowerCase() && !hosts.includes(normalized)) {
      hosts.push(normalized);
    }
  };
  DEFAULT_FALLBACK_ROUTE_HOSTS.forEach(addHost);
  if (Array.isArray(value)) {
    value.forEach(addHost);
  } else {
    addHost(value);
  }
  return hosts;
}

async function resolveDesignIndexAssets(runtime, request, options = {}) {
  const current = runtime.designIndexAssets || {
    checkedAt: 0,
    html: "",
    scriptPath: runtime.scriptPath || DEFAULT_SCRIPT_PATH,
    source: "default",
    stylePath: runtime.stylePath || DEFAULT_STYLE_PATH
  };
  if (!runtime.assetAutoUpdate) {
    return current;
  }

  const now = Date.now();
  const forceRefresh = options.force === true || requestHasNoCache(request);
  const hasRenderableIndex = isUsableDesignShellHtml(current.html) || Boolean(current.scriptPath || current.stylePath);
  if (!forceRefresh && hasRenderableIndex && current.checkedAt && now - current.checkedAt < DESIGN_INDEX_ASSET_DISCOVERY_TTL_MS) {
    return current;
  }

  const fromRequests = discoverRequestedDesignIndexAssets(runtime.store);
  const fromLocal = discoverLocalDesignIndexAssets(runtime.assetDir);
  const fromCache = discoverCachedDesignIndexAssets(runtime.store);
  const shouldDiscoverRemote = runtime.assetSource !== "claude-app";
  const fromRemote = shouldDiscoverRemote ? await discoverRemoteDesignIndexAssets(runtime, request) : undefined;
  const fromRemoteCache = shouldDiscoverRemote ? await cacheRemoteDesignIndexAssets(runtime, fromRemote, request) : undefined;
  const fallback = mergeDesignIndexAssetPartials(fromLocal, fromCache) || {};
  const seeded = {
    html: isUsableDesignShellHtml(fromLocal?.html) ? fromLocal.html : current.html,
    scriptPath: fallback.scriptPath || current.scriptPath,
    source: fallback.source || current.source || "current",
    stylePath: fallback.stylePath || current.stylePath
  };
  const discovered = mergeDesignIndexAssets(seeded, fromRequests, fromRemoteCache || fromRemote, fromLocal);
  const safeDiscovered = selectUsableDesignIndexAssets(runtime, discovered, fallback, current);
  return updateDesignIndexAssets(runtime, safeDiscovered, safeDiscovered.source || "discovered", { checkedAt: now });
}

async function resolveStandaloneDesignIndexAssets(runtime, request) {
  if (runtime.assetSource !== "claude-app") {
    return resolveDesignIndexAssets(runtime, request);
  }

  const current = runtime.standaloneDesignIndexAssets || {
    checkedAt: 0,
    html: "",
    scriptPath: DEFAULT_SCRIPT_PATH,
    source: "default",
    stylePath: DEFAULT_STYLE_PATH
  };
  if (!runtime.assetAutoUpdate) {
    return current;
  }

  const now = Date.now();
  const forceRefresh = requestHasNoCache(request);
  if (!forceRefresh && current.checkedAt && now - current.checkedAt < DESIGN_INDEX_ASSET_DISCOVERY_TTL_MS) {
    return current;
  }

  const fromCache = discoverCachedStandaloneDesignIndexAssets(runtime.store);
  const fromRemote = await discoverRemoteDesignIndexAssets(runtime, request);
  const fromRemoteCache = await cacheRemoteDesignIndexAssets(runtime, fromRemote, request);
  const discovered = mergeDesignIndexAssets(current, fromCache, fromRemoteCache || fromRemote);
  const assets = {
    checkedAt: now,
    html: "",
    scriptPath: shouldKeepCurrentScriptPath(discovered.scriptPath) ? discovered.scriptPath : DEFAULT_SCRIPT_PATH,
    source: discovered.source || current.source || "standalone",
    stylePath: shouldKeepCurrentStylePath(discovered.stylePath) ? discovered.stylePath : DEFAULT_STYLE_PATH,
    upstreamUrls: {
      ...(current.upstreamUrls || {}),
      ...(discovered.upstreamUrls || {})
    }
  };
  runtime.standaloneDesignIndexAssets = assets;
  return assets;
}

function requestHasNoCache(request) {
  return headerIncludes(request?.headers?.["cache-control"], "no-cache") ||
    headerIncludes(request?.headers?.pragma, "no-cache");
}

function updateDesignIndexAssets(runtime, assets, source, options = {}) {
  const current = runtime.designIndexAssets || {
    checkedAt: 0,
    html: "",
    scriptPath: runtime.scriptPath || DEFAULT_SCRIPT_PATH,
    source: "default",
    stylePath: runtime.stylePath || DEFAULT_STYLE_PATH
  };
  const candidateScriptPath = normalizePath(stringValue(assets?.scriptPath) || current.scriptPath || DEFAULT_SCRIPT_PATH);
  const candidateStylePath = normalizePath(stringValue(assets?.stylePath) || current.stylePath || DEFAULT_STYLE_PATH);
  const scriptPath = shouldKeepCurrentScriptPath(candidateScriptPath) ? candidateScriptPath : DEFAULT_SCRIPT_PATH;
  const stylePath = shouldKeepCurrentStylePath(candidateStylePath) ? candidateStylePath : DEFAULT_STYLE_PATH;
  const html = isUsableDesignShellHtml(assets?.html)
    ? String(assets.html)
    : isUsableDesignShellHtml(current.html)
      ? String(current.html)
      : "";
  runtime.scriptPath = scriptPath;
  runtime.stylePath = stylePath;
  runtime.designIndexAssets = {
    checkedAt: options.checkedAt ?? Date.now(),
    html,
    scriptPath,
    source,
    stylePath,
    upstreamUrls: {
      ...(current.upstreamUrls || {}),
      ...(assets?.upstreamUrls || {})
    }
  };
  return runtime.designIndexAssets;
}

function mergeDesignIndexAssets(current, ...candidates) {
  const merged = {
    html: isUsableDesignShellHtml(current.html) ? String(current.html) : "",
    scriptPath: shouldKeepCurrentScriptPath(current.scriptPath) ? current.scriptPath : DEFAULT_SCRIPT_PATH,
    source: current.source || "current",
    stylePath: shouldKeepCurrentStylePath(current.stylePath) ? current.stylePath : DEFAULT_STYLE_PATH,
    upstreamUrls: { ...(current.upstreamUrls || {}) }
  };
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (candidate.upstreamUrls) {
      merged.upstreamUrls = {
        ...merged.upstreamUrls,
        ...candidate.upstreamUrls
      };
    }
    if (isUsableDesignShellHtml(candidate.html)) {
      merged.html = String(candidate.html);
      merged.source = candidate.source || merged.source;
    }
    if (candidate.scriptPath) {
      merged.scriptPath = candidate.scriptPath;
      merged.source = candidate.source || merged.source;
    }
    if (candidate.stylePath) {
      merged.stylePath = candidate.stylePath;
      merged.source = candidate.source || merged.source;
    }
  }
  return merged;
}

function mergeDesignIndexAssetPartials(...candidates) {
  const merged = { source: "remote", upstreamUrls: {} };
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (candidate.upstreamUrls) {
      merged.upstreamUrls = {
        ...merged.upstreamUrls,
        ...candidate.upstreamUrls
      };
    }
    if (candidate.scriptPath) {
      merged.scriptPath = candidate.scriptPath;
      merged.source = candidate.source || merged.source;
    }
    if (candidate.stylePath) {
      merged.stylePath = candidate.stylePath;
      merged.source = candidate.source || merged.source;
    }
  }
  return merged.scriptPath || merged.stylePath ? merged : undefined;
}

function selectUsableDesignIndexAssets(runtime, discovered, fallback, current) {
  const currentScriptPath = shouldKeepCurrentScriptPath(current.scriptPath) ? current.scriptPath : DEFAULT_SCRIPT_PATH;
  const currentStylePath = shouldKeepCurrentStylePath(current.stylePath) ? current.stylePath : DEFAULT_STYLE_PATH;
  const html = isUsableDesignShellHtml(discovered.html)
    ? discovered.html
    : isUsableDesignShellHtml(current.html)
      ? current.html
      : "";
  const scriptPath = isUsableDesignIndexScript(runtime, discovered.scriptPath)
    ? discovered.scriptPath
    : isUsableDesignIndexScript(runtime, fallback.scriptPath)
      ? fallback.scriptPath
      : currentScriptPath;
  const stylePath = isUsableDesignIndexStyle(runtime, discovered.stylePath)
    ? discovered.stylePath
    : isUsableDesignIndexStyle(runtime, fallback.stylePath)
      ? fallback.stylePath
      : currentStylePath;
  const source = scriptPath === discovered.scriptPath || stylePath === discovered.stylePath
    ? discovered.source
    : fallback.source || current.source || "current";
  return { html, scriptPath, source, stylePath };
}

function recordDesignIndexAssetHint(runtime, path, source) {
  if (!runtime.assetAutoUpdate) {
    return;
  }
  const normalizedPath = normalizePath(path);
  if (isDesignIndexScriptPath(normalizedPath)) {
    if (!LEGACY_SCRIPT_PATHS.has(normalizedPath) && isAcceptableRequestedEntryScript(runtime, normalizedPath)) {
      updateDesignIndexAssets(runtime, { scriptPath: normalizedPath }, source);
    }
    return;
  }
  if (isDesignIndexStylePath(normalizedPath)) {
    if (!LEGACY_STYLE_PATHS.has(normalizedPath)) {
      updateDesignIndexAssets(runtime, { stylePath: normalizedPath }, source);
    }
  }
}

async function discoverRemoteDesignIndexAssets(runtime, request) {
  for (const origin of runtime.upstreamOrigins) {
    for (const shellUrl of upstreamDesignShellUrlCandidates(origin, runtime)) {
      const shell = await fetchUpstreamDesignShell(shellUrl, request).catch((error) => {
        runtime.logger?.warn?.(
          `Claude Design failed to discover upstream design assets from ${shellUrl.toString()}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return undefined;
      });
      if (!shell) {
        continue;
      }
      logRemoteDesignShell(runtime, shellUrl, shell);
      const assets = mergeDesignIndexAssetPartials(
        extractDesignIndexAssetsFromLinkHeaders(shell.linkHeaders, shell.url),
        extractDesignIndexAssetsFromHtml(shell.body, shell.url)
      );
      const html = isUsableDesignShellHtml(shell.body) ? shell.body : "";
      if (html || assets?.scriptPath || assets?.stylePath) {
        return {
          html,
          origin,
          scriptPath: assets?.scriptPath,
          source: "remote",
          stylePath: assets?.stylePath,
          upstreamUrls: assets?.upstreamUrls
        };
      }
    }
  }
  return undefined;
}

function logRemoteDesignShell(runtime, shellUrl, shell) {
  const summary = summarizeRemoteDesignShell(shell);
  runtime.logger?.warn?.(
    [
      "Claude Design upstream /design raw HTML:",
      `request-url=${shellUrl.toString()}`,
      `final-url=${shell.url || shellUrl.toString()}`,
      `status=${shell.status}`,
      `content-type=${shell.contentType || "unknown"}`,
      "----- BEGIN RAW HTML -----",
      shell.body || "",
      "----- END RAW HTML -----",
      "Claude Design upstream /design raw HTML summary:",
      `title=${summary.title || "unknown"}`,
      `has-assets-proxy=${summary.hasAssetsProxy}`,
      `has-design-assets=${summary.hasDesignAssets}`,
      `has-app-unavailable=${summary.hasAppUnavailable}`,
      `has-cloudflare-challenge=${summary.hasCloudflareChallenge}`,
      `module-scripts=${summary.moduleScripts.join(", ") || "none"}`,
      `stylesheets=${summary.stylesheets.join(", ") || "none"}`
    ].join("\n")
  );
}

function summarizeRemoteDesignShell(shell) {
  const html = String(shell?.body || "");
  return {
    hasAppUnavailable: /App unavailable in region/i.test(html),
    hasAssetsProxy: /https:\/\/assets-proxy\.anthropic\.com\/claude-ai\/v2\/assets\/v1\//i.test(html),
    hasCloudflareChallenge: /\bJust a moment\b|cf_chl|Performing security verification/i.test(html),
    hasDesignAssets: /(?:src|href)=["'][^"']*(?:\/design)?\/assets\//i.test(html),
    moduleScripts: firstMatches(html, /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, 5),
    stylesheets: firstMatches(html, /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, 5),
    title: firstMatch(html, /<title[^>]*>([^<]*)<\/title>/i)
  };
}

function firstMatch(value, pattern) {
  const match = pattern.exec(String(value || ""));
  return match?.[1]?.trim() || "";
}

function firstMatches(value, pattern, limit) {
  const matches = [];
  let match;
  while ((match = pattern.exec(String(value || ""))) && matches.length < limit) {
    matches.push(match[1]);
  }
  return matches;
}

function upstreamDesignShellUrlCandidates(origin, runtime) {
  const paths = ["/design"];
  const seen = new Set();
  return paths.map((path) => new URL(path, origin)).filter((url) => {
    const key = url.toString();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function resolveClaudeAppIonDistDir(options, logger) {
  const configured = [
    stringValue(options.claudeAppIonDistDir),
    stringValue(options.claudeAppAssetDir),
    stringValue(options.claudeAppPath),
    ...CLAUDE_APP_ION_DIST_ENV_KEYS.map((key) => stringValue(process.env[key])),
    ...CLAUDE_APP_PATH_ENV_KEYS.map((key) => stringValue(process.env[key])),
    ...defaultClaudeAppPathCandidates()
  ].filter(Boolean);

  const checked = [];
  for (const candidate of configured) {
    for (const ionDistDir of claudeAppIonDistCandidates(candidate)) {
      if (checked.includes(ionDistDir)) {
        continue;
      }
      checked.push(ionDistDir);
      if (isClaudeAppIonDistDir(ionDistDir)) {
        logger?.info?.(`Claude Design using Claude app assets from ${ionDistDir}`);
        return ionDistDir;
      }
    }
  }
  return "";
}

function defaultClaudeAppPathCandidates() {
  if (process.platform === "darwin") {
    return [
      "/Applications/Claude.app",
      "/Applications/Claude Desktop.app",
      pathModule.join(os.homedir(), "Applications", "Claude.app"),
      pathModule.join(os.homedir(), "Applications", "Claude Desktop.app")
    ];
  }
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || pathModule.join(os.homedir(), "AppData", "Local");
    const programFiles = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean);
    return [
      pathModule.join(localAppData, "Programs", "Claude"),
      pathModule.join(localAppData, "Programs", "Claude Desktop"),
      ...programFiles.flatMap((root) => [
        pathModule.join(root, "Claude"),
        pathModule.join(root, "Claude Desktop")
      ])
    ];
  }
  return [
    "/opt/Claude",
    "/opt/Claude/resources",
    pathModule.join(os.homedir(), ".local", "share", "Claude")
  ];
}

function claudeAppIonDistCandidates(candidate) {
  const expanded = expandHomePath(candidate);
  const resolved = pathModule.resolve(expanded);
  const candidates = [
    resolved,
    pathModule.join(resolved, "ion-dist"),
    pathModule.join(resolved, "resources", "ion-dist"),
    pathModule.join(resolved, "Resources", "ion-dist"),
    pathModule.join(resolved, "Contents", "Resources", "ion-dist")
  ];
  if (resolved.includes(`${pathModule.sep}Contents${pathModule.sep}MacOS${pathModule.sep}`)) {
    candidates.push(pathModule.resolve(resolved, "..", "..", "Resources", "ion-dist"));
  }
  if (resolved.endsWith(".app")) {
    candidates.push(pathModule.join(resolved, "Contents", "Resources", "ion-dist"));
  }
  return Array.from(new Set(candidates));
}

function expandHomePath(value) {
  const trimmed = stringValue(value);
  if (trimmed === "~") {
    return os.homedir();
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return pathModule.join(os.homedir(), trimmed.slice(2));
  }
  return trimmed;
}

function isClaudeAppIonDistDir(dir) {
  try {
    const root = pathModule.resolve(dir);
    return fs.statSync(root).isDirectory() &&
      fs.statSync(pathModule.join(root, "index.html")).isFile() &&
      fs.statSync(pathModule.join(root, "assets")).isDirectory();
  } catch {
    return false;
  }
}

async function cacheRemoteDesignIndexAssets(runtime, assets, request) {
  if (!assets || !runtime.assetProxy) {
    return undefined;
  }

  const cached = {
    html: isUsableDesignShellHtml(assets.html) ? assets.html : "",
    source: assets.source || "remote"
  };
  const scriptPath = normalizePath(assets.scriptPath);
  if (scriptPath) {
    if (
      isUsableDesignIndexScript(runtime, scriptPath) ||
      await fetchAndCacheRemoteDesignIndexAsset(runtime, scriptPath, request, assets.origin, assets.upstreamUrls?.[scriptPath])
    ) {
      cached.scriptPath = scriptPath;
    }
  }

  const stylePath = normalizePath(assets.stylePath);
  if (stylePath) {
    if (
      isUsableDesignIndexStyle(runtime, stylePath) ||
      await fetchAndCacheRemoteDesignIndexAsset(runtime, stylePath, request, assets.origin, assets.upstreamUrls?.[stylePath])
    ) {
      cached.stylePath = stylePath;
    }
  }

  if (cached.html || cached.scriptPath || cached.stylePath) {
    cached.upstreamUrls = assets.upstreamUrls;
    return cached;
  }
  return undefined;
}

async function fetchAndCacheRemoteDesignIndexAsset(runtime, path, request, preferredOrigin, preferredAssetUrl) {
  const origins = preferredOrigin
    ? [preferredOrigin, ...runtime.upstreamOrigins.filter((origin) => origin !== preferredOrigin)]
    : runtime.upstreamOrigins;
  const explicitUrl = parseAbsoluteHttpUrl(preferredAssetUrl);
  if (explicitUrl) {
    const fetched = await fetchAndMaybeCacheDesignIndexAsset(runtime, path, explicitUrl, request);
    if (fetched) {
      return true;
    }
  }
  for (const origin of origins) {
    for (const upstreamUrl of upstreamAssetUrlCandidates(path, origin)) {
      const fetched = await fetchAndMaybeCacheDesignIndexAsset(runtime, path, upstreamUrl, request);
      if (fetched) {
        return true;
      }
    }
  }
  return false;
}

async function fetchAndMaybeCacheDesignIndexAsset(runtime, path, upstreamUrl, request) {
  const fetched = await fetchUpstreamAsset(upstreamUrl, request).catch((error) => {
    runtime.logger?.warn?.(
      `Claude Design failed to fetch upstream index asset ${upstreamUrl.toString()}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return undefined;
  });
  if (fetched && fetched.status >= 200 && fetched.status < 300 && isUsableDesignIndexAssetResponse(path, fetched.contentType, fetched.body)) {
    writeCachedAsset(runtime.store, path, fetched.url || upstreamUrl.toString(), fetched.contentType, fetched.body);
    return true;
  }
  if (fetched) {
    logRejectedUpstreamAsset(runtime, path, upstreamUrl, fetched);
  }
  return false;
}

function isUsableDesignIndexAssetResponse(path, contentType, body) {
  if (!isUsableAssetBody(path, contentType, body)) {
    return false;
  }
  if (isDesignIndexScriptPath(path)) {
    return isUsableDesignIndexScriptBody(path, contentType, body);
  }
  return isDesignIndexStylePath(path);
}

function discoverRequestedDesignIndexAssets(store) {
  const rows = queryRows(
    store.database,
    `SELECT path
       FROM claude_design_requests
      WHERE path LIKE '/design/assets/index-%'
         OR path LIKE '/design/assets/%/index-%'
      ORDER BY id DESC
      LIMIT 100`,
    []
  );
  const assets = { source: "request-hint" };
  for (const row of rows) {
    const requestPath = normalizePath(row.path);
    if (!assets.scriptPath && isDesignIndexScriptPath(requestPath) && !LEGACY_SCRIPT_PATHS.has(requestPath) && isUsableCachedEntryScript(store, requestPath)) {
      assets.scriptPath = requestPath;
    }
    if (!assets.stylePath && isDesignIndexStylePath(requestPath) && !LEGACY_STYLE_PATHS.has(requestPath) && isUsableCachedEntryStyle(store, requestPath)) {
      assets.stylePath = requestPath;
    }
    if (assets.scriptPath && assets.stylePath) {
      return assets;
    }
  }
  return assets.scriptPath || assets.stylePath ? assets : undefined;
}

function discoverCachedDesignIndexAssets(store) {
  const rows = queryRows(
    store.database,
    `SELECT path, content_type, body_base64, fetched_at
       FROM claude_design_assets
      WHERE path LIKE '/design/assets/index-%'
         OR path LIKE '/design/assets/%/index-%'
      ORDER BY fetched_at DESC`,
    []
  );
  const assets = { source: "cache" };
  for (const row of rows) {
    const requestPath = normalizePath(row.path);
    const body = Buffer.from(row.body_base64 || "", "base64");
    if (!isUsableAssetBody(requestPath, row.content_type, body)) {
      continue;
    }
    if (!assets.scriptPath && isUsableDesignIndexScriptBody(requestPath, row.content_type, body)) {
      assets.scriptPath = requestPath;
    }
    if (!assets.stylePath && isDesignIndexStylePath(requestPath)) {
      assets.stylePath = requestPath;
    }
    if (assets.scriptPath && assets.stylePath) {
      return assets;
    }
  }
  return assets.scriptPath || assets.stylePath ? assets : undefined;
}

function discoverCachedStandaloneDesignIndexAssets(store) {
  const rows = queryRows(
    store.database,
    `SELECT path, content_type, body_base64, fetched_at
       FROM claude_design_assets
      WHERE path LIKE '/design/assets/index-%'
         OR path LIKE '/design/assets/%/index-%'
      ORDER BY fetched_at DESC`,
    []
  );
  const assets = { source: "standalone-cache" };
  for (const row of rows) {
    const requestPath = normalizePath(row.path);
    const body = Buffer.from(row.body_base64 || "", "base64");
    if (!isUsableAssetBody(requestPath, row.content_type, body)) {
      continue;
    }
    if (!assets.scriptPath && isStandaloneDesignIndexScriptBody(requestPath, row.content_type, body)) {
      assets.scriptPath = requestPath;
    }
    if (!assets.stylePath && isDesignIndexStylePath(requestPath)) {
      assets.stylePath = requestPath;
    }
    if (assets.scriptPath && assets.stylePath) {
      return assets;
    }
  }
  return assets.scriptPath || assets.stylePath ? assets : undefined;
}

function discoverLocalDesignIndexAssets(assetDir) {
  if (!assetDir) {
    return undefined;
  }
  const localRoot = localAssetRootInfo(assetDir);
  const assetRoot = localRoot.kind === "claude-app-ion-dist"
    ? pathModule.join(localRoot.root, "assets")
    : localRoot.root;
  const scripts = [];
  const styles = [];
  for (const entry of listLocalAssetFiles(assetRoot)) {
    const requestPath = `/design/assets/${entry.relativePath}`;
    if (!isDesignIndexScriptPath(requestPath) && !isDesignIndexStylePath(requestPath)) {
      continue;
    }
    if (isDesignIndexStylePath(requestPath)) {
      styles.push({ mtimeMs: entry.stat.mtimeMs, path: requestPath, size: entry.stat.size });
      continue;
    }
    let body;
    try {
      body = fs.readFileSync(entry.file);
    } catch {
      continue;
    }
    scripts.push({
      mtimeMs: entry.stat.mtimeMs,
      path: requestPath,
      score: designEntryScriptScore(requestPath, body, entry.stat),
      size: entry.stat.size
    });
  }
  scripts.sort((a, b) => b.score - a.score || b.mtimeMs - a.mtimeMs || b.size - a.size);
  styles.sort((a, b) => b.mtimeMs - a.mtimeMs || b.size - a.size);
  const assets = {
    html: localRoot.kind === "claude-app-ion-dist" ? readLocalClaudeAppShellHtml(localRoot.root) : "",
    scriptPath: scripts[0]?.path,
    source: localRoot.kind === "claude-app-ion-dist" ? "claude-app" : "local",
    stylePath: styles[0]?.path
  };
  return assets.html || assets.scriptPath || assets.stylePath ? assets : undefined;
}

function localAssetDirExists(assetDir) {
  if (!assetDir) {
    return false;
  }
  try {
    return fs.statSync(pathModule.resolve(expandHomePath(assetDir))).isDirectory();
  } catch {
    return false;
  }
}

function localAssetRootInfo(assetDir) {
  const root = pathModule.resolve(expandHomePath(assetDir));
  return isClaudeAppIonDistDir(root)
    ? { kind: "claude-app-ion-dist", root }
    : { kind: "design-assets", root };
}

function readLocalClaudeAppShellHtml(root) {
  const indexPath = pathModule.join(root, "index.html");
  try {
    const html = fs.readFileSync(indexPath, "utf8");
    return isUsableDesignShellHtml(html) ? html : "";
  } catch {
    return "";
  }
}

function listLocalAssetFiles(assetRoot) {
  const files = [];
  const stack = [""];
  while (stack.length) {
    const relativeDir = stack.pop();
    const absoluteDir = pathModule.join(assetRoot, relativeDir);
    let entries;
    try {
      entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const relativePath = pathModule.join(relativeDir, entry.name);
      const file = pathModule.join(assetRoot, relativePath);
      if (entry.isDirectory()) {
        stack.push(relativePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      let stat;
      try {
        stat = fs.statSync(file);
      } catch {
        continue;
      }
      files.push({
        file,
        relativePath: relativePath.split(pathModule.sep).join("/"),
        stat
      });
    }
  }
  return files;
}

function isDesignIndexScriptPath(path) {
  return /^\/design\/assets\/(?:v\d+\/)?index-[^/]+\.js$/i.test(path);
}

function isDesignIndexStylePath(path) {
  return /^\/design\/assets\/(?:v\d+\/)?index-[^/]+\.css$/i.test(path);
}

function shouldKeepCurrentScriptPath(path) {
  const normalizedPath = normalizePath(path);
  return isDesignIndexScriptPath(normalizedPath) && !LEGACY_SCRIPT_PATHS.has(normalizedPath);
}

function shouldKeepCurrentStylePath(path) {
  const normalizedPath = normalizePath(path);
  return isDesignIndexStylePath(normalizedPath) && !LEGACY_STYLE_PATHS.has(normalizedPath);
}

function isUsableDesignIndexScript(runtime, path) {
  const normalizedPath = normalizePath(path);
  if (!isDesignIndexScriptPath(normalizedPath)) {
    return false;
  }
  if (LEGACY_SCRIPT_PATHS.has(normalizedPath)) {
    return false;
  }
  if (runtime?.store && isUsableCachedEntryScript(runtime.store, normalizedPath)) {
    return true;
  }
  return isUsableLocalEntryScript(runtime?.assetDir, normalizedPath);
}

function isUsableDesignIndexStyle(runtime, path) {
  const normalizedPath = normalizePath(path);
  if (!isDesignIndexStylePath(normalizedPath)) {
    return false;
  }
  if (LEGACY_STYLE_PATHS.has(normalizedPath)) {
    return false;
  }
  if (runtime?.store && isUsableCachedEntryStyle(runtime.store, normalizedPath)) {
    return true;
  }
  return Boolean(readLocalAsset(runtime?.assetDir, normalizedPath));
}

function isUsableCachedEntryScript(store, path) {
  const cached = readCachedAsset(store, path);
  if (!cached) {
    return false;
  }
  const body = Buffer.from(cached.bodyBase64 || "", "base64");
  return !isFallbackAsset(cached) && isUsableDesignIndexScriptBody(path, cached.contentType, body);
}

function isUsableCachedEntryStyle(store, path) {
  const cached = readCachedAsset(store, path);
  if (!cached) {
    return false;
  }
  const body = Buffer.from(cached.bodyBase64 || "", "base64");
  return !isFallbackAsset(cached) && isUsableAssetBody(path, cached.contentType, body) && isDesignIndexStylePath(path);
}

function isUsableLocalEntryScript(assetDir, path) {
  const localAsset = readLocalAsset(assetDir, path);
  return Boolean(localAsset && isUsableDesignIndexScriptBody(path, localAsset.contentType, localAsset.body));
}

function isAcceptableRequestedEntryScript(runtime, path) {
  const cached = runtime?.store ? readCachedAsset(runtime.store, path) : undefined;
  if (!cached) {
    return true;
  }
  const body = Buffer.from(cached.bodyBase64 || "", "base64");
  if (!isUsableAssetBody(path, cached.contentType, body)) {
    return true;
  }
  return isUsableDesignIndexScriptBody(path, cached.contentType, body);
}

function isUsableDesignIndexScriptBody(path, contentType, body) {
  return isDesignIndexScriptPath(path) && isUsableAssetBody(path, contentType, body);
}

function isStandaloneDesignIndexScriptBody(path, contentType, body) {
  if (!isUsableDesignIndexScriptBody(path, contentType, body)) {
    return false;
  }
  const text = body.toString("utf8", 0, Math.min(body.length, 2 * 1024 * 1024));
  return [
    "anthropic.omelette.api.v1alpha.OmeletteService",
    "/v1/design",
    "/design/v1/design",
    "__OMELETTE_ME__"
  ].some((marker) => text.includes(marker));
}

function isDesignEntryScriptBuffer(path, body) {
  return isDesignIndexScriptPath(path) && designEntryScriptScore(path, body, { mtimeMs: 0, size: body.length }) > 1_000_000;
}

function designEntryScriptScore(path, body, stat) {
  if (!isDesignIndexScriptPath(path)) {
    return 0;
  }
  const text = body.toString("utf8", 0, Math.min(body.length, 2 * 1024 * 1024));
  const designMarkers = [
    "anthropic.omelette.api.v1alpha.OmeletteService",
    "/v1/design",
    "/design/v1/design",
    "__OMELETTE_ME__",
    "desktop_design_entrypoint",
    "DiscoverDesignRoute",
    "claude_ai_omelette_enabled",
    "path:\"design\"",
    "OmeletteService"
  ];
  if (!designMarkers.some((marker) => text.includes(marker))) {
    return 0;
  }
  let score = Number(stat.size || body.length);
  if (text.includes("__vite__mapDeps")) {
    score += 1_000_000;
  }
  if (text.includes("createRoot")) {
    score += 1_000_000;
  }
  if (text.includes("document.getElementById")) {
    score += 500_000;
  }
  if (text.includes("ProjectPage") || text.includes("ProjectsPage")) {
    score += 250_000;
  }
  return score;
}

function extractDesignIndexAssetsFromHtml(body, baseUrl) {
  const html = String(body || "");
  const assets = { source: "remote-html", upstreamUrls: {} };
  const pattern = /\b(?:src|href)=["']([^"']+)["']/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const asset = normalizeDesignAssetReference(match[1], baseUrl);
    if (asset.upstreamUrl) {
      assets.upstreamUrls[asset.path] = asset.upstreamUrl;
    }
    if (isDesignIndexScriptPath(asset.path)) {
      assets.scriptPath = asset.path;
    } else if (isDesignIndexStylePath(asset.path)) {
      assets.stylePath = asset.path;
    }
  }
  return assets.scriptPath || assets.stylePath ? assets : undefined;
}

function extractDesignIndexAssetsFromLinkHeaders(linkHeaders, baseUrl) {
  const headers = Array.isArray(linkHeaders) ? linkHeaders : linkHeaders ? [linkHeaders] : [];
  const assets = { source: "remote-link", upstreamUrls: {} };
  for (const header of headers) {
    const pattern = /<([^>]+)>/g;
    let match;
    while ((match = pattern.exec(String(header)))) {
      const asset = normalizeDesignAssetReference(match[1], baseUrl);
      if (asset.upstreamUrl) {
        assets.upstreamUrls[asset.path] = asset.upstreamUrl;
      }
      if (isDesignIndexScriptPath(asset.path)) {
        assets.scriptPath = asset.path;
      } else if (isDesignIndexStylePath(asset.path)) {
        assets.stylePath = asset.path;
      }
    }
  }
  return assets.scriptPath || assets.stylePath ? assets : undefined;
}

function normalizeDesignAssetPath(value, baseUrl) {
  return normalizeDesignAssetReference(value, baseUrl).path;
}

function normalizeDesignAssetReference(value, baseUrl) {
  const raw = stringValue(value);
  if (!raw) {
    return { path: "" };
  }
  try {
    const parsed = new URL(raw, normalizeDesignAssetBaseUrl(baseUrl));
    const path = normalizeDesignAssetRequestPath(parsed.pathname);
    return {
      path,
      ...(isDesignAssetFilePath(path) && /^https?:$/i.test(parsed.protocol) ? { upstreamUrl: parsed.toString() } : {})
    };
  } catch {
    return { path: normalizeDesignAssetRequestPath(raw.split("?")[0]) };
  }
}

function normalizeDesignAssetBaseUrl(baseUrl) {
  const value = stringValue(baseUrl) || DEFAULT_UPSTREAM_ORIGIN;
  try {
    const parsed = new URL(value);
    if (parsed.pathname === "/design") {
      parsed.pathname = "/design/";
    }
    return parsed.toString();
  } catch {
    return value;
  }
}

function normalizeDesignAssetRequestPath(value) {
  const normalizedPath = normalizePath(value);
  if (normalizedPath.startsWith("/design/assets/")) {
    return normalizedPath;
  }
  if (normalizedPath.startsWith("/assets/")) {
    return `/design${normalizedPath}`;
  }
  const assetPath = designAssetFileName(normalizedPath);
  if (assetPath) {
    return `/design/assets/${assetPath}`;
  }
  return normalizedPath;
}

function designAssetFileName(path) {
  const match = normalizePath(path).match(/\/assets\/((?:v\d+\/)?[^/?#]+\.(?:css|js|mjs|avif|gif|ico|jpe?g|json|png|svg|webp|woff2?))$/i);
  return match?.[1];
}

function isDesignAssetFilePath(path) {
  return /^\/design\/assets\/(?:[^/?#]+\/)*[^/?#]+\.(?:css|js|mjs|avif|gif|ico|jpe?g|json|png|svg|webp|woff2?)$/i.test(normalizePath(path));
}

function questionsViewerFallbackModule() {
  return `
const REACT_ELEMENT = Symbol.for("react.transitional.element");

function e(type, props, ...children) {
  const nextProps = { ...(props || {}) };
  if (children.length === 1) {
    nextProps.children = children[0];
  } else if (children.length > 1) {
    nextProps.children = children;
  }
  return {
    $$typeof: REACT_ELEMENT,
    key: nextProps.key == null ? null : String(nextProps.key),
    props: nextProps,
    ref: nextProps.ref == null ? null : nextProps.ref,
    type
  };
}

const styles = {
  button: {
    background: "#1f1e1d",
    border: "0",
    borderRadius: 6,
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    padding: "9px 12px"
  },
  form: {
    boxSizing: "border-box",
    color: "#1f1e1d",
    display: "flex",
    flexDirection: "column",
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    gap: 16,
    height: "100%",
    overflow: "auto",
    padding: 24
  },
  option: {
    alignItems: "center",
    border: "1px solid #dedbd4",
    borderRadius: 6,
    display: "flex",
    gap: 8,
    padding: "8px 10px"
  },
  question: {
    background: "#fff",
    border: "1px solid #e8e3db",
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 14
  },
  secondaryButton: {
    background: "transparent",
    border: "1px solid #cfc9bf",
    borderRadius: 6,
    color: "#403d39",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    padding: "9px 12px"
  }
};

function normalizeSpec(spec) {
  const record = spec && typeof spec === "object" && !Array.isArray(spec) ? spec : {};
  const questions = Array.isArray(record.questions) ? record.questions : [];
  return {
    title: typeof record.title === "string" && record.title.trim() ? record.title : "Claude has some questions",
    questions: questions.map((question, index) => normalizeQuestion(question, index)).filter(Boolean)
  };
}

function normalizeQuestion(question, index) {
  const record = question && typeof question === "object" && !Array.isArray(question) ? question : {};
  const title = String(record.title || record.question || record.label || "Question " + (index + 1));
  const rawOptions = Array.isArray(record.options) ? record.options : [];
  const options = rawOptions.map((option) => String(option)).filter(Boolean);
  let kind = String(record.kind || "").trim();
  if (!["text-options", "svg-options", "slider", "file", "freeform"].includes(kind)) {
    kind = record.isSvg ? "svg-options" : options.length > 0 ? "text-options" : "freeform";
  }
  if ((kind === "text-options" || kind === "svg-options") && options.length === 0) {
    kind = "freeform";
  }
  return {
    accept: typeof record.accept === "string" ? record.accept : undefined,
    default: record.default,
    id: String(record.id || record.name || title).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "question_" + (index + 1),
    kind,
    max: record.max,
    min: record.min,
    multi: record.multi === true,
    options,
    step: record.step,
    subtitle: typeof record.subtitle === "string" ? record.subtitle : "",
    title
  };
}

function field(question) {
  if (question.kind === "slider") {
    return e("input", {
      defaultValue: question.default ?? question.min ?? 0,
      max: question.max ?? 100,
      min: question.min ?? 0,
      name: question.id,
      step: question.step ?? 1,
      style: { width: "100%" },
      type: "range"
    });
  }
  if (question.kind === "file") {
    return e("input", {
      accept: question.accept || undefined,
      name: question.id,
      type: "file"
    });
  }
  if (question.kind === "freeform") {
    return e("textarea", {
      name: question.id,
      placeholder: "Type your answer",
      rows: 4,
      style: { border: "1px solid #d8d2c8", borderRadius: 6, font: "inherit", padding: 10, resize: "vertical" }
    });
  }
  const type = question.multi ? "checkbox" : "radio";
  return e(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 8 } },
    ...question.options.map((option, index) =>
      e(
        "label",
        { key: question.id + "-" + index, style: styles.option },
        e("input", {
          defaultChecked: index === 0,
          name: question.id,
          type,
          value: option
        }),
        question.kind === "svg-options"
          ? e("span", { dangerouslySetInnerHTML: { __html: option }, style: { display: "inline-flex", height: 52, width: 72 } })
          : e("span", { style: { lineHeight: 1.35 } }, option)
      )
    )
  );
}

export function QuestionsViewer(props) {
  const spec = normalizeSpec(props && props.spec);
  const submit = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const answers = {};
    for (const question of spec.questions) {
      const values = data.getAll(question.id).map((value) => String(value)).filter(Boolean);
      answers[question.id] = question.multi ? values.join(", ") : values[0] || "";
    }
    props && typeof props.onSubmit === "function" && props.onSubmit(answers, []);
  };
  return e(
    "form",
    { onSubmit: submit, style: styles.form },
    e("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
      e("h2", { style: { fontSize: 20, lineHeight: 1.2, margin: 0 } }, spec.title),
      props && props.streaming ? e("p", { style: { color: "#766f65", fontSize: 13, margin: 0 } }, "Claude is preparing questions...") : null
    ),
    ...spec.questions.map((question) =>
      e(
        "section",
        { key: question.id, style: styles.question },
        e("div", null,
          e("div", { style: { fontSize: 14, fontWeight: 650, lineHeight: 1.3 } }, question.title),
          question.subtitle ? e("div", { style: { color: "#766f65", fontSize: 12, marginTop: 3 } }, question.subtitle) : null
        ),
        field(question)
      )
    ),
    e("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" } },
      e("button", {
        onClick: () => props && typeof props.onTimeout === "function" && props.onTimeout(),
        style: styles.secondaryButton,
        type: "button"
      }, "Use defaults"),
      e("button", { style: styles.button, type: "submit" }, "Submit answers")
    )
  );
}

export default QuestionsViewer;
`;
}

function handleOrganizationApi(runtime, method, path, request, requestBody) {
  const parts = path.split("/").filter(Boolean);
  const organizationUuid = parts[2] || runtime.me.organizationUuid;
  const tail = parts.slice(3);

  if (tail.length === 0) {
    return jsonResponse(200, organizationPayload(runtime.me, organizationUuid));
  }

  const first = tail[0];
  if (["members", "memberships"].includes(first)) {
    return jsonResponse(200, runtime.me.memberships || []);
  }
  if (["models", "model_presets", "model-presets"].includes(first)) {
    return jsonResponse(200, runtime.me.modelPresets || []);
  }
  if (["features", "feature_flags", "growthbook", "experiments"].includes(first)) {
    return jsonResponse(200, featureFlagsPayload(runtime.me));
  }
  if (["settings", "billing", "oauth_tokens", "oauth-tokens"].includes(first)) {
    return jsonResponse(200, { ok: true, organization_uuid: organizationUuid });
  }

  const collection = canonicalCollection(first);
  if (collection && tail.length === 1) {
    if (method === "GET") {
      return jsonResponse(200, listItems(runtime.store, collection, organizationUuid));
    }
    if (method === "POST") {
      return jsonResponse(201, createItem(runtime.store, collection, organizationUuid, parseJsonBody(requestBody), runtime.me));
    }
  }

  if (collection && tail.length >= 2) {
    const itemUuid = tail[1];
    const subresource = tail[2];

    if (subresource === "messages" || subresource === "turns") {
      if (method === "GET") {
        return jsonResponse(200, getItemMessages(runtime.store, collection, itemUuid));
      }
      if (method === "POST") {
        return jsonResponse(201, appendItemMessage(runtime.store, collection, organizationUuid, itemUuid, parseJsonBody(requestBody), runtime.me));
      }
    }

    if (["completion", "completions", "generate", "run"].includes(subresource)) {
      const wantsSse = headerIncludes(request.headers.accept, "text/event-stream");
      if (wantsSse) {
        return sseCompletionResponse(itemUuid);
      }
      return jsonResponse(200, completionPayload(itemUuid));
    }

    if (method === "GET") {
      return jsonResponse(200, getItem(runtime.store, collection, organizationUuid, itemUuid, runtime.me));
    }
    if (method === "PATCH" || method === "PUT") {
      return jsonResponse(200, updateItem(runtime.store, collection, organizationUuid, itemUuid, parseJsonBody(requestBody), runtime.me));
    }
    if (method === "DELETE") {
      deleteItem(runtime.store, collection, itemUuid);
      return jsonResponse(200, { deleted: true, id: itemUuid, uuid: itemUuid });
    }
  }

  return handleGenericApi(method, path, requestBody);
}

function handleGenericApi(method, path, requestBody) {
  if (method === "GET") {
    return jsonResponse(200, {
      count: 0,
      data: [],
      items: [],
      ok: true,
      path,
      results: []
    });
  }

  if (method === "DELETE") {
    return jsonResponse(200, { deleted: true, ok: true, path });
  }

  const payload = parseJsonBody(requestBody);
  return jsonResponse(200, {
    created_at: new Date().toISOString(),
    id: randomUuid(),
    ok: true,
    path,
    request: payload,
    uuid: randomUuid()
  });
}

async function handleAdminRequest(runtime, backend, request, response, helpers) {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  const method = (request.method || "GET").toUpperCase();
  const path = normalizePath(url.pathname);

  if (method === "GET" && path === "/plugins/claude-design") {
    helpers.sendJson(response, 200, {
      autoAnswerQuestions: runtime.autoAnswerQuestions,
      backend: backend.url,
      dbFile: runtime.store.dbFile,
      defaultGatewayModel: runtime.defaultGatewayModel,
      designIndexAssets: runtime.designIndexAssets,
      frontendDefaultModel: runtime.frontendDefaultModel,
      gatewayConfigPath: runtime.gatewayConfigPath,
      gatewayModels: runtime.gatewayModelPresets,
      plugin: "claude-design",
      proxy: {
        assetDir: runtime.assetDir,
        assetPassthrough: runtime.assetPassthrough,
        assetSource: runtime.assetSource,
        fallbackHosts: runtime.fallbackRouteHosts,
        host: runtime.routeHost,
        paths: runtime.routePaths
      },
      upstreamOrigins: runtime.upstreamOrigins,
      routes: {
        assets: "/plugins/claude-design/assets",
        projects: "/plugins/claude-design/projects",
        requests: "/plugins/claude-design/requests",
        responses: "/plugins/claude-design/responses"
      }
    });
    return;
  }

  if (method === "GET" && path === "/plugins/claude-design/requests") {
    helpers.sendJson(response, 200, {
      requests: listRequests(runtime.store, numberValue(url.searchParams.get("limit")) || 100)
    });
    return;
  }

  if (method === "GET" && path === "/plugins/claude-design/assets") {
    helpers.sendJson(response, 200, {
      assets: listCachedAssets(runtime.store)
    });
    return;
  }

  if (method === "GET" && path === "/plugins/claude-design/projects") {
    helpers.sendJson(response, 200, {
      projects: listOmeletteProjects(runtime)
    });
    return;
  }

  if (method === "DELETE" && path === "/plugins/claude-design/assets") {
    runtime.store.database.run("DELETE FROM claude_design_assets");
    runtime.store.persist();
    helpers.sendJson(response, 200, { cleared: true });
    return;
  }

  if (method === "DELETE" && path === "/plugins/claude-design/requests") {
    runtime.store.database.run("DELETE FROM claude_design_requests");
    runtime.store.persist();
    helpers.sendJson(response, 200, { cleared: true });
    return;
  }

  if (method === "GET" && path === "/plugins/claude-design/responses") {
    helpers.sendJson(response, 200, {
      responses: listStoredResponses(runtime.store)
    });
    return;
  }

  if ((method === "POST" || method === "PUT") && path === "/plugins/claude-design/responses") {
    const body = await helpers.readJson(request);
    const record = isRecord(body) ? body : {};
    const mockMethod = stringValue(record.method)?.toUpperCase() || "ANY";
    const mockPath = normalizePath(stringValue(record.path) || "");
    if (!mockPath) {
      helpers.sendJson(response, 400, { error: { message: "path is required." } });
      return;
    }

    const status = numberValue(record.status) || 200;
    const headers = isRecord(record.headers) ? record.headers : { "content-type": "application/json; charset=utf-8" };
    const responseBody = record.body === undefined ? {} : record.body;
    upsertStoredResponse(runtime.store, mockMethod, mockPath, status, headers, responseBody);
    helpers.sendJson(response, 200, {
      method: mockMethod,
      path: mockPath,
      stored: true
    });
    return;
  }

  if (method === "DELETE" && path === "/plugins/claude-design/responses") {
    const mockMethod = (url.searchParams.get("method") || "ANY").toUpperCase();
    const mockPath = normalizePath(url.searchParams.get("path") || "");
    if (!mockPath) {
      helpers.sendJson(response, 400, { error: { message: "path query parameter is required." } });
      return;
    }
    runtime.store.database.run("DELETE FROM claude_design_responses WHERE method = ? AND path = ?", [mockMethod, mockPath]);
    runtime.store.persist();
    helpers.sendJson(response, 200, {
      deleted: true,
      method: mockMethod,
      path: mockPath
    });
    return;
  }

  helpers.sendJson(response, 404, {
    error: {
      message: `Unknown Claude Design admin route: ${method} ${path}`
    }
  });
}

function bootstrapPayload(me) {
  const account = accountPayload(me);
  const organization = organizationPayload(me, me.organizationUuid);
  const featureFlags = featureFlagsPayload(me);
  const growthbook = featureFlags.growthbook;
  const statsig = statsigPayload();
  return {
    account,
    accountUuid: me.accountUuid,
    activeOrganizationUuid: me.organizationUuid,
    canManageDs: me.canManageDs,
    cowork_sysprompt_map: null,
    current_user_access: currentUserAccessPayload(me),
    defaultModelId: me.defaultModelId,
    displayName: me.displayName,
    email: me.email,
    featureFlagsOrgUuid: me.organizationUuid,
    features: featureFlags.features,
    gated_imports: {},
    gated_imports_build_id: "",
    gated_messages: null,
    growthbook,
    growthbookPayload: growthbook,
    me,
    memberships: me.memberships || [],
    memory_mode: "off",
    model_selector_config: {},
    model_selector_state: {},
    modelPresets: me.modelPresets || [],
    org_growthbook: growthbook,
    org_statsig: statsig,
    organization,
    organizationUuid: me.organizationUuid,
    organizations: organizationsPayload(me),
    server_localizations: {},
    settings: organization.settings,
    statsig,
    system_prompts: {},
    user: account
  };
}

function accountPayload(me) {
  const organizations = organizationsPayload(me);
  return {
    account_uuid: me.accountUuid,
    accountUuid: me.accountUuid,
    display_name: me.displayName,
    displayName: me.displayName,
    email: me.email,
    has_oauth_tokens: me.hasOauthTokens,
    hasOauthTokens: me.hasOauthTokens,
    memberships: organizations.map((organization) => ({
      organization,
      organization_uuid: organization.uuid,
      organizationUuid: organization.uuid,
      role: "owner"
    })),
    name: me.displayName,
    settings: accountSettingsPayload(),
    uuid: me.accountUuid
  };
}

function authSessionPayload(me) {
  return {
    account: accountPayload(me),
    active_organization_uuid: me.organizationUuid,
    activeOrganizationUuid: me.organizationUuid,
    authenticated: true,
    email: me.email,
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    me: accountPayload(me),
    ok: true,
    organization: organizationPayload(me, me.organizationUuid),
    organization_uuid: me.organizationUuid,
    organizationUuid: me.organizationUuid,
    session: {
      account_uuid: me.accountUuid,
      organization_uuid: me.organizationUuid,
      user_uuid: me.accountUuid
    },
    user: accountPayload(me),
    user_uuid: me.accountUuid,
    userUuid: me.accountUuid
  };
}

function organizationPayload(me, organizationUuid) {
  const settings = organizationSettingsPayload(me);
  return {
    access_level: me.accessLevel,
    accessLevel: me.accessLevel,
    capabilities: ["chat", "omelette", "raven"],
    default_model_id: me.defaultModelId,
    defaultModelId: me.defaultModelId,
    entitlements: ["omelette"],
    features: {
      claude_design: true,
      design: true,
      omelette: true
    },
    is_personal: me.isPersonalOrg,
    isPersonalOrg: me.isPersonalOrg,
    name: me.orgName,
    organization_uuid: organizationUuid,
    orgName: me.orgName,
    rbac_entitlements: ["omelette"],
    rbacEntitlements: ["omelette"],
    settings,
    uuid: organizationUuid
  };
}

function accountSettingsPayload() {
  return {
    preview_feature_uses_artifacts: true
  };
}

function organizationSettingsPayload(me) {
  return {
    claude_ai_omelette_enabled: true,
    default_model_id: me.defaultModelId,
    defaultModelId: me.defaultModelId,
    omelette: true
  };
}

function organizationsPayload(me) {
  return [
    organizationPayload(me, me.organizationUuid),
    ...(me.memberships || [])
      .filter((membership) => membership && membership.uuid !== me.organizationUuid)
      .map((membership) => ({
        ...organizationPayload(me, membership.uuid),
        name: membership.name || me.orgName
      }))
  ];
}

function featureFlagsPayload(me) {
  const features = claudeDesignFeatureValues();
  const growthbook = claudeDesignGrowthbookPayload(me, features);
  return {
    experiments: {},
    feature_flags: features,
    features,
    growthbook,
    growthbookPayload: growthbook
  };
}

function claudeDesignFeatureValues() {
  return {
    admin_settings_chicago: true,
    claude_ai_omelette_enabled: true,
    claude_design: true,
    design: true,
    desktop_design_entrypoint: {
      openBehavior: "embed",
      showOnTabs: ["chat", "cowork"]
    },
    omelette: true,
    omelette_admin_settings: true,
    trellis: true
  };
}

function claudeDesignGrowthbookPayload(me, featureValues = claudeDesignFeatureValues()) {
  const configured = parseMaybeJson(me?.growthbookPayload, {});
  const configuredFeatures = isRecord(configured.features) ? configured.features : {};
  const features = { ...configuredFeatures };
  for (const [name, value] of Object.entries(featureValues)) {
    features[growthbookFeatureKey(name)] = growthbookFeatureDefinition(value);
  }
  return {
    ...configured,
    features
  };
}

function growthbookFeatureDefinition(value) {
  return {
    defaultValue: value
  };
}

function growthbookFeatureKey(name) {
  const value = stringValue(name) || "";
  if (value.startsWith("__gb__")) {
    return value.slice(6);
  }
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash &= hash;
  }
  return String((0xffffffff & hash) >>> 0);
}

function statsigPayload() {
  return {
    dynamic_configs: {},
    feature_gates: {},
    layer_configs: {},
    sdkParams: {}
  };
}

function currentUserAccessPayload(me) {
  return {
    account_uuid: me.accountUuid,
    accountUuid: me.accountUuid,
    account_permissions: claudeDesignAccountPermissions(),
    features: claudeDesignAccessFeatures(),
    organization_uuid: me.organizationUuid,
    organizationUuid: me.organizationUuid,
    permissions: ["admin", "owner", "omelette", "claude_design:manage"],
    role: "owner"
  };
}

function claudeDesignAccessFeatures() {
  return [
    "chat",
    "claude_api_in_artifacts",
    "claude_code",
    "claude_code_desktop",
    "claude_code_web",
    "cowork",
    "interactive_content",
    "mcp_artifacts",
    "omelette",
    "skills",
    "wiggle",
    "work_across_apps"
  ].map((feature) => ({
    feature,
    status: "available"
  }));
}

function claudeDesignAccountPermissions() {
  return [
    "admin",
    "claude_design:manage",
    "members:view",
    "organization:manage_settings",
    "owner",
    "workspaces:view"
  ];
}

function handleBootstrapSubresource(runtime, method, path) {
  if (method !== "GET") {
    return undefined;
  }
  const match = path.match(/^\/(?:api|edge-api)\/bootstrap\/[^/]+\/([^/]+)\/?$/) ||
    path.match(/^\/_bootstrap\/[^/]+\/([^/]+)\/?$/);
  if (!match) {
    return undefined;
  }
  switch (match[1]) {
    case "current_user_access":
      return jsonResponse(200, currentUserAccessPayload(runtime.me));
    case "cowork_sysprompt_map":
      return jsonResponse(200, null);
    case "gated_messages":
      return jsonResponse(200, null);
    case "model_selector_config":
    case "model_selector_state":
    case "server_localizations":
    case "system_prompts":
      return jsonResponse(200, {});
    default:
      return undefined;
  }
}

function canonicalCollection(value) {
  const normalized = String(value || "").toLowerCase();
  const aliases = {
    artifacts: "artifacts",
    chat_conversations: "chat_conversations",
    conversations: "chat_conversations",
    design: "designs",
    design_projects: "design_projects",
    design_sessions: "design_sessions",
    designs: "designs",
    documents: "documents",
    files: "files",
    projects: "projects",
    sessions: "design_sessions"
  };
  return aliases[normalized];
}

function listItems(store, collection, organizationUuid) {
  return queryRows(
    store.database,
    "SELECT collection, uuid, created_at, updated_at, title, model, data_json, messages_json FROM claude_design_items WHERE collection = ? ORDER BY updated_at DESC",
    [collection]
  ).map((row) => itemFromRow(row, organizationUuid));
}

function createItem(store, collection, organizationUuid, body, me) {
  const now = new Date().toISOString();
  const uuid = stringValue(body.uuid) || stringValue(body.id) || randomUuid();
  const title = stringValue(body.title) || stringValue(body.name) || "Untitled design";
  const model = stringValue(body.model) || me.defaultModelId;
  const data = {
    ...body,
    organization_uuid: organizationUuid
  };

  store.database.run(
    "INSERT OR REPLACE INTO claude_design_items (collection, uuid, created_at, updated_at, title, model, data_json, messages_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [collection, uuid, now, now, title, model, JSON.stringify(data), JSON.stringify([])]
  );
  store.persist();
  return getItem(store, collection, organizationUuid, uuid, me);
}

function getItem(store, collection, organizationUuid, uuid, me) {
  const row = queryRows(
    store.database,
    "SELECT collection, uuid, created_at, updated_at, title, model, data_json, messages_json FROM claude_design_items WHERE collection = ? AND uuid = ? LIMIT 1",
    [collection, uuid]
  )[0];
  if (row) {
    return itemFromRow(row, organizationUuid);
  }

  const created = createItem(store, collection, organizationUuid, { title: "Untitled design", uuid }, me);
  return {
    ...created,
    createdByFallback: true
  };
}

function getExistingItem(store, collection, organizationUuid, uuid) {
  const row = queryRows(
    store.database,
    "SELECT collection, uuid, created_at, updated_at, title, model, data_json, messages_json FROM claude_design_items WHERE collection = ? AND uuid = ? LIMIT 1",
    [collection, uuid]
  )[0];
  return row ? itemFromRow(row, organizationUuid) : undefined;
}

function updateItem(store, collection, organizationUuid, uuid, body, me) {
  const existing = getItem(store, collection, organizationUuid, uuid, me);
  const now = new Date().toISOString();
  const title = stringValue(body.title) || stringValue(body.name) || existing.title || "Untitled design";
  const model = stringValue(body.model) || existing.model || me.defaultModelId;
  const data = {
    ...existing,
    ...body,
    organization_uuid: organizationUuid
  };
  delete data.messages;

  store.database.run(
    "UPDATE claude_design_items SET updated_at = ?, title = ?, model = ?, data_json = ? WHERE collection = ? AND uuid = ?",
    [now, title, model, JSON.stringify(data), collection, uuid]
  );
  store.persist();
  return getItem(store, collection, organizationUuid, uuid, me);
}

function deleteItem(store, collection, uuid) {
  store.database.run("DELETE FROM claude_design_items WHERE collection = ? AND uuid = ?", [collection, uuid]);
  store.persist();
}

function getItemMessages(store, collection, uuid) {
  const row = queryRows(store.database, "SELECT messages_json FROM claude_design_items WHERE collection = ? AND uuid = ? LIMIT 1", [
    collection,
    uuid
  ])[0];
  return parseMaybeJson(row?.messages_json, []);
}

function appendItemMessage(store, collection, organizationUuid, uuid, body, me) {
  const item = getItem(store, collection, organizationUuid, uuid, me);
  const now = new Date().toISOString();
  const messages = Array.isArray(item.messages) ? item.messages : [];
  const content = body.content || body.text || body.prompt || body.message || "";
  const message = {
    content,
    created_at: now,
    id: randomUuid(),
    role: stringValue(body.role) || stringValue(body.sender) || "user",
    uuid: randomUuid()
  };
  messages.push(message);
  store.database.run("UPDATE claude_design_items SET updated_at = ?, messages_json = ? WHERE collection = ? AND uuid = ?", [
    now,
    JSON.stringify(messages),
    collection,
    uuid
  ]);
  store.persist();
  return {
    conversation: getItem(store, collection, organizationUuid, uuid, me),
    message
  };
}

function itemFromRow(row, organizationUuid) {
  const data = parseMaybeJson(row.data_json, {});
  const messages = sanitizeStoredMessages(parseMaybeJson(row.messages_json, []));
  return {
    ...data,
    collection: row.collection,
    created_at: row.created_at,
    id: row.uuid,
    messages,
    model: row.model,
    name: row.title,
    organization_uuid: organizationUuid,
    title: row.title,
    updated_at: row.updated_at,
    uuid: row.uuid
  };
}

function createOmeletteProject(runtime, requestBody) {
  const request = decodeCreateProjectRequest(requestBody);
  const now = new Date().toISOString();
  const uuid = randomUuid();
  const name = request.name || request.templateTitle || "Untitled design";
  const type = normalizeProjectTypeNumber(request.type);
  const data = {
    can_edit: true,
    description: request.description || "",
    intro_text: request.introText || "",
    is_owned: true,
    name,
    organization_uuid: runtime.me.organizationUuid,
    owner_display_name: runtime.me.displayName,
    owner_email: runtime.me.email,
    owner_uuid: runtime.me.accountUuid,
    project_id: uuid,
    project_type: type,
    sharing: {
      team_can_comment: false,
      team_can_edit: false,
      view_mode: "private"
    },
    source: "omelette-connect-rpc",
    template_id: request.templateId || "",
    template_title: request.templateTitle || "",
    title: name,
    type,
    uuid
  };

  runtime.store.database.run(
    "INSERT OR REPLACE INTO claude_design_items (collection, uuid, created_at, updated_at, title, model, data_json, messages_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [PROJECT_COLLECTION, uuid, now, now, name, runtime.me.defaultModelId, JSON.stringify(data), JSON.stringify([])]
  );
  runtime.store.persist();

  return {
    ...data,
    created_at: now,
    updated_at: now
  };
}

function getOmeletteProject(runtime, projectId) {
  const uuid = stringValue(projectId) || randomUuid();
  if (uuid) {
    const row = queryRows(
      runtime.store.database,
      "SELECT collection, uuid, created_at, updated_at, title, model, data_json, messages_json FROM claude_design_items WHERE collection = ? AND uuid = ? LIMIT 1",
      [PROJECT_COLLECTION, uuid]
    )[0];
    if (row) {
      return omeletteProjectFromRow(row, runtime.me);
    }
  }

  const now = new Date().toISOString();
  const name = "Untitled design";
  const data = {
    can_edit: true,
    is_owned: true,
    name,
    organization_uuid: runtime.me.organizationUuid,
    owner_display_name: runtime.me.displayName,
    owner_email: runtime.me.email,
    owner_uuid: runtime.me.accountUuid,
    project_id: uuid,
    project_type: PROJECT_TYPE_PROJECT,
    sharing: {
      view_mode: "private"
    },
    source: "omelette-connect-rpc-fallback",
    title: name,
    type: PROJECT_TYPE_PROJECT,
    uuid
  };

  runtime.store.database.run(
    "INSERT OR REPLACE INTO claude_design_items (collection, uuid, created_at, updated_at, title, model, data_json, messages_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [PROJECT_COLLECTION, uuid, now, now, name, runtime.me.defaultModelId, JSON.stringify(data), JSON.stringify([])]
  );
  runtime.store.persist();

  return omeletteProjectFromRow(
    {
      collection: PROJECT_COLLECTION,
      created_at: now,
      data_json: JSON.stringify(data),
      messages_json: "[]",
      model: runtime.me.defaultModelId,
      title: name,
      updated_at: now,
      uuid
    },
    runtime.me
  );
}

function listOmeletteProjects(runtime, typeFilter, publishedOnly) {
  const projects = queryRows(
    runtime.store.database,
    "SELECT collection, uuid, created_at, updated_at, title, model, data_json, messages_json FROM claude_design_items WHERE collection = ? ORDER BY updated_at DESC",
    [PROJECT_COLLECTION]
  ).map((row) => omeletteProjectFromRow(row, runtime.me));
  return projects.filter((project) => {
    if (typeFilter && project.type !== typeFilter) {
      return false;
    }
    if (publishedOnly && !project.publishedAt) {
      return false;
    }
    return true;
  });
}

function getProjectRow(runtime, projectId) {
  const uuid = stringValue(projectId);
  if (!uuid) {
    return undefined;
  }
  return queryRows(
    runtime.store.database,
    "SELECT collection, uuid, created_at, updated_at, title, model, data_json, messages_json FROM claude_design_items WHERE collection = ? AND uuid = ? LIMIT 1",
    [PROJECT_COLLECTION, uuid]
  )[0];
}

function saveProjectData(runtime, projectId, updater) {
  const row = getProjectRow(runtime, projectId);
  if (!row) {
    return undefined;
  }
  const current = parseMaybeJson(row.data_json, {});
  const next = updater(current, row) || current;
  const title = stringValue(next.name) || stringValue(next.title) || row.title || "Untitled design";
  runtime.store.database.run(
    "UPDATE claude_design_items SET updated_at = ?, title = ?, data_json = ? WHERE collection = ? AND uuid = ?",
    [new Date().toISOString(), title, JSON.stringify(next), PROJECT_COLLECTION, row.uuid]
  );
  runtime.store.persist();
  return getProjectRow(runtime, row.uuid);
}

function updateOmeletteProject(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const name = decodeProtoStringField(requestBody, 2);
  if (!projectId || !name) {
    return;
  }
  saveProjectData(runtime, projectId, (data) => ({
    ...data,
    name,
    title: name
  }));
}

function deleteOmeletteProject(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  if (!projectId) {
    return;
  }
  runtime.store.database.run("DELETE FROM claude_design_items WHERE collection = ? AND uuid = ?", [PROJECT_COLLECTION, projectId]);
  runtime.store.database.run("DELETE FROM claude_design_files WHERE project_id = ?", [projectId]);
  runtime.store.persist();
}

function normalizeProjectStoreData(runtime, row, value) {
  const record = isRecord(value) ? value : {};
  const project = omeletteProjectFromRow(row, runtime.me);
  const created = stringValue(record.created) || project.createdAt || row.created_at || new Date().toISOString();
  const lastOpened = stringValue(record.lastOpened) || project.updatedAt || row.updated_at || created;
  const sourceChats = isRecord(record.chats) ? record.chats : {};
  const chats = {};
  for (const [chatId, chat] of Object.entries(sourceChats)) {
    if (isRecord(chat)) {
      chats[chatId] = normalizeProjectChat(chat, chatId, created, lastOpened);
    }
  }

  const viewState = isRecord(record.viewState) ? record.viewState : {};
  let activeChatId = stringValue(viewState.activeChatId);
  const fallbackChatId = activeChatId || Object.keys(chats)[0] || defaultProjectChatId(project.projectId || row.uuid);
  const mergedStoredChats = mergeStoredMessagesIntoProjectChats(chats, row, created, lastOpened, fallbackChatId);
  if (!activeChatId || !isRecord(chats[activeChatId]) || (isEmptyProjectChat(chats[activeChatId]) && mergedStoredChats.lastChatId)) {
    activeChatId = mergedStoredChats.lastChatId || Object.keys(chats)[0] || defaultProjectChatId(project.projectId || row.uuid);
  }
  if (!isRecord(chats[activeChatId])) {
    chats[activeChatId] = normalizeProjectChat({}, activeChatId, created, lastOpened);
  }

  return {
    ...record,
    activeSkills: Array.isArray(record.activeSkills) ? record.activeSkills : [],
    chats,
    closedChats: Array.isArray(record.closedChats) ? record.closedChats : [],
    created,
    lastOpened,
    name: stringValue(record.name) || project.name,
    viewState: {
      ...viewState,
      activeChatId,
      activeFileTab: numberValue(viewState.activeFileTab) ?? -1,
      activeProjectTab: numberValue(viewState.activeProjectTab) ?? 0,
      folderHistory: Array.isArray(viewState.folderHistory) ? viewState.folderHistory : [""],
      folderHistoryIndex: numberValue(viewState.folderHistoryIndex) ?? 0,
      folderPath: typeof viewState.folderPath === "string" ? viewState.folderPath : "",
      openFiles: Array.isArray(viewState.openFiles) ? viewState.openFiles : []
    }
  };
}

function mergeStoredMessagesIntoProjectChats(chats, row, created, lastOpened, fallbackChatId) {
  const storedMessages = sanitizeStoredMessages(parseMaybeJson(row?.messages_json, []));
  const grouped = new Map();
  const orderedChatIds = [];
  let lastChatId;

  for (const message of storedMessages) {
    if (!isRecord(message)) {
      continue;
    }
    const chatId = stringValue(message.chat_id) || stringValue(message.chatId) || fallbackChatId;
    if (!chatId) {
      continue;
    }
    if (!grouped.has(chatId)) {
      grouped.set(chatId, []);
      orderedChatIds.push(chatId);
    }
    grouped.get(chatId).push(message);
    lastChatId = chatId;
  }

  for (const chatId of orderedChatIds) {
    const chat = normalizeProjectChat(chats[chatId] || {}, chatId, created, lastOpened);
    const mergedMessages = Array.isArray(chat.messages) ? [...chat.messages] : [];
    const seenKeys = new Set();
    const existingLooseKeys = new Set();
    for (const message of mergedMessages) {
      for (const key of projectChatMessageKeys(message)) {
        seenKeys.add(key);
      }
      for (const key of projectChatMessageLooseKeys(message)) {
        existingLooseKeys.add(key);
      }
    }

    for (const storedMessage of grouped.get(chatId) || []) {
      const projectMessage = projectChatMessageFromStoredMessage(storedMessage, lastOpened);
      const keys = projectChatMessageKeys(projectMessage);
      const looseKeys = projectChatMessageLooseKeys(projectMessage);
      if (keys.some((key) => seenKeys.has(key)) || looseKeys.some((key) => existingLooseKeys.has(key))) {
        continue;
      }
      mergedMessages.push(projectMessage);
      for (const key of keys) {
        seenKeys.add(key);
      }
    }

    chats[chatId] = {
      ...chat,
      lastOpened: latestProjectChatTimestamp(mergedMessages) || chat.lastOpened,
      messages: sortProjectChatMessages(mergedMessages)
    };
  }

  return {
    lastChatId
  };
}

function projectChatMessageFromStoredMessage(message, fallbackTimestamp) {
  const projectMessage = {
    ...message
  };
  delete projectMessage.chat_id;
  delete projectMessage.chatId;

  const timestamp = stringValue(message.timestamp) || stringValue(message.created_at) || stringValue(message.createdAt) || fallbackTimestamp;
  if (timestamp) {
    projectMessage.timestamp = timestamp;
  }
  const role = stringValue(message.role);
  if (role) {
    projectMessage.role = role;
  }
  if (Array.isArray(message.contentBlocks) && !Array.isArray(projectMessage.content_blocks)) {
    projectMessage.content_blocks = message.contentBlocks;
  }
  if (Array.isArray(message.content_blocks) && !Array.isArray(projectMessage.contentBlocks)) {
    projectMessage.contentBlocks = message.content_blocks;
  }
  return projectMessage;
}

function projectChatMessageKeys(message) {
  if (!isRecord(message)) {
    return [`raw:${JSON.stringify(message)}`];
  }

  const keys = [];
  const id = stringValue(message.id);
  if (id) {
    keys.push(`id:${id}`);
  }
  const uuid = stringValue(message.uuid);
  if (uuid) {
    keys.push(`uuid:${uuid}`);
  }

  const role = stringValue(message.role) || "";
  const timestamp = stringValue(message.timestamp) || stringValue(message.created_at) || stringValue(message.createdAt) || "";
  const content = projectChatMessageContentKey(message);
  if (role || timestamp || content) {
    keys.push(`content:${role}\n${timestamp}\n${content}`);
  }
  return keys;
}

function projectChatMessageLooseKeys(message) {
  if (!isRecord(message)) {
    return [];
  }
  const role = stringValue(message.role) || "";
  const content = projectChatMessageContentKey(message);
  return role || content ? [`content-loose:${role}\n${content}`] : [];
}

function projectChatMessageContentKey(message) {
  if (!isRecord(message)) {
    return JSON.stringify(message);
  }
  const blocks = Array.isArray(message.contentBlocks)
    ? message.contentBlocks
    : Array.isArray(message.content_blocks)
      ? message.content_blocks
      : undefined;
  return JSON.stringify({
    blocks,
    content: message.content,
    role: message.role
  });
}

function sortProjectChatMessages(messages) {
  return messages
    .map((message, index) => ({
      index,
      message,
      timestamp: projectChatMessageTimestamp(message)
    }))
    .sort((left, right) => {
      if (left.timestamp !== undefined && right.timestamp !== undefined && left.timestamp !== right.timestamp) {
        return left.timestamp - right.timestamp;
      }
      if (left.timestamp !== undefined && right.timestamp === undefined) {
        return -1;
      }
      if (left.timestamp === undefined && right.timestamp !== undefined) {
        return 1;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.message);
}

function latestProjectChatTimestamp(messages) {
  let latest;
  for (const message of messages) {
    const timestamp = projectChatMessageTimestamp(message);
    if (timestamp === undefined || (latest !== undefined && timestamp <= latest.timestamp)) {
      continue;
    }
    latest = {
      iso: stringValue(message.timestamp) || stringValue(message.created_at) || stringValue(message.createdAt),
      timestamp
    };
  }
  return latest?.iso;
}

function projectChatMessageTimestamp(message) {
  if (!isRecord(message)) {
    return undefined;
  }
  const value = stringValue(message.timestamp) || stringValue(message.created_at) || stringValue(message.createdAt);
  if (!value) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function isEmptyProjectChat(chat) {
  return !isRecord(chat) || !Array.isArray(chat.messages) || chat.messages.length === 0;
}

function normalizeProjectChat(value, chatId, created, lastOpened) {
  const chat = isRecord(value) ? value : {};
  const name = stringValue(chat.name) || stringValue(chat.title) || "Chat";
  const composer = isRecord(chat.composer) ? chat.composer : {};
  return {
    ...chat,
    composer: {
      ...composer,
      activeSkills: Array.isArray(composer.activeSkills) ? composer.activeSkills : [],
      attachments: Array.isArray(composer.attachments) ? composer.attachments : [],
      text: typeof composer.text === "string" ? composer.text : ""
    },
    created: stringValue(chat.created) || created,
    id: stringValue(chat.id) || chatId,
    lastOpened: stringValue(chat.lastOpened) || lastOpened,
    messages: sanitizeStoredMessages(Array.isArray(chat.messages) ? chat.messages : []),
    name,
    title: stringValue(chat.title) || name,
    todos: Array.isArray(chat.todos) ? chat.todos : []
  };
}

function defaultProjectChatId(projectId) {
  const normalized = String(projectId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 36);
  return normalized ? `chat-${normalized}` : "chat-default";
}

function getProjectDataBytes(runtime, projectId) {
  let row = getProjectRow(runtime, projectId);
  if (!row && projectId) {
    getOmeletteProject(runtime, projectId);
    row = getProjectRow(runtime, projectId);
  }
  if (!row) {
    return Buffer.alloc(0);
  }

  const record = parseMaybeJson(row.data_json, {});
  const base64 = stringValue(record.project_data_base64);
  const decoded = base64 ? parseMaybeJson(Buffer.from(base64, "base64").toString("utf8"), {}) : record;
  const normalized = normalizeProjectStoreData(runtime, row, decoded);
  const bytes = Buffer.from(JSON.stringify(normalized), "utf8");
  const normalizedBase64 = bytes.toString("base64");
  if (base64 !== normalizedBase64) {
    runtime.store.database.run(
      "UPDATE claude_design_items SET data_json = ? WHERE collection = ? AND uuid = ?",
      [JSON.stringify({ ...record, project_data_base64: normalizedBase64 }), PROJECT_COLLECTION, row.uuid]
    );
    runtime.store.persist();
  }
  return bytes;
}

function updateProjectDataBytes(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const data = decodeProtoBytesField(requestBody, 2) || Buffer.alloc(0);
  if (projectId) {
    saveProjectData(runtime, projectId, (record, row) => {
      const decoded = data.length ? parseMaybeJson(data.toString("utf8"), undefined) : undefined;
      if (!isRecord(decoded)) {
        return {
          ...record,
          project_data_base64: data.toString("base64")
        };
      }
      const normalized = normalizeProjectStoreData(runtime, row, decoded);
      return {
        ...record,
        project_data_base64: Buffer.from(JSON.stringify(normalized), "utf8").toString("base64")
      };
    });
  }
  return protoInt32(1, 5);
}

function encodeGetChatMessagesResponse(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const chatId = decodeProtoStringField(requestBody, 2);
  const row = getProjectRow(runtime, projectId);
  const messages = parseMaybeJson(row?.messages_json, []);
  const sanitized = sanitizeStoredMessages(messages);
  const filtered = chatId ? sanitized.filter((message) => !message.chat_id || message.chat_id === chatId) : sanitized;
  return protoBytes(1, Buffer.from(JSON.stringify(filtered), "utf8"), true);
}

function updateOmeletteProjectSharing(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const sharing = {
    view_mode: decodeProtoStringField(requestBody, 2) || "private",
    team_can_edit: decodeProtoBoolField(requestBody, 3),
    team_can_comment: decodeProtoBoolField(requestBody, 4)
  };
  if (projectId) {
    saveProjectData(runtime, projectId, (data) => ({
      ...data,
      sharing
    }));
  }
  return protoMessage(1, encodeSharing(sharing));
}

function duplicateOmeletteProject(runtime, requestBody, options) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const row = getProjectRow(runtime, projectId);
  const source = row ? omeletteProjectFromRow(row, runtime.me) : getOmeletteProject(runtime, projectId);
  const now = new Date().toISOString();
  const uuid = randomUuid();
  const sourceData = parseMaybeJson(row?.data_json, {});
  const type = normalizeProjectTypeNumber(options.type || source.type);
  const name = type === PROJECT_TYPE_TEMPLATE && !source.name.toLowerCase().includes("template")
    ? `${source.name} Template`
    : `${source.name} Copy`;
  const data = {
    ...sourceData,
    name,
    project_id: uuid,
    project_type: type,
    source_project_uuid: source.projectId,
    title: name,
    type,
    uuid
  };
  if (!options.includeChats) {
    delete data.project_data_base64;
  }
  runtime.store.database.run(
    "INSERT OR REPLACE INTO claude_design_items (collection, uuid, created_at, updated_at, title, model, data_json, messages_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [PROJECT_COLLECTION, uuid, now, now, name, runtime.me.defaultModelId, JSON.stringify(data), options.includeChats ? row?.messages_json || "[]" : "[]"]
  );
  for (const file of listProjectFileRows(runtime, source.projectId, "")) {
    runtime.store.database.run(
      "INSERT OR REPLACE INTO claude_design_files (project_id, path, created_at, updated_at, content_type, body_base64, version) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [uuid, file.path, now, now, file.content_type, file.body_base64, 1]
    );
  }
  runtime.store.persist();
  return protoString(1, uuid);
}

function updateProjectType(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const type = normalizeProjectTypeNumber(decodeProtoEnumField(requestBody, 2));
  if (projectId) {
    saveProjectData(runtime, projectId, (data) => ({
      ...data,
      project_type: type,
      type
    }));
  }
  return protoEnum(1, type);
}

function setProjectPublished(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const published = decodeProtoBoolField(requestBody, 2);
  const publishedAt = published ? new Date().toISOString() : "";
  if (projectId) {
    saveProjectData(runtime, projectId, (data) => ({
      ...data,
      published_at: publishedAt
    }));
  }
  return published ? protoTimestamp(1, publishedAt) : Buffer.alloc(0);
}

function updateProjectInfo(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  if (!projectId) {
    return;
  }
  const templateTitle = decodeProtoStringField(requestBody, 2);
  const description = decodeProtoStringField(requestBody, 3);
  const introText = decodeProtoStringField(requestBody, 4);
  saveProjectData(runtime, projectId, (data) => ({
    ...data,
    description: description ?? data.description ?? "",
    intro_text: introText ?? data.intro_text ?? "",
    template_title: templateTitle ?? data.template_title ?? ""
  }));
}

function updateProjectDesignSystems(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const bindings = decodeDesignSystemBindings(decodeProtoMessageFields(requestBody, 2));
  if (projectId) {
    saveProjectData(runtime, projectId, (data) => ({
      ...data,
      design_systems: bindings
    }));
  }
  return Buffer.concat(bindings.map((binding) => protoMessage(1, encodeDesignSystemBinding(binding))));
}

function patchDesignSystemBinding(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const dsProjectId = decodeProtoStringField(requestBody, 2);
  const syncedAtVersion = decodeProtoIntField(requestBody, 3);
  let bindings = [];
  if (projectId && dsProjectId) {
    const row = getProjectRow(runtime, projectId);
    const data = parseMaybeJson(row?.data_json, {});
    bindings = Array.isArray(data.design_systems) ? data.design_systems : [];
    const existing = bindings.find((binding) => binding.ds_project_id === dsProjectId);
    if (existing) {
      existing.synced_at_version = syncedAtVersion;
    } else {
      bindings.push({ ds_project_id: dsProjectId, synced_at_version: syncedAtVersion });
    }
    saveProjectData(runtime, projectId, (record) => ({
      ...record,
      design_systems: bindings
    }));
  }
  return Buffer.concat(bindings.map((binding) => protoMessage(1, encodeDesignSystemBinding(binding))));
}

function updateProjectFavorite(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const favorite = decodeProtoBoolField(requestBody, 2);
  if (projectId) {
    saveProjectData(runtime, projectId, (data) => ({
      ...data,
      is_favorite: favorite
    }));
  }
}

function decodeDesignSystemBindings(messages) {
  return messages
    .map((message) => ({
      ds_project_id: decodeProtoStringField(message, 1) || "",
      has_v2_layout: decodeProtoBoolField(message, 3),
      synced_at_version: decodeProtoIntField(message, 2)
    }))
    .filter((binding) => binding.ds_project_id);
}

function encodeDesignSystemBinding(binding) {
  return Buffer.concat([
    protoString(1, binding.ds_project_id || binding.dsProjectId),
    protoInt64(2, binding.synced_at_version ?? binding.syncedAtVersion ?? 0),
    protoBool(3, binding.has_v2_layout === true || binding.hasV2Layout === true)
  ]);
}

function listProjectFileRows(runtime, projectId, prefix) {
  const address = normalizeProjectFileAddress(runtime, projectId, prefix || "");
  const normalizedProjectId = address.projectId;
  if (!normalizedProjectId) {
    return [];
  }
  const rows = queryRows(
    runtime.store.database,
    "SELECT project_id, path, created_at, updated_at, content_type, body_base64, version FROM claude_design_files WHERE project_id = ? ORDER BY path ASC",
    [normalizedProjectId]
  );
  const normalizedPrefix = address.path;
  if (!normalizedPrefix) {
    return rows;
  }
  const prefixWithSlash = `${normalizedPrefix.replace(/\/+$/, "")}/`;
  return rows.filter((row) => row.path === normalizedPrefix || row.path.startsWith(prefixWithSlash));
}

function encodeListFilesResponse(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const directory = sanitizeProjectFilePath(decodeProtoStringField(requestBody, 2) || "");
  const depth = decodeProtoIntField(requestBody, 3) || 1;
  const offset = decodeProtoIntField(requestBody, 4) || 0;
  const filter = decodeProtoStringField(requestBody, 5);
  const allEntries = listProjectDirectoryEntries(runtime, projectId, directory, depth, filter);
  const limit = 200;
  const visible = allEntries.slice(offset, offset + limit);
  return Buffer.concat([
    ...visible.map((entry) => protoMessage(1, encodeFileEntry(entry))),
    protoInt32(2, allEntries.length),
    protoInt32(3, offset),
    protoInt32(4, limit),
    protoBool(5, offset + limit < allEntries.length)
  ]);
}

function listProjectDirectoryEntries(runtime, projectId, directory, depth, filter) {
  const address = normalizeProjectFileAddress(runtime, projectId, directory || "");
  const normalizedDirectory = address.path;
  const rows = listProjectFileRows(runtime, address.projectId, normalizedDirectory);
  const prefix = normalizedDirectory ? `${normalizedDirectory.replace(/\/+$/, "")}/` : "";
  const directories = new Map();
  const files = [];
  const normalizedFilter = stringValue(filter)?.toLowerCase();

  for (const row of rows) {
    if (normalizedDirectory && row.path === normalizedDirectory) {
      continue;
    }
    const relative = prefix ? row.path.slice(prefix.length) : row.path;
    if (!relative || relative.startsWith("../")) {
      continue;
    }
    const slashIndex = relative.indexOf("/");
    if (slashIndex >= 0 && depth <= 1) {
      const name = relative.slice(0, slashIndex);
      const path = prefix ? `${prefix}${name}` : name;
      const existing = directories.get(path);
      if (!existing || String(row.updated_at) > String(existing.updatedAt)) {
        directories.set(path, {
          contentType: "inode/directory",
          name,
          path,
          size: 0,
          type: "directory",
          updatedAt: row.updated_at,
          version: 0
        });
      }
      continue;
    }
    if (normalizedFilter && !row.path.toLowerCase().includes(normalizedFilter)) {
      continue;
    }
    files.push(fileEntryFromRow(row));
  }

  return [...directories.values(), ...files].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "directory" ? -1 : 1;
    }
    return left.path.localeCompare(right.path);
  });
}

function fileEntryFromRow(row) {
  return {
    contentType: row.content_type || guessContentType(row.path),
    name: row.path.split("/").pop() || row.path,
    path: row.path,
    size: Buffer.from(row.body_base64 || "", "base64").length,
    type: "file",
    updatedAt: row.updated_at,
    version: Number(row.version) || 1
  };
}

function encodeFileEntry(entry) {
  return Buffer.concat([
    protoString(1, entry.name),
    protoString(2, entry.path),
    protoString(3, entry.type),
    protoInt64(4, entry.size || 0),
    protoString(5, entry.contentType),
    protoTimestamp(6, entry.updatedAt),
    protoInt64(7, entry.version || 0)
  ]);
}

function encodeGetFileResponse(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const filePath = sanitizeProjectFilePath(decodeProtoStringField(requestBody, 2) || "");
  const row = getProjectFileRow(runtime, projectId, filePath);
  if (!row) {
    return Buffer.alloc(0);
  }
  const body = Buffer.from(row.body_base64 || "", "base64");
  return Buffer.concat([
    protoBytes(1, body, true),
    protoString(2, row.content_type || guessContentType(filePath)),
    protoBool(3, false),
    protoInt64(4, Number(row.version) || 1)
  ]);
}

function writeProjectFiles(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const fileMessages = decodeProtoMessageFields(requestBody, 2);
  const deletePaths = decodeProtoStringFields(requestBody, 6);
  const mutationMessages = decodeProtoMessageFields(requestBody, 7);
  const written = [];

  for (const fileMessage of fileMessages) {
    const file = decodeFileToWrite(fileMessage);
    if (!file.path) {
      continue;
    }
    const row = upsertProjectFile(runtime, projectId, file.path, file.body, file.mimeType);
    written.push(fileEntryFromRow(row));
  }

  for (const deletePath of deletePaths) {
    deleteProjectFileByPath(runtime, projectId, deletePath);
  }

  for (const mutation of mutationMessages) {
    const result = applyFileMutation(runtime, projectId, mutation);
    if (result?.entry) {
      written.push(result.entry);
    }
  }

  runtime.store.persist();
  return Buffer.concat(written.map((file) => protoMessage(1, encodeWrittenFile(file))));
}

function decodeFileToWrite(message) {
  const path = sanitizeProjectFilePath(decodeProtoStringField(message, 1) || "");
  const data = decodeProtoStringField(message, 2) || "";
  const mimeType = decodeProtoStringField(message, 3) || guessContentType(path);
  const encoding = decodeProtoStringField(message, 4) || "";
  const body = encoding.toLowerCase() === "base64" ? Buffer.from(data, "base64") : Buffer.from(data, "utf8");
  return {
    body,
    encoding,
    mimeType,
    path
  };
}

function applyFileMutation(runtime, projectId, mutation) {
  const path = sanitizeProjectFilePath(decodeProtoStringField(mutation, 1) || "");
  if (!path) {
    return undefined;
  }
  const write = decodeProtoMessageFields(mutation, 4)[0];
  if (write) {
    const data = decodeProtoStringField(write, 1) || "";
    const mimeType = decodeProtoStringField(write, 2) || guessContentType(path);
    const encoding = decodeProtoStringField(write, 3) || "";
    const body = encoding.toLowerCase() === "base64" ? Buffer.from(data, "base64") : Buffer.from(data, "utf8");
    return { entry: fileEntryFromRow(upsertProjectFile(runtime, projectId, path, body, mimeType)) };
  }

  if (decodeProtoMessageFields(mutation, 6)[0]) {
    deleteProjectFileByPath(runtime, projectId, path);
    return { deleted: true };
  }

  const move = decodeProtoMessageFields(mutation, 8)[0];
  if (move) {
    const fromPath = sanitizeProjectFilePath(decodeProtoStringField(move, 1) || "");
    const source = getProjectFileRow(runtime, projectId, fromPath);
    if (source) {
      const row = upsertProjectFile(runtime, projectId, path, Buffer.from(source.body_base64 || "", "base64"), source.content_type);
      deleteProjectFileByPath(runtime, projectId, fromPath);
      return { entry: fileEntryFromRow(row) };
    }
  }

  const edit = decodeProtoMessageFields(mutation, 5)[0];
  if (edit) {
    return { entry: editProjectFileByMessages(runtime, projectId, path, decodeProtoMessageFields(edit, 1)) };
  }

  return undefined;
}

function encodeWrittenFile(entry) {
  return Buffer.concat([
    protoString(1, entry.name),
    protoString(2, entry.path),
    protoString(3, entry.contentType),
    protoInt64(4, entry.version || 1)
  ]);
}

function deleteProjectFile(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const filePath = decodeProtoStringField(requestBody, 2);
  const deleted = deleteProjectFileByPath(runtime, projectId, filePath);
  runtime.store.persist();
  return protoInt32(1, deleted);
}

function deleteProjectFiles(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const paths = decodeProtoStringFields(requestBody, 2);
  let deleted = 0;
  for (const filePath of paths) {
    deleted += deleteProjectFileByPath(runtime, projectId, filePath);
  }
  runtime.store.persist();
  return protoInt32(1, deleted);
}

function copyProjectFile(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const src = sanitizeProjectFilePath(decodeProtoStringField(requestBody, 2) || "");
  const dest = sanitizeProjectFilePath(decodeProtoStringField(requestBody, 3) || "");
  const move = decodeProtoBoolField(requestBody, 4);
  const srcProjectId = decodeProtoStringField(requestBody, 5) || projectId;
  const sourceAddress = normalizeProjectFileAddress(runtime, srcProjectId, src);
  const targetAddress = normalizeProjectFileAddress(runtime, projectId, dest);
  const normalizedSrcProjectId = sourceAddress.projectId;
  const normalizedTargetProjectId = targetAddress.projectId || normalizedSrcProjectId || projectId;
  const normalizedSrc = sourceAddress.path;
  const normalizedDest = targetAddress.path;
  const copied = [];
  for (const row of listProjectFileRows(runtime, normalizedSrcProjectId, normalizedSrc)) {
    const suffix = row.path === normalizedSrc ? "" : row.path.slice(normalizedSrc.length).replace(/^\/+/, "");
    const target = suffix ? `${normalizedDest.replace(/\/+$/, "")}/${suffix}` : normalizedDest;
    const written = upsertProjectFile(runtime, normalizedTargetProjectId, target, Buffer.from(row.body_base64 || "", "base64"), row.content_type);
    copied.push(written.path);
    if (move && normalizedSrcProjectId === normalizedTargetProjectId) {
      deleteProjectFileByPath(runtime, normalizedSrcProjectId, row.path);
    }
  }
  runtime.store.persist();
  return Buffer.concat(copied.map((filePath) => protoString(1, filePath)));
}

function editProjectFile(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const filePath = sanitizeProjectFilePath(decodeProtoStringField(requestBody, 2) || "");
  const replacements = decodeProtoMessageFields(requestBody, 3);
  const entry = editProjectFileByMessages(runtime, projectId, filePath, replacements);
  return Buffer.concat([protoString(1, entry.path), protoInt32(2, replacements.length), protoInt64(3, entry.version)]);
}

function editProjectFileByMessages(runtime, projectId, filePath, replacements) {
  const row = getProjectFileRow(runtime, projectId, filePath);
  let text = row ? Buffer.from(row.body_base64 || "", "base64").toString("utf8") : "";
  let applied = 0;
  for (const replacement of replacements) {
    const oldString = decodeProtoStringField(replacement, 1) || "";
    const newString = decodeProtoStringField(replacement, 2) || "";
    if (oldString && text.includes(oldString)) {
      text = text.replace(oldString, newString);
      applied += 1;
    }
  }
  const written = upsertProjectFile(runtime, projectId, filePath, Buffer.from(text, "utf8"), row?.content_type || guessContentType(filePath));
  runtime.store.persist();
  return {
    ...fileEntryFromRow(written),
    editsApplied: applied
  };
}

function grepProjectFiles(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const pattern = decodeProtoStringField(requestBody, 2);
  const directory = decodeProtoStringField(requestBody, 3) || "";
  if (!pattern) {
    return Buffer.alloc(0);
  }
  let regex;
  try {
    regex = new RegExp(pattern, "i");
  } catch {
    regex = new RegExp(escapeRegExp(pattern), "i");
  }
  const matches = [];
  for (const row of listProjectFileRows(runtime, projectId, directory)) {
    const text = Buffer.from(row.body_base64 || "", "base64").toString("utf8");
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (regex.test(lines[index])) {
        matches.push(protoMessage(1, encodeGrepMatch(row.path, index + 1, lines[index])));
      }
    }
  }
  return Buffer.concat(matches);
}

function encodeGrepMatch(path, line, text) {
  return Buffer.concat([protoString(1, path), protoInt32(2, line), protoString(3, text)]);
}

function createFileStream(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const streamId = randomUuid();
  const paths = decodeProtoStringFields(requestBody, 2);
  runtime.store.database.run(
    "INSERT OR REPLACE INTO claude_design_items (collection, uuid, created_at, updated_at, title, model, data_json, messages_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ["file_streams", streamId, new Date().toISOString(), new Date().toISOString(), streamId, runtime.me.defaultModelId, JSON.stringify({ projectId, paths }), "[]"]
  );
  runtime.store.persist();
  return protoString(1, streamId);
}

function writeFileStream(runtime, requestBody) {
  const streamId = decodeProtoStringField(requestBody, 1);
  const stream = getItem(runtime.store, "file_streams", runtime.me.organizationUuid, streamId, runtime.me);
  const projectId = stream.projectId;
  for (const op of decodeProtoMessageFields(requestBody, 2)) {
    const path = sanitizeProjectFilePath(decodeProtoStringField(op, 1) || "");
    const operation = decodeProtoStringField(op, 2) || "";
    const delta = decodeProtoStringField(op, 3) || "";
    const reset = decodeProtoBoolField(op, 4);
    if (!path || operation === "delete") {
      if (operation === "delete") {
        deleteProjectFileByPath(runtime, projectId, path);
      }
      continue;
    }
    const existing = reset ? "" : getProjectFileText(runtime, projectId, path);
    upsertProjectFile(runtime, projectId, path, Buffer.from(`${existing}${delta}`, "utf8"), guessContentType(path));
  }
  runtime.store.persist();
  return Buffer.alloc(0);
}

function getProjectFileRow(runtime, projectId, filePath) {
  const address = normalizeProjectFileAddress(runtime, projectId, filePath || "");
  const normalizedProjectId = address.projectId;
  const normalizedPath = address.path;
  if (!normalizedProjectId || !normalizedPath) {
    return undefined;
  }
  return queryRows(
    runtime.store.database,
    "SELECT project_id, path, created_at, updated_at, content_type, body_base64, version FROM claude_design_files WHERE project_id = ? AND path = ? LIMIT 1",
    [normalizedProjectId, normalizedPath]
  )[0];
}

function getProjectFileText(runtime, projectId, filePath) {
  const row = getProjectFileRow(runtime, projectId, filePath);
  return row ? Buffer.from(row.body_base64 || "", "base64").toString("utf8") : "";
}

function upsertProjectFile(runtime, projectId, filePath, body, contentType) {
  const address = normalizeProjectFileAddress(runtime, projectId, filePath || "");
  const normalizedProjectId = address.projectId;
  const normalizedPath = address.path;
  if (!normalizedProjectId || !normalizedPath) {
    throw new Error("project_id and path are required to write a Claude Design file.");
  }
  const now = new Date().toISOString();
  const existing = getProjectFileRow(runtime, normalizedProjectId, normalizedPath);
  const version = existing ? Number(existing.version || 0) + 1 : 1;
  runtime.store.database.run(
    "INSERT OR REPLACE INTO claude_design_files (project_id, path, created_at, updated_at, content_type, body_base64, version) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      normalizedProjectId,
      normalizedPath,
      existing?.created_at || now,
      now,
      contentType || guessContentType(normalizedPath),
      Buffer.isBuffer(body) ? body.toString("base64") : Buffer.from(String(body || ""), "utf8").toString("base64"),
      version
    ]
  );
  return getProjectFileRow(runtime, normalizedProjectId, normalizedPath);
}

function deleteProjectFileByPath(runtime, projectId, filePath) {
  const address = normalizeProjectFileAddress(runtime, projectId, filePath || "");
  const normalizedProjectId = address.projectId;
  const normalizedPath = address.path;
  if (!normalizedProjectId || !normalizedPath) {
    return 0;
  }
  const existing = getProjectFileRow(runtime, normalizedProjectId, normalizedPath);
  runtime.store.database.run("DELETE FROM claude_design_files WHERE project_id = ? AND path = ?", [normalizedProjectId, normalizedPath]);
  return existing ? 1 : 0;
}

function normalizeProjectFileAddress(runtime, projectId, filePath) {
  let normalizedProjectId = stringValue(projectId);
  let normalizedPath = sanitizeProjectFilePath(filePath || "");

  if (normalizedProjectId) {
    if (normalizedPath === normalizedProjectId) {
      normalizedPath = "";
    } else if (normalizedPath.startsWith(`${normalizedProjectId}/`)) {
      normalizedPath = sanitizeProjectFilePath(normalizedPath.slice(normalizedProjectId.length + 1));
    }
  }

  if (!normalizedProjectId && normalizedPath) {
    const split = splitProjectPrefixedFilePath(runtime, normalizedPath);
    if (split) {
      normalizedProjectId = split.projectId;
      normalizedPath = split.path;
    }
  }

  return {
    path: normalizedPath,
    projectId: normalizedProjectId
  };
}

function splitProjectPrefixedFilePath(runtime, filePath) {
  const slashIndex = filePath.indexOf("/");
  if (slashIndex < 0 && getProjectRow(runtime, filePath)) {
    return { path: "", projectId: filePath };
  }
  if (slashIndex <= 0) {
    return undefined;
  }
  const projectId = filePath.slice(0, slashIndex);
  const path = sanitizeProjectFilePath(filePath.slice(slashIndex + 1));
  if (!projectId || !path || !getProjectRow(runtime, projectId)) {
    return undefined;
  }
  return { path, projectId };
}

function sanitizeProjectFilePath(value) {
  const normalized = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = [];
  for (const part of normalized.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

function listProjectAssets(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const assets = listItems(runtime.store, "assets", runtime.me.organizationUuid).filter((asset) => asset.project_id === projectId);
  return Buffer.concat(assets.map((asset) => protoMessage(1, encodeProjectAsset(asset))));
}

function recordProjectAsset(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const name = decodeProtoStringField(requestBody, 2);
  const filePath = decodeProtoStringField(requestBody, 3);
  if (!projectId || !filePath) {
    return;
  }
  const uuid = assetUuid(projectId, name, filePath);
  const body = {
    chat_id: decodeProtoStringField(requestBody, 6) || "",
    name: name || filePath,
    path: filePath,
    project_id: projectId,
    section: decodeProtoStringField(requestBody, 8) || "",
    status: decodeProtoEnumField(requestBody, 7) || 0,
    subtitle: decodeProtoStringField(requestBody, 4) || "",
    uuid
  };
  upsertGenericRecord(runtime.store, "assets", uuid, body.name, runtime.me.defaultModelId, body);
}

function setProjectAssetStatus(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const name = decodeProtoStringField(requestBody, 2);
  const filePath = decodeProtoStringField(requestBody, 3);
  const status = decodeProtoEnumField(requestBody, 4) || 0;
  const uuid = assetUuid(projectId, name, filePath);
  const item = getItem(runtime.store, "assets", runtime.me.organizationUuid, uuid, runtime.me);
  upsertGenericRecord(runtime.store, "assets", uuid, item.name || name || filePath || "asset", runtime.me.defaultModelId, {
    ...item,
    project_id: projectId,
    status,
    status_changed_at: new Date().toISOString()
  });
}

function deleteProjectAsset(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1);
  const name = decodeProtoStringField(requestBody, 2);
  const filePath = decodeProtoStringField(requestBody, 3);
  deleteItem(runtime.store, "assets", assetUuid(projectId, name, filePath));
}

function encodeProjectAsset(asset) {
  return Buffer.concat([
    protoString(1, asset.name),
    protoString(2, asset.path),
    protoEnum(3, asset.status || 0),
    protoString(4, asset.subtitle),
    protoBool(6, asset.pinned === true),
    protoString(7, asset.chat_id),
    protoTimestamp(8, asset.created_at || asset.createdAt),
    protoTimestamp(9, asset.status_changed_at),
    protoString(11, asset.section)
  ]);
}

function assetUuid(projectId, name, filePath) {
  return `${projectId || ""}:${name || ""}:${filePath || ""}`;
}

function bundleProject(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1) || firstUuidLikeString(requestBody) || "";
  if (projectId) {
    const project = getOmeletteProject(runtime, projectId);
    const files = listProjectFileRows(runtime, projectId, "").map((row) => ({
      contentType: row.content_type,
      path: row.path,
      text: Buffer.from(row.body_base64 || "", "base64").toString("utf8"),
      version: row.version
    }));
    upsertGenericRecord(runtime.store, "bundles", projectId, project.name || projectId, runtime.me.defaultModelId, {
      files,
      project,
      project_id: projectId
    });
  }
  return Buffer.alloc(0);
}

function uploadFile(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1) || firstUuidLikeString(requestBody) || "";
  const directFilePath = decodeProtoStringField(requestBody, 2);
  const fileMessages = decodeProtoMessageFields(requestBody, 2);
  if (!directFilePath && fileMessages.length > 0) {
    return writeProjectFiles(runtime, requestBody);
  }

  const strings = decodeAllProtoStrings(requestBody);
  const filePath = sanitizeProjectFilePath(
    directFilePath ||
      strings.find((item) => item.value && item.value !== projectId && !item.value.includes("{"))?.value ||
      `uploads/upload-${Date.now()}.txt`
  );
  const mimeType = decodeProtoStringField(requestBody, 4) || guessContentType(filePath);
  const data = decodeProtoBytesField(requestBody, 3) || Buffer.from(decodeProtoStringField(requestBody, 3) || "", "utf8");
  const row = upsertProjectFile(runtime, projectId, filePath, Buffer.from(data), mimeType);
  runtime.store.persist();
  return protoMessage(1, encodeWrittenFile(fileEntryFromRow(row)));
}

function setProjectThumbnail(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1) || firstUuidLikeString(requestBody) || "";
  const dataUrl = decodeProtoStringField(requestBody, 2) || decodeAllProtoStrings(requestBody).find((item) => item.value.startsWith("data:"))?.value || "";
  storeProjectThumbnail(runtime, projectId, dataUrl);
}

function storeProjectThumbnail(runtime, projectId, dataUrl) {
  if (!projectId || !dataUrl) {
    return;
  }
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) {
    return;
  }
  upsertGenericRecord(runtime.store, THUMBNAIL_COLLECTION, projectId, projectId, runtime.me.defaultModelId, {
    body_base64: decoded.body.toString("base64"),
    content_type: decoded.contentType,
    project_id: projectId
  });
}

function readProjectThumbnail(runtime, projectId) {
  if (!projectId) {
    return undefined;
  }
  const row = queryRows(
    runtime.store.database,
    "SELECT data_json FROM claude_design_items WHERE collection = ? AND uuid = ? LIMIT 1",
    [THUMBNAIL_COLLECTION, projectId]
  )[0];
  const data = parseMaybeJson(row?.data_json, {});
  if (!data.body_base64) {
    return undefined;
  }
  return {
    body: Buffer.from(data.body_base64, "base64"),
    contentType: data.content_type || "image/png"
  };
}

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ""));
  if (!match) {
    return undefined;
  }
  const contentType = match[1] || "application/octet-stream";
  const body = match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]), "utf8");
  return { body, contentType };
}

function createClaudeCodeSession(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1) || firstUuidLikeString(requestBody) || "";
  const sessionId = randomUuid();
  upsertGenericRecord(runtime.store, SESSION_COLLECTION, sessionId, "Claude Code Session", runtime.me.defaultModelId, {
    project_id: projectId,
    session_id: sessionId,
    source: "claude-design-mock"
  });
  if (projectId) {
    saveProjectData(runtime, projectId, (data) => ({
      ...data,
      has_claude_code_session: true
    }));
  }
  return protoString(1, sessionId);
}

function listChatsForExport(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1) || firstUuidLikeString(requestBody) || "";
  const chats = getProjectChats(runtime, projectId);
  return Buffer.concat(chats.map((chat) => protoMessage(1, encodeExportChatSummary(chat))));
}

function exportChatMessages(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1) || firstUuidLikeString(requestBody) || "";
  const chatId = decodeProtoStringField(requestBody, 2) || decodeAllProtoStrings(requestBody).find((item) => item.value !== projectId)?.value || "";
  const chat = getProjectChats(runtime, projectId).find((item) => item.id === chatId) || { id: chatId, messages: [] };
  upsertGenericRecord(runtime.store, "chat_exports", randomUuid(), chat.id || "chat", runtime.me.defaultModelId, {
    chat_id: chat.id,
    exported_at: new Date().toISOString(),
    messages: chat.messages || [],
    project_id: projectId
  });
  return Buffer.alloc(0);
}

function getProjectChats(runtime, projectId) {
  const data = parseMaybeJson(getProjectDataBytes(runtime, projectId).toString("utf8"), {});
  const openChats = Object.values(isRecord(data.chats) ? data.chats : {});
  const closedChats = Array.isArray(data.closedChats) ? data.closedChats : [];
  return [...openChats, ...closedChats].filter(isRecord).map((chat) => ({
    closedAt: chat.closedAt || "",
    id: stringValue(chat.id) || randomUuid(),
    lastOpened: chat.lastOpened || "",
    messageCount: Array.isArray(chat.messages) ? chat.messages.length : Number(chat.messageCount) || 0,
    messages: Array.isArray(chat.messages) ? chat.messages : [],
    name: stringValue(chat.name) || "Chat"
  }));
}

function encodeExportChatSummary(chat) {
  return Buffer.concat([
    protoString(1, chat.id),
    protoString(2, chat.name),
    protoInt32(3, chat.messageCount || 0),
    protoTimestamp(4, chat.lastOpened || chat.closedAt)
  ]);
}

function recordTrackEvent(runtime, requestBody) {
  const strings = decodeAllProtoStrings(requestBody);
  const eventName = decodeProtoStringField(requestBody, 1) || strings[0]?.value || "event";
  upsertGenericRecord(runtime.store, EVENT_COLLECTION, randomUuid(), eventName, runtime.me.defaultModelId, {
    event_name: eventName,
    fields: strings,
    recorded_at: new Date().toISOString()
  });
}

function createComment(runtime, requestBody) {
  const comment = commentFromRequest(runtime, requestBody, {}, "create");
  upsertComment(runtime, comment);
  return protoMessage(1, encodeComment(comment));
}

function updateComment(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1) || "";
  const commentId = decodeProtoStringField(requestBody, 2) || firstUuidLikeString(requestBody) || "";
  const existing = getComment(runtime, commentId);
  const updated = commentFromRequest(runtime, requestBody, existing || { id: commentId, project_id: projectId }, "update");
  upsertComment(runtime, { ...existing, ...updated, id: commentId || updated.id });
  return protoMessage(1, encodeComment(getComment(runtime, commentId || updated.id) || updated));
}

function deleteComment(runtime, requestBody) {
  const commentId = decodeProtoStringField(requestBody, 2) || firstUuidLikeString(requestBody) || "";
  if (commentId) {
    deleteItem(runtime.store, COMMENT_COLLECTION, commentId);
  }
}

function listComments(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1) || firstUuidLikeString(requestBody) || "";
  const comments = listItems(runtime.store, COMMENT_COLLECTION, runtime.me.organizationUuid)
    .filter((comment) => !projectId || comment.project_id === projectId)
    .map(normalizeCommentRecord);
  return Buffer.concat([
    ...comments.map((comment) => protoMessage(1, encodeComment(comment))),
    getCommentsReadAt(runtime, projectId) ? protoTimestamp(2, getCommentsReadAt(runtime, projectId)) : Buffer.alloc(0)
  ]);
}

function markCommentsRead(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1) || firstUuidLikeString(requestBody) || "";
  const readAt = new Date().toISOString();
  if (projectId) {
    upsertGenericRecord(runtime.store, "comment_state", projectId, projectId, runtime.me.defaultModelId, {
      comments_read_at: readAt,
      project_id: projectId
    });
  }
  return protoTimestamp(1, readAt);
}

function getCommentsReadAt(runtime, projectId) {
  if (!projectId) {
    return "";
  }
  const state = getExistingItem(runtime.store, "comment_state", runtime.me.organizationUuid, projectId);
  return stringValue(state?.comments_read_at);
}

function createCommentReply(runtime, requestBody) {
  const commentId = decodeProtoStringField(requestBody, 2) || "";
  const comment = getComment(runtime, commentId) || { id: commentId || randomUuid(), replies: [] };
  const strings = decodeAllProtoStrings(requestBody).map((item) => item.value);
  const text = decodeProtoStringField(requestBody, 3) || strings.find((value) => value !== comment.project_id && value !== commentId) || "";
  const reply = {
    author_account_uuid: runtime.me.accountUuid,
    author_display_name: runtime.me.displayName,
    author_email: runtime.me.email,
    author_name: runtime.me.displayName,
    body: text,
    comment_id: comment.id,
    created_at: new Date().toISOString(),
    id: randomUuid(),
    text
  };
  comment.replies = [...(Array.isArray(comment.replies) ? comment.replies : []), reply];
  upsertComment(runtime, comment);
  return protoMessage(1, encodeCommentReply(reply));
}

function updateCommentReply(runtime, requestBody) {
  const commentId = decodeProtoStringField(requestBody, 2) || "";
  const replyId = decodeProtoStringField(requestBody, 3) || "";
  const text = decodeProtoStringField(requestBody, 4) || "";
  const comment = getComment(runtime, commentId);
  if (comment && Array.isArray(comment.replies)) {
    comment.replies = comment.replies.map((reply) => reply.id === replyId ? { ...reply, body: text, text, updated_at: new Date().toISOString() } : reply);
    upsertComment(runtime, comment);
    const reply = comment.replies.find((item) => item.id === replyId);
    return protoMessage(1, encodeCommentReply(reply || {}));
  }
  return Buffer.alloc(0);
}

function deleteCommentReply(runtime, requestBody) {
  const commentId = decodeProtoStringField(requestBody, 2) || "";
  const replyId = decodeProtoStringField(requestBody, 3) || "";
  const comment = getComment(runtime, commentId);
  if (comment && Array.isArray(comment.replies)) {
    comment.replies = comment.replies.filter((reply) => reply.id !== replyId);
    upsertComment(runtime, comment);
  }
}

function sendCommentsToChat(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1) || firstUuidLikeString(requestBody) || "";
  const chatId = decodeProtoStringField(requestBody, 3) || randomUuid();
  const messageId = randomUuid();
  saveProjectData(runtime, projectId, (data) => {
    const chats = isRecord(data.chats) ? { ...data.chats } : {};
    const chat = isRecord(chats[chatId]) ? { ...chats[chatId] } : { id: chatId, messages: [] };
    const messages = Array.isArray(chat.messages) ? [...chat.messages] : [];
    messages.push({
      content: "Attached comments were sent to chat.",
      id: messageId,
      role: "user",
      timestamp: new Date().toISOString()
    });
    chats[chatId] = { ...chat, messages };
    return { ...data, chats };
  });
  const commentIds = decodeProtoStringFields(requestBody, 2);
  return Buffer.concat((commentIds.length > 0 ? commentIds : [messageId]).map((commentId) => protoString(1, commentId)));
}

function sendMultiplayerMessage(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1) || "";
  const chatId = decodeProtoStringField(requestBody, 2) || randomUuid();
  const embeddedRequest = extractGatewayMessagesRequestFromProto(requestBody);
  const embeddedUserText = cleanVisibleUserText(textFromMessageContent(lastGatewayUserMessage(embeddedRequest)?.content));
  const content = decodeProtoStringField(requestBody, 3) || embeddedUserText || "";
  const role = decodeProtoStringField(requestBody, 4) || "user";
  const clientMessageId = decodeProtoStringField(requestBody, 7) || randomUuid();
  const epoch = Date.now();
  saveProjectData(runtime, projectId, (data) => {
    const chats = isRecord(data.chats) ? { ...data.chats } : {};
    const chat = isRecord(chats[chatId]) ? { ...chats[chatId] } : { id: chatId, messages: [] };
    const messages = Array.isArray(chat.messages) ? [...chat.messages] : [];
    if (content) {
      messages.push({
        content,
        id: clientMessageId,
        role,
        timestamp: new Date().toISOString()
      });
    }
    chats[chatId] = { ...chat, messages };
    return { ...data, chats };
  });
  return Buffer.concat([
    protoString(1, clientMessageId),
    protoInt64(2, epoch),
    protoString(4, "")
  ]);
}

function commentFromRequest(runtime, requestBody, fallback, mode) {
  const strings = decodeAllProtoStrings(requestBody).map((item) => item.value);
  const projectId = decodeProtoStringField(requestBody, 1) || fallback.project_id || firstUuidLikeString(requestBody) || "";
  const id = mode === "update" ? decodeProtoStringField(requestBody, 2) || fallback.id || fallback.commentId || randomUuid() : fallback.id || fallback.commentId || randomUuid();
  const bodyField = mode === "create" ? 2 : 3;
  const filePathField = mode === "create" ? 3 : 0;
  const selectorField = mode === "create" ? 4 : 0;
  const descriptorField = mode === "create" ? 5 : 0;
  const text =
    decodeProtoStringField(requestBody, bodyField) ||
    strings.find((value) => value && value !== projectId && value !== id) ||
    fallback.text ||
    fallback.body ||
    "";
  const filePath = sanitizeProjectFilePath((filePathField ? decodeProtoStringField(requestBody, filePathField) : "") || fallback.path || fallback.filePath || "");
  const elementSelector = (selectorField ? decodeProtoStringField(requestBody, selectorField) : "") || fallback.element_selector || fallback.elementSelector || "";
  const elementDescriptor = (descriptorField ? decodeProtoStringField(requestBody, descriptorField) : "") || fallback.element_descriptor || fallback.elementDescriptor || "";
  const now = new Date().toISOString();
  return {
    author_email: runtime.me.email,
    author_account_uuid: runtime.me.accountUuid,
    author_display_name: runtime.me.displayName,
    author_name: runtime.me.displayName,
    body: text,
    created_at: fallback.created_at || now,
    element_descriptor: elementDescriptor,
    element_selector: elementSelector,
    id,
    path: filePath,
    project_id: projectId,
    replies: Array.isArray(fallback.replies) ? fallback.replies : [],
    resolved: mode === "update" ? decodeProtoBoolField(requestBody, 4) || fallback.resolved === true : fallback.resolved === true,
    text,
    updated_at: now
  };
}

function getComment(runtime, commentId) {
  if (!commentId) {
    return undefined;
  }
  const row = queryRows(
    runtime.store.database,
    "SELECT collection, uuid, created_at, updated_at, title, model, data_json, messages_json FROM claude_design_items WHERE collection = ? AND uuid = ? LIMIT 1",
    [COMMENT_COLLECTION, commentId]
  )[0];
  return row ? normalizeCommentRecord(itemFromRow(row, runtime.me.organizationUuid)) : undefined;
}

function upsertComment(runtime, comment) {
  const normalized = normalizeCommentRecord(comment);
  upsertGenericRecord(runtime.store, COMMENT_COLLECTION, normalized.id, normalized.text || "Comment", runtime.me.defaultModelId, normalized);
}

function normalizeCommentRecord(comment) {
  const id = stringValue(comment.commentId) || stringValue(comment.id) || stringValue(comment.uuid) || randomUuid();
  const text = stringValue(comment.body) || stringValue(comment.text) || "";
  return {
    ...comment,
    author_account_uuid: stringValue(comment.author_account_uuid) || stringValue(comment.authorAccountUuid),
    author_display_name: stringValue(comment.author_display_name) || stringValue(comment.authorDisplayName) || stringValue(comment.author_name),
    body: text,
    commentId: id,
    element_descriptor: stringValue(comment.element_descriptor) || stringValue(comment.elementDescriptor),
    element_selector: stringValue(comment.element_selector) || stringValue(comment.elementSelector),
    filePath: stringValue(comment.filePath) || stringValue(comment.path),
    id,
    replies: Array.isArray(comment.replies) ? comment.replies : []
  };
}

function encodeComment(comment) {
  const normalized = normalizeCommentRecord(comment);
  return Buffer.concat([
    protoString(1, normalized.id),
    protoString(2, normalized.project_id),
    protoString(3, normalized.author_account_uuid),
    protoString(4, normalized.author_display_name),
    protoString(5, normalized.body),
    protoString(9, "mock"),
    ...normalized.replies.map((reply) => protoMessage(12, encodeCommentReply(reply)))
  ]);
}

function encodeCommentReply(reply) {
  const normalized = {
    ...reply,
    author_account_uuid: stringValue(reply.author_account_uuid) || stringValue(reply.authorAccountUuid),
    author_display_name: stringValue(reply.author_display_name) || stringValue(reply.authorDisplayName) || stringValue(reply.author_name),
    body: stringValue(reply.body) || stringValue(reply.text),
    comment_id: stringValue(reply.comment_id) || stringValue(reply.commentId),
    id: stringValue(reply.replyId) || stringValue(reply.id) || randomUuid()
  };
  return Buffer.concat([
    protoString(1, normalized.id),
    protoString(2, normalized.comment_id),
    protoString(3, normalized.author_account_uuid),
    protoString(4, normalized.author_display_name),
    protoString(5, normalized.body)
  ]);
}

function encodeToolCallResponse(rpcName, requestBody) {
  const strings = decodeAllProtoStrings(requestBody);
  const payload = {
    mock: true,
    method: rpcName,
    request: strings
  };
  return Buffer.concat([
    protoString(1, JSON.stringify(payload)),
    protoBool(2, false)
  ]);
}

function encodeIntegrationAuthResponse(rpcName) {
  if (!rpcName.endsWith("StartAuth")) {
    return Buffer.alloc(0);
  }
  return Buffer.concat([
    protoString(1, `${rpcName}:mock`),
    protoString(2, "mock-connected")
  ]);
}

function encodeIntegrationListResponse(rpcName, requestBody) {
  return Buffer.alloc(0);
}

function updateOrgSettings(runtime, requestBody) {
  const defaultDesignSystemProjectUuid = decodeProtoStringField(requestBody, 1) || "";
  upsertGenericRecord(runtime.store, "org_settings", "default", "default", runtime.me.defaultModelId, {
    default_design_system_project_uuid: defaultDesignSystemProjectUuid
  });
}

function encodeGetOrgSettingsResponse(runtime) {
  const settings = getItem(runtime.store, "org_settings", runtime.me.organizationUuid, "default", runtime.me);
  return Buffer.concat([
    protoString(1, settings.default_design_system_project_uuid),
    protoTimestamp(2, settings.updated_at)
  ]);
}

function encodeGetMeResponse(me) {
  return Buffer.concat([
    protoString(1, me.accountUuid),
    protoString(2, me.organizationUuid),
    protoString(3, me.email),
    protoString(4, me.displayName),
    protoString(5, me.orgName),
    protoString(6, me.growthbookPayload),
    ...((me.modelPresets || []).map((preset) => protoMessage(8, encodeModelPreset(preset)))),
    protoString(9, me.defaultModelId),
    protoBool(10, me.overrideStickyModel),
    protoBool(11, me.isPersonalOrg),
    protoEnum(12, me.accessLevel === "ACCESS_LEVEL_VIEWER" ? 2 : 1),
    protoBool(14, me.hasOauthTokens),
    protoBool(15, Boolean(me.dsManageEnforced)),
    protoBool(16, me.canManageDs),
    ...((me.memberships || []).map((membership) => protoMessage(17, Buffer.concat([protoString(1, membership.uuid), protoString(2, membership.name)]))))
  ]);
}

function encodeModelPreset(preset) {
  return Buffer.concat([
    protoString(1, preset.id),
    protoString(2, preset.label),
    protoInt32(3, preset.maxTokens || 0),
    protoString(4, preset.description),
    protoBool(5, preset.overflow === true),
    protoBool(6, preset.supportsAdaptiveThinking === true)
  ]);
}

function encodeMintPreviewTokenResponse(runtime) {
  return Buffer.concat([
    protoString(1, runtime.upstreamOrigin),
    protoString(2, randomUuid()),
    protoInt64(3, Math.floor(Date.now() / 1000) + 3600)
  ]);
}

function encodeTokenResponse() {
  return Buffer.concat([protoString(1, randomUuid()), protoInt64(2, Math.floor(Date.now() / 1000) + 3600)]);
}

function designSettingsPayload(runtime) {
  const item = getExistingItem(runtime.store, "settings", runtime.me.organizationUuid, "default");
  const model = normalizeClaudeDesignSelectableModel(runtime, stringValue(item?.model) || stringValue(item?.selected_model)) ||
    runtime.me.defaultModelId;
  return {
    defaultModelId: model,
    default_model_id: model,
    model,
    selectedModel: model,
    selected_model: model
  };
}

function persistDesignSelectedModel(runtime, modelValue) {
  const model = normalizeClaudeDesignSelectableModel(runtime, modelValue) || runtime.me.defaultModelId;
  runtime.me.defaultModelId = model;
  upsertGenericRecord(runtime.store, "settings", "default", "Claude Design Settings", model, {
    default_model_id: model,
    defaultModelId: model,
    model,
    selected_model: model,
    selectedModel: model
  });
  return designSettingsPayload(runtime);
}

function normalizeClaudeDesignSelectableModel(runtime, value) {
  const normalized = normalizeRouteTarget(value);
  if (!normalized) {
    return undefined;
  }
  const presets = Array.isArray(runtime?.gatewayModelPresets) ? runtime.gatewayModelPresets : [];
  const direct = findGatewayModelPresetId(presets, normalized);
  if (direct) {
    return direct;
  }
  const publicModel = publicGatewayModelSelector(normalized);
  return findGatewayModelPresetId(presets, publicModel) || publicModel || normalized;
}

function findGatewayModelPresetId(presets, model) {
  const normalized = stringValue(model)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }
  const preset = presets.find((preset) => isRecord(preset) && stringValue(preset.id)?.toLowerCase() === normalized);
  return stringValue(preset?.id);
}

function upsertGenericRecord(store, collection, uuid, title, model, data) {
  const now = new Date().toISOString();
  const existing = queryRows(
    store.database,
    "SELECT created_at FROM claude_design_items WHERE collection = ? AND uuid = ? LIMIT 1",
    [collection, uuid]
  )[0];
  store.database.run(
    "INSERT OR REPLACE INTO claude_design_items (collection, uuid, created_at, updated_at, title, model, data_json, messages_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [collection, uuid, existing?.created_at || now, now, title || uuid, model || "", JSON.stringify(data || {}), "[]"]
  );
  store.persist();
}

async function handleDesignRestApi(runtime, method, path, request, requestBody) {
  const restPath = normalizeDesignRestPath(path);

  if (method === "POST" && restPath === "/v1/design/telemetry") {
    return jsonResponse(200, { ok: true });
  }

  if (method === "GET" && (restPath === "/v1/design/settings" || restPath === "/v1/design/model-selection")) {
    return jsonResponse(200, designSettingsPayload(runtime));
  }

  if (method === "POST" && (restPath === "/v1/design/settings" || restPath === "/v1/design/model-selection")) {
    const payload = parseJsonBody(requestBody);
    const settings = persistDesignSelectedModel(runtime, stringValue(payload.model) || stringValue(payload.defaultModelId));
    return jsonResponse(200, {
      ok: true,
      ...settings
    });
  }

  if (method === "POST" && restPath === "/v1/design/turn-title") {
    const payload = parseJsonBody(requestBody);
    const message = stringValue(payload.message) || stringValue(payload.title) || stringValue(payload.prompt) || "";
    const title = titleFromTurnMessage(message);
    return jsonResponse(200, {
      kind: stringValue(payload.kind) || "chat",
      ok: true,
      title
    });
  }

  if (method === "POST" && restPath === "/v1/design/artifact-proxy/v1/messages") {
    return await proxyArtifactMessages(runtime, requestBody);
  }

  const serveMatch = restPath.match(/^\/v1\/design\/projects\/([^/]+)\/serve\/(.+)$/);
  if (method === "GET" && serveMatch) {
    const projectId = decodeURIComponent(serveMatch[1]);
    const filePath = sanitizeProjectFilePath(decodeURIComponent(serveMatch[2]));
    const row = getProjectFileRow(runtime, projectId, filePath);
    if (!row) {
      return jsonResponse(404, { error: { message: `File not found: ${filePath}` } });
    }
    return serveProjectFileResponse(runtime, projectId, row, filePath);
  }

  const dataMatch = restPath.match(/^\/v1\/design\/projects\/([^/]+)\/data$/);
  if (method === "PUT" && dataMatch) {
    const projectId = decodeURIComponent(dataMatch[1]);
    const payload = parseJsonBody(requestBody);
    const base64 = stringValue(payload.data);
    if (base64) {
      saveProjectData(runtime, projectId, (data) => ({
        ...data,
        project_data_base64: base64
      }));
    }
    return jsonResponse(200, { ok: true, project_id: projectId });
  }

  const thumbnailPutMatch = restPath.match(/^\/v1\/design\/projects\/([^/]+)\/thumbnail$/);
  if (method === "PUT" && thumbnailPutMatch) {
    const projectId = decodeURIComponent(thumbnailPutMatch[1]);
    const payload = parseJsonBody(requestBody);
    storeProjectThumbnail(runtime, projectId, stringValue(payload.thumbnail_data_url) || stringValue(payload.thumbnailDataUrl) || "");
    return jsonResponse(200, { ok: true, project_id: projectId });
  }

  const thumbnailGetMatch = restPath.match(/^\/v1\/design\/projects\/([^/]+)\/thumbnail(?:\/[^/]+)?$/);
  if (method === "GET" && thumbnailGetMatch) {
    const projectId = decodeURIComponent(thumbnailGetMatch[1]);
    const thumbnail = readProjectThumbnail(runtime, projectId);
    if (thumbnail) {
      return binaryResponse(200, thumbnail.body, {
        "cache-control": "no-store",
        "content-type": thumbnail.contentType
      });
    }
    return textResponse(200, TRANSPARENT_SVG, {
      "cache-control": "no-store",
      "content-type": "image/svg+xml"
    });
  }

  const downloadMatch = restPath.match(/^\/v1\/design\/projects\/([^/]+)\/download$/);
  if (method === "GET" && downloadMatch) {
    const projectId = decodeURIComponent(downloadMatch[1]);
    const manifest = listProjectFileRows(runtime, projectId, "").map((row) => ({
      content_type: row.content_type,
      path: row.path,
      size: Buffer.from(row.body_base64 || "", "base64").length,
      version: row.version
    }));
    return textResponse(200, JSON.stringify({ files: manifest, project_id: projectId }, null, 2), {
      "content-disposition": `attachment; filename="${projectId}.json"`,
      "content-type": "application/json; charset=utf-8"
    });
  }

  if (method === "POST" && restPath === "/v1/design/drop-suggestions") {
    return jsonResponse(200, { suggestions: [] });
  }

  return jsonResponse(404, {
    error: {
      message: `Claude Design REST mock has no route for ${method} ${path}`
    }
  });
}

async function proxyArtifactMessages(runtime, requestBody) {
  const payload = parseJsonBody(requestBody);
  const gatewayBody = normalizeGatewayMessagesRequest(runtime, payload);
  const routingDecision = applyClaudeDesignRouting(runtime, gatewayBody);
  const sessionContext = claudeDesignSessionContext({
    chatId: readClaudeDesignChatId(payload),
    projectId: readClaudeDesignProjectId(payload)
  });
  let response;
  try {
    response = await fetchGateway(runtime, "/v1/messages", gatewayBody, routingDecision, sessionContext);
  } catch (error) {
    return textResponse(200, artifactProxySseError(error instanceof Error ? error.message : String(error)), {
      "cache-control": "no-store",
      "content-type": "text/event-stream; charset=utf-8"
    });
  }
  const bodyText = await response.text();
  if (
    headerIncludes(response.headers.get("content-type"), "text/event-stream") ||
    bodyText.startsWith("data: ") ||
    bodyText.includes("\ndata: ") ||
    bodyText.includes("\r\ndata: ")
  ) {
    return textResponse(response.status, bodyText, {
      "cache-control": "no-store",
      "content-type": response.headers.get("content-type") || "text/event-stream; charset=utf-8"
    });
  }

  const body = parseMaybeJson(bodyText, {});
  if (!response.ok) {
    const message = body?.error?.message || bodyText || `Gateway request failed with HTTP ${response.status}`;
    return textResponse(200, artifactProxySseError(message), {
      "cache-control": "no-store",
      "content-type": "text/event-stream; charset=utf-8"
    });
  }

  return textResponse(200, artifactProxySseText(extractGatewayAssistantText(body)), {
    "cache-control": "no-store",
    "content-type": "text/event-stream; charset=utf-8"
  });
}

function artifactProxySseText(text) {
  const value = stringValue(text);
  const events = [];
  if (value) {
    events.push({
      delta: {
        text: value,
        type: "text_delta"
      },
      type: "content_block_delta"
    });
  }
  return `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
}

function artifactProxySseError(message) {
  return `data: ${JSON.stringify({ error: { message: message || "Unknown gateway error." }, type: "error" })}\n\ndata: [DONE]\n\n`;
}

function normalizeDesignRestPath(path) {
  if (path.startsWith("/design/v1/design/")) {
    return path.slice("/design".length);
  }
  return path;
}

function serveProjectFileResponse(runtime, projectId, row, filePath) {
  const body = Buffer.from(row.body_base64 || "", "base64");
  const contentType = row.content_type || guessContentType(filePath);
  if (isHtmlProjectFile(filePath, contentType)) {
    const html = body.toString("utf8");
    const normalizedHtml = normalizeBabelJsxScriptTags(html);
    const inlinedHtml = inlineLocalBabelJsxScriptTags(runtime, projectId, filePath, normalizedHtml);
    return textResponse(200, injectOmelettePreviewEvalBridge(inlinedHtml), {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8"
    });
  }
  return binaryResponse(200, body, {
    "cache-control": "no-store",
    "content-type": contentType
  });
}

function isHtmlProjectFile(filePath, contentType) {
  return /\.html?$/i.test(filePath) || headerIncludes(contentType, "text/html");
}

function injectOmelettePreviewEvalBridge(html) {
  const source = String(html || "");
  if (source.includes("__om_eval") || source.includes("__omEvalBridgeInstalled")) {
    return source;
  }
  const scriptTag = `<script>${OMELETTE_PREVIEW_EVAL_BRIDGE_SCRIPT}</script>`;
  if (/<head\b[^>]*>/i.test(source)) {
    return source.replace(/<head\b([^>]*)>/i, (tag) => `${tag}\n${scriptTag}`);
  }
  if (/<body\b[^>]*>/i.test(source)) {
    return source.replace(/<body\b([^>]*)>/i, (tag) => `${tag}\n${scriptTag}`);
  }
  return `${scriptTag}\n${source}`;
}

function normalizeBabelJsxScriptTags(html) {
  if (!/(?:@babel\/standalone|babel\.min\.js|type=["']text\/babel["'])/i.test(html)) {
    return html;
  }
  return String(html).replace(/<script\b([^>]*)>/gi, (tag, attrs) => {
    if (/\btype\s*=/.test(attrs)) {
      return tag;
    }
    const srcMatch = /\bsrc\s*=\s*(["'])([^"']+)\1/i.exec(attrs);
    if (!srcMatch || !/\.jsx(?:[?#].*)?$/i.test(srcMatch[2])) {
      return tag;
    }
    return `<script type="text/babel"${attrs}>`;
  });
}

function inlineLocalBabelJsxScriptTags(runtime, projectId, filePath, html) {
  if (!/(?:@babel\/standalone|babel\.min\.js|type=["']text\/babel["'])/i.test(html)) {
    return html;
  }
  return String(html).replace(/<script\b([^>]*)>\s*<\/script>/gi, (tag, attrs) => {
    const typeMatch = /\btype\s*=\s*(["'])([^"']+)\1/i.exec(attrs);
    if (!typeMatch || typeMatch[2].toLowerCase() !== "text/babel") {
      return tag;
    }
    const srcMatch = /\bsrc\s*=\s*(["'])([^"']+)\1/i.exec(attrs);
    if (!srcMatch || !/\.jsx(?:[?#].*)?$/i.test(srcMatch[2])) {
      return tag;
    }
    const scriptPath = resolveLocalProjectScriptPath(filePath, srcMatch[2]);
    if (!scriptPath) {
      return tag;
    }
    const scriptRow = getProjectFileRow(runtime, projectId, scriptPath);
    if (!scriptRow) {
      return tag;
    }
    const scriptBody = Buffer.from(scriptRow.body_base64 || "", "base64").toString("utf8");
    const inlineAttrs = attrs.replace(srcMatch[0], "");
    return `<script${inlineAttrs}>${escapeInlineScriptBody(scriptBody)}\n</script>`;
  });
}

function resolveLocalProjectScriptPath(filePath, src) {
  const rawSrc = String(src || "").trim();
  if (!rawSrc || rawSrc.startsWith("/") || rawSrc.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(rawSrc)) {
    return "";
  }
  const pathOnly = rawSrc.split("#", 1)[0].split("?", 1)[0];
  let decodedPath = pathOnly;
  try {
    decodedPath = decodeURIComponent(pathOnly);
  } catch {
    decodedPath = pathOnly;
  }
  const baseDir = pathModule.posix.dirname(sanitizeProjectFilePath(filePath));
  return sanitizeProjectFilePath(pathModule.posix.join(baseDir === "." ? "" : baseDir, decodedPath));
}

function escapeInlineScriptBody(body) {
  return String(body || "").replace(/<\/script/gi, "<\\/script");
}

function titleFromTurnMessage(message) {
  const text = String(message || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "New turn";
  }
  if (/questions timed out/i.test(text)) {
    return "Continue with defaults";
  }
  return text.length > 60 ? `${text.slice(0, 57).trim()}...` : text;
}

async function countGatewayTokens(runtime, requestBody) {
  const messagesRequest = decodeProtoBytesField(requestBody, 1) || Buffer.alloc(0);
  const body = parseGatewayMessagesRequestBuffer(messagesRequest) ||
    extractGatewayMessagesRequestFromProto(requestBody) ||
    {};
  const normalized = normalizeGatewayMessagesRequest(runtime, body);
  const routingDecision = applyClaudeDesignRouting(runtime, normalized);
  try {
    const response = await fetchGateway(runtime, "/v1/messages/count_tokens", normalized, routingDecision);
    if (response.ok) {
      const payload = await response.json();
      return protoInt32(1, Number(payload.input_tokens) || estimateTokenCount(normalized));
    }
  } catch {
    // Fall through to local estimate.
  }
  return protoInt32(1, estimateTokenCount(normalized));
}

async function chatWithGateway(runtime, requestBody) {
  const projectId = decodeProtoStringField(requestBody, 1) || "";
  const chatId = decodeProtoStringField(requestBody, 3) || (projectId ? defaultProjectChatId(projectId) : randomUuid());
  const request = {
    assistantMessageId: decodeProtoStringField(requestBody, 4) || randomUuid(),
    chatId,
    messagesRequest: decodeProtoBytesField(requestBody, 2) || Buffer.alloc(0),
    projectId
  };
  const originalBody = parseGatewayMessagesRequestBuffer(request.messagesRequest) ||
    extractGatewayMessagesRequestFromProto(requestBody) ||
    gatewayMessagesRequestFromProjectChat(runtime, request) ||
    {};
  if (!hasGatewayMessagesInput(originalBody)) {
    return connectStreamResponse([
      encodeChatResponseMessageStart(request.assistantMessageId),
      encodeChatResponseError("Claude Design chat request did not include a messages payload.")
    ]);
  }
  const gatewayBody = normalizeGatewayMessagesRequest(runtime, {
    ...originalBody,
    stream: false
  });
  const routingDecision = applyClaudeDesignRouting(runtime, gatewayBody);
  const sessionContext = claudeDesignSessionContext(request);

  let assistantText = "";
  let toolCalls = [];
  let stopReason = "end_turn";
  let messageId = request.assistantMessageId;
  let model = gatewayBody.model || runtime.me.defaultModelId;
  const events = [encodeChatResponseMessageStart(messageId), encodeChatResponseRaw("message_start", { message: { content: [], id: messageId, model, role: "assistant" } })];

  try {
    const response = await fetchGateway(runtime, "/v1/messages", gatewayBody, routingDecision, sessionContext);
    const payloadText = await response.text();
    const payload = parseMaybeJson(payloadText, {});
    if (!response.ok) {
      const message = payload?.error?.message || payloadText || `Gateway request failed with HTTP ${response.status}`;
      events.push(encodeChatResponseError(message));
      return connectStreamResponse(events);
    }
    assistantText = extractGatewayAssistantText(payload);
    toolCalls = extractGatewayToolCalls(payload);
    const gatewayStopReason = extractGatewayStopReason(payload, stopReason);
    if (runtime.autoAnswerQuestions) {
      const absorbed = absorbQuestionToolCalls(assistantText, toolCalls);
      assistantText = absorbed.assistantText;
      toolCalls = absorbed.toolCalls;
    }
    stopReason = toolCalls.length > 0 ? "tool_use" : gatewayStopReason === "tool_use" ? "end_turn" : gatewayStopReason;
    messageId = stringValue(payload.id) || messageId;
    model = publicGatewayModelSelector(routingDecision.routedModel || gatewayBody.model || model) || model;
  } catch (error) {
    events.push(encodeChatResponseError(error instanceof Error ? error.message : String(error)));
    return connectStreamResponse(events);
  }

  if (!assistantText && toolCalls.length === 0) {
    assistantText = "Claude Design gateway returned an empty response.";
  }
  if (assistantText) {
    events.push(encodeChatResponseTextDelta(assistantText));
    events.push(encodeChatResponseRaw("text_block", { index: 0, text: assistantText }));
  }
  const firstToolIndex = assistantText ? 1 : 0;
  toolCalls.forEach((toolCall, index) => {
    const blockIndex = firstToolIndex + index;
    events.push(
      encodeChatResponseRaw("tool_delta", {
        id: toolCall.id,
        index: blockIndex,
        partial_json: JSON.stringify(toolCall.input || {}),
        tool: toolCall.name
      })
    );
    events.push(
      encodeChatResponseRaw("tool_block_complete", {
        id: toolCall.id,
        index: blockIndex,
        input: toolCall.input || {},
        name: toolCall.name
      })
    );
  });
  const messageContent = gatewayMessageContent(assistantText, toolCalls);
  events.push(
    encodeChatResponseRaw("done", {
      message: {
        content: messageContent,
        id: messageId,
        model,
        role: "assistant",
        stop_reason: stopReason
      }
    })
  );
  events.push(encodeChatResponseMessageStop(stopReason));
  appendChatExchange(runtime, request, gatewayBody, assistantText, messageId, gatewayContentBlocks(assistantText, toolCalls));
  return connectStreamResponse(events);
}

function parseGatewayMessagesRequestBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return undefined;
  }
  const text = buffer.toString("utf8").trim();
  if (!text || !text.startsWith("{")) {
    return undefined;
  }
  const body = parseMaybeJson(text, undefined);
  return hasGatewayMessagesInput(body) ? body : undefined;
}

function extractGatewayMessagesRequestFromProto(buffer, depth = 0, seen = new Set()) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || depth > 6 || seen.has(buffer)) {
    return undefined;
  }
  seen.add(buffer);

  const direct = parseGatewayMessagesRequestBuffer(buffer);
  if (direct) {
    return direct;
  }

  let found;
  forEachProtoField(buffer, (field) => {
    if (found || field.wireType !== 2 || !Buffer.isBuffer(field.value) || field.value.length === 0) {
      return;
    }
    const directValue = parseGatewayMessagesRequestBuffer(field.value);
    if (directValue) {
      found = directValue;
      return;
    }
    const textValue = field.value.toString("utf8");
    const embeddedValue = extractGatewayMessagesRequestFromText(textValue);
    if (embeddedValue) {
      found = embeddedValue;
      return;
    }
    if (field.value.length <= 512 * 1024) {
      found = extractGatewayMessagesRequestFromProto(field.value, depth + 1, seen);
    }
  });
  return found;
}

function extractGatewayMessagesRequestFromText(text) {
  if (typeof text !== "string" || !text.includes("messages")) {
    return undefined;
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return undefined;
  }
  const body = parseMaybeJson(text.slice(start, end + 1), undefined);
  return hasGatewayMessagesInput(body) ? body : undefined;
}

function hasGatewayMessagesInput(body) {
  if (!isRecord(body)) {
    return false;
  }
  if (stringValue(body.message) || stringValue(body.prompt)) {
    return true;
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return false;
  }
  return body.messages.some((message) => {
    if (!isRecord(message)) {
      return false;
    }
    return Boolean(stringValue(message.content) || storedProjectMessageText(message) ||
      (Array.isArray(message.content) && message.content.some((block) =>
        typeof block === "string" ||
        (isRecord(block) && (stringValue(block.text) || stringValue(block.content) || stringValue(block.output_text)))
      )));
  });
}

function gatewayMessagesRequestFromProjectChat(runtime, request) {
  const row = getProjectRow(runtime, request.projectId);
  if (!row) {
    return undefined;
  }
  const data = normalizedProjectDataFromRow(runtime, row);
  const chatId = request.chatId || stringValue(data.viewState?.activeChatId) || defaultProjectChatId(row.uuid);
  const chat = isRecord(data.chats) ? data.chats[chatId] : undefined;
  const messages = Array.isArray(chat?.messages) ? chat.messages : [];
  const gatewayMessages = messages
    .map(gatewayMessageFromStoredProjectMessage)
    .filter(Boolean);
  return gatewayMessages.length > 0 ? { messages: gatewayMessages, model: runtime.me.defaultModelId } : undefined;
}

function normalizedProjectDataFromRow(runtime, row) {
  const record = parseMaybeJson(row?.data_json, {});
  const base64 = stringValue(record.project_data_base64);
  const decoded = base64 ? parseMaybeJson(Buffer.from(base64, "base64").toString("utf8"), record) : record;
  return normalizeProjectStoreData(runtime, row, decoded);
}

function gatewayMessageFromStoredProjectMessage(message) {
  if (!isRecord(message)) {
    return undefined;
  }
  const role = stringValue(message.role);
  if (role !== "user" && role !== "assistant") {
    return undefined;
  }
  const content = cleanVisibleUserText(storedProjectMessageText(message));
  if (!content) {
    return undefined;
  }
  return {
    content,
    role
  };
}

function storedProjectMessageText(message) {
  const parts = [];
  const content = stringValue(message.content);
  if (content) {
    parts.push(content);
  }
  const blocks = Array.isArray(message.contentBlocks)
    ? message.contentBlocks
    : Array.isArray(message.content_blocks)
      ? message.content_blocks
      : undefined;
  const blockText = textFromMessageContent(blocks);
  if (blockText) {
    parts.push(blockText);
  }
  if (Array.isArray(message.attachments)) {
    for (const attachment of message.attachments) {
      if (!isRecord(attachment)) {
        continue;
      }
      const attachmentContent = stringValue(attachment.content) || stringValue(attachment.text);
      if (!attachmentContent) {
        continue;
      }
      const attachmentName = stringValue(attachment.name);
      parts.push(attachmentName ? `${attachmentName}\n${attachmentContent}` : attachmentContent);
    }
  }
  return parts.join("\n\n");
}

function normalizeGatewayMessagesRequest(runtime, body) {
  const record = isRecord(body) ? body : {};
  const text = stringValue(record.message) || stringValue(record.prompt) || "";
  const normalizedMessages = Array.isArray(record.messages) ? normalizeGatewayMessagesForRequest(record.messages) : [];
  const messages = normalizedMessages.length > 0
    ? normalizedMessages
    : text
      ? [{ content: text, role: "user" }]
      : [{ content: "Continue.", role: "user" }];
  const maxTokens = Math.max(128, Number(record.max_tokens || record.maxTokens) || 4096);
  return {
    ...record,
    max_tokens: maxTokens,
    messages,
    model: publicGatewayModelSelector(stringValue(record.model) || runtime.me.defaultModelId) || runtime.me.defaultModelId,
    stream: false
  };
}

function normalizeGatewayMessagesForRequest(messages) {
  return messages
    .map((message) => {
      if (!isRecord(message)) {
        return undefined;
      }
      const role = stringValue(message.role) || "user";
      if (role !== "system" && role !== "user" && role !== "assistant") {
        return undefined;
      }
      if (stringValue(message.content) || Array.isArray(message.content)) {
        return {
          ...message,
          role
        };
      }
      const content = cleanVisibleUserText(storedProjectMessageText(message));
      return content ? { content, role } : undefined;
    })
    .filter(Boolean);
}

function applyClaudeDesignRouting(runtime, body) {
  const requestedModel = stringValue(body?.model) || runtime.me.defaultModelId;
  const routing = runtime.routing;
  if (!routing || routing.enabled === false) {
    return { requestedModel };
  }

  const route = resolveClaudeDesignRoute(routing, body, requestedModel, runtime.defaultGatewayModel, runtime.gatewayModelPresets);
  if (!route?.target) {
    return { requestedModel };
  }

  const target = usableClaudeDesignRouteTarget(runtime, route.target);
  if (!target) {
    return { requestedModel };
  }

  body.model = target;
  return {
    requestedModel,
    reason: target === route.target ? route.reason : `${route.reason}:fallback`,
    routedModel: target
  };
}

function resolveClaudeDesignRoute(routing, body, requestedModel, defaultGatewayModel, gatewayModelPresets) {
  for (const rule of routing.rules || []) {
    if (rule.enabled === false || !rule.target) {
      continue;
    }
    if (matchesClaudeDesignRouteRule(rule, body, requestedModel)) {
      return {
        reason: rule.id ? `plugin-rule:${rule.id}` : `plugin-rule:${rule.type}`,
        target: rule.target
      };
    }
  }

  const aliasedModel = claudeDesignModelAliasTarget(requestedModel, defaultGatewayModel);
  if (aliasedModel) {
    return {
      reason: "plugin-model-alias",
      target: aliasedModel
    };
  }

  if (routing.defaultTarget && !isKnownClaudeDesignGatewayModel(gatewayModelPresets, requestedModel)) {
    return {
      reason: "plugin-default",
      target: routing.defaultTarget
    };
  }

  return undefined;
}

function claudeDesignModelAliasTarget(requestedModel, defaultGatewayModel) {
  const normalizedModel = stringValue(requestedModel);
  if (!normalizedModel) {
    return undefined;
  }
  const target = CLAUDE_DESIGN_MODEL_ALIASES.get(normalizedModel);
  if (!target) {
    return undefined;
  }
  return normalizeRouteTarget(defaultGatewayModel) || target;
}

function isKnownClaudeDesignGatewayModel(gatewayModelPresets, requestedModel) {
  const publicModel = publicGatewayModelSelector(requestedModel);
  if (!publicModel || !Array.isArray(gatewayModelPresets)) {
    return false;
  }
  return gatewayModelPresets.some((preset) => isRecord(preset) && stringValue(preset.id)?.toLowerCase() === publicModel.toLowerCase());
}

function usableClaudeDesignRouteTarget(runtime, target) {
  const normalized = normalizeRouteTarget(target);
  if (!normalized) {
    return undefined;
  }
  if (routeTargetProviderAvailable(runtime.availableProviderNames, normalized)) {
    return normalized;
  }

  const fallback = usableClaudeDesignFallbackTarget(runtime);
  warnUnavailableClaudeDesignRouteTarget(runtime, normalized, fallback);
  return fallback;
}

function usableClaudeDesignFallbackTarget(runtime) {
  const configured = normalizeRouteTarget(runtime?.defaultGatewayModel);
  if (configured && routeTargetProviderAvailable(runtime?.availableProviderNames, configured)) {
    return configured;
  }
  return DEFAULT_GATEWAY_MODEL;
}

function routeTargetProviderAvailable(availableProviderNames, target) {
  if (!(availableProviderNames instanceof Set) || availableProviderNames.size === 0) {
    return true;
  }
  const provider = routeTargetProviderName(target);
  return !provider || availableProviderNames.has(provider.toLowerCase());
}

function routeTargetProviderName(target) {
  const normalized = normalizeRouteTarget(target);
  if (!normalized) {
    return undefined;
  }
  const separator = normalized.indexOf("/");
  if (separator <= 0 || separator >= normalized.length - 1) {
    return undefined;
  }
  return normalized.slice(0, separator).trim();
}

function warnUnavailableClaudeDesignRouteTarget(runtime, target, fallback) {
  const key = `${target}\n${fallback}`;
  if (runtime?.unavailableRouteTargetWarnings?.has(key)) {
    return;
  }
  runtime?.unavailableRouteTargetWarnings?.add(key);
  runtime?.logger?.warn?.(
    `Claude Design routing target "${target}" references a provider that is not configured in CCR; using "${fallback}" instead.`
  );
}

function matchesClaudeDesignRouteRule(rule, body, requestedModel) {
  switch (rule.type) {
    case "always":
      return true;
    case "image":
      return hasImageContent(body?.messages);
    case "long-context":
      return estimateTokenCount(body) > (rule.threshold || 200000);
    case "model":
      return Boolean(rule.model && requestedModel === rule.model);
    case "model-prefix":
      return Boolean(rule.pattern && requestedModel?.startsWith(rule.pattern));
    case "thinking":
      return Boolean(body?.thinking);
    case "web-search":
      return hasWebSearchTool(body?.tools);
    default:
      return false;
  }
}

function normalizeClaudeDesignRouting(value, options = {}) {
  const fallbackTarget = normalizeRouteTarget(composeRouteTarget(options.targetProvider, options.targetModel) || stringValue(options.targetModel));
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
      const normalized = normalizeClaudeDesignRoutingRule(rule, index);
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

function normalizeClaudeDesignRoutingRule(value, index) {
  if (!isRecord(value)) {
    return undefined;
  }

  const type = stringValue(value.type) || "model";
  if (!CLAUDE_DESIGN_ROUTE_TYPES.has(type)) {
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

function claudeDesignProviderSelectorNames(config) {
  const names = new Set();
  const providers = claudeDesignProviderConfigs(config);
  for (const provider of providers) {
    if (!isRecord(provider)) {
      continue;
    }
    const name = stringValue(provider.name);
    if (!name) {
      continue;
    }
    addProviderSelectorName(names, name);
    addProviderSelectorName(names, provider.provider);

    const capabilities = Array.isArray(provider.capabilities) ? provider.capabilities : [];
    for (const capability of capabilities) {
      if (!isRecord(capability)) {
        continue;
      }
      const protocol = normalizeGatewayProviderProtocol(capability.type || capability.protocol);
      if (protocol && stringValue(capability.baseUrl || capability.base_url)) {
        addProviderSelectorName(names, `${name}::${protocol}`);
      }
    }

    const credentialProtocols = claudeDesignProviderProtocols(provider);
    providerCredentials(provider).forEach((credential, index) => {
      if (!providerCredentialApiKey(credential)) {
        return;
      }
      const credentialSlug = providerCredentialSlug(providerCredentialRuntimeId(credential, index));
      for (const protocol of credentialProtocols) {
        addProviderSelectorName(names, `${name}::${protocol}::cred:${credentialSlug}`);
      }
    });
  }
  return names;
}

function defaultClaudeDesignGatewayConfigPath() {
  const home = stringValue(process.env.HOME) || stringValue(process.env.USERPROFILE);
  return home ? pathModule.join(home, ".claude-code-router", "gateway.config.json") : undefined;
}

function loadClaudeDesignGatewayConfig(file, logger) {
  const configFile = stringValue(file);
  if (!configFile || !fs.existsSync(configFile)) {
    return {};
  }
  try {
    return parseMaybeJson(fs.readFileSync(configFile, "utf8"), {});
  } catch (error) {
    logger?.warn?.(`Claude Design could not read gateway config ${configFile}: ${error?.message || error}`);
    return {};
  }
}

function claudeDesignModelSourceConfig(config, gatewayConfig) {
  return {
    ...(isRecord(config) ? config : {}),
    Providers: uniqueProviderRecords([
      ...claudeDesignProviderConfigs(config),
      ...claudeDesignProviderConfigs(gatewayConfig)
    ]),
    virtualModelProfiles: uniqueVirtualModelProfiles([
      ...claudeDesignVirtualModelProfilesForConfig(config),
      ...claudeDesignVirtualModelProfilesForConfig(gatewayConfig)
    ])
  };
}

function claudeDesignProviderConfigs(config) {
  if (!isRecord(config)) {
    return [];
  }
  return [
    ...(Array.isArray(config.Providers) ? config.Providers : []),
    ...(Array.isArray(config.providers) ? config.providers : [])
  ].filter(isRecord);
}

function claudeDesignVirtualModelProfilesForConfig(config) {
  if (!isRecord(config)) {
    return [];
  }
  return [
    ...(Array.isArray(config.virtualModelProfiles) ? config.virtualModelProfiles : []),
    ...(Array.isArray(config.virtual_model_profiles) ? config.virtual_model_profiles : [])
  ].filter(isRecord);
}

function uniqueProviderRecords(providers) {
  const seen = new Set();
  const result = [];
  for (const provider of providers) {
    const name = stringValue(provider.name);
    const key = `${name}\n${JSON.stringify(Array.isArray(provider.models) ? provider.models : [])}`;
    if (!name || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(provider);
  }
  return result;
}

function uniqueVirtualModelProfiles(profiles) {
  const seen = new Set();
  const result = [];
  for (const profile of profiles) {
    const key = stringValue(profile.id) || stringValue(profile.name) || JSON.stringify(profile.match || profile);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(profile);
  }
  return result;
}

function claudeDesignGatewayModelPresets(config, defaultGatewayModel) {
  const defaultModel = publicGatewayModelSelector(defaultGatewayModel) || DEFAULT_GATEWAY_MODEL;
  const selectors = uniqueCaseInsensitiveStrings([
    defaultModel,
    ...claudeDesignProviderModelSelectors(config),
    ...claudeDesignVirtualModelSelectors(config),
    ...DEFAULT_ME.modelPresets.map((preset) => preset.id)
  ]);
  return selectors.map((selector, index) => claudeDesignGatewayModelPreset(selector, index === 0));
}

function claudeDesignProviderModelSelectors(config) {
  const providers = claudeDesignProviderConfigs(config);
  const selectors = [];
  for (const provider of providers) {
    if (!Array.isArray(provider.models)) {
      continue;
    }
    const providerSelectors = claudeDesignProviderModelProviderSelectors(provider);
    for (const model of provider.models) {
      const modelName = stringValue(model);
      if (!modelName) {
        continue;
      }
      for (const providerSelector of providerSelectors) {
        selectors.push(normalizeRouteTarget(`${providerSelector}/${modelName}`));
      }
    }
  }
  return selectors.filter(Boolean);
}

function claudeDesignProviderModelProviderSelectors(provider) {
  const selectors = [];
  addProviderModelSelector(selectors, publicGatewayProviderName(provider.name));
  addProviderModelSelector(selectors, provider.name);
  addProviderModelSelector(selectors, provider.provider);

  const name = stringValue(provider.name);
  const publicName = publicGatewayProviderName(name);
  const capabilities = Array.isArray(provider.capabilities) ? provider.capabilities : [];
  for (const capability of capabilities) {
    const protocol = isRecord(capability) ? normalizeGatewayProviderProtocol(capability.type || capability.protocol) : undefined;
    if (publicName && protocol) {
      addProviderModelSelector(selectors, `${publicName}::${protocol}`);
    }
    if (name && protocol) {
      addProviderModelSelector(selectors, `${name}::${protocol}`);
    }
  }

  providerCredentials(provider).forEach((credential, index) => {
    if (!providerCredentialApiKey(credential)) {
      return;
    }
    const credentialSlug = providerCredentialSlug(providerCredentialRuntimeId(credential, index));
    for (const protocol of claudeDesignProviderProtocols(provider)) {
      if (publicName) {
        addProviderModelSelector(selectors, `${publicName}::${protocol}::cred:${credentialSlug}`);
      }
      if (name) {
        addProviderModelSelector(selectors, `${name}::${protocol}::cred:${credentialSlug}`);
      }
    }
  });

  return uniqueCaseInsensitiveStrings(selectors);
}

function addProviderModelSelector(selectors, value) {
  const normalized = stringValue(value);
  if (normalized) {
    selectors.push(normalized);
  }
}

function claudeDesignVirtualModelSelectors(config) {
  const profiles = claudeDesignVirtualModelProfilesForConfig(config);
  const selectors = [];
  for (const profile of profiles) {
    if (!isRecord(profile) || profile.enabled === false) {
      continue;
    }
    const materialization = isRecord(profile.materialization) ? profile.materialization : {};
    if (materialization.enabled === false || materialization.includeInGatewayModels === false) {
      continue;
    }
    const match = isRecord(profile.match) ? profile.match : {};
    const aliases = Array.isArray(match.exactAliases) ? match.exactAliases : [];
    for (const alias of aliases) {
      const normalizedAlias = stringValue(alias);
      if (!normalizedAlias) {
        continue;
      }
      selectors.push(normalizedAlias.toLowerCase().startsWith("fusion/") ? normalizedAlias : `Fusion/${normalizedAlias}`);
    }
  }
  return selectors;
}

function claudeDesignGatewayModelPreset(selector, isDefault) {
  return {
    id: selector,
    label: gatewayModelPresetLabel(selector),
    maxTokens: 1000000,
    supportsAdaptiveThinking: true,
    description: isDefault ? "CCR gateway default" : "CCR gateway model"
  };
}

function gatewayModelPresetLabel(selector) {
  const value = stringValue(selector) || DEFAULT_GATEWAY_MODEL;
  const separator = value.indexOf("/");
  if (separator <= 0 || separator >= value.length - 1) {
    return value;
  }
  const provider = value.slice(0, separator);
  const model = value.slice(separator + 1);
  return `${model} (${provider})`;
}

function publicGatewayModelSelector(value) {
  const normalized = normalizeRouteTarget(value);
  if (!normalized) {
    return undefined;
  }
  const separator = normalized.indexOf("/");
  if (separator <= 0 || separator >= normalized.length - 1) {
    return normalized;
  }
  const provider = normalized.slice(0, separator).trim();
  const model = normalized.slice(separator + 1).trim();
  const protocolSeparator = provider.indexOf("::");
  const publicProvider = protocolSeparator > 0 ? provider.slice(0, protocolSeparator) : provider;
  return publicProvider && model ? `${publicProvider}/${model}` : normalized;
}

function publicGatewayProviderName(value) {
  const name = stringValue(value);
  if (!name) {
    return undefined;
  }
  const protocolSeparator = name.indexOf("::");
  return protocolSeparator > 0 ? name.slice(0, protocolSeparator) : name;
}

function uniqueCaseInsensitiveStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = stringValue(value);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function addProviderSelectorName(names, value) {
  const name = stringValue(value);
  if (name) {
    names.add(name.toLowerCase());
    const publicName = publicGatewayProviderName(name);
    if (publicName) {
      names.add(publicName.toLowerCase());
    }
  }
}

function claudeDesignProviderProtocols(provider) {
  const protocols = [];
  const seen = new Set();
  const capabilities = Array.isArray(provider.capabilities) ? provider.capabilities : [];
  for (const capability of capabilities) {
    if (!isRecord(capability)) {
      continue;
    }
    const protocol = normalizeGatewayProviderProtocol(capability.type || capability.protocol);
    if (protocol && stringValue(capability.baseUrl || capability.base_url) && !seen.has(protocol)) {
      seen.add(protocol);
      protocols.push(protocol);
    }
  }

  const direct = normalizeGatewayProviderProtocol(provider.type) ||
    normalizeGatewayProviderProtocol(provider.provider) ||
    inferGatewayProviderProtocol(provider);
  if (direct && !seen.has(direct)) {
    protocols.push(direct);
  }
  return protocols;
}

function normalizeGatewayProviderProtocol(value) {
  const normalized = stringValue(value)?.toLowerCase();
  if (normalized === "openai" || normalized === "openai_responses") {
    return "openai_responses";
  }
  if (normalized === "openai_chat" || normalized === "openai_chat_completions") {
    return "openai_chat_completions";
  }
  if (normalized === "anthropic" || normalized === "anthropic_messages") {
    return "anthropic_messages";
  }
  if (normalized === "gemini" || normalized === "gemini_generate_content") {
    return "gemini_generate_content";
  }
  return undefined;
}

function inferGatewayProviderProtocol(provider) {
  const url = stringValue(provider.baseurl || provider.baseUrl || provider.api_base_url)?.toLowerCase() || "";
  const transformerNames = JSON.stringify(provider.transformer ?? "").toLowerCase();
  if (url.includes("generativelanguage.googleapis.com") || transformerNames.includes("gemini")) {
    return "gemini_generate_content";
  }
  if (url.includes("anthropic") || transformerNames.includes("anthropic")) {
    return "anthropic_messages";
  }
  return "openai_chat_completions";
}

function providerCredentials(provider) {
  return Array.isArray(provider?.credentials)
    ? provider.credentials.filter((credential) => isRecord(credential) && credential.enabled !== false)
    : [];
}

function providerCredentialApiKey(credential) {
  return stringValue(credential.api_key) || stringValue(credential.apiKey) || stringValue(credential.apikey);
}

function providerCredentialRuntimeId(credential, index) {
  const explicitId = stringValue(credential.id);
  if (explicitId) {
    return explicitId;
  }
  const oneBasedIndex = index >= 0 ? index + 1 : 1;
  const label = stringValue(credential.name) || stringValue(credential.label);
  return label ? `${providerCredentialSlug(label)}-${oneBasedIndex}` : `key-${oneBasedIndex}`;
}

function providerCredentialSlug(value) {
  return stringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "key";
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function hasWebSearchTool(tools) {
  return Array.isArray(tools) && tools.some((tool) => isRecord(tool) && stringValue(tool.type)?.startsWith("web_search"));
}

function hasImageContent(messages) {
  return Array.isArray(messages) && messages.some((message) => JSON.stringify(message).includes("\"image\""));
}

function sanitizeRouteId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "route";
}

function fetchGateway(runtime, path, body, routingDecision, sessionContext) {
  const url = new URL(path, runtime.gatewayUrl.replace(/\/+$/, ""));
  const headers = {
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
    "x-ccr-client": "Claude Design",
    "x-claude-design-proxy": "1"
  };
  if (runtime.gatewayApiKey) {
    headers.authorization = `Bearer ${runtime.gatewayApiKey}`;
    headers["x-api-key"] = runtime.gatewayApiKey;
  }
  if (routingDecision?.requestedModel) {
    headers["x-claude-design-requested-model"] = routingDecision.requestedModel;
  }
  if (routingDecision?.routedModel) {
    headers["x-claude-design-routed-model"] = routingDecision.routedModel;
  }
  if (routingDecision?.reason) {
    headers["x-claude-design-route-reason"] = routingDecision.reason;
  }
  if (sessionContext?.sessionId) {
    headers["x-agent-session-id"] = sessionContext.sessionId;
  }
  if (sessionContext?.projectId) {
    headers["x-claude-design-project-id"] = sessionContext.projectId;
  }
  if (sessionContext?.chatId) {
    headers["x-claude-design-chat-id"] = sessionContext.chatId;
  }
  return fetch(url, {
    body: `${JSON.stringify(body)}\n`,
    headers,
    method: "POST"
  });
}

function claudeDesignSessionContext(value) {
  const projectId = stringValue(value?.projectId);
  const chatId = stringValue(value?.chatId);
  const sessionId = projectId && chatId
    ? `${projectId}:${chatId}`
    : chatId || projectId;
  return {
    chatId,
    projectId,
    sessionId
  };
}

function readClaudeDesignProjectId(value) {
  if (!isRecord(value)) {
    return undefined;
  }
  const metadata = isRecord(value.metadata) ? value.metadata : undefined;
  return (
    stringValue(value.project_id) ||
    stringValue(value.projectId) ||
    stringValue(metadata?.project_id) ||
    stringValue(metadata?.projectId)
  );
}

function readClaudeDesignChatId(value) {
  if (!isRecord(value)) {
    return undefined;
  }
  const metadata = isRecord(value.metadata) ? value.metadata : undefined;
  return (
    stringValue(value.chat_id) ||
    stringValue(value.chatId) ||
    stringValue(metadata?.chat_id) ||
    stringValue(metadata?.chatId) ||
    stringValue(value.conversation_id) ||
    stringValue(value.conversationId) ||
    stringValue(metadata?.conversation_id) ||
    stringValue(metadata?.conversationId)
  );
}

function extractGatewayAssistantText(payload) {
  if (typeof payload === "string") {
    return payload;
  }
  if (!isRecord(payload)) {
    return "";
  }
  if (typeof payload.completion === "string") {
    return payload.completion;
  }
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }
  if (Array.isArray(payload.content)) {
    return textFromMessageContent(payload.content);
  }
  if (Array.isArray(payload.output)) {
    return textFromMessageContent(payload.output);
  }
  if (Array.isArray(payload.choices)) {
    return payload.choices
      .map((choice) => {
        if (!isRecord(choice)) {
          return "";
        }
        const message = isRecord(choice.message) ? choice.message : {};
        const delta = isRecord(choice.delta) ? choice.delta : {};
        return textFromMessageContent(message.content) || textFromMessageContent(delta.content) || stringValue(choice.text) || "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function extractGatewayToolCalls(payload) {
  const toolCalls = [];
  const addToolCall = (value, fallbackIndex) => {
    const toolCall = normalizeGatewayToolCall(value, fallbackIndex);
    if (toolCall) {
      toolCalls.push(toolCall);
    }
  };

  if (!isRecord(payload)) {
    return toolCalls;
  }
  if (Array.isArray(payload.content)) {
    payload.content.forEach(addToolCall);
  }
  if (Array.isArray(payload.output)) {
    payload.output.forEach(addToolCall);
  }
  if (Array.isArray(payload.tool_calls)) {
    payload.tool_calls.forEach(addToolCall);
  }
  if (Array.isArray(payload.choices)) {
    for (const choice of payload.choices) {
      if (!isRecord(choice)) {
        continue;
      }
      const message = isRecord(choice.message) ? choice.message : {};
      const delta = isRecord(choice.delta) ? choice.delta : {};
      if (Array.isArray(message.tool_calls)) {
        message.tool_calls.forEach(addToolCall);
      }
      if (Array.isArray(delta.tool_calls)) {
        delta.tool_calls.forEach(addToolCall);
      }
      if (Array.isArray(message.content)) {
        message.content.forEach(addToolCall);
      }
    }
  }
  return toolCalls;
}

function normalizeGatewayToolCall(value, fallbackIndex) {
  if (!isRecord(value)) {
    return undefined;
  }
  const fn = isRecord(value.function) ? value.function : {};
  const name = stringValue(value.name) || stringValue(fn.name) || stringValue(value.tool);
  if (!name) {
    return undefined;
  }
  const inputSource = value.input ?? value.arguments ?? fn.arguments ?? {};
  const input = normalizeToolInput(inputSource);
  return {
    id: stringValue(value.id) || `toolu_${String(fallbackIndex || 0)}_${randomUuid().replace(/-/g, "").slice(0, 18)}`,
    input: normalizeGatewayToolInput(name, input),
    name
  };
}

function normalizeGatewayToolInput(name, input) {
  if (name === "questions_v2") {
    return normalizeQuestionsV2Input(input);
  }
  if (name === "questions") {
    return normalizeLegacyQuestionsInput(input);
  }
  return input;
}

function absorbQuestionToolCalls(assistantText, toolCalls) {
  const kept = [];
  const questions = [];
  for (const toolCall of Array.isArray(toolCalls) ? toolCalls : []) {
    if (isQuestionToolName(toolCall?.name)) {
      questions.push(toolCall);
    } else {
      kept.push(toolCall);
    }
  }
  if (questions.length === 0) {
    return {
      assistantText,
      toolCalls: kept
    };
  }

  const questionText = questionToolCallsToText(questions);
  return {
    assistantText: [assistantText, questionText].filter(Boolean).join("\n\n"),
    toolCalls: kept
  };
}

function questionToolCallsToText(toolCalls) {
  const summaries = [];
  for (const toolCall of Array.isArray(toolCalls) ? toolCalls : []) {
    const input = isRecord(toolCall?.input) ? toolCall.input : {};
    const title = stringValue(input.title);
    const questions = Array.isArray(input.questions) ? input.questions : [];
    const questionTitles = questions
      .map((question, index) => {
        if (!isRecord(question)) {
          return "";
        }
        return stringValue(question.title) || stringValue(question.question) || `Question ${index + 1}`;
      })
      .filter(Boolean);
    if (title || questionTitles.length > 0) {
      summaries.push([title, ...questionTitles].filter(Boolean).join(": "));
    }
  }
  const suffix = summaries.length > 0 ? ` (${summaries.join("; ")})` : "";
  return `Claude Design questions were skipped; continuing with default answers.${suffix}`;
}

function isQuestionToolName(name) {
  return QUESTION_TOOL_NAMES.has(String(name || ""));
}

function normalizeToolInput(value) {
  if (typeof value === "string") {
    const parsed = parseMaybeJson(value, undefined);
    if (isRecord(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed)) {
      return { value: parsed };
    }
    return value.trim() ? { arguments: value } : {};
  }
  if (isRecord(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return { value };
  }
  return value === undefined || value === null ? {} : { value };
}

function normalizeQuestionsV2Input(value) {
  const record = isRecord(value) ? value : {};
  const rawQuestions = Array.isArray(record.questions) ? record.questions : [];
  const questions = rawQuestions.map(normalizeQuestionsV2Question).filter(Boolean);
  const title = stringValue(record.title) || "Claude has some questions";
  return {
    ...record,
    questions: questions.length > 0 ? questions : [defaultQuestionsV2Question()],
    title
  };
}

function normalizeLegacyQuestionsInput(value) {
  const record = isRecord(value) ? value : {};
  const rawQuestions = Array.isArray(record.questions) ? record.questions : [];
  return {
    ...record,
    questions: rawQuestions.map((question, index) => {
      if (isRecord(question)) {
        return {
          ...question,
          options: plainStringArray(question.options),
          question: stringValue(question.question) || stringValue(question.title) || `Question ${index + 1}`
        };
      }
      return {
        options: [],
        question: stringValue(question) || `Question ${index + 1}`
      };
    })
  };
}

function normalizeQuestionsV2Question(question, index) {
  const record = isRecord(question) ? question : {};
  const options = plainStringArray(record.options);
  const title = stringValue(record.title) || stringValue(record.question) || stringValue(record.label) || `Question ${index + 1}`;
  let kind = stringValue(record.kind);
  if (!["text-options", "svg-options", "slider", "file", "freeform"].includes(kind)) {
    if (record.isSvg === true) {
      kind = "svg-options";
    } else if (options.length > 0) {
      kind = "text-options";
    } else if (record.min !== undefined || record.max !== undefined || record.step !== undefined) {
      kind = "slider";
    } else if (stringValue(record.accept)) {
      kind = "file";
    } else {
      kind = "freeform";
    }
  }
  if ((kind === "text-options" || kind === "svg-options") && options.length === 0) {
    kind = "freeform";
  }
  const normalized = {
    id: normalizeQuestionId(stringValue(record.id) || stringValue(record.name) || title, index),
    kind,
    title
  };
  const subtitle = stringValue(record.subtitle);
  if (subtitle) {
    normalized.subtitle = subtitle;
  }
  if (options.length > 0) {
    normalized.options = options;
  }
  if (record.multi === true) {
    normalized.multi = true;
  }
  if (kind === "slider") {
    const min = numberValue(record.min);
    const max = numberValue(record.max);
    const step = numberValue(record.step);
    const defaultValue = numberValue(record.default);
    if (min !== undefined) {
      normalized.min = min;
    }
    if (max !== undefined) {
      normalized.max = max;
    }
    if (step !== undefined) {
      normalized.step = step;
    }
    if (defaultValue !== undefined) {
      normalized.default = defaultValue;
    }
  }
  if (kind === "file") {
    const accept = stringValue(record.accept);
    if (accept) {
      normalized.accept = accept;
    }
  }
  return normalized;
}

function plainStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function defaultQuestionsV2Question() {
  return {
    id: "details",
    kind: "freeform",
    title: "What should Claude know before continuing?"
  };
}

function normalizeQuestionId(value, index) {
  const normalized = stringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return normalized || `question_${index + 1}`;
}

function extractGatewayStopReason(payload, fallback) {
  if (!isRecord(payload)) {
    return fallback;
  }
  const direct = stringValue(payload.stop_reason) || stringValue(payload.stopReason);
  if (direct) {
    return direct;
  }
  if (Array.isArray(payload.choices)) {
    for (const choice of payload.choices) {
      const mapped = mapGatewayFinishReason(isRecord(choice) ? stringValue(choice.finish_reason) || stringValue(choice.finishReason) : undefined);
      if (mapped) {
        return mapped;
      }
    }
  }
  return fallback;
}

function mapGatewayFinishReason(reason) {
  switch (reason) {
    case "tool_calls":
    case "function_call":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "stop":
      return "end_turn";
    default:
      return reason;
  }
}

function textFromMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) => {
      if (typeof block === "string") {
        return block;
      }
      if (!isRecord(block)) {
        return "";
      }
      if (block.type === "tool_use" || block.type === "function_call" || isToolResultContentBlock(block)) {
        return "";
      }
      return stringValue(block.text) || stringValue(block.content) || stringValue(block.output_text) || "";
    })
    .filter(Boolean)
    .join("\n");
}

function gatewayMessageContent(assistantText, toolCalls) {
  const content = [];
  if (assistantText) {
    content.push({ text: assistantText, type: "text" });
  }
  for (const toolCall of toolCalls) {
    content.push({
      id: toolCall.id,
      input: toolCall.input || {},
      name: toolCall.name,
      type: "tool_use"
    });
  }
  return content;
}

function gatewayContentBlocks(assistantText, toolCalls) {
  const blocks = [];
  if (assistantText) {
    blocks.push({ text: assistantText, type: "text" });
  }
  for (const toolCall of toolCalls) {
    blocks.push({
      toolCall: {
        id: toolCall.id,
        input: toolCall.input || {},
        name: toolCall.name,
        serverSide: false,
        type: gatewayToolKind(toolCall.name)
      },
      type: "tool_call"
    });
  }
  return blocks;
}

function sanitizeStoredMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }
  return dedupeStoredMessages(messages
    .map(sanitizeStoredMessage)
    .filter(isVisibleStoredMessage));
}

function dedupeStoredMessages(messages) {
  const result = [];
  let previousKey;
  for (const message of messages) {
    const key = storedMessageDedupeKey(message);
    if (key && key === previousKey) {
      continue;
    }
    result.push(message);
    previousKey = key;
  }
  return result;
}

function storedMessageDedupeKey(message) {
  if (!isRecord(message)) {
    return `raw:${JSON.stringify(message)}`;
  }
  const role = stringValue(message.role) || "";
  const chatId = stringValue(message.chat_id) || stringValue(message.chatId) || "";
  const text = role === "user" ? cleanVisibleUserText(storedMessageDisplayText(message)) : storedMessageDisplayText(message);
  const blocks = Array.isArray(message.contentBlocks)
    ? message.contentBlocks
    : Array.isArray(message.content_blocks)
      ? message.content_blocks
      : [];
  return JSON.stringify({
    blocks: role === "user" ? [] : blocks,
    chatId,
    role,
    text
  });
}

function sanitizeStoredMessage(message) {
  if (!isRecord(message)) {
    return message;
  }
  const sourceBlocks = Array.isArray(message.contentBlocks)
    ? message.contentBlocks
    : Array.isArray(message.content_blocks)
      ? message.content_blocks
      : [];
  if (sourceBlocks.length === 0) {
    return sanitizeStoredMessageDisplayContent(message);
  }

  const keptBlocks = [];
  const questionBlocks = [];
  for (const block of sourceBlocks) {
    if (isQuestionContentBlock(block)) {
      questionBlocks.push(block);
    } else {
      keptBlocks.push(block);
    }
  }
  if (questionBlocks.length === 0) {
    return sanitizeStoredMessageDisplayContent(message);
  }

  const existingContent = stringValue(message.content);
  const content = existingContent || questionToolBlocksToText(questionBlocks);
  const blocks = keptBlocks.length > 0
    ? keptBlocks
    : content
      ? [{ text: content, type: "text" }]
      : [];
  return sanitizeStoredMessageDisplayContent({
    ...message,
    content,
    contentBlocks: blocks,
    content_blocks: blocks
  });
}

function isQuestionContentBlock(block) {
  if (!isRecord(block)) {
    return false;
  }
  if (isQuestionToolName(block.name)) {
    return true;
  }
  const toolCall = isRecord(block.toolCall) ? block.toolCall : isRecord(block.tool_call) ? block.tool_call : undefined;
  if (toolCall && isQuestionToolName(toolCall.name)) {
    return true;
  }
  return false;
}

function questionToolBlocksToText(blocks) {
  const toolCalls = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!isRecord(block)) {
      continue;
    }
    const toolCall = isRecord(block.toolCall) ? block.toolCall : isRecord(block.tool_call) ? block.tool_call : block;
    toolCalls.push({
      input: isRecord(toolCall.input) ? toolCall.input : {},
      name: stringValue(toolCall.name) || "questions_v2"
    });
  }
  return questionToolCallsToText(toolCalls);
}

function isToolResultOnlyMessage(message) {
  if (!isRecord(message)) {
    return false;
  }
  const role = stringValue(message.role);
  if (role && role !== "user" && role !== "tool") {
    return false;
  }
  const content = message.content;
  if (Array.isArray(content) && content.length > 0) {
    return content.every(isToolResultContentBlock);
  }
  const blocks = Array.isArray(message.contentBlocks)
    ? message.contentBlocks
    : Array.isArray(message.content_blocks)
      ? message.content_blocks
      : [];
  if (blocks.length > 0) {
    return blocks.every(isToolResultContentBlock);
  }
  return role === "tool";
}

function isToolResultContentBlock(block) {
  if (!isRecord(block)) {
    return false;
  }
  const type = stringValue(block.type);
  return (
    type === "tool_result" ||
    type === "tool_result_error" ||
    type === "function_result" ||
    isRecord(block.toolResult) ||
    isRecord(block.tool_result)
  );
}

function sanitizeStoredMessageDisplayContent(message) {
  if (!isRecord(message)) {
    return message;
  }
  const role = stringValue(message.role);
  if (role === "user") {
    const content = cleanVisibleUserText(storedProjectMessageText(message));
    const sanitized = {
      ...message,
      content
    };
    if (Array.isArray(message.contentBlocks) || Array.isArray(message.content_blocks)) {
      const blocks = content ? [{ text: content, type: "text" }] : [];
      sanitized.contentBlocks = blocks;
      sanitized.content_blocks = blocks;
    }
    return sanitized;
  }
  if (role === "assistant") {
    const sourceBlocks = Array.isArray(message.contentBlocks)
      ? message.contentBlocks
      : Array.isArray(message.content_blocks)
        ? message.content_blocks
        : [];
    if (sourceBlocks.length === 0) {
      return message;
    }
    const blocks = sourceBlocks.filter((block) => !isToolResultContentBlock(block));
    if (blocks.length === sourceBlocks.length) {
      return message;
    }
    const content = stringValue(message.content) || textFromMessageContent(blocks);
    return {
      ...message,
      content,
      contentBlocks: blocks,
      content_blocks: blocks
    };
  }
  return message;
}

function isVisibleStoredMessage(message) {
  if (!isRecord(message)) {
    return true;
  }
  if (isToolResultOnlyMessage(message)) {
    return false;
  }
  const role = stringValue(message.role);
  const text = storedMessageDisplayText(message);
  if (isInternalChatStatusText(text)) {
    return false;
  }
  if (role === "user") {
    return Boolean(cleanVisibleUserText(text));
  }
  if (role === "tool") {
    return false;
  }
  if (role === "assistant" && !text) {
    const blocks = Array.isArray(message.contentBlocks)
      ? message.contentBlocks
      : Array.isArray(message.content_blocks)
        ? message.content_blocks
        : [];
    return blocks.some((block) => isToolCallContentBlock(block) || !isToolResultContentBlock(block));
  }
  return true;
}

function storedMessageDisplayText(message) {
  if (!isRecord(message)) {
    return "";
  }
  return storedProjectMessageText(message);
}

function cleanVisibleUserText(text) {
  let value = (stringValue(text) || "")
    .replace(/<system-info\b[^>]*>[\s\S]*?<\/system-info>/gi, "\n")
    .replace(/<default\s+aesthetic_system_instructions\b[^>]*>[\s\S]*?<\/default\s+aesthetic_system_instructions>/gi, "\n")
    .replace(/<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder>/gi, "\n")
    .replace(/\s*\[id:m[0-9a-z_-]+\]\s*$/i, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (isInternalChatStatusText(value)) {
    value = "";
  }
  return value;
}

function isInternalChatStatusText(text) {
  const normalized = (stringValue(text) || "").replace(/\s+/g, " ").trim();
  return (
    /^Questions timed out;\s*go with defaults\.?$/i.test(normalized) ||
    /^Claude Design questions were skipped;\s*continuing with default answers\./i.test(normalized) ||
    /^Wrote \d+ characters to .+$/i.test(normalized) ||
    /^Opened .+ for the user\./i.test(normalized) ||
    /^Error:\s*(screenshot capture failed:)?\s*Error at step \d+:/i.test(normalized) ||
    /^Error:\s*\[internal\]/i.test(normalized) ||
    /^--- Script output ---/i.test(normalized) ||
    /^(Edited|Created|Deleted|Renamed|Moved|Copied) .+/i.test(normalized) ||
    /No preview pane available/i.test(normalized) ||
    /^\[File:\s+.+\]/i.test(normalized) ||
    /^\(no webview logs\)$/i.test(normalized) ||
    /^Make sure your design supports Tweaks\./i.test(normalized) ||
    /^Verifier subagent forked\b/i.test(normalized) ||
    /^=== FORK BOUNDARY ===/i.test(normalized)
  );
}

function isToolCallContentBlock(block) {
  if (!isRecord(block)) {
    return false;
  }
  const type = stringValue(block.type);
  return type === "tool_call" || type === "tool_use" || type === "function_call" || isRecord(block.toolCall) || isRecord(block.tool_call);
}

function gatewayToolKind(name) {
  if (name === "Read") {
    return "read";
  }
  if (String(name || "").startsWith("mcp__")) {
    return "mcp";
  }
  return "edit";
}

function appendChatExchange(runtime, request, gatewayBody, assistantText, assistantMessageId, contentBlocks) {
  const row = getProjectRow(runtime, request.projectId);
  if (!row) {
    return;
  }
  const parsedMessages = parseMaybeJson(row.messages_json, []);
  const messages = Array.isArray(parsedMessages) ? parsedMessages : [];
  const assistantContentBlocks = Array.isArray(contentBlocks) ? contentBlocks : gatewayContentBlocks(assistantText, []);
  const now = new Date().toISOString();
  const lastUserText = cleanVisibleUserText(textFromMessageContent(lastGatewayUserMessage(gatewayBody)?.content));
  if (lastUserText) {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user" || lastMessage.chat_id !== request.chatId || lastMessage.content !== lastUserText) {
      messages.push({
        chat_id: request.chatId,
        content: lastUserText,
        created_at: now,
        id: randomUuid(),
        role: "user"
      });
    }
  }
  const assistantMessage = {
    chat_id: request.chatId,
    content: assistantText,
    contentBlocks: assistantContentBlocks,
    content_blocks: assistantContentBlocks,
    created_at: now,
    id: assistantMessageId,
    role: "assistant"
  };
  const existingAssistantIndex = messages.findIndex((message) => message?.id === assistantMessageId);
  if (existingAssistantIndex >= 0) {
    messages[existingAssistantIndex] = assistantMessage;
  } else {
    messages.push(assistantMessage);
  }
  runtime.store.database.run("UPDATE claude_design_items SET updated_at = ?, messages_json = ? WHERE collection = ? AND uuid = ?", [
    now,
    JSON.stringify(messages),
    PROJECT_COLLECTION,
    row.uuid
  ]);
  appendChatExchangeToProjectData(runtime, row, request, lastUserText, assistantText, assistantMessageId, assistantContentBlocks, now);
  runtime.store.persist();
}

function lastGatewayUserMessage(gatewayBody) {
  if (!isRecord(gatewayBody) || !Array.isArray(gatewayBody.messages)) {
    return undefined;
  }
  let sawNonHumanTail = false;
  for (let index = gatewayBody.messages.length - 1; index >= 0; index--) {
    const message = gatewayBody.messages[index];
    if (!isRecord(message)) {
      continue;
    }
    const role = stringValue(message.role);
    if (role === "user") {
      if (isToolResultOnlyMessage(message)) {
        sawNonHumanTail = true;
        continue;
      }
      if (sawNonHumanTail) {
        return undefined;
      }
      return message;
    }
    if (role === "assistant" || role === "tool") {
      sawNonHumanTail = true;
    }
  }
  return undefined;
}

function appendChatExchangeToProjectData(runtime, row, request, userText, assistantText, assistantMessageId, contentBlocks, now) {
  saveProjectData(runtime, row.uuid, (record, currentRow) => {
    const base64 = stringValue(record.project_data_base64);
    const decoded = base64 ? parseMaybeJson(Buffer.from(base64, "base64").toString("utf8"), {}) : record;
    const normalized = normalizeProjectStoreData(runtime, currentRow || row, decoded);
    const chatId = request.chatId || stringValue(normalized.viewState?.activeChatId) || defaultProjectChatId(row.uuid);
    const chats = { ...(isRecord(normalized.chats) ? normalized.chats : {}) };
    const chat = normalizeProjectChat(chats[chatId] || {}, chatId, normalized.created, now);
    const chatMessages = Array.isArray(chat.messages) ? [...chat.messages] : [];

    if (userText) {
      const lastMessage = chatMessages[chatMessages.length - 1];
      if (!lastMessage || lastMessage.role !== "user" || lastMessage.content !== userText) {
        chatMessages.push({
          content: userText,
          id: randomUuid(),
          role: "user",
          timestamp: now
        });
      }
    }

    const assistantMessage = {
      content: assistantText,
      contentBlocks,
      id: assistantMessageId,
      role: "assistant",
      timestamp: now
    };
    const existingAssistantIndex = chatMessages.findIndex((message) => message?.id === assistantMessageId);
    if (existingAssistantIndex >= 0) {
      chatMessages[existingAssistantIndex] = assistantMessage;
    } else {
      chatMessages.push(assistantMessage);
    }

    chats[chatId] = {
      ...chat,
      lastOpened: now,
      messages: chatMessages
    };

    const nextProjectData = {
      ...normalized,
      chats,
      lastOpened: now,
      viewState: {
        ...normalized.viewState,
        activeChatId: chatId
      }
    };
    return {
      ...record,
      project_data_base64: Buffer.from(JSON.stringify(nextProjectData), "utf8").toString("base64")
    };
  });
}

function estimateTokenCount(body) {
  return Math.max(1, Math.ceil(JSON.stringify(body || {}).length / 4));
}

function encodeChatResponseTextDelta(text) {
  return protoMessage(2, protoString(1, text));
}

function encodeChatResponseMessageStart(messageId) {
  return protoMessage(3, protoString(1, messageId));
}

function encodeChatResponseMessageStop(stopReason) {
  return protoMessage(4, protoString(1, stopReason || "end_turn"));
}

function encodeChatResponseError(message) {
  return protoMessage(5, protoString(1, message || "Unknown gateway error."));
}

function encodeChatResponseRaw(eventType, payload) {
  return protoMessage(6, Buffer.concat([protoString(1, eventType), protoBytes(2, Buffer.from(JSON.stringify(payload), "utf8"), true)]));
}

function connectStreamResponse(messages) {
  const body = Buffer.concat([...messages.map((message) => connectEnvelope(0, message)), connectEnvelope(0x02, Buffer.from("{}", "utf8"))]);
  return binaryResponse(200, body, {
    "cache-control": "no-store",
    "connect-content-encoding": "identity",
    "connect-protocol-version": "1",
    "content-type": "application/connect+proto"
  });
}

function connectEnvelope(flags, data) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
  const header = Buffer.alloc(5);
  header[0] = flags;
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

function decodeConnectEnvelope(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5) {
    return buffer;
  }

  const frames = [];
  let offset = 0;
  while (offset + 5 <= buffer.length) {
    const flags = buffer[offset];
    const length = buffer.readUInt32BE(offset + 1);
    const start = offset + 5;
    const end = start + length;
    if (end > buffer.length) {
      return frames[0] || buffer;
    }
    if ((flags & 0x02) === 0 && length > 0) {
      frames.push(buffer.subarray(start, end));
    }
    offset = end;
  }
  if (frames.length === 0) {
    return Buffer.alloc(0);
  }
  if (frames.length === 1) {
    return frames[0];
  }
  return Buffer.concat(frames);
}

function omeletteProjectFromRow(row, me) {
  const data = parseMaybeJson(row.data_json, {});
  const uuid = stringValue(data.project_id) || stringValue(data.uuid) || row.uuid;
  const name = stringValue(data.name) || stringValue(data.title) || row.title || "Untitled design";
  return {
    canEdit: data.can_edit !== false,
    createdAt: row.created_at,
    description: stringValue(data.description) || "",
    designSystems: Array.isArray(data.design_systems) ? data.design_systems : [],
    introText: stringValue(data.intro_text) || "",
    isFavorite: data.is_favorite === true,
    isOwned: data.is_owned !== false,
    name,
    ownerDisplayName: stringValue(data.owner_display_name) || me.displayName,
    ownerEmail: stringValue(data.owner_email) || me.email,
    ownerUuid: stringValue(data.owner_uuid) || me.accountUuid,
    publishedAt: stringValue(data.published_at) || "",
    projectId: uuid,
    sharing: isRecord(data.sharing) ? data.sharing : {},
    templateTitle: stringValue(data.template_title) || "",
    type: normalizeProjectTypeNumber(data.project_type ?? data.type),
    updatedAt: row.updated_at,
    uuid,
    viewedAt: stringValue(data.viewed_at) || row.updated_at
  };
}

function decodeCreateProjectRequest(buffer) {
  return {
    description: decodeProtoStringField(buffer, 5),
    introText: decodeProtoStringField(buffer, 6),
    name: decodeProtoStringField(buffer, 1),
    templateId: decodeProtoStringField(buffer, 9),
    templateTitle: decodeProtoStringField(buffer, 4),
    type: decodeProtoEnumField(buffer, 3)
  };
}

function encodeCreateProjectName(name) {
  return protoString(1, name);
}

function encodeCreateProjectResponse(projectId) {
  return protoString(1, projectId);
}

function encodeListProjectsResponse(runtime) {
  const typeFilter = arguments.length > 1 ? arguments[1] : undefined;
  const publishedOnly = arguments.length > 2 ? arguments[2] : undefined;
  const items = listOmeletteProjects(runtime, typeFilter, publishedOnly).map((project) => protoMessage(1, encodeProjectListItem(project)));
  return Buffer.concat(items);
}

function encodeProjectListItem(project) {
  return Buffer.concat([
    protoString(1, project.projectId),
    protoString(2, project.name),
    protoTimestamp(3, project.viewedAt),
    protoString(4, project.ownerUuid),
    protoString(5, project.ownerEmail),
    protoBool(6, project.isOwned),
    protoMessage(7, encodeSharing(project.sharing)),
    protoEnum(8, project.type),
    protoTimestamp(9, project.publishedAt),
    protoString(10, project.templateTitle),
    protoString(11, project.description),
    protoString(12, project.introText),
    protoTimestamp(14, project.updatedAt),
    protoString(15, project.ownerDisplayName),
    protoBool(17, project.isFavorite),
    protoBool(18, project.canEdit),
    ...((Array.isArray(project.designSystems) ? project.designSystems : []).map((binding) => protoMessage(19, encodeDesignSystemBinding(binding))))
  ]);
}

function encodeGetProjectResponse(project, me, projectDataBytes) {
  return Buffer.concat([
    protoString(1, project.projectId),
    protoString(2, project.name),
    protoString(3, project.ownerUuid || me.accountUuid),
    protoString(4, project.ownerEmail || me.email),
    protoTimestamp(5, project.createdAt),
    protoTimestamp(6, project.updatedAt),
    protoMessage(7, encodeSharing(project.sharing)),
    protoBytes(9, projectDataBytes || Buffer.alloc(0), true),
    protoEnum(10, project.type),
    protoTimestamp(11, project.publishedAt),
    protoString(12, project.templateTitle),
    protoString(13, project.description),
    protoString(14, project.introText),
    protoString(18, project.ownerDisplayName || me.displayName),
    ...((Array.isArray(project.designSystems) ? project.designSystems : []).map((binding) => protoMessage(19, encodeDesignSystemBinding(binding))))
  ]);
}

function encodeGetProjectDataResponse(data) {
  return protoBytes(1, data || Buffer.alloc(0), true);
}

function encodeSharing(sharing) {
  const record = isRecord(sharing) ? sharing : {};
  return Buffer.concat([
    protoString(1, stringValue(record.view_mode) || stringValue(record.viewMode) || "private"),
    protoBool(2, record.team_can_edit === true || record.teamCanEdit === true),
    protoBool(3, record.team_can_comment === true || record.teamCanComment === true)
  ]);
}

function normalizeProjectTypeNumber(value) {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "template") {
      return 2;
    }
    if (normalized === "design_system" || normalized === "design-system") {
      return 3;
    }
    if (normalized === "project") {
      return PROJECT_TYPE_PROJECT;
    }
  }

  const number = Number(value);
  return [1, 2, 3].includes(number) ? number : PROJECT_TYPE_PROJECT;
}

function protoString(fieldNumber, value) {
  const text = stringValue(value);
  if (!text) {
    return Buffer.alloc(0);
  }
  return protoBytes(fieldNumber, Buffer.from(text, "utf8"), true);
}

function protoBytes(fieldNumber, value, includeEmpty) {
  const payload = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  if (!includeEmpty && payload.length === 0) {
    return Buffer.alloc(0);
  }
  return Buffer.concat([protoTag(fieldNumber, 2), protoVarint(payload.length), payload]);
}

function protoBool(fieldNumber, value) {
  return value === true ? Buffer.concat([protoTag(fieldNumber, 0), protoVarint(1)]) : Buffer.alloc(0);
}

function protoEnum(fieldNumber, value) {
  const number = Number(value);
  return Number.isFinite(number) && number !== 0
    ? Buffer.concat([protoTag(fieldNumber, 0), protoVarint(number)])
    : Buffer.alloc(0);
}

function protoInt32(fieldNumber, value) {
  const number = Number(value);
  return Number.isFinite(number) && number !== 0
    ? Buffer.concat([protoTag(fieldNumber, 0), protoVarint(number)])
    : Buffer.alloc(0);
}

function protoInt64(fieldNumber, value) {
  const number = Number(value);
  return Number.isFinite(number) && number !== 0
    ? Buffer.concat([protoTag(fieldNumber, 0), protoVarint(number)])
    : Buffer.alloc(0);
}

function protoMessage(fieldNumber, body) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body || []);
  return Buffer.concat([protoTag(fieldNumber, 2), protoVarint(payload.length), payload]);
}

function protoTimestamp(fieldNumber, value) {
  if (!value) {
    return Buffer.alloc(0);
  }
  const date = new Date(value || Date.now());
  const milliseconds = Number.isFinite(date.getTime()) ? date.getTime() : Date.now();
  const seconds = Math.floor(milliseconds / 1000);
  return protoMessage(fieldNumber, Buffer.concat([protoTag(1, 0), protoVarint(seconds)]));
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

function decodeAllProtoStrings(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return [];
  }
  const values = [];
  forEachProtoField(buffer, (field) => {
    if (field.wireType !== 2 || !Buffer.isBuffer(field.value) || field.value.length === 0) {
      return;
    }
    const value = field.value.toString("utf8");
    if (isPlausibleProtoString(value)) {
      values.push({
        fieldNumber: field.fieldNumber,
        value
      });
    }
  });
  return values;
}

function isPlausibleProtoString(value) {
  if (!value) {
    return false;
  }
  let printable = 0;
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) {
      printable += 1;
    }
  }
  return printable / value.length > 0.85;
}

function firstUuidLikeString(buffer) {
  return decodeAllProtoStrings(buffer)
    .map((item) => item.value)
    .find((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}

function decodeProtoBytesField(buffer, fieldNumber) {
  const field = readProtoField(buffer, fieldNumber);
  return field?.wireType === 2 ? field.value : undefined;
}

function decodeProtoMessageFields(buffer, fieldNumber) {
  return readProtoFields(buffer, fieldNumber)
    .filter((field) => field.wireType === 2)
    .map((field) => field.value);
}

function decodeProtoEnumField(buffer, fieldNumber) {
  const field = readProtoField(buffer, fieldNumber);
  return field?.wireType === 0 ? Number(field.value) : undefined;
}

function decodeProtoIntField(buffer, fieldNumber) {
  const field = readProtoField(buffer, fieldNumber);
  return field?.wireType === 0 ? Number(field.value) : 0;
}

function decodeProtoBoolField(buffer, fieldNumber) {
  const field = readProtoField(buffer, fieldNumber);
  return field?.wireType === 0 ? Number(field.value) !== 0 : false;
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

function completionPayload(itemUuid) {
  return {
    completion: {
      id: randomUuid(),
      item_uuid: itemUuid,
      role: "assistant",
      text: "Claude Design mock response.",
      type: "message"
    },
    done: true,
    id: randomUuid(),
    stop_reason: "end_turn"
  };
}

function sseCompletionResponse(itemUuid) {
  const payload = completionPayload(itemUuid);
  return textResponse(
    200,
    [
      `event: message`,
      `data: ${JSON.stringify({ type: "message", message: payload.completion })}`,
      "",
      "event: done",
      "data: {}",
      "",
      ""
    ].join("\n"),
    {
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "content-type": "text/event-stream; charset=utf-8"
    }
  );
}

function readStoredResponse(store, method, path) {
  const row = queryRows(
    store.database,
    "SELECT status, headers_json, body FROM claude_design_responses WHERE method = ? AND path = ? LIMIT 1",
    [method, path]
  )[0];
  if (!row) {
    return undefined;
  }

  const headers = parseMaybeJson(row.headers_json, {});
  const contentType = stringValue(headers["content-type"]) || stringValue(headers["Content-Type"]) || "application/json; charset=utf-8";
  const bodyText = String(row.body || "");
  if (contentType.includes("application/json")) {
    return jsonResponse(Number(row.status) || 200, parseMaybeJson(bodyText, {}), headers);
  }
  return textResponse(Number(row.status) || 200, bodyText, headers);
}

function upsertStoredResponse(store, method, path, status, headers, body) {
  const bodyText = typeof body === "string" ? body : JSON.stringify(body);
  store.database.run(
    "INSERT OR REPLACE INTO claude_design_responses (method, path, status, headers_json, body, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [method, path, status, JSON.stringify(headers), bodyText, new Date().toISOString()]
  );
  store.persist();
}

function listStoredResponses(store) {
  return queryRows(
    store.database,
    "SELECT method, path, status, headers_json, body, updated_at FROM claude_design_responses ORDER BY updated_at DESC",
    []
  ).map((row) => ({
    body: parseMaybeJson(row.body, row.body),
    headers: parseMaybeJson(row.headers_json, {}),
    method: row.method,
    path: row.path,
    status: row.status,
    updatedAt: row.updated_at
  }));
}

function readCachedAsset(store, path) {
  const row = queryRows(
    store.database,
    "SELECT path, upstream_url, content_type, body_base64, fetched_at FROM claude_design_assets WHERE path = ? LIMIT 1",
    [path]
  )[0];
  if (!row) {
    return undefined;
  }
  return {
    bodyBase64: row.body_base64,
    contentType: row.content_type,
    fetchedAt: row.fetched_at,
    path: row.path,
    upstreamUrl: row.upstream_url
  };
}

function isFallbackAsset(asset) {
  return stringValue(asset?.upstreamUrl)?.startsWith("fallback:") === true;
}

function isReusableFallbackAsset(asset, path) {
  const upstreamUrl = stringValue(asset?.upstreamUrl);
  if (!upstreamUrl?.startsWith(FALLBACK_ASSET_CACHE_PREFIX) || !isCacheableFallbackAsset(path)) {
    return false;
  }
  const fetchedAt = Date.parse(stringValue(asset?.fetchedAt) || "");
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < FALLBACK_ASSET_CACHE_TTL_MS;
}

function writeCachedAsset(store, path, upstreamUrl, contentType, body) {
  store.database.run(
    "INSERT OR REPLACE INTO claude_design_assets (path, upstream_url, content_type, body_base64, fetched_at) VALUES (?, ?, ?, ?, ?)",
    [path, upstreamUrl, contentType || guessContentType(path), body.toString("base64"), new Date().toISOString()]
  );
  store.persist();
}

function deleteCachedAsset(store, path) {
  store.database.run("DELETE FROM claude_design_assets WHERE path = ?", [path]);
  store.persist();
}

function purgeBadCachedAssets(store) {
  store.database.run(`
    DELETE FROM claude_design_assets
    WHERE (upstream_url LIKE 'fallback:%' AND upstream_url NOT LIKE ?)
       OR body_base64 = ''
       OR (lower(content_type) LIKE '%text/html%' AND lower(path) NOT LIKE '%.html')
  `, [`${FALLBACK_ASSET_CACHE_PREFIX}%`]);
  store.persist();
}

function listCachedAssets(store) {
  return queryRows(
    store.database,
    "SELECT path, upstream_url, content_type, length(body_base64) AS body_base64_length, fetched_at FROM claude_design_assets ORDER BY fetched_at DESC",
    []
  ).map((row) => ({
    bodyBase64Length: row.body_base64_length,
    contentType: row.content_type,
    fetchedAt: row.fetched_at,
    path: row.path,
    upstreamUrl: row.upstream_url
  }));
}

function readLocalAsset(assetDir, requestPath) {
  if (!assetDir) {
    return undefined;
  }

  const localRoot = localAssetRootInfo(assetDir);
  for (const relativePath of localAssetRelativePathCandidates(localRoot, requestPath)) {
    if (!relativePath || relativePath.includes("\0")) {
      continue;
    }

    const file = pathModule.resolve(localRoot.root, relativePath);
    if (file !== localRoot.root && !file.startsWith(`${localRoot.root}${pathModule.sep}`)) {
      continue;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      continue;
    }

    return {
      body: fs.readFileSync(file),
      contentType: guessContentType(file),
      source: file
    };
  }
  return undefined;
}

function localAssetRelativePathCandidates(localRoot, requestPath) {
  const normalizedPath = normalizePath(requestPath);
  if (localRoot.kind === "claude-app-ion-dist") {
    if (normalizedPath.startsWith("/design/assets/")) {
      return [`assets/${normalizedPath.slice("/design/assets/".length)}`];
    }
    if (normalizedPath.startsWith("/assets/")) {
      return [normalizedPath.slice(1)];
    }
    if (normalizedPath === "/design" || normalizedPath === "/design/") {
      return ["index.html"];
    }
    if (normalizedPath.startsWith("/design/")) {
      return [normalizedPath.slice("/design/".length)];
    }
    if (isClaudeAppStaticRoutePath(normalizedPath)) {
      return [normalizedPath.slice(1)];
    }
    return [];
  }

  return [
    normalizedPath
      .replace(/^\/design\/assets\//, "")
      .replace(/^\/assets\//, "")
      .replace(/^\/design\//, "")
  ];
}

function isClaudeAppStaticRoutePath(path) {
  return path === "/favicon.ico" ||
    path === "/manifest.json" ||
    path === "/robots.txt" ||
    path === "/frame-shell.html" ||
    path.startsWith("/assets/") ||
    path.startsWith("/images/") ||
    path.startsWith("/i18n/") ||
    path.startsWith("/captions/") ||
    path.startsWith("/descriptions/");
}

function isDesignStaticAsset(path) {
  return /^\/design\/[^/?#]+\.(?:avif|gif|html|ico|jpeg|jpg|json|png|svg|webp|woff2?)$/i.test(path);
}

function isClaudeAppSpaRoute(path) {
  return CLAUDE_APP_SPA_ROUTE_PATHS.includes(path) ||
    CLAUDE_APP_SPA_ROUTE_PATHS.includes(path.replace(/\/$/, ""));
}

function isClaudeAppDesignIframeRequest(url, request) {
  if (url.searchParams.get(CLAUDE_APP_DESIGN_IFRAME_QUERY) === "1") {
    return true;
  }
  const fetchDest = (stringValue(headerValue(request?.headers?.["sec-fetch-dest"])) || "").toLowerCase();
  if (fetchDest === "iframe" || fetchDest === "frame") {
    return true;
  }
  return refererIsClaudeAppDesignShell(request?.headers?.referer);
}

function refererIsClaudeAppDesignShell(value) {
  const referer = stringValue(value);
  if (!referer) {
    return false;
  }
  try {
    const parsed = new URL(referer, "https://claude.ai");
    return isClaudeAppSpaRoute(normalizePath(parsed.pathname)) &&
      parsed.searchParams.has(CLAUDE_APP_DESIGN_PATH_QUERY);
  } catch {
    return false;
  }
}

function claudeAppDesignEntrypointRedirectUrl(url) {
  const path = normalizePath(url.pathname);
  if (!isDesignSpaRoute(path)) {
    return "";
  }
  if (path === "/design" && url.searchParams.get(CLAUDE_APP_DESIGN_IFRAME_QUERY) === "1") {
    return "";
  }

  const pathParam = stringValue(url.searchParams.get(CLAUDE_APP_DESIGN_PATH_QUERY));
  if (path === "/design" && pathParam) {
    const markedPath = withClaudeAppDesignIframeMarker(pathParam);
    return `${CLAUDE_APP_DESIGN_SHELL_PATH}?${CLAUDE_APP_DESIGN_PATH_QUERY}=${encodeURIComponent(markedPath)}`;
  }

  const targetPath = withClaudeAppDesignIframeMarker(`${path}${url.search || ""}${url.hash || ""}`);
  return `${CLAUDE_APP_DESIGN_SHELL_PATH}?${CLAUDE_APP_DESIGN_PATH_QUERY}=${encodeURIComponent(targetPath)}`;
}

function withClaudeAppDesignIframeMarker(value) {
  const raw = stringValue(value) || "/design";
  let parsed;
  try {
    parsed = new URL(raw, "https://claude.ai");
  } catch {
    return raw;
  }
  const path = normalizePath(parsed.pathname);
  if (!isDesignSpaRoute(path)) {
    return raw;
  }
  if (parsed.searchParams.get(CLAUDE_APP_DESIGN_IFRAME_QUERY) !== "1") {
    parsed.searchParams.set(CLAUDE_APP_DESIGN_IFRAME_QUERY, "1");
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function isDesignSpaRoute(path) {
  if (path === "/design" || path === "/design/" || path === "/design/index.html") {
    return true;
  }
  return /^\/design\/(?:p|fromcc)(?:\/|$)/.test(path);
}

function isBootstrapRoutePath(path) {
  return BOOTSTRAP_ROUTE_PATHS.includes(path) ||
    /^\/(?:api|edge-api)\/bootstrap(?:\/[^/]+\/app_start)?\/?$/.test(path) ||
    /^\/_bootstrap(?:\/[^/]+\/app_start)?\/?$/.test(path);
}

function isDesignAuthEscapeRoute(path) {
  return AUTH_ESCAPE_ROUTE_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function listRequests(store, limit) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  return queryRows(
    store.database,
    `SELECT id, created_at, method, path, search, request_headers, request_body, response_status, response_body
     FROM claude_design_requests
     ORDER BY id DESC
     LIMIT ${safeLimit}`,
    []
  ).map((row) => ({
    createdAt: row.created_at,
    id: row.id,
    method: row.method,
    path: row.path,
    requestBody: parseMaybeJson(row.request_body, row.request_body),
    requestHeaders: parseMaybeJson(row.request_headers, {}),
    responseBody: parseMaybeJson(row.response_body, row.response_body),
    responseStatus: row.response_status,
    search: row.search
  }));
}

function logRequest(store, entry) {
  const responseBody = bodyToLogText(entry.responseBody);
  store.database.run(
    "INSERT INTO claude_design_requests (created_at, method, path, search, request_headers, request_body, response_status, response_body) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      new Date().toISOString(),
      entry.method,
      entry.path,
      entry.search || "",
      truncateText(JSON.stringify(entry.requestHeaders || {})),
      truncateText(bodyToLogText(entry.requestBody)),
      entry.responseStatus,
      truncateText(responseBody)
    ]
  );
  store.persist();
}

function queryRows(database, sql, params) {
  const statement = database.prepare(sql);
  try {
    if (params && params.length) {
      statement.bind(params);
    }
    const rows = [];
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
    return rows;
  } finally {
    statement.free();
  }
}

function fetchUpstreamAsset(upstreamUrl, request, redirectsRemaining = MAX_UPSTREAM_ASSET_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const transport = upstreamUrl.protocol === "http:" ? http : https;
    const upstreamRequest = transport.request(
      upstreamUrl,
      {
        headers: upstreamAssetHeaders(upstreamUrl, request),
        method: "GET",
        timeout: 12000
      },
      (upstreamResponse) => {
        const redirectLocation = headerValue(upstreamResponse.headers.location);
        if (
          redirectLocation &&
          upstreamResponse.statusCode &&
          upstreamResponse.statusCode >= 300 &&
          upstreamResponse.statusCode < 400 &&
          redirectsRemaining > 0
        ) {
          upstreamResponse.resume();
          const redirectedUrl = new URL(redirectLocation, upstreamUrl);
          resolve(fetchUpstreamAsset(redirectedUrl, request, redirectsRemaining - 1));
          return;
        }

        const chunks = [];
        upstreamResponse.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        upstreamResponse.on("end", () => {
          resolve({
            body: Buffer.concat(chunks),
            contentType: headerValue(upstreamResponse.headers["content-type"]) || guessContentType(upstreamUrl.pathname),
            status: upstreamResponse.statusCode || 502,
            url: upstreamUrl.toString()
          });
        });
      }
    );
    upstreamRequest.on("timeout", () => upstreamRequest.destroy(new Error(`Timed out fetching ${upstreamUrl.toString()}`)));
    upstreamRequest.on("error", reject);
    upstreamRequest.end();
  });
}

function fetchUpstreamDesignShell(upstreamUrl, request, redirectsRemaining = MAX_UPSTREAM_ASSET_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const transport = upstreamUrl.protocol === "http:" ? http : https;
    const linkHeaders = [];
    const upstreamRequest = transport.request(
      upstreamUrl,
      {
        headers: upstreamDesignShellHeaders(upstreamUrl, request),
        method: "GET",
        timeout: 4000
      },
      (upstreamResponse) => {
        const redirectLocation = headerValue(upstreamResponse.headers.location);
        if (
          redirectLocation &&
          upstreamResponse.statusCode &&
          upstreamResponse.statusCode >= 300 &&
          upstreamResponse.statusCode < 400 &&
          redirectsRemaining > 0
        ) {
          upstreamResponse.resume();
          const redirectedUrl = new URL(redirectLocation, upstreamUrl);
          resolve(fetchUpstreamDesignShell(redirectedUrl, request, redirectsRemaining - 1));
          return;
        }

        linkHeaders.push(...headerValues(upstreamResponse.headers.link));
        const chunks = [];
        let totalBytes = 0;
        upstreamResponse.on("data", (chunk) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += buffer.length;
          if (totalBytes <= 512 * 1024) {
            chunks.push(buffer);
          }
        });
        upstreamResponse.on("end", () => {
          resolve({
            body: Buffer.concat(chunks).toString("utf8"),
            contentType: headerValue(upstreamResponse.headers["content-type"]) || "",
            linkHeaders,
            status: upstreamResponse.statusCode || 502,
            url: upstreamUrl.toString()
          });
        });
      }
    );
    upstreamRequest.on("information", (info) => {
      linkHeaders.push(...headerValues(info.headers?.link));
    });
    upstreamRequest.on("timeout", () => upstreamRequest.destroy(new Error(`Timed out discovering ${upstreamUrl.toString()}`)));
    upstreamRequest.on("error", reject);
    upstreamRequest.end();
  });
}

function upstreamDesignShellHeaders(upstreamUrl, request) {
  const cookie = headerValue(request.headers.cookie);
  return {
    accept: "*/*",
    ...(cookie ? { cookie } : {}),
    origin: DEFAULT_DESIGN_ORIGIN,
    referer: DEFAULT_DESIGN_REFERRER,
    "user-agent":
      headerValue(request.headers["user-agent"]) ||
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
  };
}

function upstreamAssetHeaders(upstreamUrl, request) {
  const cookie = shouldForwardCookieToAsset(upstreamUrl) ? headerValue(request.headers.cookie) : undefined;
  return {
    accept: headerValue(request.headers.accept) || defaultAssetAccept(upstreamUrl.pathname),
    "accept-encoding": "identity",
    "accept-language": headerValue(request.headers["accept-language"]) || "en-US,en;q=0.9",
    "cache-control": "no-cache",
    ...(cookie ? { cookie } : {}),
    pragma: "no-cache",
    referer: DEFAULT_DESIGN_REFERRER,
    "sec-fetch-dest": assetFetchDest(upstreamUrl.pathname),
    "sec-fetch-mode": "no-cors",
    "sec-fetch-site": "same-origin",
    "user-agent":
      headerValue(request.headers["user-agent"]) ||
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
  };
}

function shouldForwardCookieToAsset(upstreamUrl) {
  return upstreamUrl.hostname === DEFAULT_HOST;
}

function defaultAssetAccept(path) {
  if (/\.(?:js|mjs)$/i.test(path)) {
    return "*/*";
  }
  if (/\.css$/i.test(path)) {
    return "text/css,*/*;q=0.1";
  }
  if (/\.(?:avif|gif|jpe?g|png|svg|webp|ico)$/i.test(path)) {
    return "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
  }
  if (/\.woff2?$/i.test(path)) {
    return "*/*";
  }
  return "*/*";
}

function assetFetchDest(path) {
  if (/\.(?:js|mjs)$/i.test(path)) {
    return "script";
  }
  if (/\.css$/i.test(path)) {
    return "style";
  }
  if (/\.(?:avif|gif|jpe?g|png|svg|webp|ico)$/i.test(path)) {
    return "image";
  }
  if (/\.woff2?$/i.test(path)) {
    return "font";
  }
  return "empty";
}

function sendResponse(response, result) {
  const headers = result.headers || {};
  const body = result.body === undefined || result.body === null ? "" : result.body;
  const normalizedBody = Buffer.isBuffer(body) ? body : typeof body === "string" ? body : JSON.stringify(body);
  response.writeHead(result.status || 200, {
    ...headers,
    "content-length": Buffer.byteLength(normalizedBody)
  });
  response.end(normalizedBody);
}

function jsonResponse(status, body, headers) {
  return {
    body,
    headers: corsHeaders({
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      ...(headers || {})
    }),
    status
  };
}

function htmlResponse(body) {
  return {
    body,
    headers: corsHeaders({
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8"
    }),
    status: 200
  };
}

function textResponse(status, body, headers) {
  return {
    body,
    headers: corsHeaders(headers || { "content-type": "text/plain; charset=utf-8" }),
    status
  };
}

function redirectResponse(status, location) {
  return {
    body: "",
    headers: corsHeaders({
      "cache-control": "no-store",
      location
    }),
    status
  };
}

function protoResponse(body, headers) {
  return binaryResponse(200, body || Buffer.alloc(0), {
    "cache-control": "no-store",
    "connect-protocol-version": "1",
    "content-type": "application/proto",
    ...(headers || {})
  });
}

function binaryResponse(status, body, headers) {
  return {
    body,
    headers: corsHeaders(headers || { "content-type": "application/octet-stream" }),
    status
  };
}

function corsHeaders(headers) {
  return {
    "access-control-allow-headers":
      "authorization, connect-protocol-version, content-type, x-client-version, x-omelette-tab-id, x-organization-uuid, x-requested-with",
    "access-control-allow-methods": "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT",
    "access-control-allow-origin": "*",
    ...headers
  };
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.once("end", () => resolve(decodeRequestBodyEncoding(Buffer.concat(chunks), request.headers?.["content-encoding"])));
    request.once("error", reject);
  });
}

function decodeRequestBodyEncoding(body, encodingValue) {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return body;
  }
  const encodings = stringValue(headerValue(encodingValue))?.toLowerCase()
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean) || [];
  if (encodings.length === 0 && body[0] === 0x1f && body[1] === 0x8b) {
    encodings.push("gzip");
  }
  if (encodings.length === 0 || encodings.every((encoding) => encoding === "identity")) {
    return body;
  }

  try {
    return encodings
      .reverse()
      .reduce((current, encoding) => decodeSingleRequestBodyEncoding(current, encoding), body);
  } catch {
    return body;
  }
}

function decodeSingleRequestBodyEncoding(body, encoding) {
  if (encoding === "gzip" || encoding === "x-gzip") {
    return zlib.gunzipSync(body);
  }
  if (encoding === "br") {
    return zlib.brotliDecompressSync(body);
  }
  if (encoding === "deflate") {
    try {
      return zlib.inflateSync(body);
    } catch {
      return zlib.inflateRawSync(body);
    }
  }
  return body;
}

function renderDesignIndex(me, scriptPath, stylePath, html) {
  if (isUsableDesignShellHtml(html)) {
    return injectDesignMeIntoHtml(String(html), me);
  }
  return renderDefaultDesignIndex(me, scriptPath, stylePath);
}

function renderDefaultDesignIndex(me, scriptPath, stylePath, options = {}) {
  const defaultAssetPreloads = options.defaultAssetPreloads !== false;
  const normalizedScriptPath = normalizePath(scriptPath) || DEFAULT_SCRIPT_PATH;
  const normalizedStylePath = normalizePath(stylePath) || (defaultAssetPreloads ? DEFAULT_STYLE_PATH : "");
  const criticalModulePreloads = defaultAssetPreloads
    ? renderModulePreloadLinks(DEFAULT_DESIGN_CRITICAL_MODULE_PRELOAD_PATHS)
    : "";
  const lazyModulePreloads = defaultAssetPreloads
    ? renderModulePreloadLinks(DEFAULT_DESIGN_LAZY_MODULE_PRELOAD_PATHS, true)
    : "";
  const stylePreloads = defaultAssetPreloads
    ? DEFAULT_DESIGN_STYLE_PRELOAD_PATHS
      .map((href) => `        <link rel="preload" as="style" crossorigin fetchpriority="low" href="${escapeHtmlAttribute(href)}">`)
      .join("\n")
    : "";
  const stylesheetLink = normalizedStylePath
    ? `        <link rel="stylesheet" crossorigin href="${escapeHtmlAttribute(normalizedStylePath)}">`
    : "";
  return `<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Claude Design</title>
        <link rel="icon" type="image/png" href="/design/favicon.png"/>
        ${claudeAppDesktopFeaturesScript()}
        <script>
            // FOUC guard: set data-theme before any stylesheet loads so the first
            // paint uses the right palette. Mirrors hooks/useTheme.ts. The stored
            // value is JSON (usehooks-ts useLocalStorage). When no preference is
            // stored we paint light - the dark-mode flag is not known until React
            // mounts, and a flag-off user with OS dark mode should not see a dark
            // flash. useTheme's effect corrects this on mount for flag-on users.
            try {
                var raw = localStorage.getItem('om:theme');
                // Mirror useTheme's default: usehooks-ts does not persist 'system'
                // until the toggle is used, so absent = 'system' (gated on flagOn).
                var pref = raw ? JSON.parse(raw) : 'system';
                // The flag is not known at first paint. The hook persists its last
                // known state here so a user whose flag was turned off after picking
                // Dark does not see a dark-to-light flash on every load.
                var flagOn = localStorage.getItem('om:dark-mode-enabled') === '1';
                var dark = flagOn && (pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches));
                document.documentElement.dataset.theme = dark ? 'dark' : 'light';
            } catch (e) {
                document.documentElement.dataset.theme = 'light';
            }
        </script>
        <script type="module" crossorigin src="${escapeHtmlAttribute(normalizedScriptPath)}"></script>
${criticalModulePreloads}
${stylesheetLink}
${lazyModulePreloads}
${stylePreloads}
    </head>
    <body>
        ${designMeJsonScript(me)}
        ${designModelPreferenceResetScript(me)}
        ${designMeGlobalScript(me)}
        <div id="root"></div>
    </body>
</html>
`;
}

function renderModulePreloadLinks(paths, lowPriority = false) {
  return paths
    .map((href) => {
      const priority = lowPriority ? " fetchpriority=\"low\"" : "";
      return `        <link rel="modulepreload" crossorigin${priority} href="${escapeHtmlAttribute(href)}">`;
    })
    .join("\n");
}

function injectDesignMeIntoHtml(html, me) {
  let nextHtml = html;
  const meJsonScript = designMeJsonScript(me);
  const meJsonPattern = /<script\b(?=[^>]*\bid=["']omelette-me["'])[^>]*>[\s\S]*?<\/script>/i;
  if (meJsonPattern.test(nextHtml)) {
    nextHtml = nextHtml.replace(meJsonPattern, meJsonScript);
  }

  const earlySnippets = [];
  const snippets = [];
  if (!nextHtml.includes("ccr-claude-app-desktop-features")) {
    earlySnippets.push(claudeAppDesktopFeaturesScript());
  }
  if (!meJsonPattern.test(nextHtml)) {
    snippets.push(meJsonScript);
  }
  if (!nextHtml.includes("ccr-claude-design-model-reset")) {
    snippets.push(designModelPreferenceResetScript(me));
  }
  if (!nextHtml.includes("__OMELETTE_ME__")) {
    snippets.push(designMeGlobalScript(me));
  }
  if (earlySnippets.length) {
    nextHtml = injectHtmlAfterHeadOpen(nextHtml, earlySnippets.join("\n        "));
  }
  if (!snippets.length) {
    return nextHtml;
  }
  return injectHtmlAfterBodyOpen(nextHtml, snippets.join("\n        "));
}

function injectHtmlAfterHeadOpen(html, snippet) {
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b([^>]*)>/i, `<head$1>\n        ${snippet}`);
  }
  return injectHtmlAfterBodyOpen(html, snippet);
}

function injectHtmlAfterBodyOpen(html, snippet) {
  if (/<body\b[^>]*>/i.test(html)) {
    return html.replace(/<body\b([^>]*)>/i, `<body$1>\n        ${snippet}`);
  }
  return `${snippet}\n${html}`;
}

function designMeJsonScript(me) {
  return `<script type="application/json" id="omelette-me">${escapeJsonForScript(designMePayload(me))}</script>`;
}

function designMeGlobalScript(me) {
  return `<script>window.__OMELETTE_ME__ = ${escapeJsonForScript(me)}</script>`;
}

function claudeAppDesktopFeaturesScript() {
  return `<script id="ccr-claude-app-desktop-features">(function(){try{var root=globalThis;var forced={claudeDesignWindow:{status:'supported'}};function merge(value){return Object.assign({},value||{},forced);}var bootFeatures=merge(root.desktopBootFeatures);try{Object.defineProperty(root,'desktopBootFeatures',{configurable:true,get:function(){return bootFeatures;},set:function(value){bootFeatures=merge(value);}});}catch(e){root.desktopBootFeatures=bootFeatures;}function patch(container){if(!container){return;}var existing=container.AppFeatures||{};if(existing.__ccrClaudeDesignPatched){return;}var previous=existing.getSupportedFeatures;container.AppFeatures=Object.assign({},existing,{__ccrClaudeDesignPatched:true,getSupportedFeatures:function(){if(typeof previous==='function'){return Promise.resolve(previous.call(existing)).then(merge,function(){return merge();});}return Promise.resolve(merge());}});}root["claude.settings"]=root["claude.settings"]||{};patch(root["claude.settings"]);root.claude=root.claude||{};root.claude.settings=root.claude.settings||{};patch(root.claude.settings);}catch(e){}})();</script>`;
}

function designModelPreferenceResetScript(me) {
  const defaultModelId = stringValue(me?.defaultModelId) || DEFAULT_GATEWAY_MODEL;
  return `<script id="ccr-claude-design-model-reset">(function(){try{var defaultModelId=${escapeJsonForScript(defaultModelId)};if(!defaultModelId||String(defaultModelId).toLowerCase().indexOf('deepseek')!==-1){return;}var marker='ccr:claude-design:model-default-reset:'+defaultModelId;if(localStorage.getItem(marker)==='1'){return;}function shouldClear(key,value){var keyText=String(key||'').toLowerCase();var valueText=String(value||'').toLowerCase();if(valueText.indexOf('deepseek')===-1){return false;}return keyText.indexOf('model')!==-1||keyText.indexOf('omelette')!==-1||keyText.indexOf('om:')===0||keyText.indexOf('claude')!==-1||valueText.indexOf('model')!==-1||valueText.indexOf('deepseek::')!==-1||valueText.indexOf('deepseek/')!==-1;}function clearStorage(storage){if(!storage){return;}var keys=[];for(var i=0;i<storage.length;i++){keys.push(storage.key(i));}for(var j=0;j<keys.length;j++){var key=keys[j];if(shouldClear(key,storage.getItem(key))){storage.removeItem(key);}}}clearStorage(localStorage);clearStorage(sessionStorage);localStorage.setItem(marker,'1');}catch(e){}})();</script>`;
}

function designMePayload(me) {
  return {
    ...me,
    canManageBilling: true
  };
}

function isUsableDesignShellHtml(value) {
  const html = stringValue(value);
  if (!html) {
    return false;
  }
  if (!/<html[\s>]/i.test(html) || !/<script\b[^>]*\bsrc=/i.test(html)) {
    return false;
  }
  if (/\bJust a moment\b|cf_chl|Performing security verification|App unavailable in region/i.test(html)) {
    return false;
  }
  const hasAssetReferences = /(?:src|href)=["'][^"']*(?:\/design)?\/assets\//i.test(html);
  const hasDesignShellMarkers = /anthropic\.omelette|OmeletteService|__OMELETTE_ME__|\/v1\/design/i.test(html);
  const hasClaudeAppShellMarkers = /<div\b[^>]*\bid=["']root["'][^>]*>/i.test(html) &&
    /\/assets\/v\d+\/index-[^"']+\.js/i.test(html) &&
    /data-build-id=|data-color-version=|Claude is Anthropic/i.test(html);
  return hasAssetReferences && (hasDesignShellMarkers || hasClaudeAppShellMarkers);
}

function normalizeMe(value, defaultGatewayModel = DEFAULT_GATEWAY_MODEL, gatewayModelPresets = undefined) {
  const overrides = isRecord(value) ? value : {};
  const defaultModelId = publicGatewayModelSelector(defaultGatewayModel) || DEFAULT_GATEWAY_MODEL;
  const me = {
    ...DEFAULT_ME,
    ...overrides
  };
  if (!stringValue(overrides.defaultModelId)) {
    me.defaultModelId = defaultModelId;
  }
  if (!Array.isArray(me.memberships) || me.memberships.length === 0) {
    me.memberships = [
      {
        name: me.orgName,
        uuid: me.organizationUuid
      }
    ];
  }
  if (!Array.isArray(overrides.modelPresets)) {
    me.modelPresets = Array.isArray(gatewayModelPresets) && gatewayModelPresets.length > 0
      ? gatewayModelPresets
      : defaultClaudeDesignModelPresets(me.defaultModelId);
  } else if (!me.modelPresets.some((preset) => isRecord(preset) && stringValue(preset.id) === me.defaultModelId)) {
    me.modelPresets = [defaultClaudeDesignModelPreset(me.defaultModelId), ...me.modelPresets];
  }
  return me;
}

function defaultClaudeDesignModelPresets(defaultModelId) {
  const presets = DEFAULT_ME.modelPresets.map((preset) => ({ ...preset }));
  if (defaultModelId === DEFAULT_GATEWAY_MODEL) {
    return presets;
  }
  return [
    defaultClaudeDesignModelPreset(defaultModelId),
    ...presets.filter((preset) => preset.id !== defaultModelId)
  ];
}

function defaultClaudeDesignModelPreset(defaultModelId) {
  if (defaultModelId === DEFAULT_GATEWAY_MODEL) {
    return { ...DEFAULT_ME.modelPresets[0] };
  }
  return {
    id: defaultModelId,
    label: "Default Gateway Model",
    maxTokens: 1000000,
    supportsAdaptiveThinking: true,
    description: "Uses the CCR gateway default"
  };
}

function stringArray(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value.map((item) => normalizePath(String(item || ""))).filter(Boolean);
  return values.length ? values : undefined;
}

function parseJsonBody(buffer) {
  return parseMaybeJson(buffer.toString("utf8") || "{}", {});
}

function parseMaybeJson(value, fallback) {
  if (typeof value !== "string") {
    return value === undefined ? fallback : value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function bodyToLogText(value) {
  if (Buffer.isBuffer(value)) {
    const text = value.toString("utf8");
    return looksBinary(text) ? `<binary ${value.length} bytes>` : text;
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function looksBinary(value) {
  return value.includes("\u0000");
}

function truncateText(value) {
  const text = String(value || "");
  return text.length > MAX_LOG_BODY_CHARS ? `${text.slice(0, MAX_LOG_BODY_CHARS)}...<truncated>` : text;
}

function normalizePath(value) {
  if (!value) {
    return "";
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function parseAbsoluteHttpUrl(value) {
  const raw = stringValue(value);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function configuredGatewayApiKey(config) {
  if (!isRecord(config)) {
    return undefined;
  }
  const legacy = stringValue(config.APIKEY);
  if (legacy) {
    return legacy;
  }
  const apiKeys = Array.isArray(config.APIKEYS) ? config.APIKEYS : [];
  for (const apiKey of apiKeys) {
    if (isRecord(apiKey)) {
      const key = stringValue(apiKey.key);
      if (key) {
        return key;
      }
    }
  }
  return undefined;
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function headerValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return typeof value === "string" ? value : undefined;
}

function headerValues(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string" && item);
  }
  return typeof value === "string" && value ? [value] : [];
}

function headerIncludes(value, token) {
  return Boolean(headerValue(value)?.toLowerCase().includes(token.toLowerCase()));
}

function randomUuid() {
  return crypto.randomUUID();
}

function guessContentType(path) {
  if (path.endsWith(".html") || path.endsWith(".htm")) {
    return "text/html; charset=utf-8";
  }
  if (path.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (path.endsWith(".jsx")) {
    return "text/jsx; charset=utf-8";
  }
  if (path.endsWith(".js") || path.endsWith(".mjs")) {
    return "application/javascript; charset=utf-8";
  }
  if (path.endsWith(".png")) {
    return "image/png";
  }
  if (path.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (path.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  if (path.endsWith(".woff2")) {
    return "font/woff2";
  }
  return "application/octet-stream";
}

function escapeJsonForScript(value) {
  return JSON.stringify(value, null, 16)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeHtmlAttribute(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const FAVICON_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGElEQVR4nGP8z8Dwn4ECwESJ5lEDRgYGAGz1A/2B4p8yAAAAAElFTkSuQmCC";
