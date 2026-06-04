import { createHash } from "crypto";

export interface ReplayConfig {
  enabled: boolean;
  storagePath: string;
  maxSnapshots: number;
}

interface ReplaySnapshot {
  id: string;
  timestamp: number;
  requestBody: any;
  responseBody: any;
  usage: { inputTokens: number; outputTokens: number };
  provider: string;
  model: string;
  latencyMs: number;
  qualityScore: number;
}

const DEFAULT_CONFIG: ReplayConfig = {
  enabled: true,
  storagePath: "./dev/replay-snapshots.jsonl",
  maxSnapshots: 1000,
};

export class RequestReplay {
  private config: ReplayConfig;
  private snapshots: ReplaySnapshot[] = [];

  constructor(config: Partial<ReplayConfig> = {}, private logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async record(requestBody: any, responseBody: any, meta: {
    provider: string;
    model: string;
    latencyMs: number;
    qualityScore: number;
    usage: { inputTokens: number; outputTokens: number };
  }): Promise<void> {
    if (!this.config.enabled) return;

    const snapshot: ReplaySnapshot = {
      id: createHash("sha256").update(JSON.stringify(requestBody)).digest("hex").slice(0, 16),
      timestamp: Date.now(),
      requestBody: this.sanitize(requestBody),
      responseBody: this.sanitize(responseBody),
      usage: meta.usage,
      provider: meta.provider,
      model: meta.model,
      latencyMs: meta.latencyMs,
      qualityScore: meta.qualityScore,
    };

    this.snapshots.push(snapshot);

    if (this.snapshots.length > this.config.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.config.maxSnapshots);
    }

    this.logger?.debug(`RequestReplay: recorded snapshot ${snapshot.id}`);
  }

  async replay(snapshotId: string, handler: (body: any) => Promise<any>): Promise<{
    originalResponse: any;
    replayResponse: any;
    match: boolean;
    diff: string;
  } | null> {
    const snapshot = this.snapshots.find((s) => s.id === snapshotId);
    if (!snapshot) return null;

    const replayResponse = await handler(snapshot.requestBody);

    const originalText = this.extractText(snapshot.responseBody);
    const replayText = this.extractText(replayResponse);

    const match = this.computeSimilarity(originalText, replayText) > 0.8;

    return {
      originalResponse: snapshot.responseBody,
      replayResponse,
      match,
      diff: match ? "Responses match (>80% similar)" : "Responses differ significantly",
    };
  }

  async regressionTest(handler: (body: any) => Promise<any>): Promise<{
    total: number;
    passed: number;
    failed: number;
    details: { id: string; match: boolean; similarity: number }[];
  }> {
    const details: { id: string; match: boolean; similarity: number }[] = [];
    let passed = 0;
    let failed = 0;

    for (const snapshot of this.snapshots) {
      try {
        const replayResponse = await handler(snapshot.requestBody);
        const originalText = this.extractText(snapshot.responseBody);
        const replayText = this.extractText(replayResponse);
        const similarity = this.computeSimilarity(originalText, replayText);
        const match = similarity > 0.5;

        details.push({ id: snapshot.id, match, similarity });
        if (match) passed++;
        else failed++;
      } catch (e: any) {
        details.push({ id: snapshot.id, match: false, similarity: 0 });
        failed++;
      }
    }

    return { total: this.snapshots.length, passed, failed, details };
  }

  getSnapshots(limit?: number): ReplaySnapshot[] {
    const sorted = [...this.snapshots].sort((a, b) => b.timestamp - a.timestamp);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  getSnapshot(id: string): ReplaySnapshot | undefined {
    return this.snapshots.find((s) => s.id === id);
  }

  getStats(): { enabled: boolean; snapshots: number } {
    return { enabled: this.config.enabled, snapshots: this.snapshots.length };
  }

  private sanitize(obj: any): any {
    const str = JSON.stringify(obj);
    if (str.length > 100000) {
      return JSON.parse(str.slice(0, 100000));
    }
    return obj;
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
    return JSON.stringify(response).slice(0, 5000);
  }

  private computeSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    if (a === b) return 1;

    const setA = new Set(a.toLowerCase().split(/\s+/));
    const setB = new Set(b.toLowerCase().split(/\s+/));

    let intersection = 0;
    for (const word of setA) {
      if (setB.has(word)) intersection++;
    }

    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
