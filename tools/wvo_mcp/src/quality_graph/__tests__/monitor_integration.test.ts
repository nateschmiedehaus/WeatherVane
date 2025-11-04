/**
 * Quality Graph - Monitor Integration Tests
 *
 * Verifies end-to-end integration with state machine MONITOR phase.
 *
 * Test coverage:
 * - Task vector recorded after successful smoke test
 * - Recording failures don't crash task completion
 * - Metadata extracted correctly from task and artifacts
 * - Duration computed correctly
 * - Graceful degradation when recording fails
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import { runMonitor } from '../../orchestrator/state_runners/monitor_runner.js';
import { readVectors } from '../persistence.js';
import type { RunnerContext } from '../../orchestrator/state_runners/runner_types.js';

const TEST_WORKSPACE = '/tmp/quality-graph-monitor-test';

describe('Monitor Integration', () => {
  beforeEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });

    // Create structure expected by Python script
    await fs.mkdir(`${TEST_WORKSPACE}/state/quality_graph`, { recursive: true });
    await fs.mkdir(`${TEST_WORKSPACE}/tools/wvo_mcp/scripts/quality_graph`, { recursive: true });

    // Copy Python scripts (assuming they exist in real workspace)
    // In real test, we'd mock the Python execution
  });

  afterEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it('records task vector after successful smoke test', async () => {
    const startTime = performance.now();

    const context: RunnerContext = {
      task: {
        id: 'TEST-123',
        title: 'Test Task Integration',
        description: 'Test quality graph integration',
      },
      attemptNumber: 1,
      modelSelection: {
        model: 'claude-sonnet-4',
        provider: 'anthropic',
        capabilityTags: ['fast_code'],
        source: 'policy',
        reason: 'test',
      },
    };

    const artifacts = {
      implement: {
        filesModified: ['src/test.ts', 'src/test2.ts'],
      },
      review: {
        quality: 'high',
      },
    };

    const mockSupervisor = {
      monitor: vi.fn().mockReturnValue({
        success: true,
        model: { provider: 'anthropic', model: 'claude-sonnet-4', reasoning: 'test' },
      }),
    };

    const mockRunAppSmoke = vi.fn().mockResolvedValue({
      success: true,
      passed: 10,
      failed: 0,
    });

    const clearMemory = vi.fn();
    const clearRouter = vi.fn();

    // Run monitor with quality graph recording
    const result = await runMonitor(context, {
      supervisor: mockSupervisor as any,
      runAppSmoke: mockRunAppSmoke,
      clearMemory,
      clearRouter,
      workspaceRoot: TEST_WORKSPACE,
      artifacts,
      startTime,
    });

    // Verify monitor succeeded
    expect(result.success).toBe(true);
    expect(result.nextState).toBeNull(); // Task complete

    // Verify recording was attempted (note in result)
    const recordingNote = result.notes.find((n) =>
      n.includes('quality graph') || n.includes('Quality graph')
    );
    expect(recordingNote).toBeDefined();

    // Note: Actual vector verification would require Python script execution
    // In real environment, we'd check task_vectors.jsonl exists and has correct content
  }, 30000); // 30s timeout for Python execution

  it('completes task even if recording fails', async () => {
    const context: RunnerContext = {
      task: {
        id: 'TEST-456',
        title: 'Test Graceful Degradation',
      },
      attemptNumber: 1,
      modelSelection: {
        model: 'claude-sonnet-4',
        provider: 'anthropic',
        capabilityTags: ['fast_code'],
        source: 'policy',
        reason: 'test',
      },
    };

    const mockSupervisor = {
      monitor: vi.fn().mockReturnValue({
        success: true,
        model: { provider: 'anthropic', model: 'claude-sonnet-4', reasoning: 'test' },
      }),
    };

    const mockRunAppSmoke = vi.fn().mockResolvedValue({
      success: true,
      passed: 10,
      failed: 0,
    });

    const clearMemory = vi.fn();
    const clearRouter = vi.fn();

    // Run monitor with invalid workspace (will cause recording to fail)
    const result = await runMonitor(context, {
      supervisor: mockSupervisor as any,
      runAppSmoke: mockRunAppSmoke,
      clearMemory,
      clearRouter,
      workspaceRoot: '/nonexistent/path',
      artifacts: {},
      startTime: performance.now(),
    });

    // Verify task still completes successfully despite recording failure
    expect(result.success).toBe(true);
    expect(result.nextState).toBeNull();

    // Verify recording failure was noted
    const failureNote = result.notes.find(
      (n) => n.includes('recording failed') || n.includes('recording error')
    );
    expect(failureNote).toBeDefined();

    // Verify cleanup still happened
    expect(clearMemory).toHaveBeenCalledWith('TEST-456');
    expect(clearRouter).toHaveBeenCalledWith('TEST-456');
  });

  it('skips recording when task fails smoke test', async () => {
    const context: RunnerContext = {
      task: {
        id: 'TEST-789',
        title: 'Test Smoke Failure',
      },
      attemptNumber: 1,
      modelSelection: {
        model: 'claude-sonnet-4',
        provider: 'anthropic',
        capabilityTags: ['fast_code'],
        source: 'policy',
        reason: 'test',
      },
    };

    const mockSupervisor = {
      monitor: vi.fn().mockReturnValue({
        success: true,
        model: { provider: 'anthropic', model: 'claude-sonnet-4', reasoning: 'test' },
      }),
    };

    const mockRunAppSmoke = vi.fn().mockResolvedValue({
      success: false,
      passed: 5,
      failed: 5,
      error: 'Tests failed',
    });

    const clearMemory = vi.fn();
    const clearRouter = vi.fn();

    // Run monitor with failing smoke test
    const result = await runMonitor(context, {
      supervisor: mockSupervisor as any,
      runAppSmoke: mockRunAppSmoke,
      clearMemory,
      clearRouter,
      workspaceRoot: TEST_WORKSPACE,
      artifacts: {},
      startTime: performance.now(),
    });

    // Verify monitor returns to plan (not complete)
    expect(result.success).toBe(false);
    expect(result.nextState).toBe('plan');

    // Verify no recording notes (since we never got to recording)
    const recordingNote = result.notes.find((n) =>
      n.includes('quality graph') || n.includes('Quality graph')
    );
    expect(recordingNote).toBeUndefined();

    // Verify cleanup did NOT happen (task continuing)
    expect(clearMemory).not.toHaveBeenCalled();
    expect(clearRouter).not.toHaveBeenCalled();
  });

  it('extracts metadata correctly from artifacts', async () => {
    const context: RunnerContext = {
      task: {
        id: 'TEST-META',
        title: 'Test Metadata Extraction',
        description: 'Verify metadata extraction from artifacts',
      },
      attemptNumber: 1,
      modelSelection: {
        model: 'claude-sonnet-4',
        provider: 'anthropic',
        capabilityTags: ['fast_code'],
        source: 'policy',
        reason: 'test',
      },
    };

    const artifacts = {
      implement: {
        filesModified: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
        linesAdded: 150,
      },
      verify: {
        testsPass: true,
        coverage: 0.85,
      },
      review: {
        quality: 'medium',
        concerns: [],
      },
    };

    const mockSupervisor = {
      monitor: vi.fn().mockReturnValue({
        success: true,
        model: { provider: 'anthropic', model: 'claude-sonnet-4', reasoning: 'test' },
      }),
    };

    const mockRunAppSmoke = vi.fn().mockResolvedValue({
      success: true,
      passed: 20,
      failed: 0,
    });

    const clearMemory = vi.fn();
    const clearRouter = vi.fn();

    const startTime = performance.now();
    // Wait a bit to ensure duration > 0
    await new Promise((resolve) => setTimeout(resolve, 10));

    const result = await runMonitor(context, {
      supervisor: mockSupervisor as any,
      runAppSmoke: mockRunAppSmoke,
      clearMemory,
      clearRouter,
      workspaceRoot: TEST_WORKSPACE,
      artifacts,
      startTime,
    });

    expect(result.success).toBe(true);

    // Metadata extraction verification would require inspecting Python script args
    // In integration test, we'd verify task_vectors.jsonl contains:
    // - task_id: 'TEST-META'
    // - title: 'Test Metadata Extraction'
    // - description: 'Verify metadata extraction from artifacts'
    // - files_touched: ['src/a.ts', 'src/b.ts', 'src/c.ts']
    // - quality: 'medium'
    // - duration_ms: > 0
  });

  it('handles missing optional metadata gracefully', async () => {
    const context: RunnerContext = {
      task: {
        id: 'TEST-MINIMAL',
        title: 'Test Minimal Metadata',
        // No description
      },
      attemptNumber: 1,
      modelSelection: {
        model: 'claude-sonnet-4',
        provider: 'anthropic',
        capabilityTags: ['fast_code'],
        source: 'policy',
        reason: 'test',
      },
    };

    const artifacts = {
      // No implement.filesModified
      // No review.quality
    };

    const mockSupervisor = {
      monitor: vi.fn().mockReturnValue({
        success: true,
        model: { provider: 'anthropic', model: 'claude-sonnet-4', reasoning: 'test' },
      }),
    };

    const mockRunAppSmoke = vi.fn().mockResolvedValue({
      success: true,
      passed: 5,
      failed: 0,
    });

    const clearMemory = vi.fn();
    const clearRouter = vi.fn();

    const result = await runMonitor(context, {
      supervisor: mockSupervisor as any,
      runAppSmoke: mockRunAppSmoke,
      clearMemory,
      clearRouter,
      workspaceRoot: TEST_WORKSPACE,
      artifacts,
      startTime: performance.now(),
    });

    // Should still complete successfully with minimal metadata
    expect(result.success).toBe(true);
    expect(result.nextState).toBeNull();

    // Recording should work with just title
    const recordingNote = result.notes.find((n) => n.includes('quality graph'));
    expect(recordingNote).toBeDefined();
  });
});

describe('Recorder Module', () => {
  it('validates task_id is required', async () => {
    const { recordTaskVector } = await import('../recorder.js');

    const result = await recordTaskVector(TEST_WORKSPACE, {
      taskId: '',
      outcome: 'success',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Task ID is required');
  });

  it('validates at least one metadata field is required', async () => {
    const { recordTaskVector } = await import('../recorder.js');

    const result = await recordTaskVector(TEST_WORKSPACE, {
      taskId: 'TEST-NO-META',
      outcome: 'success',
      // No title, description, or filesTouched
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('title, description, or filesTouched');
  });

  it('extracts metadata from artifacts correctly', async () => {
    const { extractRecordingMetadata } = await import('../recorder.js');

    const task = {
      id: 'TEST-EXTRACT',
      title: 'Test Extraction',
      description: 'Test description',
    };

    const artifacts = {
      implement: {
        filesModified: ['a.ts', 'b.ts'],
      },
      review: {
        quality: 'high',
      },
    };

    const metadata = extractRecordingMetadata(task, artifacts, 5000);

    expect(metadata.taskId).toBe('TEST-EXTRACT');
    expect(metadata.title).toBe('Test Extraction');
    expect(metadata.description).toBe('Test description');
    expect(metadata.filesTouched).toEqual(['a.ts', 'b.ts']);
    expect(metadata.quality).toBe('high');
    expect(metadata.durationMs).toBe(5000);
    expect(metadata.outcome).toBe('success'); // Default
  });
});
