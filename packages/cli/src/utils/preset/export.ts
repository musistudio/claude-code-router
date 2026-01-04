/**
 * Preset export functionality CLI layer
 * Handles CLI interactions, core logic is in shared package
 */

import { input } from '@inquirer/prompts';
import { readConfigFile } from '../index';
import { exportPreset as exportPresetCore, ExportOptions } from '@CCR/shared';

// ANSI color codes
const RESET = "\x1B[0m";
const GREEN = "\x1B[32m";
const BOLDGREEN = "\x1B[1m\x1B[32m";
const YELLOW = "\x1B[33m";
const BOLDCYAN = "\x1B[1m\x1B[36m";

/**
 * Export preset configuration (CLI version, with interaction)
 * @param presetName Preset name
 * @param options Export options
 */
export async function exportPresetCli(
  presetName: string,
  options: ExportOptions = {}
): Promise<void> {
  try {
    console.log(`\n${BOLDCYAN}═══════════════════════════════════════════════${RESET}`);
    console.log(`${BOLDCYAN}              Preset Export${RESET}`);
    console.log(`${BOLDCYAN}═══════════════════════════════════════════════${RESET}\n`);

    // 1. Read current configuration
    const config = await readConfigFile();

    // 2. Interactively ask for metadata if not provided via command line
    if (!options.description) {
      try {
        options.description = await input({
          message: 'Description (optional):',
          default: '',
        });
      } catch {
        // User cancelled, use default value
        options.description = '';
      }
    }

    if (!options.author) {
      try {
        options.author = await input({
          message: 'Author (optional):',
          default: '',
        });
      } catch {
        options.author = '';
      }
    }

    if (!options.tags) {
      try {
        const keywordsInput = await input({
          message: 'Keywords (comma-separated, optional):',
          default: '',
        });
        options.tags = keywordsInput || '';
      } catch {
        options.tags = '';
      }
    }

    // 3. Call core export functionality
    const result = await exportPresetCore(presetName, config, options);

    // 4. Display summary
    console.log(`\n${BOLDGREEN}✓ Preset exported successfully${RESET}\n`);
    console.log(`${BOLDCYAN}Location:${RESET} ${result.presetDir}\n`);
    console.log(`${BOLDCYAN}Summary:${RESET}`);
    console.log(`  - Providers: ${result.sanitizedConfig.Providers?.length || 0}`);
    console.log(`  - Router rules: ${Object.keys(result.sanitizedConfig.Router || {}).length}`);
    if (!options.includeSensitive) {
      console.log(`  - Sensitive fields sanitized: ${YELLOW}${result.sanitizedCount}${RESET}`);
    }

    // Display metadata
    if (result.metadata.description) {
      console.log(`\n${BOLDCYAN}Description:${RESET} ${result.metadata.description}`);
    }
    if (result.metadata.author) {
      console.log(`${BOLDCYAN}Author:${RESET} ${result.metadata.author}`);
    }
    if (result.metadata.keywords && result.metadata.keywords.length > 0) {
      console.log(`${BOLDCYAN}Keywords:${RESET} ${result.metadata.keywords.join(', ')}`);
    }

    // Display sharing tips
    console.log(`\n${BOLDCYAN}To share this preset:${RESET}`);
    console.log(`  1. Share the directory: ${result.presetDir}`);
    console.log(`  2. Upload to GitHub Gist or your repository`);
    console.log(`  3. Others can install with: ${GREEN}ccr preset install <directory>${RESET}\n`);

  } catch (error: any) {
    console.error(`\n${YELLOW}Error exporting preset:${RESET} ${error.message}`);
    throw error;
  }
}
