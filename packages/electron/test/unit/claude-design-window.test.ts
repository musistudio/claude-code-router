import assert from "node:assert/strict";
import test from "node:test";
import {
  claudeDesignCdpFetchPatterns,
  claudeDesignCdpOptionsFromStatus,
  claudeDesignRedirectUrlForRequest
} from "@ccr/electron/main/claude-design-window.ts";

test("Claude Design window CDP options are derived from plugin status", () => {
  const options = claudeDesignCdpOptionsFromStatus({
    backend: "http://127.0.0.1:45678",
    proxy: {
      fallbackHosts: ["claude.com", "www.anthropic.com"],
      host: "claude.ai",
      paths: ["/design", "/v1/design", "/api"]
    }
  });

  assert.deepEqual(options, {
    backendUrl: "http://127.0.0.1:45678/",
    hosts: ["claude.ai", "claude.com", "www.anthropic.com"],
    paths: ["/design", "/v1/design", "/api"]
  });
});

test("Claude Design window CDP rewrites matching Claude requests to the local backend", () => {
  const options = {
    backendUrl: "http://127.0.0.1:45678/",
    hosts: ["claude.ai", "claude.com"],
    paths: ["/design", "/api"]
  };

  assert.equal(
    claudeDesignRedirectUrlForRequest("https://claude.ai/design/p/abc?tab=preview", options),
    "http://127.0.0.1:45678/design/p/abc?tab=preview"
  );
  assert.equal(
    claudeDesignRedirectUrlForRequest("https://claude.com/api/bootstrap/org/app_start", options),
    "http://127.0.0.1:45678/api/bootstrap/org/app_start"
  );
  assert.equal(claudeDesignRedirectUrlForRequest("https://claude.ai/settings", options), undefined);
  assert.equal(claudeDesignRedirectUrlForRequest("https://example.com/design", options), undefined);
});

test("Claude Design window CDP enables Fetch interception for configured hosts", () => {
  assert.deepEqual(claudeDesignCdpFetchPatterns({ hosts: ["claude.ai", "claude.ai", "claude.com"] }), [
    { requestStage: "Request", urlPattern: "https://claude.ai/*" },
    { requestStage: "Request", urlPattern: "http://claude.ai/*" },
    { requestStage: "Request", urlPattern: "https://claude.com/*" },
    { requestStage: "Request", urlPattern: "http://claude.com/*" }
  ]);
});
