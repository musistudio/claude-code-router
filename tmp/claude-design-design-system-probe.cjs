"use strict";

const fs = require("node:fs");
const { app, BrowserWindow, session } = require("electron");

const proxyUrl = "http://127.0.0.1:3456";
const targetUrl = "https://claude.ai/design";
const resultFile = "/private/tmp/claude-design-design-system-probe.json";

app.commandLine.appendSwitch("proxy-server", proxyUrl);
app.commandLine.appendSwitch("ignore-certificate-errors");

function stringify(value) {
  return JSON.stringify(
    value,
    (_key, item) => (typeof item === "bigint" ? item.toString() : item),
    2
  );
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
      const client = main.by.getOmeletteClient();
      const ds = await client.createProject({ name: "DS CRUD Probe", type: 3 });
      const app = await client.createProject({ name: "Project Bound To DS", type: 1 });
      await client.updateProject({ projectId: ds.projectId, name: "DS CRUD Probe Renamed" });
      const beforeDelete = await client.listOrgProjects({ type: 3 });
      const bindings = await client.updateProjectDesignSystems({
        projectId: app.projectId,
        designSystems: [{ dsProjectId: ds.projectId, syncedAtVersion: 0n }]
      });
      const boundProject = await client.getProject({ projectId: app.projectId });
      const unbound = await client.updateProjectDesignSystems({
        projectId: app.projectId,
        designSystems: []
      });
      await client.deleteProject({ projectId: ds.projectId });
      await client.deleteProject({ projectId: app.projectId });
      const afterDelete = await client.listOrgProjects({ type: 3 });
      return {
        afterDeleteIds: afterDelete.items.map((item) => item.projectId),
        beforeDeleteItems: beforeDelete.items.map((item) => ({ name: item.name, projectId: item.projectId, type: item.type })),
        bindingCount: (bindings.designSystems || []).length,
        boundDesignSystems: boundProject.designSystems || boundProject.project?.designSystems || [],
        dsProjectId: ds.projectId,
        projectId: app.projectId,
        unboundCount: (unbound.designSystems || []).length
      };
    })()`,
    true
  );

  fs.writeFileSync(resultFile, `${stringify({ result })}\n`, "utf8");
  window.destroy();
  app.quit();
}

main().catch((error) => {
  fs.writeFileSync(resultFile, `${stringify({ error: error instanceof Error ? error.stack || error.message : String(error) })}\n`, "utf8");
  app.exit(1);
});
