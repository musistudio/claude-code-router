import path from 'path';
import fs from 'fs';
import { logger } from './logger';

/**
 * Safely resolves a path, preventing directory traversal attacks
 * @param inputPath The path to resolve (may contain $HOME)
 * @param basePath The base directory to resolve relative paths against
 * @returns The resolved absolute path
 * @throws Error if the path is invalid or attempts directory traversal
 */
export function resolveSecurePath(inputPath: string, basePath?: string): string {
  if (!inputPath) {
    throw new Error('Path cannot be empty');
  }

  // Replace $HOME with actual home directory
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (!homeDir && inputPath.includes('$HOME')) {
    throw new Error('HOME environment variable is not set');
  }
  let resolvedPath = inputPath.replace(/\$HOME/g, homeDir);
  
  // If the path is not absolute, resolve it against the base path
  if (!path.isAbsolute(resolvedPath)) {
    if (!basePath) {
      throw new Error('Base path required for relative paths');
    }
    resolvedPath = path.resolve(basePath, resolvedPath);
  } else {
    resolvedPath = path.resolve(resolvedPath);
  }

  // Normalize the path to remove any .. or . segments
  const normalizedPath = path.normalize(resolvedPath);

  // Check if the normalized path is still within acceptable bounds
  if (basePath) {
    const normalizedBase = path.normalize(path.resolve(basePath));
    if (!normalizedPath.startsWith(normalizedBase)) {
      throw new Error(`Path traversal attempt detected: ${inputPath}`);
    }
  }

  // Additional security checks
  if (normalizedPath.includes('\0')) {
    throw new Error('Null bytes are not allowed in paths');
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /\.\.[\\/]/,  // Parent directory traversal
    /^\/etc\//,   // System config files
    /^\/proc\//,  // Process information
    /^\/sys\//,   // System files
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(normalizedPath)) {
      logger.warn('Suspicious path pattern detected', { path: normalizedPath, pattern: pattern.toString() });
    }
  }

  return normalizedPath;
}

/**
 * Validates that a file exists and is readable
 * @param filePath The path to validate
 * @returns true if the file exists and is readable
 */
export function validateFilePath(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    const stats = fs.statSync(filePath);
    return stats.isFile();
  } catch (error) {
    return false;
  }
}

/**
 * Validates that a directory exists and is accessible
 * @param dirPath The path to validate
 * @returns true if the directory exists and is accessible
 */
export function validateDirectoryPath(dirPath: string): boolean {
  try {
    fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.X_OK);
    const stats = fs.statSync(dirPath);
    return stats.isDirectory();
  } catch (error) {
    return false;
  }
}

/**
 * Creates a directory with proper error handling
 * @param dirPath The directory path to create
 * @param options Options for directory creation
 */
export async function createSecureDirectory(
  dirPath: string,
  options: { recursive?: boolean; mode?: number } = {}
): Promise<void> {
  const { recursive = true, mode = 0o755 } = options;
  
  try {
    const resolvedPath = resolveSecurePath(dirPath);
    await fs.promises.mkdir(resolvedPath, { recursive, mode });
    logger.debug('Directory created', { path: resolvedPath });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      logger.error('Failed to create directory', { path: dirPath, error: error.message });
      throw new Error(`Failed to create directory: ${error.message}`);
    }
  }
}