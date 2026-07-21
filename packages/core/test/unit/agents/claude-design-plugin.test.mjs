import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Readable, Writable } from "node:stream";
import test from "node:test";

const require = createRequire(`${process.cwd()}/package.json`);

function loadClaudeDesignPlugin() {
  return require(`${process.cwd()}/examples/plugins/claude-design-plugin.cjs`);
}

test("Claude Design plugin derives gateway settings and keeps admin authenticated by default", async () => {
  const { apps, gatewayRoutes, proxyRoutes, setup } = await setupClaudeDesignPlugin();
  const adminRoute = gatewayRoutes.find((route) => route.id === "claude-design-admin");
  assert.equal(adminRoute?.auth, "gateway");

  assert.deepEqual(apps, [{
    description: "Open Claude Design in a dedicated CCR Electron window.",
    icon: "palette",
    id: "claude-design",
    name: "Claude Design",
    url: "https://claude.ai/design"
  }]);

  const proxyRoute = proxyRoutes.find((route) => route.id === "claude-design-proxy");
  assert.ok(proxyRoute);
  assert.equal(proxyRoute.paths.includes("/"), false);

  const adminPayload = await readAdminPayload(adminRoute);
  assert.equal(adminPayload.adminAuth, "gateway");
  assert.equal(adminPayload.requestLogging.enabled, false);
  assert.equal(adminPayload.gatewayUrl, "http://127.0.0.1:4567");
  assert.equal(adminPayload.defaultGatewayModel, "openai/gpt-5");
  assert.equal(adminPayload.proxy.paths.includes("/assets"), true);
  assert.equal(setup.store.database.runs.some((run) => run.sql.includes("claude_design_requests")), true);
});

test("Claude Design plugin keeps unsafe admin and request logs opt-in", async () => {
  const { gatewayRoutes } = await setupClaudeDesignPlugin({
    adminAuth: "none",
    requestLogging: true,
    requestLogLimit: 3,
    requestLogRetentionHours: 2
  });
  const adminRoute = gatewayRoutes.find((route) => route.id === "claude-design-admin");
  assert.equal(adminRoute?.auth, "none");

  const adminPayload = await readAdminPayload(adminRoute);
  assert.equal(adminPayload.adminAuth, "none");
  assert.deepEqual(adminPayload.requestLogging, {
    enabled: true,
    limit: 3,
    retentionMs: 2 * 60 * 60 * 1000
  });
});

test("Claude Design plugin returns an explicit error for unsupported RPCs", async () => {
  const { backends } = await setupClaudeDesignPlugin();
  const backend = backends.find((item) => item.id === "claude-design-mock");
  assert.ok(backend);

  const response = await callBackend(backend, {
    method: "POST",
    url: "/design/anthropic.omelette.api.v1alpha.OmeletteService/NotImplemented"
  });
  assert.equal(response.statusCode, 501, response.body);
  const payload = JSON.parse(response.body);
  assert.match(payload.error.message, /NotImplemented is not supported/);
});

async function setupClaudeDesignPlugin(pluginConfig = {}, configOverrides = {}) {
  const plugin = loadClaudeDesignPlugin();
  const apps = [];
  const gatewayRoutes = [];
  const proxyRoutes = [];
  const backends = [];
  const store = createStore();
  const config = {
    APIKEY: "test-key",
    APIKEYS: [{ key: "test-key" }],
    gateway: {
      generatedConfigFile: "/tmp/ccr-test-gateway.config.json",
      host: "0.0.0.0",
      port: 4567
    },
    PORT: 4567,
    preferredProvider: "openai",
    Providers: [{
      name: "openai",
      models: ["gpt-5"],
      type: "openai"
    }],
    Router: {},
    ...configOverrides
  };

  await plugin.setup({
    config,
    logger: createLogger(),
    paths: {
      configDir: "/tmp",
      dataDir: "/tmp",
      pluginDataDir: "/tmp/claude-design-test"
    },
    pluginConfig: {
      assetProxy: false,
      claudeAppAssets: false,
      ...pluginConfig
    },
    pluginId: "claude-design",
    permissions: ["trusted-code", "apps", "gateway-routes", "proxy-routes", "http-backends", "sqlite-store"],
    openSqliteStore: async (options = {}) => {
      await options.migrate?.(store.database);
      return store;
    },
    registerApp(app) {
      apps.push(app);
    },
    registerCoreGatewayProviderPlugin() {},
    registerCoreGatewayVirtualModelProfile() {},
    registerGatewayRoute(route) {
      gatewayRoutes.push(route);
    },
    async registerHttpBackend(backend) {
      backends.push(backend);
      return {
        host: "127.0.0.1",
        id: backend.id,
        port: 45678,
        url: "http://127.0.0.1:45678"
      };
    },
    registerProviderAccountConnector() {},
    registerProxyRoute(route) {
      proxyRoutes.push(route);
    }
  });

  return {
    apps,
    backends,
    gatewayRoutes,
    proxyRoutes,
    setup: { store }
  };
}

function createStore() {
  return {
    database: {
      runs: [],
      prepare(sql) {
        this.runs.push({ params: [], sql });
        return {
          bind() {},
          free() {},
          getAsObject() {
            return {};
          },
          step() {
            return false;
          }
        };
      },
      run(sql, params = []) {
        this.runs.push({ params, sql });
        return this;
      }
    },
    dbFile: "/tmp/claude-design.sqlite",
    persist() {}
  };
}

function createLogger() {
  return {
    debug() {},
    error() {},
    info() {},
    warn() {}
  };
}

async function readAdminPayload(route) {
  let result;
  await route.handler(
    { method: "GET", url: "/plugins/claude-design" },
    {},
    {
      readJson: async () => ({}),
      sendJson(_response, status, body) {
        result = { body, status };
      }
    }
  );
  assert.equal(result?.status, 200);
  return result.body;
}

async function callBackend(backend, { method, url, body = Buffer.alloc(0), headers = {} }) {
  const request = Readable.from(body.length ? [body] : []);
  request.method = method;
  request.url = url;
  request.headers = headers;
  const response = new CapturingResponse();
  await backend.handler(request, response);
  return response.result();
}

class CapturingResponse extends Writable {
  constructor() {
    super();
    this.chunks = [];
    this.headers = {};
    this.statusCode = 200;
  }

  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    this.headers = headers;
  }

  end(chunk) {
    if (chunk) {
      this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    super.end();
  }

  result() {
    return {
      body: Buffer.concat(this.chunks).toString("utf8"),
      headers: this.headers,
      statusCode: this.statusCode
    };
  }
}
