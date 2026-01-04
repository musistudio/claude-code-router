/**
 * Core preset installation functionality
 * Note: This module does not contain CLI interaction logic, interaction logic is provided by the caller
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import JSON5 from 'json5';
import AdmZip from 'adm-zip';
import { PresetFile, ManifestFile, PresetInfo, PresetMetadata } from './types';
import { HOME_DIR, PRESETS_DIR } from '../constants';
import { loadConfigFromManifest } from './schema';

/**
 * Validate if preset name is safe (prevent path traversal attacks)
 * @param presetName Preset name
 */
function validatePresetName(presetName: string): void {
  if (!presetName || presetName.trim() === '') {
    throw new Error('Preset name cannot be empty');
  }

  // Reject names containing path traversal sequences
  if (presetName.includes('..') || presetName.includes('/') || presetName.includes('\\')) {
    throw new Error('Invalid preset name: path traversal detected');
  }

  // Reject absolute paths
  if (path.isAbsolute(presetName)) {
    throw new Error('Invalid preset name: absolute path not allowed');
  }
}

/**
 * Get the full path of the preset directory
 * @param presetName Preset name
 */
export function getPresetDir(presetName: string): string {
  validatePresetName(presetName);
  return path.join(HOME_DIR, 'presets', presetName);
}

/**
 * Get temporary directory path
 */
export function getTempDir(): string {
  return path.join(HOME_DIR, 'temp');
}

/**
 * Validate and normalize file path, ensuring it's within the target directory
 * @param targetDir Target directory
 * @param entryPath ZIP entry path
 * @returns Safe absolute path
 */
function validateAndResolvePath(targetDir: string, entryPath: string): string {
  const resolvedTargetDir = path.resolve(targetDir);
  const resolvedPath = path.resolve(targetDir, entryPath);

  // Verify that the resolved path is within the target directory
  if (!resolvedPath.startsWith(resolvedTargetDir)) {
    throw new Error(`Path traversal detected: ${entryPath}`);
  }

  return resolvedPath;
}

/**
 * Extract preset file to target directory
 * @param sourceZip Source ZIP file path
 * @param targetDir Target directory
 */
export async function extractPreset(sourceZip: string, targetDir: string): Promise<void> {
  // Check if target directory already exists
  try {
    await fs.access(targetDir);
    throw new Error(`Preset directory already exists: ${path.basename(targetDir)}`);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    // ENOENT means directory does not exist, can continue
  }

  // Create target directory
  await fs.mkdir(targetDir, { recursive: true });

  // Extract files
  const zip = new AdmZip(sourceZip);
  const entries = zip.getEntries();

  // Detect if there's a single root directory (GitHub ZIP files usually have this characteristic)
  if (entries.length > 0) {
    // Get all top-level directories
    const rootDirs = new Set<string>();
    for (const entry of entries) {
      const parts = entry.entryName.split('/');
      if (parts.length > 1) {
        rootDirs.add(parts[0]);
      }
    }

    // If there's only one root directory, remove it
    if (rootDirs.size === 1) {
      const singleRoot = Array.from(rootDirs)[0];

      // Check if manifest.json is in root directory
      const hasManifestInRoot = entries.some(e =>
        e.entryName === 'manifest.json' || e.entryName.startsWith(`${singleRoot}/manifest.json`)
      );

      if (hasManifestInRoot) {
        // Extract all files from the root directory
        for (const entry of entries) {
          if (entry.isDirectory) {
            continue;
          }

          // Remove root directory prefix
          let newPath = entry.entryName;
          if (newPath.startsWith(`${singleRoot}/`)) {
            newPath = newPath.substring(singleRoot.length + 1);
          }

          // Skip root directory itself
          if (newPath === '' || newPath === singleRoot) {
            continue;
          }

          // Validate path safety and extract file
          const targetPath = validateAndResolvePath(targetDir, newPath);
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.writeFile(targetPath, entry.getData());
        }

        return;
      }
    }
  }

  // If there's no single root directory, validate and extract files one by one
  for (const entry of entries) {
    if (entry.isDirectory) {
      continue;
    }

    // Validate path safety
    const targetPath = validateAndResolvePath(targetDir, entry.entryName);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, entry.getData());
  }
}

/**
 * Read manifest from extracted directory
 * @param presetDir Preset directory path
 */
export async function readManifestFromDir(presetDir: string): Promise<ManifestFile> {
  const manifestPath = path.join(presetDir, 'manifest.json');
  const content = await fs.readFile(manifestPath, 'utf-8');
  return JSON5.parse(content) as ManifestFile;
}

/**
 * List of known metadata fields
 */
const METADATA_FIELDS = [
  'name',
  'version',
  'description',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
  'ccrVersion',
  'source',
  'sourceType',
  'checksum',
];

/**
 * Dynamic configuration system field list
 */
const DYNAMIC_CONFIG_FIELDS = [
  'schema',
  'template',
  'configMappings',
];

/**
 * Convert manifest to PresetFile format
 * Correctly separate metadata, config, and dynamic configuration system fields
 */
