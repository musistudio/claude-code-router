import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";
import { createDefaultAppConfig } from "../../packages/core/src/config/default-config.ts";
import {
  customUpstreamProxyFromConfig,
  upstreamProxyAuthorizationHeader,
  upstreamProxyUrl
} from "../../packages/core/src/proxy/system-proxy.ts";

test("custom upstream proxy config creates authenticated proxy URLs", () => {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  config.proxy.upstream = {
    custom: {
      password: "pa:ss",
      port: 8888,
      server: "http://proxy.example.com:8888",
      username: "alice@example.com"
    },
    mode: "custom"
  };

  const upstream = customUpstreamProxyFromConfig(config.proxy.upstream);
  assert.ok(upstream?.https);
  assert.equal(
    upstreamProxyUrl(upstream.https),
    "http://alice%40example.com:pa%3Ass@proxy.example.com:8888"
  );
  assert.equal(
    upstreamProxyAuthorizationHeader(upstream.https),
    `Basic ${Buffer.from("alice@example.com:pa:ss").toString("base64")}`
  );
});

test("none and incomplete custom upstream proxy configs do not create proxy servers", () => {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  config.proxy.upstream = {
    ...config.proxy.upstream,
    mode: "none"
  };
  assert.equal(customUpstreamProxyFromConfig(config.proxy.upstream), undefined);

  config.proxy.upstream = {
    custom: {
      password: "",
      port: 8888,
      server: "",
      username: ""
    },
    mode: "custom"
  };
  assert.equal(customUpstreamProxyFromConfig(config.proxy.upstream), undefined);
});
