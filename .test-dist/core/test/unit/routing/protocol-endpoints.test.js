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

// packages/core/test/unit/routing/protocol-endpoints.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_test = __toESM(require("node:test"), 1);

// packages/core/src/routing/protocol-endpoints.ts
function requestProtocolForPath(path) {
  const normalized = path.toLowerCase();
  if (normalized === "/v1/messages" || normalized === "/messages" || normalized.endsWith("/v1/messages")) {
    return "anthropic_messages";
  }
  if (normalized === "/v1/chat/completions" || normalized === "/chat/completions" || normalized.endsWith("/chat/completions")) {
    return "openai_chat_completions";
  }
  if (normalized === "/v1/responses" || normalized === "/responses" || normalized.endsWith("/responses")) {
    return "openai_responses";
  }
  if (/\/v1(?:beta)?\/models\/[^/]+:(?:generatecontent|streamgeneratecontent)$/i.test(normalized)) {
    return "gemini_generate_content";
  }
  if (/\/v1(?:beta)?\/interactions(?:\/[^/]+(?:\/cancel)?)?$/i.test(normalized)) {
    return "gemini_interactions";
  }
  return void 0;
}
function shouldApplyGatewayRouting(method, path) {
  if (method.toUpperCase() !== "POST") {
    return false;
  }
  const protocol = requestProtocolForPath(path);
  if (protocol === "gemini_interactions") {
    return /\/v1(?:beta)?\/interactions$/i.test(path);
  }
  return Boolean(protocol);
}

// packages/core/test/unit/routing/protocol-endpoints.test.mjs
(0, import_node_test.default)("request protocol detection covers every supported public endpoint shape", () => {
  const cases = [
    ["/messages", "anthropic_messages"],
    ["/proxy/v1/messages", "anthropic_messages"],
    ["/chat/completions", "openai_chat_completions"],
    ["/proxy/v1/chat/completions", "openai_chat_completions"],
    ["/responses", "openai_responses"],
    ["/proxy/v1/responses", "openai_responses"],
    ["/v1/models/gemini-2.5-pro:generateContent", "gemini_generate_content"],
    ["/v1beta/models/gemini-2.5-pro:streamGenerateContent", "gemini_generate_content"],
    ["/v1/interactions", "gemini_interactions"],
    ["/v1beta/interactions/interaction-1", "gemini_interactions"],
    ["/v1beta/interactions/interaction-1/cancel", "gemini_interactions"]
  ];
  for (const [path, protocol] of cases) {
    import_strict.default.equal(requestProtocolForPath(path), protocol, path);
  }
  import_strict.default.equal(requestProtocolForPath("/v1/completions"), void 0);
  import_strict.default.equal(requestProtocolForPath("/v1beta/models/gemini-2.5-pro:countTokens"), void 0);
});
(0, import_node_test.default)("gateway routing applies only to POST model-selection endpoints", () => {
  import_strict.default.equal(shouldApplyGatewayRouting("post", "/v1/messages"), true);
  import_strict.default.equal(shouldApplyGatewayRouting("POST", "/v1beta/models/gemini:generateContent"), true);
  import_strict.default.equal(shouldApplyGatewayRouting("POST", "/v1beta/interactions"), true);
  import_strict.default.equal(shouldApplyGatewayRouting("POST", "/v1beta/interactions/interaction-1"), false);
  import_strict.default.equal(shouldApplyGatewayRouting("POST", "/v1beta/interactions/interaction-1/cancel"), false);
  import_strict.default.equal(shouldApplyGatewayRouting("GET", "/v1/messages"), false);
  import_strict.default.equal(shouldApplyGatewayRouting("DELETE", "/v1beta/interactions"), false);
});
