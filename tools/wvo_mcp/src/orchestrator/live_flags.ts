import path from 'node:path';

import DatabaseConstructor from 'better-sqlite3';

import { resolveStateRoot } from '../utils/config.js';
import {
  DEFAULT_LIVE_FLAGS,
  type LiveFlagKey,
  type LiveFlagSnapshot,
  isLiveFlagKey,
  normalizeLiveFlagValue,
} from '../state/live_flags.js';

export interface LiveFlagsOptions {
  workspaceRoot: string;
  pollIntervalMs?: number;
  sqlitePath?: string;
  onError?: (error: Error) => void;
}

export interface LiveFlagsReader {
  get(): LiveFlagSnapshot;
  getValue<K extends LiveFlagKey>(key: K): LiveFlagSnapshot[K];
}

export class LiveFlags implements LiveFlagsReader {
  private readonly pollInterval: number;
  private readonly timer: NodeJS.Timeout;
  private readonly db: ReturnType<typeof DatabaseConstructor> | null;
  private cache: LiveFlagSnapshot = { ...DEFAULT_LIVE_FLAGS };
  private disposed = false;

  constructor(private readonly options: LiveFlagsOptions) {
    this.pollInterval = Math.max(100, options.pollIntervalMs ?? 500);

    // Try to open database, but gracefully degrade to defaults if it fails
    try {
      const dbPath = this.options.sqlitePath ??
        path.join(resolveStateRoot(this.options.workspaceRoot), 'orchestrator.db');
      this.db = new DatabaseConstructor(dbPath, { readonly: true });
      this.refresh();
    } catch (error) {
      // Graceful degradation - use defaults
      this.db = null;
      if (error instanceof Error) {
        this.options.onError?.(error);
      }
    }

    this.timer = setInterval(() => {
      this.refresh();
    }, this.pollInterval);
    this.timer.unref?.();
  }

  get(): LiveFlagSnapshot {
    return { ...this.cache };
  }

  getValue<K extends LiveFlagKey>(key: K): LiveFlagSnapshot[K] {
    return this.cache[key];
  }

  dispose(): void {
    if (this.disposed) return;
    clearInterval(this.timer);
    this.db?.close();
    this.disposed = true;
  }

  private refresh(): void {
    if (this.disposed || !this.db) return;
    try {
      const snapshot: LiveFlagSnapshot = { ...DEFAULT_LIVE_FLAGS };
      const rows = this.db
        .prepare(`SELECT key, val FROM settings`)
        .all() as Array<{ key: string; val: string }>;

      for (const row of rows) {
        if (!isLiveFlagKey(row.key)) {
          continue;
        }
        const key = row.key as LiveFlagKey;
        snapshot[key] = normalizeLiveFlagValue(key, row.val);
      }

      if (snapshot.DISABLE_NEW === ('1' as string)) {
        const disabledSnapshot: LiveFlagSnapshot = { ...DEFAULT_LIVE_FLAGS };
        disabledSnapshot.DISABLE_NEW = '1' as string;
        this.cache = disabledSnapshot;
      } else {
        this.cache = snapshot;
      }
    } catch (error) {
      if (error instanceof Error) {
        this.options.onError?.(error);
      }
    }
  }
}
