---
title: Docker Deployment
pageTitle: Docker Deployment
eyebrow: Quick Start
lead: Run CCR Core and the browser UI behind a single Nginx entrypoint with documented ports, authentication, persistence, upgrades, and troubleshooting.
---

## Scope And Limitations

The image contains CCR Core, the built management UI, PM2, and Nginx. It is intended for a persistent model gateway and browser administration. It does not include Electron, the npm `ccr` command, tray features, host desktop Agent/App launching, desktop automatic updates, or desktop-only browser integrations.

Use the desktop distribution for local app profiles and tray workflows, or the [CLI](../cli/) for an Electron-free host command.

## Process And Port Topology

```text
host 3458 -> container Nginx 8080
                         |-> static management UI
                         |-> management RPC: 127.0.0.1:3459
                         |-> model gateway:  127.0.0.1:3456
                         `-> core runtime:   127.0.0.1:3457
```

Publish only container port `8080`. The other listeners are implementation details and should remain private.

| Public route | Purpose |
| --- | --- |
| `/`, `/pages/home/index.html` | Management UI. The root redirects to a tokenized page URL. |
| `/api/ccr/rpc` | Authenticated management RPC. |
| `/health` | Model gateway health, not UI/container health. |
| `/v1/*`, `/v1beta/*`, `/messages`, `/chat/completions`, `/responses`, `/interactions`, `/mcp/*` | Model and MCP gateway routes. |

## Start With Compose

From the repository root:

```sh
docker compose up -d --build
docker compose logs -f ccr
```

Open <http://127.0.0.1:3458>. Add a provider/model, create a CCR client key under **API Keys**, and start the gateway under **Server**. A fresh UI is available immediately, but `/health` can return `502` until the gateway has usable models.

Stop or remove the container without deleting its volume:

```sh
docker compose stop
docker compose down
```

Do not add `--volumes` unless all persisted CCR data should be deleted.

The repository mapping `3458:8080` binds every host interface. For local-only access, use:

```yaml
ports:
  - "127.0.0.1:3458:8080"
```

## Authentication

CCR uses three distinct credential types:

| Credential | Purpose | Location |
| --- | --- | --- |
| `CCR_WEB_AUTH_TOKEN` | Management UI/RPC | Container environment |
| CCR client API key | Model gateway requests | **API Keys** page |
| Upstream credential | Requests from CCR to a provider | **Providers** page |

Without `CCR_WEB_AUTH_TOKEN`, the entrypoint generates a new random token for every container start. Opening `/` still works because Nginx redirects to a URL containing the current token. Use a fixed strong token for persistent or remote deployments.

Keep secrets out of shell history by using an ignored environment file:

```dotenv
CCR_WEB_AUTH_TOKEN=replace-with-a-long-random-value
CCR_PUBLIC_BASE_URL=http://127.0.0.1:3458
```

Pass it through `docker run --env-file` or the Compose service `environment`. Treat the complete management URL as a secret because `ccr_web_token` can be captured in browser history, proxy logs, screenshots, and tickets.

## Change The Public Address

Changing the host-facing port, hostname, or scheme also requires the exact client URL in `CCR_PUBLIC_BASE_URL`:

```yaml
services:
  ccr:
    ports:
      - "127.0.0.1:8088:8080"
    environment:
      CCR_PUBLIC_BASE_URL: http://127.0.0.1:8088
      CCR_WEB_AUTH_TOKEN: ${CCR_WEB_AUTH_TOKEN:?set CCR_WEB_AUTH_TOKEN}
```

`CCR_PUBLIC_BASE_URL` updates CCR's public router endpoint. It does not publish a Docker port.

For TLS at a reverse proxy or ingress, set the HTTPS URL and keep the host port private:

```yaml
environment:
  CCR_PUBLIC_BASE_URL: https://ccr.example.com
  CCR_WEB_AUTH_TOKEN: ${CCR_WEB_AUTH_TOKEN:?set CCR_WEB_AUTH_TOKEN}
```

Proxy every path, allow long-lived requests and adequate body sizes, and disable buffering for SSE/model streams. Add firewall, private-network, or equivalent access controls before exposing management to an untrusted network.

## Persistent Data

The entrypoint sets `HOME=/data`; CCR data is under `/data/.claude-code-router/`, including `config.sqlite`, `gateway.config.json`, `app-data/`, `profiles/`, and generated files under `bin/`.

Prefer a named volume. A bind mount must be writable by the container, and two running CCR containers must not share the same data directory.

On a completely empty volume, the entrypoint writes minimal bootstrap `config.json`. Once the UI saves configuration, SQLite is authoritative. Startup also synchronizes persisted listener/router endpoint fields to the Docker public address unless disabled.

## Backup, Restore, And Upgrade

Use **Settings → Export data** for an application-level backup. For a complete copy, stop writes first:

```sh
docker compose stop ccr
docker compose cp ccr:/data/. ./ccr-data-backup/
docker compose start ccr
```

The backup contains secrets and may contain request/response data. Restore into a new empty volume or empty `/data` while the container is stopped. Do not overlay an old copy onto populated live data because SQLite WAL/SHM and newer runtime files can be mixed.

Upgrade after backing up:

```sh
git pull
docker compose build --pull
docker compose up -d
docker compose ps
docker compose logs --tail=200 ccr
```

Rollback should pair the previous image/source revision with a pre-upgrade backup; an older build may not understand a newer database.

## Environment Reference

Most installations should change only `CCR_WEB_AUTH_TOKEN`, `CCR_PUBLIC_BASE_URL`, and the Docker port mapping.

| Variable | Default | Description |
| --- | --- | --- |
| `CCR_WEB_AUTH_TOKEN` | Random per start | Management UI/RPC token. |
| `CCR_PUBLIC_BASE_URL` | `http://127.0.0.1:3458` | Exact public URL written to CCR configuration. |
| `CCR_PUBLIC_HOST` | `127.0.0.1` | Used only to derive the public URL when the full URL is unset. |
| `CCR_PUBLIC_PORT` | `3458` | Used only to derive the public URL when the full URL is unset. |
| `CCR_DATA_DIR` | `/data` | Data root and process `HOME`. |
| `CCR_NGINX_PORT` | `8080` | Container-private Nginx port. |
| `CCR_WEB_HOST` | `127.0.0.1` | Container-private management host. |
| `CCR_WEB_PORT` | `3459` | Container-private management port. |
| `CCR_GATEWAY_HOST` | `127.0.0.1` | Container-private model gateway host. |
| `CCR_GATEWAY_PORT` | `3456` | Container-private model gateway port used by Nginx. |
| `CCR_GATEWAY_CORE_PORT` | `3457` | Container-private core runtime port. |
| `CCR_NO_GATEWAY` | `0` | `1`, `true`, or `yes` starts management without the gateway at boot. |
| `CCR_DOCKER_INIT_CONFIG` | `1` | `0` disables empty-volume bootstrap `config.json`. |
| `CCR_DOCKER_SYNC_PUBLIC_ENDPOINT` | `1` | `0` disables startup synchronization of persisted listener/public endpoint fields. |

Internal ports normally should not change. Publish only `CCR_NGINX_PORT`.

## Build And Smoke Test

```sh
docker build \
  --build-arg NODE_IMAGE=node:22-bookworm \
  --build-arg RUNTIME_NODE_IMAGE=node:22-bookworm-slim \
  -t claude-code-router:local .

npm run test:docker
```

The smoke test creates temporary resources and verifies the single Nginx entrypoint, UI/RPC auth, public endpoint migration, gateway startup, and `/health`. Set `CCR_DOCKER_TEST_SKIP_BUILD=1` to reuse an image or `CCR_DOCKER_TEST_IMAGE` to select another local tag.

## Operations And Troubleshooting

```sh
docker compose ps
docker compose logs -f ccr
docker compose restart ccr
docker compose config
```

- **`/` returns `302`:** expected tokenized management-page redirect.
- **`/health` returns `502`:** the model gateway is not yet configured/running; this is separate from container health.
- **UI returns `401` after a token change:** reopen the bare root URL and close tabs/bookmarks containing the old token.
- **Clients use an old host/port:** update `CCR_PUBLIC_BASE_URL` and recreate the container with endpoint synchronization enabled.
- **Data disappears after recreation:** verify the same `/data` volume is mounted; `docker compose down --volumes` deletes it.
- **Bind mount permission errors:** ensure the host directory exists and is writable, or use a named volume.
- **Container is healthy but requests fail:** inspect Server status, provider connectivity, CCR client-key auth, routing, request logs, and `docker compose logs --tail=200 ccr`.

## Related Pages

- [Install And Start CCR](../install/)
- [CLI Installation And Reference](../cli/)
- [Server](../../configuration/server/)
- [API Keys](../../configuration/api-keys/)

