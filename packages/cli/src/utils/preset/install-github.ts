/**
 * Install preset from GitHub marketplace by preset name
 */

import * as fs from 'fs/promises';
import {
  findMarketPresetByName,
  getPresetDir,
  readManifestFromDir,
  saveManifest,
  isPresetInstalled,
  downloadPresetToTemp,
  extractPreset,
  manifestToPresetFile,
  type PresetFile,
} from '@CCR/shared';
import AdmZip from 'adm-zip';

// ANSI color codes
const RESET = "\x1B[0m";
const GREEN = "\x1B[32m";
const BOLDCYAN = "\x1B[1m\x1B[36m";
const BOLDYELLOW = "\x1B[1m\x1B[33m";

/**
 * Parse GitHub repository URL or name
 * Supports:
 * - owner/repo (short format)
 * - github.com/owner/repo
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo.git
 * - git@github.com:owner/repo.git
 */
function parseGitHubRepo(input: string): { owner: string; repoName: string } | null {
  const match = input.match(/(?:github\.com[:/]|^)([^/]+)\/([^/\s#]+?)(?:\.git)?$/);
  if (!match) {
    return null;
  }

  const [, owner, repoName] = match;
  return { owner, repoName };
}

/**
 * Load preset from ZIP file
 */
async function loadPresetFromZip(zipFile: string): Promise<PresetFile> {
  const zip = new AdmZip(zipFile);

  // First try to find manifest.json in root directory
  let entry = zip.getEntry('manifest.json');

  // If not in root, try to find in subdirectories (handle GitHub repo archive structure)
  if (!entry) {
    const entries = zip.getEntries();
    // Find any manifest.json file
    entry = entries.find(e => e.entryName.includes('manifest.json')) || null;
  }

  if (!entry) {
    throw new Error('Invalid preset file: manifest.json not found');
  }

  const manifest = JSON.parse(entry.getData().toString('utf-8'));
  return manifestToPresetFile(manifest);
}

/**
 * Install preset from marketplace by preset name
 * @param presetName Preset name (must exist in marketplace)
 * @returns Object containing installed preset name and PresetFile
 */
export async function installPresetFromMarket(presetName: string): Promise<{ name: string; preset: PresetFile }> {
  // Check if preset is in the marketplace
  console.log(`${BOLDCYAN}Checking marketplace...${RESET}`);

  const marketPreset = await findMarketPresetByName(presetName);

  if (!marketPreset) {
    throw new Error(
      `Preset '${presetName}' not found in marketplace. ` +
      `Please check the available presets at: https://github.com/claude-code-router/presets`
    );
  }

  console.log(`${GREEN}✓${RESET} Found in marketplace\n`);

  // Get repository from market preset
  if (!marketPreset.repo) {
    throw new Error(`Preset '${presetName}' does not have repository information`);
  }

  // Parse GitHub repository URL
  const githubRepo = parseGitHubRepo(marketPreset.repo);
  if (!githubRepo) {
    throw new Error(`Invalid repository format: ${marketPreset.repo}`);
  }

  const { owner, repoName } = githubRepo;

  // Use preset name from market (or the preset's id)
  const installedPresetName = marketPreset.name || presetName;

  // Check if already installed BEFORE downloading
  if (await isPresetInstalled(installedPresetName)) {
    throw new Error(
      `Preset '${installedPresetName}' is already installed.\n` +
      `To delete and reinstall, use: ccr preset delete ${installedPresetName}\n` +
      `To reconfigure without deleting, use: ccr preset install ${installedPresetName}`
    );
  }

  // Download GitHub repository ZIP file
  console.log(`${BOLDCYAN}Downloading preset...${RESET}`);

  const downloadUrl = `https://github.com/${owner}/${repoName}/archive/refs/heads/main.zip`;
  const tempFile = await downloadPresetToTemp(downloadUrl);

  console.log(`${GREEN}✓${RESET} Downloaded\n`);

  try {
    // Load preset to validate structure
    console.log(`${BOLDCYAN}Validating preset...${RESET}`);
    const preset = await loadPresetFromZip(tempFile);
    console.log(`${GREEN}✓${RESET} Valid\n`);

    // Double-check if already installed (in case of race condition)
    if (await isPresetInstalled(installedPresetName)) {
      throw new Error(
        `Preset '${installedPresetName}' was installed while downloading. ` +
        `Please try again.`
      );
    }

    // Extract to target directory
    console.log(`${BOLDCYAN}Installing preset...${RESET}`);
    const targetDir = getPresetDir(installedPresetName);
    await extractPreset(tempFile, targetDir);
    console.log(`${GREEN}✓${RESET} Installed\n`);

    // Read manifest and add repo information
    const manifest = await readManifestFromDir(targetDir);

    // Add repo information to manifest
    manifest.repository = marketPreset.repository;
    if (marketPreset.url) {
      manifest.source = marketPreset.url;
    }

    // Save updated manifest
    await saveManifest(installedPresetName, manifest);

    // Return preset name and PresetFile for further configuration
    return { name: installedPresetName, preset };
  } finally {
    // Clean up temp file
    try {
      await fs.unlink(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}
