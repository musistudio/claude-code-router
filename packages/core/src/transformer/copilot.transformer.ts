import { Transformer, TransformerContext } from "@/types/transformer";
import { LLMProvider, UnifiedChatRequest } from "@/types/llm";
import {
  copilotBaseUrl,
  copilotHeaders,
} from "@/services/copilot/api-config";
import {
  loadCopilotToken,
  saveCopilotToken,
  getCopilotToken,
  isTokenExpiringSoon,
} from "@/services/copilot/token";
import { promises as fs } from "node:fs";
import { join } from "node:path";

const TOKEN_PATH = join(process.env.HOME!, ".claude-code-router", "copilot-token.json");

export class CopilotTransformer implements Transformer {
  name = "copilot";
  endPoint = "/v1/chat/completions";
  logger?: any;

  private accountType: string = "individual";

  constructor(accountType?: string) {
    this.accountType = accountType || "individual";
  }

  async transformRequestIn(
    request: UnifiedChatRequest,
    provider: LLMProvider,
    context: TransformerContext
  ): Promise<{ body: any; config: any }> {
    // Load or refresh token if needed
    let tokenData = await loadCopilotToken();

    if (!tokenData || tokenData.accountType !== this.accountType) {
      throw new Error(
        "Copilot not authenticated. Run: ccr auth copilot --account-type " +
          this.accountType
      );
    }

    // Check if token needs refresh
    if (isTokenExpiringSoon(tokenData.expiresAt)) {
      this.logger?.debug({
        reqId: context.req?.id,
        message: "Copilot token expiring soon, refreshing...",
      });

      // Refresh token
      const newToken = await getCopilotToken(tokenData.githubToken);
      tokenData.copilotToken = newToken.token;
      tokenData.expiresAt = newToken.expires_at;
      tokenData.refreshIn = newToken.refresh_in;

      // Save updated token
      await fs.mkdir(join(process.env.HOME!, ".claude-code-router"), {
        recursive: true,
      });
      await fs.writeFile(TOKEN_PATH, JSON.stringify(tokenData, null, 2));

      this.logger?.debug({
        reqId: context.req?.id,
        message: "Copilot token refreshed successfully",
      });
    }

    // Check for images in messages
    const hasImages = request.messages.some(
      (msg) =>
        Array.isArray(msg.content) &&
        msg.content.some((part: any) => part.type === "image_url")
    );

    // Check if this is an agent call
    const isAgentCall = request.messages.some((msg) =>
      ["assistant", "tool"].includes(msg.role)
    );

    // Build headers
    const headers = {
      ...copilotHeaders(
        this.accountType,
        tokenData.copilotToken,
        hasImages,
        "1.98.0"
      ),
      "X-Initiator": isAgentCall ? "agent" : "user",
    };

    // Transform request to OpenAI format (Copilot uses OpenAI-compatible format)
    const body = {
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        tool_calls: msg.tool_calls,
        tool_call_id: msg.tool_call_id,
      })),
      model: request.model,
      temperature: request.temperature,
      top_p: request.top_p,
      max_tokens: request.max_tokens,
      stream: request.stream,
      tools: request.tools,
      tool_choice: request.tool_choice,
    };

    return {
      body,
      config: {
        url: new URL(`${copilotBaseUrl(this.accountType)}/chat/completions`),
        headers,
      },
    };
  }

  async transformResponseOut(
    response: Response,
    context: TransformerContext
  ): Promise<Response> {
    // Copilot already returns OpenAI-compatible format
    // No transformation needed
    return response;
  }
}

// Register transformer name for config lookup
(CopilotTransformer as any).TransformerName = "copilot";
