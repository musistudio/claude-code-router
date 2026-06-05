export interface MultiVoterConfig {
  enabled: boolean;
  models: string[];
  strategy: "majority" | "best-quality" | "concat";
  maxConcurrent: number;
  timeoutMs: number;
}

interface VoteResult {
  model: string;
  response: any;
  quality: number;
  latencyMs: number;
}

const DEFAULT_CONFIG: MultiVoterConfig = {
  enabled: false,
  models: [],
  strategy: "majority",
  maxConcurrent: 3,
  timeoutMs: 30000,
};

export class MultiModelVoter {
  private config: MultiVoterConfig;

  constructor(config: Partial<MultiVoterConfig> = {}, private logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  isEnabled(): boolean {
    return this.config.enabled && this.config.models.length >= 2;
  }

  getModels(): string[] {
    return [...this.config.models];
  }

  getStrategy(): string {
    return this.config.strategy;
  }

  selectWinner(results: VoteResult[]): VoteResult {
    if (results.length === 0) throw new Error("No results to vote on");
    if (results.length === 1) return results[0];

    switch (this.config.strategy) {
      case "best-quality":
        return this.selectBestQuality(results);
      case "majority":
        return this.selectMajority(results);
      case "concat":
        return this.selectConcat(results);
      default:
        return results[0];
    }
  }

  buildVotingPrompt(results: VoteResult[]): string {
    const responses = results
      .map((r, i) => `--- Response ${i + 1} (${r.model}, quality=${r.quality.toFixed(2)}) ---\n${this.extractText(r.response)}`)
      .join("\n\n");

    return [
      "Multiple AI models generated the following responses to the same query.",
      "Select the best response by quality, accuracy, and completeness.",
      "If responses are similar, prefer the most concise one.",
      "Return ONLY the best response text, nothing else.\n",
      responses,
    ].join("\n");
  }

  private selectBestQuality(results: VoteResult[]): VoteResult {
    return results.reduce((best, curr) =>
      curr.quality > best.quality ? curr : best
    , results[0]);
  }

  private selectMajority(results: VoteResult[]): VoteResult {
    const textGroups = new Map<string, VoteResult[]>();

    for (const result of results) {
      const text = this.extractText(result.response);
      const key = text.slice(0, 200).toLowerCase().trim();
      const group = textGroups.get(key) || [];
      group.push(result);
      textGroups.set(key, group);
    }

    let largestGroup: VoteResult[] = [];
    for (const group of textGroups.values()) {
      if (group.length > largestGroup.length) {
        largestGroup = group;
      }
    }

    return this.selectBestQuality(largestGroup);
  }

  private selectConcat(results: VoteResult[]): VoteResult {
    const combined = results
      .map((r) => `[${r.model}]: ${this.extractText(r.response)}`)
      .join("\n\n---\n\n");

    return {
      model: "multi-vote-concat",
      response: {
        content: [{ type: "text", text: combined }],
        model: "multi-vote-concat",
      },
      quality: results.reduce((sum, r) => sum + r.quality, 0) / results.length,
      latencyMs: Math.max(...results.map((r) => r.latencyMs)),
    };
  }

  private extractText(response: any): string {
    if (!response) return "";
    if (typeof response === "string") return response;
    if (response.content) {
      if (typeof response.content === "string") return response.content;
      if (Array.isArray(response.content)) {
        return response.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text || "")
          .join("\n");
      }
    }
    return JSON.stringify(response).slice(0, 2000);
  }

  getStats(): { enabled: boolean; models: number; strategy: string } {
    return {
      enabled: this.config.enabled,
      models: this.config.models.length,
      strategy: this.config.strategy,
    };
  }
}
