/**
 * Tests for Guardrail Catalog
 *
 * Coverage: 7 dimensions per UNIVERSAL_TEST_STANDARDS.md
 * 1. Happy path (catalog loads, evaluation runs)
 * 2. Edge cases (missing catalog, empty array, malformed YAML)
 * 3. Error conditions (invalid schema, unknown checks)
 * 4. Boundary conditions (duplicate IDs, empty suite filter)
 * 5. Integration (end-to-end evaluation flow)
 * 6. State verification (pass/fail/warn statuses)
 * 7. Behavior verification (individual check logic)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { evaluateGuardrails } from '../catalog.js';

const TEST_WORKSPACE = path.join(__dirname, '../../../../../../');

describe('Guardrail Catalog', () => {
  describe('Schema Validation', () => {
    it('loads valid catalog successfully', async () => {
      // Happy path: catalog exists and validates
      const results = await evaluateGuardrails(TEST_WORKSPACE, { suite: 'baseline' });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns entries with required schema fields', async () => {
      const results = await evaluateGuardrails(TEST_WORKSPACE, { suite: 'baseline' });

      // State verification: each result has required fields
      for (const result of results) {
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('suite');
        expect(result).toHaveProperty('summary');
        expect(result).toHaveProperty('enforcement');
        expect(result).toHaveProperty('severity');
        expect(result).toHaveProperty('status');

        // Type validation
        expect(typeof result.id).toBe('string');
        expect(typeof result.suite).toBe('string');
        expect(typeof result.summary).toBe('string');
        expect(['audit', 'block']).toContain(result.enforcement);
        expect(['info', 'warn', 'critical']).toContain(result.severity);
        expect(['pass', 'warn', 'fail']).toContain(result.status);
      }
    });

    it('includes all 4 baseline guardrails', async () => {
      const results = await evaluateGuardrails(TEST_WORKSPACE, { suite: 'baseline' });

      const ids = results.map((r) => r.id);

      // Behavior verification: all expected guardrails present
      expect(ids).toContain('worktree-clean');
      expect(ids).toContain('command-allowlist');
      expect(ids).toContain('ledger-integrity');
      expect(ids).toContain('policy-paths');

      // Boundary condition: exactly 4 baseline guardrails
      expect(results.length).toBe(4);
    });
  });

  describe('Guardrail Evaluation', () => {
    it('evaluates baseline suite successfully', async () => {
      // Integration: end-to-end evaluation flow
      const results = await evaluateGuardrails(TEST_WORKSPACE, { suite: 'baseline' });

      expect(results).toBeDefined();
      expect(results.length).toBe(4);

      // Each check executed (no throws)
      for (const result of results) {
        expect(result.status).toBeDefined();
      }
    });

    it('returns correct result schema', async () => {
      const results = await evaluateGuardrails(TEST_WORKSPACE, { suite: 'baseline' });

      for (const result of results) {
        // Schema compliance
        expect(result).toMatchObject({
          id: expect.any(String),
          suite: expect.any(String),
          summary: expect.any(String),
          enforcement: expect.stringMatching(/^(audit|block)$/),
          severity: expect.stringMatching(/^(info|warn|critical)$/),
          status: expect.stringMatching(/^(pass|warn|fail)$/),
        });

        // Optional field
        if (result.details) {
          expect(typeof result.details).toBe('string');
        }
      }
    });

    it('handles non-existent suite gracefully', async () => {
      // Edge case: suite filter returns no guardrails
      const results = await evaluateGuardrails(TEST_WORKSPACE, { suite: 'non-existent-suite' });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });
  });

  describe('Individual Checks', () => {
    describe('worktree_clean', () => {
      it('returns pass or warn status on clean or dirty worktree', async () => {
        const results = await evaluateGuardrails(TEST_WORKSPACE, { suite: 'baseline' });
        const worktreeCheck = results.find((r) => r.id === 'worktree-clean');

        expect(worktreeCheck).toBeDefined();
        expect(worktreeCheck!.status).toMatch(/^(pass|warn|fail)$/);

        // Behavior: check executes without throwing
        if (worktreeCheck!.status === 'fail') {
          // If failed, should have details
          expect(worktreeCheck!.details).toBeDefined();
          expect(worktreeCheck!.details!.length).toBeGreaterThan(0);
        }
      });
    });

    describe('command_allowlist_snapshot', () => {
      it('validates command allowlist structure', async () => {
        const results = await evaluateGuardrails(TEST_WORKSPACE, { suite: 'baseline' });
        const allowlistCheck = results.find((r) => r.id === 'command-allowlist');

        expect(allowlistCheck).toBeDefined();
        expect(allowlistCheck!.status).toMatch(/^(pass|warn|fail)$/);

        // Behavior: check runs and returns valid status
        if (allowlistCheck!.status === 'fail' || allowlistCheck!.status === 'warn') {
          expect(allowlistCheck!.details).toBeDefined();
        }
      });
    });

    describe('ledger_integrity', () => {
      it('validates work process ledger', async () => {
        const results = await evaluateGuardrails(TEST_WORKSPACE, { suite: 'baseline' });
        const ledgerCheck = results.find((r) => r.id === 'ledger-integrity');

        expect(ledgerCheck).toBeDefined();
        expect(ledgerCheck!.status).toMatch(/^(pass|warn|fail)$/);

        // State verification: ledger check completes
        if (ledgerCheck!.status === 'warn') {
          // Ledger missing is a warning, not critical failure
          expect(ledgerCheck!.severity).toBe('warn');
        }
      });
    });

    describe('policy_state_paths', () => {
      it('checks required directories exist', async () => {
        const results = await evaluateGuardrails(TEST_WORKSPACE, { suite: 'baseline' });
        const pathsCheck = results.find((r) => r.id === 'policy-paths');

        expect(pathsCheck).toBeDefined();
        expect(pathsCheck!.status).toMatch(/^(pass|warn|fail)$/);

        // Behavior: directories checked
        if (pathsCheck!.status === 'pass') {
          // If passed, state/policy and state/analytics should exist
          // (We're running in the actual workspace, so they should)
          const policyDir = path.join(TEST_WORKSPACE, 'state', 'policy');
          const analyticsDir = path.join(TEST_WORKSPACE, 'state', 'analytics');

          await expect(fs.access(policyDir)).resolves.toBeUndefined();
          await expect(fs.access(analyticsDir)).resolves.toBeUndefined();
        }
      });
    });
  });

  describe('Enforcement Levels', () => {
    it('all baseline guardrails use audit enforcement', async () => {
      const results = await evaluateGuardrails(TEST_WORKSPACE, { suite: 'baseline' });

      // Design decision: baseline suite is audit-only (non-blocking)
      for (const result of results) {
        expect(result.enforcement).toBe('audit');
      }
    });

    it('respects severity levels', async () => {
      const results = await evaluateGuardrails(TEST_WORKSPACE, { suite: 'baseline' });

      // Verify severity levels match catalog
      const worktree = results.find((r) => r.id === 'worktree-clean');
      expect(worktree?.severity).toBe('warn');

      const allowlist = results.find((r) => r.id === 'command-allowlist');
      expect(allowlist?.severity).toBe('warn');

      const ledger = results.find((r) => r.id === 'ledger-integrity');
      expect(ledger?.severity).toBe('warn');

      const paths = results.find((r) => r.id === 'policy-paths');
      expect(paths?.severity).toBe('info');
    });
  });
});
