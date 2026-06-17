"use strict";

const fs = require("node:fs");
const { app, BrowserWindow, session } = require("electron");

const proxyUrl = "http://127.0.0.1:3456";
const targetUrl = "https://claude.ai/design";
const resultFile = "/private/tmp/claude-design-ai-probe.json";
const prompt =
  process.env.CLAUDE_DESIGN_PROMPT ||
  "帮我创建一个AI Gateway Dashboard，主要有各种指标的追踪，使用各类图表反应变化趋势";
const maxTokens = Number(process.env.CLAUDE_DESIGN_MAX_TOKENS || 2048);
const model = process.env.CLAUDE_DESIGN_MODEL || "claude-opus-4-8";

app.commandLine.appendSwitch("proxy-server", proxyUrl);
app.commandLine.appendSwitch("ignore-certificate-errors");

function timeout(ms, label) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
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
  const result = await Promise.race([
    window.webContents.executeJavaScript(
      `(async () => {
        const main = await import("/design/assets/index-BxFzSrWf.js");
        const client = main.by.getOmeletteClient();
        const created = await client.createProject({ name: "AI Gateway Probe", type: 1 });
        const messagesRequest = new TextEncoder().encode(JSON.stringify({
          max_tokens: ${JSON.stringify(maxTokens)},
          messages: [{ role: "user", content: ${JSON.stringify(prompt)} }],
          model: ${JSON.stringify(model)}
        }));
        const counted = await client.countTokens({ messagesRequest });
        const events = [];
        const normalizeEvent = (event) => {
          const value = event.event?.value;
          const normalized = {
            case: event.event?.case || null,
            n: event.n == null ? null : String(event.n)
          };
          if (normalized.case === "messageStart") {
            normalized.messageId = value?.messageId || "";
          } else if (normalized.case === "messageStop") {
            normalized.stopReason = value?.stopReason || "";
          } else if (normalized.case === "textDelta") {
            normalized.text = value?.text || "";
          } else if (normalized.case === "error") {
            normalized.message = value?.message || "";
          } else if (normalized.case === "raw") {
            normalized.eventType = value?.eventType || "";
            normalized.dataText = value?.data ? new TextDecoder().decode(value.data) : "";
          }
          return normalized;
        };
        try {
          const stream = client.chat({
            assistantMessageId: "assistant-ai-probe",
            chatId: "chat-ai-probe",
            messagesRequest,
            projectId: created.projectId
          });
          for await (const event of stream) {
            events.push(normalizeEvent(event));
            if (events.length >= 30) break;
          }
        } catch (error) {
          events.push({ thrown: error instanceof Error ? error.message : String(error) });
        }
        return {
          chatEvents: events,
          countTokens: counted,
          model: ${JSON.stringify(model)},
          prompt: ${JSON.stringify(prompt)},
          projectId: created.projectId
        };
      })()`,
      true
    ),
    timeout(20000, "AI probe")
  ]);

  fs.writeFileSync(resultFile, `${JSON.stringify({ consoleMessages: consoleMessages.slice(-20), result }, null, 2)}\n`, "utf8");
  window.destroy();
  app.quit();
}

main().catch((error) => {
  fs.writeFileSync(resultFile, `${JSON.stringify({ error: error instanceof Error ? error.stack || error.message : String(error) }, null, 2)}\n`, "utf8");
  app.exit(1);
});
