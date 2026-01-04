/**
 * Read preset configuration file
 * Used by CLI to quickly read preset configuration
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import JSON5 from 'json5';
import { getPresetDir } from './install';

/**
 * Read preset configuration file
 * @param name Preset name
 * @returns Preset configuration object, or null if file does not exist
 */
export async function readPresetFile(name: string): Promise<any | null> {
  try {
    const presetDir = getPresetDir(name);
    const manifestPath = path.join(presetDir, 'manifest.json');
    const manifest = JSON5.parse(await fs.readFile(manifestPath, 'utf-8'));
    // manifest is already a flat structure, return directly
    return manifest;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    console.error(`Failed to read preset file: ${error.message}`);
    return null;
  }
}
