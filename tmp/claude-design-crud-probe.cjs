"use strict";

const fs = require("node:fs");
const { app, BrowserWindow, session } = require("electron");

const proxyUrl = "http://127.0.0.1:3456";
const targetUrl = "https://claude.ai/design";
const resultFile = "/private/tmp/claude-design-crud-probe.json";
const screenshotFile = "/private/tmp/claude-design-crud-probe.png";

app.commandLine.appendSwitch("proxy-server", proxyUrl);
app.commandLine.appendSwitch("ignore-certificate-errors");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const consoleMessages = [];
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    consoleMessages.push({ level, line, message, sourceId });
  });

  await window.loadURL(targetUrl).catch(() => {});
  await delay(2500);

  const result = await window.webContents.executeJavaScript(
    `(async () => {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const skip = Array.from(document.querySelectorAll("button")).find((element) => element.innerText.trim() === "Skip intro");
      if (skip) {
        skip.click();
        await delay(500);
      }
      const main = await import("/design/assets/index-BxFzSrWf.js");
      const client = main.by.getOmeletteClient();
      const created = await client.createProject({ name: "Full CRUD Probe", type: 1 });
      const projectId = created.projectId;
      await client.updateProject({ projectId, name: "Full CRUD Probe Renamed" });
      const written = await client.writeFiles({
        projectId,
        files: [
          { path: "index.html", data: "<!doctype html><h1>SQLite CRUD Page</h1>", mimeType: "text/html" },
          { path: "styles/site.css", data: "body { color: #111; }", mimeType: "text/css" }
        ]
      });
      const listed = await client.listFiles({ projectId, path: "", depth: 1 });
      const read = await client.getFile({ projectId, path: "index.html", raw: true });
      await client.updateSharing({ projectId, viewMode: "team", teamCanEdit: true, teamCanComment: true });
      await client.setProjectPublished({ projectId, published: true });
      await client.updateProjectType({ projectId, type: 3 });
      const orgList = await client.listOrgProjects({ type: 3, publishedOnly: true });
      return {
        fileText: new TextDecoder().decode(read.content),
        listed: listed.entries.map((entry) => ({ name: entry.name, path: entry.path, type: entry.type, version: String(entry.version || "") })),
        orgList: orgList.items.map((item) => ({ name: item.name, projectId: item.projectId, type: item.type, published: Boolean(item.publishedAt) })),
        projectId,
        title: document.title,
        written: written.files.map((file) => ({ path: file.path, version: String(file.version || "") }))
      };
    })()`,
    true
  );

  await window.loadURL(`https://claude.ai/design/p/${result.projectId}`).catch(() => {});
  await delay(3500);
  const page = await window.webContents.executeJavaScript(
    `({
      text: document.body.innerText.slice(0, 3000),
      title: document.title,
      url: location.href
    })`,
    true
  );

  const image = await window.webContents.capturePage();
  fs.writeFileSync(screenshotFile, image.toPNG());
  fs.writeFileSync(resultFile, `${JSON.stringify({ consoleMessages: consoleMessages.slice(-20), page, result, screenshotFile }, null, 2)}\n`, "utf8");
  window.destroy();
  app.quit();
}

main().catch((error) => {
  fs.writeFileSync(resultFile, `${JSON.stringify({ error: error instanceof Error ? error.stack || error.message : String(error) }, null, 2)}\n`, "utf8");
  app.exit(1);
});
