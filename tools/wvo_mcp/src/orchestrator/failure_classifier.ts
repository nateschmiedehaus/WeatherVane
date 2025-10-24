/**
 * Failure Classification System
 *
 * Intelligently classifies task failures to determine retry strategy.
 * Prevents wasted retries on impossible/persistent failures.
 *
 * Failure Types:
 * - TRANSIENT: Temporary (network timeout, rate limit) → Retry with backoff
 * - PERSISTENT: Same error 3+ times → Escalate to human
 * - IMPOSSIBLE: Missing dependency, file doesn't exist → Don't retry until blocker resolved
 * - ENVIRONMENTAL: System issue (disk full, OOM) → Escalate immediately
 *
 * Learning:
 * - Tracks historical patterns
 * - Learns which errors are retryable
 * - Optimizes retry strategy based on success rates
 */

import type { Task } from './state_machine.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export type FailureType = 'transient' | 'persistent' | 'impossible' | 'environmental';
export type RetryStrategy = 'immediate' | 'exponential_backoff' | 'linear_backoff' | 'never';

export interface FailureClassification {
  type: FailureType;
  shouldRetry: boolean;
  retryStrategy: RetryStrategy;
  rootCause: string;
  suggestedFix?: string;
  confidence: number; // 0-1
  maxRetries: number;
}

export interface FailurePattern {
  errorSignature: string; // Normalized error message
  occurrences: number;
  retrySuccesses: number;
  retryFailures: number;
  successRate: number;
  avgRetriesUntilSuccess: number;
  lastSeen: Date;
  classification: FailureType;
}

export interface ExecutionContext {
  attemptCount: number;
  previousError?: string;
  taskAge: number; // milliseconds since task created
  recentFailures: Array<{ error: string; timestamp: number }>;
}

export class FailureClassifier {
  private patterns = new Map<string, FailurePattern>();
  private patternsFile: string;

  constructor(private readonly workspaceRoot: string) {
    this.patternsFile = path.join(workspaceRoot, 'state', 'failure_patterns.json');
    this.loadPatterns();
  }

  /**
   * Classify a task failure
   */
  classify(task: Task, error: string, context: ExecutionContext): FailureClassification {
    // Pattern 1: File/module not found = IMPOSSIBLE
    if (this.isFileNotFoundError(error)) {
      return {
        type: 'impossible',
        shouldRetry: false,
        retryStrategy: 'never',
        rootCause: 'Missing file or module dependency',
        suggestedFix: 'Check task dependencies, ensure prerequisite tasks are complete',
        confidence: 0.95,
        maxRetries: 0,
      };
    }

    // Pattern 2: Permission denied / disk full = ENVIRONMENTAL
    if (this.isEnvironmentalError(error)) {
      return {
        type: 'environmental',
        shouldRetry: false,
        retryStrategy: 'never',
        rootCause: 'System resource or permission issue',
        suggestedFix: 'Check disk space, file permissions, system resources',
        confidence: 0.95,
        maxRetries: 0,
      };
    }

    // Pattern 3: Rate limit / timeout = TRANSIENT
    if (this.isTransientError(error)) {
      return {
        type: 'transient',
        shouldRetry: true,
        retryStrategy: 'exponential_backoff',
        rootCause: 'Temporary network or API issue',
        suggestedFix: 'Retry with exponential backoff',
        confidence: 0.9,
        maxRetries: 5,
      };
    }

    // Pattern 4: Same error 3+ times = PERSISTENT
    if (this.isPersistentError(error, context)) {
      return {
        type: 'persistent',
        shouldRetry: false,
        retryStrategy: 'never',
        rootCause: 'Repeated identical failure (likely code bug)',
        suggestedFix: 'Human review required - possible logic error or design issue',
        confidence: 0.85,
        maxRetries: 0,
      };
    }

    // Pattern 5: Learn from historical patterns
    const pattern = this.findMatchingPattern(error);
    if (pattern) {
      return this.classifyFromPattern(pattern, context);
    }

    // Default: Try once more with backoff
    return {
      type: 'transient',
      shouldRetry: context.attemptCount < 3,
      retryStrategy: 'exponential_backoff',
      rootCause: 'Unknown failure type',
      suggestedFix: 'Retry with caution, escalate if persists',
      confidence: 0.5,
      maxRetries: 3,
    };
  }

  /**
   * Record the outcome of a retry attempt
   */
  async recordOutcome(error: string, wasRetried: boolean, outcome: 'success' | 'failure'): Promise<void> {
    if (!wasRetried) return; // Only track retry outcomes

    const signature = this.normalizeError(error);
    const pattern = this.patterns.get(signature) || this.createNewPattern(signature);

    pattern.occurrences++;
    if (outcome === 'success') {
      pattern.retrySuccesses++;
    } else {
      pattern.retryFailures++;
    }

    pattern.successRate = pattern.retrySuccesses / (pattern.retrySuccesses + pattern.retryFailures);
    pattern.lastSeen = new Date();

    // Update classification based on success rate
    if (pattern.successRate < 0.1 && pattern.occurrences >= 5) {
      pattern.classification = 'persistent';
    } else if (pattern.successRate > 0.7) {
      pattern.classification = 'transient';
    }

    this.patterns.set(signature, pattern);

    // Save to disk periodically (every 10 updates)
    if (pattern.occurrences % 10 === 0) {
      await this.savePatterns();
    }
  }

