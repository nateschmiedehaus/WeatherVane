import path from 'node:path';
import { logWarning } from '../telemetry/logger.js';

export type BlockerLabel =
  | 'missing_dependency'
  | 'flaky_test'
  | 'underspecified_requirements'
  | 'external_secret_or_credential'
  | 'integration_contract_break'
  | 'non_determinism'
  | 'performance_regression'
  | 'lint_type_security_blocker';

export interface FailureSignals {
  taskId: string;
  gate?: string;
  errorText?: string;
  coverageDelta?: number;
  coverageTarget?: number;
  integrity?: {
    placeholdersFound: string[];
    skippedTestsFound: string[];
    noOpSuspicion: string[];
  };
  logs?: string[];
}

export interface ResolutionCeiling {
  label: BlockerLabel;
  attempts: number;
}

interface BlockerProfile {
  label: BlockerLabel;
  ceiling: number;
  requiresThinker: boolean;
  shouldSpike: boolean;
  evidence: string;
}

const BLOCKER_PROFILES: Record<BlockerLabel, BlockerProfile> = {
  missing_dependency: {
    label: 'missing_dependency',
    ceiling: 2,
    requiresThinker: false,
    shouldSpike: false,
    evidence: 'Show dependency install logs and passing CI snippet.',
  },
  flaky_test: {
    label: 'flaky_test',
    ceiling: 3,
    requiresThinker: false,
    shouldSpike: false,
    evidence: 'Attach flaky detector output and stabilized test logs.',
  },
  underspecified_requirements: {
    label: 'underspecified_requirements',
    ceiling: 2,
    requiresThinker: true,
    shouldSpike: true,
    evidence: 'Add acceptance tests/spec updates proving new requirements.',
  },
  external_secret_or_credential: {
    label: 'external_secret_or_credential',
    ceiling: 1,
    requiresThinker: false,
    shouldSpike: false,
    evidence: 'Link stub provider + policy.require_human for real secrets.',
  },
  integration_contract_break: {
    label: 'integration_contract_break',
    ceiling: 2,
    requiresThinker: true,
    shouldSpike: true,
    evidence: 'Record contract tests and updated adapter schema.',
  },
  non_determinism: {
    label: 'non_determinism',
    ceiling: 2,
    requiresThinker: false,
    shouldSpike: false,
    evidence: 'Provide deterministic seed strategy and repeated runs.',
  },
  performance_regression: {
    label: 'performance_regression',
    ceiling: 2,
    requiresThinker: false,
    shouldSpike: false,
    evidence: 'Attach before/after perf metrics hitting budget.',
  },
  lint_type_security_blocker: {
    label: 'lint_type_security_blocker',
    ceiling: 2,
    requiresThinker: false,
    shouldSpike: false,
    evidence: 'Show lint/security scan outputs before/after fix.',
  },
};

const SECRET_HINTS = ['secret', 'credential', 'token', 'api key', 'apikey', 'auth', 'permission denied'];
const CONTRACT_HINTS = ['contract', 'schema mismatch', 'adapter failure', 'grpc', 'rest', 'integration'];
const FLAKY_HINTS = ['flaky', 'retry', 'timeout', 'race condition'];
const PERF_HINTS = ['slow', 'timeout', 'perf', 'latency', 'mem', 'cpu'];
const LINT_SECURITY_HINTS = ['lint', 'eslint', 'ruff', 'security', 'bandit', 'semgrep'];
const DEP_HINTS = ['module not found', 'cannot import', 'missing dependency', 'npm install', 'pip install'];
const NON_DETERMINISM_HINTS = ['non-deterministic', 'random', 'seed', 'order-dependent'];

export function classifyBlocker(signals: FailureSignals): BlockerLabel {
  const haystack = buildHaystack(signals);
  const coverageTarget = signals.coverageTarget ?? 0.8;
  const coverageLagging = signals.coverageDelta == null || signals.coverageDelta < coverageTarget;
  const integrity = signals.integrity ?? {
    placeholdersFound: [],
    skippedTestsFound: [],
    noOpSuspicion: [],
  };

  if (
    containsAny(haystack, SECRET_HINTS) ||
    integrity.noOpSuspicion.includes('config_only_with_tests_changed')
  ) {
    return 'external_secret_or_credential';
  }
  if (containsAny(haystack, CONTRACT_HINTS)) {
    return 'integration_contract_break';
  }
  if (containsAny(haystack, FLAKY_HINTS) || integrity.skippedTestsFound.length > 0) {
    return 'flaky_test';
  }
  if (containsAny(haystack, PERF_HINTS)) {
    return 'performance_regression';
  }
  if (
    containsAny(haystack, LINT_SECURITY_HINTS) ||
    signals.gate === 'security.scan' ||
    signals.gate === 'lint.run' ||
    signals.gate === 'license.check'
  ) {
    return 'lint_type_security_blocker';
  }
  if (containsAny(haystack, NON_DETERMINISM_HINTS)) {
    return 'non_determinism';
  }
  if (coverageLagging && integrity.placeholdersFound.length > 0) {
    return 'underspecified_requirements';
  }
  if (containsAny(haystack, DEP_HINTS)) {
    return 'missing_dependency';
  }
  if (coverageLagging) {
    return 'underspecified_requirements';
  }
  return 'missing_dependency';
}

export function getResolutionCeiling(label: BlockerLabel): ResolutionCeiling {
  const profile = getBlockerProfile(label);
  return {
    label,
    attempts: profile.ceiling,
  };
}

export function requiresThinker(label: BlockerLabel): boolean {
  return getBlockerProfile(label).requiresThinker;
}

export function shouldSpike(label: BlockerLabel): boolean {
  return getBlockerProfile(label).shouldSpike;
}

export function describeEvidenceExpectation(label: BlockerLabel): string {
  return getBlockerProfile(label).evidence;
}

export function blockerLabelToSlug(label: BlockerLabel): string {
  return label.replace(/_/g, '-');
}

export function deriveSpikeBranch(taskId: string, label: BlockerLabel): string {
  const slug = `${taskId}-${blockerLabelToSlug(label)}`.toLowerCase();
  const safeSlug = slug.replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-').replace(/^-|-$/g, '');
  return path.posix.join('spikes', safeSlug || taskId.toLowerCase());
}

function buildHaystack(signals: FailureSignals): string {
  const parts = [
    signals.gate ?? '',
    signals.errorText ?? '',
    ...(signals.logs ?? []),
    ...(signals.integrity?.placeholdersFound ?? []),
    ...(signals.integrity?.skippedTestsFound ?? []),
    ...(signals.integrity?.noOpSuspicion ?? []),
  ];
  return parts.join(' ').toLowerCase();
}

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export function logBlocker(label: BlockerLabel, signals: FailureSignals): void {
  logWarning('Resolution taxonomy classified blocker', {
    taskId: signals.taskId,
    label,
    gate: signals.gate,
  });
}

export function getBlockerProfile(label: BlockerLabel): BlockerProfile {
  return BLOCKER_PROFILES[label];
}
