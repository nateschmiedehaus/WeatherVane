#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
};

const task = getArg('--task', process.env.TASK_ID || 'AFP-W0-STEP5-MUTATION');
const outputDir = path.resolve(getArg('--output', path.join('.tmp', 'recompute', task)));
const workspace = path.resolve(new URL('../..', import.meta.url).pathname, '..');
const stateRoot = process.env.WVO_STATE_ROOT
  ? path.resolve(process.env.WVO_STATE_ROOT)
  : path.join(workspace, 'state');
const planFile = getArg('--plan', path.join(stateRoot, 'logs', task, 'plan', 'plan.md'));
const tempState = path.join(outputDir, 'state');

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(tempState, { recursive: true });

const run = (cmd, cmdArgs) => {
  const res = spawnSync(cmd, cmdArgs, {
    cwd: workspace,
    stdio: 'inherit',
    env: { ...process.env, WVO_STATE_ROOT: tempState, TASK_ID: task },
  });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${cmdArgs.join(' ')} failed with ${res.status}`);
  }
};

run('node', ['tools/wvo_mcp/dist/critics/template_detector.js', '--file', planFile, '--task', task]);
run('node', ['tools/wvo_mcp/scripts/guardrail_snapshot.mjs']);
run('node', ['tools/wvo_mcp/scripts/check_scas.mjs']);

const copy = (src, dst) => {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
};

copy(path.join(tempState, 'logs', task, 'critics', 'template_detector.json'), path.join(outputDir, 'template_detector.json'));
copy(path.join(tempState, 'logs', task, 'critics', 'guardrails.json'), path.join(outputDir, 'guardrails.json'));
copy(path.join(tempState, 'logs', task, 'attest', 'scas.json'), path.join(outputDir, 'scas.json'));

console.log(JSON.stringify({ task, output: outputDir }, null, 2));
