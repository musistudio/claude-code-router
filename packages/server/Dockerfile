# ===========================
# Build Stage
# ===========================
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@latest && \
    rm -rf /root/.npm

# Copy workspace configuration and package files first for caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY scripts ./scripts
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/
COPY packages/server/package.json ./packages/server/
COPY packages/ui/package.json ./packages/ui/
COPY packages/cli/package.json ./packages/cli/

# Copy all source code before installing dependencies to avoid symlink conflicts
COPY packages/shared ./packages/shared
COPY packages/core ./packages/core
COPY packages/server ./packages/server
COPY packages/ui ./packages/ui
COPY packages/cli ./packages/cli

# Install all dependencies
RUN pnpm install --frozen-lockfile && \
    pnpm store prune

# Build all packages
WORKDIR /app/packages/core
RUN pnpm build

WORKDIR /app/packages/shared
RUN pnpm build

WORKDIR /app/packages/server
RUN pnpm build && \
    rm -rf node_modules/.cache

WORKDIR /app/packages/ui
RUN pnpm build

WORKDIR /app/packages/cli
RUN pnpm build

# ===========================
# Production Stage
# ===========================
FROM node:20-alpine AS production

# Install PM2, curl, and pm2-logrotate
RUN apk add --no-cache curl && \
    npm install -g pm2 pm2-logrotate --no-scripts && \
    pm2 install pm2-logrotate && \
    pm2 set pm2-logrotate:max_size 100M && \
    pm2 set pm2-logrotate:retain 5 && \
    pm2 set pm2-logrotate:compress true && \
    pm2 set pm2-logrotate:rotateInterval '0 0 * * *'

WORKDIR /app

# Copy core package (workspace dependency)
COPY --from=builder /app/packages/core ./packages/core

# Copy CLI bundle
COPY --from=builder /app/packages/cli/dist ./packages/cli/dist

# Make CLI executable and create symlink for 'ccr' command
RUN chmod +x /app/packages/cli/dist/cli.js && \
    ln -sf /app/packages/cli/dist/cli.js /usr/local/bin/ccr

# Add CLI dist to PATH (for direct access)
ENV PATH="/app/packages/cli/dist:$PATH"

# Copy production dependencies
COPY --from=builder /app/packages/server/node_modules ./packages/server/node_modules

# Copy server bundle from build stage
COPY --from=builder /app/packages/server/dist ./packages/server/dist
# Copy locally pre-built UI assets to the same directory
COPY --from=builder /app/packages/ui/dist/. ./packages/server/dist/

# Copy PM2 configuration file
COPY packages/server/ecosystem.config.cjs /app/

# Create logs directory
RUN mkdir -p /root/.claude-code-router/logs

# Expose port
EXPOSE 3456

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://127.0.0.1:3456/health || exit 1

# Start the application
CMD ["pm2-runtime", "start", "/app/ecosystem.config.cjs"]
