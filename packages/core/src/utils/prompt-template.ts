/**
 * Prompt Template - 动态模板注入
 *
 * Injects dynamic context into system prompts:
 * - Date/time, timezone
 * - User identity, session info
 * - Project metadata
 * - Compliance disclaimers
 * - Custom variables
 *
 * Design: Zero external dependencies. Simple {{variable}} template syntax.
 */

export interface PromptTemplateConfig {
  enabled: boolean;
  /** Template for system prompt injection */
  template?: string;
  /** Variables to inject */
  variables: Record<string, string | (() => string)>;
  /** Compliance disclaimer to append */
  disclaimer?: string;
  /** Inject date/time */
  injectDateTime: boolean;
  /** Inject session info */
  injectSessionInfo: boolean;
  /** Inject project metadata */
  injectProjectMeta: boolean;
  /** Custom prefix for system prompt */
  systemPrefix?: string;
  /** Custom suffix for system prompt */
  systemSuffix?: string;
}

const DEFAULT_CONFIG: PromptTemplateConfig = {
  enabled: true,
  injectDateTime: true,
  injectSessionInfo: false,
  injectProjectMeta: false,
  variables: {},
};

export interface TemplateContext {
  sessionId?: string;
  userId?: string;
  agentName?: string;
  model?: string;
  provider?: string;
  projectName?: string;
  [key: string]: any;
}

export class PromptTemplateEngine {
  private config: PromptTemplateConfig;
  private logger?: any;

  constructor(config: Partial<PromptTemplateConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Process a system prompt with template injection.
   */
  processSystemPrompt(system: string | any[], context: TemplateContext = {}): string | any[] {
    if (!this.config.enabled) return system;

    if (typeof system === 'string') {
      return this.processString(system, context);
    }

    if (Array.isArray(system)) {
      return system.map((item) => {
        if (item.type === 'text' && typeof item.text === 'string') {
          return { ...item, text: this.processString(item.text, context) };
        }
        return item;
      });
    }

    return system;
  }

  /**
   * Process a request body with template injection.
   */
  processRequestBody(body: any, context: TemplateContext = {}): any {
    if (!this.config.enabled) return body;

    const modified = { ...body };

    // Process system prompt
    if (modified.system) {
      modified.system = this.processSystemPrompt(modified.system, context);
    }

    // Inject disclaimer into last user message if configured
    if (this.config.disclaimer && modified.messages?.length > 0) {
      const lastMsg = modified.messages[modified.messages.length - 1];
      if (lastMsg.role === 'user') {
        if (typeof lastMsg.content === 'string') {
          lastMsg.content = lastMsg.content + '\n\n' + this.config.disclaimer;
        }
      }
    }

    return modified;
  }

  /**
   * Build a context block from template context.
   */
  buildContextBlock(context: TemplateContext): string {
    const parts: string[] = [];

    if (this.config.injectDateTime) {
      const now = new Date();
      parts.push(`Current time: ${now.toISOString()}`);
      parts.push(`Date: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
    }

    if (this.config.injectSessionInfo && context.sessionId) {
      parts.push(`Session: ${context.sessionId}`);
    }

    if (context.userId) {
      parts.push(`User: ${context.userId}`);
    }

    if (context.agentName) {
      parts.push(`Agent: ${context.agentName}`);
    }

    if (this.config.injectProjectMeta && context.projectName) {
      parts.push(`Project: ${context.projectName}`);
    }

    return parts.length > 0 ? `<context>\n${parts.join('\n')}\n</context>` : '';
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<PromptTemplateConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private processString(text: string, context: TemplateContext): string {
    let result = text;

    // Replace {{variable}} patterns
    result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      // Check context first
      if (context[key] !== undefined) {
        return String(context[key]);
      }

      // Check config variables
      const varValue = this.config.variables[key];
      if (varValue !== undefined) {
        if (typeof varValue === 'function') {
          return varValue();
        }
        return varValue;
      }

      // Built-in variables
      switch (key) {
        case 'date':
          return new Date().toLocaleDateString('en-US');
        case 'time':
          return new Date().toLocaleTimeString('en-US');
        case 'datetime':
          return new Date().toISOString();
        case 'timestamp':
          return String(Date.now());
        case 'year':
          return String(new Date().getFullYear());
        default:
          return match; // Keep original if not resolved
      }
    });

    // Add prefix/suffix
    if (this.config.systemPrefix) {
      result = this.config.systemPrefix + '\n' + result;
    }
    if (this.config.systemSuffix) {
      result = result + '\n' + this.config.systemSuffix;
    }

    // Add context block
    const contextBlock = this.buildContextBlock(context);
    if (contextBlock) {
      result = contextBlock + '\n\n' + result;
    }

    return result;
  }
}

let globalEngine: PromptTemplateEngine | null = null;

export function getPromptTemplateEngine(config?: Partial<PromptTemplateConfig>, logger?: any): PromptTemplateEngine {
  if (!globalEngine) {
    globalEngine = new PromptTemplateEngine(config, logger);
  } else if (config) {
    globalEngine.updateConfig(config);
  }
  return globalEngine;
}
