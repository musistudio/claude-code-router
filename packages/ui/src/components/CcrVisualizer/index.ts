// Public entry point for the CcrVisualizer module.
// Exports the four public functions used by LogViewer.tsx and tests.

import { parseLog } from './parse';
import { groupIntoTurns, detectParallelGroups } from './group';
import { generateHtml, generateEmptyStateHtml } from './render';

export { parseLog };
export { detectParallelGroups, groupIntoTurns };

export function generateVisualization(logText: string): string {
  if (!logText.trim()) return generateEmptyStateHtml('No log content');
  const reqs = parseLog(logText);
  if (reqs.length === 0) return generateEmptyStateHtml('No CCR requests found in this log');
  const turns = groupIntoTurns(reqs);
  detectParallelGroups(reqs);
  return generateHtml(reqs, turns);
}
