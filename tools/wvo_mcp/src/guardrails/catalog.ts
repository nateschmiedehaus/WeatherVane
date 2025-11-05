import { execSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import yaml from 'yaml';
import { ALLOWED_COMMANDS } from '../executor/guardrails.js';
import { assertLedgerCompleteness, type LedgerEntry } from '../work_process/index.js';

export type GuardrailStatus = 'pass' | 'warn' | 'fail';

export interface GuardrailResult {
  id: string;
  suite: string;
  summary: string;
  enforcement: 'audit' | 'block';
  severity: 'info' | 'warn' | 'critical';
  evidence?: string;
  status: GuardrailStatus;
  details?: string;
}

type CatalogEntry = {
  id: string;
  suite: string;
  summary: string;
  enforcement: 'audit' | 'block';
  severity: 'info' | 'warn' | 'critical';
  evidence?: string;
  check: string;
};

type CheckFn = (workspaceRoot: string) => Promise<GuardrailStatus | [GuardrailStatus, string?]> | GuardrailStatus | [GuardrailStatus, string?];

const DEFAULT_SUITE = 'baseline';
const CATALOG_PATH = path.join('meta', 'afp_scas_guardrails.yaml');

export async function evaluateGuardrails(
  workspaceRoot: string,
  options: { suite?: string; overrides?: Record<string, CheckFn> } = {},
): Promise<GuardrailResult[]> {
  const suite = options.suite ?? DEFAULT_SUITE;
  const overrides = options.overrides ?? {};
  const entries = (await readEntries(workspaceRoot)).filter((entry) => entry.suite === suite);
  const results: GuardrailResult[] = [];
  for (const entry of entries) {
    const runner = overrides[entry.check] ?? BUILTIN_CHECKS[entry.check];
    if (!runner) {
      throw new Error(`Unknown guardrail check ${entry.check}`);
    }
    try {
      const outcome = await runner(workspaceRoot);
      const [status, details] = Array.isArray(outcome) ? outcome : [outcome];
      results.push({ ...entry, status, details });
    } catch (error) {
      results.push({ ...entry, status: 'fail', details: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

export async function loadGuardrailCatalog(workspaceRoot: string): Promise<CatalogEntry[]> {
  return readEntries(workspaceRoot);
}

async function readEntries(workspaceRoot: string): Promise<CatalogEntry[]> {
  const file = path.join(workspaceRoot, CATALOG_PATH);
  const raw = yaml.parse(await fs.readFile(file, 'utf8')) as { guardrails?: Array<any> };
  if (!raw?.guardrails?.length) {
    throw new Error(`Guardrail catalog ${file} must list guardrails.`);
  }
  const seen = new Set<string>();
  return raw.guardrails.map((entry, index) => {
    const id = typeof entry?.id === 'string' ? entry.id : undefined;
    if (!id) {
      throw new Error(`Guardrail entry ${index} missing id.`);
    }
    if (seen.has(id)) {
      throw new Error(`Duplicate guardrail id ${id}.`);
    }
    seen.add(id);
    const checkName = entry?.check?.name;
    if (entry?.check?.kind !== 'builtin' || typeof checkName !== 'string') {
      throw new Error(`Guardrail ${id} must specify builtin check.`);
    }
    return {
      id,
      suite: typeof entry?.suite === 'string' ? entry.suite : DEFAULT_SUITE,
      summary: typeof entry?.summary === 'string' ? entry.summary : id,
      enforcement: entry?.enforcement === 'block' ? 'block' : 'audit',
      severity: entry?.severity === 'critical' || entry?.severity === 'info' ? entry.severity : 'warn',
      evidence: typeof entry?.evidence === 'string' ? entry.evidence : undefined,
      check: checkName,
    } satisfies CatalogEntry;
  });
}

const BUILTIN_CHECKS: Record<string, CheckFn> = {
  worktree_clean: (workspaceRoot) => {
    try {
      const output = execSync('git status --porcelain', {
        cwd: workspaceRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      return output ? ['fail', output] : 'pass';
    } catch (error) {
      return ['fail', error instanceof Error ? error.message : String(error)];
    }
  },
  command_allowlist_snapshot: () => {
    if (ALLOWED_COMMANDS.length < 10) {
      return ['fail', 'allowlist suspiciously small'];
    }
    return new Set(ALLOWED_COMMANDS).size === ALLOWED_COMMANDS.length ? 'pass' : ['warn', 'duplicates detected'];
  },
  ledger_integrity: async (workspaceRoot) => {
    const ledgerPath = path.join(workspaceRoot, 'state', 'logs', 'work_process.jsonl');
    try {
      await fs.access(ledgerPath, fsConstants.R_OK);
    } catch {
      return ['warn', 'ledger missing'];
    }
    try {
      const entries: LedgerEntry[] = (await fs.readFile(ledgerPath, 'utf8'))
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as LedgerEntry);
      if (entries.length === 0) {
        return ['warn', 'ledger empty'];
      }
      assertLedgerCompleteness(entries);
      return 'pass';
    } catch (error) {
      return ['fail', error instanceof Error ? error.message : String(error)];
    }
  },
  policy_state_paths: async (workspaceRoot) => {
    const missing: string[] = [];
    for (const dir of [path.join(workspaceRoot, 'state', 'policy'), path.join(workspaceRoot, 'state', 'analytics')]) {
      try {
        await fs.access(dir, fsConstants.W_OK);
      } catch {
        missing.push(dir);
      }
    }
    return missing.length === 0 ? 'pass' : ['warn', missing.join(', ')];
  },
};
