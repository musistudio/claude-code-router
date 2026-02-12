import { Transformer, TransformerContext } from "@/types/transformer";
import { LLMProvider, UnifiedChatRequest } from "@/types/llm";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";

const OAUTH_FILE = path.join(os.homedir(), ".qwen", "oauth_creds.json");

interface QwenOAuthCreds {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

export class QwenCLITransformer implements Transformer {
  name = "qwen-cli";
  logger?: any;
  private oauth_creds?: QwenOAuthCreds;

  async transformRequestIn(
    request: UnifiedChatRequest,
    provider: LLMProvider,
    context: TransformerContext
  ): Promise<{ body: UnifiedChatRequest; config: { headers: Record<string, string> } }> {
    this.logger?.debug({ model: request.model }, "[QWEN] transformRequestIn called");

    // Load OAuth credentials if not already loaded
    if (!this.oauth_creds) {
      await this.getOauthCreds();
    }

    // Refresh token if expired
    if (this.oauth_creds && this.oauth_creds.expiry_date < Date.now()) {
      await this.refreshToken(this.oauth_creds.refresh_token);
    }

    // Force coder-model for Qwen CLI
    request.model = "coder-model";

    this.logger?.debug({ newModel: request.model }, "[QWEN] Model changed to coder-model");

    // Add stream options for usage tracking
    if (request.stream) {
      (request as any).stream_options = {
        include_usage: true,
      };
    }

    return {
      body: request,
      config: {
        headers: {
          Authorization: `Bearer ${this.oauth_creds?.access_token || ""}`,
          "User-Agent": "QwenCode/v22.12.0 (darwin; arm64)",
        },
      },
    };
  }

  private async refreshToken(refresh_token: string): Promise<void> {
    const urlencoded = new URLSearchParams();
    urlencoded.append("client_id", "f0304373b74a44d2b584a3fb70ca9e56");
    urlencoded.append("refresh_token", refresh_token);
    urlencoded.append("grant_type", "refresh_token");

    try {
      const response = await fetch("https://chat.qwen.ai/api/v1/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: urlencoded,
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const data = await response.json();

      this.oauth_creds = {
        access_token: data.access_token,
        refresh_token: refresh_token,
        expiry_date: Date.now() + data.expires_in * 1000 - 1000 * 60,
      };

      // Save updated credentials
      await fs.writeFile(OAUTH_FILE, JSON.stringify(this.oauth_creds, null, 2));
      this.logger?.debug("[QWEN] Token refreshed successfully");
    } catch (error: any) {
      this.logger?.error({ error: error.message }, "[QWEN] Failed to refresh token");
      throw error;
    }
  }

  private async getOauthCreds(): Promise<void> {
    try {
      const data = await fs.readFile(OAUTH_FILE, "utf-8");
      this.oauth_creds = JSON.parse(data);
      this.logger?.debug("[QWEN] OAuth credentials loaded");
    } catch (error) {
      this.logger?.warn("[QWEN] No OAuth credentials found at " + OAUTH_FILE);
    }
  }
}
