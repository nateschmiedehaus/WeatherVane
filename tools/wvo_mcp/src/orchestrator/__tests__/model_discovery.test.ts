import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';
import { discoverModelCatalog } from '../model_discovery.js';

const mockedExeca = vi.mocked(execa);
type ExecaReturn = Awaited<ReturnType<typeof execa>>;

function mockCli(stdout: string, useOnce = true) {
  const value = { stdout } as unknown as ExecaReturn;
  if (useOnce) {
    mockedExeca.mockResolvedValueOnce(value);
  } else {
    mockedExeca.mockResolvedValue(value);
  }
}

describe('model_discovery', () => {
  let workspaceRoot: string;
  let originalCaptureFlag: string | undefined;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'model-discovery-test-'));
    originalCaptureFlag = process.env.WVO_BROWSER_LOGIN_CAPTURE_DISABLED;
    process.env.WVO_BROWSER_LOGIN_CAPTURE_DISABLED = '1';
  });

  afterEach(async () => {
    mockedExeca.mockReset();
    if (originalCaptureFlag === undefined) {
      delete process.env.WVO_BROWSER_LOGIN_CAPTURE_DISABLED;
    } else {
      process.env.WVO_BROWSER_LOGIN_CAPTURE_DISABLED = originalCaptureFlag;
    }
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it('prefers CLI discovery output and browser login when API keys are absent', async () => {
    mockCli(JSON.stringify([
      { name: 'codex-5-high', context_window: 256000, latency_ms: 900 },
      { name: 'gpt-4o', context_window: 128000 },
    ]));
    mockCli(JSON.stringify({
      models: [{ id: 'claude-sonnet-4.5', latency_ms: 1400 }, { id: 'claude-legacy' }],
    }));

    const result = await discoverModelCatalog({
      workspaceRoot,
      runId: 'run-cli',
      env: {},
    });

    const names = result.models.map(model => model.name);
    expect(names).toContain('codex-5-high');
    expect(names).toContain('claude-sonnet-4.5');
    expect(names.some(name => name.startsWith('gpt'))).toBe(false);
    expect(result.fallbackNotes).toContain('cli_discovery:openai');
    expect(result.fallbackNotes).toContain('cli_discovery:anthropic');
    expect(result.fallbackNotes).toContain('browser_login:openai');
    expect(result.fallbackNotes).toContain('browser_login:anthropic');
  });

  it('falls back to static catalog when CLI is disabled', async () => {
    mockCli(JSON.stringify([{ id: 'claude-sonnet-4.5' }]), false);

    const result = await discoverModelCatalog({
      workspaceRoot,
      runId: 'run-fallback',
      env: {
        WVO_MODEL_DISCOVERY_DISABLE_CLI: '1',
      },
    });

    expect(result.fallbackNotes).toContain('env_missing:openai');
    expect(result.fallbackNotes).toContain('fallback_used:openai');
    expect(result.fallbackNotes).toContain('cli_skipped:anthropic');
  });
});
