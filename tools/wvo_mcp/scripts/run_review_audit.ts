#!/usr/bin/env node
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { execa } from 'execa';

interface AuditOptions {
  workspaceRoot: string;
  outputPath: string;
  quiet: boolean;
}

type Severity = 'high' | 'medium' | 'informational';

interface CheckResult {
  name: string;
  command: string;
  severity: Severity;
  status: 'passed' | 'failed';
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
}

interface AuditReport {
  runId: string;
  timestamp: string;
  workspaceRoot: string;
  results: CheckResult[];
}

interface CheckDefinition {
  name: string;
  severity: Severity;
  run: (opts: AuditOptions) => Promise<CheckResult>;
}

function parseArgs(): AuditOptions {
  const args = process.argv.slice(2);
  let workspaceRoot = process.cwd();
  let outputPath = path.join(workspaceRoot, 'state', 'automation', 'audit_report.json');
  let quiet = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--workspace-root':
      case '--workspace':
        workspaceRoot = path.resolve(args[i + 1] ?? workspaceRoot);
        i += 1;
        break;
      case '--output':
        outputPath = path.resolve(args[i + 1] ?? outputPath);
        i += 1;
        break;
      case '--quiet':
        quiet = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        break;
    }
  }

  return { workspaceRoot, outputPath, quiet };
}

function printHelp(): void {
  console.log(`Usage: node tools/wvo_mcp/scripts/run_review_audit.ts [options]\n\nOptions:\n  --workspace-root <path>   Workspace root (default: cwd)\n  --output <path>           Output report path (default: state/automation/audit_report.json)\n  --quiet                   Suppress per-check console output\n`);
}

async function runCommand(
  cwd: string,
  cmd: string[],
  severity: Severity,
  quiet: boolean,
  prettyName?: string,
): Promise<CheckResult> {
  const start = Date.now();
  const commandString = cmd.join(' ');
  try {
    const { stdout, stderr, exitCode } = await execa(cmd[0]!, cmd.slice(1), { cwd });
    if (!quiet) {
      console.log(`[audit] ${prettyName ?? commandString} → exit ${exitCode}`);
    }
    return {
      name: prettyName ?? commandString,
      command: commandString,
      severity,
      status: exitCode === 0 ? 'passed' : 'failed',
      exitCode,
      durationMs: Date.now() - start,
      stdout,
      stderr,
    };
  } catch (error) {
    const ex = error as { stdout?: string; stderr?: string; shortMessage?: string; exitCode?: number };
    if (!quiet) {
      console.warn(`[audit] ${prettyName ?? commandString} FAILED`);
      if (ex.shortMessage) console.warn(ex.shortMessage);
    }
    return {
      name: prettyName ?? commandString,
      command: commandString,
      severity,
      status: 'failed',
      exitCode: ex.exitCode ?? 1,
      durationMs: Date.now() - start,
      stdout: ex.stdout ?? '',
      stderr: ex.stderr ?? (ex.shortMessage ?? ''),
    };
  }
}

async function precisionGateCheck(opts: AuditOptions, severity: Severity): Promise<CheckResult> {
  const start = Date.now();
  const tmpRoot = await mkdtemp(path.join(tmpdir(), 'quality-precision-'));
  const precisionWorkspace = path.join(tmpRoot, 'workspace');
  await mkdir(path.join(precisionWorkspace, 'state', 'quality_graph'), { recursive: true });
  await mkdir(path.join(precisionWorkspace, 'state', 'automation'), { recursive: true });

  const vectorsSrc = path.join(opts.workspaceRoot, 'tools', 'wvo_mcp', 'src', 'quality_graph', '__fixtures__', 'precision', 'vectors.jsonl');
  await execa('cp', [vectorsSrc, path.join(precisionWorkspace, 'state', 'quality_graph', 'task_vectors.jsonl')]);

  const datasetPath = path.join(opts.workspaceRoot, 'tools', 'wvo_mcp', 'src', 'quality_graph', '__fixtures__', 'precision', 'dataset.json');
  const command = [
    'npx',
    '--yes',
    'tsx',
    'tools/wvo_mcp/scripts/check_quality_graph_precision.ts',
    '--workspace-root',
    precisionWorkspace,
    '--dataset',
    datasetPath,
    '--report',
    path.join(precisionWorkspace, 'state', 'automation', 'quality_graph_precision_report.json'),
    '--quiet',
  ];

  const result = await runCommand(opts.workspaceRoot, command, severity, opts.quiet, 'quality_graph_precision');
  result.durationMs = Date.now() - start;
  return result;
}

