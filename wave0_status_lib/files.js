'use strict';

const fs = require('node:fs');

const MAX_RECENT_ENTRIES = 200;

const readJsonFile = (filePath) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return { error };
  }
};

const readJsonlEntries = (filePath, limit, warnings) => {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-MAX_RECENT_ENTRIES)
      .slice(-limit);
    const entries = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch (error) {
        warnings.push(`Skipping invalid JSONL line in ${filePath}: ${error.message}`);
      }
    }
    return entries;
  } catch (error) {
    warnings.push(`Unable to read ${filePath}: ${error.message}`);
    return [];
  }
};

const isPidAlive = (pid) => {
  if (typeof pid !== 'number' || Number.isNaN(pid)) {
    return { alive: null, error: 'invalid pid' };
  }
  try {
    process.kill(pid, 0);
    return { alive: true };
  } catch (error) {
    if (error.code === 'ESRCH') {
      return { alive: false };
    }
    if (error.code === 'EPERM') {
      return { alive: null, error: 'permission_denied' };
    }
    return { alive: null, error: error.code || 'unknown' };
  }
};

module.exports = {
  readJsonFile,
  readJsonlEntries,
  isPidAlive,
};
