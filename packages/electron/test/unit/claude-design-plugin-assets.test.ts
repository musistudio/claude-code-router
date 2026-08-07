import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const previousTestExports = process.env.CCR_CLAUDE_DESIGN_PLUGIN_TEST_EXPORTS;
process.env.CCR_CLAUDE_DESIGN_PLUGIN_TEST_EXPORTS = "1";
const claudeDesignPlugin = require(path.resolve(
  process.cwd(),
  "packages",
  "electron",
  "bundled-plugins",
  "claude-design",
  "index.cjs"
));
if (previousTestExports === undefined) {
  delete process.env.CCR_CLAUDE_DESIGN_PLUGIN_TEST_EXPORTS;
} else {
  process.env.CCR_CLAUDE_DESIGN_PLUGIN_TEST_EXPORTS = previousTestExports;
}

test("Claude Design local asset discovery supports public, design, and assets roots", () => {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "ccr-claude-design-assets-"));
  try {
    const publicRoot = path.join(fixtureRoot, "public");
    const designRoot = path.join(publicRoot, "design");
    const assetsRoot = path.join(designRoot, "assets");
    const v1Root = path.join(assetsRoot, "v1");
    const designSystemsRoot = path.join(designRoot, "design-systems");
    mkdirSync(v1Root, { recursive: true });
    mkdirSync(designSystemsRoot, { recursive: true });
    writeFileSync(
      path.join(v1Root, "index-BLOCAL123.js"),
      "console.log('__OMELETTE_ME__ /v1/design createRoot ProjectPage');",
      "utf8"
    );
    writeFileSync(path.join(v1Root, "index-CLOCAL123.css"), "body{color:#111}", "utf8");
    writeFileSync(
      path.join(designRoot, "index.html"),
      [
        "<!doctype html>",
        "<html>",
        "<head>",
        "<script>globalThis.__OMELETTE_ME__={}</script>",
        '<script type="module" src="/design/assets/v1/index-BLOCAL123.js"></script>',
        '<link rel="stylesheet" href="/design/assets/v1/index-CLOCAL123.css">',
        "</head>",
        '<body><div id="root"></div></body>',
        "</html>"
      ].join(""),
      "utf8"
    );
    writeFileSync(path.join(designSystemsRoot, "manifest.json"), JSON.stringify({ systems: [] }), "utf8");

    for (const assetDir of [publicRoot, designRoot, assetsRoot]) {
      const discovered = claudeDesignPlugin.__test.discoverLocalDesignIndexAssets(assetDir);
      assert.equal(discovered?.source, "local");
      assert.equal(discovered?.scriptPath, "/design/assets/v1/index-BLOCAL123.js");
      assert.equal(discovered?.stylePath, "/design/assets/v1/index-CLOCAL123.css");
      assert.match(discovered?.html || "", /index-BLOCAL123\.js/);

      const localScript = claudeDesignPlugin.__test.readLocalAsset(assetDir, "/design/assets/v1/index-BLOCAL123.js");
      assert.equal(localScript?.contentType, "application/javascript; charset=utf-8");
      assert.match(localScript?.body.toString("utf8") || "", /ProjectPage/);
    }

    for (const assetDir of [publicRoot, designRoot]) {
      const manifest = claudeDesignPlugin.__test.readLocalAsset(assetDir, "/design/design-systems/manifest.json");
      assert.equal(manifest?.contentType, "application/json; charset=utf-8");
      assert.deepEqual(JSON.parse(manifest?.body.toString("utf8") || ""), { systems: [] });
    }
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("Claude Design local shell keeps official UI flags while replacing account identity", () => {
  const shellMe = {
    accountUuid: "real-account-uuid",
    organizationUuid: "real-org-uuid",
    email: "real-user@example.com",
    displayName: "Real User",
    growthbookPayload: JSON.stringify({
      features: {
        "3252999076": {
          defaultValue: "template_tray"
        },
        "custom-shell-flag": {
          defaultValue: true
        }
      },
      hashing_algorithm: "djb2"
    }),
    hasProjects: true,
    modelPresets: [
      {
        id: "remote-only-model",
        label: "Remote Only"
      }
    ]
  };
  const runtimeMe = {
    accountUuid: "00000000-0000-4000-8000-000000000001",
    organizationUuid: "00000000-0000-4000-8000-000000000002",
    email: "claude-code-router@example.local",
    displayName: "Claude Code Router",
    growthbookPayload: "{}",
    defaultModelId: "glm-5.2",
    modelPresets: [
      {
        id: "glm-5.2",
        label: "GLM 5.2"
      }
    ]
  };
  const html = [
    "<!doctype html>",
    "<html>",
    "<head></head>",
    "<body>",
    `<script type="application/json" id="omelette-me">${JSON.stringify(shellMe)}</script>`,
    '<div id="root"></div>',
    "</body>",
    "</html>"
  ].join("");

  const rendered = claudeDesignPlugin.__test.injectDesignMeIntoHtml(html, runtimeMe);
  const match = /<script\b(?=[^>]*\bid=["']omelette-me["'])[^>]*>([\s\S]*?)<\/script>/i.exec(rendered);
  assert.ok(match, "expected rendered shell to include omelette-me JSON");
  const injectedMe = JSON.parse(match[1]);
  const injectedGrowthbook = JSON.parse(injectedMe.growthbookPayload);

  assert.equal(injectedMe.accountUuid, runtimeMe.accountUuid);
  assert.equal(injectedMe.organizationUuid, runtimeMe.organizationUuid);
  assert.equal(injectedMe.email, runtimeMe.email);
  assert.equal(injectedMe.displayName, runtimeMe.displayName);
  assert.equal(injectedMe.hasProjects, true);
  assert.deepEqual(injectedMe.modelPresets, runtimeMe.modelPresets);
  assert.equal(injectedGrowthbook.features["3252999076"].defaultValue, "template_tray");
  assert.equal(injectedGrowthbook.features["custom-shell-flag"].defaultValue, true);
  assert.equal(injectedGrowthbook.hashing_algorithm, "djb2");
  assert.equal(rendered.includes("real-user@example.com"), false);
  assert.equal(rendered.includes("real-account-uuid"), false);
});

test("Claude Design mock covers local frontend project runtime routes", async () => {
  const runtime = fakeClaudeDesignRuntime();
  const jsonHeaders = {
    "connect-protocol-version": "1",
    "content-type": "application/json"
  };

  for (const rpcName of ["GetProjectPresence", "GetPrepaidBalance", "GoogleGetStatus", "GetParkedMessage", "CancelChat"]) {
    const response = await claudeDesignPlugin.__test.routeMockRequest(
      runtime,
      "POST",
      new URL(`http://127.0.0.1/design/anthropic.omelette.api.v1alpha.OmeletteService/${rpcName}`),
      { headers: jsonHeaders },
      Buffer.from(JSON.stringify({ projectId: "project-local-test" }), "utf8")
    );
    assert.equal(response.status, 200);
    assert.match(response.headers["content-type"], /application\/json/);
  }

  const parkedMessageProto = await claudeDesignPlugin.__test.routeMockRequest(
    runtime,
    "POST",
    new URL("http://127.0.0.1/design/anthropic.omelette.api.v1alpha.OmeletteService/GetParkedMessage"),
    { headers: { "content-type": "application/proto" } },
    Buffer.alloc(0)
  );
  assert.equal(parkedMessageProto.status, 200);
  assert.deepEqual([...parkedMessageProto.body], [0x08, 0x01]);

  const preview = await claudeDesignPlugin.__test.routeMockRequest(
    runtime,
    "GET",
    new URL("http://127.0.0.1/_t/local-preview-token/v1/design/projects/project-local-test/serve/index.html"),
    { headers: {} },
    Buffer.alloc(0)
  );
  assert.equal(preview.status, 200);
  assert.match(preview.headers["content-type"], /text\/html/);
  assert.match(String(preview.body), /Claude Design preview pending/);

  const events = await claudeDesignPlugin.__test.routeMockRequest(
    runtime,
    "GET",
    new URL("http://127.0.0.1/design/v1/design/projects/project-local-test/events?tab=tab-local-test"),
    { headers: { accept: "text/event-stream" } },
    Buffer.alloc(0)
  );
  assert.equal(events.status, 200);
  assert.match(events.headers["content-type"], /text\/event-stream/);
  assert.equal(typeof events.stream, "function");
});

function fakeClaudeDesignRuntime() {
  return {
    assetDir: "",
    frontendUrl: "http://127.0.0.1:6173/design",
    me: {
      accountUuid: "00000000-0000-4000-8000-000000000001",
      displayName: "Claude Code Router",
      email: "claude-code-router@example.local",
      organizationUuid: "00000000-0000-4000-8000-000000000002"
    },
    pluginId: "claude-design",
    store: {
      database: {
        prepare() {
          return {
            bind() {
              return this;
            },
            free() {},
            getAsObject() {
              return {};
            },
            step() {
              return false;
            }
          };
        },
        run() {}
      },
      persist() {}
    }
  };
}
