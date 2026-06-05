export interface StructuredOutputConfig {
  enabled: boolean;
}

export class StructuredOutputEnforcer {
  private config: StructuredOutputConfig;
  private stats = { enforced: 0, extracted: 0, failed: 0 };

  constructor(config: StructuredOutputConfig) {
    this.config = config;
  }

  enforce(body: any, responseBody: any): any {
    if (!this.config.enabled) return responseBody;

    const needsJson =
      body?.response_format?.type === "json_object" ||
      (Array.isArray(body?.tools) && body.tools.length > 0);

    if (!needsJson) return responseBody;

    this.stats.enforced++;

    const content = this.extractContent(responseBody);
    if (content === null) return responseBody;

    try {
      JSON.parse(content);
      return responseBody;
    } catch {
      const extracted = this.extractJson(content);
      if (extracted !== null) {
        this.stats.extracted++;
        return this.replaceContent(responseBody, extracted);
      }

      this.stats.failed++;
      return {
        id: responseBody?.id ?? "unknown",
        object: "chat.completion",
        created: responseBody?.created ?? Math.floor(Date.now() / 1000),
        model: responseBody?.model ?? "unknown",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({
                error: "structured_output_failed",
                message: "Failed to extract valid JSON from response",
                raw_content: content,
              }),
            },
            finish_reason: "stop",
          },
        ],
        usage: responseBody?.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    }
  }

  extractJson(text: string): string | null {
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      try {
        JSON.parse(codeBlockMatch[1].trim());
        return codeBlockMatch[1].trim();
      } catch {}
    }

    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        JSON.parse(braceMatch[0]);
        return braceMatch[0];
      } catch {}
    }

    const bracketMatch = text.match(/\[[\s\S]*\]/);
    if (bracketMatch) {
      try {
        JSON.parse(bracketMatch[0]);
        return bracketMatch[0];
      } catch {}
    }

    return null;
  }

  getStats() {
    return { ...this.stats };
  }

  private extractContent(responseBody: any): string | null {
    const content = responseBody?.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
    return null;
  }

  private replaceContent(responseBody: any, newContent: string): any {
    const clone = JSON.parse(JSON.stringify(responseBody));
    if (clone?.choices?.[0]?.message) {
      clone.choices[0].message.content = newContent;
    }
    return clone;
  }
}
