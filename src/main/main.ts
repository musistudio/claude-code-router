import { app } from "electron";
import { loadAppConfig } from "./config";
import { restoreClaudeAppGatewayConfig, syncClaudeAppGatewayConfig } from "./claude-app-gateway-service";
import { deepLinkService } from "./deep-link";
import { gatewayService } from "./gateway/service";
import "./ipc";
import { applyProfileConfig } from "./profile-service";
import { proxyService } from "./proxy/service";
import trayController from "./tray-controller";
import windowsManager from "./windows";

const gotTheLock = app.requestSingleInstanceLock();
const quitProxyRestoreTimeoutMs = 30_000;
let quitPrepared = false;
let stoppingForQuit = false;
let ensureProxyModePromise: Promise<void> | undefined;
let startServicesPromise: Promise<void> | undefined;
let stopForQuitPromise: Promise<void> | undefined;

if (!gotTheLock) {
  app.quit();
} else {
  startPrimaryInstance();
}

function startPrimaryInstance(): void {
  deepLinkService.register();
  deepLinkService.handleArgv(process.argv);

  app.on("second-instance", (_event, argv) => {
    windowsManager.showMainWindow();
    deepLinkService.handleArgv(argv);
    queueEnsureConfiguredProxyModeActive("second-instance");
  });

  app.whenReady().then(() => {
    windowsManager.createMainWindow();
    trayController.start();
    void startConfiguredServices("startup");

    app.on("activate", () => {
      windowsManager.showMainWindow();
      queueEnsureConfiguredProxyModeActive("activate");
    });
  });

  app.on("before-quit", (event) => {
    if (quitPrepared) {
      return;
    }
    event.preventDefault();
    prepareAndQuit();
  });

  app.on("will-quit", (event) => {
    if (quitPrepared) {
      return;
    }
    event.preventDefault();
    prepareAndQuit();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  process.once("SIGINT", () => handleTerminationSignal("SIGINT"));
  process.once("SIGTERM", () => handleTerminationSignal("SIGTERM"));
}

function prepareAndQuit(): void {
  if (stoppingForQuit) {
    return;
  }

  stoppingForQuit = true;
  void stopServicesForQuit().finally(() => {
    quitPrepared = true;
    app.quit();
  });
}

function handleTerminationSignal(signal: NodeJS.Signals): void {
  if (stoppingForQuit) {
    return;
  }

  stoppingForQuit = true;
  void stopServicesForQuit().finally(() => {
    quitPrepared = true;
    app.exit(signal === "SIGINT" ? 130 : 143);
  });
}

function stopServicesForQuit(): Promise<void> {
  if (!stopForQuitPromise) {
    stopForQuitPromise = gatewayService
      .stop({ proxyRestoreTimeoutMs: quitProxyRestoreTimeoutMs })
      .then(() => undefined)
      .catch((error) => {
        console.error(`Failed to stop services before quit: ${formatError(error)}`);
      })
      .finally(() => {
        try {
          restoreClaudeAppGatewayConfig();
        } catch (error) {
          console.error(`Failed to restore Claude App gateway config before quit: ${formatError(error)}`);
        }
        trayController.destroy();
      });
  }
  return stopForQuitPromise;
}

function startConfiguredServices(reason: string): Promise<void> {
  if (!startServicesPromise) {
    startServicesPromise = loadAppConfig()
      .then(async (config) => {
        try {
          config = (await syncClaudeAppGatewayConfig(config)).config;
        } catch (error) {
          console.error(`Failed to sync Claude App gateway config during ${reason}: ${formatError(error)}`);
        }
        const status = await gatewayService.start(config);
        if (status.state === "error") {
          console.error(`Failed to start gateway during ${reason}: ${status.lastError}`);
        }
        if (status.state === "running") {
          const profileResult = await applyProfileConfig(config);
          for (const client of profileResult.clients) {
            if (!client.ok) {
              console.error(`Failed to apply ${client.client} profile during ${reason}: ${client.message}`);
            }
          }
        }
        if (config.proxy.enabled && config.proxy.systemProxy) {
          const proxyStatus = await proxyService.ensureSystemProxyActive();
          logProxySystemProxyIssue(reason, proxyStatus);
        }
      })
      .catch((error) => {
        console.error(`Failed to start configured services during ${reason}: ${formatError(error)}`);
      })
      .finally(() => {
        trayController.refreshUsageTitle();
        startServicesPromise = undefined;
      });
  }
  return startServicesPromise;
}

function queueEnsureConfiguredProxyModeActive(reason: string): void {
  void (startServicesPromise ?? Promise.resolve())
    .then(() => ensureConfiguredProxyModeActive(reason))
    .catch((error) => {
      console.error(`Failed to ensure proxy mode during ${reason}: ${formatError(error)}`);
    });
}

function ensureConfiguredProxyModeActive(reason: string): Promise<void> {
  if (stoppingForQuit) {
    return Promise.resolve();
  }

  if (!ensureProxyModePromise) {
    ensureProxyModePromise = loadAppConfig()
      .then(async (config) => {
        if (!config.proxy.enabled || !config.proxy.systemProxy) {
          return;
        }

        const proxyStatus = proxyService.getStatus();
        if (proxyStatus.state !== "running") {
          await startConfiguredServices(reason);
          return;
        }

        const ensuredStatus = await proxyService.ensureSystemProxyActive();
        logProxySystemProxyIssue(reason, ensuredStatus);
      })
      .finally(() => {
        ensureProxyModePromise = undefined;
      });
  }
  return ensureProxyModePromise;
}

function logProxySystemProxyIssue(reason: string, status: ReturnType<typeof proxyService.getStatus>): void {
  if (status.systemProxy.state === "active") {
    return;
  }

  const details = status.systemProxy.lastError ? `: ${status.systemProxy.lastError}` : "";
  console.error(`Proxy mode is enabled, but system proxy is ${status.systemProxy.state} during ${reason}${details}`);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
