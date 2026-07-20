FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && install -d -m 0755 /etc/apt/keyrings \
  && curl -fsSL https://downloads.claude.ai/keys/claude-code.asc -o /etc/apt/keyrings/claude-code.asc \
  && echo "deb [signed-by=/etc/apt/keyrings/claude-code.asc] https://downloads.claude.ai/claude-code/apt/latest latest main" > /etc/apt/sources.list.d/claude-code.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends claude-code \
  && rm -rf /var/lib/apt/lists/*

ENV CLAUDE_CONFIG_DIR=/tmp/.claude

EXPOSE 8080

ENTRYPOINT ["claude", "gateway", "--config", "/etc/claude/gateway.yaml"]
