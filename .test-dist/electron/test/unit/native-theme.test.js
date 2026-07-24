"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// packages/electron/test/unit/native-theme.test.ts
var import_strict = __toESM(require("node:assert/strict"));
var import_node_test = __toESM(require("node:test"));

// packages/core/src/contracts/ipc-channels.ts
var IPC_CHANNELS = {
  appBeforeQuit: "ccr:app:before-quit",
  appCaptureElementPng: "ccr:app:capture-element-png",
  appCloseTray: "ccr:app:close-tray",
  appDetectProviderIcon: "ccr:app:detect-provider-icon",
  appExportData: "ccr:app:export-data",
  appGetConfig: "ccr:app:get-config",
  appGetAgentAnalysis: "ccr:app:get-agent-analysis",
  appGetAgentTracePayload: "ccr:app:get-agent-trace-payload",
  appGetGatewayStatus: "ccr:app:get-gateway-status",
  appGetInfo: "ccr:app:get-info",
  appGetOnboardingFinished: "ccr:app:get-onboarding-finished",
  appGetPendingProviderDeepLinks: "ccr:app:get-pending-provider-deep-links",
  appGetProfileOpenCommand: "ccr:app:get-profile-open-command",
  appGetProfileRuntimeStatus: "ccr:app:get-profile-runtime-status",
  appGetLocalAgentProviderCandidates: "ccr:app:get-local-agent-provider-candidates",
  appGetProviderAccountSnapshots: "ccr:app:get-provider-account-snapshots",
  appGetProviderCatalogModels: "ccr:app:get-provider-catalog-models",
  appGetProviderPresets: "ccr:app:get-provider-presets",
  appGetProxyCertificateStatus: "ccr:app:get-proxy-certificate-status",
  appGetProxyNetworkCaptures: "ccr:app:get-proxy-network-captures",
  appGetProxyStatus: "ccr:app:get-proxy-status",
  appGetRequestLogDetail: "ccr:app:get-request-log-detail",
  appGetRequestLogs: "ccr:app:get-request-logs",
  appGetUpdateStatus: "ccr:app:get-update-status",
  appGetUsageStats: "ccr:app:get-usage-stats",
  appFetchProviderManifest: "ccr:app:fetch-provider-manifest",
  appInstallProxyCertificate: "ccr:app:install-proxy-certificate",
  appImportLocalAgentProvider: "ccr:app:import-local-agent-provider",
  appListMcpServerTools: "ccr:app:list-mcp-server-tools",
  appOpenBuiltInBrowser: "ccr:app:open-built-in-browser",
  appOpenExternal: "ccr:app:open-external",
  appOpenSettings: "ccr:app:open-settings",
  appOpenUpdate: "ccr:app:open-update",
  appOpenProfile: "ccr:app:open-profile",
  appApplyClaudeAppGateway: "ccr:app:apply-claude-app-gateway",
  appApplyProfile: "ccr:app:apply-profile",
  appBotGatewayQrLoginCancel: "ccr:app:bot-gateway-qr-login-cancel",
  appBotGatewayQrLoginStart: "ccr:app:bot-gateway-qr-login-start",
  appBotGatewayQrLoginWait: "ccr:app:bot-gateway-qr-login-wait",
  appBotGatewayQrWindowClose: "ccr:app:bot-gateway-qr-window-close",
  appBotGatewayQrWindowOpen: "ccr:app:bot-gateway-qr-window-open",
  appBotHandoffBluetoothTargetsScan: "ccr:app:bot-handoff-bluetooth-targets-scan",
  appBotHandoffWifiTargetsScan: "ccr:app:bot-handoff-wifi-targets-scan",
  appCheckProviderConnectivity: "ccr:app:check-provider-connectivity",
  appProbeLocalAgentProvider: "ccr:app:probe-local-agent-provider",
  appProbeProvider: "ccr:app:probe-provider",
  appProbeProviderCandidates: "ccr:app:probe-provider-candidates",
  appProviderDeepLink: "ccr:app:provider-deep-link",
  appGetPluginMarketplace: "ccr:app:get-plugin-marketplace",
  appPrepareImageExportTarget: "ccr:app:prepare-image-export-target",
  appQuit: "ccr:app:quit",
  appRevealProxyCertificate: "ccr:app:reveal-proxy-certificate",
  appRenderHtmlPng: "ccr:app:render-html-png",
  appRestartProxy: "ccr:app:restart-proxy",
  appRestartGateway: "ccr:app:restart-gateway",
  appResetCodexRateLimitCredit: "ccr:app:reset-codex-rate-limit-credit",
  appSaveApiKeys: "ccr:app:save-api-keys",
  appClearProxyNetworkCaptures: "ccr:app:clear-proxy-network-captures",
  appStartGateway: "ccr:app:start-gateway",
  appStopGateway: "ccr:app:stop-gateway",
  appStopProfile: "ccr:app:stop-profile",
  appSaveConfig: "ccr:app:save-config",
  appSetOnboardingFinished: "ccr:app:set-onboarding-finished",
  appSetTrayDetailOpen: "ccr:app:set-tray-detail-open",
  appSetThemePreference: "ccr:app:set-theme-preference",
  appSetProxyNetworkCaptureEnabled: "ccr:app:set-proxy-network-capture-enabled",
  appSelectPluginDirectory: "ccr:app:select-plugin-directory",
  appShowMainWindow: "ccr:app:show-main-window",
  appTestProviderAccountConnector: "ccr:app:test-provider-account-connector",
  appTestRouteScript: "ccr:app:test-route-script",
  appUpdateCheck: "ccr:app:update-check",
  appUpdateDownload: "ccr:app:update-download",
  appUpdateInstall: "ccr:app:update-install",
  appUpdateStatusChanged: "ccr:app:update-status-changed",
  appValidateRouteScript: "ccr:app:validate-route-script",
  appThemePreferenceChanged: "ccr:app:theme-preference-changed",
  browserBack: "ccr:browser:back",
  browserCloseTab: "ccr:browser:close-tab",
  browserForward: "ccr:browser:forward",
  browserGetChromeLoginImport: "ccr:browser:get-chrome-login-import",
  browserGetState: "ccr:browser:get-state",
  browserNavigate: "ccr:browser:navigate",
  browserNewTab: "ccr:browser:new-tab",
  browserReload: "ccr:browser:reload",
  browserResolveAutomationHandoff: "ccr:browser:resolve-automation-handoff",
  browserSelectTab: "ccr:browser:select-tab",
  browserStartChromeLoginImport: "ccr:browser:start-chrome-login-import",
  browserStateChanged: "ccr:browser:state-changed"
};

// packages/electron/src/main/native-theme.ts
var import_electron = require("electron");
function nativeThemeSource(theme) {
  return theme === "light" || theme === "dark" ? theme : "system";
}

// packages/electron/test/unit/native-theme.test.ts
(0, import_node_test.default)("native theme source maps explicit preferences and system fallback", () => {
  import_strict.default.equal(nativeThemeSource("light"), "light");
  import_strict.default.equal(nativeThemeSource("dark"), "dark");
  import_strict.default.equal(nativeThemeSource("system"), "system");
  import_strict.default.equal(nativeThemeSource(void 0), "system");
});
(0, import_node_test.default)("theme preference IPC uses separate save and renderer notification channels", () => {
  import_strict.default.equal(IPC_CHANNELS.appSetThemePreference, "ccr:app:set-theme-preference");
  import_strict.default.equal(IPC_CHANNELS.appThemePreferenceChanged, "ccr:app:theme-preference-changed");
});
