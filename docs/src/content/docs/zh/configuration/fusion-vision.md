---
title: 内置图像能力
pageTitle: 内置图像能力
eyebrow: Fusion
lead: 让不支持多模态的模型拥有视觉能力，例如 GLM-5.2 + GLM-5V-Turbo = GLM-5.2V。
---

## 能力组合

内置图像能力会把视觉模型作为能力层接到基础模型前面，不需要替换你原本熟悉的文本模型。视觉模型负责理解图片、截图、图表或 OCR 内容，CCR 将视觉结果整理给基础模型，基础模型继续负责推理、写作、代码生成和最终输出。

组合后的 Fusion 模型可以像普通模型一样被路由或配置选择。典型形式是：

```text
GLM-5.2 + GLM-5V-Turbo = GLM-5.2V
```

这类组合适合把熟悉的文本模型保留下来，同时补上视觉输入能力，让不支持多模态的模型也能处理图片上下文。

这个方法也适用于 Codex 的 computer use 场景。将 GLM-5.2 与 GLM-5V-Turbo 组合后，GLM-5.2 可以接收由视觉模型整理后的屏幕、截图和界面信息，从而使用 Codex 的 computer use 能力完成观察、判断和后续操作规划。

## 选择能力

选择 `ccr-fusion-builtins / vision_understand`，并为 Vision model 选择真正支持图像理解的模型。

## 模型要求

Vision model 决定图片、截图、图表和 OCR 内容的理解质量。基础模型决定最终回答的风格、推理能力和代码能力。

## 排查要点

图像请求失败时，相关信息包括 Vision model 是否支持视觉输入，以及请求日志中的 Fusion 工具调用报错。
