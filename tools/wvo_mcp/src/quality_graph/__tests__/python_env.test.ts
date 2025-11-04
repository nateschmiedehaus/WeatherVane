import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureQualityGraphPython } from '../python_env.js';

vi.mock('node:child_process', () => {
  return {
    spawnSync: vi.fn(() => ({ status: 0 })),
  };
});

const { spawnSync } = await import('node:child_process');

const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
  process.env = { ...ORIGINAL_ENV };
}

describe('quality_graph/python_env', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    restoreEnv();
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-graph-env-'));
    mkdirSync(path.join(workspaceRoot, 'tools/wvo_mcp/scripts/quality_graph'), { recursive: true });
    writeFileSync(
      path.join(workspaceRoot, 'tools/wvo_mcp/scripts/quality_graph/requirements.txt'),
      'numpy==1.26.4\n'
    );
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreEnv();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('returns default python when bootstrap is skipped', async () => {
    process.env.QUALITY_GRAPH_SKIP_BOOTSTRAP = '1';
    const pathResult = await ensureQualityGraphPython(workspaceRoot);
    expect(pathResult).toBe('python3');
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('reuses existing environment when hash matches', async () => {
    const venvDir = path.join(workspaceRoot, 'state/quality_graph/.venv');
    const pythonPath = path.join(venvDir, 'bin');
    mkdirSync(pythonPath, { recursive: true });
    writeFileSync(path.join(pythonPath, 'python3'), '', { mode: 0o755 });
    const requirementsPath = path.join(
      workspaceRoot,
      'tools/wvo_mcp/scripts/quality_graph/requirements.txt'
    );
    const hash = 'd5c9c1d7cc92c6d76b7c73110d6d597b7195abbe27169d0e94d55bdac55916d9';
    // hash for empty file? Instead compute from file contents
    const contents = fs.readFileSync(requirementsPath);
    const actualHash = crypto.createHash('sha256').update(contents).digest('hex');
    writeFileSync(path.join(venvDir, '.requirements.hash'), actualHash, 'utf-8');

    const pathResult = await ensureQualityGraphPython(workspaceRoot);
    expect(pathResult).toContain('.venv');
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('bootstraps environment when missing and records hash', async () => {
    const pythonPath = await ensureQualityGraphPython(workspaceRoot);

    expect(spawnSync).toHaveBeenCalledTimes(2);
    const [venvCall, pipCall] = vi.mocked(spawnSync).mock.calls;
    expect(venvCall[0]).toBe('python3');
    expect(venvCall[1]).toEqual(['-m', 'venv', path.join(workspaceRoot, 'state/quality_graph/.venv')]);
    expect(pipCall[0]).toContain('.venv');
    expect(pipCall[1]).toEqual([
      '-m',
      'pip',
      'install',
      '--no-cache-dir',
      '-r',
      path.join(workspaceRoot, 'tools/wvo_mcp/scripts/quality_graph/requirements.txt'),
    ]);
    expect(fs.existsSync(path.join(workspaceRoot, 'state/quality_graph/.venv/.requirements.hash'))).toBe(
      true
    );
    expect(pythonPath).toContain('.venv');
  });
});
