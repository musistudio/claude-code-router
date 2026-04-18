import { Transformer, TransformerContext } from "@/types/transformer";
import { LLMProvider, UnifiedChatRequest, UnifiedMessage } from "@/types/llm";
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

const GITHUB_MODELS = ["gpt-", "o1", "o3", "o4", "deepseek"];

export class CopilotTransformer implements Transformer {
  name = "copilot";
  endPoint = "/v1/responses";
  logger?: any;

  private accountType: string = "individual";
  private reasoningEffort: string = "medium";

  constructor(accountType?: string, reasoningEffort?: string) {
    this.accountType = accountType || "individual";
    this.reasoningEffort = reasoningEffort || "medium";
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

      const newToken = await getCopilotToken(tokenData.githubToken);
      tokenData.copilotToken = newToken.token;
      tokenData.expiresAt = newToken.expires_at;
      tokenData.refreshIn = newToken.refresh_in;

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

    // Determine if this is a GPT or Claude model
    const isGPTModel = this.isGPTModel(request.model);

    // Keep tools from request body if an earlier transformer did not forward them.
    const originalBody = context.req?.body as any;
    const requestWithTools: UnifiedChatRequest = {
      ...request,
      tools: request.tools ?? originalBody?.tools,
    };

    // Build headers
    const headers = {
      ...copilotHeaders(
        this.accountType,
        tokenData.copilotToken,
        hasImages,
        "1.98.0"
      ),
      "Openai-Intent": "conversation-edits",
      "X-Initiator": isAgentCall ? "agent" : "user",
    };

    // Transform based on model type
    const body = isGPTModel
      ? this.buildGPTRequest(requestWithTools, headers)
      : this.buildClaudeRequest(requestWithTools, headers);

    // Determine endpoint
    const endpoint = isGPTModel ? "/v1/responses" : "/v1/messages";

    return {
      body,
      config: {
        url: new URL(`${copilotBaseUrl(this.accountType)}${endpoint}`),
        headers,
      },
    };
  }

  /**
   * Check if model is a GPT-style model
   */
  private isGPTModel(model: string): boolean {
    if (!model) return true;
    const lower = model.toLowerCase();
    return GITHUB_MODELS.some((prefix: string) => lower.startsWith(prefix));
  }

  /**
   * Build request for GPT models using Responses API
   */
  private buildGPTRequest(request: UnifiedChatRequest, headers: Record<string, string>): any {
    // Extract system message for instructions
    const systemMsg = request.messages.find((m) => m.role === "system");
    const otherMessages = request.messages.filter((m) => m.role !== "system");

    // Transform messages to Copilot Responses API input items
    const input = otherMessages.flatMap((msg) => this.transformGPTMessage(msg));

    // Build instructions as a string
    let instructions = "";
    if (systemMsg?.content) {
      if (typeof systemMsg.content === "string") {
        instructions = systemMsg.content;
      } else if (Array.isArray(systemMsg.content)) {
        instructions = systemMsg.content
          .map((part: any) => part.text || "")
          .join("");
      }
    }

    const transformedTools = request.tools
      ? this.transformGPTTools(request.tools as any[])
      : undefined;

    const body: any = {
      model: request.model,
      instructions,
      input,
      tools: transformedTools,
      parallel_tool_calls: true,
      reasoning: { effort: this.reasoningEffort },
      text: { format: { type: "text" } },
      store: false,
      include: ["reasoning.encrypted_content"],
      stream: request.stream,
    };

    // Add optional parameters
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    if ((request as any).top_p !== undefined) {
      body.top_p = (request as any).top_p;
    }
    if (request.max_tokens !== undefined) {
      // Copilot requires max_output_tokens >= 16
      body.max_output_tokens = Math.max(request.max_tokens, 16);
    }

    return body;
  }

  /**
   * Build request for Claude models using Messages API
   */
  private buildClaudeRequest(request: UnifiedChatRequest, headers: Record<string, string>): any {
    // Extract system message
    const systemMsg = request.messages.find((m) => m.role === "system");

    // Transform messages to Anthropic format
    const messages = request.messages
      .filter((m) => m.role !== "system")
      .map((msg) => this.transformClaudeMessage(msg));

    const body: any = {
      model: request.model,
      system: systemMsg?.content || "",
      messages,
      tools: request.tools ? this.transformClaudeTools(request.tools) : undefined,
      max_tokens: request.max_tokens || 4096,
      stream: request.stream,
    };

    // Add optional parameters
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    return body;
  }

