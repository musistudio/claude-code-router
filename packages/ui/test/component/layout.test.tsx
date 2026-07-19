import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GatewayStartupErrorBanner } from "@ccr/ui/pages/home/components/layout.tsx";
import { MediaModelConfigurationPanel, VirtualModelsView } from "@ccr/ui/pages/home/components/virtual-models.tsx";
import { AppI18nContext, appCopy } from "@ccr/ui/pages/home/shared/i18n.tsx";
import { createVirtualModelDraft } from "@ccr/ui/pages/home/shared/virtual-models.ts";
import { appConfigFixture } from "../fixtures/index.ts";

test("GatewayStartupErrorBanner renders startup failure details", () => {
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <GatewayStartupErrorBanner message="没有可用模型。请先配置供应商。" onOpenServerSettings={() => undefined} />
    </AppI18nContext.Provider>
  );

  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="assertive"/);
  assert.match(html, /服务启动失败/);
  assert.match(html, /没有可用模型。请先配置供应商。/);
  assert.match(html, />服务<\/button>/);
});

test("GatewayStartupErrorBanner stays hidden without a failure message", () => {
  const html = renderToStaticMarkup(<GatewayStartupErrorBanner message="" />);

  assert.equal(html, "");
});

test("Fusion page does not render a standalone Grok media panel", () => {
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <VirtualModelsView
        addVirtualModel={() => undefined}
        editVirtualModel={() => undefined}
        profiles={[]}
        removeVirtualModel={() => undefined}
        setVirtualModelEnabled={() => undefined}
      />
    </AppI18nContext.Provider>
  );

  assert.doesNotMatch(html, /Grok 生图与生视频/);
  assert.doesNotMatch(html, /Fusion 内置工具/);
});

test("media tool configuration renders a generic provider model selector without backend settings", () => {
  const config = appConfigFixture();
  config.Providers = [{
    apikey: "provider-key",
    baseUrl: "https://media.example/v1",
    capabilities: [{ baseUrl: "https://media.example/v1", type: "openai_image_generations" }],
    models: ["image-model"],
    name: "Media Provider"
  }];
  const draft = createVirtualModelDraft(config);
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <MediaModelConfigurationPanel
        draft={draft}
        kind="image"
        modelOptions={[{ label: "Media Provider/Image Model", value: "Media Provider/image-model" }]}
        onChange={() => undefined}
      />
    </AppI18nContext.Provider>
  );

  assert.match(html, /图片模型/);
  assert.match(html, /Media Provider\/Image Model/);
  assert.match(html, /ai-gateway/);
  assert.match(html, /Grok Agent/);
  assert.doesNotMatch(html, /Grok CLI（内置）/);
  assert.doesNotMatch(html, /API Key|允许读取图片|产物保留|图片并发|视频并发|执行后端/);
});
