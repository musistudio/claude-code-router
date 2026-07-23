# Local Claude Apps Gateway

This is a local smoke-test setup for Claude apps gateway:

- `gateway` runs `claude gateway --config /etc/claude/gateway.yaml`.
- `postgres` stores device grants and rate-limit state.
- `dex` is a local OIDC provider so the login flow can be tested without a corporate IdP.

Run:

```bash
docker compose up --build -d
```

Check:

```bash
curl -s http://localhost:8080/healthz
curl -s http://localhost:8080/.well-known/oauth-authorization-server
curl -s -X POST http://localhost:8080/oauth/device_authorization
```

Local Dex user:

- Email: `dev@example.com`
- Password: `password`

The Anthropic upstream uses a dummy key so the gateway can boot and the SSO surface can be verified. Replace `ANTHROPIC_API_KEY` in `.env` with a real key, or replace the `upstreams` block in `gateway.yaml` with your Bedrock, Claude Platform on AWS, Vertex, Foundry, or CCR upstream before testing inference.

To point a local Claude Code client at this gateway, install the contents of `managed-settings.local.json` as the OS-level managed settings file. On macOS that path is `/Library/Application Support/ClaudeCode/managed-settings.json`, which usually requires admin permissions.