  /**
   * Transform message for GPT/Responses API
   */
  private transformGPTMessage(msg: UnifiedMessage): any[] {
    const items: any[] = [];

    if (msg.role === "tool") {
      if (!msg.tool_call_id) {
        return items;
      }

      items.push({
        type: "function_call_output",
        call_id: msg.tool_call_id,
        output: this.getStringContent(msg.content),
      });

      return items;
    }

    if (msg.role === "assistant") {
      const text = this.extractText(msg.content);
      if (text !== null) {
        items.push({
          role: "assistant",
          content: [{ type: "output_text", text }],
        });
      }

      if (Array.isArray(msg.tool_calls)) {
        for (const toolCall of msg.tool_calls) {
          const name = toolCall?.function?.name;
          if (!name) continue;
          items.push({
            type: "function_call",
            call_id: toolCall.id,
            name,
            arguments: this.normalizeToolArguments(toolCall.function?.arguments),
          });
        }
      }

      // Fallback for tool calls represented in content blocks.
      if (Array.isArray(msg.content)) {
        for (const part of msg.content as any[]) {
          if (part?.type !== "tool_use") continue;
          if (!part.id || !part.name) continue;
          items.push({
            type: "function_call",
            call_id: part.id,
            name: part.name,
            arguments: this.normalizeToolArguments(part.input),
          });
        }
      }

      return items;
    }

    if (msg.role === "user") {
      const contentParts = this.transformGPTUserContent(msg.content);
      if (contentParts.length > 0) {
        items.push({ role: "user", content: contentParts });
      }
      return items;
    }

    return items;
  }

  private transformGPTUserContent(content: UnifiedMessage["content"]): any[] {
    if (typeof content === "string") {
      return [{ type: "input_text", text: content }];
    }

    if (!Array.isArray(content)) {
      return [];
    }

    const parts: any[] = [];
    for (const part of content as any[]) {
      if (part?.type === "text") {
        parts.push({ type: "input_text", text: part.text ?? "" });
        continue;
      }

      if (part?.type === "image_url") {
        const imageUrl = part.image_url?.url;
        if (imageUrl) {
          parts.push({ type: "input_image", image_url: imageUrl });
        }
      }
    }

    return parts;
  }

  private extractText(content: UnifiedMessage["content"]): string | null {
    if (typeof content === "string") {
      return content;
    }

    if (!Array.isArray(content)) {
      return null;
    }

    const text = content
      .map((part: any) => (part?.type === "text" ? (part.text ?? "") : ""))
      .join("");

    return text.length > 0 ? text : null;
  }

  private getStringContent(content: UnifiedMessage["content"]): string {
    if (typeof content === "string") {
      return content;
    }

    if (!Array.isArray(content)) {
      return "";
    }

    const text = content
      .map((part: any) => {
        if (part?.type === "text") return part.text ?? "";
        return "";
      })
      .join("");

    if (text.length > 0) {
      return text;
    }

    try {
      return JSON.stringify(content);
    } catch {
      return "";
    }
  }

  private normalizeToolArguments(argumentsValue: any): string {
    if (typeof argumentsValue === "string") {
      return argumentsValue;
    }

    if (argumentsValue === undefined) {
      return "{}";
    }

    try {
      return JSON.stringify(argumentsValue);
    } catch {
      return "{}";
    }
  }

  /**
   * Transform message for Claude/Messages API
   */
  private transformClaudeMessage(msg: UnifiedMessage): any {
    const content = msg.content;
    const result: any = { role: msg.role };

    if (typeof content === "string") {
      result.content = content;
    } else if (Array.isArray(content)) {
      result.content = content.map((part: any) => {
        if (part.type === "text") {
          return { type: "text", text: part.text };
        }
        if (part.type === "image_url") {
          return { type: "image", source: { type: "base64", media_type: "image/png", data: part.image_url?.url } };
        }
        return part;
      });
    }

    // Add tool calls if present
    if (msg.tool_calls) {
      result.tool_calls = msg.tool_calls;
    }
    if (msg.tool_call_id) {
      result.tool_call_id = msg.tool_call_id;
    }

    return result;
  }

  /**
   * Transform tools for GPT/Responses API
   */
  private transformGPTTools(tools: any[]): any {
    if (!Array.isArray(tools) || tools.length === 0) return undefined;

    const transformed = tools
      .map((tool: any) => {
        const name = tool.function?.name || tool.name;
        const description = tool.function?.description || tool.description;
        const parameters = tool.function?.parameters || tool.input_schema;

        if (!name) {
          return null;
        }

        return {
          type: "function",
          name,
          description,
          parameters,
        };
      })
      .filter(Boolean);

    return transformed.length > 0 ? transformed : undefined;
  }

  /**
   * Transform tools for Claude/Messages API
   */
  private transformClaudeTools(tools: any[]): any {
    if (!tools || tools.length === 0) return undefined;

    return tools.map((tool: any) => ({
      name: tool.function?.name,
      description: tool.function?.description,
      input_schema: tool.function?.parameters,
    }));
  }

  async transformResponseOut(
    response: Response,
    context: TransformerContext
  ): Promise<Response> {
    return response;
  }

