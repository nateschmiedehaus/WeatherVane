#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
};

const here = path.dirname(new URL(import.meta.url).pathname);
const workspace = path.resolve(path.join(here, '..', '..', '..'));
const stateRoot = process.env.WVO_STATE_ROOT ? path.resolve(process.env.WVO_STATE_ROOT) : path.join(workspace, 'state');
const task = getArg('--task') || process.env.TASK_ID || 'AFP-W0-STEP5-MUTATION';
const baseEnv = { ...process.env, TASK_ID: task, WVO_STATE_ROOT: stateRoot };

const run = (cmd, cmdArgs, opts = {}) => {
  const res = spawnSync(cmd, cmdArgs, {
    cwd: workspace,
    stdio: 'inherit',
    env: { ...baseEnv, ...opts.env },
  });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${cmdArgs.join(' ')} failed with status ${res.status}`);
  }
};

const hashFile = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
const hashDir = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const hash = crypto.createHash('sha256');
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    hash.update(entry.name);
    if (entry.isDirectory()) {
      hash.update(hashDir(full));
    } else {
      hash.update(fs.readFileSync(full));
    }
  }
  return hash.digest('hex');
};

const artifacts = [
  { label: 'verify_log', path: path.join('logs', task, 'verify', 'verify.log') },
  { label: 'changed_files', path: path.join('logs', task, 'verify', 'changed_files.json') },
  { label: 'coverage', path: path.join('logs', task, 'coverage', 'coverage.json') },
  { label: 'template_detector', path: path.join('logs', task, 'critics', 'template_detector.json') },
  { label: 'guardrails', path: path.join('logs', task, 'critics', 'guardrails.json') },
  { label: 'scas', path: path.join('logs', task, 'attest', 'scas.json') },
  { label: 'agreements', path: path.join('logs', task, 'attest', 'agreements.json') },
];

const verifyArtifacts = () => {
  for (const artifact of artifacts) {
    const full = path.join(stateRoot, artifact.path);
    if (!fs.existsSync(full)) {
      throw new Error(`missing artifact: ${full}`);
    }
  }
};

const appendRunTrailer = (logPath, runId) => {
  const raw = fs.readFileSync(logPath, 'utf8').trimEnd();
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines[lines.length - 1]?.startsWith('RUN:')) {
    lines.pop();
  }
  lines.push(`RUN: ${runId}`);
  fs.writeFileSync(logPath, `${lines.join('\n')}\n`, 'utf8');
};

const runWithAttest = () => {
  const startedAt = new Date().toISOString();
  run('npm', ['--prefix', 'tools/wvo_mcp', 'run', 'build'], { env: process.env });
  run('node', ['tools/wvo_mcp/dist/executor/verify.js', '--task', task]);
  run('node', ['tools/wvo_mcp/scripts/run_process_critic.mjs', '--task', task]);
  run('node', ['tools/wvo_mcp/scripts/check_scas.mjs']);
  run('node', ['tools/wvo_mcp/scripts/run_template_detector.mjs', '--task', task]);
  run('node', ['tools/wvo_mcp/scripts/guardrail_snapshot.mjs', '--task', task]);
  verifyArtifacts();

  const runId = `RUN-${Date.now()}`;
  const payload = {
    task,
    run_id: runId,
    commit_sha: execSync('git rev-parse HEAD', { cwd: workspace, encoding: 'utf8' }).trim(),
    node_version: process.version,
    dist_sha256: hashDir(path.join(workspace, 'tools', 'wvo_mcp', 'dist')),
    artifacts: artifacts.map((artifact) => {
      const full = path.join(stateRoot, artifact.path);
      return {
        label: artifact.label,
        path: path.relative(workspace, full),
        sha256: hashFile(full),
      };
    }),
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  };

  const attestDir = path.join(stateRoot, 'logs', task, 'attest');
  fs.mkdirSync(attestDir, { recursive: true });
  fs.writeFileSync(path.join(attestDir, 'run.json'), JSON.stringify(payload, null, 2));

  const verifyLog = path.join(stateRoot, 'logs', task, 'verify', 'verify.log');
  appendRunTrailer(verifyLog, runId);
  console.log(JSON.stringify({ task, run_id: runId, artifacts: payload.artifacts.length }, null, 2));
};

runWithAttest();
