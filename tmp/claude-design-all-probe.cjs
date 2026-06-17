"use strict";

const fs = require("node:fs");
const { app, BrowserWindow, session } = require("electron");

const proxyUrl = "http://127.0.0.1:3456";
const targetUrl = "https://claude.ai/design";
const resultFile = "/private/tmp/claude-design-all-probe.json";
const screenshotFile = "/private/tmp/claude-design-all-probe.png";

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
      const main = await import("/design/assets/index-BxFzSrWf.js");
      const client = main.by.getOmeletteClient();
      const textEncoder = new TextEncoder();
      const textDecoder = new TextDecoder();
      const calls = [];

      const clean = (value, depth = 0) => {
        if (depth > 6) return "[depth]";
        if (value == null) return value;
        if (typeof value === "bigint") return value.toString();
        if (value instanceof Uint8Array) {
          const text = value.length <= 4096 ? textDecoder.decode(value) : "";
          return { bytes: value.length, text: text.slice(0, 500) };
        }
        if (Array.isArray(value)) return value.map((item) => clean(item, depth + 1));
        if (typeof value === "object") {
          const out = {};
          for (const [key, item] of Object.entries(value)) out[key] = clean(item, depth + 1);
          return out;
        }
        return value;
      };

      const call = async (name, fn) => {
        try {
          const value = await fn();
          const cleaned = clean(value);
          calls.push({ name, ok: true, value: cleaned });
          return value;
        } catch (error) {
          calls.push({ name, ok: false, error: error instanceof Error ? error.stack || error.message : String(error) });
          return undefined;
        }
      };

      const created = await call("createProject", () => client.createProject({ name: "All Function Probe", type: 1 }));
      const projectId = created?.projectId || "";
      await call("writeFiles", () => client.writeFiles({
        projectId,
        files: [
          { path: "index.html", data: "<!doctype html><html><body><h1>All Function Probe</h1></body></html>", mimeType: "text/html" },
          { path: "notes.md", data: "# Probe", mimeType: "text/markdown" }
        ]
      }));
      await call("updateProjectData", () => client.updateProjectData({
        projectId,
        data: textEncoder.encode(JSON.stringify({
          name: "All Function Probe",
          created: new Date().toISOString(),
          lastOpened: new Date().toISOString(),
          activeSkills: [],
          chats: {
            "chat-probe": {
              id: "chat-probe",
              name: "Probe Chat",
              created: new Date().toISOString(),
              lastOpened: new Date().toISOString(),
              messages: [{ id: "user-probe", role: "user", content: "hello", timestamp: new Date().toISOString() }],
              composer: { text: "", attachments: [], activeSkills: [] },
              todos: []
            }
          },
          closedChats: [],
          viewState: { activeProjectTab: 0, activeChatId: "chat-probe", activeFileTab: -1, openFiles: [], folderPath: "", folderHistory: [""], folderHistoryIndex: 0 }
        }))
      }));

      await call("bundleProject", () => client.bundleProject({ projectId }));
      await call("createClaudeCodeSession", () => client.createClaudeCodeSession({ projectId }));
      await call("listChatsForExport", () => client.listChatsForExport({ projectId }));
      await call("exportChatMessages", () => client.exportChatMessages({ projectId, chatId: "chat-probe" }));
      await call("uploadFile", () => client.uploadFile({
        projectId,
        files: [{ path: "uploads/rpc-upload.txt", data: "uploaded through UploadFile", mimeType: "text/plain" }]
      }));

      const createdComment = await call("createComment", () => client.createComment({
        projectId,
        body: "Probe comment",
        filePath: "index.html",
        elementSelector: "h1",
        elementDescriptor: "h1",
        pinX: 0.5,
        pinY: 0.4
      }));
      const commentId = createdComment?.comment?.commentId || createdComment?.comment?.id || createdComment?.commentId || "";
      await call("listComments", () => client.listComments({ projectId }));
      await call("updateComment", () => client.updateComment({ projectId, commentId, body: "Probe comment updated", resolved: true }));
      const createdReply = await call("createCommentReply", () => client.createCommentReply({ projectId, commentId, body: "Reply text" }));
      const replyId = createdReply?.reply?.replyId || createdReply?.reply?.id || "";
      await call("updateCommentReply", () => client.updateCommentReply({ projectId, commentId, replyId, body: "Reply updated" }));
      await call("sendCommentsToChat", () => client.sendCommentsToChat({ projectId, commentIds: [commentId], chatId: "chat-probe" }));
      await call("markCommentsRead", () => client.markCommentsRead({ projectId }));
      await call("deleteCommentReply", () => client.deleteCommentReply({ projectId, commentId, replyId }));
      await call("deleteComment", () => client.deleteComment({ projectId, commentId }));

      await call("setProjectThumbnailRpc", () => client.setProjectThumbnail({
        projectId,
        thumbnailDataUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='9'%3E%3Crect width='16' height='9' fill='%23d97757'/%3E%3C/svg%3E"
      }));
      await call("setProjectThumbnailRest", async () => {
        const response = await fetch("/design/v1/design/projects/" + encodeURIComponent(projectId) + "/thumbnail", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ thumbnail_data_url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='9'%3E%3Crect width='16' height='9' fill='%23558a42'/%3E%3C/svg%3E" })
        });
        return { ok: response.ok, status: response.status };
      });
      await call("getThumbnailRest", async () => {
        const response = await fetch("/design/v1/design/projects/" + encodeURIComponent(projectId) + "/thumbnail/1");
        return { contentType: response.headers.get("content-type"), ok: response.ok, size: (await response.arrayBuffer()).byteLength, status: response.status };
      });

      await call("sendMultiplayerMessage", () => client.sendMultiplayerMessage({
        projectId,
        chatId: "chat-probe",
        content: "multiplayer message",
        role: "user",
        clientMessageId: "client-message-probe"
      }));
      await call("renewTurn", () => client.renewTurn({ projectId, chatId: "chat-probe", clientId: "client-probe" }));
      await call("releaseTurn", () => client.releaseTurn({ projectId, chatId: "chat-probe", clientId: "client-probe" }));

      await call("figmaStartAuth", () => client.figmaStartAuth({}));
      await call("figmaGetStatus", () => client.figmaGetStatus({}));
      await call("figmaListTools", () => client.figmaListTools({}));
      await call("figmaCallTool", () => client.figmaCallTool({ toolName: "mock_tool", inputJson: "{}" }));
      await call("figmaExchangeCode", () => client.figmaExchangeCode({ code: "mock" }));
      await call("figmaDisconnect", () => client.figmaDisconnect({}));
      await call("githubStartAuth", () => client.githubStartAuth({}));
      await call("githubGetStatus", () => client.githubGetStatus({}));
      await call("githubListRepos", () => client.githubListRepos({}));
      await call("githubGetTree", () => client.githubGetTree({ owner: "mock", repo: "repo", ref: "main" }));
      await call("githubReadFile", () => client.githubReadFile({ owner: "mock", repo: "repo", path: "README.md", ref: "main" }));
      await call("githubImportRepo", () => client.githubImportRepo({ projectId, owner: "mock", repo: "repo" }));
      await call("githubExchangeCode", () => client.githubExchangeCode({ code: "mock" }));
      await call("githubDisconnect", () => client.githubDisconnect({}));
      await call("mcpListConnected", () => client.mcpListConnected({}));
      await call("mcpListConnectors", () => client.mcpListConnectors({}));
      await call("mcpListDesignImportPartners", () => client.mcpListDesignImportPartners({}));
      await call("mcpListTools", () => client.mcpListTools({}));
      await call("mcpCallTool", () => client.mcpCallTool({ serverId: "mock", toolName: "mock_tool", inputJson: "{}" }));
      await call("trackEvent", () => client.trackEvent({ eventName: "all_probe", properties: { source: "probe" }, projectId }));

      return {
        calls,
        failed: calls.filter((entry) => !entry.ok).map((entry) => entry.name),
        projectId,
        url: location.href
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
  fs.writeFileSync(resultFile, `${JSON.stringify({ consoleMessages: consoleMessages.slice(-30), page, result, screenshotFile }, null, 2)}\n`, "utf8");
  window.destroy();
  app.quit();
}

main().catch((error) => {
  fs.writeFileSync(resultFile, `${JSON.stringify({ error: error instanceof Error ? error.stack || error.message : String(error) }, null, 2)}\n`, "utf8");
  app.exit(1);
});
