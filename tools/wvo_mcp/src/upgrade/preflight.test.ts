import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { UpgradePreflightOptions, CommandRunner } from './preflight.js';
import { runUpgradePreflight } from './preflight.js';

describe('Upgrade Preflight', () => {
  let tempDir: string;
  let stateDir: string;

  const DEFAULT_DF_OUTPUT =
    'Filesystem   1K-blocks       Used Available Use% Mounted on\n/dev/disk1s1 976562176 500000000 476562176  51% /';

  interface BasicRunnerOptions {
    gitStatusOutput?: string;
    npmVersionOutput?: string;
    dfOutput?: string;
    whichAvailability?: Record<string, boolean>;
  }

  const createBasicMockCommandRunner = (options: BasicRunnerOptions = {}): CommandRunner => {
    const {
      gitStatusOutput = '',
      npmVersionOutput = '10.0.0',
      dfOutput = DEFAULT_DF_OUTPUT,
      whichAvailability = { docker: true, bwrap: false },
    } = options;

    return async (cmd, args) => {
      if (cmd === 'git' && args[0] === 'status') {
        return { stdout: gitStatusOutput };
      }
      if (cmd === 'npm' && args[0] === '--version') {
        return { stdout: `${npmVersionOutput}\n` };
      }
      if (cmd === 'df') {
        return { stdout: dfOutput };
      }
      if (cmd === 'which') {
        const target = args[0] ?? '';
        const available = whichAvailability[target] ?? false;
        if (!available) {
          throw new Error(`which: ${target} not found`);
        }
        return { stdout: `/usr/local/bin/${target}\n` };
      }
      return { stdout: '' };
    };
  };

  const setupPackageJson = () => {
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        engines: {
          node: '>=18.0.0',
          npm: '>=9.0.0',
        },
      }),
    );
  };

  const setupSandboxArtifact = () => {
    const sandboxArtifactDir = path.join(tempDir, 'experiments', 'meta');
    fs.mkdirSync(sandboxArtifactDir, { recursive: true });
    fs.writeFileSync(
      path.join(sandboxArtifactDir, 'sandbox_run.json'),
      JSON.stringify({
        dry_run: true,
        generated_at: new Date().toISOString(),
      }),
    );
  };

  beforeEach(() => {
    // Create temporary directories for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-test-'));
    stateDir = path.join(tempDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    const sqlitePath = path.join(stateDir, 'orchestrator.db');
    const Database = require('better-sqlite3');
    const db = new Database(sqlitePath);
    db.close();
  });

  afterEach(() => {
    // Clean up temporary directories
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('upgrade.lock', () => {
    it('creates upgrade.lock at preflight start', async () => {
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');
      const mockCommandRunner = createBasicMockCommandRunner();

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        commandRunner: mockCommandRunner,
      });

      // Lock should be cleaned up after execution, but should have existed during run
      expect(fs.existsSync(upgradeLockPath)).toBe(false);
      expect(result.ok).toBe(true);
    });

    it('fails if upgrade.lock already exists (concurrent upgrade)', async () => {
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');
      fs.mkdirSync(path.dirname(upgradeLockPath), { recursive: true });
      fs.writeFileSync(
        upgradeLockPath,
        JSON.stringify({
          created_at: new Date().toISOString(),
          hostname: os.hostname(),
          pid: process.pid,
        }),
      );

      const mockCommandRunner = createBasicMockCommandRunner();

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        commandRunner: mockCommandRunner,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('upgrade_aborted');
        expect(result.failedCheck).toBe('upgrade_lock');
      }
    });

    it('removes upgrade.lock even on failure', async () => {
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');
      const mockCommandRunner: CommandRunner = async () => {
        throw new Error('Simulated failure');
      };

      await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        commandRunner: mockCommandRunner,
      });

      // Lock should be cleaned up even on error
      expect(fs.existsSync(upgradeLockPath)).toBe(false);
    });
  });

  describe('git_clean check', () => {
    it('passes when git status is clean', async () => {
      const mockCommandRunner = createBasicMockCommandRunner();
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        commandRunner: mockCommandRunner,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const gitCheck = result.logs.find((log) => log.name === 'git_clean');
        expect(gitCheck?.status).toBe('passed');
      }
    });

    it('fails when git status has uncommitted changes', async () => {
      const baseRunner = createBasicMockCommandRunner();
      const mockCommandRunner: CommandRunner = async (cmd, args) => {
        if (cmd === 'git' && args[0] === 'status') {
          return { stdout: ' M package.json\n ?? new_file.ts' };
        }
        return baseRunner(cmd, args);
      };
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        commandRunner: mockCommandRunner,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failedCheck).toBe('git_clean');
        expect(result.error).toBe('upgrade_aborted');
      }
    });
  });

  describe('node_version check', () => {
    it('passes when Node version satisfies constraint', async () => {
      // Setup a package.json with Node version constraint
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          engines: {
            node: '>=18.0.0',
            npm: '>=9.0.0',
          },
        }),
      );

      const mockCommandRunner = createBasicMockCommandRunner();
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        nodeVersion: 'v18.12.0',
        minimumNodeMajor: 18,
        commandRunner: mockCommandRunner,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const nodeVersion = result.versions.find((v) => v.tool === 'node');
        expect(nodeVersion?.satisfies).toBe(true);
        expect(nodeVersion?.detected).toMatch(/18\.\d+\.\d+/);
      }
    });

    it('fails when Node version does not satisfy constraint', async () => {
      // Setup a package.json with Node version constraint requiring 18+
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          engines: {
            node: '>=18.0.0',
            npm: '>=9.0.0',
          },
        }),
      );

      const mockCommandRunner = createBasicMockCommandRunner();
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        nodeVersion: 'v16.13.0',
        minimumNodeMajor: 18,
        commandRunner: mockCommandRunner,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failedCheck).toBe('node_version');
      }
    });

    it('logs version evidence when Node version check is performed', async () => {
      // Setup a package.json with Node version constraint
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          engines: {
            node: '>=18.0.0',
            npm: '>=9.0.0',
          },
        }),
      );

      const mockCommandRunner = createBasicMockCommandRunner();
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        nodeVersion: 'v18.12.0',
        minimumNodeMajor: 18,
        commandRunner: mockCommandRunner,
      });

      if (result.ok) {
        const nodeVersion = result.versions.find((v) => v.tool === 'node');
        expect(nodeVersion).toBeDefined();
        expect(nodeVersion?.rawDetected).toBe('v18.12.0');
        expect(nodeVersion?.detected).toBeDefined();
      }
    });
  });

  describe('npm_version check', () => {
    it('passes when npm version satisfies constraint', async () => {
      // Setup a package.json with npm version constraint
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          engines: {
            node: '>=18.0.0',
            npm: '>=9.0.0',
          },
        }),
      );

      const mockCommandRunner = createBasicMockCommandRunner();
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        nodeVersion: 'v18.12.0',
        minimumNpmMajor: 9,
        commandRunner: mockCommandRunner,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const npmCheck = result.logs.find((log) => log.name === 'npm_version');
        expect(npmCheck?.status).toBe('passed');
      }
    });
  });

  describe('disk_space check', () => {
    it('passes when disk space is above threshold', async () => {
      // Setup a package.json
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          engines: {
            node: '>=18.0.0',
            npm: '>=9.0.0',
          },
        }),
      );

      const mockCommandRunner = createBasicMockCommandRunner();
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        nodeVersion: 'v18.12.0',
        requiredDiskMb: 500,
        commandRunner: mockCommandRunner,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const diskCheck = result.logs.find((log) => log.name === 'disk_space');
        expect(diskCheck?.status).toBe('passed');
      }
    });

    it('fails when disk space is below threshold', async () => {
      // Setup a package.json
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          engines: {
            node: '>=18.0.0',
            npm: '>=9.0.0',
          },
        }),
      );

      const baseRunner = createBasicMockCommandRunner();
      const mockCommandRunner: CommandRunner = async (cmd, args) => {
        if (cmd === 'df') {
          return {
            stdout:
              'Filesystem   1K-blocks       Used Available Use% Mounted on\n/dev/disk1s1 976562176 900000000 100000  95% /',
          };
        }
        return baseRunner(cmd, args);
      };
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        nodeVersion: 'v18.12.0',
        requiredDiskMb: 500,
        commandRunner: mockCommandRunner,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failedCheck).toBe('disk_space');
      }
    });
  });

  describe('sandbox_tooling check', () => {
    it('passes when sandbox artifact is present and valid', async () => {
      // Setup package.json
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          engines: {
            node: '>=18.0.0',
            npm: '>=9.0.0',
          },
        }),
      );

      const sandboxArtifactDir = path.join(tempDir, 'experiments', 'meta');
      fs.mkdirSync(sandboxArtifactDir, { recursive: true });
      fs.writeFileSync(
        path.join(sandboxArtifactDir, 'sandbox_run.json'),
        JSON.stringify({
          dry_run: true,
          generated_at: new Date().toISOString(),
        }),
      );

      const mockCommandRunner = createBasicMockCommandRunner({
        whichAvailability: { docker: false, bwrap: false },
      });
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        nodeVersion: 'v18.12.0',
        commandRunner: mockCommandRunner,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const sandboxCheck = result.logs.find((log) => log.name === 'sandbox_tooling');
        expect(sandboxCheck?.status).toBe('passed');
      }
    });

    it('fails when sandbox artifact is missing', async () => {
      // Setup package.json
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          engines: {
            node: '>=18.0.0',
            npm: '>=9.0.0',
          },
        }),
      );

      const mockCommandRunner = createBasicMockCommandRunner({
        whichAvailability: { docker: false, bwrap: false },
      });
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        nodeVersion: 'v18.12.0',
        commandRunner: mockCommandRunner,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failedCheck).toBe('sandbox_tooling');
      }
    });

    it('fails when sandbox artifact missing dry_run flag', async () => {
      setupPackageJson();

      const sandboxArtifactDir = path.join(tempDir, 'experiments', 'meta');
      fs.mkdirSync(sandboxArtifactDir, { recursive: true });
      fs.writeFileSync(
        path.join(sandboxArtifactDir, 'sandbox_run.json'),
        JSON.stringify({
          generated_at: new Date().toISOString(),
        }),
      );

      const mockCommandRunner = createBasicMockCommandRunner({
        whichAvailability: { docker: false, bwrap: false },
      });
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        nodeVersion: 'v18.12.0',
        commandRunner: mockCommandRunner,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failedCheck).toBe('sandbox_tooling');
      }
    });
  });

  describe('sqlite_roundtrip check', () => {
    it('passes when SQLite database accepts BEGIN/ROLLBACK', async () => {
      // Setup package.json
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          engines: {
            node: '>=18.0.0',
            npm: '>=9.0.0',
          },
        }),
      );

      const mockCommandRunner = createBasicMockCommandRunner();
      const sqlitePath = path.join(stateDir, 'orchestrator.db');

      // Create a valid SQLite database file
      const Database = require('better-sqlite3');
      const db = new Database(sqlitePath);
      db.close();

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        sqlitePath,
        nodeVersion: 'v18.12.0',
        commandRunner: mockCommandRunner,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const sqliteCheck = result.logs.find((log) => log.name === 'sqlite_roundtrip');
        expect(sqliteCheck?.status).toBe('passed');
      }
    });
  });

  describe('gate sequence', () => {
    it('initializes all gates as pending', async () => {
      // Setup package.json
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          engines: {
            node: '>=18.0.0',
            npm: '>=9.0.0',
          },
        }),
      );

      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');
      const sandboxArtifactDir = path.join(tempDir, 'experiments', 'meta');
      fs.mkdirSync(sandboxArtifactDir, { recursive: true });
      fs.writeFileSync(
        path.join(sandboxArtifactDir, 'sandbox_run.json'),
        JSON.stringify({
          dry_run: true,
          generated_at: new Date().toISOString(),
        }),
      );

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        nodeVersion: 'v18.12.0',
        commandRunner: createBasicMockCommandRunner(),
      });

      if (result.ok) {
        expect(result.gates).toHaveLength(4);
        expect(result.gates.map((g) => g.gate)).toEqual(['build', 'unit', 'selfchecks', 'canary_ready']);
        expect(result.gates.every((g) => g.status === 'pending')).toBe(true);
      }
    });

    it('records gates with timestamps', async () => {
      // Setup package.json
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          engines: {
            node: '>=18.0.0',
            npm: '>=9.0.0',
          },
        }),
      );

      const mockCommandRunner = createBasicMockCommandRunner();
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');
      const sandboxArtifactDir = path.join(tempDir, 'experiments', 'meta');
      fs.mkdirSync(sandboxArtifactDir, { recursive: true });
      fs.writeFileSync(
        path.join(sandboxArtifactDir, 'sandbox_run.json'),
        JSON.stringify({
          dry_run: true,
          generated_at: new Date().toISOString(),
        }),
      );

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        nodeVersion: 'v18.12.0',
        commandRunner: mockCommandRunner,
      });

      if (result.ok) {
        result.gates.forEach((gate) => {
          expect(gate.timestamp).toBeDefined();
          expect(new Date(gate.timestamp).getTime()).toBeGreaterThan(0);
        });
      }
    });
  });

  describe('preflight logs', () => {
    it('logs all successful checks', async () => {
      // Setup package.json
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          engines: {
            node: '>=18.0.0',
            npm: '>=9.0.0',
          },
        }),
      );

      const mockCommandRunner = createBasicMockCommandRunner();
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');
      const sandboxArtifactDir = path.join(tempDir, 'experiments', 'meta');
      fs.mkdirSync(sandboxArtifactDir, { recursive: true });
      fs.writeFileSync(
        path.join(sandboxArtifactDir, 'sandbox_run.json'),
        JSON.stringify({
          dry_run: true,
          generated_at: new Date().toISOString(),
        }),
      );

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        nodeVersion: 'v18.12.0',
        commandRunner: mockCommandRunner,
      });

      if (result.ok) {
        const checkNames = result.logs.map((log) => log.name);
        expect(checkNames).toContain('git_clean');
        expect(checkNames).toContain('node_version');
        expect(checkNames).toContain('npm_version');
        expect(checkNames).toContain('disk_space');
        expect(checkNames).toContain('sandbox_tooling');
        expect(checkNames).toContain('sqlite_roundtrip');
      }
    });

    it('logs with timestamps for each check', async () => {
      // Setup package.json
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          engines: {
            node: '>=18.0.0',
            npm: '>=9.0.0',
          },
        }),
      );

      const mockCommandRunner = createBasicMockCommandRunner();
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');
      const sandboxArtifactDir = path.join(tempDir, 'experiments', 'meta');
      fs.mkdirSync(sandboxArtifactDir, { recursive: true });
      fs.writeFileSync(
        path.join(sandboxArtifactDir, 'sandbox_run.json'),
        JSON.stringify({
          dry_run: true,
          generated_at: new Date().toISOString(),
        }),
      );

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        nodeVersion: 'v18.12.0',
        commandRunner: mockCommandRunner,
      });

      if (result.ok) {
        result.logs.forEach((log) => {
          expect(log.timestamp).toBeDefined();
          expect(new Date(log.timestamp).getTime()).toBeGreaterThan(0);
        });
      }
    });
  });

  describe('error handling and recovery', () => {
    it('returns upgrade_aborted error on first failure', async () => {
      let commandCount = 0;
      const mockCommandRunner: CommandRunner = async () => {
        commandCount++;
        if (commandCount === 1) {
          throw new Error('Git command failed');
        }
        return { stdout: '' };
      };
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        commandRunner: mockCommandRunner,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('upgrade_aborted');
      }
    });

    it('captures failure details in logs', async () => {
      const mockCommandRunner: CommandRunner = async () => {
        throw new Error('Test failure message');
      };
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        commandRunner: mockCommandRunner,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        const failureLogs = result.logs.filter((log) => log.status === 'failed');
        expect(failureLogs.length).toBeGreaterThan(0);
        expect(failureLogs[0]?.details).toBeDefined();
      }
    });
  });

  describe('outcome structure', () => {
    it('returns UpgradePreflightSuccess on all checks passed', async () => {
      setupPackageJson();
      setupSandboxArtifact();

      // Create SQLite database
      const Database = require('better-sqlite3');
      const sqlitePath = path.join(stateDir, 'orchestrator.db');
      const db = new Database(sqlitePath);
      db.close();

      const mockCommandRunner = createBasicMockCommandRunner();
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        nodeVersion: 'v18.12.0',
        commandRunner: mockCommandRunner,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.logs).toBeDefined();
        expect(result.gates).toBeDefined();
        expect(result.versions).toBeDefined();
      }
    });

    it('returns UpgradePreflightFailure with error on check failure', async () => {
      // Setup package.json
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          engines: {
            node: '>=18.0.0',
            npm: '>=9.0.0',
          },
        }),
      );

      const mockCommandRunner: CommandRunner = async () => {
        throw new Error('Simulated failure');
      };
      const upgradeLockPath = path.join(stateDir, 'upgrade.lock');

      const result = await runUpgradePreflight({
        rootDir: tempDir,
        stateDir,
        upgradeLockPath,
        nodeVersion: 'v18.12.0',
        commandRunner: mockCommandRunner,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('upgrade_aborted');
        expect(result.failedCheck).toBeDefined();
        expect(result.logs).toBeDefined();
        expect(result.gates).toBeDefined();
        expect(result.versions).toBeDefined();
      }
    });
  });
});
