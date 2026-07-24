"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/core/src/gateway/core-runtime/upstream-header-sanitizer.ts
var upstream_header_sanitizer_exports = {};
__export(upstream_header_sanitizer_exports, {
  createGatewayPlugin: () => createGatewayPlugin,
  sanitizeUpstreamProviderHeaders: () => sanitizeUpstreamProviderHeaders
});
module.exports = __toCommonJS(upstream_header_sanitizer_exports);
var ccrAuthHeaderNames = /* @__PURE__ */ new Set([
  "x-auth-api-key-id",
  "x-auth-sub"
]);
function sanitizeUpstreamProviderHeaders(headers) {
  const sanitized = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.trim().toLowerCase();
    if (normalized.startsWith("x-ccr-") || ccrAuthHeaderNames.has(normalized)) continue;
    sanitized[name] = value;
  }
  return sanitized;
}
function createGatewayPlugin() {
  return {
    providerHooks: [{
      key: "ccr-upstream-header-sanitizer",
      transformRequest(input) {
        return {
          ok: true,
          value: {
            ...input.upstreamRequest,
            headers: sanitizeUpstreamProviderHeaders(input.upstreamRequest.headers)
          }
        };
      }
    }]
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createGatewayPlugin,
  sanitizeUpstreamProviderHeaders
});
