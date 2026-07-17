# Docker Deployment

[中文说明](#中文说明) · [Project documentation](https://ccrdesk.top/en/) · [GitHub](https://github.com/musistudio/claude-code-router)

The Docker image runs the CCR core server under PM2 and serves the built management UI through Nginx. Nginx is the only public container entrypoint: the browser UI, management RPC, gateway API, and health route all share one published port.

The image is intended for a persistent gateway and browser-based administration. It does not include Electron, the npm `ccr` command, system tray features, desktop Agent/App launching, automatic desktop updates, or desktop-only browser integrations.

## Architecture And Ports

```text
host:3458 -> container Nginx:8080
                         |-> static management UI
                         |-> management RPC: 127.0.0.1:3459
                         |-> gateway:       127.0.0.1:3456
                         `-> gateway core:  127.0.0.1:3457
```

Only Nginx port `8080` should be published. The three internal ports are container implementation details and should not be exposed individually.

Nginx routes:

| Public route | Purpose |
| --- | --- |
| `/` and `/pages/home/index.html` | Browser management UI. `/` redirects to a URL containing the management token. |
| `/api/ccr/rpc` | Authenticated management RPC. |
| `/health` | Gateway health, not container/UI health. It can return `502` until a provider and model are configured and the gateway starts. |
| `/v1/*`, `/v1beta/*`, `/messages`, `/chat/completions`, `/responses`, `/interactions`, `/mcp/*` | Supported model and MCP gateway requests. |

## Quick Start With Compose

From the repository root:

```sh
docker compose up -d --build
docker compose logs -f ccr
```

Open <http://127.0.0.1:3458>. On a new volume, the management UI is immediately available. Add a provider and model, create a CCR client key under **API Keys**, and start the gateway from **Server**.

The repository Compose file publishes `3458:8080`, stores data in the `ccr-data` named volume, and restarts the service unless explicitly stopped. A mapping without a host IP binds on every host interface. For local-only access, change it to:

```yaml
ports:
  - "127.0.0.1:3458:8080"
```

Stop or remove the container without deleting its named volume:

```sh
docker compose stop
docker compose down
```

Do not add `--volumes` to `docker compose down` unless you intentionally want to delete all persisted CCR data.

## `docker run`

Build and run without Compose:

```sh
docker build -t claude-code-router:local .
docker run -d \
  --name claude-code-router \
  --restart unless-stopped \
  -p 127.0.0.1:3458:8080 \
  -e CCR_PUBLIC_BASE_URL=http://127.0.0.1:3458 \
  -v ccr-data:/data \
  claude-code-router:local
```

Equivalent repository scripts are available:

```sh
npm run docker:build
npm run docker:run
```

`npm run docker:run` uses port `3458` and the `ccr-data` volume, but runs an ephemeral container without a fixed name or restart policy.

## Authentication And Network Security

There are two independent authentication layers:

1. `CCR_WEB_AUTH_TOKEN` protects management RPC. Nginx puts it into the management-page URL, and the browser sends it to RPC as `x-ccr-web-auth`.
2. CCR client API keys created in the **API Keys** page protect model gateway requests. These are separate from upstream provider credentials.

If `CCR_WEB_AUTH_TOKEN` is unset, the entrypoint generates a new random token on each container start. Opening `/` still works because Nginx redirects to a tokenized URL, but a stable token is recommended for persistent or remote deployments.

Avoid putting the token directly in shell history. Create a protected environment file instead:

```dotenv
CCR_WEB_AUTH_TOKEN=replace-with-a-long-random-value
CCR_PUBLIC_BASE_URL=http://127.0.0.1:3458
```

Then use it with `docker run --env-file` or map the same variables under the Compose service's `environment` section. Keep this file out of version control.

Security guidance:

- Bind the published port to `127.0.0.1` unless LAN or remote access is intentional.
- Never expose the management UI over untrusted networks without TLS, a firewall/private network, and a fixed strong management token.
- Treat tokenized management URLs as secrets; URLs may be recorded in browser history, proxy logs, screenshots, and support tickets.
- Create scoped CCR client API keys before exposing gateway routes. Do not reuse upstream provider credentials as client keys.
- Protect `/data` and its backups because they contain configuration, provider credentials, CCR client keys, request data, and generated certificates.

## Changing The Public Address

The host-facing URL is separate from the container's internal ports. Whenever the host port, hostname, or scheme changes, set `CCR_PUBLIC_BASE_URL` to the exact URL clients should use:

```yaml
services:
  ccr:
    ports:
      - "127.0.0.1:8088:8080"
    environment:
      CCR_PUBLIC_BASE_URL: http://127.0.0.1:8088
      CCR_WEB_AUTH_TOKEN: ${CCR_WEB_AUTH_TOKEN:?set CCR_WEB_AUTH_TOKEN}
```

`CCR_PUBLIC_BASE_URL` is written to CCR's public router endpoint. It does not publish a Docker port by itself.

For a reverse proxy or ingress that terminates HTTPS:

```yaml
services:
  ccr:
    ports:
      - "127.0.0.1:3458:8080"
    environment:
      CCR_PUBLIC_BASE_URL: https://ccr.example.com
      CCR_WEB_AUTH_TOKEN: ${CCR_WEB_AUTH_TOKEN:?set CCR_WEB_AUTH_TOKEN}
```

Proxy all paths to Nginx and preserve streaming. The external proxy should allow long-lived responses and should not buffer SSE/model streams. Keep the host port private when the reverse proxy is the public entrypoint.

## Persistent Data

The entrypoint sets `HOME=/data`, so CCR stores files under:

```text
/data/.claude-code-router/
├── config.sqlite
├── gateway.config.json
├── app-data/
│   ├── api-keys.sqlite
│   ├── request-logs.sqlite
│   ├── usage.sqlite
│   └── certs/
├── profiles/
└── bin/
```

Use a named volume unless a bind mount is operationally required. Bind mounts must be writable by the container and should not be shared by two running CCR containers.

The first-run bootstrap writes a minimal legacy `config.json` only when neither `config.json` nor `config.sqlite` exists. When the UI saves current settings, SQLite becomes authoritative. By default, every container start also synchronizes the stored gateway listener and `routerEndpoint` to the Docker public endpoint.

## Backup And Restore

The safest application-level backup is **Settings → Export data**. For a full volume backup, stop writes before copying the data directory:

```sh
docker compose stop ccr
docker compose cp ccr:/data/. ./ccr-data-backup/
docker compose start ccr
```

Keep the backup private. It contains secrets and may include request/response data.

For a full restore, use a new empty volume or empty `/data` directory, copy the backup contents into it while the CCR container is stopped, then start the container. Do not overlay an old backup onto a populated live volume: stale SQLite WAL/SHM files and newer runtime files can produce an inconsistent result. Make a second backup before replacing existing data.

## Upgrade And Rollback

Back up `/data`, update the source revision, rebuild with fresh base layers, and recreate the service:

```sh
git pull
docker compose build --pull
docker compose up -d
docker compose ps
docker compose logs --tail=200 ccr
```

Configuration migrations run against the persistent data. To roll back, use the previous image/source revision together with a backup created before the upgrade; do not assume a newer database can always be read by an older build.

## Environment Variables

Most deployments should set only `CCR_WEB_AUTH_TOKEN`, `CCR_PUBLIC_BASE_URL`, and the Docker port mapping. Internal listener values normally should remain unchanged.

| Variable | Default | Description |
| --- | --- | --- |
| `CCR_WEB_AUTH_TOKEN` | Random per container start | Management UI/RPC token. Set a stable strong value for persistent or remote use. |
| `CCR_PUBLIC_BASE_URL` | `http://127.0.0.1:3458` | Exact public gateway/UI base URL written into CCR configuration. Overrides `CCR_PUBLIC_HOST` and `CCR_PUBLIC_PORT`. |
| `CCR_PUBLIC_HOST` | `127.0.0.1` | Used only to derive `CCR_PUBLIC_BASE_URL` when the full URL is unset; it does not change Docker port publishing. |
| `CCR_PUBLIC_PORT` | `3458` | Used only to derive `CCR_PUBLIC_BASE_URL` when the full URL is unset. |
| `CCR_DATA_DIR` | `/data` | Container data root and process `HOME`. Mount persistent storage here. |
| `CCR_NGINX_PORT` | `8080` | Container-private Nginx listen port. Match the container side of the published mapping if changed. |
| `CCR_WEB_HOST` | `127.0.0.1` | Container-private management server host. |
| `CCR_WEB_PORT` | `3459` | Container-private management server port. |
| `CCR_GATEWAY_HOST` | `127.0.0.1` | Container-private gateway listener host. |
| `CCR_GATEWAY_PORT` | `3456` | Container-private gateway listener port used by Nginx. |
| `CCR_GATEWAY_CORE_PORT` | `3457` | Container-private core gateway runtime port. |
| `CCR_NO_GATEWAY` | `0` | Set to `1`, `true`, or `yes` to run the management UI without starting the gateway at boot. |
| `CCR_DOCKER_INIT_CONFIG` | `1` | Set to `0` to disable minimal first-run `config.json` bootstrap. |
| `CCR_DOCKER_SYNC_PUBLIC_ENDPOINT` | `1` | Set to `0` to stop startup from syncing existing JSON/SQLite listener and public endpoint fields to Docker values. |

Changing internal ports requires corresponding Nginx/PM2 variables and offers no benefit in normal deployments. Publish only `CCR_NGINX_PORT`.

## Build Options And Smoke Test

The Dockerfile builds native dependencies with `node:22-bookworm`, then copies production dependencies and built assets into `node:22-bookworm-slim`. Override the base images when required:

```sh
docker build \
  --build-arg NODE_IMAGE=node:22-bookworm \
  --build-arg RUNTIME_NODE_IMAGE=node:22-bookworm-slim \
  -t claude-code-router:local .
```

Run the isolated Docker smoke test:

```sh
npm run test:docker
```

The test builds the image, starts a temporary container and volume, verifies that only Nginx is published, checks UI/RPC authentication, tests public-endpoint migration, starts a configured gateway, checks `/health`, and removes its resources. Set `CCR_DOCKER_TEST_SKIP_BUILD=1` to reuse an existing image or `CCR_DOCKER_TEST_IMAGE` to test a different local tag.

## Operations And Troubleshooting

Useful commands:

```sh
docker compose ps
docker compose logs -f ccr
docker compose restart ccr
docker compose config
```

### `/` returns `302`

This is expected. Nginx redirects the root URL to the management page and URL-encodes the management token.

### `/health` returns `502`

`/health` checks the model gateway, not Nginx or the management UI. On a fresh volume it returns `502` until a provider/model exists and the gateway has started. Use `docker compose ps` for container health and open the UI to configure/start the gateway.

### The UI returns `401` after a token change

Open the bare root URL again so Nginx creates a URL with the current token. Close stale tabs and avoid bookmarks that contain an old `ccr_web_token`.

### Clients still use the old port or hostname

Update `CCR_PUBLIC_BASE_URL` and recreate the container. Leave `CCR_DOCKER_SYNC_PUBLIC_ENDPOINT=1` so existing SQLite configuration is synchronized at startup.

### Configuration disappears after recreation

Confirm that `/data` is mounted and that the same named volume or bind-mount path is being reused. `docker compose down` keeps named volumes; `docker compose down --volumes` deletes them.

### A bind mount fails with permission errors

Verify that the host directory exists, is writable by the container, and is not mounted read-only. Named volumes avoid most host ownership and labeling issues.

### The container is healthy but model requests fail

Container health only verifies Nginx/UI reachability. Check **Server** status, provider connectivity, CCR client-key authentication, routing, and request logs. Then inspect `docker compose logs --tail=200 ccr` for startup or runtime errors.

---

## 中文说明

Docker 镜像通过 PM2 运行 CCR Core，并由 Nginx 同时提供管理 UI、管理 RPC、模型网关和健康检查。对外只应发布 Nginx 的容器端口 `8080`；`3459`、`3456`、`3457` 都是容器内部实现端口，不应单独暴露。

这个镜像面向常驻网关和浏览器管理，不包含 Electron、npm 的 `ccr` 命令、系统托盘、桌面 Agent/App 启动、桌面自动更新和桌面专属浏览器集成。

### 快速启动

```sh
docker compose up -d --build
docker compose logs -f ccr
```

打开 <http://127.0.0.1:3458>。首次启动时管理 UI 可以立即访问；添加供应商和模型、在 **API 密钥** 页面创建 CCR 客户端 Key，然后从 **服务** 页面启动网关。

仓库默认映射是 `3458:8080`，会监听宿主机所有网卡。如果只允许本机访问，请改为：

```yaml
ports:
  - "127.0.0.1:3458:8080"
```

### 鉴权与远程访问

- `CCR_WEB_AUTH_TOKEN` 用于管理 UI / RPC；不设置时，每次容器启动都会生成新的随机 Token。
- **API 密钥** 页面创建的 CCR 客户端 Key 用于模型网关请求。
- 上游供应商凭据是第三类凭据，不应拿来代替 CCR 客户端 Key。

根路径会重定向到包含 `ccr_web_token` 的管理 URL。请把该 URL 当作密码。远程部署至少应使用固定强 Token、TLS、主机防火墙或私网，并让反向代理把全部路径转发到 Nginx。流式响应和 SSE 不应被代理缓冲。

外部端口、域名或协议变化时，必须同步设置公开地址：

```yaml
environment:
  CCR_PUBLIC_BASE_URL: https://ccr.example.com
  CCR_WEB_AUTH_TOKEN: ${CCR_WEB_AUTH_TOKEN:?set CCR_WEB_AUTH_TOKEN}
```

`CCR_PUBLIC_BASE_URL` 只负责写入客户端应使用的公开地址，不会自动发布 Docker 端口。

### 数据、备份与升级

数据实际位于 `/data/.claude-code-router/`，其中包括 `config.sqlite`、`app-data/`、Agent 配置和生成文件。优先使用命名卷，不要让两个运行中的 CCR 容器共享同一个数据目录。

完整文件备份前先停止写入：

```sh
docker compose stop ccr
docker compose cp ccr:/data/. ./ccr-data-backup/
docker compose start ccr
```

备份包含密钥和请求数据，必须按敏感数据保存。恢复时应复制到新的空卷或空 `/data`，不要把旧备份覆盖到仍有新数据的目录。升级前先备份，然后执行：

```sh
git pull
docker compose build --pull
docker compose up -d
docker compose ps
docker compose logs --tail=200 ccr
```

### 常见排查

- `/` 返回 `302`：正常，Nginx 正在跳转到带管理 Token 的页面。
- `/health` 返回 `502`：它检查的是模型网关；首次启动尚未配置模型时属于预期行为。
- 修改 Token 后 UI 返回 `401`：重新打开不带参数的根地址，关闭仍使用旧 Token 的标签页。
- 重建后配置消失：检查是否仍挂载同一个 `/data` 卷；`docker compose down --volumes` 会删除数据卷。
- 容器健康但模型请求失败：继续检查服务状态、供应商连通性、CCR 客户端 Key、路由和请求日志；容器健康只表示 Nginx / UI 可访问。

完整的环境变量、端口拓扑、远程部署、构建参数和烟雾测试说明见本页英文主体，对应变量名和命令在中英文环境中完全相同。
