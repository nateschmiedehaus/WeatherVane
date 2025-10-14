import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { QualityMonitor } from '../orchestrator/quality_monitor.js';
import { StateMachine } from '../orchestrator/state_machine.js';
import type { LiveFlagsReader } from '../orchestrator/live_flags.js';

describe('QualityMonitor', () => {
  let tempRoot: string;
  let stateMachine: StateMachine;
  let monitor: QualityMonitor;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-monitor-'));
    fs.mkdirSync(path.join(tempRoot, 'state'), { recursive: true });
    stateMachine = new StateMachine(tempRoot);
    monitor = new QualityMonitor(stateMachine, {
      workspaceRoot: tempRoot,
      maxAssessmentEntries: 10,
    });
  });

  afterEach(() => {
    monitor.removeAllListeners();
    stateMachine.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('records multi-dimensional metrics and writes assessment log', async () => {
    const task = stateMachine.createTask({
      id: 'T-quality-check',
      title: 'Implement performance instrumentation',
      description: 'Add instrumentation and documentation touch-ups',
      type: 'task',
      status: 'in_progress',
      estimated_complexity: 4,
    });

    const result = await monitor.evaluate({
      task,
      agentId: 'codex_worker_1',
      agentType: 'codex',
      success: true,
      durationSeconds: 180,
      outputExcerpt: 'Implemented metrics and docs update.',
    });

    expect(result.score).toBeGreaterThan(0.5);
    expect(result.metrics.some((metric) => metric.dimension === 'dimension:code_elegance')).toBe(
      true,
    );
    expect(result.metrics.some((metric) => metric.dimension === 'dimension:overall')).toBe(true);
    expect(result.report.dimension_scores.code_elegance).toBeDefined();

    const storedMetrics = stateMachine.getQualityMetrics({ taskId: task.id });
    expect(storedMetrics.some((metric) => metric.dimension === 'dimension:code_elegance')).toBe(
      true,
    );

    const logPath = path.join(tempRoot, 'state', 'quality', 'assessment_log.json');
    expect(fs.existsSync(logPath)).toBe(true);
    const logContent = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    expect(Array.isArray(logContent.entries)).toBe(true);
    const lastEntry = logContent.entries[logContent.entries.length - 1];
    expect(lastEntry.task_id).toBe(task.id);
    expect(lastEntry.dimension_scores.code_elegance).toBeDefined();
    expect(Array.isArray(lastEntry.world_class_areas)).toBe(true);
  });

  it('flags low scoring dimensions and applies log retention', async () => {
    const task = stateMachine.createTask({
      id: 'T-quality-tests',
      title: 'Add regression tests for pipeline',
      type: 'task',
      status: 'in_progress',
      estimated_complexity: 2,
    });
    task.metadata = { quality_issues: ['critic_failed:tests'] };

    const outcome = await monitor.evaluate({
      task,
      agentId: 'codex_worker_2',
      agentType: 'codex',
      success: true,
      durationSeconds: 90,
      outputExcerpt: 'Initial attempt triggered test critic failure.',
    });

    expect(outcome.issues.some((issue) => issue.includes('testing_coverage'))).toBe(true);

    for (let index = 0; index < 12; index += 1) {
      const followUpTask = stateMachine.createTask({
        id: `T-quality-tests-${index}`,
        title: `Add regression tests iteration ${index}`,
        type: 'task',
        status: 'in_progress',
        estimated_complexity: 2,
      });
      followUpTask.metadata = { quality_issues: ['critic_failed:tests'] };

      await monitor.evaluate({
        task: followUpTask,
        agentId: 'codex_worker_repeat',
        agentType: 'codex',
        success: true,
        durationSeconds: 60 + index,
        outputExcerpt: `Follow-up attempt ${index}`,
      });
    }

    const logPath = path.join(tempRoot, 'state', 'quality', 'assessment_log.json');
    const logContent = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    expect(logContent.entries.length).toBeLessThanOrEqual(10);
  });

  it('limits dimension evaluations when efficient operations flag is enabled', async () => {
    const liveFlags = {
      get: () => ({}),
      getValue: (key: string) => (key === 'EFFICIENT_OPERATIONS' ? '1' : '0'),
    } as unknown as LiveFlagsReader;

    const adaptiveMonitor = new QualityMonitor(stateMachine, {
      workspaceRoot: tempRoot,
      liveFlags,
    });

    const task = stateMachine.createTask({
      id: 'T-efficient-quality',
      title: 'Security hardening review',
      description: 'Review secrets handling and update docs',
      type: 'task',
      status: 'in_progress',
      estimated_complexity: 6,
    });

    const outcome = await adaptiveMonitor.evaluate({
      task,
      agentId: 'codex_worker_secure',
      agentType: 'codex',
      success: true,
      durationSeconds: 240,
    });

    const dimensionMetrics = outcome.metrics.filter((metric) => metric.dimension.startsWith('dimension:') && metric.dimension !== 'dimension:overall');
    expect(dimensionMetrics.length).toBeLessThanOrEqual(6);
    expect(outcome.report.dimension_scores.security_robustness).toBeDefined();

    adaptiveMonitor.removeAllListeners();
  });
});
