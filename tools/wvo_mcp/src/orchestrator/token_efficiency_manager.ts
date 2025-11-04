import { promises as fs } from 'node:fs';
import path from 'node:path';


import { SettingsStore } from '../state/live_flags.js';
import { logInfo, logWarning } from '../telemetry/logger.js';
import { isDryRunEnabled } from '../utils/dry_run.js';

import type { OperationsManager, OperationsSnapshot } from './operations_manager.js';

const MAX_CONTEXT_WORDS_DEFAULT = 1000;
const MIN_INTERVAL_MS_DEFAULT = 15 * 60 * 1000;
const BACKUP_RETENTION_DEFAULT = 8;

type TokenPressureEvent = { snapshot: OperationsSnapshot };
type ContextLimitEvent = unknown;

interface ContextSection {
  heading: string;
  headingLine: string;
  bodyLines: string[];
}

interface ParsedContext {
  preamble: string[];
  sections: ContextSection[];
}

interface TrimPass {
  id: string;
  defaultCore: number;
  defaultNonCore: number;
  overrides?: Record<string, number>;
  removeNonCore?: boolean;
}

interface OptimizationResult {
  optimized: boolean;
  backupPath?: string;
  beforeWordCount: number;
  afterWordCount: number;
  trimmedSections: string[];
}

const CORE_SECTION_PATTERNS = ['current focus', 'guardrails', 'risks', 'next actions'];

const TRIM_PASSES: TrimPass[] = [
  {
    id: 'moderate',
    defaultCore: 80,
    defaultNonCore: 18,
    overrides: {
      'current focus': 110,
      'guardrails': 60,
      'risks': 36,
      'next actions': 90,
    },
  },
  {
    id: 'aggressive',
    defaultCore: 48,
    defaultNonCore: 12,
    overrides: {
      'current focus': 70,
      'guardrails': 44,
      'risks': 28,
      'next actions': 60,
    },
  },
  {
    id: 'extreme',
    defaultCore: 32,
    defaultNonCore: 6,
    overrides: {
      'current focus': 45,
      'guardrails': 32,
      'risks': 18,
      'next actions': 44,
    },
  },
  {
    id: 'core_only',
    defaultCore: 26,
    defaultNonCore: 0,
    removeNonCore: true,
    overrides: {
      'current focus': 32,
      'guardrails': 24,
      'risks': 18,
      'next actions': 32,
    },
  },
];

export interface TokenEfficiencyManagerOptions {
  maxContextWords?: number;
  minIntervalMs?: number;
  backupRetention?: number;
}

export class TokenEfficiencyManager {
  private readonly contextPath: string;
  private readonly backupDir: string;
  private readonly settingsStore: SettingsStore | null;
  private readonly maxContextWords: number;
  private readonly minIntervalMs: number;
  private readonly backupRetention: number;
  private disposed = false;
  private optimizing = false;
  private lastOptimization = 0;
  private readonly enabled: boolean;
  private pendingSignal: { signal: 'token_pressure' | 'context_limit'; event?: TokenPressureEvent } | null = null;

  private readonly tokenPressureListener = (event: TokenPressureEvent) => {
    void this.handleSignal('token_pressure', event);
  };

  private readonly contextLimitListener = (_event: ContextLimitEvent) => {
    void this.handleSignal('context_limit');
  };

