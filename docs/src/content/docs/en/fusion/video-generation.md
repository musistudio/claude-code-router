---
title: Video generation tool
pageTitle: Video generation tool
eyebrow: Fusion
lead: Add text-to-video, image-to-video, and reference-to-video capability to a Fusion model through asynchronous video jobs.
---

## What it does

The **video generation tool** is a built-in Fusion media tool. It upgrades a text model into an Agent model that can submit video generation jobs from prompts, image inputs, or reference images.

Video generation always runs asynchronously. The start call returns a job ID immediately, and the tool then checks job status until the job completes, fails, or is canceled.

## Configuration

1. Configure a provider and model that support the video generation protocol on the **Providers** page.
2. Create or edit a Fusion model.
3. Add **Video generation** under **Tools**.
4. Select a video model, for example `Provider/model`.
5. Save the Fusion model and use it as an Agent model or routing target.

After importing a Grok Agent, CCR automatically provides `grok-imagine-video`. ai-gateway reuses the existing OAuth login to access `api.x.ai`; it does not start Grok CLI.

## Supported requests

CCR calls providers through ai-gateway's generic media protocol:

| Request | Purpose |
| --- | --- |
| `videos/generations` | Start a text-to-video, image-to-video, or reference-to-video job. |
| `videos/{id}` | Check video job status and result. |

Tool calls accept an optional `idempotency_key`. Reuse a stable key for one user intent to avoid duplicate billing during network retries.

## Runtime behavior

The video generation tool lets CCR manage the job lifecycle:

- Start the job and return a job ID.
- Poll job status and report progress back to the model.
- Return video artifact metadata when the job completes.
- Attempt to cancel or stop waiting when the user cancels the request.

Request timeout and client cancellation still apply. Concurrency, retention, and job timeout are CCR internal safety policies and normally do not need Fusion UI configuration.

## Artifacts

Generated videos are stored in CCR's private data directory. Results include:

- Local file path
- MIME type
- File size
- SHA-256
- Expiring URL

Video URLs support HTTP Range so players can load content on demand.

## Troubleshooting

When video generation fails, check:

- Whether the provider model declares or actually supports video generation.
- Whether the Fusion tool is bound to the correct video model.
- The ai-gateway status code and error in request logs.
- Whether image-to-video or reference-to-video inputs are inside allowed read roots.
