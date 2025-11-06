#!/usr/bin/env node
/**
 * Guardrail monitor orchestrating ProcessCritic tests, override rotation,
 * daily audit freshness, and Wave 0 proof evidence checks.
 *
 * Emits machine-readable JSON, appends telemetry, and exits non-zero on failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import process from 'node:process';
import YAML from 'yaml';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(path.join(__dirname, '..', '..', '..'));
const STATE_ROOT = path.join(WORKSPACE_ROOT, 'state');
const ANALYTICS_DIR = path.join(STATE_ROOT, 'analytics');
const TELEMETRY_PATH = path.join(ANALYTICS_DIR, 'guardrail_compliance.jsonl');
const FOLLOWUPS_PATH = path.join(
  WORKSPACE_ROOT,
  'state',
  'evidence',
  'AFP-GUARDRAIL-HARDENING-20251106',
  'followups.md'
);

const argv = new Set(process.argv.slice(2));
const isDryRun = argv.has('--dry-run');
const isCI = argv.has('--ci');

function runCommand(name, command, options = {}) {
  const start = Date.now();
  try {
    const output = execSync(command, {
      cwd: WORKSPACE_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      ...options,
    });
    return {
      name,
      status: 'pass',
      durationMs: Date.now() - start,
      output: output.trim(),
    };
  } catch (error) {
    return {
      name,
      status: 'fail',
      durationMs: Date.now() - start,
      output: (error.stdout || '').toString().trim(),
      error: (error.stderr || error.message || '').toString().trim(),
    };
  }
}

function ensureDir(targetPath) {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
}

function findLatestDailyAudit() {
  const evidenceRoot = path.join(STATE_ROOT, 'evidence');
  if (!fs.existsSync(evidenceRoot)) {
    return null;
  }

  const auditDirs = fs
    .readdirSync(evidenceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^AFP-ARTIFACT-AUDIT-\d{8}$/.test(entry.name))
    .map((entry) => entry.name);

  if (auditDirs.length === 0) {
    return null;
  }

  auditDirs.sort((a, b) => b.localeCompare(a));
  const latest = auditDirs[0];
  const year = Number(latest.slice(19, 23));
  const month = Number(latest.slice(23, 25));
  const day = Number(latest.slice(25, 27));
  const date = new Date(Date.UTC(year, month - 1, day));
  const summaryPath = path.join(evidenceRoot, latest, 'summary.md');

  return {
    dir: latest,
    summaryExists: fs.existsSync(summaryPath),
    date,
  };
}

function checkDailyAudit() {
  const result = {
    name: 'daily_audit_fresh',
    status: 'pass',
    info: {
      latest: null,
      summaryExists: false,
      hoursSince: null,
    },
  };

  const auditInfo = findLatestDailyAudit();
  if (!auditInfo) {
    result.status = 'fail';
    result.info.message = 'No AFP-ARTIFACT-AUDIT-YYYY-MM-DD directory found.';
    return result;
  }

  const now = Date.now();
  const hoursSince = (now - auditInfo.date.getTime()) / (1000 * 60 * 60);
  result.info.latest = auditInfo.dir;
  result.info.summaryExists = auditInfo.summaryExists;
  result.info.hoursSince = Number(hoursSince.toFixed(2));

  if (!auditInfo.summaryExists) {
    result.status = 'fail';
    result.info.message = `${auditInfo.dir} is missing summary.md.`;
    return result;
  }

  if (hoursSince > 24) {
    result.status = 'fail';
    result.info.message = `Last audit ${auditInfo.dir} is older than 24 hours.`;
  }

  return result;
}

function flattenRoadmapTasks(node, collected = []) {
  if (!node) {
    return collected;
  }

  if (Array.isArray(node)) {
    node.forEach((child) => flattenRoadmapTasks(child, collected));
    return collected;
  }

  if (typeof node === 'object') {
    if (node.id && node.status) {
      collected.push({ id: node.id, status: node.status });
    }
    Object.values(node).forEach((child) => {
      if (typeof child === 'object') {
        flattenRoadmapTasks(child, collected);
      }
    });
  }
  return collected;
}

function taskRequiresProof(taskId) {
  const planPath = path.join(STATE_ROOT, 'evidence', taskId, 'plan.md');
  if (!fs.existsSync(planPath)) {
    return false;
  }
  const content = fs.readFileSync(planPath, 'utf-8').toLowerCase();
  return /wave\s?0/.test(content) || /autopilot/.test(content) || /proof/.test(content);
}

function checkProofEvidence() {
  const result = {
    name: 'wave0_proof_evidence',
    status: 'pass',
    missing: [],
  };

  const roadmapPath = path.join(STATE_ROOT, 'roadmap.yaml');
  if (!fs.existsSync(roadmapPath)) {
    result.status = 'fail';
    result.missing.push('state/roadmap.yaml not found');
    return result;
  }

  const roadmap = YAML.parse(fs.readFileSync(roadmapPath, 'utf-8'));
  const tasks = flattenRoadmapTasks(roadmap);
  const autopilotTasks = tasks.filter((task) => {
    if (!task || typeof task.id !== 'string' || !task.status) {
      return false;
    }
    const status = task.status.toLowerCase();
    if (status !== 'done') {
      return false;
    }
    return taskRequiresProof(task.id);
  });

  for (const task of autopilotTasks) {
    const verifyPath = path.join(STATE_ROOT, 'evidence', task.id, 'verify.md');
    if (!fs.existsSync(verifyPath)) {
      result.status = 'fail';
      result.missing.push(`${task.id}: missing verify.md`);
    }
  }

  return result;
}

function writeTelemetry(entry) {
  ensureDir(ANALYTICS_DIR);
  const line = JSON.stringify(entry);
  fs.appendFileSync(TELEMETRY_PATH, `${line}\n`, 'utf-8');
}

function appendFollowup(summary) {
  ensureDir(path.dirname(FOLLOWUPS_PATH));
  const timestamp = new Date().toISOString();
  const entry = `- ${timestamp}: Guardrail monitor detected issues\n  ${summary}\n`;
  fs.appendFileSync(FOLLOWUPS_PATH, entry, 'utf-8');
}

function summariseFailures(results) {
  return results
    .filter((r) => r.status === 'fail')
    .map((r) => {
      if (r.name === 'daily_audit_fresh') {
        return `${r.name}: ${r.info.message || 'stale/missing audit'}`;
      }
      if (r.name === 'wave0_proof_evidence') {
        return `${r.name}: ${r.missing.join('; ') || 'missing verify.md'}`;
      }
      return `${r.name}: ${r.error || r.output || 'unknown failure'}`;
    })
    .join('\n');
}

function main() {
  const results = [];

  // 1. ProcessCritic regression (unit tests).
  results.push(runCommand('process_critic_tests', 'npm --prefix tools/wvo_mcp run test -- process_critic'));

  // 2. Rotate overrides dry-run.
  results.push(
    runCommand(
      'rotate_overrides_dry_run',
      'node tools/wvo_mcp/scripts/rotate_overrides.mjs --dry-run'
    )
  );

  // 3. Daily audit freshness.
  results.push(checkDailyAudit());

  // 4. Wave 0 proof evidence.
  results.push(checkProofEvidence());

  const hasFailures = results.some((r) => r.status === 'fail');

  const telemetryEntry = {
    timestamp: new Date().toISOString(),
    ci: isCI,
    dryRun: isDryRun,
    overallStatus: hasFailures ? 'fail' : 'pass',
    results,
  };

  if (!isDryRun) {
    writeTelemetry(telemetryEntry);
  }

  console.log(JSON.stringify(telemetryEntry, null, 2));

  if (hasFailures) {
    const summary = summariseFailures(results);
    if (!isDryRun) {
      appendFollowup(summary);
    }
    process.exit(1);
  }
}

main();
