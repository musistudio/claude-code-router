/**
 * Usage command handler CLI layer
 * Displays token usage statistics
 */

import {
  aggregate,
  getTodaySummary,
  getDateSummary,
  getAvailableDateRange,
  cleanup,
  formatTokens,
  formatNumber,
  type UsageQuery,
  type CleanupOptions,
} from '@CCR/shared';

// ANSI color codes
const RESET = "\x1B[0m";
const GREEN = "\x1B[32m";
const YELLOW = "\x1B[33m";
const CYAN = "\x1B[36m";
const BOLD = "\x1B[1m";
const DIM = "\x1B[2m";
const BOLDCYAN = "\x1B[1m\x1B[36m";
const BOLDYELLOW = "\x1B[1m\x1B[33m";

/**
 * Display usage summary for a date or date range
 */
async function showUsage(options: {
  date?: string;
  startDate?: string;
  endDate?: string;
  provider?: string;
  model?: string;
}): Promise<void> {
  let query: UsageQuery;
  let titleDate: string;

  if (options.startDate && options.endDate) {
    query = {
      startDate: options.startDate,
      endDate: options.endDate,
      provider: options.provider,
      model: options.model,
    };
    titleDate = `${options.startDate} to ${options.endDate}`;
  } else if (options.date) {
    query = {
      startDate: options.date,
      endDate: options.date,
      provider: options.provider,
      model: options.model,
    };
    titleDate = options.date;
  } else {
    // Default to today
    const today = new Date().toISOString().split('T')[0];
    query = {
      startDate: today,
      endDate: today,
      provider: options.provider,
      model: options.model,
    };
    titleDate = today;
  }

  const summary = aggregate(query);

  // Check if there's any data
  if (summary.totalRequests === 0) {
    console.log(`\n${YELLOW}No usage data found for ${titleDate}.${RESET}\n`);
    return;
  }

  // Display header
  console.log(`\n${BOLDCYAN}═══════════════════════════════════════════════${RESET}`);
  console.log(`${BOLDCYAN}Usage for ${titleDate}:${RESET}`);
  console.log(`${BOLDCYAN}═══════════════════════════════════════════════${RESET}\n`);

  // Display totals
  console.log(`${BOLD}Summary:${RESET}`);
  console.log(`  Total Requests:  ${formatNumber(summary.totalRequests)}`);
  console.log(`  Success:         ${GREEN}${formatNumber(summary.successRequests)}${RESET}`);
  if (summary.failedRequests > 0) {
    console.log(`  Failed:          ${YELLOW}${formatNumber(summary.failedRequests)}${RESET}`);
  }
  console.log('');
  console.log(`  Input Tokens:    ${formatNumber(summary.totalInputTokens)} (${formatTokens(summary.totalInputTokens)})`);
  console.log(`  Output Tokens:   ${formatNumber(summary.totalOutputTokens)} (${formatTokens(summary.totalOutputTokens)})`);

  const totalTokens = summary.totalInputTokens + summary.totalOutputTokens;
  console.log(`  ${BOLD}Total Tokens:${RESET}     ${BOLD}${formatNumber(totalTokens)}${RESET} (${formatTokens(totalTokens)})`);

  // Display cache and reasoning tokens if available
  if (summary.totalCacheCreationTokens > 0) {
    console.log(`  Cache Creation:  ${formatNumber(summary.totalCacheCreationTokens)}`);
  }
  if (summary.totalCacheReadTokens > 0) {
    console.log(`  Cache Read:      ${formatNumber(summary.totalCacheReadTokens)}`);
  }
  if (summary.totalReasoningTokens > 0) {
    console.log(`  Reasoning:       ${formatNumber(summary.totalReasoningTokens)}`);
  }

  // Display by provider
  if (summary.byProvider && summary.byProvider.length > 0) {
    console.log(`\n${BOLD}By Provider:${RESET}`);

    for (const provider of summary.byProvider) {
      const providerTokens = provider.inputTokens + provider.outputTokens;
      console.log(`  ${CYAN}${provider.provider}${RESET}:`);
      console.log(`    ${formatNumber(provider.requests)} requests, ${formatNumber(providerTokens)} tokens`);

      // Show models for this provider
      if (provider.models.length > 1) {
        for (const model of provider.models) {
          const modelTokens = model.inputTokens + model.outputTokens;
          const modelName = Array.isArray(model.model) ? model.model.join(',') : String(model.model);
          console.log(`      ${DIM}-${RESET} ${modelName}: ${formatNumber(model.requests)} requests, ${formatNumber(modelTokens)} tokens`);
        }
      }
    }
  }

  // Display by model
  if (summary.byModel && summary.byModel.length > 0) {
    console.log(`\n${BOLD}By Model:${RESET}`);

    for (const model of summary.byModel) {
      const modelTokens = model.inputTokens + model.outputTokens;
      const modelName = Array.isArray(model.model) ? model.model.join(',') : String(model.model);
      console.log(`  ${CYAN}${modelName}${RESET} ${DIM}(${model.provider})${RESET}:`);
      console.log(`    ${formatNumber(model.requests)} requests, ${formatNumber(modelTokens)} tokens`);
    }
  }

  console.log('');
}

