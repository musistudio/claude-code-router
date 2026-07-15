import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge } from "../../packages/ui/src/components/ui/badge.tsx";
import { Button } from "../../packages/ui/src/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../../packages/ui/src/components/ui/card.tsx";
import { Switch } from "../../packages/ui/src/components/ui/switch.tsx";
import { collapseSidebarToExpandInspectorMorph, playPauseMorph } from "../../packages/ui/src/lib/morph-icon.ts";

test("Button renders default button semantics and variant classes", () => {
  const html = renderToStaticMarkup(
    <Button className="extra-action" size="iconSm" variant="outline">
      Run
    </Button>
  );

  assert.match(html, /^<button /);
  assert.match(html, /type="button"/);
  assert.match(html, /border-input/);
  assert.match(html, /h-7/);
  assert.match(html, /w-7/);
  assert.match(html, /extra-action/);
  assert.match(html, />Run<\/button>$/);
});

test("Button unstyled mode keeps caller supplied styling only", () => {
  const html = renderToStaticMarkup(
    <Button className="plain-button" unstyled>
      Plain
    </Button>
  );

  assert.match(html, /class="plain-button"/);
  assert.match(html, /type="button"/);
  assert.doesNotMatch(html, /inline-flex/);
});

test("Badge renders the selected visual variant", () => {
  const html = renderToStaticMarkup(
    <Badge className="status-badge" variant="warning">
      Delayed
    </Badge>
  );

  assert.match(html, /^<span /);
  assert.match(html, /text-amber-700/);
  assert.match(html, /bg-amber-50/);
  assert.match(html, /status-badge/);
  assert.match(html, />Delayed<\/span>$/);
});

test("Card primitives compose the expected document structure", () => {
  const html = renderToStaticMarkup(
    <Card className="settings-card">
      <CardHeader>
        <CardTitle>Provider settings</CardTitle>
      </CardHeader>
      <CardContent>Ready</CardContent>
    </Card>
  );

  assert.match(html, /^<div /);
  assert.match(html, /settings-card/);
  assert.match(html, /<h2 class="[^"]*text-\[13px\][^"]*">Provider settings<\/h2>/);
  assert.match(html, /<div class="p-4">Ready<\/div>/);
});

test("Switch renders accessible checked and disabled state", () => {
  const html = renderToStaticMarkup(
    <Switch aria-label="Enable provider" checked className="provider-switch" disabled />
  );

  assert.match(html, /provider-switch/);
  assert.match(html, /role="switch"/);
  assert.match(html, /aria-checked="true"/);
  assert.match(html, /aria-label="Enable provider"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /translate-x-\[24px\]/);
});

test("control morph assets interpolate directly without loading keyframes", () => {
  for (const asset of [collapseSidebarToExpandInspectorMorph, playPauseMorph]) {
    assert.equal(asset.loading, undefined);
    assert.ok(asset.layers.length > 0);
    for (const layer of asset.layers) {
      assert.equal(layer.loading, undefined);
      assert.equal(layer.loadingOpacity, undefined);
    }
  }
});
