/**
 * Usage storage - handles persistent storage of usage records
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';
import { HOME_DIR } from '../constants';
import type {
  UsageRecord,
  UsageQuery,
  CleanupOptions,
  CleanupResult,
} from './types';

// Storage directory
export const USAGE_DIR = path.join(HOME_DIR, 'usage');

// Daily file pattern: usage-YYYY-MM-DD.jsonl
const DAILY_FILE_PATTERN = /^usage-(\d{4}-\d{2}-\d{2})\.jsonl$/;

/**
 * Ensure the usage directory exists
 */
function ensureUsageDir(): void {
  if (!fs.existsSync(USAGE_DIR)) {
    fs.mkdirSync(USAGE_DIR, { recursive: true });
  }
}

/**
 * Get the daily file path for a given date
 */
function getDailyFilePath(date: string): string {
  // date is YYYY-MM-DD
  return path.join(USAGE_DIR, `usage-${date}.jsonl`);
}

/**
 * Generate a unique ID for a usage record
 */
export function generateId(): string {
  return randomUUID();
}

/**
 * Append a usage record to storage
 */
export function append(record: Omit<UsageRecord, 'id'>): UsageRecord {
  ensureUsageDir();

  const fullRecord: UsageRecord = {
    id: generateId(),
    ...record,
  };

  const filePath = getDailyFilePath(record.date);
  const line = JSON.stringify(fullRecord) + '\n';

  // Ensure file exists before locking (proper-lockfile requires existing file)
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '', 'utf-8');
  }

  // Use file locking to prevent concurrent write corruption
  const release = lockfile.lockSync(filePath, { stale: 5000 });
  try {
    fs.appendFileSync(filePath, line, 'utf-8');
  } finally {
    release();
  }

  return fullRecord;
}

/**
 * Append a usage record asynchronously
 */
export async function appendAsync(record: Omit<UsageRecord, 'id'>): Promise<UsageRecord> {
  ensureUsageDir();

  const fullRecord: UsageRecord = {
    id: generateId(),
    ...record,
  };

  const filePath = getDailyFilePath(record.date);
  const line = JSON.stringify(fullRecord) + '\n';

  // Ensure file exists before locking (proper-lockfile requires existing file)
  try {
    await fs.promises.access(filePath);
  } catch {
    // File doesn't exist, create it
    await fs.promises.writeFile(filePath, '', 'utf-8');
  }

  // Use file locking to prevent concurrent write corruption
  const release = await lockfile.lock(filePath, { stale: 5000 });
  try {
    await fs.promises.appendFile(filePath, line, 'utf-8');
  } finally {
    await release();
  }

  return fullRecord;
}

/**
 * List all daily files
 */
export function listDailyFiles(): string[] {
  ensureUsageDir();

  const files = fs.readdirSync(USAGE_DIR);
  return files
    .filter(f => DAILY_FILE_PATTERN.test(f))
    .sort()
    .map(f => path.join(USAGE_DIR, f));
}

/**
 * Parse a daily file and yield records
 */
export function* readDailyFile(filePath: string): Generator<UsageRecord> {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line) as UsageRecord;
    } catch {
      // Skip malformed lines
    }
  }
}

/**
 * Parse a daily file asynchronously
 */
async function* readDailyFileAsync(filePath: string): AsyncGenerator<UsageRecord> {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = await fs.promises.readFile(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line) as UsageRecord;
    } catch {
      // Skip malformed lines
    }
  }
}

/**
 * Query usage records
 * Note: Only supports single-day queries (startDate must equal endDate)
 */
export function query(query: UsageQuery): UsageRecord[] {
  // Single-day query: only read one file
  const date = query.startDate;
  if (!date) {
    return [];
  }

  const filePath = getDailyFilePath(date);
  const records: UsageRecord[] = [];

  for (const record of readDailyFile(filePath)) {
    // Apply filters
    if (query.provider && record.provider !== query.provider) continue;
    if (query.model && record.model !== query.model) continue;

    records.push(record);
  }

  // Sort by timestamp descending (records within a day are already in order,
  // but sort to ensure correct order after filtering)
  records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Apply pagination
  const offset = query.offset || 0;
  const limit = query.limit || records.length;

  return records.slice(offset, offset + limit);
}

