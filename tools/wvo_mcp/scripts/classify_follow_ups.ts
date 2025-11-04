import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  FollowUpRegistryEntry,
} from '../src/automation/follow_up_classifier.js';
import type {
  IngestResult,
} from '../src/automation/auto_follow_up_ingestor.js';

export interface ClassifyFollowUpsOptions {
  workspaceRoot: string;
  enforce?: boolean;
  now?: Date;
}

export interface ClassifyFollowUpsResult {
  registryPath: string;
  reportPath: string;
  tasksPath: string;
  pending: FollowUpRegistryEntry[];
  invalid: Array<{ entry: FollowUpRegistryEntry; reason: string }>;
  autoTaskCount: number;
  ingestCreated: number;
  ingestSkipped: number;
  missingTaskIds: FollowUpRegistryEntry[];
  mode: 'enforce' | 'report';
}

type ClassifierModule = typeof import('../src/automation/follow_up_classifier.js');
type IngestorModule = typeof import('../src/automation/auto_follow_up_ingestor.js');

let classifierModulePromise: Promise<ClassifierModule> | null = null;
let ingestorModulePromise: Promise<IngestorModule> | null = null;

function resolveModuleUrl(relative: string): string {
  const current = new URL(import.meta.url);
  const isDist = current.pathname.includes('/dist/scripts/');
  const base = isDist ? `../src/${relative}` : `../dist/src/${relative}`;
  return new URL(base, import.meta.url).href;
}

async function loadClassifierModule(): Promise<ClassifierModule> {
  if (!classifierModulePromise) {
    const url = resolveModuleUrl('automation/follow_up_classifier.js');
    classifierModulePromise = import(url) as Promise<ClassifierModule>;
  }
  return classifierModulePromise;
}

async function loadIngestorModule(): Promise<IngestorModule> {
  if (!ingestorModulePromise) {
    const url = resolveModuleUrl('automation/auto_follow_up_ingestor.js');
    ingestorModulePromise = import(url) as Promise<IngestorModule>;
  }
  return ingestorModulePromise;
}

export async function runClassifyFollowUps({
  workspaceRoot,
  enforce = false,
  now = new Date(),
}: ClassifyFollowUpsOptions): Promise<ClassifyFollowUpsResult> {
  const mode: 'enforce' | 'report' = enforce ? 'enforce' : 'report';
  const classifier = await loadClassifierModule();
  const { gatherFollowUps, loadRegistry, reconcileFollowUps, writeRegistry, writeReport } = classifier;
  const ingestor = await loadIngestorModule();
  const { ingestAutoFollowUps } = ingestor;

  const discovered = await gatherFollowUps(workspaceRoot);
  const registryPath = path.join(workspaceRoot, 'state', 'automation', 'follow_up_registry.jsonl');
  const existing = await loadRegistry(registryPath);
  const timestamp = now.toISOString();
  const { entries, pending, invalid, autoTasks } = reconcileFollowUps(discovered, existing, timestamp);
  await writeRegistry(registryPath, entries);

  const report = {
    timestamp,
    totalDetected: discovered.length,
    pendingCount: pending.length,
    invalidCount: invalid.length,
    filesScanned: new Set(discovered.map((item) => item.filePath)).size,
    items: entries,
    pending,
    autoTasks,
  };

  const reportPath = path.join(workspaceRoot, 'state', 'automation', 'follow_up_report.json');
  await writeReport(reportPath, report);
  const { tasksPath, missingTaskIds } = await exportAutoTaskRecords(workspaceRoot, entries);

  const ingestResult: IngestResult = await ingestAutoFollowUps(
    workspaceRoot,
    autoTasks.map(task => ({
      taskId: task.taskId,
      classification: task.classification,
      text: task.text,
      filePath: task.filePath,
      line: task.line,
      generatedAt: task.generatedAt,
    })),
  );

  return {
    registryPath,
    reportPath,
    tasksPath,
    pending,
    invalid,
    autoTaskCount: autoTasks.length,
    ingestCreated: ingestResult.created.length,
    ingestSkipped: ingestResult.skipped.length,
    missingTaskIds,
    mode,
  };
}

