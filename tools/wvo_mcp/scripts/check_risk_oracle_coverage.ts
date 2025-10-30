import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { RiskOracleMap, RiskOracleEntry } from '../src/automation/risk_oracle_schema.js';

interface CoverageOptions {
  workspaceRoot: string;
  taskId?: string;
  mapPath?: string;
  evidencePaths?: Record<string, string>;
  outputPath?: string;
  baseRef?: string;
}

interface CoverageReport {
  timestamp: string;
  status: 'passed' | 'failed';
  taskId?: string;
  summary: {
    totalRisks: number;
    covered: number;
    missing: number;
    warnings: number;
  };
  missing: Array<{
    risk_id: string;
    oracle: string | string[];
    reason: string;
  }>;
  warnings: Array<{ risk_id: string; message: string }>;
  info?: Record<string, unknown>;
}

const DEFAULT_MAP_PATH = (taskId?: string) =>
  taskId ? `state/evidence/${taskId}/think/risk_oracle_map.json` : undefined;
const DEFAULT_OUTPUT_PATH = (taskId?: string) =>
  taskId ? `state/evidence/${taskId}/verify/oracle_coverage.json` : 'state/automation/oracle_coverage.json';

function parseArgs(argv: string[]): CoverageOptions {
  const options: CoverageOptions = {
    workspaceRoot: process.cwd(),
    evidencePaths: {},
  };
  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx];
    if (arg === '--workspace' && idx + 1 < argv.length) {
      options.workspaceRoot = path.resolve(argv[++idx]);
    } else if (arg.startsWith('--workspace=')) {
      options.workspaceRoot = path.resolve(arg.split('=')[1] ?? '');
    } else if (arg === '--task' && idx + 1 < argv.length) {
      options.taskId = argv[++idx];
    } else if (arg.startsWith('--task=')) {
      options.taskId = arg.split('=')[1];
    } else if (arg === '--map' && idx + 1 < argv.length) {
      options.mapPath = argv[++idx];
    } else if (arg.startsWith('--map=')) {
      options.mapPath = arg.split('=')[1];
    } else if (arg === '--output' && idx + 1 < argv.length) {
      options.outputPath = argv[++idx];
    } else if (arg.startsWith('--output=')) {
      options.outputPath = arg.split('=')[1];
    } else if (arg === '--base-ref' && idx + 1 < argv.length) {
      options.baseRef = argv[++idx];
    } else if (arg.startsWith('--base-ref=')) {
      options.baseRef = arg.split('=')[1];
    } else if (arg === '--help') {
      console.log(`Usage: node tools/wvo_mcp/scripts/check_risk_oracle_coverage.ts [options]

Options:
  --workspace <path>   Workspace root (default: cwd)
  --task <TASK-ID>     Task identifier to locate risk map/evidence
  --map <path>         Override risk map path
  --output <path>      Path to write coverage report JSON
  --base-ref <ref>     Optional git base for changed file discovery
`);
      process.exit(0);
    }
  }
  return options;
}

async function readJson<T>(workspaceRoot: string, relativePath: string): Promise<T> {
  const absolute = path.join(workspaceRoot, relativePath);
  const content = await fs.readFile(absolute, 'utf-8');
  return JSON.parse(content) as T;
}

function isRiskOracleEntry(value: unknown): value is RiskOracleEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as RiskOracleEntry;
  const oracles = entry.oracle;
  const oracleValid =
    typeof oracles === 'string' || (Array.isArray(oracles) && oracles.every((item) => typeof item === 'string'));
  return (
    typeof entry.risk_id === 'string' &&
    entry.risk_id.length > 0 &&
    typeof entry.description === 'string' &&
    entry.description.length > 0 &&
    oracleValid &&
    typeof entry.phase === 'string'
  );
}

function isRiskOracleMapLocal(value: unknown): value is RiskOracleMap {
  if (!value || typeof value !== 'object') return false;
  const map = value as RiskOracleMap;
  if (!Array.isArray(map.risks)) return false;
  return map.risks.every((entry) => isRiskOracleEntry(entry));
}

