---
title: Extension Mechanism
pageTitle: Extension Mechanism
eyebrow: Detailed Configuration
lead: Learn how CCR extensions are loaded, what they can register, and how to create, install, and debug your own extension.
---

## Extension Types

CCR has two extension layers:

| Type | Config location | Runtime | Good for |
| --- | --- | --- | --- |
| Wrapper plugin | `plugins` | CCR Desktop's Electron wrapper process | Local HTTP routes, local backends, proxy capture routing, built-in browser entries, provider account meters |
| Core gateway plugin | `providerPlugins` or `plugins[].coreGateway.providerPlugins` | core gateway runtime | Provider, auth, or internal core gateway behavior |

Most custom extensions should start as a Wrapper plugin. It receives CCR config, a private data directory, a logger, and registration helpers through `ctx`.

## Loading Flow

When the gateway starts, CCR reads the `plugins` array and processes each plugin whose `enabled !== false`:

1. It first applies `apps`, `proxy.routes`, `coreGateway.providerPlugins`, `coreGateway.virtualModelProfiles`, and `coreGateway.config` declared in config.
2. It then loads the plugin module. `module` must resolve to an explicit local JavaScript file path, such as an absolute path, a `~/` path, or a `./...` path relative to the CCR config directory.
3. Any extension that loads JavaScript with `module` must explicitly declare the `trusted-code` permission. Permissions are not an OS sandbox; they gate CCR plugin APIs and make code-execution trust explicit.
4. If `module` is missing, CCR does not load a built-in fallback. Marketplace installs download the selected plugin from the GitHub marketplace manifest into CCR's data directory and then write that local cached module path into config.
5. A module can export a function or an object with `setup(ctx)` or `activate(ctx)`.
6. On stop, CCR runs `stop` and `onStop` hooks in reverse order, then closes HTTP backends and SQLite stores registered by the plugin.

The extension marketplace is fetched from GitHub at startup/use time. The default manifest URL is `https://raw.githubusercontent.com/musistudio/claude-code-router/main/marketplace/plugins.json`; set `CCR_PLUGIN_MARKETPLACE_URL` to point CCR at another compatible HTTPS manifest. Marketplace module URLs must use HTTPS, and marketplace entries can include `integrity`, `sha256`, or `hash` with a SHA-256 digest.

Common module shape:

```js
"use strict";

module.exports = {
  async setup(ctx) {
    ctx.logger.info("extension loaded");
  },
  async stop() {
    // Optional: release resources owned by the extension.
  }
};
```

You can also export the setup function directly:

```js
"use strict";

module.exports = async function setup(ctx) {
  ctx.logger.info(`loaded ${ctx.pluginId}`);
};
```

`setup(ctx)` or `activate(ctx)` can call `ctx.register...` methods directly, or return a registration object. Returned registrations support `apps`, `gatewayRoutes`, `proxyRoutes`, `providerAccountConnectors`, `coreGateway`, `virtualModelProfiles`, `stop`, and `onStop`.

## ctx Reference

`setup(ctx)` receives these common fields and helpers:

| Field or method | Description |
| --- | --- |
| `ctx.pluginId` | Current plugin ID |
| `ctx.pluginConfig` | Custom value from `plugins[].config` |
| `ctx.config` | Current CCR AppConfig snapshot |
| `ctx.logger` | `debug/info/warn/error` logger prefixed with `[plugin:<id>]` |
| `ctx.paths.configDir` | CCR config directory |
| `ctx.paths.dataDir` | CCR data directory |
| `ctx.paths.pluginDataDir` | Private data directory for this plugin |
| `ctx.registerGatewayRoute(route)` | Register a local HTTP route on the CCR gateway |
| `ctx.registerHttpBackend(backend)` | Start a local HTTP backend and return `{ url, host, port }` |
| `ctx.registerProxyRoute(route)` | Route proxy-captured host/path traffic to a plugin backend or another upstream |
| `ctx.registerApp(app)` | Add an entry to the built-in browser app list |
| `ctx.openSqliteStore(options)` | Open a SQLite store under the plugin data directory |
| `ctx.registerProviderAccountConnector(connector)` | Register a provider balance or quota connector |
| `ctx.registerCoreGatewayProviderPlugin(plugin)` | Inject a provider plugin into the core gateway |
| `ctx.registerCoreGatewayVirtualModelProfile(profile)` | Inject a virtual model profile into the core gateway |

Gateway route handlers also receive helper functions:

| Helper | Description |
| --- | --- |
| `helpers.readBody(request)` | Read request body as a `Buffer` |
| `helpers.readJson(request)` | Read and parse JSON request body |
| `helpers.sendJson(response, statusCode, body)` | Send a JSON response |

`registerGatewayRoute` defaults to `auth: "gateway"`. If CCR has API keys configured, requests must include `Authorization: Bearer <key>` or `x-api-key: <key>`. Use `auth: "none"` only for debugging or local public status routes.

## Create Your First Extension

Create a directory such as `~/ccr-extensions/hello-extension`:

```text
hello-extension/
  plugin.json
  index.cjs
```

`plugin.json` lets CCR's local extension picker discover the extension ID, name, and entrypoint:

```json
{
  "id": "hello-extension",
  "name": "Hello Extension",
  "module": "index.cjs",
  "permissions": ["trusted-code", "gateway-routes", "http-backends", "proxy-routes"],
  "apps": [
    {
      "id": "hello-status",
      "name": "Hello Status",
      "url": "http://127.0.0.1:3456/plugins/hello"
    }
  ]
}
```

