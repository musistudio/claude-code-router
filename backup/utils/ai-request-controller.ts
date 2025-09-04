import { createHash } from 'crypto';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { info, error, warn } from './log';


interface AIRequest {
  id: string;
  timestamp: number;
  fingerprint: string;
  url: string;
  cached?: boolean;
}

interface DeduplicationCache {
  [fingerprint: string]: {
    response: any;
    timestamp: number;
    count: number;
  };
}

class AIRequestController {
  private requests: AIRequest[] = [];
  private cache: DeduplicationCache = {};
  private dataFile: string;

  constructor() {
    this.dataFile = join(homedir(), '.claude-code-router', 'ai-requests.json');
    this.loadData();
  }

  private generateFingerprint(url: string, options?: RequestInit): string {
    // Simplified, safer fingerprinting
    const content = { url, method: options?.method };
    return createHash('sha256').update(JSON.stringify(content)).digest('hex').substring(0, 16);
  }

  private checkDeduplication(fingerprint: string, cacheTTL: number = 300000): { isDuplicate: boolean; cachedResponse?: any } {
    const cached = this.cache[fingerprint];
    if (cached && (Date.now() - cached.timestamp < cacheTTL)) {
      cached.count++;
      info(`[AIRequestController] Cache HIT for fingerprint: ${fingerprint}`);
      return { isDuplicate: true, cachedResponse: cached.response };
    }
    return { isDuplicate: false };
  }

  public async fetchWithCache(url: string, options?: RequestInit, cacheTTL?: number): Promise<any> {
    const fingerprint = this.generateFingerprint(url, options);
    const dedup = this.checkDeduplication(fingerprint, cacheTTL);
    if (dedup.isDuplicate) {
      return JSON.parse(JSON.stringify(dedup.cachedResponse));
    }

    info(`[AIRequestController] Cache MISS for ${fingerprint}. Fetching from network.`);
    const response = await fetch(url, options); // Uses the patched, resilient fetch

    let responseData;
    try {
      // Try to parse as JSON, but fall back to text if it fails
      responseData = await response.clone().json();
    } catch (e) {
      responseData = await response.text();
    }

    // Cache only successful responses
    if (response.ok) {
        this.cacheResponse(fingerprint, responseData);
    }
    this.recordRequest(fingerprint, url);
    
    return responseData;
  }

  private cacheResponse(fingerprint: string, response: any): void {
    this.cache[fingerprint] = {
      response: response,
      timestamp: Date.now(),
      count: 1,
    };
    this.saveData();
  }

  private recordRequest(fingerprint: string, url: string): void {
    const aiRequest: AIRequest = {
      id: `req_${Date.now()}`,
      timestamp: Date.now(),
      fingerprint,
      url,
    };
    this.requests.push(aiRequest);
    this.saveData();
  }

  private loadData(): void {
    try {
      if (existsSync(this.dataFile)) {
        const data = JSON.parse(readFileSync(this.dataFile, 'utf8'));
        this.requests = data.requests || [];
        this.cache = data.cache || {};
      }
    } catch (error) {
      error('[AIRequestController] Error loading data:', formatError(error));
    }
  }

  private saveData(): void {
    try {
      const data = { requests: this.requests.slice(-1000), cache: this.cache };
      writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
      error('[AIRequestController] Error saving data:', formatError(error));
    }
  }

  public getStatistics(): object {
    const totalRequests = this.requests.length;
    const cacheHits = Object.values(this.cache).reduce((sum, entry) => sum + (entry.count - 1), 0);
    const cacheEntries = Object.keys(this.cache).length;

    return {
        totalRequests,
        cacheHits,
        cacheEntries,
        cacheHitRate: totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0
    };
  }
}

export const aiRequestController = new AIRequestController();

// Helper function to handle unknown errors
function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return JSON.stringify(error);
}
