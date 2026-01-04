/**
 * Preset marketplace management
 * Fetches preset market data directly from remote without caching
 */

import { PresetIndexEntry } from './types';

// Preset market URL
const MARKET_URL = 'https://pub-0dc3e1677e894f07bbea11b17a29e032.r2.dev/presets.json';

/**
 * Fetch preset market data from remote URL
 */
async function fetchMarketData(): Promise<PresetIndexEntry[]> {
  const response = await fetch(MARKET_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch preset market: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as PresetIndexEntry[];
  return data;
}

/**
 * Get preset market data (always fetches from remote)
 * @returns Array of preset market entries
 */
export async function getMarketPresets(): Promise<PresetIndexEntry[]> {
  return await fetchMarketData();
}

/**
 * Find a preset in the market by preset name (id or name field)
 * @param presetName Preset name to search for
 * @returns Preset entry if found, null otherwise
 */
export async function findMarketPresetByName(presetName: string): Promise<PresetIndexEntry | null> {
  const marketPresets = await getMarketPresets();

  // First try exact match by id
  let preset = marketPresets.find(p => p.id === presetName);

  // If not found, try exact match by name
  if (!preset) {
    preset = marketPresets.find(p => p.name === presetName);
  }

  // If still not found, try case-insensitive match by name
  if (!preset) {
    const lowerName = presetName.toLowerCase();
    preset = marketPresets.find(p => p.name.toLowerCase() === lowerName);
  }

  return preset || null;
}