/**
 * Export usage data to file
 */
async function exportUsage(options: {
  format: 'json' | 'csv';
  startDate?: string;
  endDate?: string;
  provider?: string;
  model?: string;
  output?: string;
}): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const { HOME_DIR, query } = await import('@CCR/shared');

  // Set default date range if not provided
  if (!options.startDate || !options.endDate) {
    const dateRange = getAvailableDateRange();
    if (dateRange) {
      options.startDate = options.startDate || dateRange.startDate;
      options.endDate = options.endDate || dateRange.endDate;
    } else {
      const today = new Date().toISOString().split('T')[0];
      options.startDate = options.startDate || today;
      options.endDate = options.endDate || today;
    }
  }

  const queryObj: UsageQuery = {
    startDate: options.startDate,
    endDate: options.endDate,
    provider: options.provider,
    model: options.model,
  };

  const records = query(queryObj);

  if (records.length === 0) {
    console.log(`\n${YELLOW}No usage data found to export.${RESET}\n`);
    return;
  }

  // Generate output
  let content: string;
  let extension: string;

  if (options.format === 'csv') {
    const headers = [
      'id', 'timestamp', 'date', 'sessionId', 'requestId',
      'provider', 'model', 'inputTokens', 'outputTokens',
      'cacheCreationInputTokens', 'cacheReadInputTokens', 'reasoningTokens',
      'stream', 'success', 'errorMessage', 'duration'
    ];

    const csvLines = [
      headers.join(','),
      ...records.map(r => headers.map(h => {
        const val = (r as any)[h];
        if (val === undefined || val === null) return '';
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return String(val);
      }).join(','))
    ];

    content = csvLines.join('\n');
    extension = 'csv';
  } else {
    content = JSON.stringify(records, null, 2);
    extension = 'json';
  }

  // Determine output path
  const outputPath = options.output || path.join(
    HOME_DIR,
    `usage-export-${new Date().toISOString().split('T')[0]}.${extension}`
  );

  await fs.writeFile(outputPath, content, 'utf-8');

  console.log(`\n${GREEN}✓${RESET} Exported ${formatNumber(records.length)} records to ${outputPath}\n`);
}

/**
 * Cleanup old usage data
 */
