import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WebManagementAuth } from "@ccr/ui/pages/home/components/web-management-auth.tsx";

test("desktop preload and browser preview render without web authentication", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    for (const ccr of [{ getAppInfo: () => { throw new Error("Desktop RPC must not be used for web authentication"); } }, undefined]) {
      Object.defineProperty(globalThis, "window", { configurable: true, value: { ccr, localStorage: { getItem: () => "en" } } });
      assert.equal(renderToStaticMarkup(<WebManagementAuth><span>App content</span></WebManagementAuth>), "<span>App content</span>");
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
