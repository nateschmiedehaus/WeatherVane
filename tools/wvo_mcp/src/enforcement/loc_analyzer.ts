/**
 * Sophisticated LOC (Lines of Code) Analysis
 *
 * Implements context-aware, intelligent LOC enforcement that distinguishes between:
 * - Core business logic (strict limits)
 * - Tests (generous - comprehensive testing encouraged)
 * - Templates/docs (very generous - completeness valued)
 * - Infrastructure (moderate)
 *
 * Includes:
 * - Deletion credits (via negativa incentive)
 * - Complexity analysis (not just line count)
 * - Pattern detection (auto-exempt boilerplate)
 * - Progressive enforcement (warnings → errors)
 */

import { readFileSync } from 'node:fs';

export interface LOCAnalysisResult {
  totalLOC: number;
  effectiveLOC: number; // Excluding comments, imports, whitespace
  deletedLOC: number;
  netLOC: number;
  baseLimit: number;
  adjustedLimit: number;
  allowed: boolean;
  severity: 'pass' | 'warning' | 'strong-warning' | 'blocked';
  explanation: string;
  credits: {
    deletionCredit: number;
    patternBonus: number;
    fileTypeMultiplier: number;
  };
  recommendations?: string[];
}

export interface FileChange {
  path: string;
  addedLines: number;
  deletedLines: number;
  content?: string;
}

const BASE_LIMIT = 150;

/**
 * Determine file type tier and multiplier
 */
function getFileTypeMultiplier(filePath: string): { tier: string; multiplier: number } {
  // Tests - comprehensive tests are good
  if (/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(filePath)) {
    return { tier: 'test', multiplier: 3.0 };
  }

  // Templates - naturally verbose with examples
  if (/templates\/.*\.md$/.test(filePath) || /\.template\.(md|ts|js)$/.test(filePath)) {
    return { tier: 'template', multiplier: 4.0 };
  }

  // System/Architecture docs - comprehensive analysis valued
  if (/docs\/(architecture|system|design|orchestration)\/.*\.md$/.test(filePath)) {
    return { tier: 'system-docs', multiplier: 4.0 };
  }

  // Documentation - completeness valued
  if (/docs\/.*\.md$/.test(filePath) || /README\.md$/.test(filePath)) {
    return { tier: 'docs', multiplier: 3.0 };
  }

  // Guides - similar to docs
  if (/GUIDE\.md$/.test(filePath) || /guides\//.test(filePath)) {
    return { tier: 'guide', multiplier: 3.0 };
  }

  // Schema/types - can be verbose but structured
  if (/(types|schema|interfaces)\.ts$/.test(filePath) || /\/types\//.test(filePath)) {
    return { tier: 'types', multiplier: 1.5 };
  }

  // Scripts/tools - automation complexity allowed
  if (/scripts\//.test(filePath) || /tools\//.test(filePath)) {
    return { tier: 'scripts', multiplier: 1.5 };
  }

  // Config files - moderate
  if (/(config|settings)\.ts$/.test(filePath) || /\.config\.(ts|js)$/.test(filePath)) {
    return { tier: 'config', multiplier: 1.3 };
  }

  // Evidence/state - documentation-like
  if (/state\/evidence\//.test(filePath)) {
    return { tier: 'evidence', multiplier: 2.5 };
  }

  // Core logic - strict enforcement
  if (/src\/.*\.(ts|js|tsx|jsx)$/.test(filePath) || /apps\/.*\.(ts|js|tsx|jsx)$/.test(filePath)) {
    return { tier: 'core', multiplier: 0.8 };
  }

  return { tier: 'default', multiplier: 1.0 };
}

/**
 * Calculate effective LOC (excluding boilerplate)
 */
function calculateEffectiveLOC(content: string): { effective: number; patterns: string[] } {
  const lines = content.split('\n');
  let effectiveLines = 0;
  const patterns: string[] = [];

  let importCount = 0;
  let commentCount = 0;
  let whitespaceCount = 0;
  let typeDefCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      whitespaceCount++;
      continue;
    }

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      commentCount++;
      continue;
    }

    // Skip imports/exports
    if (trimmed.startsWith('import ') || trimmed.startsWith('export ') && !trimmed.includes('function') && !trimmed.includes('class')) {
      importCount++;
      continue;
    }

    // Type definitions (less concerning than logic)
    if (trimmed.startsWith('interface ') || trimmed.startsWith('type ') || trimmed.startsWith('enum ')) {
      typeDefCount++;
      effectiveLines += 0.5; // Count as half
      continue;
    }

    // Everything else is effective code
    effectiveLines++;
  }

  // Detect patterns that justify higher LOC
  if (importCount > 20) patterns.push('high-imports');
  if (commentCount > lines.length * 0.3) patterns.push('well-documented');
  if (typeDefCount > 15) patterns.push('type-heavy');
  if (whitespaceCount > lines.length * 0.2) patterns.push('readable-spacing');

  return { effective: Math.ceil(effectiveLines), patterns };
}

/**
 * Calculate pattern bonus based on detected patterns
 */
function calculatePatternBonus(patterns: string[]): number {
  let bonus = 0;

  if (patterns.includes('high-imports')) bonus += 20; // Module integration, not logic complexity
  if (patterns.includes('well-documented')) bonus += 30; // Good documentation encouraged
  if (patterns.includes('type-heavy')) bonus += 25; // Type safety encouraged
  if (patterns.includes('readable-spacing')) bonus += 10; // Readability encouraged

  return bonus;
}

/**
 * Analyze LOC for a single file change
 */
