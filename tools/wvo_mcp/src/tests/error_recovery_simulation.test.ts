import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runErrorRecoverySimulation } from '../simulations/error_recovery.js';

describe('Error recovery simulation', () => {
  it('captures checkpoint and kill-switch lifecycle', async () => {
    const { summary, workspaceRoot } = await runErrorRecoverySimulation({
      retainWorkspace: true,
      observationDelayMs: 0,
    });

    expect(summary.task_id).toBe('T-error-recovery');
    expect(summary.samples.length).toBeGreaterThanOrEqual(3);

    const contextLimitSample = summary.samples.find(
      (sample) => sample.step === 'context_limit_recovery',
    );
    expect(contextLimitSample).toBeDefined();
    expect(contextLimitSample?.checkpointCreated).toBe(true);
    expect(typeof contextLimitSample?.checkpointSession).toBe('string');
    expect(summary.checkpoint?.snapshot_keys).toContain('trigger');

    const finalSample = summary.samples.at(-1);
    expect(finalSample?.step).toBe('second_context_limit');
    expect(finalSample?.action?.action).toBe('fail_task');
    expect(finalSample?.killSwitchBefore).toBe(false);
    expect(finalSample?.killSwitchAfter).toBe(false);
    expect(finalSample?.incidentsLogged).toBeGreaterThan(0);

    const { initial_state, engaged_state, final_state } = summary.safety_window;
    expect(initial_state.killSwitchEngaged).toBe(false);
    expect(engaged_state.killSwitchEngaged).toBe(true);
    expect(final_state.killSwitchEngaged).toBe(false);
    expect(final_state.metadata?.observation_window_seconds).toBe(600);
    expect(final_state.metadata?.rollback_completed_at).toBeTypeOf('string');

    const safetyPath = path.join(workspaceRoot, 'state', 'safety_state.json');
    const persistedSafety = JSON.parse(await fs.readFile(safetyPath, 'utf8'));
    expect(persistedSafety.killSwitchEngaged).toBe(false);
    expect(Array.isArray(persistedSafety.incidents)).toBe(true);
    expect(persistedSafety.incidents.length).toBeGreaterThan(0);

    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });
});