export function manifestToPresetFile(manifest: ManifestFile): PresetFile {
  const metadata: any = {};
  const config: any = {};
  const dynamicConfig: any = {};

  // Categorize all fields
  for (const [key, value] of Object.entries(manifest)) {
    if (METADATA_FIELDS.includes(key)) {
      // metadata fields
      metadata[key] = value;
    } else if (DYNAMIC_CONFIG_FIELDS.includes(key)) {
      // dynamic configuration system fields
      dynamicConfig[key] = value;
    } else {
      // configuration fields
      config[key] = value;
    }
  }

  return {
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    config,
    schema: dynamicConfig.schema,
    template: dynamicConfig.template,
    configMappings: dynamicConfig.configMappings,
  };
}

/**
 * Download preset file to temporary location
 * @param url Download URL
 * @returns Temporary file path
 */
export async function downloadPresetToTemp(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download preset: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();

  // Create temporary file
  const tempDir = getTempDir();
  await fs.mkdir(tempDir, { recursive: true });

  const tempFile = path.join(tempDir, `preset-${Date.now()}.zip`);
  await fs.writeFile(tempFile, Buffer.from(buffer));

  return tempFile;
}

/**
 * Load preset file
 * @param source Preset source (preset name or directory path)
 */
export async function loadPreset(source: string): Promise<PresetFile> {
  // Check if it's absolute or relative path (contains / or \)
  if (source.includes('/') || source.includes('\\')) {
    // Directory path - read manifest from directory
    const manifestPath = path.join(source, 'manifest.json');
    const content = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON5.parse(content) as ManifestFile;
    return manifestToPresetFile(manifest);
  }

  // Otherwise treat as preset name (read from presets directory)
  const presetDir = getPresetDir(source);
  const manifest = await readManifestFromDir(presetDir);
  return manifestToPresetFile(manifest);
}

/**
 * Validate preset file
 */
export async function validatePreset(preset: PresetFile): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate metadata
  if (!preset.metadata) {
    warnings.push('Missing metadata section');
  } else {
    if (!preset.metadata.name) {
      errors.push('Missing preset name in metadata');
    }
    if (!preset.metadata.version) {
      warnings.push('Missing version in metadata');
    }
  }

  // Validate configuration section
  if (!preset.config) {
    errors.push('Missing config section');
  }

  // Validate Providers
  if (preset.config.Providers) {
    for (const provider of preset.config.Providers) {
      if (!provider.name) {
        errors.push('Provider missing name field');
      }
      if (!provider.api_base_url) {
        errors.push(`Provider "${provider.name}" missing api_base_url`);
      }
      if (!provider.models || provider.models.length === 0) {
        warnings.push(`Provider "${provider.name}" has no models`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Extract metadata fields from manifest
 * @param manifest Manifest object
 * @returns Metadata object
 */
export function extractMetadata(manifest: ManifestFile): PresetMetadata {
  const metadata: PresetMetadata = {
    name: manifest.name,
    version: manifest.version,
  };

  // Optional fields
  if (manifest.description !== undefined) metadata.description = manifest.description;
  if (manifest.author !== undefined) metadata.author = manifest.author;
  if (manifest.homepage !== undefined) metadata.homepage = manifest.homepage;
  if (manifest.repository !== undefined) metadata.repository = manifest.repository;
  if (manifest.license !== undefined) metadata.license = manifest.license;
  if (manifest.keywords !== undefined) metadata.keywords = manifest.keywords;
  if (manifest.ccrVersion !== undefined) metadata.ccrVersion = manifest.ccrVersion;
  if (manifest.source !== undefined) metadata.source = manifest.source;
  if (manifest.sourceType !== undefined) metadata.sourceType = manifest.sourceType;
  if (manifest.checksum !== undefined) metadata.checksum = manifest.checksum;

  return metadata;
}

/**
 * Save manifest to preset directory
 * @param presetName Preset name
 * @param manifest Manifest object
 */
export async function saveManifest(presetName: string, manifest: ManifestFile): Promise<void> {
  const presetDir = getPresetDir(presetName);
  const manifestPath = path.join(presetDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * Check if preset is already installed
 * @param presetName Preset name
 */
export async function isPresetInstalled(presetName: string): Promise<boolean> {
  const presetDir = getPresetDir(presetName);
  try {
    await fs.access(presetDir);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all installed presets
 * @returns Array of PresetInfo
 */
export async function listPresets(): Promise<PresetInfo[]> {
  const presetsDir = PRESETS_DIR;
  const presets: PresetInfo[] = [];

  try {
    await fs.access(presetsDir);
  } catch {
    return presets;
  }

  // Read all subdirectories in the directory
  const entries = await fs.readdir(presetsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const presetName = entry.name;
      const presetDir = path.join(presetsDir, presetName);
      const manifestPath = path.join(presetDir, 'manifest.json');

      try {
        // Check if manifest.json exists
        await fs.access(manifestPath);

        // Read manifest.json
        const content = await fs.readFile(manifestPath, 'utf-8');
        const manifest = JSON5.parse(content) as ManifestFile;

        // Get directory creation time
        const stats = await fs.stat(presetDir);

        presets.push({
          name: manifest.name || presetName,
          version: manifest.version,
          description: manifest.description,
          author: manifest.author,
          config: loadConfigFromManifest(manifest, presetDir),
        });
      } catch {
        // Ignore invalid preset directories (no manifest.json or read failed)
        // Can choose to skip or add to list marked as error
        continue;
      }
    }
  }

  return presets;
}
