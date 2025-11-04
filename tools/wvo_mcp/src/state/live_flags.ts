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
  'CONSENSUS_ENGINE',
  'ADMIN_TOOLS',
  'UPGRADE_TOOLS',
  'ROUTING_TOOLS',
  'HOLISTIC_REVIEW_ENABLED',
  'HOLISTIC_REVIEW_MIN_TASKS',
  'HOLISTIC_REVIEW_MAX_TASKS_TRACKED',
  'HOLISTIC_REVIEW_GROUP_INTERVAL_MINUTES',
  'HOLISTIC_REVIEW_GLOBAL_INTERVAL_MINUTES',
  'HOLISTIC_REVIEW_GLOBAL_MIN_TASKS',
  'OBSERVER_AGENT_ENABLED',
  'OBSERVER_AGENT_CADENCE',
  'OBSERVER_AGENT_TIMEOUT_MS',
  'OBSERVER_AGENT_MODEL',
  'QUALITY_GRAPH_HINTS_INJECTION',
  'QUALITY_GRAPH_EMBEDDINGS',
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
  CONSENSUS_ENGINE: '1',
  ADMIN_TOOLS: '0',
  UPGRADE_TOOLS: '0',
  ROUTING_TOOLS: '0',
  HOLISTIC_REVIEW_ENABLED: '1',
  HOLISTIC_REVIEW_MIN_TASKS: '3',
  HOLISTIC_REVIEW_MAX_TASKS_TRACKED: '6',
  HOLISTIC_REVIEW_GROUP_INTERVAL_MINUTES: '45',
  HOLISTIC_REVIEW_GLOBAL_INTERVAL_MINUTES: '90',
  HOLISTIC_REVIEW_GLOBAL_MIN_TASKS: '6',
  OBSERVER_AGENT_ENABLED: '0',
  OBSERVER_AGENT_CADENCE: '5',
  OBSERVER_AGENT_TIMEOUT_MS: '30000',
  OBSERVER_AGENT_MODEL: 'gpt-5.1-high',
  QUALITY_GRAPH_HINTS_INJECTION: 'observe',
  QUALITY_GRAPH_EMBEDDINGS: 'tfidf',
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
    case 'CONSENSUS_ENGINE':
    case 'ADMIN_TOOLS':
    case 'UPGRADE_TOOLS':
    case 'ROUTING_TOOLS':
    case 'HOLISTIC_REVIEW_ENABLED':
    case 'OBSERVER_AGENT_ENABLED':
      return (stringValue === '1' ? '1' : '0') as LiveFlagSnapshot[K];
    case 'HOLISTIC_REVIEW_MIN_TASKS':
    case 'HOLISTIC_REVIEW_MAX_TASKS_TRACKED':
    case 'HOLISTIC_REVIEW_GLOBAL_MIN_TASKS':
    case 'OBSERVER_AGENT_CADENCE': {
      const numeric = Number.parseInt(stringValue, 10);
      if (Number.isNaN(numeric) || numeric < 1) {
        return DEFAULT_LIVE_FLAGS[key] as LiveFlagSnapshot[K];
      }
      const max =
        key === 'OBSERVER_AGENT_CADENCE'
          ? 1000
          : 50;
      const clamped = Math.min(max, numeric);
      return clamped.toString() as LiveFlagSnapshot[K];
    }
    case 'HOLISTIC_REVIEW_GROUP_INTERVAL_MINUTES':
    case 'HOLISTIC_REVIEW_GLOBAL_INTERVAL_MINUTES': {
      const numeric = Number.parseInt(stringValue, 10);
      if (Number.isNaN(numeric) || numeric < 1) {
        return DEFAULT_LIVE_FLAGS[key] as LiveFlagSnapshot[K];
      }
      const clamped = Math.min(1440, numeric); // cap to 24 hours
      return clamped.toString() as LiveFlagSnapshot[K];
    }
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
    case 'OBSERVER_AGENT_TIMEOUT_MS': {
      const numeric = Number.parseInt(stringValue, 10);
      if (Number.isNaN(numeric) || numeric < 1000) {
        return DEFAULT_LIVE_FLAGS[key] as LiveFlagSnapshot[K];
      }
      const clamped = Math.min(300000, numeric);
      return clamped.toString() as LiveFlagSnapshot[K];
    }
    case 'OBSERVER_AGENT_MODEL': {
      if (!stringValue) {
        return DEFAULT_LIVE_FLAGS[key] as LiveFlagSnapshot[K];
      }
      return stringValue as LiveFlagSnapshot[K];
    }
    case 'QUALITY_GRAPH_HINTS_INJECTION': {
      if (stringValue === 'enforce') return 'enforce' as LiveFlagSnapshot[K];
      if (stringValue === 'off') return 'off' as LiveFlagSnapshot[K];
      return 'observe' as LiveFlagSnapshot[K];  // default
    }
    case 'QUALITY_GRAPH_EMBEDDINGS': {
      if (stringValue === 'neural') return 'neural' as LiveFlagSnapshot[K];
      return 'tfidf' as LiveFlagSnapshot[K];
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
    return this.upsertMany({ [key]: rawValue });
  }

  upsertMany(updates: Partial<Record<LiveFlagKey, unknown>>): LiveFlagSnapshot {
    if (this.readOnly || this.disabled) {
      throw createDryRunError('settings.upsert');
    }

    const entries = Object.entries(updates ?? {}) as Array<[string, unknown]>;
    if (entries.length === 0) {
      return this.read();
    }

    const assignments: Array<{ key: LiveFlagKey; value: string }> = [];
    for (const [rawKey, rawValue] of entries) {
      if (!isLiveFlagKey(rawKey)) {
        throw new Error(`Unsupported live flag "${rawKey}"`);
      }
      const key = rawKey as LiveFlagKey;
      const serialised =
        typeof rawValue === 'string'
          ? rawValue
          : typeof rawValue === 'number' || typeof rawValue === 'boolean'
          ? String(rawValue)
          : '';
      const normalised = normalizeLiveFlagValue(key, serialised);
      assignments.push({ key, value: normalised });
    }

    const timestamp = Date.now();
    const statement = this.db.prepare(
      `INSERT INTO settings (key, val, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         val = excluded.val,
         updated_at = excluded.updated_at`,
    );

    const transaction = this.db.transaction((rows: Array<{ key: LiveFlagKey; value: string }>) => {
      for (const assignment of rows) {
        statement.run(assignment.key, assignment.value, timestamp);
      }
    });

    transaction(assignments);
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

export type { LiveFlagsOptions, LiveFlagsReader } from '../orchestrator/live_flags.js';
export { LiveFlags } from '../orchestrator/live_flags.js';
