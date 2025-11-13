'use strict';

const { existsSync } = require('node:fs');
const path = require('node:path');
const { readJsonFile, readJsonlEntries, isPidAlive } = require('./files');

const DEFAULT_LIMIT = 3;

const readLockInfo = (stateDir, warnings) => {
  const lockPath = path.join(stateDir, '.wave0.lock');
  if (!existsSync(lockPath)) {
    return { path: lockPath, exists: false };
  }
  const parsed = readJsonFile(lockPath);
  if (parsed.error) {
    warnings.push(`Failed to parse ${lockPath}: ${parsed.error.message}`);
    return { path: lockPath, exists: true, error: 'parse_error' };
  }
  const startTime = parsed.startTime || null;
  const pid = typeof parsed.pid === 'number' ? parsed.pid : null;
  const pidStatus = isPidAlive(pid);
  if (pidStatus.error === 'permission_denied') {
    warnings.push('Could not check Wave 0 PID (permission denied).');
  }
  return {
    path: lockPath,
    exists: true,
    pid,
    startTime,
    pidAlive: pidStatus.alive,
    pidCheckError: pidStatus.error || null,
  };
};

const summarizeRuns = (entries) =>
  entries
    .map((entry) => ({
      taskId: entry.taskId || entry.id || 'unknown',
      status: entry.status || entry.finalStatus || 'unknown',
      endTime: entry.endTime || entry.timestamp || null,
      executionTimeMs: entry.executionTimeMs ?? null,
    }))
    .reverse();

const readLifecycleEvent = (filePath, warnings) => {
  const events = readJsonlEntries(filePath, 1, warnings);
  if (!events.length) return null;
  const event = events[0];
  return {
    type: event.type || 'unknown',
    taskId: event.taskId || 'unknown',
    timestamp: event.timestamp || null,
  };
};

const deriveStatus = (lockInfo, recentRuns, warnings) => {
  if (lockInfo.exists) {
    if (lockInfo.pidAlive === true) {
      return 'running';
    }
    if (lockInfo.pidAlive === false) {
      return 'stale_lock';
    }
    return 'unknown';
  }
  if (!recentRuns.length) {
    return 'idle';
  }
  const lastRun = recentRuns[0];
  if (lastRun.endTime) {
    const msAgo = Date.now() - new Date(lastRun.endTime).getTime();
    if (msAgo > 1000 * 60 * 30) {
      warnings.push('No Wave 0 executions recorded in the last 30 minutes.');
    }
  }
  return 'idle';
};

const collectWave0Status = (options = {}) => {
  const root = options.root ? path.resolve(options.root) : path.resolve(__dirname, '..');
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : DEFAULT_LIMIT;
  const stateDir = path.join(root, 'state');
  const analyticsDir = path.join(stateDir, 'analytics');
  const warnings = [];

  const lock = readLockInfo(stateDir, warnings);
  const recentRunsRaw = readJsonlEntries(
    path.join(analyticsDir, 'wave0_runs.jsonl'),
    Math.max(limit, DEFAULT_LIMIT),
    warnings,
  );
  const lifecycle = readLifecycleEvent(path.join(analyticsDir, 'supervisor_lifecycle.jsonl'), warnings);
  const recentRuns = summarizeRuns(recentRunsRaw).slice(0, limit);
  const status = deriveStatus(lock, recentRuns, warnings);

  return {
    status,
    generatedAt: new Date().toISOString(),
    lock,
    recentRuns,
    lastLifecycleEvent: lifecycle,
    warnings,
  };
};

module.exports = {
  collectWave0Status,
  DEFAULT_LIMIT,
};
