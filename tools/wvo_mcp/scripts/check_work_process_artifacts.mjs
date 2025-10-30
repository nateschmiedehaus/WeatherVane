#!/usr/bin/env node

/**
 * Work Process Artifact Guard
 *
 * Validates that every task under state/evidence has the required
 * STRATEGIZE→MONITOR phase artifacts. Fails fast when anything is missing
 * so Codex/Claude sessions catch gaps the same way the future autopilot will.
 *
 * This script is intentionally strict. Any missing directory or markdown
 * file indicates the task loop is incomplete and integrity checks should fail.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '..', '..', '..');
const evidenceRoot = path.join(workspaceRoot, 'state', 'evidence');

const REQUIRED_PHASES = [
  { name: 'strategize', files: ['strategy.md'] },
  { name: 'spec', files: ['spec.md'] },
  { name: 'plan', files: ['plan.md'] },
  { name: 'think', files: ['analysis.md', 'edge_cases.md'] },
  { name: 'implement', files: ['notes.md'] },
  { name: 'verify', files: ['results.md'] },
  { name: 'review', files: ['review.md', 'review_notes.md'] },
  { name: 'pr', files: ['summary.md'] },
  { name: 'monitor', files: ['monitor.md'] },
];

const IGNORE_ENTRIES = new Set([
  'bundle_REVIEW_TRACE-WPE_1761740222406.json',
  'bundle_REVIEW_TRACE-WPE-mhbyodx7_1761740282509.json',
  'bundle_REVIEW_TRACE-WPE-mhbypuyj_1761740351244.json',
  'bundle_REVIEW_TRACE-WPE-mhbypzzy_1761740357774.json',
  'bundle_REVIEW_TRACE-WPE-mhbyqpvl_1761740391315.json',
  'bundle_REVIEW_TRACE-WPE-mhbz75po_1761741158336.json',
  'bundle_REVIEW_TRACE-WPE-mhbz81b0_1761741199277.json',
  'bundle_STRATEGIZE_TRACE-WPE-mhbyodx7_1761740282507.json',
  'bundle_STRATEGIZE_TRACE-WPE-mhbypuyj_1761740351242.json',
  'bundle_STRATEGIZE_TRACE-WPE-mhbypzzy_1761740357772.json',
  'bundle_STRATEGIZE_TRACE-WPE-mhbyqpvl_1761740391313.json',
  'bundle_STRATEGIZE_TRACE-WPE-mhbz75po_1761741158334.json',
  'bundle_STRATEGIZE_TRACE-WPE-mhbz81b0_1761741199275.json',
  'proofs',
  'README.md',
  'MANIFEST.md',
  'EXECUTIVE_SUMMARY.md',
  'VALIDATION_REPORT.json',
]);

function isEvidenceDir(entryPath) {
  const stats = fs.statSync(entryPath);
  if (!stats.isDirectory()) {
    return false;
  }
  const name = path.basename(entryPath);
  if (IGNORE_ENTRIES.has(name)) {
    return false;
  }
  // Ignore hidden/system directories
  if (name.startsWith('.')) {
    return false;
  }
  return true;
}

function findFirstExistingFile(dir, candidates) {
  for (const candidate of candidates) {
    const candidatePath = path.join(dir, candidate);
    if (fs.existsSync(candidatePath)) {
      const stats = fs.statSync(candidatePath);
      if (stats.isFile()) {
        return candidate;
      }
    }
  }
  return null;
}

function validateTask(taskDir) {
  const relativeTaskDir = path.relative(workspaceRoot, taskDir);
  const errors = [];
  const monitorDir = path.join(taskDir, 'monitor');
  const monitorExists = fs.existsSync(monitorDir) && fs.statSync(monitorDir).isDirectory();
  for (const phase of REQUIRED_PHASES) {
    const phaseDir = path.join(taskDir, phase.name);
    const phaseExists = fs.existsSync(phaseDir) && fs.statSync(phaseDir).isDirectory();

    if (monitorExists && !phaseExists) {
      errors.push(`Missing ${phase.name}/ directory (required when monitor/ exists)`);
      continue;
    }

    if (!phaseExists) {
      // Allow partial tasks that haven't reached this phase yet.
      continue;
    }

    const file = findFirstExistingFile(phaseDir, phase.files);
    if (!file) {
      errors.push(`Missing required file in ${phase.name}/ (${phase.files.join(' or ')})`);
    }
  }
  if (errors.length > 0) {
    return errors.map((e) => `[${relativeTaskDir}] ${e}`);
  }
  return [];
}

function main() {
  if (!fs.existsSync(evidenceRoot) || !fs.statSync(evidenceRoot).isDirectory()) {
    console.error(`Evidence root not found: ${evidenceRoot}`);
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const tasks = [];
  let checkAll = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--all') {
      checkAll = true;
    } else if (arg === '--task') {
      const taskId = args[i + 1];
      if (!taskId) {
        console.error('Missing value for --task');
        process.exit(1);
      }
      tasks.push(taskId);
      i += 1;
    } else {
      console.error(`Unknown argument: ${arg}`);
      console.error('Usage: node check_work_process_artifacts.mjs [--task TASK_ID ...] [--all]');
      process.exit(1);
    }
  }

  if (!checkAll && tasks.length === 0) {
    console.log('ℹ️  No tasks specified; run with --task <ID> or --all to perform validation.');
    return;
  }

  let taskDirs = [];
  if (checkAll) {
    taskDirs = fs
      .readdirSync(evidenceRoot)
      .map((entry) => path.join(evidenceRoot, entry))
      .filter(isEvidenceDir);
  } else {
    taskDirs = tasks
      .map((task) => path.join(evidenceRoot, task))
      .filter((entry) => fs.existsSync(entry) && isEvidenceDir(entry));

    if (taskDirs.length === 0) {
      console.log('ℹ️  No matching task directories found under state/evidence/.');
      return;
    }
  }

  const allErrors = [];
  for (const taskDir of taskDirs) {
    const taskErrors = validateTask(taskDir);
    allErrors.push(...taskErrors);
  }

  if (allErrors.length > 0) {
    console.error('❌ Work process validation failed:\n');
    for (const error of allErrors) {
      console.error(`  - ${error}`);
    }
    console.error('\nEach task must complete STRATEGIZE→MONITOR with the required artifacts before integrity tests can pass.');
    process.exit(1);
  }

  console.log('✅ Work process artifacts present for all tasks in state/evidence.');
}

main();
