import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzip as gunzipCallback } from 'node:zlib';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import {
  parseLedger,
  partitionEntries,
  rotateOverrides,
} from './rotate_overrides.mjs';

const gunzip = promisify(gunzipCallback);

const createTempDir = async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'override-rotate-'));
  return base;
};

const writeLedger = async (ledgerPath, entries) => {
  const content = `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`;
  await fs.writeFile(ledgerPath, content, 'utf8');
};

const readArchive = async (archivePath) => {
  const compressed = await fs.readFile(archivePath);
  const buffer = await gunzip(compressed);
  return buffer
    .toString('utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
};

const tempDirs = [];

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('rotate_overrides', () => {
  it('rotates entries older than threshold and keeps recent ones', async () => {
    const tmpDir = await createTempDir();
    tempDirs.push(tmpDir);

    const ledgerPath = path.join(tmpDir, 'overrides.jsonl');
    const archiveDir = path.join(tmpDir, 'archive');

    const now = new Date('2025-11-06T12:00:00Z');

    await writeLedger(ledgerPath, [
      { timestamp: '2025-11-01T00:00:00Z', commit: 'old', reason: 'SKIP_AFP' },
      { timestamp: '2025-11-06T11:00:00Z', commit: 'recent', reason: 'manual override' },
    ]);

    const result = await rotateOverrides({
      inputPath: ledgerPath,
      archiveDir,
      maxAgeHours: 24,
      now,
    });

    expect(result.status).toBe('rotated');
    expect(result.archived).toBe(1);
    expect(result.kept).toBe(1);
    expect(result.warnings).toEqual([]);

    const archiveFiles = await fs.readdir(archiveDir);
    expect(archiveFiles).toHaveLength(1);

    const archiveEntries = await readArchive(path.join(archiveDir, archiveFiles[0]));
    expect(archiveEntries).toEqual([
      { timestamp: '2025-11-01T00:00:00Z', commit: 'old', reason: 'SKIP_AFP' },
    ]);

    const remainingContent = await fs.readFile(ledgerPath, 'utf8');
    expect(remainingContent.trim()).toEqual(
      JSON.stringify({ timestamp: '2025-11-06T11:00:00Z', commit: 'recent', reason: 'manual override' })
    );
  });

  it('returns noop when nothing qualifies for archive', async () => {
    const tmpDir = await createTempDir();
    tempDirs.push(tmpDir);

    const ledgerPath = path.join(tmpDir, 'overrides.jsonl');
    const archiveDir = path.join(tmpDir, 'archive');

    const now = new Date('2025-11-06T12:00:00Z');

    await writeLedger(ledgerPath, [
      { timestamp: '2025-11-06T08:00:00Z', commit: 'a', reason: 'manual' },
      { timestamp: '2025-11-06T09:30:00Z', commit: 'b', reason: 'manual' },
    ]);

    const result = await rotateOverrides({
      inputPath: ledgerPath,
      archiveDir,
      maxAgeHours: 24,
      now,
    });

    expect(result.status).toBe('noop');
    expect(result.archived).toBe(0);
    expect(result.kept).toBe(2);

    const archiveExists = await fs.access(archiveDir).then(
      () => true,
      () => false
    );
    expect(archiveExists).toBe(false);

    const remainingContent = await fs.readFile(ledgerPath, 'utf8');
    expect(remainingContent.trim().split('\n')).toHaveLength(2);
  });
});

describe('helpers', () => {
  it('parseLedger collects warnings for invalid JSON', () => {
    const { entries, warnings } = parseLedger('{"ok":true,"timestamp":"2025-11-05T00:00:00Z"}\nINVALID\n');
    expect(entries).toHaveLength(1);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/Unable to parse JSON/);
  });

  it('partitionEntries distinguishes archive vs keep', () => {
    const cutoffMs = Date.parse('2025-11-05T00:00:00Z');
    const { archive, keep, warnings } = partitionEntries(
      [
        { parsed: { timestamp: '2025-11-01T00:00:00Z' }, lineNumber: 1 },
        { parsed: { timestamp: '2025-11-07T00:00:00Z' }, lineNumber: 2 },
        { parsed: { commit: 'missing timestamp' }, lineNumber: 3 },
      ],
      cutoffMs
    );

    expect(archive).toHaveLength(1);
    expect(archive[0].timestamp).toBe('2025-11-01T00:00:00Z');
    expect(keep).toHaveLength(2);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Missing timestamp/);
  });
});
