import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test, { before } from "node:test";

const root = path.join(process.env.CCR_INTERNAL_HOME_DIR || os.tmpdir(), `opencode-go-usage-${process.pid}`);
process.env.CCR_INTERNAL_HOME_DIR = path.join(root, "home");
process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(root, "app-data");
process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(root, "user-data");

let configApi;
let accountApi;
before(async () => {
  configApi = await import("@ccr/core/config/config.ts");
  accountApi = await import("@ccr/core/providers/account-service.ts");
});

test("OpenCode Go standard usage mode resolves the official usage endpoint", async (t) => {
  const previousFetch = globalThis.fetch;
  let authorization = "";
  let requestUrl = "";
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    authorization = init?.headers?.authorization ?? "";
    return new Response(JSON.stringify({
      usage: {
        rolling: { percent: 5, resetsAt: "2026-09-11T20:00:00.000Z", status: "ok" },
        weekly: { percent: 10, resetsAt: "2026-09-14T00:00:00.000Z", status: "ok" },
        monthly: { percent: 20, resetsAt: "2026-10-01T00:00:00.000Z", status: "ok" }
      }
    }), { headers: { "content-type": "application/json" }, status: 200 });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const providerName = "OpenCode Go Standard Usage";
  const config = await configApi.loadAppConfig();
  await configApi.saveAppConfig({
    ...config,
    Providers: [
      ...config.Providers,
      {
        account: { connectors: [{ auth: "provider-api-key", type: "standard" }], enabled: true },
        api_base_url: "https://opencode.ai/zen/go/v1",
        api_key: "opencode-go-usage-key",
        models: ["kimi-k2.7-code"],
        name: providerName,
        type: "openai_chat_completions"
      }
    ]
  });
  accountApi.invalidateProviderAccountSnapshotCache(providerName);

  const [snapshot] = await accountApi.getProviderAccountSnapshots(providerName, { forceRefresh: true });
  assert.equal(requestUrl, "https://opencode.ai/zen/go/v1/usage");
  assert.equal(authorization, "Bearer opencode-go-usage-key");
  assert.equal(snapshot?.source, "http-json");
  assert.deepEqual(snapshot?.meters.map((meter) => [meter.id, meter.remaining]), [
    ["opencode_go_5h", 95],
    ["opencode_go_weekly", 90],
    ["opencode_go_monthly", 80]
  ]);
});

test("OpenCode Go usage mode feeds the imported local agent key to the usage request", async (t) => {
  const previousFetch = globalThis.fetch;
  let authorization = "";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://opencode.ai/zen/go/v1/usage");
    authorization = init?.headers?.authorization ?? "";
    return new Response(JSON.stringify({
      usage: {
        rolling: { percent: 1, status: "ok" },
        weekly: { percent: 2, status: "ok" },
        monthly: { percent: 3, status: "ok" }
      }
    }), { headers: { "content-type": "application/json" }, status: 200 });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const providerName = "OpenCode Go Local Agent Usage";
  const config = await configApi.loadAppConfig();
  await configApi.saveAppConfig({
    ...config,
    Providers: [
      ...config.Providers,
      {
        account: { connectors: [{ auth: "provider-api-key", type: "standard" }], enabled: true },
        api_base_url: "https://opencode.ai/zen/go/v1",
        api_key: "ccr-local-agent-login",
        models: ["minimax-m3"],
        name: providerName,
        type: "anthropic_messages"
      }
    ],
    providerPlugins: [
      ...(config.providerPlugins ?? []),
      {
        auth: { headers: { "x-api-key": "opencode-go-live-key" }, removeHeaders: ["authorization"], strict: true },
        key: "ccr-local-agent-opencode-go-anthropic-messages-opencode-go-anthropic-messages-api-key",
        providerName: `${providerName}::anthropic_messages`
      }
    ]
  });
  accountApi.invalidateProviderAccountSnapshotCache(providerName);

  const [snapshot] = await accountApi.getProviderAccountSnapshots(providerName, { forceRefresh: true });
  assert.equal(authorization, "Bearer opencode-go-live-key");
  assert.equal(snapshot?.status, "ok");
  assert.equal(snapshot?.meters.length, 3);
});
