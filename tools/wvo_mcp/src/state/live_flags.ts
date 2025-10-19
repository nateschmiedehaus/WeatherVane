import fs from 'node:fs';
import path from 'node:path';

import DatabaseConstructor from 'better-sqlite3';

import { createDryRunError, isDryRunEnabled } from '../utils/dry_run.js';

export const LIVE_FLAG_KEYS = [
  'PROMPT_MODE',
  'SANDBOX_MODE',
  'OTEL_ENABLED',
  'SCHEDULER_MODE',
  'SELECTIVE_TESTS',
  'DANGER_GATES',
  'UI_ENABLED',
  'MO_ENGINE',
  'DISABLE_NEW',
  'RESEARCH_LAYER',
  'INTELLIGENT_CRITICS',
  'EFFICIENT_OPERATIONS',
  'RESEARCH_TRIGGER_SENSITIVITY',
  'CRITIC_INTELLIGENCE_LEVEL',
  'CRITIC_REPUTATION',
  'EVIDENCE_LINKING',
  'VELOCITY_TRACKING',
] as const;

export type LiveFlagKey = (typeof LIVE_FLAG_KEYS)[number];

export type LiveFlagSnapshot = Record<LiveFlagKey, string>;

export const DEFAULT_LIVE_FLAGS: LiveFlagSnapshot = {
  PROMPT_MODE: 'compact',
  SANDBOX_MODE: 'none',
  OTEL_ENABLED: '0',
  SCHEDULER_MODE: 'legacy',
  SELECTIVE_TESTS: '0',
  DANGER_GATES: '0',
  UI_ENABLED: '0',
  MO_ENGINE: '0',
  DISABLE_NEW: '0',
  RESEARCH_LAYER: '1',
  INTELLIGENT_CRITICS: '1',
  EFFICIENT_OPERATIONS: '1',
  RESEARCH_TRIGGER_SENSITIVITY: '0.5',
  CRITIC_INTELLIGENCE_LEVEL: '2',
  CRITIC_REPUTATION: '0',
  EVIDENCE_LINKING: '0',
  VELOCITY_TRACKING: '0',
};

export function isLiveFlagKey(value: string): value is LiveFlagKey {
  return (LIVE_FLAG_KEYS as readonly string[]).includes(value);
}

export function normalizeLiveFlagValue<K extends LiveFlagKey>(
  key: K,
  raw: unknown,
): LiveFlagSnapshot[K] {
  const stringValue = typeof raw === 'string' ? raw.trim().toLowerCase() : '';

  switch (key) {
    case 'PROMPT_MODE':
      return (stringValue === 'verbose' ? 'verbose' : 'compact') as LiveFlagSnapshot[K];
    case 'SANDBOX_MODE':
      return (stringValue === 'pool' ? 'pool' : 'none') as LiveFlagSnapshot[K];
    case 'SCHEDULER_MODE':
      return (stringValue === 'wsjf' ? 'wsjf' : 'legacy') as LiveFlagSnapshot[K];
    case 'OTEL_ENABLED':
    case 'SELECTIVE_TESTS':
    case 'DANGER_GATES':
    case 'UI_ENABLED':
    case 'MO_ENGINE':
    case 'DISABLE_NEW':
    case 'RESEARCH_LAYER':
    case 'INTELLIGENT_CRITICS':
    case 'EFFICIENT_OPERATIONS':
    case 'CRITIC_REPUTATION':
    case 'EVIDENCE_LINKING':
    case 'VELOCITY_TRACKING':
      return (stringValue === '1' ? '1' : '0') as LiveFlagSnapshot[K];
    case 'RESEARCH_TRIGGER_SENSITIVITY': {
      const numeric = Number.parseFloat(stringValue);
      if (Number.isNaN(numeric)) {
        return DEFAULT_LIVE_FLAGS[key] as LiveFlagSnapshot[K];
      }
      const clamped = Math.min(1, Math.max(0, Math.round(numeric * 100) / 100));
      return clamped.toString() as LiveFlagSnapshot[K];
    }
    case 'CRITIC_INTELLIGENCE_LEVEL': {
      const numeric = Number.parseInt(stringValue, 10);
      if (Number.isNaN(numeric)) {
        return DEFAULT_LIVE_FLAGS[key] as LiveFlagSnapshot[K];
      }
      const clamped = Math.min(3, Math.max(1, numeric));
      return clamped.toString() as LiveFlagSnapshot[K];
    }
    default: {
      return DEFAULT_LIVE_FLAGS[key] as LiveFlagSnapshot[K];
    }
  }
}

