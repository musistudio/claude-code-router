#!/bin/sh
set -eu

CCR_DATA_DIR="${CCR_DATA_DIR:-/data}"
CCR_WEB_HOST="${CCR_WEB_HOST:-127.0.0.1}"
CCR_WEB_PORT="${CCR_WEB_PORT:-3459}"
CCR_NGINX_PORT="${CCR_NGINX_PORT:-8080}"
CCR_GATEWAY_HOST="${CCR_GATEWAY_HOST:-127.0.0.1}"
CCR_GATEWAY_PORT="${CCR_GATEWAY_PORT:-3456}"
CCR_GATEWAY_CORE_PORT="${CCR_GATEWAY_CORE_PORT:-3457}"
CCR_PUBLIC_HOST="${CCR_PUBLIC_HOST:-127.0.0.1}"
CCR_PUBLIC_PORT="${CCR_PUBLIC_PORT:-3458}"
CCR_PUBLIC_BASE_URL="${CCR_PUBLIC_BASE_URL:-http://${CCR_PUBLIC_HOST}:${CCR_PUBLIC_PORT}}"
CCR_NO_GATEWAY="${CCR_NO_GATEWAY:-0}"

if [ -z "${CCR_WEB_AUTH_TOKEN:-}" ]; then
  CCR_WEB_AUTH_TOKEN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")"
fi
CCR_WEB_AUTH_TOKEN_QUERY="$(node -e "process.stdout.write(encodeURIComponent(process.argv[1] || ''))" "${CCR_WEB_AUTH_TOKEN}")"

export HOME="${CCR_DATA_DIR}"
export CCR_DATA_DIR
export CCR_GATEWAY_CORE_PORT
export CCR_GATEWAY_HOST
export CCR_GATEWAY_PORT
export CCR_NGINX_PORT
export CCR_NO_GATEWAY
export CCR_PUBLIC_BASE_URL
export CCR_PUBLIC_HOST
export CCR_PUBLIC_PORT
export CCR_WEB_AUTH_TOKEN
export CCR_WEB_AUTH_TOKEN_QUERY
export CCR_WEB_HOST
export CCR_WEB_PORT

CONFIG_DIR="${HOME}/.claude-code-router"
CONFIG_FILE="${CONFIG_DIR}/config.json"
APP_CONFIG_DB_FILE="${CONFIG_DIR}/config.sqlite"

mkdir -p "${CONFIG_DIR}" "${CONFIG_DIR}/app-data" /run/nginx /var/lib/nginx /var/log/nginx

if [ "${CCR_DOCKER_INIT_CONFIG:-1}" != "0" ] && [ ! -f "${CONFIG_FILE}" ] && [ ! -f "${APP_CONFIG_DB_FILE}" ]; then
  node - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const configDir = path.join(process.env.HOME, ".claude-code-router");
const configFile = path.join(configDir, "config.json");
const gatewayHost = process.env.CCR_GATEWAY_HOST || "0.0.0.0";
const gatewayPort = Number(process.env.CCR_GATEWAY_PORT || "3456");
const gatewayCorePort = Number(process.env.CCR_GATEWAY_CORE_PORT || "3457");
const publicBaseUrl = (process.env.CCR_PUBLIC_BASE_URL || `http://127.0.0.1:${process.env.CCR_PUBLIC_PORT || "3458"}`).replace(/\/+$/, "");

fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
fs.writeFileSync(configFile, `${JSON.stringify({
  HOST: gatewayHost,
  PORT: gatewayPort,
  gateway: {
    coreHost: "127.0.0.1",
    corePort: gatewayCorePort,
    enabled: true,
    host: gatewayHost,
    port: gatewayPort
  },
  routerEndpoint: publicBaseUrl
}, null, 2)}\n`, { mode: 0o600 });
NODE
fi

if [ "${CCR_DOCKER_SYNC_PUBLIC_ENDPOINT:-1}" != "0" ]; then
  node - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const configDir = path.join(process.env.HOME, ".claude-code-router");
