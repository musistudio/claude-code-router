---
title: 扩展机制
pageTitle: 扩展机制
eyebrow: 详细配置
lead: 了解 CCR 扩展如何加载、能注册哪些能力，并从零创建、安装和调试自己的扩展。
---

## 扩展类型

CCR 的扩展分为两层：

| 类型 | 配置位置 | 运行位置 | 适合做什么 |
| --- | --- | --- | --- |
| Wrapper plugin | `plugins` | CCR Desktop 的 Electron wrapper 进程 | 注册本地 HTTP 路由、启动本地后端、拦截代理流量、添加内置浏览器入口、连接 Provider 账号用量 |
| Core gateway plugin | `providerPlugins` 或 `plugins[].coreGateway.providerPlugins` | core gateway runtime | 扩展上游 Provider、认证方式或 core gateway 内部能力 |

多数用户自定义扩展应从 Wrapper plugin 开始。它能拿到 CCR 配置、私有数据目录和日志对象，并通过 `ctx` 注册能力。

## 加载机制

启动网关时，CCR 会读取配置里的 `plugins` 数组，并按顺序处理每个 `enabled !== false` 的扩展：

1. 先应用配置中声明的 `apps`、`proxy.routes`、`coreGateway.providerPlugins`、`coreGateway.virtualModelProfiles` 和 `coreGateway.config`。
2. 再加载扩展模块。`module` 可以是绝对路径、`~/` 开头路径、相对配置目录的 `./...` 路径，或 Node 可以解析到的包名。
3. 如果没有配置 `module`，CCR 会尝试用扩展 `id` 匹配内置市场扩展，例如 `claude-design` 和 `cursor-proxy`。
4. 模块可以导出函数，也可以导出包含 `setup(ctx)` 或 `activate(ctx)` 的对象。
5. 扩展停止时，CCR 会反向执行 `stop`、`onStop` 钩子，并关闭该扩展注册的 HTTP 后端和 SQLite store。

扩展模块常见导出形式：

```js
"use strict";

module.exports = {
  async setup(ctx) {
    ctx.logger.info("extension loaded");
  },
  async stop() {
    // 可选：释放扩展自己持有的资源。
  }
};
```

也可以直接导出函数：

```js
"use strict";

module.exports = async function setup(ctx) {
  ctx.logger.info(`loaded ${ctx.pluginId}`);
};
```

`setup(ctx)` 或 `activate(ctx)` 可以直接调用 `ctx.register...` 方法，也可以返回注册对象。返回对象支持 `apps`、`gatewayRoutes`、`proxyRoutes`、`providerAccountConnectors`、`coreGateway`、`virtualModelProfiles`、`stop` 和 `onStop`。

## ctx 能力参考

`setup(ctx)` 的 `ctx` 包含这些常用字段和方法：

| 字段或方法 | 说明 |
| --- | --- |
| `ctx.pluginId` | 当前扩展 ID |
| `ctx.pluginConfig` | `plugins[].config` 中的自定义配置 |
| `ctx.config` | 当前 CCR AppConfig 快照 |
| `ctx.logger` | 带 `[plugin:<id>]` 前缀的 `debug/info/warn/error` 日志 |
| `ctx.paths.configDir` | CCR 配置目录 |
| `ctx.paths.dataDir` | CCR 数据目录 |
| `ctx.paths.pluginDataDir` | 当前扩展专属数据目录 |
| `ctx.registerGatewayRoute(route)` | 在 CCR 网关上注册本地 HTTP 路由 |
| `ctx.registerHttpBackend(backend)` | 启动一个本地 HTTP 后端，返回 `{ url, host, port }` |
| `ctx.registerProxyRoute(route)` | 把代理模式捕获到的某个 host/path 转发到扩展后端或其他 upstream |
| `ctx.registerApp(app)` | 在内置浏览器应用列表里添加入口 |
| `ctx.openSqliteStore(options)` | 在扩展数据目录打开 SQLite store |
| `ctx.registerProviderAccountConnector(connector)` | 注册 Provider 账号余额或额度读取器 |
| `ctx.registerCoreGatewayProviderPlugin(plugin)` | 向 core gateway 注入 provider plugin |
| `ctx.registerCoreGatewayVirtualModelProfile(profile)` | 向 core gateway 注入虚拟模型配置 |

Gateway route handler 会额外收到 helper：

| Helper | 说明 |
| --- | --- |
| `helpers.readBody(request)` | 读取请求 body，返回 `Buffer` |
| `helpers.readJson(request)` | 读取并解析 JSON body |
| `helpers.sendJson(response, statusCode, body)` | 返回 JSON 响应 |

`registerGatewayRoute` 默认使用 `auth: "gateway"`。如果 CCR 配置了 API Key，请求必须带 `Authorization: Bearer <key>` 或 `x-api-key: <key>`。仅调试或本地公开状态页建议使用 `auth: "none"`。

## 创建第一个扩展

创建一个目录，例如 `~/ccr-extensions/hello-extension`：

```text
hello-extension/
  plugin.json
  index.cjs
```

`plugin.json` 用于让 CCR 的本地扩展选择器识别扩展 ID、名称和入口文件：

```json
{
  "id": "hello-extension",
  "name": "Hello Extension",
  "module": "index.cjs",
  "apps": [
    {
      "id": "hello-status",
      "name": "Hello Status",
      "url": "http://127.0.0.1:3456/plugins/hello"
    }
  ]
}
```

`index.cjs` 注册一个状态路由、一个 echo 后端，以及一个代理转发规则：

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