`index.cjs` registers a status route, an echo backend, and one proxy route:

```js
"use strict";

module.exports = {
  async setup(ctx) {
    ctx.registerGatewayRoute({
      auth: "none",
      id: "hello-status",
      method: "GET",
      path: "/plugins/hello",
      handler(_request, response, helpers) {
        helpers.sendJson(response, 200, {
          ok: true,
          plugin: ctx.pluginId,
          message: ctx.pluginConfig?.message || "hello from CCR"
        });
      }
    });

    const backend = await ctx.registerHttpBackend({
      id: "hello-echo",
      async handler(request, response, helpers) {
        const body = request.method === "POST"
          ? (await helpers.readBody(request)).toString("utf8")
          : "";

        helpers.sendJson(response, 200, {
          method: request.method,
          path: request.url,
          body
        });
      }
    });

    ctx.registerProxyRoute({
      host: "api.example.local",
      id: "hello-example-api",
      paths: ["/v1"],
      preserveHost: true,
      upstream: backend.url
    });

    ctx.logger.info(`hello backend listening at ${backend.url}`);
  }
};
```

This exposes:

- `GET /plugins/hello`: a route mounted directly on the CCR gateway to verify that the plugin loaded.
- A local echo backend: CCR assigns a free port automatically.
- A proxy rule: proxy-captured `api.example.local/v1...` traffic is forwarded to the echo backend.

## Install The Extension

The recommended flow is through the desktop UI:

1. Open **Extensions**.
2. Add an extension and choose a local extension directory.
3. Select the `hello-extension` directory.
4. Save the config.
5. Open **Server** and restart the gateway.

CCR stores runtime configuration in SQLite. Add extensions through the UI; the legacy JSON config file is kept here only as a reference. The extension entry has this shape:

```json
{
  "plugins": [
    {
      "id": "hello-extension",
      "enabled": true,
      "module": "/Users/you/ccr-extensions/hello-extension/index.cjs",
      "permissions": ["trusted-code", "gateway-routes", "http-backends", "proxy-routes"],
      "config": {
        "message": "hello from my config"
      }
    }
  ]
}
```

Restart the gateway after saving the extension config. See [Config Database Location](/en/configuration/configuration-file/).

The local directory picker recognizes entry metadata from:

- `plugin.json`
- `ccr-plugin.json`
- `.ccr-plugin/plugin.json`
- `.codex-plugin/plugin.json`
- `main`, `ccr.module`, or `ccrPlugin.module` in `package.json`

If no entrypoint is declared, CCR tries `index.cjs`, `index.mjs`, `index.js`, `plugin.cjs`, `plugin.mjs`, or `plugin.js` in the selected directory.

## Debug Extensions

### 1. Check syntax first

For CommonJS extensions:

```bash
node --check ~/ccr-extensions/hello-extension/index.cjs
```

If the extension depends on npm packages, install them in the extension directory and make sure Node can resolve the entrypoint.

### 2. Start CCR from source

From the CCR repository root:

```bash
npm install
npm run dev
```

`ctx.logger.info/warn/error` output appears in the terminal that started CCR, with a prefix such as `[plugin:hello-extension]`.

### 3. Verify the Gateway route

After the gateway starts, request the status route:

```bash
curl http://127.0.0.1:3456/plugins/hello
```

If the route uses the default `auth: "gateway"` and CCR has API keys configured:

```bash
curl -H "Authorization: Bearer <CCR_API_KEY>" http://127.0.0.1:3456/plugins/hello
```

You can also use:

```bash
curl -H "x-api-key: <CCR_API_KEY>" http://127.0.0.1:3456/plugins/hello
```

### 4. Verify the HTTP backend and proxy route

`registerHttpBackend` returns `backend.url`, which the example writes to logs. Request that URL directly first, then enable proxy mode and verify whether the target host/path hits `registerProxyRoute`.

Proxy route matching rules:

- `host` must match the target hostname. Exact host, `.example.com` suffix, and `*.example.com` wildcard patterns are supported.
- Empty `paths` matches all paths for that host.
- When multiple paths match, CCR chooses the longest path prefix.
- `stripPathPrefix` removes the matched prefix from the forwarded path.
- `rewritePathPrefix` replaces the matched prefix with a configured prefix.

### 5. Common Issues

| Symptom | What to check |
| --- | --- |
| Extension does not load | Check `plugins[].enabled`, `plugins[].module`, and terminal errors prefixed with `[plugin:<id>]` |
| `GET /plugins/hello` returns 404 | Restart the gateway and confirm `path` or `pathPrefix` starts with `/` |
| Response is 401 | Routes require gateway API key by default; set `auth: "none"` for debug routes |
| Code changes do not apply | Wrapper plugins are reloaded when the gateway restarts; restart CCR only if the process is stuck |
| Port is already in use | Omit `port` in `registerHttpBackend` so CCR can allocate one automatically |
| Proxy route misses requests | Confirm proxy mode is enabled, the certificate is installed, and host matches the real request hostname |

## Security Notes

- Use `auth: "none"` only for status pages, health checks, or local debugging routes.
- Do not log API keys, OAuth tokens, cookies, or complete request headers.
- Prefer `ctx.paths.pluginDataDir` for files written by your extension.
- Validate all external input returned by `readJson`.
- When proxying to external upstreams, handle headers explicitly so local auth material is not forwarded to untrusted services.
