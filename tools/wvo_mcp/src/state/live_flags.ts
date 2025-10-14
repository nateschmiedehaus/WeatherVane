import path from 'node:path';

import DatabaseConstructor from 'better-sqlite3';

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

export class SettingsStore {
  private readonly db: ReturnType<typeof DatabaseConstructor>;

  constructor(options: { workspaceRoot: string; sqlitePath?: string }) {
    const sqlitePath =
      options.sqlitePath ?? path.join(options.workspaceRoot, 'state', 'orchestrator.db');
    this.db = new DatabaseConstructor(sqlitePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  upsert(key: LiveFlagKey, rawValue: unknown): LiveFlagSnapshot {
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
