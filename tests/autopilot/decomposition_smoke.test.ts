import { describe, it, expect } from 'vitest';
import { StateMachine, Task } from '../../tools/wvo_mcp/src/orchestrator/state_machine.js';
import { TaskDecomposer } from '../../tools/wvo_mcp/src/orchestrator/task_decomposer.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

describe('Autopilot Smoke', () => {
  it('decomposes a single epic without exceeding limits', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-smoke-'));
    const stateMachine = new StateMachine(workspaceRoot, { readonly: false });
    const decomposer = new TaskDecomposer(stateMachine, workspaceRoot);

    const epic: Task = {
      id: 'E-smoke',
      title: 'Smoke epic',
      description: 'validate decomposition',
      type: 'epic',
      status: 'pending',
      created_at: Date.now(),
    };

    stateMachine.createTask(epic);
    const result = await decomposer.decompose(epic);
    expect(result.shouldDecompose).toBe(true);
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });
});
