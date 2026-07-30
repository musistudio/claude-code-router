import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge } from "@ccr/ui/components/ui/badge.tsx";
import { Button } from "@ccr/ui/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@ccr/ui/components/ui/card.tsx";
import { Checkbox } from "@ccr/ui/components/ui/checkbox.tsx";
import { Input } from "@ccr/ui/components/ui/input.tsx";
import { Label } from "@ccr/ui/components/ui/label.tsx";
import { PopoverPortal } from "@ccr/ui/components/ui/popover.tsx";
import { Select } from "@ccr/ui/components/ui/select.tsx";
import { Switch } from "@ccr/ui/components/ui/switch.tsx";
import { Tabs, TabsList, TabsTrigger } from "@ccr/ui/components/ui/tabs.tsx";
import { Textarea } from "@ccr/ui/components/ui/textarea.tsx";
import { Tooltip, TooltipPortal } from "@ccr/ui/components/ui/tooltip.tsx";
import { collapseSidebarToExpandInspectorMorph, playPauseMorph } from "@ccr/ui/lib/morph-icon.ts";

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

test("Select marks the control and native options for theme-aware rendering", () => {
  const html = renderToStaticMarkup(
    <Select options={[
      { label: "System", value: "system" },
      { label: "Dark", value: "dark" }
    ]} value="dark" />
  );

  assert.match(html, /theme-aware-select/);
  assert.equal((html.match(/theme-aware-select-option/g) ?? []).length, 2);
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
  assert.match(html, /var\(--card-inset-highlight\)/);
  assert.doesNotMatch(html, /rgba\(255,255,255,0\.5\)/);
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

test("Tabs render shadcn-style state and tab semantics", () => {
  const html = renderToStaticMarkup(
    <Tabs value="pool">
      <TabsList aria-label="Credential method">
        <TabsTrigger value="apiKey">API key</TabsTrigger>
        <TabsTrigger value="pool">Credential pool</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  assert.match(html, /role="tablist"/);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 2);
  assert.match(html, /<button[^>]*data-state="active"[^>]*>Credential pool<\/button>/);
  assert.match(html, /<button[^>]*aria-selected="true"[^>]*>Credential pool<\/button>/);
  assert.match(html, /<button[^>]*data-state="inactive"[^>]*>API key<\/button>/);
  assert.match(html, /<button[^>]*aria-selected="false"[^>]*>API key<\/button>/);
});

test("Tooltip renders only its trigger during server rendering", () => {
  const html = renderToStaticMarkup(
    <Tooltip content="Copy CLI command">
      <button type="button">Copy</button>
    </Tooltip>
  );
  const portalHtml = renderToStaticMarkup(
    <TooltipPortal>Copy CLI command</TooltipPortal>
  );

  assert.match(html, /data-ui-tooltip-trigger/);
  assert.match(html, /<button type="button">Copy<\/button>/);
  assert.doesNotMatch(html, /role="tooltip"/);
  assert.equal(portalHtml, "");
});

test("PopoverPortal renders outside the server tree", () => {
  const html = renderToStaticMarkup(
    <PopoverPortal>
      <div role="listbox">Options</div>
    </PopoverPortal>
  );

  assert.equal(html, "");
});

test("form primitives preserve native semantics, state, and caller styling", () => {
  const checkboxHtml = renderToStaticMarkup(
    <Checkbox aria-label="Select provider" checked className="provider-checkbox" disabled />
  );
  const inputHtml = renderToStaticMarkup(
    <Input aria-label="Provider name" className="provider-input" placeholder="Example AI" readOnly />
  );
  const labelHtml = renderToStaticMarkup(
    <Label className="provider-label" htmlFor="provider-name">Provider</Label>
  );
  const textareaHtml = renderToStaticMarkup(
    <Textarea aria-label="Models" className="models-textarea" disabled placeholder="model-a" />
  );

  assert.match(checkboxHtml, /type="checkbox"/);
  assert.match(checkboxHtml, /aria-checked="true"/);
  assert.match(checkboxHtml, /provider-checkbox/);
  assert.match(checkboxHtml, /disabled=""/);

  assert.match(inputHtml, /^<input /);
  assert.match(inputHtml, /placeholder="Example AI"/);
  assert.match(inputHtml, /readonly=""/);
  assert.match(inputHtml, /provider-input/);

  assert.match(labelHtml, /^<label /);
  assert.match(labelHtml, /for="provider-name"/);
  assert.match(labelHtml, /provider-label/);
  assert.match(labelHtml, />Provider<\/label>$/);

  assert.match(textareaHtml, /^<textarea /);
  assert.match(textareaHtml, /placeholder="model-a"/);
  assert.match(textareaHtml, /models-textarea/);
  assert.match(textareaHtml, /disabled=""/);
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
