import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  type CommandRunner,
  runUpgradePreflight,
  type UpgradePreflightOutcome,
} from '../upgrade/preflight.js';

const tempDirs: string[] = [];

const makeTempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wvo-preflight-test-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('runUpgradePreflight', () => {
  it('passes when all checks succeed', async () => {
    const rootDir = makeTempDir();
    const stateDir = path.join(rootDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    const sqlitePath = path.join(stateDir, 'orchestrator.db');
    new Database(sqlitePath).close();

    const commandRunner: CommandRunner = vi.fn(async (cmd, args) => {
      if (cmd === 'git' && args[0] === 'status') {
        return { stdout: '\n' };
      }
      if (cmd === 'npm' && args[0] === '--version') {
        return { stdout: '9.1.0\n' };
      }
      if (cmd === 'df') {
        return {
          stdout: [
            'Filesystem 1024-blocks Used Available Capacity Mounted on',
            '/dev/disk1 1024000 1000 1023000 1% /',
          ].join('\n'),
        };
      }
      if (cmd === 'which' && args[0] === 'docker') {
        return { stdout: '/usr/bin/docker\n' };
      }
      if (cmd === 'which' && args[0] === 'bwrap') {
        throw new Error('not found');
      }
      throw new Error(`Unexpected command ${cmd} ${args.join(' ')}`);
    });

    const result = (await runUpgradePreflight({
      rootDir,
      stateDir,
      sqlitePath,
      commandRunner,
      nodeVersion: 'v20.11.1',
      diskCheckPath: rootDir,
      timeProvider: () => new Date('2024-06-01T10:00:00Z'),
    })) as UpgradePreflightOutcome;

    expect(result.ok).toBe(true);
    expect(result.logs).toHaveLength(6);
    expect(result.logs.every((log) => log.status === 'passed')).toBe(true);
    expect(result.gates).toHaveLength(4);
    expect(result.gates.map((gate) => gate.gate)).toEqual([
      'build',
      'unit',
      'selfchecks',
      'canary_ready',
    ]);

    const lockPath = path.join(stateDir, 'upgrade.lock');
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('fails fast when git working tree is dirty and removes the lock', async () => {
    const rootDir = makeTempDir();
    const stateDir = path.join(rootDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    const sqlitePath = path.join(stateDir, 'orchestrator.db');
    new Database(sqlitePath).close();

    const commandRunner: CommandRunner = vi.fn(async (cmd, args) => {
      if (cmd === 'git' && args[0] === 'status') {
        return { stdout: ' M src/index.ts\n' };
      }
      throw new Error(`Unexpected command ${cmd}`);
    });

    const result = await runUpgradePreflight({
      rootDir,
      stateDir,
      sqlitePath,
      commandRunner,
      nodeVersion: 'v20.11.1',
      diskCheckPath: rootDir,
      timeProvider: () => new Date('2024-06-01T10:00:00Z'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedCheck).toBe('git_clean');
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]?.status).toBe('failed');
    }

    const lockPath = path.join(stateDir, 'upgrade.lock');
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('aborts immediately when an upgrade lock already exists', async () => {
    const rootDir = makeTempDir();
    const stateDir = path.join(rootDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    const sqlitePath = path.join(stateDir, 'orchestrator.db');
    new Database(sqlitePath).close();

    const lockPath = path.join(stateDir, 'upgrade.lock');
    fs.writeFileSync(lockPath, 'existing lock', 'utf-8');

    const commandRunner: CommandRunner = vi.fn(async () => {
      throw new Error('should not be called');
    });

    const result = await runUpgradePreflight({
      rootDir,
      stateDir,
      sqlitePath,
      commandRunner,
      nodeVersion: 'v20.11.1',
      diskCheckPath: rootDir,
      timeProvider: () => new Date('2024-06-01T10:00:00Z'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedCheck).toBe('upgrade_lock');
      expect(result.logs.at(0)?.name).toBe('upgrade_lock');
    }
    expect(fs.existsSync(lockPath)).toBe(true);
  });
});
