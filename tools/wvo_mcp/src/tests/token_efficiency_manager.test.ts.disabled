import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';

import Database from 'better-sqlite3';

import { TokenEfficiencyManager } from '../orchestrator/token_efficiency_manager.js';
import type { OperationsManager } from '../orchestrator/operations_manager.js';

const TEMP_PREFIX = path.join(os.tmpdir(), 'wvo-token-efficiency-');

function buildLargeContext(): string {
  const fillerLine =
    '- Entry keeps operational memory concise while ensuring autonomous orchestration remains fully informed about prior decisions and current strategy alignment.';
  const sectionBody = Array.from({ length: 140 }, (_, index) => `${fillerLine} (${index})`).join('\n');

  return [
    '## Current Focus',
    sectionBody,
    '',
    '## Guardrails & System Decisions',
    sectionBody,
    '',
    '## Risks',
    sectionBody,
    '',
    '## Next actions',
    sectionBody,
    '',
    '## plan',
    sectionBody,
    '',
    '## progress',
    sectionBody,
  ].join('\n');
}

function countWords(text: string): number {
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('TokenEfficiencyManager', () => {
  let workspaceRoot: string;
  let contextPath: string;
  let dbPath: string;
  let operations: EventEmitter;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(TEMP_PREFIX);
    const stateDir = path.join(workspaceRoot, 'state');
    await mkdir(stateDir, { recursive: true });
    contextPath = path.join(stateDir, 'context.md');
    dbPath = path.join(stateDir, 'orchestrator.db');

    await writeFile(contextPath, buildLargeContext(), 'utf8');

    const db = new Database(dbPath);
    db.exec(
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        val TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );`,
    );
    const stmt = db.prepare(
      `INSERT INTO settings (key, val, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         val = excluded.val,
         updated_at = excluded.updated_at`,
    );
    stmt.run('EFFICIENT_OPERATIONS', '0', Date.now());
    db.close();

    operations = new EventEmitter();
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('trims oversized context safely and preserves backup', async () => {
    const manager = new TokenEfficiencyManager(
      workspaceRoot,
      operations as unknown as OperationsManager,
      {
        maxContextWords: 400,
        minIntervalMs: 0,
        backupRetention: 4,
      },
    );

    // Allow bootstrap to complete.
    await sleep(20);

    // Re-inflate the context to simulate fresh growth post-bootstrap.
    await writeFile(contextPath, buildLargeContext(), 'utf8');

    const backupDir = path.join(workspaceRoot, 'state', 'backups', 'context');

    await rm(backupDir, { recursive: true, force: true });
    await mkdir(backupDir, { recursive: true });

    let initialBackups: string[] = [];
    try {
      initialBackups = await readdir(backupDir);
    } catch {
      initialBackups = [];
    }

    await (manager as unknown as { handleSignal: (signal: 'token_pressure') => Promise<void> }).handleSignal('token_pressure');

    const updated = await readFile(contextPath, 'utf8');
    const updatedWordCount = countWords(updated);
    expect(updatedWordCount).toBeLessThanOrEqual(400);
    expect(updated).toMatch(/Trimmed for token efficiency/);

    const backups = await readdir(backupDir);
    expect(backups.length).toBeGreaterThan(initialBackups.length);

    const db = new Database(dbPath);
    const row = db.prepare('SELECT val FROM settings WHERE key = ?').get('EFFICIENT_OPERATIONS') as { val: string } | undefined;
    db.close();
    expect(row?.val).toBe('1');

    manager.dispose();
  });

  it('skips optimisation when context already within budget', async () => {
    await writeFile(
      contextPath,
      ['## Current Focus', '- Compact entry only.', '', '## Next actions', '- Small task list.'].join('\n'),
      'utf8',
    );

    const manager = new TokenEfficiencyManager(
      workspaceRoot,
      operations as unknown as OperationsManager,
      {
        maxContextWords: 80,
        minIntervalMs: 0,
        backupRetention: 3,
      },
    );

    await sleep(20);

    const backupDir = path.join(workspaceRoot, 'state', 'backups', 'context');
    let backups: string[] = [];
    try {
      backups = await readdir(backupDir);
    } catch {
      backups = [];
    }
    expect(backups.length).toBe(0);

    const updated = await readFile(contextPath, 'utf8');
    expect(updated).not.toMatch(/Trimmed for token efficiency/);

    manager.dispose();
  });
});
