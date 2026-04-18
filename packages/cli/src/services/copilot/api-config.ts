import { randomUUID } from "node:crypto";

export const COPILOT_VERSION = "0.26.7";
export const EDITOR_PLUGIN_VERSION = `copilot-chat/${COPILOT_VERSION}`;
export const USER_AGENT = `GitHubCopilotChat/${COPILOT_VERSION}`;
export const API_VERSION = "2025-04-01";

export const GITHUB_BASE_URL = "https://github.com";
export const GITHUB_API_BASE_URL = "https://api.github.com";
export const GITHUB_CLIENT_ID = "Iv1.b507a08c87ecfe98";
export const GITHUB_APP_SCOPES = "read:user";

export const copilotBaseUrl = (accountType: string) =>
  accountType === "individual"
    ? "https://api.githubcopilot.com"
    : `https://api.${accountType}.githubcopilot.com`;

export const copilotHeaders = (
  accountType: string,
  copilotToken: string,
  vision: boolean = false,
  vsCodeVersion: string = "1.98.0"
) => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${copilotToken}`,
    "content-type": "application/json",
    "copilot-integration-id": "vscode-chat",
    "editor-version": `vscode/${vsCodeVersion}`,
    "editor-plugin-version": EDITOR_PLUGIN_VERSION,
    "user-agent": USER_AGENT,
    "openai-intent": "conversation-panel",
    "x-github-api-version": API_VERSION,
    "x-request-id": randomUUID(),
    "x-vscode-user-agent-library-version": "electron-fetch",
  };

  if (vision) headers["copilot-vision-request"] = "true";

  return headers;
};

export const standardHeaders = () => ({
  "content-type": "application/json",
  accept: "application/json",
});

export const githubHeaders = (githubToken: string) => ({
  ...standardHeaders(),
  authorization: `token ${githubToken}`,
  "editor-version": "vscode/1.98.0",
  "editor-plugin-version": EDITOR_PLUGIN_VERSION,
  "user-agent": USER_AGENT,
  "x-github-api-version": API_VERSION,
});
