"use strict";

const fs = require("node:fs");
const { app, BrowserWindow, session } = require("electron");

const proxyUrl = "http://127.0.0.1:3456";
const targetUrl = "https://claude.ai/design";
const resultFile = "/private/tmp/claude-design-browser-smoke.json";
const screenshotFile = "/private/tmp/claude-design-browser-smoke.png";

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

  let loadError;
  try {
    await Promise.race([
      window.loadURL(targetUrl),
      delay(15000).then(() => {
        throw new Error("Timed out waiting for page load.");
      })
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  await delay(3000);

  const skippedIntro = await window.webContents
    .executeJavaScript(
      `(() => {
        const button = Array.from(document.querySelectorAll("button")).find((element) => element.innerText.trim() === "Skip intro");
        if (!button) {
          return false;
        }
        button.click();
        return true;
      })()`,
      true
    )
    .catch(() => false);

  if (skippedIntro) {
    await delay(1000);
  }

  const pageState = await window.webContents
    .executeJavaScript(
      `({
        bodyText: document.body ? document.body.innerText.slice(0, 2000) : "",
        hasOmeletteMe: Boolean(window.__OMELETTE_ME__),
        rootText: document.getElementById("root") ? document.getElementById("root").innerText.slice(0, 2000) : "",
        title: document.title,
        url: location.href
      })`,
      true
    )
    .catch((error) => ({
      evaluateError: error instanceof Error ? error.message : String(error)
    }));

  const image = await window.webContents.capturePage();
  fs.writeFileSync(screenshotFile, image.toPNG());
  fs.writeFileSync(
    resultFile,
    `${JSON.stringify(
      {
        loadError,
        pageState,
        proxyUrl,
        screenshotFile,
        skippedIntro,
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
        proxyUrl,
        targetUrl
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  app.exit(1);
});
