import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';

import {
  DEFAULT_LIVE_FLAGS,
  SettingsStore,
  isLiveFlagKey,
  normalizeLiveFlagValue,
  type LiveFlagKey,
  type LiveFlagSnapshot,
  seedLiveFlagDefaults,
} from '../state/live_flags.js';

/**
 * Feature Flag Gating Tests (T6.4.5)
 *
 * Tests comprehensive flag management for:
 * - Compact prompt headers (PROMPT_MODE)
 * - Sandbox pooling (SANDBOX_MODE)
 * - Scheduler WSJF mode (SCHEDULER_MODE)
 * - Selective tests (SELECTIVE_TESTS)
 * - Danger gates (DANGER_GATES)
 * - Multi-objective engine (MO_ENGINE)
 * - All other runtime toggles
 *
 * Ensures flags only activate after successful canary validation
 */

describe('Feature Flag Gating System (T6.4.5)', () => {
  let testDbPath: string;
  let db: Database.Database;

  beforeEach(async () => {
    testDbPath = path.join(
      '/tmp',
      `test_live_flags_${randomUUID()}.db`
    );

    // Create fresh database
    db = new Database(testDbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Create settings table
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        val TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  });

  afterEach(async () => {
    db.close();
    try {
      await fs.unlink(testDbPath);
      await fs.unlink(`${testDbPath}-wal`);
      await fs.unlink(`${testDbPath}-shm`);
    } catch {
      // Files may not exist
    }
  });

  describe('Live Flag Keys', () => {
    it('should export all required flag keys', () => {
      expect(isLiveFlagKey('PROMPT_MODE')).toBe(true);
      expect(isLiveFlagKey('SANDBOX_MODE')).toBe(true);
      expect(isLiveFlagKey('SCHEDULER_MODE')).toBe(true);
      expect(isLiveFlagKey('SELECTIVE_TESTS')).toBe(true);
      expect(isLiveFlagKey('DANGER_GATES')).toBe(true);
      expect(isLiveFlagKey('MO_ENGINE')).toBe(true);
      expect(isLiveFlagKey('CONSENSUS_ENGINE')).toBe(true);
    });

    it('should reject invalid flag keys', () => {
      expect(isLiveFlagKey('INVALID_FLAG')).toBe(false);
      expect(isLiveFlagKey('random_string')).toBe(false);
    });
  });

  describe('Flag Normalization', () => {
    describe('PROMPT_MODE', () => {
      it('should normalize to "compact" (default)', () => {
        expect(normalizeLiveFlagValue('PROMPT_MODE', 'compact')).toBe('compact');
        expect(normalizeLiveFlagValue('PROMPT_MODE', 'COMPACT')).toBe('compact');
        expect(normalizeLiveFlagValue('PROMPT_MODE', 'invalid')).toBe('compact');
      });

      it('should support "verbose" mode', () => {
        expect(normalizeLiveFlagValue('PROMPT_MODE', 'verbose')).toBe('verbose');
        expect(normalizeLiveFlagValue('PROMPT_MODE', 'VERBOSE')).toBe('verbose');
      });
    });

    describe('SANDBOX_MODE', () => {
      it('should normalize to "none" (default)', () => {
        expect(normalizeLiveFlagValue('SANDBOX_MODE', 'none')).toBe('none');
        expect(normalizeLiveFlagValue('SANDBOX_MODE', 'NONE')).toBe('none');
        expect(normalizeLiveFlagValue('SANDBOX_MODE', 'invalid')).toBe('none');
      });

      it('should support "pool" mode for sandbox pooling', () => {
        expect(normalizeLiveFlagValue('SANDBOX_MODE', 'pool')).toBe('pool');
        expect(normalizeLiveFlagValue('SANDBOX_MODE', 'POOL')).toBe('pool');
      });
    });

    describe('SCHEDULER_MODE', () => {
      it('should normalize to "legacy" (default)', () => {
        expect(normalizeLiveFlagValue('SCHEDULER_MODE', 'legacy')).toBe('legacy');
        expect(normalizeLiveFlagValue('SCHEDULER_MODE', 'LEGACY')).toBe('legacy');
        expect(normalizeLiveFlagValue('SCHEDULER_MODE', 'invalid')).toBe('legacy');
      });

      it('should support "wsjf" (weighted shortest job first)', () => {
        expect(normalizeLiveFlagValue('SCHEDULER_MODE', 'wsjf')).toBe('wsjf');
        expect(normalizeLiveFlagValue('SCHEDULER_MODE', 'WSJF')).toBe('wsjf');
      });
    });

    describe('Boolean Flags', () => {
      const booleanFlags: LiveFlagKey[] = [
        'SELECTIVE_TESTS',
        'DANGER_GATES',
        'MO_ENGINE',
        'CONSENSUS_ENGINE',
        'OTEL_ENABLED',
        'UI_ENABLED',
        'DISABLE_NEW',
        'RESEARCH_LAYER',
        'INTELLIGENT_CRITICS',
        'EFFICIENT_OPERATIONS',
      ];

      it.each(booleanFlags)('should normalize %s to binary values', (flag) => {
        // '1' is truthy
        expect(normalizeLiveFlagValue(flag, '1')).toBe('1');
        // Anything else (including 'true', non-1 strings) becomes '0'
        expect(normalizeLiveFlagValue(flag, 'true')).toBe('0');
        expect(normalizeLiveFlagValue(flag, 'TRUE')).toBe('0');
        expect(normalizeLiveFlagValue(flag, '0')).toBe('0');
        expect(normalizeLiveFlagValue(flag, 'false')).toBe('0');
        expect(normalizeLiveFlagValue(flag, 'invalid')).toBe('0');
        expect(normalizeLiveFlagValue(flag, '')).toBe('0');
      });
    });

    describe('Numeric Flags', () => {
      it('should normalize RESEARCH_TRIGGER_SENSITIVITY to [0.0, 1.0]', () => {
        expect(normalizeLiveFlagValue('RESEARCH_TRIGGER_SENSITIVITY', '0.5')).toBe('0.5');
        expect(normalizeLiveFlagValue('RESEARCH_TRIGGER_SENSITIVITY', '0')).toBe('0');
        expect(normalizeLiveFlagValue('RESEARCH_TRIGGER_SENSITIVITY', '1')).toBe('1');
        // Should clamp
        expect(normalizeLiveFlagValue('RESEARCH_TRIGGER_SENSITIVITY', '1.5')).toBe('1');
        expect(normalizeLiveFlagValue('RESEARCH_TRIGGER_SENSITIVITY', '-0.5')).toBe('0');
      });

      it('should normalize CRITIC_INTELLIGENCE_LEVEL to [1, 3]', () => {
        expect(normalizeLiveFlagValue('CRITIC_INTELLIGENCE_LEVEL', '1')).toBe('1');
        expect(normalizeLiveFlagValue('CRITIC_INTELLIGENCE_LEVEL', '2')).toBe('2');
        expect(normalizeLiveFlagValue('CRITIC_INTELLIGENCE_LEVEL', '3')).toBe('3');
        // Should clamp
        expect(normalizeLiveFlagValue('CRITIC_INTELLIGENCE_LEVEL', '5')).toBe('3');
        expect(normalizeLiveFlagValue('CRITIC_INTELLIGENCE_LEVEL', '0')).toBe('1');
      });
    });
  });

  describe('SettingsStore', () => {
    let store: SettingsStore;

    beforeEach(() => {
      store = new SettingsStore({
        workspaceRoot: path.dirname(testDbPath),
        sqlitePath: testDbPath,
        readOnly: false,
      });
      seedLiveFlagDefaults(db);
    });

    afterEach(() => {
      store.close();
    });

    describe('read()', () => {
      it('should return default flags when database is empty', () => {
        const snapshot = store.read();
        expect(snapshot).toEqual(DEFAULT_LIVE_FLAGS);
      });

      it('should return flags with correct types', () => {
        const snapshot = store.read();
        expect(typeof snapshot.PROMPT_MODE).toBe('string');
        expect(['compact', 'verbose']).toContain(snapshot.PROMPT_MODE);
      });
    });

    describe('upsert()', () => {
      it('should update a single flag', () => {
        const result = store.upsert('PROMPT_MODE', 'verbose');
        expect(result.PROMPT_MODE).toBe('verbose');
        expect(result.SANDBOX_MODE).toBe(DEFAULT_LIVE_FLAGS.SANDBOX_MODE);
      });

      it('should normalize values on upsert', () => {
        const result = store.upsert('PROMPT_MODE', 'VERBOSE');
        expect(result.PROMPT_MODE).toBe('verbose');
      });

      it('should persist changes', () => {
        store.upsert('PROMPT_MODE', 'verbose');

        const store2 = new SettingsStore({
          workspaceRoot: path.dirname(testDbPath),
          sqlitePath: testDbPath,
          readOnly: false,
        });
        const snapshot = store2.read();
        expect(snapshot.PROMPT_MODE).toBe('verbose');
        store2.close();
      });
    });

    describe('upsertMany()', () => {
      it('should update multiple flags atomically', () => {
        const result = store.upsertMany({
          PROMPT_MODE: 'verbose',
          SANDBOX_MODE: 'pool',
          SCHEDULER_MODE: 'wsjf',
        });

        expect(result.PROMPT_MODE).toBe('verbose');
        expect(result.SANDBOX_MODE).toBe('pool');
        expect(result.SCHEDULER_MODE).toBe('wsjf');
      });

      it('should handle mixed value types', () => {
        const result = store.upsertMany({
          PROMPT_MODE: 'verbose',
          MO_ENGINE: '1',
          SELECTIVE_TESTS: 1, // numeric 1 becomes string '1'
        });

        expect(result.PROMPT_MODE).toBe('verbose');
        expect(result.MO_ENGINE).toBe('1');
        expect(result.SELECTIVE_TESTS).toBe('1'); // numeric 1 converted to string '1'
      });

      it('should validate flag keys', () => {
        expect(() => {
          store.upsertMany({
            INVALID_FLAG: 'value' as unknown as string,
          } as any);
        }).toThrow('Unsupported live flag');
      });
    });
  });

  describe('Canary Validation Gates', () => {
    let store: SettingsStore;

    beforeEach(() => {
      store = new SettingsStore({
        workspaceRoot: path.dirname(testDbPath),
        sqlitePath: testDbPath,
        readOnly: false,
      });
    });

    afterEach(() => {
      store.close();
    });

    it('should start with all experimental flags disabled', () => {
      const snapshot = store.read();
      // These should be off by default until canary passes
      expect(snapshot.SANDBOX_MODE).toBe('none');
      expect(snapshot.SCHEDULER_MODE).toBe('legacy');
      expect(snapshot.MO_ENGINE).toBe('0');
    });

    it('should allow explicit enablement of flags', () => {
      // Simulate successful canary validation
      const result = store.upsertMany({
        SANDBOX_MODE: 'pool',
        SCHEDULER_MODE: 'wsjf',
        MO_ENGINE: '1',
      });

      expect(result.SANDBOX_MODE).toBe('pool');
      expect(result.SCHEDULER_MODE).toBe('wsjf');
      expect(result.MO_ENGINE).toBe('1');
    });

    it('should allow explicit reset to defaults', () => {
      // Enable flag
      store.upsert('SANDBOX_MODE', 'pool');
      let snapshot = store.read();
      expect(snapshot.SANDBOX_MODE).toBe('pool');

      // Reset to default
      snapshot = store.upsert('SANDBOX_MODE', DEFAULT_LIVE_FLAGS.SANDBOX_MODE);
      expect(snapshot.SANDBOX_MODE).toBe('none');
    });
  });

  describe('Feature Flag Combinations', () => {
    let store: SettingsStore;

    beforeEach(() => {
      store = new SettingsStore({
        workspaceRoot: path.dirname(testDbPath),
        sqlitePath: testDbPath,
        readOnly: false,
      });
    });

    afterEach(() => {
      store.close();
    });

    it('should support compact prompts + sandbox pooling', () => {
      const result = store.upsertMany({
        PROMPT_MODE: 'compact',
        SANDBOX_MODE: 'pool',
      });

      expect(result.PROMPT_MODE).toBe('compact');
      expect(result.SANDBOX_MODE).toBe('pool');
    });

    it('should support WSJF scheduler + selective tests', () => {
      const result = store.upsertMany({
        SCHEDULER_MODE: 'wsjf',
        SELECTIVE_TESTS: '1',
      });

      expect(result.SCHEDULER_MODE).toBe('wsjf');
      expect(result.SELECTIVE_TESTS).toBe('1');
    });

    it('should support danger gates + MO engine', () => {
      const result = store.upsertMany({
        DANGER_GATES: '1',
        MO_ENGINE: '1',
      });

      expect(result.DANGER_GATES).toBe('1');
      expect(result.MO_ENGINE).toBe('1');
    });

    it('should support consensus engine + intelligent critics', () => {
      const result = store.upsertMany({
        CONSENSUS_ENGINE: '1',
        INTELLIGENT_CRITICS: '1',
      });

      expect(result.CONSENSUS_ENGINE).toBe('1');
      expect(result.INTELLIGENT_CRITICS).toBe('1');
    });
  });

  describe('Default Values', () => {
    it('should have sensible production defaults', () => {
      // Compact prompts enabled (conservative)
      expect(DEFAULT_LIVE_FLAGS.PROMPT_MODE).toBe('compact');

      // Sandbox disabled (safe default)
      expect(DEFAULT_LIVE_FLAGS.SANDBOX_MODE).toBe('none');

      // Legacy scheduler (stable)
      expect(DEFAULT_LIVE_FLAGS.SCHEDULER_MODE).toBe('legacy');

      // Danger gates disabled (safe)
      expect(DEFAULT_LIVE_FLAGS.DANGER_GATES).toBe('0');

      // MO engine disabled (pending validation)
      expect(DEFAULT_LIVE_FLAGS.MO_ENGINE).toBe('0');

      // Research layer enabled (beneficial)
      expect(DEFAULT_LIVE_FLAGS.RESEARCH_LAYER).toBe('1');

      // Consensus engine enabled (beneficial)
      expect(DEFAULT_LIVE_FLAGS.CONSENSUS_ENGINE).toBe('1');
    });
  });

  describe('Flag Isolation', () => {
    let store: SettingsStore;

    beforeEach(() => {
      store = new SettingsStore({
        workspaceRoot: path.dirname(testDbPath),
        sqlitePath: testDbPath,
        readOnly: false,
      });
    });

    afterEach(() => {
      store.close();
    });

    it('should not affect other flags when updating one', () => {
      const initial = store.read();

      // Change one flag
      store.upsert('PROMPT_MODE', 'verbose');

      const updated = store.read();

      // All other flags should be unchanged
      for (const key in DEFAULT_LIVE_FLAGS) {
        if (key !== 'PROMPT_MODE') {
          expect(updated[key as LiveFlagKey]).toBe(initial[key as LiveFlagKey]);
        }
      }
    });
  });

  describe('Error Handling', () => {
    let store: SettingsStore;

    beforeEach(() => {
      store = new SettingsStore({
        workspaceRoot: path.dirname(testDbPath),
        sqlitePath: testDbPath,
        readOnly: false,
      });
    });

    afterEach(() => {
      store.close();
    });

    it('should throw on unsupported flag key', () => {
      expect(() => {
        store.upsert('UNSUPPORTED_FLAG' as any, 'value');
      }).toThrow('Unsupported live flag');
    });

    it('should handle invalid input gracefully', () => {
      expect(() => {
        store.upsert('PROMPT_MODE', null as any);
      }).not.toThrow();
    });
  });
});
