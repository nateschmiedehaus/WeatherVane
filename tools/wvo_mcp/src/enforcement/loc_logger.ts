/**
 * LOC Enforcement Analytics Logger
 *
 * Logs all LOC analyses to JSONL for:
 * - Tuning multipliers based on false positive rate
 * - Tracking deletion credit usage (via negativa metrics)
 * - Identifying gaming patterns
 * - Monitoring bypass rate
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const WORKSPACE_ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const LOG_PATH = join(WORKSPACE_ROOT, 'state', 'analytics', 'loc_enforcement.jsonl');

export interface LOCLogEntry {
  timestamp: string;
  outcome: 'passed' | 'warning' | 'strong-warning' | 'blocked' | 'overridden';
  totalFiles: number;
  totalNetLOC: number;
  files: Array<{
    path: string;
    tier: string;
    netLOC: number;
    adjustedLimit: number;
    severity: string;
    deletionCredit: number;
    patternBonus: number;
    multiplier: number;
  }>;
  overrideReason?: string;
}

/**
 * Log LOC analysis result to JSONL analytics file
 */
export function logLOCAnalysis(entry: Omit<LOCLogEntry, 'timestamp'>): void {
  try {
    // Ensure directory exists
    const logDir = dirname(LOG_PATH);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    // Create log entry
    const logEntry: LOCLogEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };

    // Append to JSONL file
    appendFileSync(LOG_PATH, JSON.stringify(logEntry) + '\n', 'utf-8');
  } catch (error) {
    // Don't fail commits if logging fails
    console.warn('Warning: Failed to log LOC analysis:', error);
  }
}

/**
 * Helper to create log entry from analysis result
 */
export function createLogEntry(
  analysis: {
    files: Array<any>;
    totalNetLOC: number;
    overallAllowed: boolean;
    overallSeverity: string;
  },
  overrideReason?: string
): Omit<LOCLogEntry, 'timestamp'> {
  const outcome = overrideReason
    ? 'overridden'
    : analysis.overallSeverity === 'blocked'
    ? 'blocked'
    : analysis.overallSeverity === 'strong-warning'
    ? 'strong-warning'
    : analysis.overallSeverity === 'warning'
    ? 'warning'
    : 'passed';

  return {
    outcome,
    totalFiles: analysis.files.length,
    totalNetLOC: analysis.totalNetLOC,
    files: analysis.files.map((f) => ({
      path: f.path,
      tier: f.credits?.fileTypeMultiplier ? getTierName(f.credits.fileTypeMultiplier) : 'unknown',
      netLOC: f.netLOC,
      adjustedLimit: f.adjustedLimit,
      severity: f.severity,
      deletionCredit: f.credits?.deletionCredit || 0,
      patternBonus: f.credits?.patternBonus || 0,
      multiplier: f.credits?.fileTypeMultiplier || 1.0,
    })),
    overrideReason,
  };
}

function getTierName(multiplier: number): string {
  if (multiplier === 0.8) return 'core';
  if (multiplier === 1.0) return 'default';
  if (multiplier === 1.3) return 'config';
  if (multiplier === 1.5) return 'types/scripts';
  if (multiplier === 2.5) return 'evidence';
  if (multiplier === 3.0) return 'tests/docs/guides';
  if (multiplier === 4.0) return 'templates/system-docs';
  return `custom-${multiplier}x`;
}
