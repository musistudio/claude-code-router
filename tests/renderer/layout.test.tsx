import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GatewayStartupErrorBanner } from "../../packages/ui/src/pages/home/components/layout.tsx";
import { AppI18nContext, appCopy } from "../../packages/ui/src/pages/home/shared/i18n.tsx";

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
