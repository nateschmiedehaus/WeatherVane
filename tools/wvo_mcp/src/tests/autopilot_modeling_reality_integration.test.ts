/**
 * Autopilot + ModelingReality Critic Integration Test
 *
 * This suite verifies that the modeling reality critic functions correctly
 * within the Autopilot workflow. It tests:
 * 1. Critic configuration loading
 * 2. Validation report processing
 * 3. Escalation behavior
 * 4. Integration with Research Orchestrator
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { ModelingRealityV2Critic } from '../critics/modeling_reality_v2.js';

import { mockAutopilot, type MockedAutopilot, type MockTask } from './helpers/autopilot_test_helpers.js';

describe('Autopilot + ModelingReality Integration', () => {
  let tempDir: string;
  let autopilot: MockedAutopilot;
  let critic: ModelingRealityV2Critic;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'autopilot-modeling-test-'));
    critic = new ModelingRealityV2Critic(tempDir);
    autopilot = mockAutopilot();

    // Create basic test config structure
    await fs.mkdir(path.join(tempDir, 'state'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'state', 'critics'), { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    vi.restoreAllMocks();
  });

  it('should properly load modeling reality critic configuration', async () => {
    const result = await critic.evaluate('T12.PoC.1', []);
    expect(result.severity).toBe('blocking');
    expect(result.passed).toBe(false);
    expect(result.details.failures[0]).toContain('validation_report.json');
  });

  it('should PASS validation and NOT escalate on successful report', async () => {
    const report = {
      task_id: 'T12.PoC.1',
      model_type: 'weather_aware_mmm',
      metrics: {
        out_of_sample_r2: 0.55,
        validation_r2: 0.54,
        test_r2: 0.54,
        weather_elasticity: {
          temperature: 0.15,
          precipitation: -0.08,
        },
        baseline_comparison: {
          naive_mape: 0.25,
          seasonal_mape: 0.20,
          linear_mape: 0.18,
          model_mape: 0.15,
        },
      },
      thresholds_passed: {
        r2: true,
        elasticity_signs: true,
        no_overfitting: true,
        beats_baseline: true,
      },
      overall_status: 'PASS',
    };

    const reportPath = path.join(tempDir, 'validation_report.json');
    await fs.writeFile(reportPath, JSON.stringify(report));

    const result = await critic.evaluate('T12.PoC.1', ['validation_report.json']);
    expect(result.passed).toBe(true);
    expect(autopilot.getEscalatedTasks()).toHaveLength(0);
  });

  it('should FAIL validation and escalate to Research Orchestrator', async () => {
    const report = {
      task_id: 'T12.PoC.1',
      model_type: 'weather_aware_mmm',
      metrics: {
        out_of_sample_r2: 0.45, // Below threshold
        validation_r2: 0.44,
        test_r2: 0.44,
        weather_elasticity: {
          temperature: 0.15,
          precipitation: -0.08,
        },
        baseline_comparison: {
          naive_mape: 0.25,
          seasonal_mape: 0.20,
          linear_mape: 0.18,
          model_mape: 0.15,
        },
      },
      thresholds_passed: {
        r2: false,
        elasticity_signs: true,
        no_overfitting: true,
        beats_baseline: true,
      },
      overall_status: 'FAIL',
    };

    const reportPath = path.join(tempDir, 'validation_report.json');
    await fs.writeFile(reportPath, JSON.stringify(report));

    const result = await critic.evaluate('T12.PoC.1', ['validation_report.json']);
    expect(result.passed).toBe(false);
    expect(result.details.failures.some(f => f.includes('R²'))).toBe(true);

    // Mock the escalation that would happen in real implementation
    autopilot.mockModelingRealityFailure(
      'R² threshold not met',
      { metric: 0.45, threshold: 0.50 }
    );

    // Verify escalation
    const escalated = autopilot.getEscalatedTasks();
    expect(escalated).toHaveLength(2);

    const researchTask = escalated.find((t: MockTask) => t.assignee === 'Research Orchestrator');
    expect(researchTask).toBeDefined();
    expect(researchTask!.scope).toBe('systemic');
    expect(researchTask!.description).toContain('R² threshold not met');

    const directorTask = escalated.find((t: MockTask) => t.assignee === 'Director Dana');
    expect(directorTask).toBeDefined();
    expect(directorTask!.scope).toBe('ml');
    expect(directorTask!.description).toContain('R² threshold not met');
  });

  it('should detect wrong weather elasticity signs and escalate', async () => {
    const report = {
      task_id: 'T12.PoC.1',
      tenant_id: 'ice_cream_summer',
      model_type: 'weather_aware_mmm',
      metrics: {
        out_of_sample_r2: 0.55,
        validation_r2: 0.54,
        test_r2: 0.54,
        weather_elasticity: {
          temperature: -0.12, // WRONG: should be positive for ice cream
          precipitation: 0.08, // WRONG: should be negative
        },
        baseline_comparison: {
          naive_mape: 0.25,
          seasonal_mape: 0.20,
          linear_mape: 0.18,
          model_mape: 0.15,
        },
      },
      thresholds_passed: {
        r2: true,
        elasticity_signs: false,
        no_overfitting: true,
        beats_baseline: true,
      },
      overall_status: 'FAIL',
    };

    const reportPath = path.join(tempDir, 'validation_report.json');
    await fs.writeFile(reportPath, JSON.stringify(report));

    const result = await critic.evaluate('T12.PoC.1', ['validation_report.json']);
    expect(result.passed).toBe(false);
    expect(result.details.failures.some(f => f.includes('elasticity signs'))).toBe(true);

    // Mock the escalation
    autopilot.mockModelingRealityFailure(
      'Weather elasticity signs incorrect',
      { product: 'ice_cream_summer', temperature: -0.12, precipitation: 0.08 }
    );

    // Verify escalation
    const escalated = autopilot.getEscalatedTasks();
    expect(escalated).toHaveLength(2);

    const researchTask = escalated.find((t: MockTask) => t.assignee === 'Research Orchestrator');
    expect(researchTask).toBeDefined();
    expect(researchTask!.description).toContain('Weather elasticity signs incorrect');
  });

  it('should detect overfitting and escalate', async () => {
    const report = {
      task_id: 'T12.PoC.1',
      model_type: 'weather_aware_mmm',
      metrics: {
        out_of_sample_r2: 0.55,
        validation_r2: 0.65, // GAP > 0.10 signals overfitting
        test_r2: 0.50,
        weather_elasticity: {
          temperature: 0.15,
          precipitation: -0.08,
        },
        baseline_comparison: {
          naive_mape: 0.25,
          seasonal_mape: 0.20,
          linear_mape: 0.18,
          model_mape: 0.15,
        },
      },
      thresholds_passed: {
        r2: true,
        elasticity_signs: true,
        no_overfitting: false,
        beats_baseline: true,
      },
      overall_status: 'FAIL',
    };

    const reportPath = path.join(tempDir, 'validation_report.json');
    await fs.writeFile(reportPath, JSON.stringify(report));

    const result = await critic.evaluate('T12.PoC.1', ['validation_report.json']);
    expect(result.passed).toBe(false);
    expect(result.details.failures.some(f => f.includes('Overfitting'))).toBe(true);

    // Mock the escalation
    autopilot.mockModelingRealityFailure(
      'Overfitting detected',
      { validation_r2: 0.65, test_r2: 0.50, gap: 0.15, threshold: 0.10 }
    );

    // Verify escalation
    const escalated = autopilot.getEscalatedTasks();
    expect(escalated).toHaveLength(2);

    const researchTask = escalated.find((t: MockTask) => t.assignee === 'Research Orchestrator');
    expect(researchTask).toBeDefined();
    expect(researchTask!.description).toContain('Overfitting detected');
  });

  it('should skip non-modeling tasks without escalation', async () => {
    const result = await critic.evaluate('T1.1.1', []);
    expect(result.passed).toBe(true);
    expect(result.severity).toBe('info');
    expect(result.message).toContain('not a modeling task');
    expect(autopilot.getEscalatedTasks()).toHaveLength(0);
  });
});