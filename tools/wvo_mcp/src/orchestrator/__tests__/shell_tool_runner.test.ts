import { describe, expect, it, vi } from 'vitest';

import type { ProcessManager } from '../process_manager.js';
import { ShellToolRunner } from '../verifier.js';

describe('ShellToolRunner', () => {
  it('registers and unregisters gate processes when a manager is provided', async () => {
    const registerProcess = vi.fn();
    const unregisterProcess = vi.fn();

    const processManager = {
      registerProcess,
      unregisterProcess,
    } as unknown as ProcessManager;

    const runner = new ShellToolRunner({
      workspaceRoot: process.cwd(),
      commands: {
        'tests.run': 'node -e "console.log(\\"ok\\")"',
      },
      processManager,
    });

    const result = await runner.run('tests.run', { taskId: 'TEST-1' });

    expect(result.success).toBe(true);
    expect(registerProcess).toHaveBeenCalledTimes(1);
    expect(unregisterProcess).toHaveBeenCalledTimes(1);

    const handle = registerProcess.mock.calls[0][0];
    expect(handle.provider).toBe('shell');
    expect(handle.model).toBe('gate:tests.run');
    expect(handle.taskId).toBe('TEST-1');
  });
});
