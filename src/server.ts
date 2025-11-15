import Server from "@musistudio/llms";
import { readConfigFile, writeConfigFile, backupConfigFile } from "./utils";
import { checkForUpdates, performUpdate } from "./utils";
import { join } from "path";
import fastifyStatic from "@fastify/static";
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import {calculateTokenCount} from "./utils/router";
import { NpmDownloader } from "./codeManager/downloder";
import { HOME_DIR } from "./constants";

export const createServer = (config: any): Server => {
  const server = new Server(config);

  server.app.post("/v1/messages/count_tokens", async (req, reply) => {
    const {messages, tools, system} = req.body;
    const tokenCount = calculateTokenCount(messages, system, tools);
    return { "input_tokens": tokenCount }
  });

  // Add endpoint to read config.json with access control
  server.app.get("/api/config", async (req, reply) => {
    return await readConfigFile();
  });

  server.app.get("/api/transformers", async () => {
    const transformers =
      server.app._server!.transformerService.getAllTransformers();
    const transformerList = Array.from(transformers.entries()).map(
      ([name, transformer]: any) => ({
        name,
        endpoint: transformer.endPoint || null,
      })
    );
    return { transformers: transformerList };
  });

  // Add endpoint to save config.json with access control
  server.app.post("/api/config", async (req, reply) => {
    const newConfig = req.body;

    // Backup existing config file if it exists
    const backupPath = await backupConfigFile();
    if (backupPath) {
      console.log(`Backed up existing configuration file to ${backupPath}`);
    }

    await writeConfigFile(newConfig);
    return { success: true, message: "Config saved successfully" };
  });

  // Add endpoint to restart the service with access control
  server.app.post("/api/restart", async (req, reply) => {
    reply.send({ success: true, message: "Service restart initiated" });

    // Restart the service after a short delay to allow response to be sent
    setTimeout(() => {
      const { spawn } = require("child_process");
      spawn(process.execPath, [process.argv[1], "restart"], {
        detached: true,
        stdio: "ignore",
      });
    }, 1000);
  });

  // Register static file serving with caching
  server.app.register(fastifyStatic, {
    root: join(__dirname, "..", "dist"),
    prefix: "/ui/",
    maxAge: "1h",
  });

  // Redirect /ui to /ui/ for proper static file serving
  server.app.get("/ui", async (_, reply) => {
    return reply.redirect("/ui/");
  });

  // 版本检查端点
  server.app.get("/api/update/check", async (req, reply) => {
    try {
      // 获取当前版本
      const currentVersion = require("../package.json").version;
      const { hasUpdate, latestVersion, changelog } = await checkForUpdates(currentVersion);

      return {
        hasUpdate,
        latestVersion: hasUpdate ? latestVersion : undefined,
        changelog: hasUpdate ? changelog : undefined
      };
    } catch (error) {
      console.error("Failed to check for updates:", error);
      reply.status(500).send({ error: "Failed to check for updates" });
    }
  });

  // 执行更新端点
  server.app.post("/api/update/perform", async (req, reply) => {
    try {
      // 只允许完全访问权限的用户执行更新
      const accessLevel = (req as any).accessLevel || "restricted";
      if (accessLevel !== "full") {
        reply.status(403).send("Full access required to perform updates");
        return;
      }

      // 执行更新逻辑
      const result = await performUpdate();

      return result;
    } catch (error) {
      console.error("Failed to perform update:", error);
      reply.status(500).send({ error: "Failed to perform update" });
    }
  });

  // 获取日志文件列表端点
  server.app.get("/api/logs/files", async (req, reply) => {
    try {
      const logDir = join(homedir(), ".claude-code-router", "logs");
      const logFiles: Array<{ name: string; path: string; size: number; lastModified: string }> = [];

      if (existsSync(logDir)) {
        const files = readdirSync(logDir);

        for (const file of files) {
          if (file.endsWith('.log')) {
            const filePath = join(logDir, file);
            const stats = statSync(filePath);

            logFiles.push({
              name: file,
              path: filePath,
              size: stats.size,
              lastModified: stats.mtime.toISOString()
            });
          }
        }

        // 按修改时间倒序排列
        logFiles.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
      }

      return logFiles;
    } catch (error) {
      console.error("Failed to get log files:", error);
      reply.status(500).send({ error: "Failed to get log files" });
    }
  });

  // 获取日志内容端点
  server.app.get("/api/logs", async (req, reply) => {
    try {
      const filePath = (req.query as any).file as string;
      let logFilePath: string;

      if (filePath) {
        // 如果指定了文件路径，使用指定的路径
        logFilePath = filePath;
      } else {
        // 如果没有指定文件路径，使用默认的日志文件路径
        logFilePath = join(homedir(), ".claude-code-router", "logs", "app.log");
      }

      if (!existsSync(logFilePath)) {
        return [];
      }

      const logContent = readFileSync(logFilePath, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim())

      return logLines;
    } catch (error) {
      console.error("Failed to get logs:", error);
      reply.status(500).send({ error: "Failed to get logs" });
    }
  });

  // 清除日志内容端点
  server.app.delete("/api/logs", async (req, reply) => {
    try {
      const filePath = (req.query as any).file as string;
      let logFilePath: string;

      if (filePath) {
        // 如果指定了文件路径，使用指定的路径
        logFilePath = filePath;
      } else {
        // 如果没有指定文件路径，使用默认的日志文件路径
        logFilePath = join(homedir(), ".claude-code-router", "logs", "app.log");
      }

      if (existsSync(logFilePath)) {
        writeFileSync(logFilePath, '', 'utf8');
      }

      return { success: true, message: "Logs cleared successfully" };
    } catch (error) {
      console.error("Failed to clear logs:", error);
      reply.status(500).send({ error: "Failed to clear logs" });
    }
  });

  // Claude Code 版本管理相关 API
  const versionsDir = join(HOME_DIR, 'versions');
  const currentVersionPath = join(HOME_DIR, 'current-version.json');

  // 确保版本目录存在
  if (!existsSync(versionsDir)) {
    mkdirSync(versionsDir, { recursive: true });
  }

  // 初始化下载器
  const downloader = new NpmDownloader();

  // 辅助函数：读取当前版本
  const readCurrentVersion = () => {
    try {
      if (existsSync(currentVersionPath)) {
        const content = readFileSync(currentVersionPath, 'utf8');
        const data = JSON.parse(content);
        return data.currentVersion || '';
      }
    } catch (error) {
      console.error('Failed to read current version:', error);
    }
    return '';
  };

  // 辅助函数：保存当前版本
  const saveCurrentVersion = (version: string) => {
    try {
      writeFileSync(currentVersionPath, JSON.stringify({ currentVersion: version }, null, 2));
    } catch (error) {
      console.error('Failed to save current version:', error);
    }
  };

  // 辅助函数：获取已下载的版本列表（扫描 versions 文件夹）
  const getDownloadedVersions = () => {
    try {
      const versions = [];
      if (existsSync(versionsDir)) {
        const folders = readdirSync(versionsDir);
        for (const folder of folders) {
          const folderPath = join(versionsDir, folder);
          const stats = statSync(folderPath);
          if (stats.isDirectory()) {
            versions.push({
              version: folder,
              downloadPath: folderPath,
              downloadedAt: stats.birthtime.toISOString()
            });
          }
        }
        // 按下载时间倒序排列
        versions.sort((a, b) => new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime());
      }
      return versions;
    } catch (error) {
      console.error('Failed to get downloaded versions:', error);
      return [];
    }
  };

  // 获取可用版本列表
  server.app.get("/api/claude-code/versions", async (req, reply) => {
    try {
      const versions = await downloader.getAvailableVersions();

      // 按版本号倒序排列（最新在前）
      const sortedVersions = versions.sort((a, b) => b.localeCompare(a));

      return { versions: sortedVersions };
    } catch (error) {
      console.error("Failed to get available versions:", error);
      reply.status(500).send({ error: "Failed to get available versions" });
    }
  });

  // 获取已下载的版本列表
  server.app.get("/api/claude-code/downloaded", async (req, reply) => {
    try {
      const currentVersion = readCurrentVersion();
      const downloadedVersions = getDownloadedVersions();
      const versionsWithStatus = downloadedVersions.map(v => ({
        ...v,
        isCurrent: v.version === currentVersion
      }));
      return { versions: versionsWithStatus, currentVersion };
    } catch (error) {
      console.error("Failed to get downloaded versions:", error);
      reply.status(500).send({ error: "Failed to get downloaded versions" });
    }
  });

  // 下载指定版本
  server.app.post("/api/claude-code/download/:version", async (req, reply) => {
    try {
      const { version } = req.params as any;
      const currentVersion = readCurrentVersion();
      const downloadedVersions = getDownloadedVersions();

      // 检查是否已下载
      if (downloadedVersions.some((v: any) => v.version === version)) {
        reply.status(400).send({ error: "Version already downloaded" });
        return;
      }

      // 创建版本号目录
      const versionDir = join(versionsDir, version);
      if (!existsSync(versionDir)) {
        mkdirSync(versionDir, { recursive: true });
      }

      // 开始下载到版本号目录
      const extractedPath = await downloader.downloadAndExtract({
        version,
        destination: versionDir,
        onProgress: (message) => console.log(`Download progress for ${version}:`, message)
      });

      // 如果没有当前版本，设置当前版本
      if (!currentVersion) {
        saveCurrentVersion(version);
      }

      return { success: true, version, path: extractedPath };
    } catch (error) {
      console.error("Failed to download version:", error);
      reply.status(500).send({ error: `Failed to download version: ${(error as Error).message}` });
    }
  });

  // 删除指定版本
  server.app.post("/api/claude-code/version/delete", async (req, reply) => {
    try {
      const { version } = req.body as any;
      const currentVersion = readCurrentVersion();
      const downloadedVersions = getDownloadedVersions();

      // 不能删除当前版本
      if (version === currentVersion) {
        reply.status(400).send({ error: "Cannot delete current version" });
        return;
      }

      const versionDir = join(versionsDir, version);

      // 检查版本目录是否存在
      if (!existsSync(versionDir)) {
        reply.status(404).send({ error: "Version not found" });
        return;
      }

      // 删除版本目录
      const { execSync } = require('child_process');
      try {
        execSync(`rm -rf "${versionDir}"`, { stdio: 'pipe' });
      } catch (error) {
        console.warn('Failed to delete directory for version', version, ':', error);
      }

      return { success: true, version };
    } catch (error) {
      console.error("Failed to delete version:", error);
      reply.status(500).send({ error: "Failed to delete version" });
    }
  });

  // 切换到指定版本
  server.app.post("/api/claude-code/switch/:version", async (req, reply) => {
    try {
      const { version } = req.params as any;
      const downloadedVersions = getDownloadedVersions();

      // 检查版本是否已下载
      const versionExists = downloadedVersions.some((v: any) => v.version === version);
      if (!versionExists) {
        reply.status(404).send({ error: "Version not downloaded" });
        return;
      }

      // 更新当前版本
      saveCurrentVersion(version);

      return { success: true, currentVersion: version };
    } catch (error) {
      console.error("Failed to switch version:", error);
      reply.status(500).send({ error: "Failed to switch version" });
    }
  });

  return server;
};