export function analyzeFileLOC(
  file: FileChange,
  content?: string
): LOCAnalysisResult {
  const { path, addedLines, deletedLines } = file;
  const netLOC = addedLines - deletedLines;

  // File type analysis
  const { tier, multiplier } = getFileTypeMultiplier(path);
  const baseLimit = BASE_LIMIT;

  // Deletion credit (via negativa incentive)
  // For every 2 lines deleted, get 1 line credit
  const deletionCredit = Math.floor(deletedLines / 2);

  // Effective LOC analysis (if content available)
  let effectiveLOC = addedLines;
  let patternBonus = 0;

  if (content) {
    const analysis = calculateEffectiveLOC(content);
    effectiveLOC = analysis.effective;
    patternBonus = calculatePatternBonus(analysis.patterns);
  }

  // Calculate adjusted limit
  const adjustedLimit = Math.floor(
    baseLimit * multiplier + deletionCredit + patternBonus
  );

  // Determine severity
  let severity: LOCAnalysisResult['severity'];
  let allowed: boolean;
  let explanation: string;

  if (netLOC <= adjustedLimit) {
    severity = 'pass';
    allowed = true;
    explanation = `Within limit (${netLOC}/${adjustedLimit} LOC, ${tier} tier)`;
  } else if (netLOC <= adjustedLimit * 1.5) {
    severity = 'warning';
    allowed = true; // Warning, not blocking
    explanation = `Approaching limit (${netLOC}/${adjustedLimit} LOC, ${tier} tier) - consider splitting`;
  } else if (netLOC <= adjustedLimit * 2) {
    severity = 'strong-warning';
    allowed = true; // Strong warning, still not blocking
    explanation = `Significantly over limit (${netLOC}/${adjustedLimit} LOC, ${tier} tier) - should split unless justified`;
  } else {
    severity = 'blocked';
    allowed = false;
    explanation = `Blocked: ${netLOC}/${adjustedLimit} LOC (${tier} tier) - must split or provide override justification`;
  }

  // Recommendations
  const recommendations: string[] = [];
  if (netLOC > adjustedLimit) {
    if (tier === 'core') {
      recommendations.push('Core logic should be split into smaller modules');
      recommendations.push('Extract helper functions to separate files');
    }
    if (deletedLines === 0 && addedLines > 100) {
      recommendations.push('Via negativa: Can you DELETE/SIMPLIFY existing code instead?');
    }
    if (multiplier < 1.5) {
      recommendations.push('Consider refactoring into multiple files');
    }
  }

  return {
    totalLOC: addedLines,
    effectiveLOC,
    deletedLOC: deletedLines,
    netLOC,
    baseLimit,
    adjustedLimit,
    allowed,
    severity,
    explanation,
    credits: {
      deletionCredit,
      patternBonus,
      fileTypeMultiplier: multiplier,
    },
    recommendations: recommendations.length > 0 ? recommendations : undefined,
  };
}

/**
 * Analyze all files in a commit
 */
export function analyzeCommitLOC(files: FileChange[]): {
  files: Array<LOCAnalysisResult & { path: string }>;
  totalNetLOC: number;
  overallAllowed: boolean;
  overallSeverity: LOCAnalysisResult['severity'];
  blockedFiles: string[];
  summary: string;
} {
  const results = files.map((file) => ({
    path: file.path,
    ...analyzeFileLOC(file, file.content),
  }));

  const totalNetLOC = results.reduce((sum, r) => sum + r.netLOC, 0);
  const blockedFiles = results.filter((r) => !r.allowed).map((r) => r.path);
  const overallAllowed = blockedFiles.length === 0;

  // Determine overall severity (worst case)
  const severities = results.map((r) => r.severity);
  let overallSeverity: LOCAnalysisResult['severity'] = 'pass';
  if (severities.includes('blocked')) overallSeverity = 'blocked';
  else if (severities.includes('strong-warning')) overallSeverity = 'strong-warning';
  else if (severities.includes('warning')) overallSeverity = 'warning';

  const summary = overallAllowed
    ? `✅ All files within limits (${totalNetLOC} net LOC across ${files.length} files)`
    : `❌ ${blockedFiles.length} file(s) blocked (${totalNetLOC} net LOC across ${files.length} files)`;

  return {
    files: results,
    totalNetLOC,
    overallAllowed,
    overallSeverity,
    blockedFiles,
    summary,
  };
}

/**
 * Format analysis results for display
 */
export function formatAnalysis(analysis: ReturnType<typeof analyzeCommitLOC>): string {
  const lines: string[] = [];

  lines.push('📊 Sophisticated LOC Analysis:');
  lines.push('');

  for (const file of analysis.files) {
    const icon = file.severity === 'blocked' ? '❌' :
                 file.severity === 'strong-warning' ? '⚠️⚠️' :
                 file.severity === 'warning' ? '⚠️' : '✅';

    lines.push(`${icon} ${file.path}`);
    lines.push(`   ${file.explanation}`);

    if (file.credits.deletionCredit > 0 || file.credits.patternBonus > 0) {
      const credits = [];
      if (file.credits.deletionCredit > 0) {
        credits.push(`deletion credit: +${file.credits.deletionCredit}`);
      }
      if (file.credits.patternBonus > 0) {
        credits.push(`pattern bonus: +${file.credits.patternBonus}`);
      }
      if (file.credits.fileTypeMultiplier !== 1.0) {
        credits.push(`type multiplier: ${file.credits.fileTypeMultiplier}x`);
      }
      lines.push(`   Credits: ${credits.join(', ')}`);
    }

    if (file.recommendations) {
      lines.push('   Recommendations:');
      for (const rec of file.recommendations) {
        lines.push(`     • ${rec}`);
      }
    }
    lines.push('');
  }

  lines.push(analysis.summary);

  return lines.join('\n');
}
