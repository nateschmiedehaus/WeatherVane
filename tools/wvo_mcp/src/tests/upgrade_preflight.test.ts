import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    fs.writeFileSync(path.join(rootDir, '.nvmrc'), 'v24.10.0\n', 'utf-8');
    fs.writeFileSync(
      path.join(rootDir, 'package.json'),
      JSON.stringify({ engines: { npm: '>=10.0.0' } }, null, 2),
      'utf-8',
    );

    const commandRunner: CommandRunner = vi.fn(async (cmd, args) => {
      if (cmd === 'git' && args[0] === 'status') {
        return { stdout: '\n' };
      }
      if (cmd === 'npm' && args[0] === '--version') {
        return { stdout: '11.6.0\n' };
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
      nodeVersion: 'v24.10.0',
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
    expect(result.versions).toMatchObject([
      {
        tool: 'node',
        rawDetected: 'v24.10.0',
        detected: '24.10.0',
        constraint: 'v24.10.0',
        constraintSource: '.nvmrc',
        satisfies: true,
      },
      {
        tool: 'npm',
        rawDetected: '11.6.0',
        detected: '11.6.0',
        constraint: '>=10.0.0',
        constraintSource: 'package.json (engines.npm)',
        satisfies: true,
      },
    ]);

    const lockPath = path.join(stateDir, 'upgrade.lock');
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('accepts sandbox artifact evidence when docker and bwrap are unavailable', async () => {
    const rootDir = makeTempDir();
    const stateDir = path.join(rootDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    const sqlitePath = path.join(stateDir, 'orchestrator.db');
    new Database(sqlitePath).close();
    fs.writeFileSync(path.join(rootDir, '.nvmrc'), 'v24.10.0\n', 'utf-8');
    fs.mkdirSync(path.join(rootDir, 'experiments', 'meta'), { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, 'experiments', 'meta', 'sandbox_run.json'),
      JSON.stringify(
        {
          dry_run: true,
          generated_at: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(rootDir, 'package.json'),
      JSON.stringify({ engines: { npm: '>=10.0.0' } }, null, 2),
      'utf-8',
    );

    const commandRunner: CommandRunner = vi.fn(async (cmd, args) => {
      if (cmd === 'git' && args[0] === 'status') {
        return { stdout: '\n' };
      }
      if (cmd === 'npm' && args[0] === '--version') {
        return { stdout: '11.6.0\n' };
      }
      if (cmd === 'df') {
        return {
          stdout: [
            'Filesystem 1024-blocks Used Available Capacity Mounted on',
            '/dev/disk1 1024000 1000 1023000 1% /',
          ].join('\n'),
        };
      }
      if (cmd === 'which') {
        throw new Error(`${args[0] ?? 'unknown'} not found`);
      }
      throw new Error(`Unexpected command ${cmd} ${args.join(' ')}`);
    });

    const outcome = await runUpgradePreflight({
      rootDir,
      stateDir,
      sqlitePath,
      commandRunner,
      nodeVersion: 'v24.10.0',
      diskCheckPath: rootDir,
      timeProvider: () => new Date('2024-06-01T10:00:00Z'),
    });

    expect(outcome.ok).toBe(true);
  });

  it('fails fast when git working tree is dirty and removes the lock', async () => {
    const rootDir = makeTempDir();
    const stateDir = path.join(rootDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    const sqlitePath = path.join(stateDir, 'orchestrator.db');
    new Database(sqlitePath).close();
    fs.writeFileSync(path.join(rootDir, '.nvmrc'), 'v24.10.0\n', 'utf-8');
    fs.writeFileSync(
      path.join(rootDir, 'package.json'),
      JSON.stringify({ engines: { npm: '>=10.0.0' } }, null, 2),
      'utf-8',
    );

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
    expect(result.versions).toEqual([]);

    const lockPath = path.join(stateDir, 'upgrade.lock');
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('aborts immediately when an upgrade lock already exists', async () => {
    const rootDir = makeTempDir();
    const stateDir = path.join(rootDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    const sqlitePath = path.join(stateDir, 'orchestrator.db');
    new Database(sqlitePath).close();
    fs.writeFileSync(path.join(rootDir, '.nvmrc'), 'v24.10.0\n', 'utf-8');
    fs.writeFileSync(
      path.join(rootDir, 'package.json'),
      JSON.stringify({ engines: { npm: '>=10.0.0' } }, null, 2),
      'utf-8',
    );

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
    expect(result.versions).toEqual([]);
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  it('fails when Node.js version does not satisfy .nvmrc constraint', async () => {
    const rootDir = makeTempDir();
    const stateDir = path.join(rootDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    const sqlitePath = path.join(stateDir, 'orchestrator.db');
    new Database(sqlitePath).close();
    fs.writeFileSync(path.join(rootDir, '.nvmrc'), 'v24.10.0\n', 'utf-8');
    fs.writeFileSync(
      path.join(rootDir, 'package.json'),
      JSON.stringify({ engines: { npm: '>=10.0.0' } }, null, 2),
      'utf-8',
    );

    const commandRunner: CommandRunner = vi.fn(async (cmd, args) => {
      if (cmd === 'git' && args[0] === 'status') {
        return { stdout: '\n' };
      }
      if (cmd === 'npm' && args[0] === '--version') {
        return { stdout: '11.6.0\n' };
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

    const result = await runUpgradePreflight({
      rootDir,
      stateDir,
      sqlitePath,
      commandRunner,
      nodeVersion: 'v22.1.0',
      diskCheckPath: rootDir,
      timeProvider: () => new Date('2024-06-01T10:00:00Z'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedCheck).toBe('node_version');
      expect(result.logs.at(-1)?.name).toBe('node_version');
      expect(result.logs.at(-1)?.status).toBe('failed');
    }
    expect(result.versions).toMatchObject([
      {
        tool: 'node',
        rawDetected: 'v22.1.0',
        detected: '22.1.0',
        constraint: 'v24.10.0',
        constraintSource: '.nvmrc',
        satisfies: false,
      },
    ]);

    const lockPath = path.join(stateDir, 'upgrade.lock');
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('fails when npm version does not satisfy engines constraint', async () => {
    const rootDir = makeTempDir();
    const stateDir = path.join(rootDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    const sqlitePath = path.join(stateDir, 'orchestrator.db');
    new Database(sqlitePath).close();
    fs.writeFileSync(path.join(rootDir, '.nvmrc'), 'v24.10.0\n', 'utf-8');
    fs.writeFileSync(
      path.join(rootDir, 'package.json'),
      JSON.stringify({ engines: { npm: '>=11.0.0' } }, null, 2),
      'utf-8',
    );

    const commandRunner: CommandRunner = vi.fn(async (cmd, args) => {
      if (cmd === 'git' && args[0] === 'status') {
        return { stdout: '\n' };
      }
      if (cmd === 'npm' && args[0] === '--version') {
        return { stdout: '10.0.0\n' };
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

    const result = await runUpgradePreflight({
      rootDir,
      stateDir,
      sqlitePath,
      commandRunner,
      nodeVersion: 'v24.10.0',
      diskCheckPath: rootDir,
      timeProvider: () => new Date('2024-06-01T10:00:00Z'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedCheck).toBe('npm_version');
      expect(result.logs.at(-1)?.name).toBe('npm_version');
      expect(result.logs.at(-1)?.status).toBe('failed');
    }
    expect(result.versions).toMatchObject([
      {
        tool: 'node',
        satisfies: true,
      },
      {
        tool: 'npm',
        rawDetected: '10.0.0',
        detected: '10.0.0',
        constraint: '>=11.0.0',
        satisfies: false,
      },
    ]);

    const lockPath = path.join(stateDir, 'upgrade.lock');
    expect(fs.existsSync(lockPath)).toBe(false);
  });
});