export async function runChecks(opts: AuditOptions): Promise<AuditReport> {
  const checks: CheckDefinition[] = [
    {
      name: 'delta_notes',
      severity: 'high',
      run: (runOpts) =>
        runCommand(runOpts.workspaceRoot, ['node', 'tools/wvo_mcp/scripts/check_delta_notes.ts'], 'high', runOpts.quiet, 'delta_notes'),
    },
    {
      name: 'follow_up_classifier',
      severity: 'high',
      run: (runOpts) =>
        runCommand(
          runOpts.workspaceRoot,
          ['node', 'tools/wvo_mcp/scripts/classify_follow_ups.ts', '--enforce'],
          'high',
          runOpts.quiet,
          'follow_up_classifier',
        ),
    },
    {
      name: 'precision_gate',
      severity: 'high',
      run: (runOpts) => precisionGateCheck(runOpts, 'high'),
    },
    {
      name: 'determinism_check',
      severity: 'high',
      run: (runOpts) =>
        runCommand(
          runOpts.workspaceRoot,
          ['node', 'tools/wvo_mcp/scripts/check_determinism.ts', '--output', path.join('state', 'automation', 'determinism_check.audit.json')],
          'high',
          runOpts.quiet,
          'determinism_check',
        ),
    },
    {
      name: 'structural_policy',
      severity: 'medium',
     run: (runOpts) =>
        runCommand(
          runOpts.workspaceRoot,
          [
            'node',
            'tools/wvo_mcp/scripts/check_structural_policy.ts',
            '--allowlist',
            path.join('tools', 'wvo_mcp', 'config', 'structural_policy_allowlist.json'),
            '--output',
            path.join('state', 'automation', 'structural_policy.audit.json'),
          ],
          'medium',
          runOpts.quiet,
          'structural_policy',
        ),
   },
    {
      name: 'roadmap_validation',
      severity: 'high',
      run: (runOpts) => runCommand(runOpts.workspaceRoot, ['npm', 'run', 'validate:roadmap'], 'high', runOpts.quiet, 'validate:roadmap'),
    },
    {
      name: 'roadmap_evidence_validation',
      severity: 'high',
      run: (runOpts) =>
        runCommand(
          runOpts.workspaceRoot,
          ['npm', 'run', 'validate:roadmap-evidence', '--', '--json'],
          'high',
          runOpts.quiet,
          'validate:roadmap-evidence',
        ),
    },
  ];

  const results: CheckResult[] = [];
  for (const check of checks) {
    const result = await check.run(opts);
    results.push(result);
  }

  const report: AuditReport = {
    runId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    workspaceRoot: opts.workspaceRoot,
    results,
  };

  return report;
}

async function ensureDir(filepath: string): Promise<void> {
  const dir = path.dirname(filepath);
  await mkdir(dir, { recursive: true });
}

async function main() {
  const opts = parseArgs();
  try {
    const report = await runChecks(opts);
    await ensureDir(opts.outputPath);
    await writeFile(opts.outputPath, JSON.stringify(report, null, 2));

    const hasFailure = report.results.some(
      (result) => result.severity === 'high' && result.status === 'failed',
    );

    if (!opts.quiet) {
      console.log(`Audit completed. Report written to ${opts.outputPath}`);
      report.results.forEach((result) => {
        console.log(` - ${result.name}: ${result.status} (severity=${result.severity})`);
      });
    }

    if (hasFailure) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Audit runner failed:', error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
