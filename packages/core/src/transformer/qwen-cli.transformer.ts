import { Transformer, TransformerContext } from "@/types/transformer";
import { LLMProvider, UnifiedChatRequest } from "@/types/llm";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import { randomUUID } from "crypto";

const OAUTH_FILE = path.join(os.homedir(), ".qwen", "oauth_creds.json");
const DEFAULT_DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const TOKEN_REFRESH_BUFFER_MS = 30 * 1000; // 30 seconds - matches Qwen Code exactly

interface QwenOAuthCreds {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;  // e.g., "Bearer"
  resource_url?: string;  // Just hostname, e.g., "portal.qwen.ai"
}

export class QwenCLITransformer implements Transformer {
  name = "qwen-cli";
  logger?: any;
  private oauth_creds?: QwenOAuthCreds;
  private packageVersion?: string;

  async transformRequestIn(
    request: UnifiedChatRequest,
    provider: LLMProvider,
    context: TransformerContext
  ): Promise<{ 
    body: UnifiedChatRequest; 
    config: { 
      headers: Record<string, string>;
      url?: URL;
    } 
  }> {
    this.logger?.debug({ model: request.model }, "[QWEN] transformRequestIn called");

    // 1. Load OAuth credentials
    if (!this.oauth_creds) {
      await this.loadOAuthCreds();
    }

    if (!this.oauth_creds) {
      throw new Error(
        "No Qwen OAuth credentials found. Please authenticate with Qwen Code first by running: qwen login"
      );
    }

    // 2. Refresh token if expired (30s buffer like Qwen Code)
    if (!this.isTokenValid(this.oauth_creds)) {
      this.logger?.debug("[QWEN] Token expired or expiring soon, refreshing...");
      await this.refreshToken(this.oauth_creds.refresh_token);
    }

    // 3. Get package version for User-Agent
    if (!this.packageVersion) {
      this.packageVersion = await this.getPackageVersion();
    }

    // 4. Determine endpoint from credentials (hostname only!)
    const endpoint = this.getCurrentEndpoint(this.oauth_creds.resource_url);
    this.logger?.debug({ endpoint }, "[QWEN] Using endpoint");

    // 5. Build headers exactly like Qwen Code
    const userAgent = `QwenCode/${this.packageVersion} (${process.platform}; ${process.arch})`;
    
    // 6. Transform request body with metadata
    const transformedBody = this.transformRequestBody(request);

    return {
      body: transformedBody,
      config: {
        url: new URL(`${endpoint}/chat/completions`),
        headers: {
          "Authorization": `${this.oauth_creds.token_type} ${this.oauth_creds.access_token}`,
          "User-Agent": userAgent,
          "X-DashScope-CacheControl": "enable",
          "X-DashScope-UserAgent": userAgent,
          "X-DashScope-AuthType": "qwen-oauth",
        },
      },
    };
  }

  /**
   * Transform request body to match Qwen Code format
   */
  private transformRequestBody(request: UnifiedChatRequest): UnifiedChatRequest {
    const promptId = randomUUID();
    
    const transformed: any = {
      ...request,
      // Add metadata for DashScope session tracking
      metadata: {
        sessionId: `ccr-${randomUUID().substring(0, 8)}`,
        promptId: promptId,
      }
    };

    // Add stream options for usage tracking
    if (request.stream) {
      transformed.stream_options = {
        include_usage: true,
      };
    }

    return transformed as UnifiedChatRequest;
  }

  /**
   * Check if token is valid (30s buffer before expiry)
   */
  private isTokenValid(creds: QwenOAuthCreds): boolean {
    if (!creds.expiry_date || !creds.access_token) {
      return false;
    }
    return Date.now() < creds.expiry_date - TOKEN_REFRESH_BUFFER_MS;
  }

  /**
   * Get current endpoint URL with proper protocol and /v1 suffix
   * Matches Qwen Code's getCurrentEndpoint exactly
   */
  private getCurrentEndpoint(resourceUrl?: string): string {
    const baseEndpoint = resourceUrl || DEFAULT_DASHSCOPE_BASE_URL;
    const suffix = '/v1';
    
    // Normalize: add https:// if missing, ensure /v1 suffix
    const normalizedUrl = baseEndpoint.startsWith('http')
      ? baseEndpoint
      : `https://${baseEndpoint}`;
    
    return normalizedUrl.endsWith(suffix)
      ? normalizedUrl
      : `${normalizedUrl}${suffix}`;
  }

  /**
   * Get package version from package.json
   */
  private async getPackageVersion(): Promise<string> {
    try {
      const packagePath = path.join(__dirname, '../../../package.json');
      const packageData = await fs.readFile(packagePath, 'utf-8');
      const pkg = JSON.parse(packageData);
      return pkg.version || '25.6.0';
    } catch {
      return '25.6.0';
    }
  }

  /**
   * Refresh OAuth token (matches Qwen Code implementation)
   */
  private async refreshToken(refresh_token: string): Promise<void> {
    const bodyData = new URLSearchParams();
    bodyData.append("client_id", "f0304373b74a44d2b584a3fb70ca9e56");
    bodyData.append("refresh_token", refresh_token);
    bodyData.append("grant_type", "refresh_token");

    try {
      const response = await fetch("https://chat.qwen.ai/api/v1/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",  // Required!
        },
        body: bodyData,
      });

      if (!response.ok) {
        // On 400, clear credentials as refresh token is invalid
        if (response.status === 400) {
          await this.clearOAuthCreds();
          throw new Error(
            "Refresh token expired or invalid. Please re-authenticate with Qwen Code by running: qwen login"
          );
        }
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const data = await response.json();

      this.oauth_creds = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || refresh_token,
        token_type: data.token_type || "Bearer",
        expiry_date: Date.now() + data.expires_in * 1000,
        resource_url: data.resource_url,
      };

      // Save updated credentials
      await this.saveOAuthCreds(this.oauth_creds);
      this.logger?.debug("[QWEN] Token refreshed successfully");
    } catch (error: any) {
      this.logger?.error({ error: error.message }, "[QWEN] Failed to refresh token");
      throw error;
    }
  }

  /**
   * Load OAuth credentials from file
   */
  private async loadOAuthCreds(): Promise<void> {
    try {
      const data = await fs.readFile(OAUTH_FILE, "utf-8");
      this.oauth_creds = JSON.parse(data);
      this.logger?.debug("[QWEN] OAuth credentials loaded");
    } catch (error) {
      this.logger?.error("[QWEN] No OAuth credentials found at " + OAUTH_FILE);
      // Don't throw here - let it throw later with better message
    }
  }

  /**
   * Save OAuth credentials to file
   */
  private async saveOAuthCreds(creds: QwenOAuthCreds): Promise<void> {
    await fs.mkdir(path.dirname(OAUTH_FILE), { recursive: true });
    await fs.writeFile(OAUTH_FILE, JSON.stringify(creds, null, 2));
  }

  /**
   * Clear OAuth credentials (for invalid refresh tokens)
   */
  private async clearOAuthCreds(): Promise<void> {
    try {
      await fs.unlink(OAUTH_FILE);
      this.logger?.debug("[QWEN] OAuth credentials cleared due to invalid refresh token");
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        this.logger?.warn("[QWEN] Failed to clear credentials:", error);
      }
    }
  }
}
