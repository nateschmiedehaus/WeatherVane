import { logWarning } from '../telemetry/logger.js';

export interface ChangedFile {
  path: string;
  patch?: string;
  isTestFile?: boolean;
  isConfigFile?: boolean;
}

export interface CoverageStats {
  changedLinesPercent?: number;
  touchedFilesDeltaPercent?: number;
  minChangedLinesPercent?: number;
  minTouchedFilesDeltaPercent?: number;
}

export interface MutationSmokeOptions {
  enabled: boolean;
  run: () => Promise<boolean>;
}

export interface VerifyIntegrityContext {
  changedFiles?: ChangedFile[];
  coverage?: CoverageStats;
  mutationSmoke?: MutationSmokeOptions;
  failingProofProvided?: boolean;
}

export interface IntegrityReport {
  changedLinesCoverageOk: boolean;
  skippedTestsFound: string[];
  noOpSuspicion: string[];
  placeholdersFound: string[];
  mutationSmokeRan?: boolean;
  mutationSmokeOk?: boolean;
}

const DEFAULT_CHANGED_LINES_THRESHOLD = 0.8;
const DEFAULT_FILE_DELTA_THRESHOLD = 0.05;

const SKIP_PATTERNS = [
  /\.skip/gi,
  /\bx(it|describe)\b/gi,
  /\.only/gi,
  /@pytest\.mark\.xfail/gi,
  /@pytest\.mark\.skip/gi,
  /test\.skip/gi,
  /jest\.setTimeout\(\s*(?:[6-9]\d{3,}|\d{5,})/gi,
];

const PLACEHOLDER_PATTERNS = [
  /TODO/gi,
  /FIXME/gi,
  /\bpass\b/gi,
  /return\s+true\b/gi,
  /return\s+0\b/gi,
];

export async function verifyIntegrity(ctx: VerifyIntegrityContext): Promise<IntegrityReport> {
  const files = ctx.changedFiles ?? [];
  const coverageOk = evaluateCoverage(ctx.coverage);
  const skippedTests = detectPatterns(files, SKIP_PATTERNS, 'skip');
  const placeholders = ctx.failingProofProvided
    ? []
    : detectPatterns(files, PLACEHOLDER_PATTERNS, 'placeholder');
  const noopFlags = detectNoOp(files, coverageOk);

  let mutationSmokeRan: boolean | undefined;
  let mutationSmokeOk: boolean | undefined;
  if (ctx.mutationSmoke?.enabled) {
    mutationSmokeRan = true;
    try {
      mutationSmokeOk = await ctx.mutationSmoke.run();
    } catch (error) {
      logWarning('mutation_smoke.failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      mutationSmokeOk = false;
    }
  }

  return {
    changedLinesCoverageOk: coverageOk,
    skippedTestsFound: skippedTests,
    noOpSuspicion: noopFlags,
    placeholdersFound: placeholders,
    mutationSmokeRan,
    mutationSmokeOk,
  };
}

function evaluateCoverage(coverage?: CoverageStats): boolean {
  if (!coverage) {
    return false;
  }
  const changedLines = coverage.changedLinesPercent ?? 0;
  const filesDelta = coverage.touchedFilesDeltaPercent ?? 0;
  const changedThreshold = coverage.minChangedLinesPercent ?? DEFAULT_CHANGED_LINES_THRESHOLD;
  const fileThreshold = coverage.minTouchedFilesDeltaPercent ?? DEFAULT_FILE_DELTA_THRESHOLD;
  return changedLines >= changedThreshold && filesDelta >= fileThreshold;
}

function detectPatterns(files: ChangedFile[], patterns: RegExp[], kind: string): string[] {
  const matches: string[] = [];
  for (const file of files) {
    if (!file.patch) continue;
    const additions = file.patch
      .split(/\r?\n/)
      .filter(line => line.startsWith('+') && !line.startsWith('+++'))
      .join('\n');
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(additions)) {
        matches.push(`${kind}:${file.path}`);
        break;
      }
    }
  }
  return matches;
}

function detectNoOp(files: ChangedFile[], coverageOk: boolean): string[] {
  const suspicions: string[] = [];
  const configFiles = files.filter(file => file.isConfigFile ?? isLikelyConfig(file.path));
  const logicFiles = files.filter(file => {
    const isConfig = file.isConfigFile ?? isLikelyConfig(file.path);
    const isTest = file.isTestFile ?? /test|spec/iu.test(file.path);
    return !isConfig && !isTest;
  });
  const testsTouched = files.some(file => file.isTestFile ?? /test|spec/iu.test(file.path));

  if (configFiles.length && !logicFiles.length && testsTouched) {
    suspicions.push('config_only_with_tests_changed');
  }

  if (!coverageOk && configFiles.length && testsTouched) {
    suspicions.push('coverage_missing_for_config_toggle');
  }

  for (const file of configFiles) {
    if (!file.patch) continue;
    const toggleHit = file.patch.split(/\r?\n/).some(line => {
      if (!line.startsWith('+')) return false;
      return /(enabled|disabled|true|false|on|off)/i.test(line);
    });
    if (toggleHit) {
      suspicions.push(`config_toggle:${file.path}`);
    }
  }

  return Array.from(new Set(suspicions));
}

function isLikelyConfig(pathname: string): boolean {
  return /\.(ya?ml|json|toml|ini|env)$/i.test(pathname) || /config/i.test(pathname);
}