这个扩展会暴露：

- `GET /plugins/hello`：直接挂在 CCR 网关上，用来验证扩展是否加载。
- 一个本地 echo 后端：由 CCR 自动分配端口。
- 一个代理规则：当代理模式捕获到 `api.example.local/v1...` 时转发到 echo 后端。

## 安装扩展

推荐使用桌面 UI 安装本地扩展：

1. 打开 **Extensions** 页面。
2. 点击添加扩展，选择本地扩展目录。
3. 选择刚创建的 `hello-extension` 目录。
4. 保存配置。
5. 打开 **Server** 页面，重启网关。

CCR 的运行配置存储在 SQLite 中。请通过 UI 添加扩展；旧版 JSON 配置文件仅用于参考。扩展条目的配置结构如下：

```json
{
  "plugins": [
    {
      "id": "hello-extension",
      "enabled": true,
      "module": "/Users/you/ccr-extensions/hello-extension/index.cjs",
      "config": {
        "message": "hello from my config"
      }
    }
  ]
}
```

`coreGateway.config` 也是写入 core gateway 高级配置的推荐位置。CCR 启动网关时会把这个对象合并到生成的 core gateway 配置中。不要直接编辑生成出来的 `gateway.config.json`；该文件会被 CCR 重写，手动修改会在重启后丢失。

例如，扩展或持久化插件条目可以这样调整上游重试行为，而不需要修改生成文件：

```json
{
  "plugins": [
    {
      "id": "advanced-core-gateway",
      "enabled": true,
      "coreGateway": {
        "config": {
          "upstreamRetry": {
            "enabled": true,
            "maxAttempts": 2,
            "baseDelayMs": 300,
            "maxDelayMs": 1000,
            "backoffMultiplier": 2,
            "jitterMs": 200,
            "retryStatusCodes": [429, 500, 502, 503, 504]
          }
        }
      }
    }
  ]
}
```

保存扩展配置后需要重启网关。配置数据库位置见 [配置数据库位置](/configuration/config-file/)。

本地目录选择器会按顺序识别这些入口信息：

- `plugin.json`
- `ccr-plugin.json`
- `.ccr-plugin/plugin.json`
- `.codex-plugin/plugin.json`
- `package.json` 里的 `main`、`ccr.module` 或 `ccrPlugin.module`

如果没有显式入口文件，CCR 会尝试目录里的 `index.cjs`、`index.mjs`、`index.js`、`plugin.cjs`、`plugin.mjs` 或 `plugin.js`。

## 调试扩展

### 1. 先做语法检查

CommonJS 扩展可以运行：

```bash
node --check ~/ccr-extensions/hello-extension/index.cjs
```

如果扩展依赖 npm 包，先在扩展目录安装依赖，并确保入口文件能被 Node 解析。

### 2. 用源码模式启动 CCR

在 CCR 仓库根目录运行：

```bash
npm install
npm run dev
```

扩展里的 `ctx.logger.info/warn/error` 会出现在启动 CCR 的终端中，前缀类似 `[plugin:hello-extension]`。

### 3. 验证 Gateway route

启动网关后，请求状态路由：

```bash
curl http://127.0.0.1:3456/plugins/hello
```

如果路由使用默认的 `auth: "gateway"`，并且 CCR 已配置 API Key：

```bash
curl -H "Authorization: Bearer <CCR_API_KEY>" http://127.0.0.1:3456/plugins/hello
```

也可以使用：

```bash
curl -H "x-api-key: <CCR_API_KEY>" http://127.0.0.1:3456/plugins/hello
```

### 4. 验证 HTTP 后端和代理规则

`registerHttpBackend` 返回的 `backend.url` 会写入日志。先直接请求这个地址，确认后端工作正常；再开启代理模式，验证目标 host/path 是否被 `registerProxyRoute` 命中。

代理规则匹配逻辑：

- `host` 必须匹配目标 hostname，支持精确 host、`.example.com` 后缀和 `*.example.com` 通配。
- `paths` 为空时匹配该 host 的所有路径。
- 多个路径匹配时，CCR 会选最长的 path prefix。
- `stripPathPrefix` 会从转发路径中移除匹配前缀。
- `rewritePathPrefix` 会把匹配前缀替换成指定前缀。

### 5. 常见问题

| 现象 | 排查方向 |
| --- | --- |
| 扩展没有加载 | 检查 `plugins[].enabled`、`plugins[].module` 路径和终端里的 `[plugin:<id>]` 报错 |
| `GET /plugins/hello` 返回 404 | 确认网关已重启，路由 `path` 或 `pathPrefix` 是否以 `/` 开头 |
| 返回 401 | 路由默认需要 gateway API Key；调试路由可显式设置 `auth: "none"` |
| 修改代码不生效 | Wrapper plugin 不会热重载，修改后需要重启网关或重启 CCR |
| 端口被占用 | `registerHttpBackend` 不传 `port` 会自动分配端口；固定端口冲突时改回自动分配 |
| 代理规则不命中 | 检查代理模式是否开启、证书是否安装、host 是否匹配真实请求的 hostname |

## 安全建议

- 只有状态页、健康检查或本机调试路由才使用 `auth: "none"`。
- 不要在日志里打印 API Key、OAuth token、Cookie 或完整请求头。
- 扩展写入文件时优先使用 `ctx.paths.pluginDataDir`。
- 对 `readJson` 得到的外部输入做类型校验。
- 代理转发到外部 upstream 时，明确处理 header 白名单，避免把本地鉴权信息转发到不可信服务。
