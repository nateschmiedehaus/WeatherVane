const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');
const test = require('node:test');

const { collectWave0Status, formatStatusReport, parseArgs } = require('../wave0_status');

function makeTempRepo() {
  const tmpRoot = path.join(process.cwd(), '.tmp');
  fs.mkdirSync(tmpRoot, { recursive: true });
  const base = fs.mkdtempSync(path.join(tmpRoot, 'wave0-status-'));
  fs.mkdirSync(path.join(base, 'state', 'analytics'), { recursive: true });
  return base;
}

function writeJsonl(filePath, entries) {
  const content = entries.map((entry) => JSON.stringify(entry)).join('\n');
  fs.writeFileSync(filePath, `${content}\n`, 'utf8');
}

test('collectWave0Status reports running when lock + runs exist', () => {
  const root = makeTempRepo();
  const stateDir = path.join(root, 'state');
  fs.writeFileSync(
    path.join(stateDir, '.wave0.lock'),
    JSON.stringify({ pid: process.pid, startTime: new Date().toISOString() }, null, 2),
  );
  const now = new Date().toISOString();
  writeJsonl(path.join(stateDir, 'analytics', 'wave0_runs.jsonl'), [
    { taskId: 'TASK-0', status: 'completed', endTime: now, executionTimeMs: 5 },
    { taskId: 'TASK-1', status: 'completed', endTime: now, executionTimeMs: 10 },
  ]);

  const status = collectWave0Status({ root, limit: 2 });

  assert.strictEqual(status.status, 'running');
  assert.ok(status.lock.exists);
  assert.strictEqual(status.recentRuns.length, 2);
  assert.strictEqual(status.recentRuns[0].taskId, 'TASK-1');
  const text = formatStatusReport(status);
  assert.match(text, /Wave 0 Runner Status: RUNNING/);
});

test('collectWave0Status flags stale lock when PID is dead', () => {
  const root = makeTempRepo();
  const stateDir = path.join(root, 'state');
  const stalePid = 999999; // unlikely to exist
  fs.writeFileSync(
    path.join(stateDir, '.wave0.lock'),
    JSON.stringify({ pid: stalePid, startTime: new Date(Date.now() - 60000).toISOString() }, null, 2),
  );

  const status = collectWave0Status({ root });

  assert.strictEqual(status.status, 'stale_lock');
  assert.ok(status.lock.exists);
  assert.strictEqual(status.lock.pid, stalePid);
});

test('collectWave0Status handles missing telemetry gracefully', () => {
  const root = makeTempRepo();
  const status = collectWave0Status({ root });
  assert.strictEqual(status.status, 'idle');
  assert.strictEqual(status.recentRuns.length, 0);
  assert.ok(Array.isArray(status.warnings));
});

test('parseArgs reads json/limit/root flags', () => {
  const args = parseArgs(['--json', '--limit=5', '--root=/tmp/foo']);
  assert.deepStrictEqual(args, {
    json: true,
    limit: 5,
    root: '/tmp/foo',
    help: false,
  });
});
