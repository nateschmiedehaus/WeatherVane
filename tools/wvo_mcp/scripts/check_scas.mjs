#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path'; import { execSync } from 'node:child_process';
const here = path.dirname(new URL(import.meta.url).pathname);
const workspace = path.resolve(path.join(here, '..', '..', '..'));
const task = process.env.TASK_ID || 'AFP-W0-STEP5-MUTATION';
const baseRef = process.env.SCAS_BASE || process.env.GITHUB_BASE_REF || 'HEAD~1';
const headRef = process.env.SCAS_HEAD || 'HEAD';
function readDiff() {
  try {
    const raw = execSync(`git -C ${workspace} diff --numstat ${baseRef} ${headRef}`, { encoding: 'utf8' });
    return raw.trim().split('\n').filter(Boolean);
  } catch (error) {
    return [];
  }
}
let filesChanged = 0;
let netLoc = 0;
for (const line of readDiff()) {
  const [add, del] = line.split('\t');
  if (add === '-' || del === '-') continue;
  filesChanged += 1;
  netLoc += Number(add) - Number(del);
}
const absLoc = Math.abs(netLoc);
const allowlist = new Set((process.env.SCAS_ALLOWLIST || '').split(',').map((entry) => entry.trim()).filter(Boolean));
const requiresDesign = filesChanged > 1 || absLoc > 20;
const designPath = path.join(workspace, 'state', 'evidence', task, 'design.md');
const designPresent = fs.existsSync(designPath);
const LOC_BUDGET = Number(process.env.SCAS_LOC_BUDGET || 150);
const FILE_BUDGET = Number(process.env.SCAS_FILE_BUDGET || 5);
let pass = filesChanged <= FILE_BUDGET && absLoc <= LOC_BUDGET;
if (requiresDesign && !designPresent && !allowlist.has(task)) pass = false;
const payload = {
  task,
  base: baseRef,
  head: headRef,
  files_changed: filesChanged,
  net_loc: netLoc,
  loc_budget: LOC_BUDGET,
  file_budget: FILE_BUDGET,
  require_design: requiresDesign,
  design_present: designPresent,
  allowlisted: allowlist.has(task),
  pass,
  generated_at: new Date().toISOString(),
};
const dir = path.join(workspace, 'state', 'logs', task, 'attest');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'scas.json'), JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
process.exit(pass ? 0 : 1);
