/**
 * Preset export core functionality
 * Note: This module does not contain CLI interaction logic, interaction logic is provided by the caller
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { sanitizeConfig } from './sensitiveFields';
import { PresetMetadata, ManifestFile } from './types';
import { HOME_DIR } from '../constants';

/**
 * Export options
 */
export interface ExportOptions {
  includeSensitive?: boolean;
  description?: string;
  author?: string;
  tags?: string;
}

/**
 * Export result
 */
export interface ExportResult {
  presetDir: string;
  sanitizedConfig: any;
  metadata: PresetMetadata;
  sanitizedCount: number;
}

/**
 * Create manifest object
 * @param presetName Preset name
 * @param config Configuration object
 * @param sanitizedConfig Sanitized configuration
 * @param options Export options
 */
export function createManifest(
  presetName: string,
  config: any,
  sanitizedConfig: any,
  options: ExportOptions
): ManifestFile {
  const metadata: PresetMetadata = {
    name: presetName,
    version: '1.0.0',
    description: options.description,
    author: options.author,
    keywords: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
  };

  return {
    ...metadata,
    ...sanitizedConfig,
  };
}

/**
 * Export preset configuration
 * @param presetName Preset name
 * @param config Current configuration
 * @param options Export options
 * @returns Export result
 */
export async function exportPreset(
  presetName: string,
  config: any,
  options: ExportOptions = {}
): Promise<ExportResult> {
  // 1. Collect metadata
  const metadata: PresetMetadata = {
    name: presetName,
    version: '1.0.0',
    description: options.description,
    author: options.author,
    keywords: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
  };

  // 2. Sanitize configuration
  const { sanitizedConfig, sanitizedCount } = await sanitizeConfig(config);

  // 3. Generate manifest.json (flattened structure)
  const manifest: ManifestFile = {
    ...metadata,
    ...sanitizedConfig,
  };

  // 4. Create preset directory
  const presetDir = path.join(HOME_DIR, 'presets', presetName);

  // Check if preset directory already exists
  try {
    await fs.access(presetDir);
    throw new Error(`Preset directory already exists: ${presetName}`);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  // Create preset directory
  await fs.mkdir(presetDir, { recursive: true });

  // 5. Write manifest.json to preset directory
  const manifestPath = path.join(presetDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  return {
    presetDir,
    sanitizedConfig,
    metadata,
    sanitizedCount,
  };
}
