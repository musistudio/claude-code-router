"use strict";

const fs = require("node:fs");
const { app, BrowserWindow, session } = require("electron");

const proxyUrl = "http://127.0.0.1:3456";
const projectId = process.argv[2] || "95fcd943-8798-43e8-98e1-6201bbf0f9fa";
const baseUrl = (process.argv[3] || "https://claude.ai").replace(/\/$/, "");
const targetUrl = `${baseUrl}/design/p/${projectId}`;
const useProxy = baseUrl === "https://claude.ai";
const resultFile = "/private/tmp/claude-design-sidebar-probe.json";
const screenshotFile = "/private/tmp/claude-design-sidebar-probe.png";

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
    height: 820,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    width: 1440
  });

  const consoleMessages = [];
  const failedLoads = [];
  const completedLoads = [];

  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    consoleMessages.push({ level, line, message, sourceId });
  });
  window.webContents.session.webRequest.onCompleted({ urls: ["<all_urls>"] }, (details) => {
    completedLoads.push({
      method: details.method,
      statusCode: details.statusCode,
      url: details.url
    });
  });
  window.webContents.session.webRequest.onErrorOccurred({ urls: ["<all_urls>"] }, (details) => {
    failedLoads.push({
      error: details.error,
      method: details.method,
      url: details.url
    });
  });

  let loadError;
  try {
    await Promise.race([
      window.loadURL(targetUrl),
      delay(20000).then(() => {
        throw new Error("Timed out waiting for page load.");
      })
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  await delay(8000);

  const pageState = await window.webContents.executeJavaScript(
    `(() => {
      const visibleText = document.body ? document.body.innerText : "";
      const loadingNodes = Array.from(document.querySelectorAll("*"))
        .filter((node) => /loading|加载/i.test(node.innerText || "") || /progressbar|status/i.test(node.getAttribute("role") || ""))
        .slice(0, 40)
        .map((node) => ({
          ariaLabel: node.getAttribute("aria-label"),
          className: String(node.className || "").slice(0, 240),
          id: node.id || "",
          role: node.getAttribute("role"),
          tag: node.tagName,
          text: (node.innerText || "").slice(0, 500)
        }));
      const panels = Array.from(document.querySelectorAll("aside, nav, [role='navigation'], [data-testid], [class*='sidebar'], [class*='Side'], [class*='panel'], [class*='Panel']"))
        .slice(0, 80)
        .map((node) => ({
          ariaLabel: node.getAttribute("aria-label"),
          className: String(node.className || "").slice(0, 240),
          dataTestId: node.getAttribute("data-testid"),
          role: node.getAttribute("role"),
          tag: node.tagName,
          text: (node.innerText || "").slice(0, 800)
        }));
      return {
        bodyText: visibleText.slice(0, 5000),
        hasOmeletteMe: Boolean(window.__OMELETTE_ME__),
        loadingNodes,
        panels,
        title: document.title,
        url: location.href
      };
    })()`,
    true
  ).catch((error) => ({
    evaluateError: error instanceof Error ? error.stack || error.message : String(error)
  }));

  const image = await window.webContents.capturePage();
  fs.writeFileSync(screenshotFile, image.toPNG());
  fs.writeFileSync(
    resultFile,
    `${JSON.stringify(
      {
        completedLoads: completedLoads.slice(-120),
        consoleMessages: consoleMessages.slice(-80),
        failedLoads,
        loadError,
        pageState,
        projectId,
        proxyUrl,
        screenshotFile,
        useProxy,
        targetUrl
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  window.destroy();
  app.quit();
}

main().catch((error) => {
  fs.writeFileSync(
    resultFile,
    `${JSON.stringify(
      {
        error: error instanceof Error ? error.stack || error.message : String(error),
        projectId,
        proxyUrl,
        useProxy,
        targetUrl
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  app.exit(1);
});
