#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
const here = path.dirname(new URL(import.meta.url).pathname);
const workspace = path.resolve(path.join(here, '..', '..', '..'));
const stateRoot = process.env.WVO_STATE_ROOT ?? path.join(workspace, 'state');
const args = process.argv.slice(2);
let file = process.env.TEMPLATE_SOURCE;
let task = process.env.TASK_ID || 'AFP-W0-STEP5-MUTATION';
for (let i = 0; i < args.length; i += 1) { if (args[i] === '--file' && args[i + 1]) { file = args[i + 1]; i += 1; } else if (args[i] === '--task' && args[i + 1]) { task = args[i + 1]; i += 1; } }
const target = path.resolve(file ?? path.join(stateRoot, 'logs', task, 'plan', 'plan.md'));
const child = spawnSync('node', ['tools/wvo_mcp/dist/critics/template_detector.js', '--file', target, '--task', task], {
  cwd: workspace,
  env: { ...process.env, WVO_STATE_ROOT: stateRoot },
  stdio: 'inherit',
});
if (child.status && child.status !== 0) process.exit(child.status);
const targetPath = path.join(stateRoot, 'logs', task, 'critics', 'template_detector.json');
if (!fs.existsSync(targetPath)) {
  console.error(`Expected template detector output at ${targetPath}`);
  process.exit(1);
}
