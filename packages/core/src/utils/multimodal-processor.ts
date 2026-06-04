/**
 * Multimodal Processor - 多模态数据转换
 *
 * Handles multimodal content in LLM requests:
 * - Image analysis (chart/screenshot → text description)
 * - CSV/table parsing → statistical summary
 * - File reading with path whitelist
 *
 * Design: Zero external dependencies. Uses proxy self-calls for vision models.
 */

export interface MultimodalConfig {
  enabled: boolean;
  /** Enable image analysis via vision model */
  imageAnalysis: boolean;
  /** Vision model to use */
  visionModel: string;
  /** Proxy port for self-calls */
  proxyPort: number;
  /** API key for self-calls */
  apiKey: string;
  /** Allowed file paths for reading (whitelist) */
  allowedPaths: string[];
  /** Max file size to read in bytes */
  maxFileSize: number;
  /** Timeout for vision analysis in ms */
  visionTimeoutMs: number;
}

const DEFAULT_CONFIG: MultimodalConfig = {
  enabled: false,
  imageAnalysis: false,
  visionModel: 'openai,gpt-4o',
  proxyPort: 3456,
  apiKey: '',
  allowedPaths: [],
  maxFileSize: 1024 * 1024,
  visionTimeoutMs: 15000,
};

export interface ProcessedContent {
  type: 'text' | 'image_analysis' | 'csv_summary' | 'file_content';
  content: string;
  metadata?: Record<string, any>;
}

export class MultimodalProcessor {
  private config: MultimodalConfig;
  private logger?: any;

  constructor(config: Partial<MultimodalConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Process multimodal content in a request body.
   * Converts images and files to text descriptions.
   */
  async processRequest(body: any): Promise<any> {
    if (!this.config.enabled) return body;

    const messages = body.messages || [];
    let modified = false;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!Array.isArray(msg.content)) continue;

      const newContent: any[] = [];

      for (const block of msg.content) {
        if (block.type === 'image' && this.config.imageAnalysis) {
          // Analyze image via vision model
          const description = await this.analyzeImage(block);
          if (description) {
            newContent.push({ type: 'text', text: `[Image Analysis]\n${description}` });
            modified = true;
          } else {
            newContent.push(block);
          }
        } else if (block.type === 'text' && this.config.allowedPaths.length > 0) {
          // Check for file references in text
          const enriched = await this.enrichWithFileContent(block.text || '');
          if (enriched !== block.text) {
            newContent.push({ ...block, text: enriched });
            modified = true;
          } else {
            newContent.push(block);
          }
        } else {
          newContent.push(block);
        }
      }

      if (modified) {
        messages[i] = { ...msg, content: newContent };
      }
    }

    if (modified) {
      return { ...body, messages };
    }
    return body;
  }

  /**
   * Parse CSV content into a statistical summary.
   */
  parseCsvSummary(csvContent: string): ProcessedContent {
    const lines = csvContent.split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      return { type: 'csv_summary', content: 'Empty or invalid CSV' };
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => line.split(',').map(v => v.trim()));

    // Detect numeric columns for statistics
    const numericCols: number[] = [];
    for (let col = 0; col < headers.length; col++) {
      const values = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
      if (values.length > rows.length * 0.5) {
        numericCols.push(col);
      }
    }

    const summary: string[] = [
      `CSV Summary: ${rows.length} rows × ${headers.length} columns`,
      `Columns: ${headers.join(', ')}`,
    ];

    // Add statistics for numeric columns
    for (const col of numericCols) {
      const values = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        summary.push(`${headers[col]}: min=${min.toFixed(2)}, max=${max.toFixed(2)}, avg=${avg.toFixed(2)}`);
      }
    }

    return {
      type: 'csv_summary',
      content: summary.join('\n'),
      metadata: { rows: rows.length, columns: headers.length, numericColumns: numericCols.map(i => headers[i]) },
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<MultimodalConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private async analyzeImage(imageBlock: any): Promise<string | null> {
    // If image is base64 or URL, send to vision model
    const imageData = imageBlock.source?.data || imageBlock.url;
    if (!imageData) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.visionTimeoutMs);

    try {
      const response = await fetch(`http://127.0.0.1:${this.config.proxyPort}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
        },
        body: JSON.stringify({
          model: this.config.visionModel,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image/chart in detail. Focus on data, trends, and key information.' },
              { type: 'image', source: imageBlock.source || { type: 'url', url: imageData } },
            ],
          }],
          stream: false,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) return null;
      const data = await response.json();
      return data.content?.[0]?.text || null;
    } catch (e: any) {
      clearTimeout(timeout);
      this.logger?.debug(`MultimodalProcessor image analysis failed: ${e?.message}`);
      return null;
    }
  }

  private async enrichWithFileContent(text: string): Promise<string> {
    // Check for file path references like @file:path or ./path
    const filePattern = /@(?:file|path):([^\s]+)/g;
    let result = text;
    let match;

    while ((match = filePattern.exec(text)) !== null) {
      const filePath = match[1];
      if (this.isPathAllowed(filePath)) {
        try {
          const { readFile } = await import('fs/promises');
          const content = await readFile(filePath, 'utf-8');
          if (content.length <= this.config.maxFileSize) {
            result = result.replace(match[0], `\n[File: ${filePath}]\n${content}\n[/File]`);
          }
        } catch (e: any) {
          this.logger?.debug(`MultimodalProcessor file read failed: ${e?.message}`);
        }
      }
    }

    return result;
  }

  private isPathAllowed(filePath: string): boolean {
    if (this.config.allowedPaths.length === 0) return false;
    return this.config.allowedPaths.some(allowed => filePath.startsWith(allowed));
  }
}

let globalMultimodal: MultimodalProcessor | null = null;

export function getMultimodalProcessor(config?: Partial<MultimodalConfig>, logger?: any): MultimodalProcessor {
  if (!globalMultimodal) {
    globalMultimodal = new MultimodalProcessor(config, logger);
  } else if (config) {
    globalMultimodal.updateConfig(config);
  }
  return globalMultimodal;
}