async function cleanupUsage(options: {
  beforeDate?: string;
  retentionDays?: number;
  dryRun?: boolean;
}): Promise<void> {
  const cleanupOptions: CleanupOptions = {
    beforeDate: options.beforeDate,
    retentionDays: options.retentionDays,
    dryRun: options.dryRun,
  };

  // Default to 90 days if no options provided
  if (!options.beforeDate && !options.retentionDays) {
    cleanupOptions.retentionDays = 90;
  }

  const result = cleanup(cleanupOptions);

  if (result.deletedCount === 0) {
    console.log(`\n${GREEN}No old usage data found to clean up.${RESET}\n`);
    return;
  }

  if (options.dryRun) {
    console.log(`\n${BOLDYELLOW}Dry run - no changes made:${RESET}`);
  } else {
    console.log(`\n${GREEN}✓${RESET} Cleanup complete:`);
  }

  console.log(`  Records deleted: ${formatNumber(result.deletedCount)}`);
  console.log(`  Files affected:  ${result.deletedFiles.length}`);
  console.log(`  Space freed:     ${formatBytes(result.freedBytes)}\n`);
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Show usage help
 */
function showHelp(): void {
  console.log(`
${BOLD}Usage:${RESET}
  ccr usage                    Show today's usage
  ccr usage --date YYYY-MM-DD  Show usage for a specific date
  ccr usage --start DATE --end DATE  Show usage for a date range
  ccr usage export [options]   Export usage data
  ccr usage cleanup [options]  Clean up old usage data

${BOLD}Options:${RESET}
  --date <date>        Date to show (YYYY-MM-DD format)
  --start <date>       Start date for range
  --end <date>         End date for range
  --provider <name>    Filter by provider
  --model <name>       Filter by model

${BOLD}Export options:${RESET}
  --format <format>    Export format: json (default) or csv
  --output <path>      Output file path

${BOLD}Cleanup options:${RESET}
  --before <date>      Delete records before this date
  --retention <days>   Keep records for N days (default: 90)
  --dry-run            Preview without deleting

${BOLD}Examples:${RESET}
  ccr usage                           Today's usage
  ccr usage --date 2025-03-25         Specific date
  ccr usage --start 2025-03-01 --end 2025-03-31  Monthly report
  ccr usage export --format csv       Export as CSV
  ccr usage cleanup --retention 30    Delete data older than 30 days
  ccr usage cleanup --dry-run         Preview cleanup
`);
}

/**
 * Handle usage commands
 */
export async function handleUsageCommand(args: string[]): Promise<void> {
  const subCommand = args[0];

  // Parse options
  const options: any = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date' && args[i + 1]) {
      options.date = args[++i];
    } else if (args[i] === '--start' && args[i + 1]) {
      options.startDate = args[++i];
    } else if (args[i] === '--end' && args[i + 1]) {
      options.endDate = args[++i];
    } else if (args[i] === '--provider' && args[i + 1]) {
      options.provider = args[++i];
    } else if (args[i] === '--model' && args[i + 1]) {
      options.model = args[++i];
    } else if (args[i] === '--format' && args[i + 1]) {
      options.format = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      options.output = args[++i];
    } else if (args[i] === '--before' && args[i + 1]) {
      options.beforeDate = args[++i];
    } else if (args[i] === '--retention' && args[i + 1]) {
      options.retentionDays = parseInt(args[++i]);
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '-h' || args[i] === '--help') {
      showHelp();
      return;
    }
  }

  // Handle subcommands
  if (subCommand === 'export') {
    await exportUsage({
      format: options.format || 'json',
      startDate: options.startDate,
      endDate: options.endDate,
      provider: options.provider,
      model: options.model,
      output: options.output,
    });
    return;
  }

  if (subCommand === 'cleanup') {
    await cleanupUsage({
      beforeDate: options.beforeDate,
      retentionDays: options.retentionDays,
      dryRun: options.dryRun,
    });
    return;
  }

  if (subCommand === '-h' || subCommand === '--help') {
    showHelp();
    return;
  }

  // Default: show usage (first arg might be a flag, not subcommand)
  if (subCommand && subCommand.startsWith('-')) {
    // It's a flag, show usage with options
    await showUsage(options);
  } else if (!subCommand) {
    // No subcommand, show today's usage
    await showUsage(options);
  } else {
    console.error(`\n${YELLOW}Error:${RESET} Unknown usage command "${subCommand}"\n`);
    showHelp();
    process.exit(1);
  }
}