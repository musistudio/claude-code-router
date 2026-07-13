import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeClaudeCodeOauthProviderPlugins,
  prepareGatewayUpstreamAttemptForTest
} from "../../packages/core/src/gateway/service.ts";

test("issue 1528 normalizes Claude Code OAuth auth to preserve the client anthropic-beta header", () => {
  const [plugin] = normalizeClaudeCodeOauthProviderPlugins([
    {
      auth: {
        headers: {
          authorization: "Bearer oauth-token",
          "anthropic-beta": "oauth-2025-04-20"
        },
        removeHeaders: ["x-api-key"],
        strict: true
      },
      key: "ccr-local-agent-claude-code-api-claude-code-oauth",
      providerName: "Claude Code API"
    }
  ]);

  assert.equal(plugin.auth.headers.authorization, "Bearer oauth-token");
  assert.deepEqual(plugin.auth.headers["anthropic-beta"], {
    default: "oauth-2025-04-20",
    from: "request.headers.anthropic-beta"
  });
  assert.equal(plugin.auth.strict, true);
});

test("issue 1528 merges Claude Code OAuth beta with client beta tokens only for the routed provider", () => {
  const claudeCodeProvider = {
    api_base_url: "https://api.anthropic.com",
    id: "provider-claude-code-api-test",
    models: ["claude-sonnet-5"],
    name: "Claude Code API",
    type: "anthropic_messages"
  };
  const otherProvider = {
    api_base_url: "https://anthropic.example/v1",
    id: "provider-other-anthropic-test",
    models: ["claude-other"],
    name: "Other Anthropic",
    type: "anthropic_messages"
  };
  const config = {
    Providers: [claudeCodeProvider, otherProvider],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 } },
    gateway: {},
    providerPlugins: [
      {
        auth: {
          headers: {
            authorization: "Bearer oauth-token",
            "anthropic-beta": "oauth-2025-04-20"
          },
          strict: true
        },
        key: "ccr-local-agent-claude-code-api-claude-code-oauth",
        providerName: claudeCodeProvider.name
      }
    ]
  };

  const claudeCodeAttempt = prepareGatewayUpstreamAttemptForTest({
    body: { messages: [{ content: "hi", role: "user" }], model: "Claude Code API/claude-sonnet-5" },
    config,
    headers: { "anthropic-beta": "context-management-2025-06-27,effort-2025-11-24" },
    method: "POST",
    path: "/v1/messages"
  });
  const otherAttempt = prepareGatewayUpstreamAttemptForTest({
    body: { messages: [{ content: "hi", role: "user" }], model: "Other Anthropic/claude-other" },
    config,
    headers: { "anthropic-beta": "context-management-2025-06-27" },
    method: "POST",
    path: "/v1/messages"
  });

  assert.equal(
    claudeCodeAttempt.headers["anthropic-beta"],
    "context-management-2025-06-27,effort-2025-11-24,oauth-2025-04-20"
  );
  assert.equal(otherAttempt.headers["anthropic-beta"], "context-management-2025-06-27");
});