async function exportAutoTaskRecords(
  workspaceRoot: string,
  entries: FollowUpRegistryEntry[],
) {
  const tasksPath = path.join(workspaceRoot, 'state', 'automation', 'auto_follow_up_tasks.jsonl');
  await fs.mkdir(path.dirname(tasksPath), { recursive: true });

  const taskCreated = entries.filter((entry) => entry.status === 'task_created');
  const missingTaskIds = taskCreated.filter((entry) => !entry.taskId);

  const tasks = taskCreated
    .filter((entry) => Boolean(entry.taskId))
    .map((entry) => ({
      taskId: entry.taskId as string,
      classification: entry.classification,
      text: entry.text,
      filePath: entry.filePath,
      line: entry.line,
      generated_at: entry.lastDetectedAt,
    }));

  const payload = tasks.map((task) => JSON.stringify(task)).join('\n');
  await fs.writeFile(tasksPath, `${payload}${payload.length > 0 ? '\n' : ''}`);

  return { tasksPath, missingTaskIds };
}

function parseArgs(argv: string[]) {
  const args = new Set(argv);
  const enforce = args.has('--enforce');
  const report = args.has('--report');
  if (enforce && report) {
    console.warn('Both --enforce and --report supplied; defaulting to enforcement mode.');
  }
  const help = args.has('-h') || args.has('--help');
  const unknown = argv.filter(arg => arg.startsWith('--') && !['--enforce', '--report', '--help'].includes(arg));
  return { enforce, help, unknown };
}

async function main() {
  const argv = process.argv.slice(2);
  const { enforce, help, unknown } = parseArgs(argv);

  if (help) {
    console.log(
      'Usage: node tools/wvo_mcp/scripts/classify_follow_ups.ts [--enforce|--report]\n' +
        '  --enforce  Fail when pending/invalid follow-ups exist (use in CI)\n' +
        '  --report   Run in advisory mode (default) and emit report without failing',
    );
    return;
  }

  if (unknown.length > 0) {
    for (const flag of unknown) {
      console.warn(`Ignoring unknown flag: ${flag}`);
    }
  }

  const cwd = process.cwd();
  const result = await runClassifyFollowUps({ workspaceRoot: cwd, enforce });

  if (result.ingestCreated > 0) {
    console.log(`Created ${result.ingestCreated} auto follow-up roadmap task(s).`);
  }
  if (result.ingestSkipped > 0) {
    console.log(`Skipped ${result.ingestSkipped} existing follow-up task(s).`);
  }

  if (result.missingTaskIds.length > 0) {
    console.error(
      `Detected ${result.missingTaskIds.length} auto-created follow-ups without task IDs. ` +
        'Ensure every task_created entry is assigned a taskId.',
    );
    if (enforce) {
      process.exitCode = 1;
      return;
    }
  }

  if (result.invalid.length > 0) {
    console.error('Invalid follow-up registry entries detected:');
    for (const problem of result.invalid) {
      console.error(
        `- ${problem.entry.filePath}:${problem.entry.line} (${problem.entry.id}) ${problem.reason}`,
      );
    }
    if (enforce) {
      process.exitCode = 1;
      return;
    }
  }

  if (result.pending.length > 0) {
    const log = enforce ? console.error : console.warn;
    log('Pending follow-up items require review:');
    for (const item of result.pending) {
      log(
        `- ${item.filePath}:${item.line} (${item.id}) classification=${item.classification} — ${item.text}`,
      );
    }
    if (enforce) {
      log('Update state/automation/follow_up_registry.jsonl or annotate items to resolve these entries.');
      process.exitCode = 1;
      return;
    }
  }

  console.log(
    `Follow-up classification check ${result.mode === 'enforce' ? 'passed (enforced mode)' : 'completed (report mode)'}.`,
  );
}

main().catch((error) => {
  console.error('Failed to classify follow-ups', error);
  process.exitCode = 1;
});
