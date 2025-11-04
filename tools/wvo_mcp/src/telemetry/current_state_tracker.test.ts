import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { CurrentStateTracker, type AgentExecutionState } from './current_state_tracker.js';

describe('CurrentStateTracker', () => {
  let tmpDir: string;
  let tracker: CurrentStateTracker;
  let statePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'state-tracker-test-'));
    tracker = new CurrentStateTracker(tmpDir);
    statePath = path.join(tmpDir, 'state', 'telemetry', 'current_state.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('starts tracking a new task', async () => {
    await tracker.startTask('T1', 'Implement feature X', 'implementer');

    const snapshot = await tracker.getSnapshot();

    expect(snapshot.agents['T1']).toBeDefined();
    expect(snapshot.agents['T1'].taskId).toBe('T1');
    expect(snapshot.agents['T1'].taskTitle).toBe('Implement feature X');
    expect(snapshot.agents['T1'].agentType).toBe('implementer');
    expect(snapshot.agents['T1'].currentStage).toBe('specify');
    expect(snapshot.agents['T1'].startedAt).toBeDefined();
    expect(snapshot.agents['T1'].lastUpdatedAt).toBeDefined();
  });

  it('updates task stage', async () => {
    await tracker.startTask('T1', 'Implement feature X');

    await tracker.updateStage('T1', 'implement', { stepsCompleted: 3, stepsTotal: 5, currentStep: 'Writing tests' });

    const snapshot = await tracker.getSnapshot();

    expect(snapshot.agents['T1'].currentStage).toBe('implement');
    expect(snapshot.agents['T1'].progress?.stepsCompleted).toBe(3);
    expect(snapshot.agents['T1'].progress?.stepsTotal).toBe(5);
    expect(snapshot.agents['T1'].progress?.currentStep).toBe('Writing tests');
  });

  it('completes task and removes from state', async () => {
    await tracker.startTask('T1', 'Implement feature X');
    await tracker.startTask('T2', 'Fix bug Y');

    await tracker.completeTask('T1', true);

    const snapshot = await tracker.getSnapshot();

    expect(snapshot.agents['T1']).toBeUndefined();
    expect(snapshot.agents['T2']).toBeDefined();
  });

  it('tracks multiple tasks concurrently', async () => {
    await tracker.startTask('T1', 'Task 1', 'planner');
    await tracker.startTask('T2', 'Task 2', 'implementer');
    await tracker.startTask('T3', 'Task 3', 'reviewer');

    const snapshot = await tracker.getSnapshot();

    expect(Object.keys(snapshot.agents).length).toBe(3);
    expect(snapshot.agents['T1'].agentType).toBe('planner');
    expect(snapshot.agents['T2'].agentType).toBe('implementer');
    expect(snapshot.agents['T3'].agentType).toBe('reviewer');
  });

  it('persists state to disk', async () => {
    await tracker.startTask('T1', 'Implement feature X', 'implementer');
    await tracker.updateStage('T1', 'implement');

    // Read file directly
    const content = await fs.readFile(statePath, 'utf-8');
    const snapshot = JSON.parse(content);

    expect(snapshot.agents['T1']).toBeDefined();
    expect(snapshot.agents['T1'].currentStage).toBe('implement');
  });

  it('loads state from disk on initialization', async () => {
    // Write initial state
    await tracker.startTask('T1', 'Task 1');
    await tracker.startTask('T2', 'Task 2');

    // Create new tracker instance (should load from disk)
    const tracker2 = new CurrentStateTracker(tmpDir);
    await tracker2.load();

    const snapshot = await tracker2.getSnapshot();

    expect(snapshot.agents['T1']).toBeDefined();
    expect(snapshot.agents['T2']).toBeDefined();
  });

  it('handles missing state file gracefully', async () => {
    const tracker2 = new CurrentStateTracker(tmpDir);
    await tracker2.load(); // Should not throw

    const snapshot = await tracker2.getSnapshot();

    expect(Object.keys(snapshot.agents).length).toBe(0);
  });

  it('clears all current state', async () => {
    await tracker.startTask('T1', 'Task 1');
    await tracker.startTask('T2', 'Task 2');
    await tracker.startTask('T3', 'Task 3');

    await tracker.clear();

    const snapshot = await tracker.getSnapshot();

    expect(Object.keys(snapshot.agents).length).toBe(0);
  });

  it('handles update to unknown task gracefully', async () => {
    // Should not throw
    await tracker.updateStage('UNKNOWN', 'implement');

    const snapshot = await tracker.getSnapshot();
    expect(snapshot.agents['UNKNOWN']).toBeUndefined();
  });

  it('handles complete of unknown task gracefully', async () => {
    // Should not throw
    await tracker.completeTask('UNKNOWN', true);

    const snapshot = await tracker.getSnapshot();
    expect(snapshot.agents['UNKNOWN']).toBeUndefined();
  });
});
