#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const workspace = path.resolve(path.join(here, '..', '..', '..'));
const task = process.env.TASK_ID || 'AFP-W0-STEP5-MUTATION';
const stateRoot = process.env.WVO_STATE_ROOT ? path.resolve(process.env.WVO_STATE_ROOT) : path.join(workspace, 'state');
const configPath = path.join(stateRoot, 'config', 'drqc.json');
const baseRef = process.env.SCAS_BASE || process.env.GITHUB_BASE_REF || 'HEAD~1';
const headRef = process.env.SCAS_HEAD || 'HEAD';
const diffMode = process.env.SCAS_MODE || 'range'; // range | staged

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const drqcConfig = readConfig();
const scasConfig = drqcConfig.scas || {};
const envAllowlist = (process.env.SCAS_ALLOWLIST || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
const allowlist = new Set([
  ...(Array.isArray(scasConfig.allow) ? scasConfig.allow : []),
  ...envAllowlist,
]);

const FILE_BUDGET = Number(process.env.SCAS_FILE_BUDGET || scasConfig.max_files || 5);
const LOC_BUDGET = Number(process.env.SCAS_LOC_BUDGET || scasConfig.max_net_loc || 150);

function buildDiffCommand(base, head) {
  if (diffMode === 'staged') {
    return `git -C ${workspace} diff --cached --numstat`;
  }
  if (head === 'WORKTREE') {
    return `git -C ${workspace} diff --numstat ${base}`;
  }
  return `git -C ${workspace} diff --numstat ${base} ${head}`;
}

function parseDiffOutput(raw) {
  const lines = raw.trim().split('\n').filter(Boolean);
  let filesChanged = 0;
  let netLoc = 0;
  for (const line of lines) {
    const [add, del] = line.split('\t');
    if (!add || !del || add === '-' || del === '-') {
      continue;
    }
    filesChanged += 1;
    netLoc += Number(add) - Number(del);
  }
  return { filesChanged, netLoc };
}

function execCommand(command) {
  return execSync(command, { encoding: 'utf8' });
}

function computeMergeBase(base, head) {
  try {
    const mergeBase = execCommand(`git -C ${workspace} merge-base ${base} ${head}`).trim();
    return mergeBase;
  } catch {
    return null;
  }
}

function collectDiffStats() {
  const reasons = [];
  if (diffMode === 'staged') {
    try {
      const raw = execCommand(buildDiffCommand(baseRef, headRef));
      const parsed = parseDiffOutput(raw);
      return { ...parsed, reasons, baseUsed: baseRef, headUsed: headRef };
    } catch (error) {
      reasons.push(`diff_error:${error instanceof Error ? error.message : String(error)}`);
      return { filesChanged: 0, netLoc: 0, reasons, fatal: true };
    }
  }

  try {
    const raw = execCommand(buildDiffCommand(baseRef, headRef));
    const parsed = parseDiffOutput(raw);
    return { ...parsed, reasons, baseUsed: baseRef, headUsed: headRef };
  } catch (error) {
    reasons.push(`diff_error:${error instanceof Error ? error.message : String(error)}`);
    const mergeBase = computeMergeBase(baseRef, headRef);
    if (!mergeBase) {
      reasons.push('merge_base_unavailable');
      return { filesChanged: 0, netLoc: 0, reasons, fatal: true };
    }
    try {
      const raw = execCommand(buildDiffCommand(mergeBase, headRef));
      const parsed = parseDiffOutput(raw);
      reasons.push(`merge_base_used:${mergeBase}`);
      return { ...parsed, reasons, baseUsed: mergeBase, headUsed: headRef };
    } catch (fallbackError) {
      reasons.push(`diff_error_merge_base:${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
      return { filesChanged: 0, netLoc: 0, reasons, fatal: true };
    }
  }
}

const diffStats = collectDiffStats();
let filesChanged = diffStats.filesChanged;
let netLoc = diffStats.netLoc;
const reasons = diffStats.reasons ?? [];

const absLoc = Math.abs(netLoc);
const requiresDesign = filesChanged > 1 || absLoc > 20;
const designPath = path.join(stateRoot, 'evidence', task, 'design.md');
const designPresent = fs.existsSync(designPath);

let pass = true;

if (diffStats.fatal) {
  pass = false;
}

if (filesChanged > FILE_BUDGET) {
  reasons.push(`files_exceed_budget:${filesChanged}/${FILE_BUDGET}`);
  pass = false;
}

if (absLoc > LOC_BUDGET) {
  reasons.push(`loc_exceed_budget:${absLoc}/${LOC_BUDGET}`);
  pass = false;
}

if (requiresDesign && !designPresent && !allowlist.has(task)) {
  reasons.push('design_missing');
  pass = false;
}

const payload = {
  task,
  base: diffStats.baseUsed || baseRef,
  head: diffStats.headUsed || headRef,
  files_changed: filesChanged,
  net_loc: netLoc,
  loc_budget: LOC_BUDGET,
  file_budget: FILE_BUDGET,
  require_design: requiresDesign,
  design_present: designPresent,
  allowlisted: allowlist.has(task),
  reasons,
  pass,
  generated_at: new Date().toISOString(),
};

const dir = path.join(stateRoot, 'logs', task, 'attest');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'scas.json'), JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
process.exit(pass ? 0 : 1);
