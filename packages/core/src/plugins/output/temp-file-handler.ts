import { OutputHandler, OutputOptions } from './types';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Temp file output handler configuration
 */
export interface TempFileOutputConfig {
  /**
   * Subdirectory under system temp directory (default: 'claude-code-router')
   */
  subdirectory?: string;

  /**
   * File extension (default: 'json')
   */
  extension?: string;

  /**
   * Whether to include timestamp in filename (default: true)
   */
  includeTimestamp?: boolean;

  /**
   * Custom prefix for temp files (default: 'session')
   */
  prefix?: string;
}

/**
 * Temp file output handler
 * Writes data to temporary files in system temp directory
 */
export class TempFileOutputHandler implements OutputHandler {
  type = 'temp-file' as const;
  private config: TempFileOutputConfig;
  private baseDir: string;

  constructor(config: TempFileOutputConfig = {}) {
    this.config = {
      subdirectory: 'claude-code-router',
      extension: 'json',
      includeTimestamp: false,
      prefix: 'session',
      ...config
    };

    // Use system temp directory
    const systemTempDir = tmpdir();
    this.baseDir = join(systemTempDir, this.config.subdirectory!);

    // Ensure directory exists
    this.ensureDir();
  }

  /**
   * Ensure directory exists
   */
  private ensureDir(): void {
    try {
      if (!existsSync(this.baseDir)) {
        mkdirSync(this.baseDir, { recursive: true });
      }
    } catch (error) {
      // Silently fail
    }
  }

  /**
   * Extract session ID from user_id string
   * Format: "user_..._session_<uuid>"
   */
  private extractSessionId(userId: string): string | null {
    try {
      const match = userId.match(/_session_([a-f0-9-]+)/i);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Get file path for temp file
   */
  private getFilePath(sessionId: string): string {
    const prefix = this.config.prefix || 'session';
    const ext = this.config.extension ? `.${this.config.extension}` : '';

    let filename: string;
    if (this.config.includeTimestamp) {
      // Include timestamp in filename: prefix-sessionId-timestamp.ext
      const timestamp = Date.now();
      filename = `${prefix}-${sessionId}-${timestamp}${ext}`;
    } else {
      // Simple filename: prefix-sessionId.ext
      filename = `${prefix}-${sessionId}${ext}`;
    }

    return join(this.baseDir, filename);
  }

  /**
   * Output data to temp file
   */
  async output(data: any, options: OutputOptions = {}): Promise<boolean> {
    try {
      // Extract session ID from metadata
      const sessionId = options.metadata?.sessionId;

      if (!sessionId) {
        // No session ID, skip output
        return false;
      }

      // Prepare output data
      const outputData = {
        ...data,
        timestamp: Date.now(),
        sessionId
      };

      // Write to file
      const filePath = this.getFilePath(sessionId);
      writeFileSync(filePath, JSON.stringify(outputData, null, 2), 'utf-8');

      return true;
    } catch (error) {
      // Silently fail to avoid disrupting main flow
      return false;
    }
  }

  /**
   * Get the base directory where temp files are stored
   */
  getBaseDir(): string {
    return this.baseDir;
  }
}