  /**
   * Get statistics on failure patterns
   */
  getStatistics(): {
    totalPatterns: number;
    transientPatterns: number;
    persistentPatterns: number;
    impossiblePatterns: number;
    avgSuccessRate: number;
  } {
    const patterns = Array.from(this.patterns.values());

    return {
      totalPatterns: patterns.length,
      transientPatterns: patterns.filter(p => p.classification === 'transient').length,
      persistentPatterns: patterns.filter(p => p.classification === 'persistent').length,
      impossiblePatterns: patterns.filter(p => p.classification === 'impossible').length,
      avgSuccessRate: patterns.reduce((sum, p) => sum + p.successRate, 0) / (patterns.length || 1),
    };
  }

  // ==================== Private Methods ====================

  private isFileNotFoundError(error: string): boolean {
    const patterns = [
      /ENOENT/i,
      /file not found/i,
      /no such file/i,
      /cannot find module/i,
      /module.*not found/i,
      /failed to load/i,
    ];
    return patterns.some(p => p.test(error));
  }

  private isEnvironmentalError(error: string): boolean {
    const patterns = [
      /EACCES/i,
      /EPERM/i,
      /permission denied/i,
      /ENOSPC/i,
      /no space left/i,
      /disk full/i,
      /out of memory/i,
      /OOM/i,
      /killed/i,
    ];
    return patterns.some(p => p.test(error));
  }

  private isTransientError(error: string): boolean {
    const patterns = [
      /rate limit/i,
      /429/,
      /timeout/i,
      /ETIMEDOUT/i,
      /ECONNREFUSED/i,
      /ECONNRESET/i,
      /network/i,
      /temporary failure/i,
      /try again/i,
      /temporarily unavailable/i,
    ];
    return patterns.some(p => p.test(error));
  }

  private isPersistentError(error: string, context: ExecutionContext): boolean {
    // Same error appeared 3+ times
    const sameErrorCount = context.recentFailures.filter(f =>
      this.normalizeError(f.error) === this.normalizeError(error)
    ).length;

    return sameErrorCount >= 3;
  }

  private normalizeError(error: string): string {
    // Remove file paths, line numbers, timestamps
    let normalized = error
      .replace(/\/[^\s]+/g, '[PATH]') // file paths
      .replace(/:\d+:\d+/g, '[LINE]') // line numbers
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, '[TIMESTAMP]') // timestamps
      .replace(/\d+ms/g, '[DURATION]') // durations
      .toLowerCase();

    // Keep only first 200 chars (error signature)
    return normalized.slice(0, 200);
  }

  private findMatchingPattern(error: string): FailurePattern | undefined {
    const signature = this.normalizeError(error);
    return this.patterns.get(signature);
  }

  private classifyFromPattern(pattern: FailurePattern, context: ExecutionContext): FailureClassification {
    // Use historical data to inform classification
    const shouldRetry = pattern.successRate > 0.2 && context.attemptCount < 3;

    return {
      type: pattern.classification,
      shouldRetry,
      retryStrategy: shouldRetry ? 'exponential_backoff' : 'never',
      rootCause: `Historical pattern (${pattern.occurrences} occurrences, ${Math.round(pattern.successRate * 100)}% success rate)`,
      suggestedFix: pattern.successRate > 0.5
        ? 'Historical data suggests retry may succeed'
        : 'Historical data suggests this error rarely resolves with retry',
      confidence: Math.min(0.95, 0.5 + (pattern.occurrences / 100)),
      maxRetries: Math.ceil(pattern.avgRetriesUntilSuccess) || 3,
    };
  }

  private createNewPattern(signature: string): FailurePattern {
    return {
      errorSignature: signature,
      occurrences: 0,
      retrySuccesses: 0,
      retryFailures: 0,
      successRate: 0,
      avgRetriesUntilSuccess: 0,
      lastSeen: new Date(),
      classification: 'transient', // Default
    };
  }

  private loadPatterns(): void {
    try {
      if (existsSync(this.patternsFile)) {
        const data = readFileSync(this.patternsFile, 'utf-8');
        const parsed = JSON.parse(data);

        // Convert plain object to Map
        for (const [key, value] of Object.entries(parsed)) {
          const pattern = value as FailurePattern;
          pattern.lastSeen = new Date(pattern.lastSeen); // Rehydrate Date
          this.patterns.set(key, pattern);
        }

        logInfo('Loaded failure patterns', {
          count: this.patterns.size,
          file: this.patternsFile,
        });
      }
    } catch (error) {
      logWarning('Failed to load failure patterns, starting fresh', {
        error: (error as Error).message,
      });
    }
  }

  private async savePatterns(): Promise<void> {
    try {
      // Convert Map to plain object for JSON serialization
      const obj: Record<string, FailurePattern> = {};
      for (const [key, value] of this.patterns.entries()) {
        obj[key] = value;
      }

      writeFileSync(this.patternsFile, JSON.stringify(obj, null, 2), 'utf-8');

      logInfo('Saved failure patterns', {
        count: this.patterns.size,
        file: this.patternsFile,
      });
    } catch (error) {
      logError('Failed to save failure patterns', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Prune old patterns (not seen in 90 days)
   */
  pruneStalePatterns(): number {
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    let pruned = 0;

    for (const [signature, pattern] of this.patterns.entries()) {
      if (pattern.lastSeen.getTime() < ninetyDaysAgo) {
        this.patterns.delete(signature);
        pruned++;
      }
    }

    if (pruned > 0) {
      logInfo('Pruned stale failure patterns', { count: pruned });
      this.savePatterns();
    }

    return pruned;
  }
}
