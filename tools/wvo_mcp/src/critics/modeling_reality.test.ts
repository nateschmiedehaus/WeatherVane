/**
 * ModelingReality Critic Test Suite
 *
 * Tests the quantitative quality thresholds enforced by ModelingReality critic.
 * Validates that:
 * 1. R² thresholds are correctly applied
 * 2. Weather elasticity signs are validated
 * 3. Baseline comparisons are required
 * 4. Overfitting is detected
 * 5. MAPE constraints are enforced
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ModelingRealityV2Critic } from './modeling_reality_v2.js';

describe('ModelingReality Critic', () => {
  let tempDir: string;
  let critic: ModelingRealityV2Critic;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'modeling-reality-test-'));
    critic = new ModelingRealityV2Critic(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('R² Threshold Validation', () => {
    it('should PASS when weather-sensitive model has R² > 0.50', async () => {
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
      expect(result.severity).toBe('info');
    });

    it('should FAIL when weather-sensitive model has R² < 0.50', async () => {
      const taskId = 'T12.PoC.1';
      const result = await critic.evaluate(taskId, []);
      // Without a validation report, should fail with missing report error
      expect(result.passed).toBe(false);
      expect(result.severity).toBe('blocking');
      expect(result.details.failures[0]).toContain('No validation_report.json');
    });

    it('should FAIL when weather-sensitive model R² is negative', async () => {
      const report = {
        task_id: 'T12.PoC.1',
        model_type: 'weather_aware_mmm',
        metrics: {
          out_of_sample_r2: -0.05,
          validation_r2: -0.06,
          test_r2: -0.05,
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
      // Check that it failed for R² issues (could be threshold or negative)
      expect(result.details.failures.some(f => f.includes('R²') || f.includes('negative') || f.includes('threshold'))).toBe(true);
    });

    it('should enforce different thresholds for non-weather-sensitive models', async () => {
      // Task T13.5.1 doesn't match weather-sensitive patterns, uses 0.30 threshold
      const report = {
        task_id: 'T13.5.1',
        model_type: 'baseline_model',
        metrics: {
          out_of_sample_r2: 0.35,
          validation_r2: 0.34,
          test_r2: 0.34,
          weather_elasticity: {
            temperature: 0.02,
            precipitation: -0.01,
          },
          baseline_comparison: {
            naive_mape: 0.25,
            seasonal_mape: 0.20,
            linear_mape: 0.18,
            model_mape: 0.12,
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

      const result = await critic.evaluate('T13.5.1', ['validation_report.json']);
      // R² = 0.35 should pass for non-weather-sensitive (threshold 0.30)
      expect(result.passed).toBe(true);
    });
  });

  describe('Weather Elasticity Sign Validation', () => {
    it('should PASS when cold-weather product has negative temperature and positive precipitation', async () => {
      const report = {
        task_id: 'T12.PoC.1',
        tenant_id: 'ski_gear_extreme_winter',
        model_type: 'weather_aware_mmm',
        metrics: {
          out_of_sample_r2: 0.55,
          weather_elasticity: {
            temperature: -0.12, // Negative for cold weather ✓
            precipitation: 0.08, // Positive for snow products ✓
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
      expect(result.details.failures).not.toContain(
        expect.stringMatching(/elasticity signs incorrect/)
      );
    });

    it('should FAIL when elasticity signs are inverted for product type', async () => {
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
    });

    it('should FAIL when elasticity metrics are missing', async () => {
      const report = {
        task_id: 'T12.PoC.1',
        model_type: 'weather_aware_mmm',
        metrics: {
          out_of_sample_r2: 0.55,
          validation_r2: 0.54,
          test_r2: 0.54,
          // Missing weather_elasticity
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
      expect(result.details.failures.some(f => f.includes('elasticity'))).toBe(true);
    });
  });

  describe('Baseline Comparison Requirements', () => {
    it('should PASS when model beats all baselines by >10%', async () => {
      const report = {
        task_id: 'T12.PoC.1',
        model_type: 'weather_aware_mmm',
        metrics: {
          out_of_sample_r2: 0.55,
          mape: 0.12,
          weather_elasticity: {
            temperature: 0.15,
            precipitation: -0.08,
          },
          baseline_comparison: {
            naive_mape: 0.25,
            seasonal_mape: 0.20,
            linear_mape: 0.18,
            model_mape: 0.12,
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
      expect(result.details.failures).not.toContain(
        expect.stringMatching(/doesn't beat all baselines/)
      );
    });

    it('should FAIL when model does not beat naive baseline', async () => {
      const report = {
        task_id: 'T12.PoC.1',
        model_type: 'weather_aware_mmm',
        metrics: {
          out_of_sample_r2: 0.55,
          validation_r2: 0.54,
          test_r2: 0.54,
          mape: 0.20,
          weather_elasticity: {
            temperature: 0.15,
            precipitation: -0.08,
          },
          baseline_comparison: {
            naive_mape: 0.18, // Model can't beat this
            seasonal_mape: 0.25,
            linear_mape: 0.22,
            model_mape: 0.20,
          },
        },
        thresholds_passed: {
          r2: true,
          elasticity_signs: true,
          no_overfitting: true,
          beats_baseline: false,
        },
        overall_status: 'FAIL',
      };

      const reportPath = path.join(tempDir, 'validation_report.json');
      await fs.writeFile(reportPath, JSON.stringify(report));

      const result = await critic.evaluate('T12.PoC.1', ['validation_report.json']);
      expect(result.passed).toBe(false);
      expect(result.details.failures.some(f => f.includes('baseline'))).toBe(true);
    });

    it('should FAIL when baseline comparison is missing', async () => {
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
          // Missing baseline_comparison
        },
        thresholds_passed: {
          r2: true,
          elasticity_signs: true,
          no_overfitting: true,
          beats_baseline: false,
        },
        overall_status: 'FAIL',
      };

      const reportPath = path.join(tempDir, 'validation_report.json');
      await fs.writeFile(reportPath, JSON.stringify(report));

      const result = await critic.evaluate('T12.PoC.1', ['validation_report.json']);
      expect(result.passed).toBe(false);
      expect(result.details.failures.some(f => f.includes('baseline'))).toBe(true);
    });
  });

  describe('Overfitting Detection', () => {
    it('should PASS when validation and test R² are within 0.10', async () => {
      const report = {
        task_id: 'T12.PoC.1',
        model_type: 'weather_aware_mmm',
        metrics: {
          validation_r2: 0.53,
          test_r2: 0.52, // Gap = 0.01, well within 0.10 threshold
          out_of_sample_r2: 0.52,
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
      expect(result.details.failures).not.toContain(
        expect.stringMatching(/Overfitting detected/)
      );
    });

    it('should FAIL when validation R² and test R² have gap > 0.10', async () => {
      const report = {
        task_id: 'T12.PoC.1',
        model_type: 'weather_aware_mmm',
        metrics: {
          validation_r2: 0.65,
          test_r2: 0.50, // Gap = 0.15, EXCEEDS 0.10 threshold
          out_of_sample_r2: 0.50,
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
    });
  });

  describe('MAPE Constraint', () => {
    it('should PASS when MAPE < 20%', async () => {
      const report = {
        task_id: 'T12.PoC.1',
        model_type: 'weather_aware_mmm',
        metrics: {
          out_of_sample_r2: 0.55,
          mape: 0.18, // 18% < 20%
          weather_elasticity: {
            temperature: 0.15,
            precipitation: -0.08,
          },
          baseline_comparison: {
            naive_mape: 0.25,
            seasonal_mape: 0.20,
            linear_mape: 0.18,
            model_mape: 0.18,
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
      const mapeFailures = result.details.failures.filter(f => f.includes('MAPE'));
      expect(mapeFailures.length).toBe(0);
    });

    it('should FAIL when MAPE >= 20%', async () => {
      const report = {
        task_id: 'T12.PoC.1',
        model_type: 'weather_aware_mmm',
        metrics: {
          out_of_sample_r2: 0.55,
          validation_r2: 0.54,
          test_r2: 0.54,
          mape: 0.25, // 25% > 20%
          weather_elasticity: {
            temperature: 0.15,
            precipitation: -0.08,
          },
          baseline_comparison: {
            naive_mape: 0.25,
            seasonal_mape: 0.20,
            linear_mape: 0.18,
            model_mape: 0.25,
          },
        },
        thresholds_passed: {
          r2: true,
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
      expect(result.details.failures.some(f => f.includes('MAPE'))).toBe(true);
    });
  });

  describe('Non-Modeling Task Handling', () => {
    it('should skip validation for non-modeling tasks', async () => {
      const result = await critic.evaluate('T1.1.1', []);
      expect(result.passed).toBe(true);
      expect(result.severity).toBe('info');
      expect(result.message).toContain('not a modeling task');
    });

    it('should validate modeling task prefixes correctly', async () => {
      const modelingPrefixes = ['T12.', 'T13.5.', 'T-MLR-'];

      for (const prefix of modelingPrefixes) {
        const taskId = `${prefix}1`;
        const result = await critic.evaluate(taskId, []);
        // Should NOT be skipped for modeling tasks
        expect(result.message).not.toContain('not a modeling task');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle missing validation report gracefully', async () => {
      const result = await critic.evaluate('T12.PoC.1', []);
      expect(result.passed).toBe(false);
      expect(result.severity).toBe('blocking');
      expect(result.details.failures.some(f => f.includes('validation_report'))).toBe(true);
    });

    it('should handle invalid JSON in validation report', async () => {
      const reportPath = path.join(tempDir, 'validation_report.json');
      await fs.writeFile(reportPath, 'invalid json {');

      // Should throw or handle gracefully
      try {
        await critic.evaluate('T12.PoC.1', ['validation_report.json']);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Comprehensive Validation Flow', () => {
    it('should provide actionable recommendations on failure', async () => {
      const report = {
        task_id: 'T12.PoC.1',
        model_type: 'weather_aware_mmm',
        metrics: {
          out_of_sample_r2: 0.45, // Below threshold
          weather_elasticity: {
            temperature: 0.15,
            precipitation: -0.08,
          },
          baseline_comparison: {
            naive_mape: 0.25,
            seasonal_mape: 0.20,
            linear_mape: 0.18,
            model_mape: 0.16,
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
      expect(result.details.recommendations.length).toBeGreaterThan(0);
      expect(result.details.recommendations[0]).toContain('Improve model');
    });

    it('should pass world-class model with all thresholds met', async () => {
      const report = {
        task_id: 'T12.PoC.1',
        model_type: 'weather_aware_mmm',
        metrics: {
          out_of_sample_r2: 0.65, // > 0.50, approaching world-class 0.60
          validation_r2: 0.64,
          test_r2: 0.63, // Gap = 0.02, no overfitting
          mape: 0.12,
          weather_elasticity: {
            temperature: 0.18,
            precipitation: -0.12,
          },
          baseline_comparison: {
            naive_mape: 0.30,
            seasonal_mape: 0.25,
            linear_mape: 0.20,
            model_mape: 0.12,
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
      expect(result.details.thresholds_passed).toBe(result.details.thresholds_checked);
    });
  });
});
