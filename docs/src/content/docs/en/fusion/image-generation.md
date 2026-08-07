---
title: Image generation tool
pageTitle: Image generation tool
eyebrow: Fusion
lead: Add image generation and image editing to a Fusion model so a text model can produce image assets directly.
---

## What it does

The **image generation tool** is a built-in Fusion media tool. It turns model tool calls into image generation or image editing requests, then returns artifact metadata such as local path, MIME type, size, SHA-256, and an expiring URL.

It is different from **Built-in vision**:

| Capability | Purpose |
| --- | --- |
| Built-in vision | Understand user-provided images, screenshots, charts, and OCR content. |
| Image generation tool | Generate new images or edit one to three local input images. |

## Configuration

1. Configure a provider and model that support the image generation protocol on the **Providers** page.
2. Create or edit a Fusion model.
3. Add **Image generation** under **Tools**.
4. Select an image model, for example `Provider/model`.
5. Save the Fusion model and use it as an Agent model or routing target.

After importing a Grok Agent, CCR automatically provides `grok-imagine-image-quality`. ai-gateway reuses the existing OAuth login to access `api.x.ai`; it does not start Grok CLI.

## Supported requests

CCR calls providers through ai-gateway's generic media protocol:

| Request | Purpose |
| --- | --- |
| `images/generations` | Generate images from text. |
| `images/edits` | Edit local image inputs. |

Tool calls accept an optional `idempotency_key`. Reuse a stable key for one user intent to avoid duplicate billing during network retries.

## Local image inputs

Image editing validates canonical paths, file signatures, and file sizes. By default, CCR allows scoped access to the current working directory, the system temporary directory, and the CCR config directory.

Do not implicitly allow the filesystem root, the user home directory, or directories above the user home. Add an explicit `allowedInputRoots` entry only when broader file access is intentional.

## Artifacts

Generated images are stored in CCR's private data directory. Results include:

- Local file path
- MIME type
- File size
- SHA-256
- Expiring URL

The expiring URL uses a separate token and does not reuse the CCR API key.

## Troubleshooting

When image generation fails, check:

- Whether the provider model declares or actually supports image generation.
- Whether the Fusion tool is bound to the correct image model.
- The ai-gateway status code and error in request logs.
- Whether image editing inputs are inside allowed read roots.
