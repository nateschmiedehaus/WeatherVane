#!/usr/bin/env node
/**
 * ROADMAP-STRUCT: Evidence Validation CLI
 *
 * Verifies roadmap tasks declare evidence metadata and that completed tasks
 * have corresponding STRATEGIZE→MONITOR artifacts on disk.
 *
 * Usage:
 *   npm run validate:roadmap-evidence
 *   npm run validate:roadmap-evidence -- --file path/to/roadmap.yaml
 *   npm run validate:roadmap-evidence -- --json
 *   npm run validate:roadmap-evidence -- --all          # check all tasks, not just done/needs_review
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import {
  WORK_PROCESS_PHASES,
  type RoadmapSchema,
  type TaskSchema,
  type WorkProcessPhase,
} from '../src/roadmap/schemas.js';

const DEFAULT_ROADMAP_PATH = 'state/roadmap.yaml';
const ENFORCED_STATUSES = new Set<TaskSchema['status']>([
  'done',
  'needs_review',
  'needs_improvement',
]);

type Severity = 'error' | 'warning';

interface EvidenceIssue {
  severity: Severity;
  code: string;
  message: string;
  taskId: string;
  phase?: string;
  expectedPath?: string;
}

export interface CLIArgs {
  file: string;
  json: boolean;
  all: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): CLIArgs {
  const args: CLIArgs = {
    file: DEFAULT_ROADMAP_PATH,
    json: false,
    all: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--file' && i + 1 < argv.length) {
      args.file = argv[++i];
    } else if (token === '--json') {
      args.json = true;
    } else if (token === '--all') {
      args.all = true;
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    }
  }

  return args;
}

export function showHelp(): void {
  console.log(`
Roadmap Evidence Validation

Ensures roadmap tasks declare evidence metadata and that completed tasks
have STRATEGIZE→MONITOR artifacts present in state/evidence/.

Usage:
  npm run validate:roadmap-evidence [-- --file PATH] [--json] [--all]

Options:
  --file <path>   Path to roadmap file (default: state/roadmap.yaml)
  --json          Emit JSON report (for CI integration)
  --all           Validate evidence artifacts for every task (default: only done/needs_review/needs_improvement)
  --help, -h      Show this help message
`);
}

export function loadRoadmap(filePath: string): RoadmapSchema {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ Roadmap file not found: ${absolutePath}`);
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(absolutePath, 'utf8');
    return yaml.load(content) as RoadmapSchema;
  } catch (error: any) {
    console.error(`❌ Failed to load roadmap: ${error.message}`);
    process.exit(1);
  }
}

export function collectTasks(roadmap: RoadmapSchema): TaskSchema[] {
  const tasks: TaskSchema[] = [];
  for (const epic of roadmap.epics ?? []) {
    for (const milestone of epic.milestones ?? []) {
      for (const task of milestone.tasks ?? []) {
        tasks.push(task);
      }
    }
  }
  return tasks;
}

export function resolveEvidencePath(task: TaskSchema): string {
  if (typeof task.evidence_path === 'string' && task.evidence_path.trim().length > 0) {
    return task.evidence_path;
  }
  return `state/evidence/${task.id}`;
}

export function resolvePhases(task: TaskSchema): WorkProcessPhase[] {
  if (Array.isArray(task.work_process_phases) && task.work_process_phases.length > 0) {
    return task.work_process_phases as WorkProcessPhase[];
  }
  return [...WORK_PROCESS_PHASES];
}

function toAbsolutePath(relPath: string): string {
  return path.isAbsolute(relPath)
    ? relPath
    : path.join(process.cwd(), relPath);
}

export function directoryHasArtifacts(dirPath: string): boolean {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return false;
  }

  const entries = fs.readdirSync(dirPath);
  return entries.length > 0;
}

function getSeverityForTask(task: TaskSchema): Severity {
  const level = task.evidence_enforcement ?? 'enforce';
  return level === 'observe' ? 'warning' : level === 'warn' ? 'warning' : 'error';
}

export function validateEvidence(
  task: TaskSchema,
  phases: WorkProcessPhase[],
  basePath: string,
  enforceArtifacts: boolean
): EvidenceIssue[] {
  const severity = getSeverityForTask(task);
  const issues: EvidenceIssue[] = [];

  phases.forEach((phase) => {
    const expectedRelative = path.posix.join(basePath.replace(/\\/g, '/'), phase);
    const absolutePath = toAbsolutePath(expectedRelative);

    if (!fs.existsSync(absolutePath)) {
      if (enforceArtifacts) {
        issues.push({
          severity,
          code: 'MISSING_EVIDENCE_PHASE',
          message: `Missing evidence directory for phase "${phase}"`,
          taskId: task.id,
          phase,
          expectedPath: expectedRelative
        });
      }
      return;
    }

    if (enforceArtifacts && phase === 'verify') {
      if (!directoryHasArtifacts(absolutePath)) {
        issues.push({
          severity,
          code: 'EMPTY_VERIFY_EVIDENCE',
          message: 'Verify phase directory exists but contains no artifacts',
          taskId: task.id,
          phase,
          expectedPath: expectedRelative
        });
      }
    }
  });

  return issues;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    return;
  }

  const roadmap = loadRoadmap(args.file);
  const tasks = collectTasks(roadmap);
  const issues: EvidenceIssue[] = [];

  tasks.forEach((task) => {
    const severity = getSeverityForTask(task);
    const evidencePathValue = task.evidence_path;
    const phasesValue = task.work_process_phases;

    if (!evidencePathValue) {
      issues.push({
        severity,
        code: 'MISSING_EVIDENCE_PATH',
        message: 'Task is missing evidence_path metadata',
        taskId: task.id,
      });
    }

    if (!Array.isArray(phasesValue) || phasesValue.length === 0) {
      issues.push({
        severity,
        code: 'MISSING_WORK_PROCESS_PHASES',
        message: 'Task is missing work_process_phases metadata',
        taskId: task.id,
      });
    }

    const phases = resolvePhases(task);
    const basePath = resolveEvidencePath(task);

    const shouldValidateArtifacts =
      args.all || ENFORCED_STATUSES.has(task.status ?? 'pending');

    if (shouldValidateArtifacts) {
      issues.push(
        ...validateEvidence(task, phases, basePath, true)
      );
    }
  });

  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

  const report = {
    tasks_scanned: tasks.length,
    error_count: errorCount,
    warning_count: warningCount,
    issues
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    if (errorCount === 0) {
      console.log('✅ Roadmap evidence validation passed');
    } else {
      console.log(`❌ Roadmap evidence validation failed with ${errorCount} error(s)`);
    }

    if (errorCount + warningCount > 0) {
      console.log('');
      issues.forEach((issue) => {
        const prefix = issue.severity === 'error' ? 'ERROR' : 'WARN ';
        const phaseInfo = issue.phase ? ` [${issue.phase}]` : '';
        const pathInfo = issue.expectedPath ? ` -> ${issue.expectedPath}` : '';
        console.log(`  • ${prefix}: ${issue.taskId}${phaseInfo}: ${issue.message}${pathInfo}`);
      });
      console.log('');
    }

    console.log(`Tasks scanned: ${tasks.length}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Warnings: ${warningCount}`);
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };
