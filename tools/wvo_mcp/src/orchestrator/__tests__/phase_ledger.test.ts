/**
 * Phase Ledger Test - Hash Chaining and Tamper Detection
 *
 * Purpose: Verify immutable ledger with cryptographic hash chaining
 *
 * Tests:
 * 1. Genesis entry starts with previous_hash = 'genesis'
 * 2. Hash chain is maintained across multiple transitions
 * 3. Ledger verification detects tampering
 * 4. Ledger verification passes for valid chain
 * 5. Task history retrieval works correctly
 * 6. Current phase tracking works correctly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PhaseLedger } from '../phase_ledger.js';
import { WorkPhase } from '../work_process_enforcer.js';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { promises as fsPromises } from 'fs';

describe('PhaseLedger - Hash Chaining and Tamper Detection', () => {
  let ledger: PhaseLedger;
  let testWorkspaceRoot: string;
  let ledgerPath: string;

  beforeEach(async () => {
    // Create a temporary workspace for testing
    testWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-test-'));
    ledgerPath = path.join(testWorkspaceRoot, 'state/process/ledger.jsonl');

    ledger = new PhaseLedger(testWorkspaceRoot);
    await ledger.initialize();
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(testWorkspaceRoot)) {
      fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
    }
  });

  describe('Hash Chain Construction', () => {
    it('creates first entry with previous_hash = genesis', async () => {
      const entry = await ledger.appendTransition(
        'TEST-001',
        null,
        'STRATEGIZE',
        [],
        true
      );

      expect(entry.previous_hash).toBe('genesis');
      expect(entry.entry_hash).toBeTruthy();
      expect(entry.entry_hash).not.toBe('genesis');
      expect(entry.task_id).toBe('TEST-001');
      expect(entry.to_phase).toBe('STRATEGIZE');
    });

    it('chains subsequent entries with previous entry hash', async () => {
      // First entry
      const entry1 = await ledger.appendTransition(
        'TEST-001',
        null,
        'STRATEGIZE',
        [],
        true
      );

      // Second entry
      const entry2 = await ledger.appendTransition(
        'TEST-001',
        'STRATEGIZE',
        'SPEC',
        [],
        true
      );

      expect(entry2.previous_hash).toBe(entry1.entry_hash);
      expect(entry2.entry_hash).not.toBe(entry1.entry_hash);
    });

    it('maintains chain across multiple transitions', async () => {
      const phases: WorkPhase[] = ['STRATEGIZE', 'SPEC', 'PLAN', 'IMPLEMENT', 'VERIFY'];
      const entries = [];

      // First entry (null → STRATEGIZE)
      let prevPhase: WorkPhase | null = null;
      for (const phase of phases) {
        const entry = await ledger.appendTransition(
          'TEST-CHAIN-001',
          prevPhase,
          phase,
          [],
          true
        );
        entries.push(entry);
        prevPhase = phase;
      }

      // Verify chain
      expect(entries[0].previous_hash).toBe('genesis');
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i].previous_hash).toBe(entries[i - 1].entry_hash);
      }

      // Verify all hashes are unique
      const hashes = entries.map(e => e.entry_hash);
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(entries.length);
    });
  });

  describe('Ledger Verification', () => {
    it('passes verification for valid chain', async () => {
      // Add multiple entries
      await ledger.appendTransition('TEST-001', null, 'STRATEGIZE', [], true);
      await ledger.appendTransition('TEST-001', 'STRATEGIZE', 'SPEC', [], true);
      await ledger.appendTransition('TEST-001', 'SPEC', 'PLAN', [], true);

      const result = await ledger.verify();

      expect(result.valid).toBe(true);
      expect(result.entries_checked).toBe(3);
      expect(result.broken_chain_at).toBeUndefined();
      expect(result.tampered_entries).toBeUndefined();
    });

    it('detects hash chain break when previous_hash is modified', async () => {
      // Add entries
      await ledger.appendTransition('TEST-001', null, 'STRATEGIZE', [], true);
      await ledger.appendTransition('TEST-001', 'STRATEGIZE', 'SPEC', [], true);

      // Tamper with ledger by modifying previous_hash
      const content = await fsPromises.readFile(ledgerPath, 'utf-8');
      const lines = content.trim().split('\n');
      const entry2 = JSON.parse(lines[1]);
      entry2.previous_hash = 'TAMPERED_HASH';
      lines[1] = JSON.stringify(entry2);
      await fsPromises.writeFile(ledgerPath, lines.join('\n') + '\n');

      const result = await ledger.verify();

      expect(result.valid).toBe(false);
      expect(result.broken_chain_at).toBe(1);
    });

    it('detects tampered entry when entry_hash is modified', async () => {
      // Add entries
      await ledger.appendTransition('TEST-001', null, 'STRATEGIZE', [], true);
      await ledger.appendTransition('TEST-001', 'STRATEGIZE', 'SPEC', [], true);

      // Tamper with ledger by modifying task_id (which changes expected hash)
      const content = await fsPromises.readFile(ledgerPath, 'utf-8');
      const lines = content.trim().split('\n');
      const entry1 = JSON.parse(lines[0]);
      entry1.task_id = 'TAMPERED-TASK';
      // Keep entry_hash the same (simulate tampering without recomputing hash)
      lines[0] = JSON.stringify(entry1);
      await fsPromises.writeFile(ledgerPath, lines.join('\n') + '\n');

      const result = await ledger.verify();

      expect(result.valid).toBe(false);
      expect(result.tampered_entries).toContain(0);
    });
  });

  describe('Task History Tracking', () => {
    it('retrieves all entries for a specific task', async () => {
      // Add entries for multiple tasks
      await ledger.appendTransition('TASK-A', null, 'STRATEGIZE', [], true);
      await ledger.appendTransition('TASK-B', null, 'STRATEGIZE', [], true);
      await ledger.appendTransition('TASK-A', 'STRATEGIZE', 'SPEC', [], true);
      await ledger.appendTransition('TASK-A', 'SPEC', 'PLAN', [], true);
      await ledger.appendTransition('TASK-B', 'STRATEGIZE', 'SPEC', [], true);

      const taskAHistory = await ledger.getTaskHistory('TASK-A');
      const taskBHistory = await ledger.getTaskHistory('TASK-B');

      expect(taskAHistory).toHaveLength(3);
      expect(taskBHistory).toHaveLength(2);

      expect(taskAHistory[0].to_phase).toBe('STRATEGIZE');
      expect(taskAHistory[1].to_phase).toBe('SPEC');
      expect(taskAHistory[2].to_phase).toBe('PLAN');
    });

    it('returns current phase from task history', async () => {
      await ledger.appendTransition('TEST-001', null, 'STRATEGIZE', [], true);
      await ledger.appendTransition('TEST-001', 'STRATEGIZE', 'SPEC', [], true);
      await ledger.appendTransition('TEST-001', 'SPEC', 'PLAN', [], true);

      const currentPhase = await ledger.getCurrentPhase('TEST-001');

      expect(currentPhase).toBe('PLAN');
    });

    it('returns null for task with no history', async () => {
      const currentPhase = await ledger.getCurrentPhase('NONEXISTENT');

      expect(currentPhase).toBeNull();
    });
  });

  describe('Ledger Statistics', () => {
    it('returns correct statistics', async () => {
      await ledger.appendTransition('TASK-A', null, 'STRATEGIZE', [], true);
      await ledger.appendTransition('TASK-B', null, 'STRATEGIZE', [], true);
      await ledger.appendTransition('TASK-A', 'STRATEGIZE', 'SPEC', [], true);

      const stats = await ledger.getStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.uniqueTasks).toBe(2);
      expect(stats.oldestEntry).toBeTruthy();
      expect(stats.newestEntry).toBeTruthy();
      expect(stats.lastHash).not.toBe('genesis');
    });

    it('returns genesis stats for empty ledger', async () => {
      const stats = await ledger.getStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.uniqueTasks).toBe(0);
      expect(stats.lastHash).toBe('genesis');
    });
  });

  describe('Evidence Recording', () => {
    it('records evidence artifacts in ledger entry', async () => {
      const artifacts = [
        'state/evidence/build.log',
        'state/evidence/test-results.json',
        'state/evidence/coverage.json'
      ];

      const entry = await ledger.appendTransition(
        'TEST-001',
        'IMPLEMENT',
        'VERIFY',
        artifacts,
        true
      );

      expect(entry.evidence_artifacts).toEqual(artifacts);
      expect(entry.evidence_validated).toBe(true);
    });

    it('records failed validation status', async () => {
      const entry = await ledger.appendTransition(
        'TEST-001',
        'IMPLEMENT',
        'VERIFY',
        [],
        false  // Evidence validation failed
      );

      expect(entry.evidence_validated).toBe(false);
    });
  });

  describe('Metadata Recording', () => {
    it('records agent type and duration in metadata', async () => {
      const entry = await ledger.appendTransition(
        'TEST-001',
        'PLAN',
        'IMPLEMENT',
        [],
        true,
        {
          agentType: 'implementer',
          durationMs: 45000
        }
      );

      expect(entry.agent_type).toBe('implementer');
      expect(entry.duration_ms).toBe(45000);
    });
  });

  describe('Persistence', () => {
    it('persists entries to JSONL file', async () => {
      await ledger.appendTransition('TEST-001', null, 'STRATEGIZE', [], true);
      await ledger.appendTransition('TEST-001', 'STRATEGIZE', 'SPEC', [], true);

      expect(fs.existsSync(ledgerPath)).toBe(true);

      const content = fs.readFileSync(ledgerPath, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(2);

      const entry1 = JSON.parse(lines[0]);
      const entry2 = JSON.parse(lines[1]);

      expect(entry1.to_phase).toBe('STRATEGIZE');
      expect(entry2.to_phase).toBe('SPEC');
    });

    it('loads last entry hash on initialization from existing ledger', async () => {
      // Create first ledger and add entries
      await ledger.appendTransition('TEST-001', null, 'STRATEGIZE', [], true);
      const entry2 = await ledger.appendTransition('TEST-001', 'STRATEGIZE', 'SPEC', [], true);

      // Create new ledger instance (simulating restart)
      const ledger2 = new PhaseLedger(testWorkspaceRoot);
      await ledger2.initialize();

      // Add another entry
      const entry3 = await ledger2.appendTransition('TEST-001', 'SPEC', 'PLAN', [], true);

      // Verify chain continues correctly
      expect(entry3.previous_hash).toBe(entry2.entry_hash);
    });
  });
});
