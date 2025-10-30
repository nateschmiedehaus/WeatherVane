import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

interface CliOptions {
  outputPath?: string;
  workspaceRoot: string;
  smokeSeed: number;
  smokeTimeout: number;
  taskId?: string;
}

interface CheckResult {
  name: string;
  status: 'passed' | 'failed';
  details?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    workspaceRoot: process.cwd(),
    smokeSeed: 20250429,
    smokeTimeout: 25,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output' && index + 1 < argv.length) {
      options.outputPath = argv[++index];
    } else if (arg.startsWith('--output=')) {
      options.outputPath = arg.split('=')[1];
    } else if (arg === '--workspace' && index + 1 < argv.length) {
      options.workspaceRoot = path.resolve(argv[++index]);
    } else if (arg.startsWith('--workspace=')) {
      options.workspaceRoot = path.resolve(arg.split('=')[1] ?? '');
    } else if (arg === '--seed' && index + 1 < argv.length) {
      options.smokeSeed = Number.parseInt(argv[++index] ?? '', 10);
    } else if (arg.startsWith('--seed=')) {
      options.smokeSeed = Number.parseInt(arg.split('=')[1] ?? '', 10);
    } else if (arg === '--timeout-ms' && index + 1 < argv.length) {
      options.smokeTimeout = Number.parseInt(argv[++index] ?? '', 10);
    } else if (arg.startsWith('--timeout-ms=')) {
      options.smokeTimeout = Number.parseInt(arg.split('=')[1] ?? '', 10);
    } else if (arg === '--task' && index + 1 < argv.length) {
      options.taskId = argv[++index];
    } else if (arg.startsWith('--task=')) {
      options.taskId = arg.split('=')[1];
    } else if (arg === '--help') {
      console.log(
        [
          'Usage: node tools/wvo_mcp/scripts/check_determinism.ts [options]',
          '',
          'Options:',
          '  --output <path>       Write JSON report to path (default: state/automation/determinism_check.json)',
          '  --workspace <path>    Repository root (default: process.cwd())',
          '  --seed <number>       Seed for tracing smoke determinism check (default: 20250429)',
          '  --timeout-ms <number> Timeout override for tracing smoke (default: 25)',
          '  --task <TASK-ID>      Optional task identifier to embed in report metadata',
        ].join('\n'),
      );
      process.exit(0);
    }
  }

  if (!Number.isFinite(options.smokeSeed)) {
    options.smokeSeed = 20250429;
  }
  if (!Number.isFinite(options.smokeTimeout) || options.smokeTimeout <= 0) {
    options.smokeTimeout = 25;
  }

  return options;
}

function runNodeCommand(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile('node', args, { cwd, env: process.env }, (error, stdout, stderr) => {
      if (error) {
        const wrapped = new Error(`Command failed: node ${args.join(' ')}\n${stderr || error.message}`);
        (wrapped as Error & { stdout?: string; stderr?: string }).stdout = stdout;
        (wrapped as Error & { stdout?: string; stderr?: string }).stderr = stderr;
        reject(wrapped);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function parseJsonLines(filePath: string): Promise<Array<Record<string, any>>> {
  const content = await fs.readFile(filePath, 'utf-8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function checkTestImports(workspaceRoot: string): Promise<CheckResult> {
  const filesToCheck = [
    'tools/wvo_mcp/src/orchestrator/__tests__/work_process_acceptance.test.ts',
    'tools/wvo_mcp/src/orchestrator/__tests__/observer_agent.test.ts',
    'tools/wvo_mcp/src/tests/tool_router_phase_guard.test.ts',
  ];

  const missing: string[] = [];

  for (const relativePath of filesToCheck) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    const content = await fs.readFile(absolutePath, 'utf-8');
    if (!content.includes('applyDeterminism')) {
      missing.push(relativePath);
    }
  }

  if (missing.length > 0) {
    return {
      name: 'test_helper_imports',
      status: 'failed',
      details: `applyDeterminism missing in: ${missing.join(', ')}`,
    };
  }

  return { name: 'test_helper_imports', status: 'passed' };
}

async function checkTracingSmokeDeterminism(
  workspaceRoot: string,
  seed: number,
  timeoutMs: number,
): Promise<CheckResult> {
  const tempWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), 'determinism-smoke-'));
  const tracingScript = path.join(workspaceRoot, 'tools/wvo_mcp/scripts/tracing_smoke.mjs');

  try {
    const args = [
      tracingScript,
      `--seed`,
      String(seed),
      `--timeout-ms`,
      String(timeoutMs),
      tempWorkspace,
    ];
    await runNodeCommand(args, workspaceRoot);
    const firstCounters = await parseJsonLines(path.join(tempWorkspace, 'state', 'telemetry', 'counters.jsonl'));
    const firstTraces = await parseJsonLines(path.join(tempWorkspace, 'state', 'telemetry', 'traces.jsonl'));
    const counterSummary = (records: Array<Record<string, any>>) =>
      records
        .map((record) => `${record.counter}:${record.value}`)
        .sort()
        .join('|');
    const spanSummary = (records: Array<Record<string, any>>) =>
      records
        .map((record) => record.name ?? record.eventName ?? '')
        .join('|');
    const firstCounterSummary = counterSummary(firstCounters);
    const firstSpanSummary = spanSummary(firstTraces);

    await fs.rm(path.join(tempWorkspace, 'state'), { recursive: true, force: true });

    await runNodeCommand(args, workspaceRoot);
    const secondCounters = await parseJsonLines(path.join(tempWorkspace, 'state', 'telemetry', 'counters.jsonl'));
    const secondTraces = await parseJsonLines(path.join(tempWorkspace, 'state', 'telemetry', 'traces.jsonl'));
    const secondCounterSummary = counterSummary(secondCounters);
    const secondSpanSummary = spanSummary(secondTraces);

    const determinsticMatch =
      firstCounterSummary === secondCounterSummary && firstSpanSummary === secondSpanSummary;

    if (!determinsticMatch) {
      return {
        name: 'tracing_smoke_determinism',
        status: 'failed',
        details: `Counters or trace span ordering not deterministic for seed=${seed}, timeout=${timeoutMs}`,
      };
    }

    return { name: 'tracing_smoke_determinism', status: 'passed' };
  } catch (error) {
    return {
      name: 'tracing_smoke_determinism',
      status: 'failed',
      details: (error as Error).message,
    };
  } finally {
    await fs.rm(tempWorkspace, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const checks: CheckResult[] = [];

  checks.push(await checkTestImports(options.workspaceRoot));
  checks.push(await checkTracingSmokeDeterminism(options.workspaceRoot, options.smokeSeed, options.smokeTimeout));

  const allPassed = checks.every((check) => check.status === 'passed');
  const output = {
    timestamp: new Date().toISOString(),
    status: allPassed ? 'passed' : 'failed',
    taskId: options.taskId,
    checks,
  };

  const outputPath =
    options.outputPath ??
    path.join(options.workspaceRoot, 'state', 'automation', 'determinism_check.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));

  if (!allPassed) {
    console.error('Determinism check failed');
    process.exitCode = 1;
  } else {
    console.log(`Determinism check passed (report: ${outputPath})`);
  }
}

main().catch((error) => {
  console.error('Determinism check failed with error:', error);
  process.exitCode = 1;
});
