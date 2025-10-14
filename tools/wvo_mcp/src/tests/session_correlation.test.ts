import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SessionContext } from '../session.js';
import { StateMachine } from '../orchestrator/state_machine.js';
import type { OrchestratorRuntime } from '../orchestrator/orchestrator_runtime.js';

describe('SessionContext correlation propagation', () => {
  let workspaceRoot: string;
  let originalCwd: string;
  let stateMachine: StateMachine;
  let session: SessionContext;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(path.join(tmpdir(), 'wvo-session-'));
    originalCwd = process.cwd();
    process.chdir(workspaceRoot);

    stateMachine = new StateMachine(workspaceRoot);
    const runtimeStub = {
      getStateMachine: () => stateMachine,
      start: () => {},
      stop: () => {},
    } as unknown as OrchestratorRuntime;

    session = new SessionContext(runtimeStub);
    stateMachine.createTask(
      {
        id: 'T-session',
        title: 'Correlation propagation test',
        type: 'task',
        status: 'pending',
      },
      'test-setup',
    );
  });

  afterEach(() => {
    stateMachine.close();
    process.chdir(originalCwd);
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('uses provided correlation ID when updating plan status', async () => {
    const correlationId = `mcp:test:${Math.random().toString(36).slice(2, 8)}`;
    await session.updatePlanStatus('T-session', 'in_progress', correlationId);

    const events = stateMachine.getEvents({ taskId: 'T-session' });
    const transitionEvent = events.find((event) => event.event_type === 'task_transition');

    expect(transitionEvent?.correlation_id).toBe(correlationId);
  });
});
