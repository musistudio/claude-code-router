/**
 * Structured Output - 结构化输出强制
 *
 * Forces LLM responses into specific formats (JSON, code blocks).
 * Auto-repairs malformed JSON, extracts code blocks, validates schemas.
 *
 * Design: Zero external dependencies. Regex-based extraction + JSON repair.
 */

export interface StructuredOutputConfig {
  enabled: boolean;
  /** Force JSON output mode */
  forceJson: boolean;
  /** JSON schema to validate against (optional) */
  jsonSchema?: Record<string, any>;
  /** Extract code blocks from response */
  extractCodeBlocks: boolean;
  /** Auto-repair malformed JSON */
  autoRepairJson: boolean;
  /** Max repair attempts */
  maxRepairAttempts: number;
}

const DEFAULT_CONFIG: StructuredOutputConfig = {
  enabled: true,
  forceJson: false,
  extractCodeBlocks: true,
  autoRepairJson: true,
  maxRepairAttempts: 3,
};

export interface StructuredResult {
  /** Whether the output was successfully structured */
  success: boolean;
  /** The structured output (JSON object or code string) */
  output: any;
  /** Original raw output */
  raw: string;
  /** Format detected: 'json', 'code', 'text' */
  format: 'json' | 'code' | 'text';
  /** Repair info if auto-repair was applied */
  repaired: boolean;
  /** Validation errors if schema validation failed */
  validationErrors?: string[];
}

export class StructuredOutputProcessor {
  private config: StructuredOutputConfig;
  private logger?: any;

  constructor(config: Partial<StructuredOutputConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Process and enforce structured output.
   */
  process(rawOutput: string): StructuredResult {
    if (!this.config.enabled || !rawOutput) {
      return { success: true, output: rawOutput, raw: rawOutput, format: 'text', repaired: false };
    }

    // Try JSON extraction first
    const jsonResult = this.tryExtractJson(rawOutput);
    if (jsonResult) {
      return jsonResult;
    }

    // Try code block extraction
    if (this.config.extractCodeBlocks) {
      const codeResult = this.tryExtractCodeBlocks(rawOutput);
      if (codeResult) {
        return codeResult;
      }
    }

    // Force JSON mode: try to wrap text in JSON
    if (this.config.forceJson) {
      const forcedJson = this.forceJsonWrap(rawOutput);
      if (forcedJson) {
        return forcedJson;
      }
    }

    return { success: true, output: rawOutput, raw: rawOutput, format: 'text', repaired: false };
  }

  /**
   * Inject JSON mode instructions into the request body.
   */
  injectJsonMode(body: any): any {
    if (!this.config.enabled || !this.config.forceJson) return body;

    const modified = { ...body };

    // Add response_format for OpenAI-compatible APIs
    if (!modified.response_format) {
      modified.response_format = { type: 'json_object' };
    }

    // Add instruction to system prompt
    const jsonInstruction = '\nYou MUST respond with valid JSON only. No markdown, no explanation, just JSON.';
    if (typeof modified.system === 'string') {
      modified.system += jsonInstruction;
    } else if (Array.isArray(modified.system)) {
      const lastItem = modified.system[modified.system.length - 1];
      if (lastItem?.type === 'text') {
        lastItem.text += jsonInstruction;
      } else {
        modified.system.push({ type: 'text', text: jsonInstruction });
      }
    }

    return modified;
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<StructuredOutputConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private tryExtractJson(text: string): StructuredResult | null {
    // Try direct JSON parse
    try {
      const parsed = JSON.parse(text.trim());
      const validationErrors = this.validateSchema(parsed);
      return {
        success: validationErrors.length === 0,
        output: parsed,
        raw: text,
        format: 'json',
        repaired: false,
        validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
      };
    } catch {}

    // Try extracting JSON from markdown code blocks
    const jsonBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (jsonBlockMatch) {
      try {
        const parsed = JSON.parse(jsonBlockMatch[1].trim());
        return {
          success: true,
          output: parsed,
          raw: text,
          format: 'json',
          repaired: false,
        };
      } catch {}
    }

    // Try extracting JSON from text (find first { ... } or [ ... ])
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          success: true,
          output: parsed,
          raw: text,
          format: 'json',
          repaired: false,
        };
      } catch {
        // Try auto-repair
        if (this.config.autoRepairJson) {
          const repaired = this.repairJson(jsonMatch[1]);
          if (repaired) {
            return {
              success: true,
              output: repaired,
              raw: text,
              format: 'json',
              repaired: true,
            };
          }
        }
      }
    }

    return null;
  }

  private tryExtractCodeBlocks(text: string): StructuredResult | null {
    const codeBlockRegex = /```(\w+)?\s*\n?([\s\S]*?)\n?\s*```/g;
    const blocks: Array<{ lang?: string; code: string }> = [];
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      blocks.push({
        lang: match[1] || undefined,
        code: match[2].trim(),
      });
    }

    if (blocks.length === 0) return null;

    if (blocks.length === 1) {
      return {
        success: true,
        output: blocks[0].code,
        raw: text,
        format: 'code',
        repaired: false,
      };
    }

    return {
      success: true,
      output: blocks.map((b) => ({ language: b.lang, code: b.code })),
      raw: text,
      format: 'code',
      repaired: false,
    };
  }

  private forceJsonWrap(text: string): StructuredResult | null {
    // Wrap in a simple JSON structure
    const wrapped = { response: text.trim() };
    try {
      JSON.stringify(wrapped);
      return {
        success: true,
        output: wrapped,
        raw: text,
        format: 'json',
        repaired: true,
      };
    } catch {
      return null;
    }
  }

  private repairJson(text: string): any | null {
    let cleaned = text.trim();

    // Common repairs
    // Remove trailing commas
    cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
    // Fix single quotes to double quotes (basic)
    cleaned = cleaned.replace(/'/g, '"');
    // Fix unquoted keys
    cleaned = cleaned.replace(/(\s)(\w+)(\s*:)/g, '$1"$2"$3');
    // Remove comments
    cleaned = cleaned.replace(/\/\/.*$/gm, '');
    // Fix trailing backslashes
    cleaned = cleaned.replace(/\\+$/gm, '');

    for (let attempt = 0; attempt < this.config.maxRepairAttempts; attempt++) {
      try {
        return JSON.parse(cleaned);
      } catch {
        // Try progressively more aggressive repairs
        if (attempt === 1) {
          // Try removing all newlines
          cleaned = cleaned.replace(/\n/g, ' ');
        }
        if (attempt === 2) {
          // Try wrapping in object if it looks like a bare value
          if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
            cleaned = `{"value": ${cleaned}}`;
          }
        }
      }
    }

    return null;
  }

  private validateSchema(obj: any): string[] {
    if (!this.config.jsonSchema) return [];

    const errors: string[] = [];
    const schema = this.config.jsonSchema;

    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in obj)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties) as [string, any][]) {
        if (key in obj) {
          const value = obj[key];
          if (propSchema.type && typeof value !== propSchema.type) {
            errors.push(`Field '${key}' expected type '${propSchema.type}', got '${typeof value}'`);
          }
        }
      }
    }

    return errors;
  }
}

let globalProcessor: StructuredOutputProcessor | null = null;

export function getStructuredOutputProcessor(config?: Partial<StructuredOutputConfig>, logger?: any): StructuredOutputProcessor {
  if (!globalProcessor) {
    globalProcessor = new StructuredOutputProcessor(config, logger);
  } else if (config) {
    globalProcessor.updateConfig(config);
  }
  return globalProcessor;
}
