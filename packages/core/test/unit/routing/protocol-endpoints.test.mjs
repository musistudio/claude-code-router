import assert from "node:assert/strict";
import test from "node:test";
import {
  requestProtocolForPath,
  shouldApplyGatewayRouting
} from "@ccr/core/routing/protocol-endpoints.ts";

test("request protocol detection covers every supported public endpoint shape", () => {
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
    assert.equal(requestProtocolForPath(path), protocol, path);
  }
  assert.equal(requestProtocolForPath("/v1/completions"), undefined);
  assert.equal(requestProtocolForPath("/v1beta/models/gemini-2.5-pro:countTokens"), undefined);
});

test("gateway routing applies only to POST model-selection endpoints", () => {
  assert.equal(shouldApplyGatewayRouting("post", "/v1/messages"), true);
  assert.equal(shouldApplyGatewayRouting("POST", "/v1beta/models/gemini:generateContent"), true);
  assert.equal(shouldApplyGatewayRouting("POST", "/v1beta/interactions"), true);
  assert.equal(shouldApplyGatewayRouting("POST", "/v1beta/interactions/interaction-1"), false);
  assert.equal(shouldApplyGatewayRouting("POST", "/v1beta/interactions/interaction-1/cancel"), false);
  assert.equal(shouldApplyGatewayRouting("GET", "/v1/messages"), false);
  assert.equal(shouldApplyGatewayRouting("DELETE", "/v1beta/interactions"), false);
});
