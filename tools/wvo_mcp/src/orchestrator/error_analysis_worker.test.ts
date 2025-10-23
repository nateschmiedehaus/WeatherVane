/**
 * Tests for ErrorAnalysisWorker
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorAnalysisWorker, type ErrorContext } from './error_analysis_worker.js';

describe('ErrorAnalysisWorker', () => {
  let worker: ErrorAnalysisWorker;
  let context: ErrorContext;

  beforeEach(() => {
    worker = new ErrorAnalysisWorker();
    context = {
      taskId: 'T1.1.1',
      agent: 'worker-1',
      phase: 'preflight',
    };
  });

  describe('Linter error analysis', () => {
    it('should analyze ruff linter errors', async () => {
      const linterError = `F841 Local variable \`roas_floor_active\` is assigned to but never used
   --> apps/allocator/optimizer.py:305:21
    |
303 |                             hi = mid
304 |                     effective_max = max(effective_min, lo)
305 |                     roas_floor_active = True
    |                     ^^^^^^^^^^^^^^^^^
306 |
307 |         if effective_max < effective_min - 1e-6:
    |
help: Remove assignment to unused variable \`roas_floor_active\`

F401 [*] \`dataclasses.field\` imported but unused
  --> apps/allocator/train_weather_allocation.py:18:36
   |
16 | import json
17 | import logging
18 | from dataclasses import dataclass, field
   |                                    ^^^^^
19 | from datetime import date, datetime, timedelta
20 | from pathlib import Path
   |
help: Remove unused import: \`dataclasses.field\`

F401 [*] \`pandas\` imported but unused
  --> apps/allocator/train_weather_allocation.py:24:18
   |
23 | import numpy as np
24 | import pandas as pd
   |                  ^^
25 |
26 | from apps.allocator.optimizer import (
   |
help: Remove unused import: \`pandas\`

Found 53 errors.
[*] 40 fixable with the \`--fix\` option.`;

      const summary = await worker.analyzeError(linterError, context);

      expect(summary.type).toBe('linter');
      expect(summary.summary).toContain('53 linting errors');
      expect(summary.summary).toContain('F401');
      expect(summary.summary).toContain('F841');
      expect(summary.suggestion).toContain('ruff --fix');
      expect(summary.suggestion).toContain('40');
      expect(summary.actionable).toBe(true);
      expect(summary.compressedSize).toBeLessThan(summary.rawSize);
      expect(summary.compressedSize / summary.rawSize).toBeLessThan(0.1); // > 90% compression
      expect(summary.hash).toBeTypeOf('string');
      expect(summary.details?.errorCount).toBe(53); // Total from "Found 53 errors"
      expect(summary.details?.fixableCount).toBe(40); // From fixable count line
      expect(summary.details?.errorsByType?.F401).toBe(2); // Parsed error types
      expect(summary.details?.errorsByType?.F841).toBe(1);
    });

    it('should handle linter errors without fixable count', async () => {
      const linterError = `E402 Module level import not at top of file
  --> shared/libs/geography/mapper.py:11:1
   |
 9 | STATE_MIN_WEATHER_COVERAGE = 0.70
10 |
11 | import csv
   | ^^^^^^^^^^
12 | import json
13 | from dataclasses import dataclass
   |

Found 10 errors.`;

      const summary = await worker.analyzeError(linterError, context);

      expect(summary.type).toBe('linter');
      expect(summary.actionable).toBe(false); // No auto-fixable
      expect(summary.suggestion).toContain('Manual fixes');
    });
  });

  describe('TypeScript error analysis', () => {
    it('should analyze TypeScript errors', async () => {
      const typeError = `src/orchestrator/unified_orchestrator.ts(45,10): error TS2304: Cannot find name 'Agent'.
src/orchestrator/unified_orchestrator.ts(67,15): error TS2339: Property 'role' does not exist on type 'AgentConfig'.
src/orchestrator/agent_pool.ts(23,5): error TS2322: Type 'string' is not assignable to type 'Provider'.
src/orchestrator/agent_pool.ts(45,10): error TS2304: Cannot find name 'ExecResult'.
src/telemetry/logger.ts(12,20): error TS2304: Cannot find name 'LogLevel'.

Found 12 errors.`;

      const summary = await worker.analyzeError(typeError, context);

      expect(summary.type).toBe('typecheck');
      expect(summary.summary).toContain('type errors');
      expect(summary.summary).toContain('2304'); // Missing name
      expect(summary.summary).toContain('2339'); // Missing property
      expect(summary.actionable).toBe(true);
      expect(summary.details?.errorCount).toBe(5);
      expect(summary.details?.affectedFiles).toBeDefined();
      expect(summary.details?.affectedFiles?.length).toBeGreaterThan(0);
    });
  });

  describe('Test failure analysis', () => {
    it('should analyze test failures', async () => {
      const testError = `FAILED tests/orchestrator/unified_orchestrator.test.ts - Expected 5 to be 10
FAILED tests/orchestrator/agent_pool.test.ts - Timeout exceeded
FAILED tests/telemetry/telemetry_manager.test.ts - AssertionError: expected false to be true

3 failed, 45 passed, 48 total`;

      const summary = await worker.analyzeError(testError, context);

      expect(summary.type).toBe('test_failure');
      expect(summary.summary).toContain('3 tests failed');
      expect(summary.actionable).toBe(true);
      expect(summary.details?.errorCount).toBe(3);
      expect(summary.details?.firstError).toBeDefined();
    });

    it('should handle single test failure', async () => {
      const testError = `FAILED tests/specific.test.ts - Expected value to match`;

      const summary = await worker.analyzeError(testError, context);

      expect(summary.summary).toBe('1 test failed');
      expect(summary.suggestion).toContain('Fix test:');
    });
  });

  describe('Build failure analysis', () => {
    it('should analyze build failures', async () => {
      const buildError = `Building TypeScript project...
src/index.ts(10,15): error TS2339: Property 'foo' does not exist
src/utils.ts(45,3): error TS2322: Type mismatch

✖ Build failed with 2 errors`;

      const summary = await worker.analyzeError(buildError, context);

      expect(summary.type).toBe('build_failure');
      expect(summary.summary).toBe('Build failed');
      expect(summary.actionable).toBe(true);
      expect(summary.details?.firstError).toBeDefined();
    });
  });

  describe('Generic error handling', () => {
    it('should handle unknown error types', async () => {
      const genericError = 'Something went wrong with the operation';

      const summary = await worker.analyzeError(genericError, context);

      expect(summary.type).toBe('unknown');
      expect(summary.summary).toContain(genericError);
      expect(summary.actionable).toBe(false);
    });

    it('should handle network errors', async () => {
      const networkError = 'ECONNREFUSED: Connection refused at localhost:3000';

      const summary = await worker.analyzeError(networkError, context);

      expect(summary.type).toBe('network_error');
    });
  });

  describe('Deduplication', () => {
    it('should track error occurrences', async () => {
      const error = 'F401 unused import';

      // Analyze same error multiple times
      const summary1 = await worker.analyzeError(error, context);
      const summary2 = await worker.analyzeError(error, context);
      const summary3 = await worker.analyzeError(error, context);

      expect(summary1.summary).not.toContain('seen');
      expect(summary2.summary).toContain('(seen 2x)');
      expect(summary3.summary).toContain('(seen 3x)');
    });

    it('should provide statistics', async () => {
      await worker.analyzeError('Error A', context);
      await worker.analyzeError('Error A', context);
      await worker.analyzeError('Error B', context);

      const stats = worker.getStatistics();

      expect(stats.length).toBe(2);
      expect(stats[0].count).toBe(2); // Error A (sorted by count)
      expect(stats[1].count).toBe(1); // Error B
    });

    it('should clear statistics', async () => {
      await worker.analyzeError('Error', context);

      worker.clearStatistics();

      const stats = worker.getStatistics();
      expect(stats.length).toBe(0);
    });
  });

  describe('Compression ratio', () => {
    it('should achieve high compression for linter errors', async () => {
      const largeError = `F841 ${' '.repeat(1000)}unused variable
${'F401 [*] unused import\n'.repeat(100)}
Found 200 errors.`;

      const summary = await worker.analyzeError(largeError, context);

      const compressionRatio = summary.compressedSize / summary.rawSize;

      expect(compressionRatio).toBeLessThan(0.05); // > 95% compression
    });

    it('should achieve moderate compression for type errors', async () => {
      const typeError = `${'error TS2304: Cannot find name\n'.repeat(50)}
Found 50 errors.`;

      const summary = await worker.analyzeError(typeError, context);

      const compressionRatio = summary.compressedSize / summary.rawSize;

      expect(compressionRatio).toBeLessThan(0.1); // > 90% compression
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle the actual 50KB linter error from production', async () => {
      // Simulate the actual error that caused 667MB bloat
      const productionError = `F841 Local variable \`roas_floor_active\` is assigned to but never used
   --> apps/allocator/optimizer.py:305:21

${'F401 [*] unused import\n  --> file.py:10:5\n\n'.repeat(40)}
${'F541 f-string without placeholders\n  --> file.py:100:10\n\n'.repeat(10)}

Found 53 errors.
[*] 40 fixable with the \`--fix\` option (4 hidden fixes can be enabled with the \`--unsafe-fixes\` option).`;

      const summary = await worker.analyzeError(productionError, context);

      expect(summary.type).toBe('linter');
      expect(summary.summary.length).toBeLessThan(500); // Must be < 500 bytes
      expect(summary.rawSize).toBeGreaterThan(2000); // Original is large
      expect(summary.compressedSize / summary.rawSize).toBeLessThan(0.25); // > 75% reduction
      expect(summary.details?.fixableCount).toBe(40);
      expect(summary.suggestion).toContain('ruff --fix');
    });
  });
});
