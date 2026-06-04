/**
 * Code Extractor - 代码块提取与清理
 *
 * Extracts clean code from LLM responses:
 * - Markdown code block extraction
 * - Language detection
 * - Code cleaning (remove comments, fix indentation)
 * - Multiple code block aggregation
 *
 * Design: Zero external dependencies. Regex-based extraction.
 */

export interface CodeExtractorConfig {
  enabled: boolean;
  /** Remove markdown code fences */
  stripFences: boolean;
  /** Auto-detect language from content */
  detectLanguage: boolean;
  /** Trim leading/trailing whitespace */
  trimWhitespace: boolean;
  /** Extract only the first code block */
  firstOnly: boolean;
}

const DEFAULT_CONFIG: CodeExtractorConfig = {
  enabled: true,
  stripFences: true,
  detectLanguage: true,
  trimWhitespace: true,
  firstOnly: false,
};

export interface ExtractedCode {
  language: string;
  code: string;
  raw: string;
  startIndex: number;
  endIndex: number;
}

export class CodeExtractor {
  private config: CodeExtractorConfig;
  private logger?: any;

  constructor(config: Partial<CodeExtractorConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Extract code blocks from text.
   */
  extract(text: string): ExtractedCode[] {
    if (!this.config.enabled || !text) return [];

    const codeBlockRegex = /```(\w+)?\s*\n?([\s\S]*?)\n?\s*```/g;
    const results: ExtractedCode[] = [];
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const language = match[1] || this.detectLanguage(match[2]) || 'text';
      let code = match[2] || '';

      if (this.config.trimWhitespace) {
        code = code.trim();
      }

      results.push({
        language,
        code,
        raw: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });

      if (this.config.firstOnly) break;
    }

    // If no code blocks found, try to detect inline code
    if (results.length === 0) {
      const inlineCode = this.extractInlineCode(text);
      if (inlineCode) {
        results.push(inlineCode);
      }
    }

    return results;
  }

  /**
   * Extract the first code block from text.
   */
  extractFirst(text: string): ExtractedCode | null {
    const results = this.extract(text);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Extract and return just the code string.
   */
  extractCode(text: string): string {
    const first = this.extractFirst(text);
    return first?.code || text;
  }

  /**
   * Clean a code string (remove comments, fix indentation).
   */
  cleanCode(code: string, language?: string): string {
    let cleaned = code;

    // Remove single-line comments
    if (['javascript', 'typescript', 'java', 'c', 'cpp', 'go', 'rust'].includes(language || '')) {
      cleaned = cleaned.replace(/\/\/.*$/gm, '');
    } else if (['python', 'ruby', 'shell', 'bash'].includes(language || '')) {
      cleaned = cleaned.replace(/#.*$/gm, '');
    }

    // Remove empty lines
    cleaned = cleaned.replace(/^\s*\n/gm, '');

    // Fix indentation (remove common leading whitespace)
    const lines = cleaned.split('\n');
    const minIndent = lines
      .filter(l => l.trim().length > 0)
      .reduce((min, line) => {
        const match = line.match(/^(\s*)/);
        return Math.min(min, match ? match[1].length : 0);
      }, Infinity);

    if (minIndent > 0 && minIndent < Infinity) {
      cleaned = lines.map(l => l.slice(minIndent)).join('\n');
    }

    return cleaned.trim();
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<CodeExtractorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private detectLanguage(code: string): string {
    const trimmed = code.trim();

    // Common patterns
    if (/^(import|from|def|class|if __name__)/.test(trimmed)) return 'python';
    if (/^(const|let|var|function|import|export|async)/.test(trimmed)) return 'javascript';
    if (/^(interface|type|enum|namespace|import|export)/.test(trimmed)) return 'typescript';
    if (/^(fn|let|mut|use|pub|impl|struct|enum)/.test(trimmed)) return 'rust';
    if (/^(func|package|import|type|var|const)/.test(trimmed)) return 'go';
    if (/^(public|private|class|interface|import)/.test(trimmed)) return 'java';
    if (/^(#include|int |void |char )/.test(trimmed)) return 'c';
    if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)/i.test(trimmed)) return 'sql';
    if (/^(<\?php|\$[a-zA-Z])/.test(trimmed)) return 'php';
    if (/^(<!DOCTYPE|<html|<div|<span)/i.test(trimmed)) return 'html';
    if (/^(\.|\#|@|body|html|div)\s*\{/.test(trimmed)) return 'css';
    if (/^(apiVersion|kind|metadata|spec)/.test(trimmed)) return 'yaml';
    if (/^\{[\s\S]*\}$/.test(trimmed)) return 'json';
    if (/^(FROM|RUN|COPY|CMD|ENTRYPOINT|EXPOSE)/i.test(trimmed)) return 'dockerfile';

    return 'text';
  }

  private extractInlineCode(text: string): ExtractedCode | null {
    // Try to find code that looks like it should be in a code block
    const patterns = [
      /^(?:import|from|const|let|var|function|def|class|interface|type)\s/m,
      /^(?:SELECT|INSERT|UPDATE|DELETE|CREATE)\s/im,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match) {
        const code = text.slice(match.index).trim();
        return {
          language: this.detectLanguage(code),
          code,
          raw: code,
          startIndex: match.index,
          endIndex: text.length,
        };
      }
    }

    return null;
  }
}

let globalExtractor: CodeExtractor | null = null;

export function getCodeExtractor(config?: Partial<CodeExtractorConfig>, logger?: any): CodeExtractor {
  if (!globalExtractor) {
    globalExtractor = new CodeExtractor(config, logger);
  } else if (config) {
    globalExtractor.updateConfig(config);
  }
  return globalExtractor;
}