/**
 * Query usage records asynchronously
 * Note: Only supports single-day queries (startDate must equal endDate)
 */
export async function* queryAsync(query: UsageQuery): AsyncGenerator<UsageRecord> {
  // Single-day query: only read one file
  const date = query.startDate;
  if (!date) {
    return;
  }

  const filePath = getDailyFilePath(date);

  let count = 0;
  const offset = query.offset || 0;
  const limit = query.limit || Infinity;

  for await (const record of readDailyFileAsync(filePath)) {
    // Apply filters
    if (query.provider && record.provider !== query.provider) continue;
    if (query.model && record.model !== query.model) continue;

    count++;

    // Skip offset
    if (count <= offset) continue;

    // Stop at limit
    if (count > offset + limit) return;

    yield record;
  }
}

/**
 * Get count of records matching query
 * Note: Only supports single-day queries
 */
export function count(query: UsageQuery): number {
  const date = query.startDate;
  if (!date) {
    return 0;
  }

  const filePath = getDailyFilePath(date);
  let total = 0;

  for (const record of readDailyFile(filePath)) {
    // Apply filters
    if (query.provider && record.provider !== query.provider) continue;
    if (query.model && record.model !== query.model) continue;

    total++;
  }

  return total;
}

/**
 * Cleanup old records
 * Note: Works with daily files - deletes entire files older than retention period
 */
export function cleanup(options: CleanupOptions): CleanupResult {
  const result: CleanupResult = {
    deletedCount: 0,
    deletedFiles: [],
    freedBytes: 0,
  };

  const files = listDailyFiles();

  // Calculate cutoff date
  let cutoffDate: string;
  if (options.beforeDate) {
    cutoffDate = options.beforeDate;
  } else if (options.retentionDays) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - options.retentionDays);
    cutoffDate = cutoff.toISOString().split('T')[0];
  } else {
    return result;
  }

  for (const file of files) {
    const match = path.basename(file).match(DAILY_FILE_PATTERN);
    if (!match) continue;

    const date = match[1];

    // If the day is before cutoff, delete the file
    if (date < cutoffDate) {
      if (options.dryRun) {
        const stats = fs.statSync(file);
        result.deletedFiles.push(file);
        result.freedBytes += stats.size;
        // Count records
        for (const _ of readDailyFile(file)) {
          result.deletedCount++;
        }
      } else {
        const stats = fs.statSync(file);
        result.freedBytes += stats.size;

        // Count records before deleting
        for (const _ of readDailyFile(file)) {
          result.deletedCount++;
        }

        fs.unlinkSync(file);
        result.deletedFiles.push(file);
      }
    }
  }

  return result;
}

/**
 * Get unique providers in a date range
 * Note: Iterates through daily files in the date range
 */
export function getProviders(startDate?: string, endDate?: string): string[] {
  const providers = new Set<string>();

  // Get all daily files
  const files = listDailyFiles();

  for (const file of files) {
    // Extract date from filename
    const match = path.basename(file).match(/^usage-(\d{4}-\d{2}-\d{2})\.jsonl$/);
    if (!match) continue;

    const fileDate = match[1];

    // Filter by date range if provided
    if (startDate && fileDate < startDate) continue;
    if (endDate && fileDate > endDate) continue;

    for (const record of readDailyFile(file)) {
      providers.add(record.provider);
    }
  }

  return Array.from(providers).sort();
}

/**
 * Get unique models in a date range
 * Note: Iterates through daily files in the date range
 */
export function getModels(startDate?: string, endDate?: string): string[] {
  const models = new Set<string>();

  // Get all daily files
  const files = listDailyFiles();

  for (const file of files) {
    // Extract date from filename
    const match = path.basename(file).match(/^usage-(\d{4}-\d{2}-\d{2})\.jsonl$/);
    if (!match) continue;

    const fileDate = match[1];

    // Filter by date range if provided
    if (startDate && fileDate < startDate) continue;
    if (endDate && fileDate > endDate) continue;

    for (const record of readDailyFile(file)) {
      // Handle both string and array model formats
      if (Array.isArray(record.model)) {
        record.model.forEach(m => models.add(m));
      } else {
        models.add(record.model);
      }
    }
  }

  return Array.from(models).sort();
}