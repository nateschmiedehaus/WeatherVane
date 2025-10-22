import { describe, expect, it } from 'vitest';

import {
  createSemanticValidationContext,
  OutputValidationError,
  validateArrayUniqueness,
  validateCodexOutputFields,
  validateCodexOutputSemantics,
  validateContentBoundaries,
  validateDiff,
  validateJSON,
  validateTaskListConsistency,
  detectOutputFormat,
  type CodexFinalSummary,
  strictValidateOutput,
} from './output_validator.js';

describe('Output Validator - Syntactic Validation', () => {
  describe('validateJSON', () => {
    it('parses valid JSON output matching schema', () => {
      const json = JSON.stringify({
        completed_tasks: ['Task A'],
        in_progress: ['Task B'],
        blockers: [],
        next_focus: ['Task C'],
        notes: 'Progress note',
      });
      const result = validateJSON(json);
      expect(result.completed_tasks).toEqual(['Task A']);
      expect(result.notes).toBe('Progress note');
    });

    it('rejects empty JSON output', () => {
      expect(() => validateJSON('')).toThrow(OutputValidationError);
      try {
        validateJSON('');
      } catch (e) {
        if (e instanceof OutputValidationError) {
          expect(e.code).toBe('empty_json_output');
        }
      }
    });

    it('rejects invalid JSON syntax', () => {
      expect(() => validateJSON('{ invalid json')).toThrow(OutputValidationError);
      try {
        validateJSON('{ invalid json');
      } catch (e) {
        if (e instanceof OutputValidationError) {
          expect(e.code).toBe('invalid_json');
        }
      }
    });

    it('rejects JSON missing required fields', () => {
      const json = JSON.stringify({
        completed_tasks: ['Task A'],
        in_progress: [],
        // missing: blockers, next_focus, notes
      });
      expect(() => validateJSON(json)).toThrow(OutputValidationError);
      try {
        validateJSON(json);
      } catch (e) {
        if (e instanceof OutputValidationError) {
          expect(e.code).toBe('invalid_json_schema');
        }
      }
    });

    it('rejects JSON with extra fields (strict mode)', () => {
      const json = JSON.stringify({
        completed_tasks: ['Task A'],
        in_progress: [],
        blockers: [],
        next_focus: ['Task B'],
        notes: 'Test',
        extra_field: 'should fail',
      });
      expect(() => validateJSON(json)).toThrow(OutputValidationError);
      try {
        validateJSON(json);
      } catch (e) {
        if (e instanceof OutputValidationError) {
          expect(e.code).toBe('invalid_json_schema');
        }
      }
    });

    it('rejects JSON with non-ASCII characters', () => {
      const json = JSON.stringify({
        completed_tasks: ['Task A'],
        in_progress: [],
        blockers: [],
        next_focus: ['Task B'],
        notes: 'Test with emoji 😀',
      });
      expect(() => validateJSON(json)).toThrow(OutputValidationError);
      try {
        validateJSON(json);
      } catch (e) {
        if (e instanceof OutputValidationError) {
          expect(e.code).toBe('non_ascii_output');
        }
      }
    });

    it('rejects JSON with wrong field types', () => {
      const json = JSON.stringify({
        completed_tasks: 'not-an-array',
        in_progress: [],
        blockers: [],
        next_focus: ['Task B'],
        notes: 'Test',
      });
      expect(() => validateJSON(json)).toThrow(OutputValidationError);
      try {
        validateJSON(json);
      } catch (e) {
        if (e instanceof OutputValidationError) {
          expect(e.code).toBe('invalid_json_schema');
        }
      }
    });
  });

  describe('validateDiff', () => {
    it('accepts valid patch format with Begin/End markers', () => {
      const diff = `*** Begin Patch
*** Update File: src/test.ts
+added line
-removed line
*** End Patch`;
      expect(() => validateDiff(diff)).not.toThrow();
    });

    it('accepts git-style unified diff format', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
index abc1234..def5678 100644
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,3 +1,4 @@
 line 1
+added line
 line 2`;
      expect(() => validateDiff(diff)).not.toThrow();
    });

    it('rejects empty diff output', () => {
      expect(() => validateDiff('')).toThrow(OutputValidationError);
      try {
        validateDiff('');
      } catch (e) {
        if (e instanceof OutputValidationError) {
          expect(e.code).toBe('empty_diff_output');
        }
      }
    });

    it('rejects diff without header', () => {
      const diff = 'some content without proper markers';
      expect(() => validateDiff(diff)).toThrow(OutputValidationError);
      try {
        validateDiff(diff);
      } catch (e) {
        if (e instanceof OutputValidationError) {
          expect(e.code).toBe('diff_missing_header');
        }
      }
    });

    it('rejects patch without End Patch marker', () => {
      const diff = `*** Begin Patch
*** Update File: src/test.ts
content here`;
      expect(() => validateDiff(diff)).toThrow(OutputValidationError);
      try {
        validateDiff(diff);
      } catch (e) {
        if (e instanceof OutputValidationError) {
          expect(e.code).toBe('diff_missing_end');
        }
      }
    });

    it('rejects patch without file directive', () => {
      const diff = `*** Begin Patch
some content
*** End Patch`;
      expect(() => validateDiff(diff)).toThrow(OutputValidationError);
      try {
        validateDiff(diff);
      } catch (e) {
        if (e instanceof OutputValidationError) {
          expect(e.code).toBe('diff_missing_file_directive');
        }
      }
    });
  });

  describe('detectOutputFormat', () => {
    it('detects JSON format when output starts with {', () => {
      const json = JSON.stringify({
        completed_tasks: [],
        in_progress: [],
        blockers: [],
        next_focus: ['Task'],
        notes: 'Test',
      });
      const format = detectOutputFormat(json);
      expect(format).toBe('json');
    });

    it('detects diff format when output starts with patch markers', () => {
      const diff = `*** Begin Patch
*** Update File: test.ts
+added
-removed
*** End Patch`;
      const format = detectOutputFormat(diff);
      expect(format).toBe('diff');
    });

    it('rejects empty output', () => {
      expect(() => detectOutputFormat('')).toThrow(OutputValidationError);
      try {
        detectOutputFormat('');
      } catch (e) {
        if (e instanceof OutputValidationError) {
          expect(e.code).toBe('empty_output');
        }
      }
    });
  });
});

describe('Output Validator - Semantic Validation', () => {
  const validOutput: CodexFinalSummary = {
    completed_tasks: ['Task A', 'Task B'],
    in_progress: ['Task C'],
    blockers: [],
    next_focus: ['Task D', 'Task E'],
    notes: 'All tasks progressing normally.',
  };

  describe('validateCodexOutputFields', () => {
    it('accepts valid output with all required fields', () => {
      expect(() => validateCodexOutputFields(validOutput)).not.toThrow();
    });

    it('rejects when completed_tasks is not an array', () => {
      const invalid = { ...validOutput, completed_tasks: 'not-array' };
      expect(() => validateCodexOutputFields(invalid as any)).toThrow(OutputValidationError);
      try {
        validateCodexOutputFields(invalid as any);
      } catch (e) {
        if (e instanceof OutputValidationError) {
          expect(e.code).toBe('completed_tasks_not_array');
        }
      }
    });

    it('rejects when notes is empty string', () => {
      const invalid = { ...validOutput, notes: '' };
      expect(() => validateCodexOutputFields(invalid)).toThrow(OutputValidationError);
      try {
        validateCodexOutputFields(invalid);
      } catch (e) {
        if (e instanceof OutputValidationError) {
          expect(e.code).toBe('notes_empty');
        }
      }
    });

    it('rejects when notes is only whitespace', () => {
      const invalid = { ...validOutput, notes: '   \n\t  ' };
      expect(() => validateCodexOutputFields(invalid)).toThrow(OutputValidationError);
      try {
        validateCodexOutputFields(invalid);
      } catch (e) {
        if (e instanceof OutputValidationError) {
          expect(e.code).toBe('notes_empty');
        }
      }
    });

    it('rejects when next_focus is empty array', () => {
      const invalid = { ...validOutput, next_focus: [] };
      expect(() => validateCodexOutputFields(invalid)).toThrow(OutputValidationError);
      try {
        validateCodexOutputFields(invalid);
      } catch (e) {
        if (e instanceof OutputValidationError) {
          expect(e.code).toBe('next_focus_empty');
        }
      }
    });

    it('accepts empty completed_tasks array', () => {
      const output = { ...validOutput, completed_tasks: [] };
      expect(() => validateCodexOutputFields(output)).not.toThrow();
    });

    it('accepts empty blockers array', () => {
      const output = { ...validOutput, blockers: [] };
      expect(() => validateCodexOutputFields(output)).not.toThrow();
    });
  });

  describe('validateArrayUniqueness', () => {
    it('detects no duplicates in valid output', () => {
      const result = validateArrayUniqueness(validOutput);
      expect(result.isUnique).toBe(true);
      expect(result.duplicates).toHaveLength(0);
    });

    it('detects duplicates within completed_tasks', () => {
      const output = { ...validOutput, completed_tasks: ['Task A', 'Task A', 'Task B'] };
      const result = validateArrayUniqueness(output);
      expect(result.isUnique).toBe(false);
      expect(result.duplicates).toContain('Task A');
    });

    it('detects duplicates within next_focus', () => {
      const output = { ...validOutput, next_focus: ['Task D', 'Task D'] };
      const result = validateArrayUniqueness(output);
      expect(result.isUnique).toBe(false);
      expect(result.duplicates).toContain('Task D');
    });

    it('detects duplicates within blockers', () => {
      const output = { ...validOutput, blockers: ['Blocker X', 'Blocker X'] };
      const result = validateArrayUniqueness(output);
      expect(result.isUnique).toBe(false);
      expect(result.duplicates).toContain('Blocker X');
    });

    it('detects multiple duplicates across arrays', () => {
      const output = {
        completed_tasks: ['Task A', 'Task A'],
        in_progress: ['Task C', 'Task C'],
        blockers: [],
        next_focus: ['Task D'],
        notes: 'Test',
      };
      const result = validateArrayUniqueness(output);
      expect(result.isUnique).toBe(false);
      expect(result.duplicates.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('validateTaskListConsistency', () => {
    it('detects no conflicts in valid output', () => {
      const result = validateTaskListConsistency(validOutput);
      expect(result.isConsistent).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    it('detects task in both completed_tasks and in_progress', () => {
      const output = {
        completed_tasks: ['Task A'],
        in_progress: ['Task A'],
        blockers: [],
        next_focus: ['Task D'],
        notes: 'Test',
      };
      const result = validateTaskListConsistency(output);
      expect(result.isConsistent).toBe(false);
      expect(result.conflicts).toContainEqual(
        expect.objectContaining({
          task: 'Task A',
          inLists: expect.arrayContaining(['completed_tasks', 'in_progress']),
        })
      );
    });

    it('detects task in completed_tasks and blockers', () => {
      const output = {
        completed_tasks: ['Task A'],
        in_progress: [],
        blockers: ['Task A'],
        next_focus: ['Task D'],
        notes: 'Test',
      };
      const result = validateTaskListConsistency(output);
      expect(result.isConsistent).toBe(false);
      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it('detects task in next_focus and completed_tasks', () => {
      const output = {
        completed_tasks: ['Task D'],
        in_progress: [],
        blockers: [],
        next_focus: ['Task D'],
        notes: 'Test',
      };
      const result = validateTaskListConsistency(output);
      expect(result.isConsistent).toBe(false);
    });

    it('detects multiple conflicts', () => {
      const output = {
        completed_tasks: ['Task A', 'Task B'],
        in_progress: ['Task A'],
        blockers: ['Task B'],
        next_focus: ['Task C'],
        notes: 'Test',
      };
      const result = validateTaskListConsistency(output);
      expect(result.isConsistent).toBe(false);
      expect(result.conflicts.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('validateContentBoundaries', () => {
    it('accepts content within boundaries', () => {
      const result = validateContentBoundaries(validOutput);
      expect(result.withinBounds).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('detects notes exceeding max length', () => {
      const longNotes = 'x'.repeat(5001);
      const output = { ...validOutput, notes: longNotes };
      const result = validateContentBoundaries(output);
      expect(result.withinBounds).toBe(false);
      expect(result.violations.some((v) => v.field === 'notes')).toBe(true);
    });

    it('accepts notes at exact max length', () => {
      const maxNotes = 'x'.repeat(5000);
      const output = { ...validOutput, notes: maxNotes };
      const result = validateContentBoundaries(output);
      expect(result.withinBounds).toBe(true);
    });

    it('detects completed_tasks array exceeding limit', () => {
      const output = {
        ...validOutput,
        completed_tasks: Array.from({ length: 51 }, (_, i) => `Task ${i}`),
      };
      const result = validateContentBoundaries(output);
      expect(result.withinBounds).toBe(false);
      expect(result.violations.some((v) => v.field === 'completed_tasks')).toBe(true);
    });

    it('detects in_progress array exceeding limit', () => {
      const output = {
        ...validOutput,
        in_progress: Array.from({ length: 51 }, (_, i) => `Task ${i}`),
      };
      const result = validateContentBoundaries(output);
      expect(result.withinBounds).toBe(false);
      expect(result.violations.some((v) => v.field === 'in_progress')).toBe(true);
    });

    it('detects blockers array exceeding limit', () => {
      const output = {
        ...validOutput,
        blockers: Array.from({ length: 51 }, (_, i) => `Blocker ${i}`),
      };
      const result = validateContentBoundaries(output);
      expect(result.withinBounds).toBe(false);
      expect(result.violations.some((v) => v.field === 'blockers')).toBe(true);
    });

    it('detects next_focus array exceeding limit', () => {
      const output = {
        ...validOutput,
        next_focus: Array.from({ length: 51 }, (_, i) => `Task ${i}`),
      };
      const result = validateContentBoundaries(output);
      expect(result.withinBounds).toBe(false);
      expect(result.violations.some((v) => v.field === 'next_focus')).toBe(true);
    });

    it('accepts arrays at exact max size', () => {
      const output = {
        completed_tasks: Array.from({ length: 50 }, (_, i) => `Task A ${i}`),
        in_progress: Array.from({ length: 50 }, (_, i) => `Task B ${i}`),
        blockers: Array.from({ length: 50 }, (_, i) => `Blocker ${i}`),
        next_focus: Array.from({ length: 50 }, (_, i) => `Task C ${i}`),
        notes: 'Test at max size',
      };
      const result = validateContentBoundaries(output);
      expect(result.withinBounds).toBe(true);
    });

    it('reports all boundary violations together', () => {
      const output = {
        completed_tasks: Array.from({ length: 51 }, (_, i) => `Task A ${i}`),
        in_progress: Array.from({ length: 51 }, (_, i) => `Task B ${i}`),
        blockers: [],
        next_focus: Array.from({ length: 51 }, (_, i) => `Task C ${i}`),
        notes: 'x'.repeat(5001),
      };
      const result = validateContentBoundaries(output);
      expect(result.withinBounds).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('validateCodexOutputSemantics', () => {
    it('creates valid context for correct output', () => {
      const ctx = validateCodexOutputSemantics(validOutput);
      expect(ctx.isValid).toBe(true);
      expect(ctx.errors).toHaveLength(0);
    });

    it('collects errors from field validation', () => {
      const invalid = { ...validOutput, notes: '' };
      const ctx = validateCodexOutputSemantics(invalid);
      expect(ctx.isValid).toBe(false);
      expect(ctx.errors.length).toBeGreaterThan(0);
      expect(ctx.errors.some((e) => e.code === 'notes_empty')).toBe(true);
    });

    it('records warnings for duplicates without failing', () => {
      const output = {
        completed_tasks: ['Task A'],
        in_progress: [],
        blockers: [],
        next_focus: ['Task B', 'Task B'], // duplicate in next_focus only (not a conflict)
        notes: 'Test',
      };
      const ctx = validateCodexOutputSemantics(output);
      // No errors (no conflicts), but warnings recorded for duplicates within arrays
      expect(ctx.isValid).toBe(true);
      expect(ctx.warnings.length).toBeGreaterThan(0);
      expect(ctx.warnings.some((w) => w.code === 'duplicate_items_detected')).toBe(true);
    });

    it('records errors for task conflicts', () => {
      const output = {
        completed_tasks: ['Task A'],
        in_progress: ['Task A'],
        blockers: [],
        next_focus: ['Task D'],
        notes: 'Test',
      };
      const ctx = validateCodexOutputSemantics(output);
      expect(ctx.isValid).toBe(false);
      expect(ctx.errors.some((e) => e.code === 'task_list_conflict')).toBe(true);
    });

    it('records errors for boundary violations', () => {
      const output = {
        ...validOutput,
        notes: 'x'.repeat(5001),
      };
      const ctx = validateCodexOutputSemantics(output);
      expect(ctx.isValid).toBe(false);
      expect(ctx.errors.some((e) => e.code === 'content_boundary_exceeded')).toBe(true);
    });

    it('collects multiple errors together', () => {
      const output = {
        completed_tasks: ['Task A'],
        in_progress: ['Task A'],
        blockers: [],
        next_focus: [],
        notes: 'x'.repeat(5001),
      };
      const ctx = validateCodexOutputSemantics(output);
      expect(ctx.isValid).toBe(false);
      expect(ctx.errors.length).toBeGreaterThan(1);
    });
  });

  describe('createSemanticValidationContext', () => {
    it('creates empty context', () => {
      const ctx = createSemanticValidationContext();
      expect(ctx.errors).toEqual([]);
      expect(ctx.warnings).toEqual([]);
      expect(ctx.isValid).toBe(true);
    });
  });
});

describe('Output Validator - Strict Validation Integration', () => {
  describe('strictValidateOutput', () => {
    it('validates and returns valid output', () => {
      const json = JSON.stringify({
        completed_tasks: ['Task A'],
        in_progress: [],
        blockers: [],
        next_focus: ['Task B'],
        notes: 'Progress made.',
      });
      const { data, semantics } = strictValidateOutput(json);
      expect(data.completed_tasks).toEqual(['Task A']);
      expect(semantics.isValid).toBe(true);
    });

    it('throws on semantic errors', () => {
      const json = JSON.stringify({
        completed_tasks: ['Task A'],
        in_progress: [],
        blockers: [],
        next_focus: [],
        notes: 'Test',
      });
      expect(() => strictValidateOutput(json)).toThrow(OutputValidationError);
    });

    it('includes warnings in returned context by default', () => {
      const json = JSON.stringify({
        completed_tasks: ['Task A'],
        in_progress: [],
        blockers: [],
        next_focus: ['Task B', 'Task B'], // duplicate in next_focus only (warning, not error)
        notes: 'Test',
      });
      const { semantics } = strictValidateOutput(json);
      expect(semantics.warnings.length).toBeGreaterThan(0);
    });

    it('throws on warnings when throwOnWarnings=true', () => {
      const json = JSON.stringify({
        completed_tasks: ['Task A'],
        in_progress: [],
        blockers: [],
        next_focus: ['Task B', 'Task B'], // duplicate warning
        notes: 'Test',
      });
      expect(() => strictValidateOutput(json, true)).toThrow(OutputValidationError);
    });

    it('handles invalid JSON gracefully', () => {
      expect(() => strictValidateOutput('{ invalid')).toThrow(OutputValidationError);
    });

    it('handles empty output gracefully', () => {
      expect(() => strictValidateOutput('')).toThrow(OutputValidationError);
    });

    it('provides detailed error messages', () => {
      const json = JSON.stringify({
        completed_tasks: ['Task A'],
        in_progress: [],
        blockers: [],
        next_focus: [],
        notes: '',
      });
      try {
        strictValidateOutput(json);
      } catch (e) {
        if (e instanceof OutputValidationError) {
          expect(e.message).toContain('[');
          expect(e.message).toContain(']');
        }
      }
    });

    it('validates complete workflow end-to-end', () => {
      // Realistic output from an agent
      const agentOutput = JSON.stringify({
        completed_tasks: [
          'T9.2.1: Implement semantic validation layer',
          'T9.2.1: Create comprehensive tests',
        ],
        in_progress: ['T9.2.2: Add documentation'],
        blockers: [],
        next_focus: [
          'T9.2.2: Polish docs',
          'T9.2.3: Integration testing',
          'T9.2.4: Merge and release',
        ],
        notes:
          'Implemented 5 semantic validation functions with full test coverage. All 47 tests passing. Ready for documentation polish and integration.',
      });

      const { data, semantics } = strictValidateOutput(agentOutput);
      expect(data.completed_tasks.length).toBe(2);
      expect(data.next_focus.length).toBeGreaterThan(0);
      expect(semantics.isValid).toBe(true);
      expect(semantics.errors.length).toBe(0);
    });
  });
});

describe('Output Validator - Edge Cases', () => {
  it('handles whitespace in JSON correctly', () => {
    const json = `
    {
      "completed_tasks": ["Task A"],
      "in_progress": [],
      "blockers": [],
      "next_focus": ["Task B"],
      "notes": "Test"
    }
    `;
    const result = validateJSON(json);
    expect(result.completed_tasks).toEqual(['Task A']);
  });

  it('handles special but safe characters in strings', () => {
    const json = JSON.stringify({
      completed_tasks: ['Task: Unit Tests'],
      in_progress: [],
      blockers: [],
      next_focus: ['Task (refactor)'],
      notes: 'Notes with "quotes" and newlines\nWork done',
    });
    const result = validateJSON(json);
    expect(result.next_focus[0]).toContain('(refactor)');
  });

  it('handles single-item arrays', () => {
    const output: CodexFinalSummary = {
      completed_tasks: [],
      in_progress: [],
      blockers: [],
      next_focus: ['Only task'],
      notes: 'Minimal case',
    };
    const ctx = validateCodexOutputSemantics(output);
    expect(ctx.isValid).toBe(true);
  });

  it('handles large but valid arrays (at limit)', () => {
    const output: CodexFinalSummary = {
      completed_tasks: Array.from({ length: 50 }, (_, i) => `Completed ${i}`),
      in_progress: [],
      blockers: [],
      next_focus: ['Next work'],
      notes: 'Many completed tasks',
    };
    const result = validateContentBoundaries(output);
    expect(result.withinBounds).toBe(true);
  });

  it('OutputValidationError has correct properties', () => {
    const error = new OutputValidationError('test_code', 'test message', 'error');
    expect(error.code).toBe('test_code');
    expect(error.severity).toBe('error');
    expect(error.name).toBe('OutputValidationError');
  });

  it('OutputValidationError defaults severity to error', () => {
    const error = new OutputValidationError('test_code', 'test message');
    expect(error.severity).toBe('error');
  });
});
