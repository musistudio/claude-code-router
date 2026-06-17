"use strict";

const fs = require("node:fs");
const { app, BrowserWindow, session } = require("electron");

const proxyUrl = "http://127.0.0.1:3456";
const projectId = process.argv[2] || "95fcd943-8798-43e8-98e1-6201bbf0f9fa";
const baseUrl = (process.argv[3] || "https://claude.ai").replace(/\/$/, "");
const targetUrl = `${baseUrl}/design/p/${projectId}`;
const useProxy = baseUrl === "https://claude.ai";
const resultFile = "/private/tmp/claude-design-open-project-probe.json";

if (useProxy) {
  app.commandLine.appendSwitch("proxy-server", proxyUrl);
}
app.commandLine.appendSwitch("ignore-certificate-errors");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  await app.whenReady();
  if (useProxy) {
    await session.defaultSession.setProxy({
      proxyRules: proxyUrl,
      proxyBypassRules: "<-loopback>"
    });
  }

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

  const consoleMessages = [];
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    consoleMessages.push({ level, line, message, sourceId });
  });

  await window.loadURL(targetUrl).catch(() => {});
  await delay(4000);

  const result = await window.webContents.executeJavaScript(
    `(async () => {
      const main = await import("/design/assets/index-BxFzSrWf.js");
      const connect = await import("/design/assets/connectrpc-BaFKc3vq.js");
      const client = connect.cl?.connectPlatform;
      const out = {
        exports: Object.keys(main).sort(),
        connectExports: Object.keys(connect).sort(),
        clientKeys: Object.keys(client || {}).sort()
      };
      try {
        const project = await client.openProject(${JSON.stringify(projectId)});
        out.openProject = {
          keys: Object.keys(project || {}).sort(),
          data: project?.data,
          meta: project?.meta
        };
      } catch (error) {
        out.openProjectError = error instanceof Error ? error.stack || error.message : String(error);
      }
      try {
        const store = client.getStore?.(${JSON.stringify(projectId)});
        out.store = store ? Object.keys(store).sort() : null;
      } catch (error) {
        out.storeError = error instanceof Error ? error.stack || error.message : String(error);
      }
      return out;
    })()`,
    true
  ).catch((error) => ({
    evaluateError: error instanceof Error ? error.stack || error.message : String(error)
  }));

  fs.writeFileSync(
    resultFile,
    `${JSON.stringify({ baseUrl, consoleMessages, projectId, result, targetUrl }, null, 2)}\n`,
    "utf8"
  );
  window.destroy();
  app.quit();
}

main().catch((error) => {
  fs.writeFileSync(
    resultFile,
    `${JSON.stringify({ baseUrl, error: error instanceof Error ? error.stack || error.message : String(error), projectId }, null, 2)}\n`,
    "utf8"
  );
  app.exit(1);
});
