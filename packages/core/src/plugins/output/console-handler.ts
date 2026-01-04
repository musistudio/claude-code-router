import { OutputHandler, OutputOptions, ConsoleOutputConfig } from './types';

/**
 * Console output handler
 * Supports colored output and multiple log levels
 */
export class ConsoleOutputHandler implements OutputHandler {
  type = 'console' as const;
  private config: ConsoleOutputConfig;

  // ANSI color codes
  private colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
  };

  constructor(config: ConsoleOutputConfig = {}) {
    this.config = {
      colors: true,
      level: 'log',
      ...config
    };
  }

  /**
   * Format output data
   */
  private formatData(data: any, options: OutputOptions): string {
    const { format = 'text', timestamp = true, prefix, metadata } = options || {};

    // Build prefix
    let output = '';

    if (timestamp) {
      const time = new Date().toISOString();
      output += this.config.colors
        ? `${this.colors.cyan}[${time}]${this.colors.reset} `
        : `[${time}] `;
    }

    if (prefix) {
      output += this.config.colors
        ? `${this.colors.bright}${prefix}${this.colors.reset} `
        : `${prefix} `;
    }

    // Format data
    switch (format) {
      case 'json':
        output += JSON.stringify(data, null, 2);
        break;

      case 'markdown':
        if (typeof data === 'object') {
          output += this.toMarkdown(data);
        } else {
          output += String(data);
        }
        break;

      case 'text':
      default:
        if (typeof data === 'object') {
          output += JSON.stringify(data, null, 2);
        } else {
          output += String(data);
        }
        break;
    }

    // Add metadata
    if (metadata && Object.keys(metadata).length > 0) {
      output += '\n' + (this.config.colors ? `${this.colors.dim}` : '');
      output += 'Metadata: ' + JSON.stringify(metadata, null, 2);
      if (this.config.colors) output += this.colors.reset;
    }

    return output;
  }

  /**
   * Convert object to Markdown format
   */
  private toMarkdown(data: any, indent = 0): string {
    const padding = '  '.repeat(indent);

    if (Array.isArray(data)) {
      return data.map(item => {
        if (typeof item === 'object') {
          return `${padding}-\n${this.toMarkdown(item, indent + 1)}`;
        }
        return `${padding}- ${item}`;
      }).join('\n');
    }

    if (typeof data === 'object' && data !== null) {
      return Object.entries(data).map(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          return `${padding}${key}:\n${this.toMarkdown(value, indent + 1)}`;
        }
        return `${padding}${key}: ${value}`;
      }).join('\n');
    }

    return `${padding}${data}`;
  }

  /**
   * Output data
   */
  async output(data: any, options: OutputOptions = {}): Promise<boolean> {
    try {
      const formatted = this.formatData(data, options);
      const logMethod = this.config.level || 'log';

      // Output based on configured log level
      switch (logMethod) {
        case 'info':
          console.info(formatted);
          break;
        case 'warn':
          console.warn(formatted);
          break;
        case 'error':
          console.error(formatted);
          break;
        case 'debug':
          console.debug(formatted);
          break;
        case 'log':
        default:
          console.log(formatted);
          break;
      }

      return true;
    } catch (error) {
      console.error('[ConsoleOutputHandler] Output failed:', error);
      return false;
    }
  }
}
