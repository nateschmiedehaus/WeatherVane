export type ScopeClass = 'Tiny' | 'Small' | 'Medium' | 'Large';

export interface ScopeSignal {
  filesTouched: number;
  approxChangedLines: number;
}

export interface TokenBudget {
  planner: number;
  thinker: number;
  implementer: number;
  verifier: number;
  reviewer: number;
  critical: number;
  supervisor: number;
}

const SCOPE_THRESHOLDS: Array<{ limit: number; scope: ScopeClass }> = [
  { limit: 2, scope: 'Tiny' },
  { limit: 6, scope: 'Small' },
  { limit: 12, scope: 'Medium' },
];

const BASE_BUDGETS: Record<ScopeClass, TokenBudget> = {
  Tiny: { planner: 900, thinker: 600, implementer: 700, verifier: 500, reviewer: 500, critical: 400, supervisor: 400 },
  Small: { planner: 1500, thinker: 900, implementer: 1200, verifier: 800, reviewer: 800, critical: 600, supervisor: 600 },
  Medium: { planner: 2500, thinker: 1500, implementer: 2000, verifier: 1400, reviewer: 1200, critical: 1000, supervisor: 900 },
  Large: { planner: 4000, thinker: 2500, implementer: 3200, verifier: 2000, reviewer: 1800, critical: 1500, supervisor: 1500 },
};

const CAPABILITY_MULTIPLIER: Record<string, number> = {
  fast_code: 0.8,
  reasoning_high: 1.0,
  reasoning_ultra: 1.2,
  long_context: 1.4,
  cheap_batch: 0.7,
};

export function classifyScope(signal: ScopeSignal): ScopeClass {
  for (const { limit, scope } of SCOPE_THRESHOLDS) {
    if (signal.filesTouched <= limit && signal.approxChangedLines <= limit * 60) {
      return scope;
    }
  }
  return 'Large';
}

export function deriveBudget(scope: ScopeClass, capability: string): number {
  const multiplier = CAPABILITY_MULTIPLIER[capability] ?? 1.0;
  switch (capability) {
    case 'fast_code':
      return Math.round(BASE_BUDGETS[scope].implementer * multiplier);
    case 'reasoning_high':
      return Math.round(BASE_BUDGETS[scope].planner * multiplier);
    case 'reasoning_ultra':
      return Math.round(BASE_BUDGETS[scope].thinker * multiplier);
    case 'long_context':
      return Math.round(BASE_BUDGETS[scope].planner * multiplier);
    case 'cheap_batch':
      return Math.round(BASE_BUDGETS[scope].critical * multiplier);
    default:
      return Math.round(BASE_BUDGETS[scope].planner);
  }
}

export function getRoleBudget(scope: ScopeClass, role: keyof TokenBudget): number {
  return BASE_BUDGETS[scope][role];
}