async function loadRiskMap(workspaceRoot: string, mapPath?: string, taskId?: string): Promise<RiskOracleMap> {
  const resolved = mapPath ?? DEFAULT_MAP_PATH(taskId);
  if (!resolved) {
    throw new Error('Risk map path not provided (use --map or --task).');
  }
  const map = await readJson<RiskOracleMap>(workspaceRoot, resolved);
  if (!isRiskOracleMapLocal(map)) {
    throw new Error(`Invalid risk map schema: ${resolved}`);
  }
  return map;
}

function gatherEvidencePaths(workspaceRoot: string, taskId?: string): Record<string, string> {
  const baseDir = taskId ? path.join('state/evidence', taskId, 'verify') : 'state/automation';
  return {
    tests: path.join(baseDir, 'test_results.json'),
    determinism: path.join(baseDir, 'determinism_check.json'),
    structural: path.join(baseDir, 'structural_policy_report.json'),
    oracleCoverage: path.join(baseDir, 'oracle_coverage.json'),
  };
}

async function fileExists(workspaceRoot: string, relativePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(workspaceRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function mapOraclesToEvidence(workspaceRoot: string, risk: RiskOracleEntry, evidencePaths: Record<string, string>) {
  const oracles = Array.isArray(risk.oracle) ? risk.oracle : [risk.oracle];
  const missing: string[] = [];
  for (const oracle of oracles) {
    const key = oracleKey(oracle);
    const pathMatch = evidencePaths[key];
    if (!pathMatch) {
      missing.push(`No evidence mapping for oracle ${oracle}`);
      continue;
    }
    const exists = await fileExists(workspaceRoot, pathMatch);
    if (!exists) {
      missing.push(`Evidence file missing: ${pathMatch}`);
    }
  }
  return missing;
}

function oracleKey(oracle: string): string {
  switch (oracle) {
    case 'tests':
      return 'tests';
    case 'determinism_check':
      return 'determinism';
    case 'structural_policy':
      return 'structural';
    default:
      return oracle;
  }
}

export async function evaluateCoverage(options: CoverageOptions): Promise<CoverageReport> {
  const map = await loadRiskMap(options.workspaceRoot, options.mapPath, options.taskId);
  const evidencePaths = { ...gatherEvidencePaths(options.workspaceRoot, options.taskId), ...(options.evidencePaths ?? {}) };

  const missing: CoverageReport['missing'] = [];
  const warnings: CoverageReport['warnings'] = [];

  if (map.risks.length === 0) {
    warnings.push({ risk_id: 'none', message: 'Risk map is empty; verify that THINK artifacts justify absence.' });
  }

  for (const entry of map.risks) {
    const unresolved = await mapOraclesToEvidence(options.workspaceRoot, entry, evidencePaths);
    if (unresolved.length > 0) {
      missing.push({
        risk_id: entry.risk_id,
        oracle: entry.oracle,
        reason: unresolved.join('; '),
      });
    }
  }

  const status: 'passed' | 'failed' = missing.length === 0 ? 'passed' : 'failed';
  return {
    timestamp: new Date().toISOString(),
    status,
    taskId: options.taskId,
    summary: {
      totalRisks: map.risks.length,
      covered: map.risks.length - missing.length,
      missing: missing.length,
      warnings: warnings.length,
    },
    missing,
    warnings,
  };
}

async function writeReport(report: CoverageReport, workspaceRoot: string, outputPath?: string) {
  const defaultTarget = DEFAULT_OUTPUT_PATH(report.taskId);
  const target = path.join(workspaceRoot, outputPath ?? defaultTarget);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(report, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await evaluateCoverage({
    workspaceRoot: options.workspaceRoot,
    taskId: options.taskId,
    mapPath: options.mapPath,
    evidencePaths: options.evidencePaths,
    outputPath: options.outputPath,
    baseRef: options.baseRef,
  });

  await writeReport(report, options.workspaceRoot, options.outputPath);

  if (report.status === 'failed') {
    console.error('Risk→oracle coverage gaps detected');
    report.missing.forEach((item) => {
      console.error(`- ${item.risk_id}: ${item.reason}`);
    });
    process.exitCode = 1;
  } else {
    console.log('Risk→oracle coverage check passed');
  }
}

const modulePath = fileURLToPath(import.meta.url);
if (modulePath === path.resolve(process.argv[1] ?? '')) {
  main().catch((error) => {
    console.error('Risk→oracle coverage check failed with error:', error);
    process.exitCode = 1;
  });
}
