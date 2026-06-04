/**
 * Document Loader - 多格式文档加载器
 *
 * Loads and parses documents for RAG enrichment:
 * - Markdown (.md)
 * - CSV (.csv)
 * - JSON (.json)
 * - Text (.txt)
 * - Log files (.log)
 *
 * Design: Zero external dependencies. Node.js built-in file operations.
 */

import { readFile, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join, extname } from "path";

export interface DocLoaderConfig {
  enabled: boolean;
  /** Root directory to scan */
  rootDir: string;
  /** File extensions to include */
  extensions: string[];
  /** Max file size in bytes */
  maxFileSize: number;
  /** Max total tokens to return */
  maxTokens: number;
  /** Ignore patterns (glob-like) */
  ignorePatterns: string[];
}

const DEFAULT_CONFIG: DocLoaderConfig = {
  enabled: true,
  rootDir: '.',
  extensions: ['.md', '.txt', '.json', '.csv', '.log'],
  maxFileSize: 1024 * 1024, // 1MB
  maxTokens: 5000,
  ignorePatterns: ['node_modules', '.git', 'dist', 'coverage'],
};

export interface LoadedDoc {
  path: string;
  filename: string;
  extension: string;
  content: string;
  tokenCount: number;
  size: number;
}

export class DocLoader {
  private config: DocLoaderConfig;
  private logger?: any;

  constructor(config: Partial<DocLoaderConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Load documents matching the configured criteria.
   */
  async load(query?: string): Promise<LoadedDoc[]> {
    if (!this.config.enabled) return [];

    const docs: LoadedDoc[] = [];
    let totalTokens = 0;

    try {
      const files = await this.scanDir(this.config.rootDir);

      for (const filePath of files) {
        if (totalTokens >= this.config.maxTokens) break;

        try {
          const doc = await this.loadFile(filePath);
          if (doc) {
            // If query provided, filter by relevance
            if (query && !this.isRelevant(doc.content, query)) continue;

            docs.push(doc);
            totalTokens += doc.tokenCount;
          }
        } catch (e: any) {
          this.logger?.debug(`DocLoader: failed to load ${filePath}: ${e?.message}`);
        }
      }
    } catch (e: any) {
      this.logger?.warn(`DocLoader scan failed: ${e?.message}`);
    }

    return docs;
  }

  /**
   * Load a single file by path.
   */
  async loadFile(filePath: string): Promise<LoadedDoc | null> {
    if (!existsSync(filePath)) return null;

    const stats = await stat(filePath);
    if (stats.size > this.config.maxFileSize) return null;

    const ext = extname(filePath).toLowerCase();
    if (!this.config.extensions.includes(ext)) return null;

    const content = await readFile(filePath, 'utf-8');
    const tokenCount = Math.ceil(content.length / 4);

    return {
      path: filePath,
      filename: filePath.split(/[/\\]/).pop() || filePath,
      extension: ext,
      content: this.processContent(content, ext),
      tokenCount,
      size: stats.size,
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<DocLoaderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private async scanDir(dir: string): Promise<string[]> {
    const results: string[] = [];

    if (!existsSync(dir)) return results;

    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      // Skip ignored patterns
      if (this.config.ignorePatterns.some(p => entry.name.includes(p))) continue;

      if (entry.isDirectory()) {
        const subFiles = await this.scanDir(fullPath);
        results.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (this.config.extensions.includes(ext)) {
          results.push(fullPath);
        }
      }
    }

    return results;
  }

  private processContent(content: string, ext: string): string {
    switch (ext) {
      case '.csv':
        return this.processCsv(content);
      case '.json':
        return this.processJson(content);
      default:
        return content;
    }
  }

  private processCsv(content: string): string {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length === 0) return '';

    // Convert CSV to readable format
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1, 20).map(line => {
      const values = line.split(',').map(v => v.trim());
      return headers.map((h, i) => `${h}: ${values[i] || ''}`).join(', ');
    });

    return `CSV Data (${lines.length - 1} rows, ${headers.length} columns):\nHeaders: ${headers.join(', ')}\nSample:\n${rows.join('\n')}`;
  }

  private processJson(content: string): string {
    try {
      const obj = JSON.parse(content);
      // Truncate large JSON
      const str = JSON.stringify(obj, null, 2);
      if (str.length > 4000) {
        return str.slice(0, 4000) + '\n... [truncated]';
      }
      return str;
    } catch {
      return content;
    }
  }

  private isRelevant(content: string, query: string): boolean {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const contentLower = content.toLowerCase();
    const matches = queryTerms.filter(t => contentLower.includes(t));
    return matches.length >= Math.ceil(queryTerms.length * 0.3);
  }
}

let globalLoader: DocLoader | null = null;

export function getDocLoader(config?: Partial<DocLoaderConfig>, logger?: any): DocLoader {
  if (!globalLoader) {
    globalLoader = new DocLoader(config, logger);
  } else if (config) {
    globalLoader.updateConfig(config);
  }
  return globalLoader;
}
