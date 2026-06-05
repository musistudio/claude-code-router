export interface SummaryInjectorConfig {
  enabled: boolean;
  maxTokens: number;
  summaryPrompt: string;
  preserveRecentMessages: number;
  compressionRatio: number;
}

const DEFAULT_CONFIG: SummaryInjectorConfig = {
  enabled: true,
  maxTokens: 100000,
  summaryPrompt: "Summarize the following conversation concisely, preserving: key decisions, file paths, tool calls made, current task progress, and any errors encountered. Keep under 1200 chars.",
  preserveRecentMessages: 4,
  compressionRatio: 0.3,
};

export class SummaryInjector {
  private config: SummaryInjectorConfig;
  private summaries: Map<string, string> = new Map();

  constructor(config: Partial<SummaryInjectorConfig> = {}, private logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  shouldCompact(body: any): boolean {
    if (!this.config.enabled || !body?.messages) return false;
    const estimatedTokens = this.estimateTokens(body);
    return estimatedTokens > this.config.maxTokens;
  }

  estimateTokens(body: any): number {
    if (!body?.messages) return 0;
    let total = 0;
    for (const msg of body.messages) {
      if (typeof msg.content === "string") {
        total += Math.ceil(msg.content.length / 4);
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text" && block.text) {
            total += Math.ceil(block.text.length / 4);
          } else if (block.type === "tool_result") {
            const resultText = typeof block.content === "string"
              ? block.content
              : JSON.stringify(block.content || "");
            total += Math.ceil(resultText.length / 4);
          } else if (block.thinking) {
            total += Math.ceil(block.thinking.length / 4);
          }
        }
      }
      if (msg.tool_calls) {
        total += Math.ceil(JSON.stringify(msg.tool_calls).length / 4);
      }
    }
    if (body.system) {
      const sysText = typeof body.system === "string"
        ? body.system
        : Array.isArray(body.system)
          ? body.system.filter((s: any) => s.type === "text").map((s: any) => s.text || "").join("\n")
          : "";
      total += Math.ceil(sysText.length / 4);
    }
    return total;
  }

  buildCompactionPayload(body: any): { messages: any[]; summaryAdded: boolean } {
    if (!this.config.enabled || !body?.messages) {
      return { messages: body?.messages || [], summaryAdded: false };
    }

    const msgs = body.messages;
    if (msgs.length <= this.config.preserveRecentMessages + 2) {
      return { messages: msgs, summaryAdded: false };
    }

    const recentStart = Math.max(0, msgs.length - this.config.preserveRecentMessages);
    const olderMessages = msgs.slice(0, recentStart);

    if (olderMessages.length === 0) {
      return { messages: msgs, summaryAdded: false };
    }

    const summary = this.generateSummary(olderMessages);
    const sessionId = this.extractSessionId(body);
    if (sessionId) {
      this.summaries.set(sessionId, summary);
    }

    const summaryMsg = {
      role: "user",
      content: `[Previous conversation summary]\n${summary}\n[Continue from where we left off]`,
    };

    const recentMsgs = msgs.slice(recentStart);
    const newMessages = [summaryMsg, ...recentMsgs];

    this.logger?.info(
      `SummaryInjector: compacted ${olderMessages.length} messages into summary (${summary.length} chars)`
    );

    return { messages: newMessages, summaryAdded: true };
  }

  getStoredSummary(sessionId: string): string | undefined {
    return this.summaries.get(sessionId);
  }

  getStats(): { enabled: boolean; storedSummaries: number } {
    return { enabled: this.config.enabled, storedSummaries: this.summaries.size };
  }

  private generateSummary(messages: any[]): string {
    const parts: string[] = [];

    for (const msg of messages) {
      const text = this.extractMessageText(msg);
      if (!text) continue;

      const truncated = text.length > 200 ? text.slice(0, 200) + "..." : text;

      if (msg.role === "user") {
        parts.push(`User: ${truncated}`);
      } else if (msg.role === "assistant") {
        parts.push(`Assistant: ${truncated}`);
      } else if (msg.role === "tool") {
        parts.push(`Tool[${msg.name || msg.tool_call_id || "?"}]: ${truncated}`);
      }
    }

    let summary = parts.join("\n");

    const maxChars = 1200;
    if (summary.length > maxChars) {
      const lines = summary.split("\n");
      const keep = Math.ceil(lines.length * this.config.compressionRatio);
      const head = lines.slice(0, Math.ceil(keep / 2));
      const tail = lines.slice(-Math.floor(keep / 2));
      summary = [...head, `[...${lines.length - head.length - tail.length} interactions omitted...]`, ...tail].join("\n");
    }

    return summary;
  }

  private extractMessageText(msg: any): string {
    if (typeof msg.content === "string") return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text || "")
        .join(" ");
    }
    return "";
  }

  private extractSessionId(body: any): string | null {
    return body?.metadata?.sessionId || null;
  }
}
