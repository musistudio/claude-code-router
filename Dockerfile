ARG NODE_IMAGE=node:22-bookworm

FROM ${NODE_IMAGE} AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/cli/package.json packages/cli/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/electron/package.json packages/electron/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci

COPY . .
RUN npm run build:docker

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    CCR_DATA_DIR=/data \
    CCR_WEB_HOST=127.0.0.1 \
    CCR_WEB_PORT=3459 \
    CCR_NGINX_PORT=8080 \
    CCR_GATEWAY_HOST=127.0.0.1 \
    CCR_GATEWAY_PORT=3456 \
    CCR_GATEWAY_CORE_PORT=3457 \
    CCR_PUBLIC_HOST=127.0.0.1 \
    CCR_PUBLIC_PORT=3458

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates nginx \
  && rm -rf /var/lib/apt/lists/* \
  && rm -f /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
RUN npm ci --omit=dev --workspace=@claude-code-router/core --include-workspace-root=false \
  && npm cache clean --force

COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/ui/dist/renderer /usr/share/nginx/html
COPY docker/entrypoint.sh /usr/local/bin/ccr-docker-entrypoint
COPY docker/pm2.config.cjs docker/pm2.config.cjs

RUN chmod +x /usr/local/bin/ccr-docker-entrypoint \
  && mkdir -p /data /run/nginx /var/lib/nginx /var/log/nginx

VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.CCR_NGINX_PORT || '8080') + '/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["ccr-docker-entrypoint"]