  async transformResponseIn(
    response: Response,
    context?: TransformerContext
  ): Promise<Response> {
    const contentType = response.headers.get("content-type") || "";
    const isStream = contentType.includes("text/event-stream");
    
    if (isStream) {
      return this.createStreamingProxy(response);
    }
    
    try {
      const data = await response.json();
      const result = this.convertToOpenAIFormat(data);

      return new Response(JSON.stringify(result), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return response;
    }
  }

  private createStreamingProxy(response: Response): Response {
    const encoder = new TextEncoder();
    const reader = response.body?.getReader();
    const self = this;
    
    if (!reader) {
      return response;
    }

    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          
          if (done) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          const chunk = new TextDecoder().decode(value);
          const converted = self.convertStreamChunk(chunk);
          
          if (converted) {
            controller.enqueue(encoder.encode(converted));
          }
        } catch (error) {
          controller.error(error);
        }
      },
      cancel() {
        reader.cancel();
      },
    });

    return new Response(stream, {
      status: response.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  private convertStreamChunk(chunk: string): string | null {
    const lines = chunk.split("\n").filter((line) => line.trim() && line.startsWith("data: "));
    
    if (lines.length === 0) {
      return chunk;
    }

    for (const line of lines) {
      try {
        const dataStr = line.slice(6);
        if (dataStr === "[DONE]") {
          return "data: [DONE]\n\n";
        }

        const data = JSON.parse(dataStr);
        
        if (data.type === "response.output_text.delta" && data.delta) {
          const anthropicChunk = {
            type: "message_delta",
            delta: {
              type: "text_delta",
              text: data.delta,
            },
          };
          return `data: ${JSON.stringify(anthropicChunk)}\n\n`;
        }
        
        if (data.type === "response.output_item.added" && data.item?.type === "message") {
          const startChunk = {
            type: "message_start",
            message: {
              id: data.item.id,
              type: "message",
              role: "assistant",
              content: [],
              model: data.response?.model || "unknown",
            },
          };
          return `data: ${JSON.stringify(startChunk)}\n\n`;
        }

        if (data.response?.type === "response.completed") {
          const stopChunk = {
            type: "message_delta",
            delta: {
              stop_reason: data.response.incomplete_details?.reason === "max_output_tokens" 
                ? "max_tokens" 
                : "end_turn",
            },
            usage: data.response.usage,
          };
          return `data: ${JSON.stringify(stopChunk)}\n\n`;
        }
      } catch {}
    }
    
    return null;
  }

  private convertToAnthropicFormat(copilotResponse: any): any {
    const output = copilotResponse.output || [];
    const usage = copilotResponse.usage || {};

    const content: any[] = [];
    let toolCalls: any[] = [];

    for (const item of output) {
      if (item.type === "reasoning" && item.summary) {
        for (const s of item.summary || []) {
          if (s.text) {
            content.push({ type: "text", text: s.text });
          }
        }
      }
      if (item.type === "message" && item.content) {
        for (const c of item.content) {
          if (c.type === "output_text" && c.text) {
            content.push({ type: "text", text: c.text });
          }
        }
      }
      if (item.type === "function_call") {
        toolCalls.push({
          type: "tool_use",
          id: item.call_id || `tool_${Date.now()}`,
          name: item.name,
          input: JSON.parse(item.arguments || "{}"),
        });
      }
    }

    for (const tc of toolCalls) {
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input: tc.input,
      });
    }

    let stopReason: string | null = null;
    if (copilotResponse.status === "completed") {
      stopReason = toolCalls.length > 0 ? "tool_use" : "end_turn";
    } else if (copilotResponse.status === "incomplete") {
      stopReason = copilotResponse.incomplete_details?.reason === "max_output_tokens" ? "max_tokens" : "end_turn";
    }

    return {
      id: copilotResponse.id || `msg_${Date.now()}`,
      type: "message",
      role: "assistant",
      model: copilotResponse.model,
      content: content.length > 0 ? content : [{ type: "text", text: "" }],
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0,
        cache_read_input_tokens: 0,
      },
    };
  }

  private convertToOpenAIFormat(copilotResponse: any): any {
    const anthropic = this.convertToAnthropicFormat(copilotResponse);
    
    let textContent = "";
    for (const c of anthropic.content || []) {
      if (c.type === "text") {
        textContent += c.text;
      }
    }
    
    const hasToolCalls = anthropic.content?.some((c: any) => c.type === "tool_use");
    
    return {
      id: anthropic.id,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: anthropic.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: textContent,
          },
          finish_reason: hasToolCalls ? "tool_calls" : (anthropic.stop_reason === "end_turn" ? "stop" : anthropic.stop_reason),
        },
      ],
      usage: anthropic.usage,
    };
  }
}

// Register transformer name for config lookup
(CopilotTransformer as any).TransformerName = "copilot";
