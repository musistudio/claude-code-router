"use strict";

const fs = require("node:fs");
const { app, BrowserWindow, session } = require("electron");

const proxyUrl = "http://127.0.0.1:3456";
const targetUrl = "https://claude.ai/design";
const resultFile = "/private/tmp/claude-design-create-probe.json";
const screenshotFile = "/private/tmp/claude-design-create-probe.png";

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

  const consoleMessages = [];
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    consoleMessages.push({ level, line, message, sourceId });
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

  const actionResult = await window.webContents.executeJavaScript(
    `(async () => {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const skip = Array.from(document.querySelectorAll("button")).find((element) => element.innerText.trim() === "Skip intro");
      if (skip) {
        skip.click();
        await delay(800);
      }
      const input = document.querySelector("input[placeholder='Project name']");
      if (!input) {
        return { ok: false, reason: "missing-project-name-input", text: document.body.innerText.slice(0, 2000) };
      }
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "SQLite Mock Project");
      input.dispatchEvent(new InputEvent("input", { bubbles: true, data: "SQLite Mock Project", inputType: "insertText" }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await delay(800);
      const create = Array.from(document.querySelectorAll("button")).find((element) => element.innerText.trim() === "Create");
      if (!create) {
        return { ok: false, reason: "missing-create-button", text: document.body.innerText.slice(0, 2000) };
      }
      const disabled = create.disabled || create.getAttribute("aria-disabled") === "true";
      if (!disabled) {
        create.click();
      }
      await delay(2500);
      return {
        disabled,
        ok: true,
        text: document.body.innerText.slice(0, 3000),
        title: document.title,
        url: location.href
      };
    })()`,
    true
  );

  const image = await window.webContents.capturePage();
  fs.writeFileSync(screenshotFile, image.toPNG());
  fs.writeFileSync(
    resultFile,
    `${JSON.stringify(
      {
        actionResult,
        consoleMessages: consoleMessages.slice(-20),
        loadError,
        proxyUrl,
        screenshotFile,
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