  constructor(
    private readonly workspaceRoot: string,
    private readonly operations: OperationsManager,
    options: TokenEfficiencyManagerOptions = {},
  ) {
    this.contextPath = path.join(workspaceRoot, 'state', 'context.md');
    this.backupDir = path.join(workspaceRoot, 'state', 'backups', 'context');
    this.enabled = !isDryRunEnabled();
    this.settingsStore = this.enabled ? new SettingsStore({ workspaceRoot }) : null;
    this.maxContextWords = Math.max(300, options.maxContextWords ?? MAX_CONTEXT_WORDS_DEFAULT);
    const requestedInterval = options.minIntervalMs ?? MIN_INTERVAL_MS_DEFAULT;
    this.minIntervalMs = Math.max(0, requestedInterval);
    this.backupRetention = Math.max(3, options.backupRetention ?? BACKUP_RETENTION_DEFAULT);

    if (this.enabled) {
      this.operations.on('maintenance:token_pressure', this.tokenPressureListener);
      this.operations.on('maintenance:context_limit', this.contextLimitListener);
      void this.bootstrap();
    } else {
      logInfo('Token efficiency manager running in dry-run mode; trims disabled');
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.enabled) {
      this.operations.off('maintenance:token_pressure', this.tokenPressureListener);
      this.operations.off('maintenance:context_limit', this.contextLimitListener);
    }
    if (this.settingsStore) {
      try {
        this.settingsStore.close();
      } catch (error) {
        logWarning('Token efficiency manager failed to close settings store cleanly', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async bootstrap(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    await this.ensureEfficientOperationsFlag();
    await this.maybeOptimize('startup');
  }

  private async handleSignal(signal: 'token_pressure' | 'context_limit', event?: TokenPressureEvent): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (!this.enabled) {
      return;
    }

    await this.ensureEfficientOperationsFlag();

    const now = Date.now();
    if (this.optimizing) {
      this.pendingSignal = { signal, event };
      return;
    }

    if (now - this.lastOptimization < this.minIntervalMs) {
      return;
    }

    this.optimizing = true;
    let result: OptimizationResult | null = null;
    try {
      result = await this.maybeOptimize(signal);
      if (result?.optimized) {
        this.lastOptimization = Date.now();
        logInfo('Token efficiency manager compacted context', {
          reason: signal,
          before_words: result.beforeWordCount,
          after_words: result.afterWordCount,
          backup: result.backupPath,
          trimmed_sections: result.trimmedSections,
          snapshot_pressure: event?.snapshot.tokenMetrics.pressure,
          snapshot_prompt_tokens: event?.snapshot.tokenMetrics.averagePromptTokens,
        });
      }
    } catch (error) {
      logWarning('Token efficiency manager failed to optimise context', {
        reason: signal,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.optimizing = false;
      if (!result?.optimized) {
        this.lastOptimization = Math.max(this.lastOptimization, now);
      }
      const next = this.pendingSignal;
      this.pendingSignal = null;
      if (next) {
        void this.handleSignal(next.signal, next.event);
      }
    }
  }

  private async ensureEfficientOperationsFlag(): Promise<void> {
    if (!this.settingsStore) {
      return;
    }
    try {
      const snapshot = this.settingsStore.read();
      if (snapshot.EFFICIENT_OPERATIONS !== '1') {
        this.settingsStore.upsert('EFFICIENT_OPERATIONS', '1');
        logInfo('Token efficiency manager re-enabled efficient operations live flag');
      }
    } catch (error) {
      logWarning('Token efficiency manager failed to read or update live flags', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async maybeOptimize(reason: string): Promise<OptimizationResult | null> {
    const parsed = await this.parseContext();
    if (!parsed) {
      return null;
    }

    if (parsed.wordCount <= this.maxContextWords) {
      return null;
    }

    const backupName = await this.writeBackup(parsed.content);
    const backupPath = backupName
      ? path.join('state', 'backups', 'context', backupName)
      : undefined;

    const result = await this.buildOptimisedContent(parsed.structure, backupPath, reason, parsed.wordCount);
    if (!result) {
      return null;
    }

    await fs.writeFile(this.contextPath, result.content, 'utf8');
    await this.pruneBackups();

    return {
      optimized: true,
      backupPath,
      beforeWordCount: parsed.wordCount,
      afterWordCount: result.wordCount,
      trimmedSections: result.trimmedSections,
    };
  }

  private async parseContext(): Promise<{ content: string; wordCount: number; structure: ParsedContext } | null> {
    try {
      const content = await fs.readFile(this.contextPath, 'utf8');
      const structure = this.splitIntoSections(content);
      const wordCount = countWords(content);
      return { content, wordCount, structure };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      logWarning('Token efficiency manager could not read context file', {
        path: this.contextPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private splitIntoSections(content: string): ParsedContext {
    const lines = content.split(/\r?\n/u);
    const preamble: string[] = [];
    const sections: ContextSection[] = [];
    let current: ContextSection | null = null;

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '');
      if (line.startsWith('## ')) {
        if (current) {
          sections.push(current);
        }
        current = {
          heading: line.slice(3).trim(),
          headingLine: line.trim(),
          bodyLines: [],
        };
      } else if (current) {
        current.bodyLines.push(line);
      } else {
        preamble.push(line);
      }
    }

    if (current) {
      sections.push(current);
    }

    return { preamble, sections };
  }

  private async writeBackup(content: string): Promise<string | null> {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-');
      const name = `context-${timestamp}.md`;
      const fullPath = path.join(this.backupDir, name);
      await fs.writeFile(fullPath, content, 'utf8');
      return name;
    } catch (error) {
      logWarning('Token efficiency manager failed to write context backup', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async pruneBackups(): Promise<void> {
    try {
      const entries = await fs.readdir(this.backupDir);
      if (entries.length <= this.backupRetention) {
        return;
      }

      const records = await Promise.all(
        entries.map(async (name) => {
          const fullPath = path.join(this.backupDir, name);
          try {
            const stats = await fs.stat(fullPath);
            return { name, fullPath, mtimeMs: stats.mtimeMs };
          } catch {
            return null;
          }
        }),
      );

      const sorted = records
        .filter((record): record is { name: string; fullPath: string; mtimeMs: number } => Boolean(record))
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

      const remove = sorted.slice(this.backupRetention);
      await Promise.all(
        remove.map(async (record) => {
          try {
            await fs.unlink(record.fullPath);
          } catch (error) {
            logWarning('Token efficiency manager could not prune backup', {
              backup: record.fullPath,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      logWarning('Token efficiency manager failed to prune backups', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async buildOptimisedContent(
    structure: ParsedContext,
    backupPath: string | undefined,
    reason: string,
    originalWordCount: number,
  ): Promise<{ content: string; wordCount: number; trimmedSections: string[] } | null> {
    let bestContent = '';
    let bestWordCount = Number.POSITIVE_INFINITY;
    let bestTrimmed: string[] = [];
    const trimNote = buildTrimNote(backupPath, reason);

    for (const pass of TRIM_PASSES) {
      const { content, trimmedSections } = this.renderStructure(structure, pass, trimNote);
      const wordCount = countWords(content);

      if (wordCount < bestWordCount) {
        bestContent = content;
        bestWordCount = wordCount;
        bestTrimmed = trimmedSections;
      }

      if (wordCount <= this.maxContextWords) {
        return { content, wordCount, trimmedSections };
      }
    }

    // If all passes still exceed budget, fall back to the best content achieved.
    if (bestWordCount < originalWordCount && bestContent) {
      if (bestWordCount > this.maxContextWords) {
        const enforced = enforceGlobalWordBudget(bestContent, this.maxContextWords, trimNote);
        return {
          content: enforced.content,
          wordCount: enforced.wordCount,
          trimmedSections: Array.from(new Set([...bestTrimmed, 'Global budget'])),
        };
      }
      return { content: bestContent, wordCount: bestWordCount, trimmedSections: bestTrimmed };
    }

    return null;
  }

  private renderStructure(
    structure: ParsedContext,
    pass: TrimPass,
    trimNote: string,
  ): { content: string; trimmedSections: string[] } {
    const trimmedSections: string[] = [];
    const lines: string[] = [];

    const normalizedOverrides = normalizeOverrides(pass.overrides);

    const sections = structure.sections.map((section) => ({
      heading: section.heading,
      headingLine: section.headingLine,
      bodyLines: [...section.bodyLines],
    }));

    const cleanedPreamble = removeTrailingEmptyLines(structure.preamble);
    for (const line of cleanedPreamble) {
      lines.push(line);
    }
    if (cleanedPreamble.length > 0 && sections.length > 0) {
      lines.push('');
    }

    for (const section of sections) {
      lines.push(section.headingLine);

      const normalizedHeading = section.heading.toLowerCase();
      const isCore = CORE_SECTION_PATTERNS.some((pattern) =>
        normalizedHeading.includes(pattern),
      );

      const overrideLimit = selectOverrideLimit(normalizedOverrides, normalizedHeading);
      const maxLines =
        (overrideLimit ?? (isCore ? pass.defaultCore : pass.defaultNonCore));

      let bodyLines = removeTrailingEmptyLines(section.bodyLines);

      if (pass.removeNonCore && !isCore) {
        if (bodyLines.length > 0) {
          trimmedSections.push(section.heading);
        }
        lines.push(trimNote);
        lines.push('');
        continue;
      }

      if (maxLines >= 0 && bodyLines.length > maxLines) {
        trimmedSections.push(section.heading);
        bodyLines = bodyLines.slice(0, Math.max(0, maxLines));
        if (bodyLines.length === 0) {
          bodyLines.push(trimNote);
        } else {
          bodyLines.push('');
          bodyLines.push(trimNote);
        }
      }

      for (const line of bodyLines) {
        lines.push(line);
      }

      if (lines[lines.length - 1] !== '') {
        lines.push('');
      }
    }

    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    const content = `${lines.join('\n')}\n`;
    return { content, trimmedSections };
  }
}

function normalizeOverrides(
  overrides: TrimPass['overrides'] | undefined,
): Array<{ pattern: string; limit: number }> {
  const entries: Array<{ pattern: string; limit: number }> = [];
  if (!overrides) {
    return entries;
  }
  for (const [key, value] of Object.entries(overrides)) {
    const normalizedKey = key.trim().toLowerCase();
    entries.push({ pattern: normalizedKey, limit: Math.max(0, value) });
  }
  return entries;
}

function selectOverrideLimit(
  overrides: Array<{ pattern: string; limit: number }>,
  heading: string,
): number | undefined {
  for (const { pattern, limit } of overrides) {
    if (!pattern) continue;
    if (heading.includes(pattern)) {
      return limit;
    }
  }
  return undefined;
}

function removeTrailingEmptyLines(lines: string[]): string[] {
  const trimmed = [...lines];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1].trim() === '') {
    trimmed.pop();
  }
  return trimmed;
}

function countWords(text: string): number {
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}

function buildTrimNote(backupPath: string | undefined, reason: string): string {
  return backupPath
    ? `_Trimmed for token efficiency (${reason}); full history preserved in \`${backupPath}\`._`
    : `_Trimmed for token efficiency (${reason}); original preserved in latest backup._`;
}

function enforceGlobalWordBudget(
  content: string,
  maxWords: number,
  trimNote: string,
): { content: string; wordCount: number } {
  const lines = content.split('\n');
  const result: string[] = [];
  const noteWords = countWords(trimNote);
  const allowedWords = Math.max(0, maxWords - noteWords);
  let accumulated = 0;
  let firstMeaningfulSeen = false;

  for (const line of lines) {
    const lineWords = countWords(line);
    const isMeaningful = line.trim().length > 0;
    if (isMeaningful && !firstMeaningfulSeen) {
      firstMeaningfulSeen = true;
    }

    if (firstMeaningfulSeen && accumulated + lineWords > allowedWords) {
      break;
    }

    result.push(line);
    accumulated += lineWords;
  }

  if (result.length === 0 && lines.length > 0) {
    result.push(lines[0]);
  }

  if (result[result.length - 1] !== '') {
    result.push('');
  }
  result.push(trimNote);

  if (result[result.length - 1] !== '') {
    result.push('');
  }

  let finalContent = result.join('\n');
  if (!finalContent.endsWith('\n')) {
    finalContent += '\n';
  }
  const finalWordCount = countWords(finalContent);

  return {
    content: finalContent,
    wordCount: Math.min(finalWordCount, maxWords),
  };
}
