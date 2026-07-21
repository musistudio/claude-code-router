---
title: Custom MCP tool
pageTitle: Custom MCP tool
eyebrow: Fusion
lead: Connect built-in, local, or remote MCP tools to a Fusion model, including the built-in image and video generation tools.
---

## Entry point

Choose a built-in tool under **Tools**, or click **Add custom MCP** to connect a custom service.

Custom MCP supports:

- **stdio**: local command-line tools.
- **streamable-http / sse**: remote MCP services.
- **Discover tools**: read tools exposed by an MCP server.

## Image and video generation

Media is exposed as two ordinary built-in Fusion tools: **Image generation** and **Video generation**. They behave like the built-in search tool, do not belong to ToolHub, and do not create a separate section on the Fusion page.

Fusion tool loops do not have a turn-count or tool-call-count limit. Request timeout and client cancellation still apply.

Each tool has one model selector:

- Selecting `Provider/model` sends the request through ai-gateway, which applies the configured endpoint, active credential, extra headers, and extra body. The media tool never asks for a separate xAI API key.
- An imported Grok Agent automatically contributes `grok-imagine-image-quality` and `grok-imagine-video`. ai-gateway reuses its existing OAuth login to access `api.x.ai`; Grok CLI is not started.
- Image and video models are independent, and separate Fusion profiles may bind different media models.

To configure media:

1. Add a provider and models that support the image or video generation protocol on the **Providers** page, or import a logged-in Grok Agent.
2. Add **Image generation**, **Video generation**, or both under a Fusion model's **Tools**.
3. Select a model below each tool and save the Fusion model.
4. Use that Fusion model as an agent model or routing target.

CCR calls providers through ai-gateway's generic media protocol: `images/generations` and `images/edits` for images, and `videos/generations` plus `videos/{id}` for videos. The selectors show provider models with a declared or detected matching media capability; Grok API is one supported implementation.

## Runtime tools

CCR creates profile-specific runtime tool names when the Fusion model is saved. This prevents model bindings from colliding across Fusion profiles.

| Fusion tool | Runtime capabilities |
| --- | --- |
| Image generation | Generate images and edit one to three local images. |
| Video generation | Start text/image/reference video jobs, then inspect or cancel asynchronous jobs. |

Paid submissions accept an optional `idempotency_key`. Reuse one stable key for a user intent to avoid duplicate billing during network retries. Video submission always returns a job ID immediately.

The API backend supports image generation, image editing, text-to-video, image-to-video, and reference-to-video. Media execution never launches a nested Agent or CLI process.

## Artifacts and Safety

Artifacts are stored in CCR's private data directory and include a local path, MIME type, size, SHA-256, and expiring URL. Video URLs support HTTP Range. Retention, concurrency, and timeout are internal CCR safety policies and are not requested in the Fusion UI.

Local image inputs still undergo canonical-path, file-signature, and size checks. A scoped current working directory, the system temporary directory, and the CCR config directory are allowed by default. Filesystem roots, the user home directory, and directories above the user home are never trusted implicitly; add an explicit `allowedInputRoots` entry when broader access is intentional. The UI does not expose an “Allowed image roots” field.

To connect an MCP client directly:

```text
http://127.0.0.1:3456/__ccr/media/mcp
Authorization: Bearer <CCR API Key>
```

The endpoint uses a CCR API key, while artifact URLs use separate expiring tokens. Legacy `/__ccr/grok-media/*` routes remain available for migration.
Internally, Fusion registers these tools through a `stdio` MCP proxy generated with the Core configuration. The proxy returns the profile's deterministic tool catalog directly and forwards actual calls to the private endpoint above, avoiding missing tools caused by HTTP MCP discovery or startup ordering.

Internal policy example (normally no manual changes are needed):

```json
{
  "mediaTools": {
    "enabled": true,
    "artifactTtlHours": 24,
    "jobTimeoutMs": 600000,
    "maxImageConcurrency": 2,
    "maxVideoConcurrency": 1,
    "allowedInputRoots": []
  }
}
```

Legacy `grokMedia` input is migrated to `mediaTools` when loaded. A legacy `grok-cli` media binding is resolved to an imported Grok Agent or a configured Grok API model; it never starts the CLI.

## Verification

Verify that the selected provider implements the relevant media endpoints with a test Fusion profile before using it in production routing.
