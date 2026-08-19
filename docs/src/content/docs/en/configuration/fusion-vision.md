---
title: Built-in vision
pageTitle: Built-in vision
eyebrow: Fusion
lead: Give a non-multimodal model visual ability, for example GLM-5.2 + GLM-5V-Turbo = GLM-5.2V.
---

## Capability composition

Built-in vision connects a vision model in front of the base model without replacing the text model you already trust. The vision model understands images, screenshots, charts, and OCR content; CCR passes that visual result to the base model, which continues to handle reasoning, writing, coding, and final output.

The combined Fusion model can be selected by routing or Agent Profiles like any other model. A typical form is:

```text
GLM-5.2 + GLM-5V-Turbo = GLM-5.2V
```

This keeps the familiar text model while adding visual input support, so a non-multimodal model can still work with image context.

This also applies to Codex computer use. After combining GLM-5.2 with GLM-5V-Turbo, GLM-5.2 can receive screen, screenshot, and UI information prepared by the vision model, then use Codex computer use for observation, judgment, and follow-up action planning.

## Select the capability

Select `ccr-fusion-builtins / vision_understand`, and choose a Vision model that actually supports image understanding.

You can also configure Vision retries and Vision fallback models. These retries apply to the built-in vision tool call itself: if the Vision model fails while preparing image context, CCR retries that Vision model first, then tries the configured fallback Vision models. The base text model remains unchanged.

## Model requirement

The Vision model determines image, screenshot, chart, and OCR understanding quality. The base model determines the final answer style, reasoning ability, and coding ability.

## Troubleshooting

When image requests fail, relevant details include whether the Vision model supports visual input, the configured Vision retry count and fallback models, and any Fusion tool errors in Logs.
