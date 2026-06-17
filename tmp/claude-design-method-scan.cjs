"use strict";

const fs = require("node:fs");
const { app, BrowserWindow, session } = require("electron");

const proxyUrl = "http://127.0.0.1:3456";
const targetUrl = "https://claude.ai/design";
const resultFile = "/private/tmp/claude-design-method-scan.json";

app.commandLine.appendSwitch("proxy-server", proxyUrl);
app.commandLine.appendSwitch("ignore-certificate-errors");

function ownMethodNames(value) {
  const names = new Set();
  let current = value;
  while (current && current !== Object.prototype) {
    for (const key of Reflect.ownKeys(current)) {
      if (typeof key === "string" && typeof value[key] === "function") {
        names.add(key);
      }
    }
    current = Object.getPrototypeOf(current);
  }
  return Array.from(names).sort();
}

async function main() {
  await app.whenReady();
  await session.defaultSession.setProxy({
    proxyBypassRules: "<-loopback>",
    proxyRules: proxyUrl
  });

  const window = new BrowserWindow({
    height: 720,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    width: 1280
  });

  await window.loadURL(targetUrl).catch(() => {});
  const result = await window.webContents.executeJavaScript(
    `(async () => {
      const main = await import("/design/assets/index-BxFzSrWf.js");
      const connect = await import("/design/assets/connectrpc-BaFKc3vq.js").catch((error) => ({ importError: String(error) }));
      const client = main.by.getOmeletteClient();
      const ownMethodNames = (value) => {
        const names = new Set();
        let current = value;
        while (current && current !== Object.prototype) {
          for (const key of Reflect.ownKeys(current)) {
            if (typeof key === "string" && typeof value[key] === "function") names.add(key);
          }
          current = Object.getPrototypeOf(current);
        }
        return Array.from(names).sort();
      };
      const descriptors = [];
      const seen = new WeakSet();
      const scan = (value, path, depth) => {
        if (!value || (typeof value !== "object" && typeof value !== "function") || seen.has(value) || depth > 4) return;
        seen.add(value);
        let keys = [];
        try { keys = Reflect.ownKeys(value); } catch { return; }
        if (value.kind === "service" || Array.isArray(value.methods)) {
          descriptors.push({
            path,
            kind: value.kind || null,
            name: value.name || null,
            typeName: value.typeName || null,
            methods: (value.methods || []).map((method) => ({
              kind: method.methodKind || null,
              name: method.name || null,
              localName: method.localName || null,
              input: method.input?.typeName || null,
              output: method.output?.typeName || null
            }))
          });
        }
        for (const key of keys.slice(0, 120)) {
          if (typeof key !== "string") continue;
          if (["window", "document", "globalThis", "self", "parent", "top", "opener"].includes(key)) continue;
          let child;
          try { child = value[key]; } catch { continue; }
          scan(child, path + "." + key, depth + 1);
        }
      };
      scan({ main, connect }, "mods", 0);
      return {
        clientMethods: ownMethodNames(client),
        connectKeys: Object.keys(connect).sort(),
        descriptors
      };
    })()`,
    true
  );

  fs.writeFileSync(resultFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  window.destroy();
  app.quit();
}

main().catch((error) => {
  fs.writeFileSync(resultFile, `${JSON.stringify({ error: error instanceof Error ? error.stack || error.message : String(error) }, null, 2)}\n`, "utf8");
  app.exit(1);
});