const configFile = path.join(configDir, "config.json");
const appConfigDbFile = path.join(configDir, "config.sqlite");
const gatewayHost = process.env.CCR_GATEWAY_HOST || "127.0.0.1";
const gatewayPort = Number(process.env.CCR_GATEWAY_PORT || "3456");
const gatewayCorePort = Number(process.env.CCR_GATEWAY_CORE_PORT || "3457");
const publicBaseUrl = (process.env.CCR_PUBLIC_BASE_URL || `http://127.0.0.1:${process.env.CCR_PUBLIC_PORT || "3458"}`).replace(/\/+$/, "");

function syncConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  value.HOST = gatewayHost;
  value.PORT = gatewayPort;
  value.gateway = {
    ...(value.gateway && typeof value.gateway === "object" && !Array.isArray(value.gateway) ? value.gateway : {}),
    coreHost: "127.0.0.1",
    corePort: gatewayCorePort,
    enabled: true,
    host: gatewayHost,
    port: gatewayPort
  };
  value.routerEndpoint = publicBaseUrl;
  return value;
}

function syncJsonFile() {
  if (!fs.existsSync(configFile)) {
    return;
  }
  const parsed = JSON.parse(fs.readFileSync(configFile, "utf8"));
  fs.writeFileSync(configFile, `${JSON.stringify(syncConfig(parsed), null, 2)}\n`, { mode: 0o600 });
}

function syncSqliteConfig() {
  if (!fs.existsSync(appConfigDbFile)) {
    return;
  }
  let Database;
  try {
    Database = require("better-sqlite3");
  } catch {
    return;
  }
  const db = new Database(appConfigDbFile);
  try {
    const row = db.prepare("select value_json from app_config where key = ?").get("default");
    if (!row?.value_json) {
      return;
    }
    const parsed = JSON.parse(row.value_json);
    db.prepare("update app_config set value_json = ?, updated_at = ? where key = ?")
      .run(JSON.stringify(syncConfig(parsed)), new Date().toISOString(), "default");
  } finally {
    db.close();
  }
}

syncJsonFile();
syncSqliteConfig();
NODE
fi

cat > /etc/nginx/conf.d/default.conf <<EOF
server {
  listen ${CCR_NGINX_PORT};
  server_name _;
  root /usr/share/nginx/html;
  index pages/home/index.html;
  absolute_redirect off;

  client_max_body_size 8m;

  location = / {
    return 302 /pages/home/index.html?ccr_web_token=${CCR_WEB_AUTH_TOKEN_QUERY};
  }

  location = /pages/home/index.html {
    if (\$arg_ccr_web_token = "") {
      return 302 /pages/home/index.html?ccr_web_token=${CCR_WEB_AUTH_TOKEN_QUERY};
    }
    try_files /pages/home/index.html =404;
  }

  location = /api/ccr/rpc {
    proxy_http_version 1.1;
    proxy_set_header Host ${CCR_WEB_HOST}:${CCR_WEB_PORT};
    proxy_set_header Origin http://${CCR_WEB_HOST}:${CCR_WEB_PORT};
    proxy_set_header Referer http://${CCR_WEB_HOST}:${CCR_WEB_PORT}/;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_pass http://${CCR_WEB_HOST}:${CCR_WEB_PORT};
  }

  location = /health {
    proxy_http_version 1.1;
    proxy_set_header Host ${CCR_GATEWAY_HOST}:${CCR_GATEWAY_PORT};
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_pass http://${CCR_GATEWAY_HOST}:${CCR_GATEWAY_PORT};
  }

  location ~ ^/(v1|v1beta|mcp|messages|chat/completions|responses|interactions)(/|$) {
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_set_header Connection "";
    proxy_set_header Host ${CCR_GATEWAY_HOST}:${CCR_GATEWAY_PORT};
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_pass http://${CCR_GATEWAY_HOST}:${CCR_GATEWAY_PORT};
  }

  location / {
    try_files \$uri \$uri/ /pages/home/index.html;
  }
}
EOF

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

if [ -x /app/node_modules/.bin/pm2-runtime ]; then
  exec /app/node_modules/.bin/pm2-runtime docker/pm2.config.cjs
fi

exec /app/packages/core/node_modules/.bin/pm2-runtime docker/pm2.config.cjs
