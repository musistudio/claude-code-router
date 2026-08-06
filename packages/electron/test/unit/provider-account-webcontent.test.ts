import assert from "node:assert/strict";
import test from "node:test";
import {
  createProviderAccountWebContentFetchHandler,
  providerAccountWebContentInternalsForTest
} from "@ccr/electron/main/provider-account-webcontent.ts";

test("browser account fetch handler uses built-in browser partition and sanitizes manual cookie headers", async () => {
  let browserWindowOptions: any;
  let viewOptions: any;
  let loadedUrl = "";
  let scriptRequest: any;
  let closed = false;

  class FakeBrowserWindow {
    contentView = {
      addChildView: () => undefined,
      removeChildView: () => undefined
    };

    constructor(options: any) {
      browserWindowOptions = options;
    }

    close() {
      closed = true;
    }

    isDestroyed() {
      return false;
    }
  }

  class FakeWebContentsView {
    webContents = {
      executeJavaScript: async (script: string) => {
        scriptRequest = extractSerializedRequest(script);
        return {
          byteLength: 14,
          contentType: "application/json",
          ok: true,
          status: 200,
          statusText: "OK",
          text: "{\"balance\":10}"
        };
      },
      loadURL: async (url: string) => {
        loadedUrl = url;
      }
    };

    constructor(options: any) {
      viewOptions = options;
    }

    setBounds() {
      return undefined;
    }
  }

  const handler = createProviderAccountWebContentFetchHandler({
    BrowserWindow: FakeBrowserWindow,
    WebContentsView: FakeWebContentsView,
    session: {
      fromPartition(partition: string) {
        assert.equal(partition, "persist:ccr-built-in-browser");
        return {};
      }
    }
  });

  const result = await handler({
    credentials: "omit",
    endpoint: "https://vendor.example.com/api/account",
    headerTemplates: {
      authorization: "Bearer ${localStorage.accessToken}",
      cookie: "ignored"
    },
    headers: {
      cookie: "session=secret",
      "x-csrf-token": "csrf"
    },
    method: "GET",
    provider: {
      models: [],
      name: "Vendor"
    },
    requestOrigin: "https://vendor.example.com"
  });

  assert.deepEqual(result.payload, { balance: 10 });
  assert.equal(loadedUrl, "https://vendor.example.com");
  assert.equal(closed, true);
  assert.equal(browserWindowOptions.show, false);
  assert.equal(viewOptions.webPreferences.partition, "persist:ccr-built-in-browser");
  assert.equal(scriptRequest.credentials, "omit");
  assert.equal(scriptRequest.endpoint, "https://vendor.example.com/api/account");
  assert.equal(scriptRequest.headerTemplates.authorization, "Bearer ${localStorage.accessToken}");
  assert.equal(scriptRequest.headerTemplates.cookie, undefined);
  assert.equal(scriptRequest.headers.accept, "application/json");
  assert.equal(scriptRequest.headers.cookie, undefined);
  assert.equal(scriptRequest.headers["x-csrf-token"], "csrf");
});

test("browser account fetch script renders storage header templates", async () => {
  const previousFetch = globalThis.fetch;
  const previousLocalStorage = (globalThis as any).localStorage;
  const previousSessionStorage = (globalThis as any).sessionStorage;
  let fetchInit: any;

  (globalThis as any).localStorage = {
    getItem: (key: string) => key === "accessToken" ? "access-123" : null
  };
  (globalThis as any).sessionStorage = {
    getItem: (key: string) => key === "csrf-token" ? "csrf-456" : null
  };
  (globalThis as any).fetch = async (_url: string, init: any) => {
    fetchInit = init;
    return {
      headers: {
        get: () => "application/json"
      },
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => "{\"balance\":12}"
    };
  };

  try {
    const script = providerAccountWebContentInternalsForTest.webContentFetchScript({
      credentials: "omit",
      endpoint: "https://vendor.example.com/api/account",
      headerTemplates: {
        authorization: "Bearer ${localStorage.accessToken}",
        "x-csrf-token": "${sessionStorage['csrf-token']}"
      },
      method: "GET",
      provider: {
        models: [],
        name: "Vendor"
      },
      requestOrigin: "https://vendor.example.com"
    }, 5000);
    const result = await (0, eval)(script) as any;

    assert.equal(result.ok, true);
    assert.equal(result.text, "{\"balance\":12}");
    assert.equal(fetchInit?.credentials, "omit");
    assert.equal((fetchInit?.headers as Record<string, string>).authorization, "Bearer access-123");
    assert.equal((fetchInit?.headers as Record<string, string>)["x-csrf-token"], "csrf-456");
  } finally {
    (globalThis as any).fetch = previousFetch;
    (globalThis as any).localStorage = previousLocalStorage;
    (globalThis as any).sessionStorage = previousSessionStorage;
  }
});

test("browser account fetch parser reports HTTP JSON errors", () => {
  assert.throws(
    () => providerAccountWebContentInternalsForTest.parseWebContentFetchResult({
      byteLength: 29,
      contentType: "application/json",
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: "{\"error\":{\"message\":\"login\"}}"
    }),
    /HTTP 401: login/
  );
});

test("browser account fetch parser rejects oversized responses", () => {
  assert.throws(
    () => providerAccountWebContentInternalsForTest.parseWebContentFetchResult({
      byteLength: providerAccountWebContentInternalsForTest.maxResponseBytes + 1,
      contentType: "application/json",
      ok: true,
      status: 200,
      text: ""
    }),
    /more than/
  );
});

function extractSerializedRequest(script: string): any {
  const match = script.match(/const request = (\{[\s\S]*?\});\s+const headers/);
  assert.ok(match?.[1]);
  return JSON.parse(match[1]);
}
