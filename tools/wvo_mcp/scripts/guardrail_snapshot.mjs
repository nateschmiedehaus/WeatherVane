#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const workspace = path.resolve(path.join(here, '..', '..', '..'));
const stateRoot = process.env.WVO_STATE_ROOT ?? path.join(workspace, 'state');
const task = process.env.TASK_ID || 'AFP-W0-STEP5-MUTATION';
function latestAudit() {
  const evidenceRoot = path.join(stateRoot, 'evidence');
  if (!fs.existsSync(evidenceRoot)) return null;
  return fs.readdirSync(evidenceRoot)
    .filter((name) => /^AFP-ARTIFACT-AUDIT-\d{8}$/.test(name))
    .sort((a, b) => b.localeCompare(a))[0] ?? null;
}
const checks = [];
const docsync = path.join(workspace, '.github', 'workflows', 'docsync.yml');
checks.push({ name: 'docsync_workflow', status: fs.existsSync(docsync) ? 'pass' : 'fail' });
const audit = latestAudit();
checks.push({ name: 'daily_audit', status: audit ? 'pass' : 'fail', detail: audit });
const verifyLog = path.join(stateRoot, 'logs', task, 'verify', 'verify.log');
const verifySize = fs.existsSync(verifyLog) ? fs.statSync(verifyLog).size : 0;
checks.push({ name: 'verify_log_present', status: verifySize >= 1024 ? 'pass' : 'fail', bytes: verifySize });
const outDir = path.join(stateRoot, 'logs', task, 'critics');
fs.mkdirSync(outDir, { recursive: true });
const payload = { task, generated_at: new Date().toISOString(), checks };
fs.writeFileSync(path.join(outDir, 'guardrails.json'), JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
