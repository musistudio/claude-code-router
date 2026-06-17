"use strict";

const fs = require("node:fs");
const { app, BrowserWindow, session } = require("electron");

const proxyUrl = "http://127.0.0.1:3456";
const targetUrl = "https://claude.ai/design";
const resultFile = "/private/tmp/claude-design-introspect.json";

app.commandLine.appendSwitch("proxy-server", proxyUrl);
app.commandLine.appendSwitch("ignore-certificate-errors");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  await app.whenReady();
  await session.defaultSession.setProxy({
    proxyRules: proxyUrl,
    proxyBypassRules: "<-loopback>"
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
  await delay(3000);

  const result = await window.webContents.executeJavaScript(
    `(async () => {
      const mod = await import("/design/assets/connectrpc-BaFKc3vq.js");
      const main = await import("/design/assets/index-BxFzSrWf.js");
      const summary = {};
      for (const [key, value] of Object.entries(mod)) {
        let string = "";
        try {
          string = typeof value === "function" ? Function.prototype.toString.call(value).slice(0, 300) : Object.prototype.toString.call(value);
        } catch (error) {
          string = error instanceof Error ? error.message : String(error);
        }
        summary[key] = {
          type: typeof value,
          keys: value && typeof value === "object" ? Object.keys(value).slice(0, 30) : [],
          string
        };
      }
      summary.__main_g = {
        type: typeof main.g,
        string: typeof main.g === "function" ? Function.prototype.toString.call(main.g).slice(0, 500) : ""
      };
      try {
        const client = main.g();
        summary.__client = {
          keys: Object.keys(client).slice(0, 100),
          createProject: summarizeValue(client.createProject),
          listProjects: summarizeValue(client.listProjects),
          getProject: summarizeValue(client.getProject)
        };
      } catch (error) {
        summary.__clientError = error instanceof Error ? error.stack || error.message : String(error);
      }
      try {
        const service = main.bx?.getOmeletteClient ? null : null;
        const mainKeys = Object.entries(main).filter(([, value]) => value && typeof value === "object");
        summary.__objectsWithMethods = mainKeys.map(([key, value]) => ({
          key,
          keys: Reflect.ownKeys(value).map(String).filter((name) => /project|service|method|field|type|proto|omelette/i.test(name)).slice(0, 80)
        })).filter((entry) => entry.keys.length > 0).slice(0, 100);
      } catch (error) {
        summary.__objectScanError = error instanceof Error ? error.stack || error.message : String(error);
      }
      function summarizeValue(value) {
        const out = {
          type: typeof value,
          ownKeys: value && (typeof value === "object" || typeof value === "function") ? Reflect.ownKeys(value).map(String).slice(0, 50) : [],
          string: ""
        };
        try {
          out.string = typeof value === "function" ? Function.prototype.toString.call(value).slice(0, 1000) : Object.prototype.toString.call(value);
        } catch (error) {
          out.string = error instanceof Error ? error.message : String(error);
        }
        if (value && (typeof value === "object" || typeof value === "function")) {
          out.props = {};
          for (const key of Reflect.ownKeys(value).slice(0, 20)) {
            try {
              const prop = value[key];
              out.props[String(key)] = {
                type: typeof prop,
                keys: prop && typeof prop === "object" ? Reflect.ownKeys(prop).map(String).slice(0, 30) : [],
                string: typeof prop === "function" ? Function.prototype.toString.call(prop).slice(0, 300) : Object.prototype.toString.call(prop)
              };
            } catch (error) {
              out.props[String(key)] = { error: error instanceof Error ? error.message : String(error) };
            }
          }
        }
        return out;
      }
      return summary;
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