export function seedLiveFlagDefaults(
  db: ReturnType<typeof DatabaseConstructor>,
): void {
  const statement = db.prepare(
    `INSERT OR IGNORE INTO settings (key, val, updated_at) VALUES (?, ?, ?)`,
  );
  const timestamp = Date.now();

  for (const [key, value] of Object.entries(DEFAULT_LIVE_FLAGS) as Array<
    [LiveFlagKey, string]
  >) {
    statement.run(key, value, timestamp);
  }
}

interface SettingsStoreOptions {
  workspaceRoot: string;
  sqlitePath?: string;
  readOnly?: boolean;
}

export class SettingsStore {
  private readonly readOnly: boolean;
  private readonly disabled: boolean;
  private readonly sqlitePath: string;

  private readonly db: ReturnType<typeof DatabaseConstructor>;

  constructor(options: SettingsStoreOptions) {
    this.sqlitePath =
      options.sqlitePath ?? path.join(options.workspaceRoot, 'state', 'orchestrator.db');
    this.readOnly = options.readOnly ?? isDryRunEnabled();

    const sqliteDir = path.dirname(this.sqlitePath);
    fs.mkdirSync(sqliteDir, { recursive: true });

    const sqliteExists = fs.existsSync(this.sqlitePath);
    let disabled = false;

    if (this.readOnly) {
      if (!sqliteExists) {
        this.db = new DatabaseConstructor(':memory:');
        this.db.pragma('query_only = 1');
        disabled = true;
      } else {
        try {
          const uri = `file:${this.sqlitePath}?mode=ro`;
          this.db = new DatabaseConstructor(uri, {
            uri: true,
            readonly: true,
            fileMustExist: true,
          } as Parameters<typeof DatabaseConstructor>[1] & { uri: boolean });
          this.db.pragma('query_only = 1');
        } catch {
          this.db = new DatabaseConstructor(':memory:');
          this.db.pragma('query_only = 1');
          disabled = true;
        }
      }
    } else {
      this.db = new DatabaseConstructor(this.sqlitePath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
    }

    this.disabled = disabled;
  }

  upsert(key: LiveFlagKey, rawValue: unknown): LiveFlagSnapshot {
    if (this.readOnly || this.disabled) {
      throw createDryRunError('settings.upsert');
    }

    const value = normalizeLiveFlagValue(key, rawValue);
    const timestamp = Date.now();
    this.db
      .prepare(
        `INSERT INTO settings (key, val, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           val = excluded.val,
           updated_at = excluded.updated_at`,
      )
      .run(key, value, timestamp);
    return this.read();
  }

  read(): LiveFlagSnapshot {
    if (this.disabled) {
      return { ...DEFAULT_LIVE_FLAGS };
    }

    const snapshot: LiveFlagSnapshot = { ...DEFAULT_LIVE_FLAGS };
    const rows = this.db
      .prepare(`SELECT key, val FROM settings`)
      .all() as Array<{ key: string; val: string }>;

    for (const row of rows) {
      if (isLiveFlagKey(row.key)) {
        const key = row.key as LiveFlagKey;
        snapshot[key] = normalizeLiveFlagValue(key, row.val);
      }
    }

    return snapshot;
  }

  close(): void {
    this.db.close();
  }
}
