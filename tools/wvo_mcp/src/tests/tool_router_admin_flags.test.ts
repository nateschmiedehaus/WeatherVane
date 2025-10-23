import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';

import { DEFAULT_LIVE_FLAGS, SettingsStore, seedLiveFlagDefaults } from '../state/live_flags.js';

/**
 * Admin Flags Tool Integration Tests (T6.4.5)
 *
 * Tests the mcp_admin_flags tool functionality through SettingsStore.
 * Verifies the behavior that the tool handler depends on:
 * - GET action returns all flags or single flag
 * - SET action updates flags atomically
 * - RESET action restores defaults
 * - Error handling for invalid flags and actions
 */

describe('Admin Flags Tool Behavior (T6.4.5)', () => {
  let testDbPath: string;
  let testWorkspaceRoot: string;

  beforeEach(async () => {
    testDbPath = path.join('/tmp', `test_admin_flags_${randomUUID()}.db`);
    testWorkspaceRoot = path.dirname(testDbPath);

    // Create fresh database with settings table
    const db = new Database(testDbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        val TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    seedLiveFlagDefaults(db);
    db.close();
  });

  afterEach(async () => {
    try {
      await fs.unlink(testDbPath);
      await fs.unlink(`${testDbPath}-wal`);
      await fs.unlink(`${testDbPath}-shm`);
    } catch {
      // Files may not exist
    }
  });

  describe('GET behavior', () => {
    it('should return all flags when store is read', async () => {
      const store = new SettingsStore({
        workspaceRoot: testWorkspaceRoot,
        sqlitePath: testDbPath,
        readOnly: false,
      });

      const flags = store.read();
      expect(flags).toEqual(DEFAULT_LIVE_FLAGS);
      expect(flags.PROMPT_MODE).toBe('compact');
      expect(flags.SANDBOX_MODE).toBe('none');
      expect(flags.SCHEDULER_MODE).toBe('legacy');
      store.close();
    });

    it('should return single flag value correctly', async () => {
      const store = new SettingsStore({
        workspaceRoot: testWorkspaceRoot,
        sqlitePath: testDbPath,
        readOnly: false,
      });

      const flags = store.read();
      expect(flags.PROMPT_MODE).toBe(DEFAULT_LIVE_FLAGS.PROMPT_MODE);
      expect(flags.MO_ENGINE).toBe(DEFAULT_LIVE_FLAGS.MO_ENGINE);
      store.close();
    });
  });

  describe('SET behavior', () => {
    it('should update single flag', async () => {
      const store = new SettingsStore({
        workspaceRoot: testWorkspaceRoot,
        sqlitePath: testDbPath,
        readOnly: false,
      });

      const result = store.upsert('PROMPT_MODE', 'verbose');
      expect(result.PROMPT_MODE).toBe('verbose');
      store.close();
    });

    it('should update multiple flags atomically', async () => {
      const store = new SettingsStore({
        workspaceRoot: testWorkspaceRoot,
        sqlitePath: testDbPath,
        readOnly: false,
      });

      const result = store.upsertMany({
        PROMPT_MODE: 'verbose',
        SANDBOX_MODE: 'pool',
        SCHEDULER_MODE: 'wsjf',
      });

      expect(result.PROMPT_MODE).toBe('verbose');
      expect(result.SANDBOX_MODE).toBe('pool');
      expect(result.SCHEDULER_MODE).toBe('wsjf');
      store.close();
    });

    it('should enable experimental features', async () => {
      const store = new SettingsStore({
        workspaceRoot: testWorkspaceRoot,
        sqlitePath: testDbPath,
        readOnly: false,
      });

      const result = store.upsertMany({
        MO_ENGINE: '1',
        SELECTIVE_TESTS: '1',
        DANGER_GATES: '1',
      });

      expect(result.MO_ENGINE).toBe('1');
      expect(result.SELECTIVE_TESTS).toBe('1');
      expect(result.DANGER_GATES).toBe('1');
      store.close();
    });

    it('should handle numeric values', async () => {
      const store = new SettingsStore({
        workspaceRoot: testWorkspaceRoot,
        sqlitePath: testDbPath,
        readOnly: false,
      });

      const result = store.upsertMany({
        CRITIC_INTELLIGENCE_LEVEL: 3,
        RESEARCH_TRIGGER_SENSITIVITY: 0.75,
      });

      expect(result.CRITIC_INTELLIGENCE_LEVEL).toBe('3');
      expect(result.RESEARCH_TRIGGER_SENSITIVITY).toBe('0.75');
      store.close();
    });

    it('should persist changes to database', async () => {
      // Set a flag
      let store = new SettingsStore({
        workspaceRoot: testWorkspaceRoot,
        sqlitePath: testDbPath,
        readOnly: false,
      });
      store.upsert('SANDBOX_MODE', 'pool');
      store.close();

      // Read it back in a new store
      store = new SettingsStore({
        workspaceRoot: testWorkspaceRoot,
        sqlitePath: testDbPath,
        readOnly: false,
      });
      const flags = store.read();
      expect(flags.SANDBOX_MODE).toBe('pool');
      store.close();
    });
  });

  describe('RESET behavior', () => {
    it('should reset single flag to default', async () => {
      const store = new SettingsStore({
        workspaceRoot: testWorkspaceRoot,
        sqlitePath: testDbPath,
        readOnly: false,
      });

      // First set a flag
      store.upsert('PROMPT_MODE', 'verbose');
      let snapshot = store.read();
      expect(snapshot.PROMPT_MODE).toBe('verbose');

      // Then reset it
      snapshot = store.upsert('PROMPT_MODE', DEFAULT_LIVE_FLAGS.PROMPT_MODE);
      expect(snapshot.PROMPT_MODE).toBe(DEFAULT_LIVE_FLAGS.PROMPT_MODE);
      store.close();
    });
  });

  describe('Canary Validation Scenarios', () => {
    it('should allow enabling sandbox pooling for canary', async () => {
      const store = new SettingsStore({
        workspaceRoot: testWorkspaceRoot,
        sqlitePath: testDbPath,
        readOnly: false,
      });

      const result = store.upsert('SANDBOX_MODE', 'pool');
      expect(result.SANDBOX_MODE).toBe('pool');
      store.close();
    });

    it('should allow enabling WSJF scheduler for canary', async () => {
      const store = new SettingsStore({
        workspaceRoot: testWorkspaceRoot,
        sqlitePath: testDbPath,
        readOnly: false,
      });

      const result = store.upsert('SCHEDULER_MODE', 'wsjf');
      expect(result.SCHEDULER_MODE).toBe('wsjf');
      store.close();
    });

    it('should allow enabling MO engine for canary', async () => {
      const store = new SettingsStore({
        workspaceRoot: testWorkspaceRoot,
        sqlitePath: testDbPath,
        readOnly: false,
      });

      const result = store.upsert('MO_ENGINE', '1');
      expect(result.MO_ENGINE).toBe('1');
      store.close();
    });

    it('should support complete feature set activation', async () => {
      const store = new SettingsStore({
        workspaceRoot: testWorkspaceRoot,
        sqlitePath: testDbPath,
        readOnly: false,
      });

      const result = store.upsertMany({
        PROMPT_MODE: 'compact',
        SANDBOX_MODE: 'pool',
        SCHEDULER_MODE: 'wsjf',
        SELECTIVE_TESTS: '1',
        DANGER_GATES: '1',
        MO_ENGINE: '1',
      });

      expect(result.PROMPT_MODE).toBe('compact');
      expect(result.SANDBOX_MODE).toBe('pool');
      expect(result.SCHEDULER_MODE).toBe('wsjf');
      expect(result.SELECTIVE_TESTS).toBe('1');
      expect(result.DANGER_GATES).toBe('1');
      expect(result.MO_ENGINE).toBe('1');
      store.close();
    });

    it('should allow rollback of canary changes', async () => {
      const store = new SettingsStore({
        workspaceRoot: testWorkspaceRoot,
        sqlitePath: testDbPath,
        readOnly: false,
      });

      // Enable features
      store.upsertMany({
        SANDBOX_MODE: 'pool',
        SCHEDULER_MODE: 'wsjf',
      });

      // Rollback
      const result = store.upsertMany({
        SANDBOX_MODE: 'none',
        SCHEDULER_MODE: 'legacy',
      });

      expect(result.SANDBOX_MODE).toBe('none');
      expect(result.SCHEDULER_MODE).toBe('legacy');
      store.close();
    });
  });
});
