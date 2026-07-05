import { app } from "electron";
import path from "node:path";
import { appDeepLinkProtocol, createProviderDeepLinkRequest as createSharedProviderDeepLinkRequest, isAppDeepLinkUrl } from "@ccr/core/contracts/deep-link";
import type { ProviderDeepLinkRequest } from "@ccr/core/contracts/app";
import { IPC_CHANNELS } from "@ccr/core/config/constants";
import { providerIdentitySafetyIssue } from "@ccr/core/providers/presets/index";
import windowsManager from "./windows";

class DeepLinkService {
  private pendingProviderRequests: ProviderDeepLinkRequest[] = [];

  register(): void {
    this.registerProtocolClient();

    app.on("open-url", (event, url) => {
      event.preventDefault();
      this.handleUrl(url);
    });
  }

  consumePendingProviderRequests(): ProviderDeepLinkRequest[] {
    const requests = [...this.pendingProviderRequests];
    this.pendingProviderRequests = [];
    return requests;
  }

  handleArgv(argv: string[]): boolean {
    const urls = argv.filter((item) => isAppDeepLinkUrl(item));
    for (const url of urls) {
      this.handleUrl(url);
    }
    return urls.length > 0;
  }

  handleUrl(url: string): void {
    const request = createProviderDeepLinkRequest(url);
    this.pendingProviderRequests.push(request);
    if (this.pendingProviderRequests.length > 20) {
      this.pendingProviderRequests = this.pendingProviderRequests.slice(-20);
    }

    if (!app.isReady()) {
      return;
    }

    windowsManager.showMainWindow();
    windowsManager.broadcast(IPC_CHANNELS.appProviderDeepLink, request);
  }

  private registerProtocolClient(): void {
    try {
      if (process.defaultApp && process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(appDeepLinkProtocol, process.execPath, [path.resolve(process.argv[1])]);
        return;
      }
      app.setAsDefaultProtocolClient(appDeepLinkProtocol);
    } catch (error) {
      console.warn(`[deep-link] Failed to register ${appDeepLinkProtocol} protocol: ${formatError(error)}`);
    }
  }
}

function createProviderDeepLinkRequest(rawUrl: string): ProviderDeepLinkRequest {
  const request = createSharedProviderDeepLinkRequest(rawUrl);
  if (!request.provider) {
    return request;
  }

  const identityIssue = providerIdentitySafetyIssue({
    baseUrl: request.provider.baseUrl,
    name: request.provider.name
  });
  if (!identityIssue) {
    return request;
  }

  return {
    error: identityIssue.message,
    id: request.id,
    rawUrl: request.rawUrl,
    receivedAt: request.receivedAt
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const deepLinkService = new DeepLinkService();
