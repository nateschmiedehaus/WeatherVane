import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';

import type { ProcessManager } from '../process_manager.js';
import { CodexExecutor, ClaudeExecutor } from '../unified_orchestrator.js';

const mockedExeca = vi.mocked(execa);

type ProcessManagerSpies = {
  registerProcess: ReturnType<typeof vi.fn>;
  unregisterProcess: ReturnType<typeof vi.fn>;
  canSpawnProcess: ReturnType<typeof vi.fn>;
  getStatus: ReturnType<typeof vi.fn>;
};

type ExecaResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type MockSubprocess = Promise<ExecaResult> & {
  pid: number;
  kill: ReturnType<typeof vi.fn>;
};

function createProcessManager(overrides: Partial<ProcessManagerSpies> = {}) {
  const spies: ProcessManagerSpies = {
    registerProcess: vi.fn(),
    unregisterProcess: vi.fn(),
    canSpawnProcess: vi.fn().mockReturnValue(true),
    getStatus: vi.fn().mockReturnValue({ activeProcesses: 0, memoryPercent: 10 }),
    ...overrides,
  };

  return {
    manager: spies as unknown as ProcessManager,
    spies,
  };
}

function createSubprocess(result: ExecaResult, pid = 4242): MockSubprocess {
  const kill = vi.fn();
  const promise = Promise.resolve(result) as MockSubprocess;
  promise.pid = pid;
  promise.kill = kill;
  return promise;
}

describe('unified_orchestrator CLI executors', () => {
  beforeEach(() => {
    mockedExeca.mockReset();
  });

  it('blocks Codex execution when the process budget is exhausted', async () => {
    const { manager, spies } = createProcessManager({
      canSpawnProcess: vi.fn().mockReturnValue(false),
      getStatus: vi.fn().mockReturnValue({ activeProcesses: 4 }),
    });

    const executor = new CodexExecutor('/tmp/codex-home');
    executor.setProcessManager(manager);

    const result = await executor.exec('codex-5-high', 'noop', undefined, 'TASK-resource', 5);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Resource limits exceeded - too many concurrent processes or insufficient memory');
    expect(result.duration).toBe(0);
    expect(mockedExeca).not.toHaveBeenCalled();
    expect(spies.registerProcess).not.toHaveBeenCalled();
  });

  it('registers Codex processes with the ProcessManager and cleans up on success', async () => {
    const { manager, spies } = createProcessManager();
    const executor = new CodexExecutor('/opt/codex');
    executor.setProcessManager(manager);

    mockedExeca.mockReturnValueOnce(
      createSubprocess({ exitCode: 0, stdout: 'ok', stderr: '' }, 1111) as any
    );

    const result = await executor.exec('codex-5-medium', 'print("hello")', undefined, 'TASK-123', 3);

    expect(result.success).toBe(true);
    expect(mockedExeca).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining(['exec', '--profile', 'weathervane_orchestrator']),
      expect.objectContaining({
        env: expect.objectContaining({ CODEX_HOME: '/opt/codex' }),
      })
    );

    expect(spies.registerProcess).toHaveBeenCalledTimes(1);
    const handle = spies.registerProcess.mock.calls[0][0];
    expect(handle.provider).toBe('codex');
    expect(handle.taskId).toBe('TASK-123');
    expect(handle.model).toBe('codex-5-medium');
    expect(spies.unregisterProcess).toHaveBeenCalledWith(handle.pid);
  });

  it('registers Claude processes with the ProcessManager and cleans up on success', async () => {
    const { manager, spies } = createProcessManager();
    const executor = new ClaudeExecutor('/tmp/claude-config');
    executor.setProcessManager(manager);

    mockedExeca.mockReturnValueOnce(
      createSubprocess({ exitCode: 0, stdout: 'done', stderr: '' }, 2222) as any
    );

    const result = await executor.exec('claude-3-sonnet', 'run-step', undefined, 'TASK-456', 2);

    expect(result.success).toBe(true);
    expect(mockedExeca).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['exec', '--model', 'claude-3-sonnet']),
      expect.objectContaining({
        input: 'run-step',
        env: expect.objectContaining({ CLAUDE_CONFIG_DIR: '/tmp/claude-config' }),
      })
    );

    expect(spies.registerProcess).toHaveBeenCalledTimes(1);
    const handle = spies.registerProcess.mock.calls[0][0];
    expect(handle.provider).toBe('claude');
    expect(handle.taskId).toBe('TASK-456');
    expect(handle.model).toBe('claude-3-sonnet');
    expect(spies.unregisterProcess).toHaveBeenCalledWith(handle.pid);
  });
});
