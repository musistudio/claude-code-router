---
title: Docker deployment
pageTitle: Docker deployment
eyebrow: Quick start
lead: "For persistent server deployments: run CCR Core and the browser management UI in Docker behind a single Nginx entrypoint, and configure ports, authentication, persistence, remote access, backup, and upgrades."
---

## Scope and limitations

The Docker image is intended for a persistent model gateway and browser administration. It contains CCR Core, the built management UI, PM2, and Nginx. It does not include:

- The Electron desktop app, system tray, or desktop notifications;
- The `ccr` command from the npm distribution;
- Launching host-side desktop apps such as Claude App, ChatGPT, or ZCode from inside the container;
- Desktop automatic updates and desktop-only built-in browser integrations.

If the main need is local Agent multi-instance, tray, or desktop app launching, use the desktop distribution; if you need terminal commands without containers, use the [CLI](../cli/).

## Process and port topology

```text
host 3458 -> container Nginx 8080
                         |-> static management UI
                         |-> management RPC: 127.0.0.1:3459
                         |-> model gateway:  127.0.0.1:3456
                         `-> core runtime:   127.0.0.1:3457
```

Only the Nginx container port `8080` should be published. `3459`, `3456`, and `3457` are container-internal implementation ports; do not map them to the host individually.

Nginx exposes:

| Path | Purpose |
| --- | --- |
| `/`, `/pages/home/index.html` | Management UI. The root path redirects to a page URL containing the management token. |
| `/api/ccr/rpc` | Management RPC, protected by the management token. |
| `/health` | Model gateway health; container or UI status is not reflected here. |
| `/v1/*`, `/v1beta/*`, `/messages`, `/chat/completions`, `/responses`, `/interactions`, `/mcp/*` | Model and MCP gateway endpoints. |

## Quick start with Compose

From the repository root:

```sh
docker compose up -d --build
docker compose logs -f ccr
```

Open <http://127.0.0.1:3458>. On a fresh volume the management UI is available immediately; the model gateway only starts working after a provider and a model have been added.

Complete the first-time configuration in this order:

1. Add a provider and at least one model.
2. Create a CCR client key on the **API Keys** page.
3. Start the gateway on the **Server** page.
4. Request `/health` and confirm it returns `200` with a running status.
5. Point the client Base URL at `http://127.0.0.1:3458` and use the CCR client key you just created.

Stopping or removing the container does not delete the named volume:

```sh
docker compose stop
docker compose down
```

Do not add `--volumes` to `docker compose down` unless you explicitly want to delete all CCR data.

## Local-only access

The repository default mapping `3458:8080` listens on every host interface. If you only access it from the current machine, change it to:

```yaml
services:
  ccr:
    ports:
      - "127.0.0.1:3458:8080"
```

The left side of the port mapping is the host address and port; the right side is the Nginx container port. Do not change the right side to the internal gateway's `3456`.

## Using `docker run`

Without Compose:

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

The repository also provides `npm run docker:build` and `npm run docker:run`. The latter uses `3458` and `ccr-data`, but the container runs with `--rm` and has no fixed name or restart policy, so it is better suited to temporary verification.

## Do not mix up the three credentials

| Credential | Purpose | Where configured |
| --- | --- | --- |
| `CCR_WEB_AUTH_TOKEN` | Management UI / RPC authentication | Container environment variable |
| CCR client API key | Model gateway request authentication | **API Keys** page in the UI |
| Upstream provider credential | CCR calling model providers | **Providers** page in the UI |

Without `CCR_WEB_AUTH_TOKEN`, the entrypoint generates a new random token on every container start. Opening the root address still works because Nginx redirects to a URL containing the current token; but persistent and remote deployments should pin a sufficiently long, strong token.

Do not write the token directly into shell history. Create an environment file that stays out of version control:

```dotenv
CCR_WEB_AUTH_TOKEN=replace-with-a-long-random-value
CCR_PUBLIC_BASE_URL=http://127.0.0.1:3458
```

Use it via `docker run --env-file`, or map the same variables into the Compose service `environment`. The complete management URL containing `ccr_web_token` should also be protected like a password, because it can appear in browser history, reverse proxy logs, screenshots, and tickets.

## Change the external port or address

The host-facing address and the container-internal port are two layers of configuration. When changing the host port, also set `CCR_PUBLIC_BASE_URL` to the full address clients actually use:

```yaml
services:
  ccr:
    ports:
      - "127.0.0.1:8088:8080"
    environment:
      CCR_PUBLIC_BASE_URL: http://127.0.0.1:8088
      CCR_WEB_AUTH_TOKEN: ${CCR_WEB_AUTH_TOKEN:?set CCR_WEB_AUTH_TOKEN}
```

`CCR_PUBLIC_BASE_URL` is synchronized into CCR's public router endpoint. It does not publish a Docker port by itself, nor does it change the Nginx listen address.

## Domain, HTTPS, and reverse proxy

When a reverse proxy or ingress terminates TLS:

```yaml
services:
  ccr:
    ports:
      - "127.0.0.1:3458:8080"
    environment:
      CCR_PUBLIC_BASE_URL: https://ccr.example.com
      CCR_WEB_AUTH_TOKEN: ${CCR_WEB_AUTH_TOKEN:?set CCR_WEB_AUTH_TOKEN}
```

The reverse proxy should forward all paths to the CCR Nginx and must:

- Support long-running model requests;
- Not buffer SSE and streaming model responses;
- Allow an adequate request body size;
- Expose only the reverse proxy entrypoint publicly, while host port `3458` stays bound to localhost;
- Be combined with a firewall, VPN / private network, or additional access control so the management UI is not directly exposed to untrusted networks.

## Persistent data directory

The entrypoint sets `HOME=/data`; the actual data lives at:

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

Prefer a named volume. A bind-mount directory must be writable by the container, and two running CCR containers must not share the same data.

On a brand-new data directory with neither `config.json` nor `config.sqlite`, the entrypoint writes a minimal legacy-format `config.json` as the first boot. Once the UI saves configuration, SQLite becomes authoritative. On every start, the gateway listener fields and `routerEndpoint` in the JSON / SQLite are also synchronized to the current Docker public address by default.

## Backup and restore

For application-level backup, prefer **Settings → Export data**. For a complete file-level backup, stop writes first:

```sh
docker compose stop ccr
docker compose cp ccr:/data/. ./ccr-data-backup/
docker compose start ccr
```

The backup contains provider credentials and CCR client keys, and may contain request / response data; store it as sensitive data.

For a full restore, copy the backup into a new empty volume or an empty `/data` directory with the container stopped. Do not overlay an old backup onto an active directory that still has newer data, otherwise old SQLite WAL / SHM files may mix with new runtime files. Take another backup before replacing existing data.

## Upgrade and rollback

Back up `/data` first, then update the source, refresh the base images, and rebuild:

```sh
git pull
docker compose build --pull
docker compose up -d
docker compose ps
docker compose logs --tail=200 ccr
```

Upgrades run the migrations the current version needs against the persisted data. When rolling back, use both the old image / old source and the pre-upgrade backup together; do not assume an older version can always read a newer database.

## Environment variable reference

A typical deployment only needs `CCR_WEB_AUTH_TOKEN`, `CCR_PUBLIC_BASE_URL`, and the Docker port mapping. The internal listener variables normally do not need changing.

| Variable | Default | Description |
| --- | --- | --- |
| `CCR_WEB_AUTH_TOKEN` | Randomly generated per start | Management UI / RPC token. Persistent or remote deployments should set a fixed strong value. |
| `CCR_PUBLIC_BASE_URL` | `http://127.0.0.1:3458` | Full public address written into CCR configuration; takes precedence over Public Host / Port once set. |
| `CCR_PUBLIC_HOST` | `127.0.0.1` | Only used to compose the public address when no full public URL is set; does not change the Docker port binding. |
| `CCR_PUBLIC_PORT` | `3458` | Only used to compose the public address when no full public URL is set. |
| `CCR_DATA_DIR` | `/data` | Data root, also used as the process `HOME`. |
| `CCR_NGINX_PORT` | `8080` | Nginx listen port inside the container; should match the right side of the port mapping. |
| `CCR_WEB_HOST` | `127.0.0.1` | Management service listen address inside the container. |
| `CCR_WEB_PORT` | `3459` | Management service port inside the container. |
| `CCR_GATEWAY_HOST` | `127.0.0.1` | Model gateway listen address inside the container. |
| `CCR_GATEWAY_PORT` | `3456` | Model gateway port inside the container that Nginx proxies to. |
| `CCR_GATEWAY_CORE_PORT` | `3457` | Core Gateway Runtime port inside the container. |
| `CCR_NO_GATEWAY` | `0` | When set to `1`, `true`, or `yes`, only the management UI runs during startup. |
| `CCR_DOCKER_INIT_CONFIG` | `1` | Set to `0` to disable the first-boot minimal `config.json` bootstrap. |
| `CCR_DOCKER_SYNC_PUBLIC_ENDPOINT` | `1` | Set to `0` to stop synchronizing existing JSON / SQLite listener and public address fields at startup. |

Changing internal ports requires keeping the PM2 and Nginx variables consistent, with no benefit for normal deployments. Only `CCR_NGINX_PORT` should ever be published externally.

## Build and smoke test

By default, native dependencies are built on `node:22-bookworm`, then production dependencies and build output are copied into `node:22-bookworm-slim`. To swap the base images:

```sh
docker build \
  --build-arg NODE_IMAGE=node:22-bookworm \
  --build-arg RUNTIME_NODE_IMAGE=node:22-bookworm-slim \
  -t claude-code-router:local .
```

Run the Docker smoke test:

```sh
npm run test:docker
```

The test creates a temporary container and volume, verifies the single Nginx port, UI / RPC authentication, public address migration, gateway startup, and `/health`, then cleans up automatically. Use `CCR_DOCKER_TEST_SKIP_BUILD=1` to reuse an existing image, or `CCR_DOCKER_TEST_IMAGE` to select a local tag.

## Daily operations commands

```sh
docker compose ps
docker compose logs -f ccr
docker compose restart ccr
docker compose config
```

`docker compose ps` shows container health; `/health` shows model gateway health. The two are not interchangeable.

## Troubleshooting

### The root address returns `302`

This is expected behavior. Nginx is redirecting the root address to a page URL containing the URL-encoded management token.

### `/health` returns `502`

It checks the model gateway, not Nginx or the UI. A fresh volume without a configured provider / model returns `502`. Open the UI, finish the configuration, and start the gateway first.

### The UI returns `401` after a token change

Reopen the bare root address so Nginx generates a URL containing the new token; close tabs and bookmarks that still use the old `ccr_web_token`.

### Clients still use the old port or domain

Update `CCR_PUBLIC_BASE_URL` and recreate the container. Keep `CCR_DOCKER_SYNC_PUBLIC_ENDPOINT=1` so existing SQLite configuration is synchronized at startup.

### Configuration disappears after a rebuild

Confirm that `/data` is still mounted to the same named volume or bind mount. `docker compose down` keeps volumes; `docker compose down --volumes` deletes them.

### Bind mount permission errors

Confirm the host directory exists, is writable by the container, and is not mounted read-only. Named volumes usually avoid host UID, ownership, and security label issues.

### The container is healthy, but model requests fail

Container health only means Nginx / UI are reachable. Continue checking **Server** status, provider connectivity, the CCR client key, routing, and request logs, and inspect:

```sh
docker compose logs --tail=200 ccr
```

## Related pages

- [Install and start CCR](../install/)
- [CLI installation and command reference](../cli/)
- [Server](../../configuration/server/)
- [API Keys](../../configuration/api-keys/)
