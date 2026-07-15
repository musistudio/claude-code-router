---
title: Docker 部署
pageTitle: Docker 部署
eyebrow: 快速开始
lead: 使用 Nginx 单入口运行 CCR Core 和浏览器管理界面，并正确处理端口、鉴权、持久化、远程访问、备份和升级。
---

## 适用范围与限制

Docker 镜像适合常驻模型网关和浏览器管理。它包含 CCR Core、构建后的管理 UI、PM2 和 Nginx，但不包含：

- Electron 桌面应用、系统托盘和桌面通知；
- npm 发行版的 `ccr` 命令；
- 从容器中启动宿主机 Claude App、ChatGPT、ZCode 等桌面 App；
- 桌面自动更新和桌面专属的内置浏览器集成。

如果主要需求是本机 Agent 多开、托盘或桌面 App 启动，请使用桌面版；如果需要终端命令但不需要容器，请使用 [CLI](../cli/)。

## 进程和端口拓扑

```text
宿主机 3458 -> 容器 Nginx 8080
                           |-> 静态管理 UI
                           |-> 管理 RPC：127.0.0.1:3459
                           |-> 模型网关：127.0.0.1:3456
                           `-> Core Runtime：127.0.0.1:3457
```

只应发布 Nginx 的容器端口 `8080`。`3459`、`3456`、`3457` 都是容器内部实现端口，不要分别映射到宿主机。

Nginx 对外提供：

| 路径 | 用途 |
| --- | --- |
| `/`、`/pages/home/index.html` | 管理 UI。根路径会跳转到带管理 Token 的页面。 |
| `/api/ccr/rpc` | 需要管理 Token 的管理 RPC。 |
| `/health` | 模型网关健康状态，不是容器或 UI 健康状态。 |
| `/v1/*`、`/v1beta/*`、`/messages`、`/chat/completions`、`/responses`、`/interactions`、`/mcp/*` | 模型和 MCP 网关接口。 |

## 使用 Compose 快速启动

在仓库根目录执行：

```sh
docker compose up -d --build
docker compose logs -f ccr
```

打开 <http://127.0.0.1:3458>。新数据卷上管理 UI 会立即可用；模型网关要在添加供应商和模型后才能正常启动。

首次配置顺序：

1. 添加供应商和至少一个模型。
2. 在 **API 密钥** 页面创建 CCR 客户端 Key。
3. 在 **服务** 页面启动网关。
4. 请求 `/health`，确认返回 `200` 和运行状态。
5. 把客户端 Base URL 指向 `http://127.0.0.1:3458`，并使用刚创建的 CCR 客户端 Key。

停止或移除容器不会自动删除命名卷：

```sh
docker compose stop
docker compose down
```

不要给 `docker compose down` 添加 `--volumes`，除非你明确要删除全部 CCR 数据。

## 只允许本机访问

仓库默认映射 `3458:8080` 会监听宿主机所有网卡。如果只从当前机器访问，修改为：

```yaml
services:
  ccr:
    ports:
      - "127.0.0.1:3458:8080"
```

端口映射左侧是宿主机地址和端口，右侧是 Nginx 容器端口。不要把右侧改为内部网关的 `3456`。

## 使用 `docker run`

不使用 Compose 时：

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

仓库也提供 `npm run docker:build` 和 `npm run docker:run`。后者使用 `3458` 和 `ccr-data`，但容器带 `--rm`，没有固定名称和自动重启策略，更适合临时验证。

## 三类凭据不要混用

| 凭据 | 用途 | 配置位置 |
| --- | --- | --- |
| `CCR_WEB_AUTH_TOKEN` | 管理 UI / RPC 鉴权 | 容器环境变量 |
| CCR 客户端 API Key | 模型网关请求鉴权 | UI 的 **API 密钥** 页面 |
| 上游供应商凭据 | CCR 调用模型供应商 | UI 的 **供应商** 页面 |

不设置 `CCR_WEB_AUTH_TOKEN` 时，EntryPoint 每次启动容器都会生成新的随机 Token。打开根地址仍可工作，因为 Nginx 会跳转到包含当前 Token 的 URL；但持久部署和远程部署应固定一个足够长的强 Token。

不要把 Token 直接写进 Shell 历史。可以创建不进入版本控制的环境文件：

```dotenv
CCR_WEB_AUTH_TOKEN=replace-with-a-long-random-value
CCR_PUBLIC_BASE_URL=http://127.0.0.1:3458
```

通过 `docker run --env-file` 使用，或把同名变量映射到 Compose 服务的 `environment`。包含 `ccr_web_token` 的完整管理 URL 也应按密码保护，因为它可能出现在浏览器历史、反向代理日志、截图和工单中。

## 修改外部端口或地址

宿主机对外地址与容器内部端口是两层配置。修改宿主机端口时，还要把 `CCR_PUBLIC_BASE_URL` 设置为客户端真实使用的完整地址：

```yaml
services:
  ccr:
    ports:
      - "127.0.0.1:8088:8080"
    environment:
      CCR_PUBLIC_BASE_URL: http://127.0.0.1:8088
      CCR_WEB_AUTH_TOKEN: ${CCR_WEB_AUTH_TOKEN:?set CCR_WEB_AUTH_TOKEN}
```

`CCR_PUBLIC_BASE_URL` 会同步到 CCR 的公开 Router Endpoint。它本身不会发布 Docker 端口，也不会改变 Nginx 监听地址。

## 域名、HTTPS 与反向代理

由反向代理或 Ingress 终止 TLS 时：

```yaml
services:
  ccr:
    ports:
      - "127.0.0.1:3458:8080"
    environment:
      CCR_PUBLIC_BASE_URL: https://ccr.example.com
      CCR_WEB_AUTH_TOKEN: ${CCR_WEB_AUTH_TOKEN:?set CCR_WEB_AUTH_TOKEN}
```

反向代理应把全部路径交给 CCR Nginx，并满足：

- 支持长时间模型请求；
- 不缓冲 SSE 和流式模型响应；
- 允许足够的请求体大小；
- 只有反向代理入口对外公开，宿主机 `3458` 保持仅本机监听；
- 配合防火墙、VPN / 私网或额外访问控制，避免管理界面直接暴露到不可信网络。

## 持久化目录

EntryPoint 会设置 `HOME=/data`，实际数据位于：

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

优先使用命名卷。Bind Mount 目录必须允许容器写入，而且不能让两个运行中的 CCR 容器共享同一份数据。

全新数据目录中既没有 `config.json` 也没有 `config.sqlite` 时，EntryPoint 默认写入最小的旧格式 `config.json` 作为首次引导。UI 保存后 SQLite 成为权威配置。每次启动默认还会把 JSON / SQLite 中的网关监听字段和 `routerEndpoint` 同步到当前 Docker 公开地址。

## 备份与恢复

应用级备份优先使用 **Settings → Export data**。做完整文件备份时，先停止写入：

```sh
docker compose stop ccr
docker compose cp ccr:/data/. ./ccr-data-backup/
docker compose start ccr
```

备份包含供应商凭据、CCR 客户端 Key，并可能包含请求 / 响应数据，必须按敏感数据保存。

完整恢复时，应把备份复制到新的空卷或空 `/data` 目录，并确保容器已停止。不要把旧备份直接覆盖到仍有新数据的活动目录，否则旧 SQLite WAL / SHM 和新运行文件可能混合。替换现有数据前再做一份备份。

## 升级与回滚

先备份 `/data`，再更新源码、刷新基础镜像并重建：

```sh
git pull
docker compose build --pull
docker compose up -d
docker compose ps
docker compose logs --tail=200 ccr
```

升级会对持久化数据执行当前版本需要的迁移。回滚时应同时使用旧镜像 / 旧源码和升级前备份，不要假设旧版本一定能读取新版本数据库。

## 环境变量完整参考

一般部署只需要设置 `CCR_WEB_AUTH_TOKEN`、`CCR_PUBLIC_BASE_URL` 和 Docker Port Mapping。内部监听变量通常不需要修改。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CCR_WEB_AUTH_TOKEN` | 每次启动随机生成 | 管理 UI / RPC Token。持久或远程部署应设置固定强值。 |
| `CCR_PUBLIC_BASE_URL` | `http://127.0.0.1:3458` | 写入 CCR 配置的完整公开地址；设置后优先于 Public Host / Port。 |
| `CCR_PUBLIC_HOST` | `127.0.0.1` | 仅在没有完整公开 URL 时用于拼接公开地址，不会改变 Docker 端口绑定。 |
| `CCR_PUBLIC_PORT` | `3458` | 仅在没有完整公开 URL 时用于拼接公开地址。 |
| `CCR_DATA_DIR` | `/data` | 数据根目录，同时作为进程 `HOME`。 |
| `CCR_NGINX_PORT` | `8080` | Nginx 容器内监听端口，应与 Port Mapping 右侧一致。 |
| `CCR_WEB_HOST` | `127.0.0.1` | 管理服务容器内监听地址。 |
| `CCR_WEB_PORT` | `3459` | 管理服务容器内端口。 |
| `CCR_GATEWAY_HOST` | `127.0.0.1` | 模型网关容器内监听地址。 |
| `CCR_GATEWAY_PORT` | `3456` | Nginx 转发到的模型网关容器内端口。 |
| `CCR_GATEWAY_CORE_PORT` | `3457` | Core Gateway Runtime 容器内端口。 |
| `CCR_NO_GATEWAY` | `0` | 设为 `1`、`true` 或 `yes` 时，启动阶段只运行管理 UI。 |
| `CCR_DOCKER_INIT_CONFIG` | `1` | 设为 `0` 时禁用首次最小 `config.json` 引导。 |
| `CCR_DOCKER_SYNC_PUBLIC_ENDPOINT` | `1` | 设为 `0` 时不再在启动时同步已有 JSON / SQLite 的监听和公开地址字段。 |

修改内部端口需要同时保证 PM2 和 Nginx 变量一致，正常部署没有收益。对外仍然只发布 `CCR_NGINX_PORT`。

## 构建和烟雾测试

默认使用 `node:22-bookworm` 构建原生依赖，再把生产依赖和构建产物复制到 `node:22-bookworm-slim`。需要替换基础镜像时：

```sh
docker build \
  --build-arg NODE_IMAGE=node:22-bookworm \
  --build-arg RUNTIME_NODE_IMAGE=node:22-bookworm-slim \
  -t claude-code-router:local .
```

运行 Docker 烟雾测试：

```sh
npm run test:docker
```

测试会创建临时容器和数据卷，检查单一 Nginx 端口、UI / RPC 鉴权、公开地址迁移、网关启动和 `/health`，最后自动清理。使用 `CCR_DOCKER_TEST_SKIP_BUILD=1` 复用已有镜像，或通过 `CCR_DOCKER_TEST_IMAGE` 指定本地 Tag。

## 日常运维命令

```sh
docker compose ps
docker compose logs -f ccr
docker compose restart ccr
docker compose config
```

`docker compose ps` 显示的是容器健康；`/health` 显示的是模型网关健康。两者不能互相替代。

## 常见问题

### 根地址返回 `302`

这是正常行为。Nginx 正在把根地址跳转到带 URL 编码管理 Token 的页面。

### `/health` 返回 `502`

它检查模型网关，不检查 Nginx 或 UI。新数据卷尚未配置供应商 / 模型时会返回 `502`。先打开 UI 完成配置并启动网关。

### 修改 Token 后 UI 返回 `401`

重新打开不带参数的根地址，让 Nginx 生成包含新 Token 的 URL；关闭仍使用旧 `ccr_web_token` 的标签页和书签。

### 客户端仍使用旧端口或域名

更新 `CCR_PUBLIC_BASE_URL` 并重新创建容器。保持 `CCR_DOCKER_SYNC_PUBLIC_ENDPOINT=1`，让已有 SQLite 配置在启动时同步。

### 重建后配置消失

确认 `/data` 仍挂载同一个命名卷或 Bind Mount。`docker compose down` 保留卷，`docker compose down --volumes` 删除卷。

### Bind Mount 权限错误

确认宿主机目录存在、容器可写且没有只读挂载。命名卷通常可以避免宿主机 UID、所有权和安全标签问题。

### 容器健康，但模型请求失败

容器健康只代表 Nginx / UI 可访问。继续检查 **服务** 状态、供应商连通性、CCR 客户端 Key、路由和请求日志，并查看：

```sh
docker compose logs --tail=200 ccr
```

## 相关页面

- [安装并启动 CCR](../install/)
- [CLI 安装与命令参考](../cli/)
- [服务配置](../../configuration/server/)
- [API 密钥](../../configuration/api-keys/)

