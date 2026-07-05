# Docker deployment

This image runs the core server package with PM2 and serves the built UI package
through Nginx. Nginx is the only published entrypoint: it serves the UI, proxies
management API calls to the internal core server, and proxies gateway API calls
to the internal gateway listener.

## Build and run

```sh
docker compose up --build
```

Then open:

- Web UI: <http://localhost:3458>
- Gateway endpoint: <http://localhost:3458>

The container stores config and SQLite databases under `/data`, backed by the
`ccr-data` volume in `docker-compose.yml`.

On a fresh data volume, the Web UI starts immediately. The gateway port is
available through the same Nginx port, but the gateway only starts after at
least one provider and model are configured.

## Image scripts

```sh
npm run docker:build
npm run docker:run
```

## Smoke test

```sh
npm run test:docker
```

The smoke test builds the image, starts an isolated temporary container with a
special-character `CCR_WEB_AUTH_TOKEN`, verifies that only the Nginx port is
published, checks UI and RPC authentication, confirms legacy Docker config is
migrated to the public Nginx router endpoint, and removes its temporary
container and volume. Set `CCR_DOCKER_TEST_SKIP_BUILD=1` to reuse an already
built image.

The Dockerfile defaults to `node:22-bookworm` for reliable native SQLite
installation. To use a different Node base image:

```sh
docker build --build-arg NODE_IMAGE=node:22-bookworm-slim -t claude-code-router:local .
```

## Environment

| Variable | Default | Description |
| --- | --- | --- |
| `CCR_WEB_HOST` | `127.0.0.1` | Internal core server bind host. |
| `CCR_WEB_PORT` | `3459` | Internal core server port. |
| `CCR_NGINX_PORT` | `8080` | Nginx port that serves UI and proxies management/gateway requests. |
| `CCR_WEB_AUTH_TOKEN` | generated | Shared management UI token used by Nginx redirects and the core server. |
| `CCR_GATEWAY_HOST` | `127.0.0.1` | Internal gateway bind host. |
| `CCR_GATEWAY_PORT` | `3456` | Internal gateway port proxied by Nginx. |
| `CCR_GATEWAY_CORE_PORT` | `3457` | Internal core gateway port used for first-run config. |
| `CCR_PUBLIC_HOST` | `127.0.0.1` | Host used for the first-run public router endpoint. |
| `CCR_PUBLIC_PORT` | `3458` | Port used for the first-run public router endpoint. |
| `CCR_PUBLIC_BASE_URL` | `http://127.0.0.1:3458` | Full public router endpoint override. |
| `CCR_DATA_DIR` | `/data` | Container data root. |
| `CCR_NO_GATEWAY` | `0` | Set to `1` to run only the Web UI management service. |
| `CCR_DOCKER_INIT_CONFIG` | `1` | Set to `0` to disable first-run `config.json` bootstrap. |
| `CCR_DOCKER_SYNC_PUBLIC_ENDPOINT` | `1` | Sync existing Docker config to the Nginx public router endpoint on startup. |

The first-run bootstrap writes a minimal legacy `config.json` only when neither
`config.json` nor `config.sqlite` exists in the mounted data directory. Once the
UI saves settings into SQLite, existing persisted configuration takes priority.
