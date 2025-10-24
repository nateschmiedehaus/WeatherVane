/**
 * State Machine - The source of truth for all orchestration state
 *
 * Uses SQLite for:
 * - Task dependency graph (DAG)
 * - Event log (append-only, immutable)
 * - Quality metrics time-series
 * - Context (structured decisions and learnings)
 * - Checkpoints (versioned snapshots)
 */

import Database from 'better-sqlite3';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

import { seedLiveFlagDefaults } from '../state/live_flags.js';
import { createDryRunError } from '../utils/dry_run.js';
import { logWarning, logDebug } from '../telemetry/logger.js';

// ============================================================================
// Types
// ============================================================================

export type TaskStatus = 'pending' | 'in_progress' | 'needs_review' | 'needs_improvement' | 'done' | 'blocked';
export type TaskType = 'epic' | 'story' | 'task' | 'bug';
export type EventType =
  | 'task_created'
  | 'task_transition'
  | 'task_assigned'
  | 'task_completed'
  | 'task_updated'
  | 'quality_check'
  | 'roadmap_extended'
  | 'agent_decision';
export type ContextEntryType = 'decision' | 'constraint' | 'hypothesis' | 'learning';

export interface Task {
  id: string;
  title: string;
  description?: string;
  type: TaskType;
  status: TaskStatus;
  assigned_to?: string;
  epic_id?: string;
  parent_id?: string;
  created_at: number;
  started_at?: number;
  completed_at?: number;
  estimated_complexity?: number;  // 1-10
  actual_duration_seconds?: number;
  metadata?: Record<string, unknown>;
}

export interface TaskDependency {
  task_id: string;
  depends_on_task_id: string;
  dependency_type: 'blocks' | 'related' | 'suggested';
}

export interface Event {
  id?: number;
  timestamp: number;
  event_type: EventType;
  task_id?: string;
  agent?: string;
  data: Record<string, unknown>;
  correlation_id?: string;
}

export interface QualityMetric {
  id?: number;
  timestamp: number;
  task_id?: string;
  dimension: string;
  score: number;  // 0.0-1.0
  details?: Record<string, unknown>;
}

export interface CriticHistoryRecord {
  id?: number;
  critic: string;
  category: string;
  passed: boolean;
  stderr_sample?: string;
  created_at: number;
  metadata?: Record<string, unknown>;
}

export interface ResearchCacheRecord {
  id?: number;
  cache_key: string;
  payload: unknown;
  stored_at: number;
  expires_at: number;
  metadata?: Record<string, unknown>;
}

export interface Checkpoint {
  id?: number;
  timestamp: number;
  session_id: string;
  git_sha?: string;
  state_snapshot: Record<string, unknown>;
  notes?: string;
}

export interface ContextEntry {
  id?: number;
  timestamp: number;
  entry_type: ContextEntryType;
  topic: string;
  content: string;
  related_tasks?: string[];
  confidence?: number;  // 0.0-1.0
  metadata?: Record<string, unknown>;
}

export interface CodeIndexEntry {
  file_path: string;
  content: string;
  language: string;
}

export interface CodeSearchResult {
  filePath: string;
  language: string;
  snippet?: string;
  score: number;
}

export interface CodeIndexMetadata {
  updatedAt?: number;
  entryCount: number;
}

export interface RoadmapHealth {
  totalTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  blockedTasks: number;
  completionRate: number;
  averageQualityScore: number;
  currentPhase: string;
}

function mergeMetadata(
  existing: Record<string, unknown> | undefined,
  patch: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!patch || Object.keys(patch).length === 0) {
    return existing ? { ...existing } : undefined;
  }

  const base: Record<string, unknown> = existing ? { ...existing } : {};
  let changed = false;

  for (const [key, value] of Object.entries(patch)) {
    if (value === null || typeof value === 'undefined') {
      if (key in base) {
        delete base[key];
        changed = true;
      }
      continue;
    }

    if (!Object.is(base[key], value)) {
      base[key] = value;
      changed = true;
    }
  }

  if (!changed) {
    return existing ? { ...existing } : undefined;
  }

  return Object.keys(base).length > 0 ? base : undefined;
}

// ============================================================================
// State Machine Implementation
// ============================================================================

interface StateMachineOptions {
  readonly?: boolean;
}

export class StateMachine extends EventEmitter {
  private db: Database.Database;
  private readonly dbPath: string;
  private readonly workspaceRoot: string;
  private readonly readOnly: boolean;

  // Cache for expensive getRoadmapHealth() queries
  private cachedHealth: RoadmapHealth | null = null;
  private healthCacheValid = false;

  // WAL checkpointing management
  private writeCount = 0;
  private checkpointTimer: NodeJS.Timeout | null = null;
  private readonly CHECKPOINT_WRITE_INTERVAL = 1000; // Checkpoint every 1000 writes
  private readonly CHECKPOINT_TIME_INTERVAL = 5 * 60 * 1000; // Checkpoint every 5 minutes

  constructor(workspaceRoot: string, options: StateMachineOptions = {}) {
    super();
    this.workspaceRoot = workspaceRoot;

    const stateDir = path.join(workspaceRoot, 'state');
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }

    this.dbPath = path.join(stateDir, 'orchestrator.db');
    this.readOnly = options.readonly ?? false;

    if (this.readOnly) {
      try {
        const uri = `file:${this.dbPath}?mode=ro&cache=shared`;
        this.db = new Database(uri, {
          uri: true,
          readonly: true,
          fileMustExist: true,
        } as Database.Options & { uri: boolean });
        this.db.pragma('query_only = 1');
      } catch (error) {
        logWarning('Falling back to in-memory orchestrator DB for dry-run worker', {
          path: this.dbPath,
          error: error instanceof Error ? error.message : String(error),
        });
        const memoryDb = new Database(':memory:');
        memoryDb.pragma('query_only = 0');
        this.initializeSchemaInternal(memoryDb);
        memoryDb.pragma('query_only = 1');
        this.db = memoryDb;
      }
    } else {
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');  // Better concurrency
      this.db.pragma('foreign_keys = ON');   // Enforce referential integrity
      this.initializeSchema();

      // Start periodic WAL checkpoint timer
      this.checkpointTimer = setInterval(() => {
        this.checkpointWAL('periodic');
      }, this.CHECKPOINT_TIME_INTERVAL);
      // Prevent timer from keeping process alive
      this.checkpointTimer.unref();
    }

    // Set max listeners to prevent warnings (orchestrator creates many listeners)
    this.setMaxListeners(100);
  }

  /**
   * Invalidate cached roadmap health on any task state change
   */
  private invalidateHealthCache(): void {
    this.healthCacheValid = false;
  }

  // ==========================================================================
  // Schema Initialization
  // ==========================================================================

  private initializeSchema(): void {
    if (this.readOnly) {
      return;
    }
    this.initializeSchemaInternal(this.db);
  }

  private initializeSchemaInternal(target: Database.Database): void {
    target.exec(`
      -- Task dependency graph
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        assigned_to TEXT,
        epic_id TEXT,
        parent_id TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        estimated_complexity INTEGER,
        actual_duration_seconds INTEGER,
        metadata JSON,
        FOREIGN KEY (parent_id) REFERENCES tasks(id),
        FOREIGN KEY (epic_id) REFERENCES tasks(id)
      );

      -- Task dependencies (DAG edges)
      CREATE TABLE IF NOT EXISTS task_dependencies (
        task_id TEXT NOT NULL,
        depends_on_task_id TEXT NOT NULL,
        dependency_type TEXT DEFAULT 'blocks',
        PRIMARY KEY (task_id, depends_on_task_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id),
        FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id)
      );

      -- Event log (append-only, immutable)
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        task_id TEXT,
        agent TEXT,
        data JSON NOT NULL,
        correlation_id TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );

      -- Quality metrics over time
      CREATE TABLE IF NOT EXISTS quality_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        task_id TEXT,
        dimension TEXT NOT NULL,
        score REAL NOT NULL,
        details JSON,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );

      CREATE TABLE IF NOT EXISTS critic_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        critic TEXT NOT NULL,
        category TEXT NOT NULL,
        passed INTEGER NOT NULL,
        stderr_sample TEXT,
        created_at INTEGER NOT NULL,
        metadata JSON
      );

      CREATE TABLE IF NOT EXISTS research_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_key TEXT NOT NULL UNIQUE,
        payload JSON NOT NULL,
        stored_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        metadata JSON
      );

      -- Checkpoints (versioned snapshots)
      CREATE TABLE IF NOT EXISTS checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        git_sha TEXT,
        state_snapshot JSON NOT NULL,
        notes TEXT
      );

      -- Context (structured decisions and learnings)
      CREATE TABLE IF NOT EXISTS context_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        entry_type TEXT NOT NULL,
        topic TEXT NOT NULL,
        content TEXT NOT NULL,
        related_tasks TEXT,
        confidence REAL,
        metadata JSON
      );

      -- Runtime settings and feature flags
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        val TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
        metadata JSON
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
      CREATE INDEX IF NOT EXISTS idx_tasks_epic ON tasks(epic_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);

      -- Composite indexes for dependency queries
      CREATE INDEX IF NOT EXISTS idx_deps_task_type ON task_dependencies(task_id, dependency_type);
      CREATE INDEX IF NOT EXISTS idx_deps_depends_type ON task_dependencies(depends_on_task_id, dependency_type);

      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_task ON events(task_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_task_type ON events(task_id, event_type);

      CREATE INDEX IF NOT EXISTS idx_quality_task ON quality_metrics(task_id);
      CREATE INDEX IF NOT EXISTS idx_quality_timestamp ON quality_metrics(timestamp);
      CREATE INDEX IF NOT EXISTS idx_quality_dimension ON quality_metrics(dimension);
      CREATE INDEX IF NOT EXISTS idx_quality_task_dim ON quality_metrics(task_id, dimension);

      CREATE INDEX IF NOT EXISTS idx_critic_history_critic ON critic_history(critic, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_research_cache_expires ON research_cache(expires_at);

      CREATE INDEX IF NOT EXISTS idx_context_type ON context_entries(entry_type);
      CREATE INDEX IF NOT EXISTS idx_context_topic ON context_entries(topic);
      CREATE INDEX IF NOT EXISTS idx_context_timestamp ON context_entries(timestamp);
      CREATE INDEX IF NOT EXISTS idx_settings_updated_at ON settings(updated_at);
    `);

    this.ensureCodeIndexSchema(target);
    seedLiveFlagDefaults(target);
  }

  private ensureCodeIndexSchema(target: Database.Database): void {
    target.exec(`
      CREATE TABLE IF NOT EXISTS code_index_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const existingDefinition = target
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'code_fts'`)
      .get() as { sql?: string } | undefined;

    const normalizedSql =
      typeof existingDefinition?.sql === 'string'
        ? existingDefinition.sql.toLowerCase().replace(/\s+/g, ' ')
        : '';

    const requiredFragments = [
      'file_path unindexed',
      'language unindexed',
      "tokenize = 'unicode61 remove_diacritics 2'",
      "prefix = '2 3 4 6 8 10'",
    ];

    const needsRebuild =
      normalizedSql.length === 0 || requiredFragments.some((fragment) => !normalizedSql.includes(fragment));

    if (needsRebuild) {
      target.exec(`
        DROP TABLE IF EXISTS code_fts;
        CREATE VIRTUAL TABLE code_fts USING fts5(
          file_path UNINDEXED,
          content,
          language UNINDEXED,
          tokenize = 'unicode61 remove_diacritics 2',
          prefix = '2 3 4 6 8 10'
        );
        DELETE FROM code_index_metadata WHERE key IN ('updated_at', 'entry_count');
      `);
    }
  }

  private assertWritable(operation: string): void {
    if (this.readOnly) {
      throw createDryRunError(`state_machine:${operation}`);
    }
  }

  // ==========================================================================
  // Task Operations
  // ==========================================================================

  createTask(task: Omit<Task, 'created_at'>, correlationId?: string): Task {
    this.assertWritable('create_task');
    const now = Date.now();
    const fullTask: Task = {
      ...task,
      created_at: now
    };

    this.db.prepare(`
      INSERT INTO tasks (id, title, description, type, status, assigned_to, epic_id, parent_id, created_at, estimated_complexity, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fullTask.id,
      fullTask.title,
      fullTask.description || null,
      fullTask.type,
      fullTask.status,
      fullTask.assigned_to || null,
      fullTask.epic_id || null,
      fullTask.parent_id || null,
      fullTask.created_at,
      fullTask.estimated_complexity || null,
      fullTask.metadata ? JSON.stringify(fullTask.metadata) : null
    );

    this.trackWrite();

    this.logEvent({
      timestamp: now,
      event_type: 'task_created',
      task_id: fullTask.id,
      data: { task: fullTask },
      correlation_id: correlationId
    });

    this.invalidateHealthCache();
    this.emit('task:created', fullTask);
    return fullTask;
  }

  getTask(taskId: string): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
    if (!row) return null;
    return this.rowToTask(row);
  }

  updateTaskDetails(
    taskId: string,
    updates: { title?: string; description?: string },
    correlationId?: string
  ): Task {
    this.assertWritable('update_task_details');
    const allowed: Array<keyof typeof updates> = ['title', 'description'];
    const setFragments: string[] = [];
    const values: any[] = [];

    for (const key of allowed) {
      const value = updates[key];
      if (typeof value === 'undefined') continue;
      setFragments.push(`${key} = ?`);
      values.push(value);
    }

    if (setFragments.length === 0) {
      const existing = this.getTask(taskId);
      if (!existing) {
        throw new Error(`Task ${taskId} not found`);
      }
      return existing;
    }

    values.push(taskId);
    const statement = `UPDATE tasks SET ${setFragments.join(', ')} WHERE id = ?`;
    this.db.prepare(statement).run(...values);

    this.trackWrite();

    const updatedTask = this.getTask(taskId);
    if (!updatedTask) {
      throw new Error(`Task ${taskId} not found after update`);
    }

    this.logEvent({
      timestamp: Date.now(),
      event_type: 'task_updated',
      task_id: taskId,
      data: { updates },
      correlation_id: correlationId
    });

    return updatedTask;
  }

  getTasks(filter?: { status?: TaskStatus[]; type?: TaskType[]; assignedTo?: string; epicId?: string }): Task[] {
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: any[] = [];

    if (filter?.status) {
      query += ` AND status IN (${filter.status.map(() => '?').join(',')})`;
      params.push(...filter.status);
    }

    if (filter?.type) {
      query += ` AND type IN (${filter.type.map(() => '?').join(',')})`;
      params.push(...filter.type);
    }

    if (filter?.assignedTo) {
      query += ' AND assigned_to = ?';
      params.push(filter.assignedTo);
    }

    if (filter?.epicId) {
      query += ' AND epic_id = ?';
      params.push(filter.epicId);
    }

    query += ' ORDER BY created_at ASC';

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.rowToTask(row));
  }

  async transition(taskId: string, newStatus: TaskStatus, metadata?: Record<string, unknown>, correlationId?: string, agentId?: string): Promise<Task> {
    this.assertWritable('transition');
    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const now = Date.now();
    const updates: Record<string, unknown> = { status: newStatus };
    const previousStatus = task.status;

    if (newStatus === 'in_progress' && !task.started_at) {
      updates.started_at = now;
    }

    if (newStatus === 'pending') {
      updates.started_at = null;
      updates.completed_at = null;
      updates.actual_duration_seconds = null;
    } else if (newStatus !== 'in_progress') {
      updates.actual_duration_seconds = null;
      if (newStatus !== 'done') {
        updates.completed_at = null;
      }
    }

    if (newStatus !== 'in_progress') {
      updates.assigned_to = null;
    }

    if (newStatus === 'done' && !task.completed_at) {
      updates.completed_at = now;
      if (task.started_at) {
        updates.actual_duration_seconds = Math.floor((now - task.started_at) / 1000);
      }
    }

    let mergedMetadata = task.metadata as Record<string, unknown> | undefined;
    if (metadata) {
      mergedMetadata = mergeMetadata(task.metadata as Record<string, unknown> | undefined, metadata);
      updates.metadata = mergedMetadata ? JSON.stringify(mergedMetadata) : null;
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    this.db.prepare(`UPDATE tasks SET ${setClauses} WHERE id = ?`).run(...values, taskId);

    this.trackWrite();

    this.logEvent({
      timestamp: now,
      event_type: 'task_transition',
      task_id: taskId,
      agent: agentId,
      data: { from: task.status, to: newStatus, metadata, agent: agentId, agentId },
      correlation_id: correlationId
    });

    const updatedTask = this.getTask(taskId)!;
    if (metadata) {
      updatedTask.metadata = mergedMetadata;
    }
    this.invalidateHealthCache();
    this.emit('task:transition', updatedTask, task.status, newStatus);

    if (newStatus === 'done') {
      this.emit('task:completed', updatedTask);
    }

    await this.reconcileDependentStatuses(updatedTask, previousStatus, newStatus, correlationId);

    return updatedTask;
  }

  assignTask(taskId: string, agent: string, correlationId?: string): Task {
    this.assertWritable('assign_task');
    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    this.db.prepare('UPDATE tasks SET assigned_to = ? WHERE id = ?').run(agent, taskId);

    this.trackWrite();

    this.logEvent({
      timestamp: Date.now(),
      event_type: 'task_assigned',
      task_id: taskId,
      agent,
      data: { agent, agentId: agent },
      correlation_id: correlationId
    });

    const updatedTask = this.getTask(taskId)!;
    this.emit('task:assigned', updatedTask, agent);
    return updatedTask;
  }

  // ==========================================================================
  // Task Dependencies (DAG)
  // ==========================================================================

  addDependency(taskId: string, dependsOnTaskId: string, type: 'blocks' | 'related' | 'suggested' = 'blocks'): void {
    this.assertWritable('add_dependency');
    // Check for circular dependencies
    if (this.wouldCreateCycle(taskId, dependsOnTaskId)) {
      throw new Error(`Adding dependency would create a cycle: ${taskId} -> ${dependsOnTaskId}`);
    }

    this.db.prepare(`
      INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id, dependency_type)
      VALUES (?, ?, ?)
    `).run(taskId, dependsOnTaskId, type);

    this.trackWrite();
  }

  getDependencies(taskId: string): TaskDependency[] {
    const rows = this.db.prepare('SELECT * FROM task_dependencies WHERE task_id = ?').all(taskId) as any[];
    return rows.map(row => ({
      task_id: row.task_id,
      depends_on_task_id: row.depends_on_task_id,
      dependency_type: row.dependency_type
    }));
  }

  getDependents(taskId: string): TaskDependency[] {
    const rows = this.db.prepare('SELECT * FROM task_dependencies WHERE depends_on_task_id = ?').all(taskId) as any[];
    return rows.map(row => ({
      task_id: row.task_id,
      depends_on_task_id: row.depends_on_task_id,
      dependency_type: row.dependency_type
    }));
  }

  isTaskReady(taskId: string): boolean {
    const deps = this.getDependencies(taskId);
    const blockingDeps = deps.filter(d => d.dependency_type === 'blocks');

    for (const dep of blockingDeps) {
      const depTask = this.getTask(dep.depends_on_task_id);
      if (!depTask || depTask.status !== 'done') {
        return false;
      }
    }

    return true;
  }

  getReadyTasks(): Task[] {
    const pending = this.getTasks({ status: ['pending'] });
    return pending.filter(task =>
      task.type !== 'epic' && this.isTaskReady(task.id)
    );
  }

  /**
   * Optimized method for scheduler - combines 3 queries into 1
   * Returns all tasks needed for scheduling in a single pass
   */
  getTasksForScheduling(): { review: Task[]; fixup: Task[]; ready: Task[] } {
    // Single query to get all relevant tasks
    const allTasks = this.getTasks({
      status: ['needs_review', 'needs_improvement', 'pending']
    });

    const review: Task[] = [];
    const fixup: Task[] = [];
    const ready: Task[] = [];

    for (const task of allTasks) {
      // Skip epics - they are containers, not executable tasks
      if (task.type === 'epic') {
        continue;
      }

      if (task.status === 'needs_review') {
        review.push(task);
      } else if (task.status === 'needs_improvement') {
        fixup.push(task);
      } else if (task.status === 'pending' && this.isTaskReady(task.id)) {
        ready.push(task);
      }
    }

    return { review, fixup, ready };
  }

  private wouldCreateCycle(fromTask: string, toTask: string): boolean {
    // BFS to detect cycle
    const visited = new Set<string>();
    const queue = [toTask];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === fromTask) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const deps = this.getDependencies(current);
      queue.push(...deps.map(d => d.depends_on_task_id));
    }

    return false;
  }

  private async reconcileDependentStatuses(task: Task, previousStatus: TaskStatus, newStatus: TaskStatus, correlationId?: string): Promise<void> {
    if (newStatus === previousStatus) {
      return;
    }

    const dependents = this.getDependents(task.id).filter(dep => dep.dependency_type === 'blocks');
    if (dependents.length === 0) {
      return;
    }

    const correlationBase = correlationId ? `${correlationId}:dependents` : `deps:${task.id}:${randomUUID()}`;
    const nowIso = new Date().toISOString();

    const checkOutstanding = (dependentTaskId: string): number => {
      const blockingDeps = this.getDependencies(dependentTaskId).filter(dep => dep.dependency_type === 'blocks');
      const outstandingDeps = blockingDeps.filter(dep => {
        const depTask = this.getTask(dep.depends_on_task_id);
        return !depTask || depTask.status !== 'done';
      });
      return outstandingDeps.length;
    };

    // Handle regression: if a dependency re-opens (done -> anything else), push dependents back to blocked.
    if (previousStatus === 'done' && newStatus !== 'done') {
      for (const dependent of dependents) {
        const dependentTask = this.getTask(dependent.task_id);
        if (!dependentTask) continue;
        if (dependentTask.status === 'done' || dependentTask.status === 'blocked') continue;

        const outstanding = checkOutstanding(dependentTask.id);
        if (outstanding > 0) {
          await this.transition(
            dependentTask.id,
            'blocked',
            {
              auto_reblocked: true,
              auto_reblocked_by: task.id,
              auto_reblocked_at: nowIso,
            },
            `${correlationBase}:${dependentTask.id}:reblocked`
          );
        }
      }
      return;
    }

    // Handle completion: unblock dependents only when all blockers are done.
    if (newStatus !== 'done') {
      return;
    }

    for (const dependent of dependents) {
      const dependentTask = this.getTask(dependent.task_id);
      if (!dependentTask) continue;

      const metadata = dependentTask.metadata as Record<string, unknown> | undefined;
      const blockedByMeta = metadata?.['blocked_by_meta_work'] === true;
      const blockingPhasesValue = metadata?.['blocking_phases'];
      const blockedByPhase = Array.isArray(blockingPhasesValue) && blockingPhasesValue.length > 0;

      if (blockedByMeta || blockedByPhase) {
        continue;
      }

      const outstanding = checkOutstanding(dependentTask.id);

      if (outstanding === 0 && dependentTask.status === 'blocked') {
        await this.transition(
          dependentTask.id,
          'pending',
          {
            auto_unblocked: true,
            auto_unblocked_by: task.id,
            auto_unblocked_at: nowIso,
          },
          `${correlationBase}:${dependentTask.id}:unblocked`
        );
      }
    }
  }

  // ==========================================================================
  // Event Logging
  // ==========================================================================

  logEvent(event: Omit<Event, 'id'>): void {
    this.assertWritable('log_event');
    this.db.prepare(`
      INSERT INTO events (timestamp, event_type, task_id, agent, data, correlation_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      event.timestamp,
      event.event_type,
      event.task_id || null,
      event.agent || null,
      JSON.stringify(event.data),
      event.correlation_id || null
    );

    this.emit('event:logged', event);
  }

  getEvents(filter?: { since?: number; taskId?: string; eventType?: EventType }): Event[] {
    let query = 'SELECT * FROM events WHERE 1=1';
    const params: any[] = [];

    if (filter?.since) {
      query += ' AND timestamp >= ?';
      params.push(filter.since);
    }

    if (filter?.taskId) {
      query += ' AND task_id = ?';
      params.push(filter.taskId);
    }

    if (filter?.eventType) {
      query += ' AND event_type = ?';
      params.push(filter.eventType);
    }

    query += ' ORDER BY timestamp ASC';

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      event_type: row.event_type,
      task_id: row.task_id,
      agent: row.agent,
      data: JSON.parse(row.data),
      correlation_id: row.correlation_id
    }));
  }

  // ==========================================================================
  // Quality Metrics
  // ==========================================================================

  recordQuality(metric: Omit<QualityMetric, 'id'>): void {
    this.assertWritable('record_quality');
    this.db.prepare(`
      INSERT INTO quality_metrics (timestamp, task_id, dimension, score, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      metric.timestamp,
      metric.task_id || null,
      metric.dimension,
      metric.score,
      metric.details ? JSON.stringify(metric.details) : null
    );

    this.invalidateHealthCache(); // Quality affects averageQualityScore
    this.emit('quality:recorded', metric);
  }

  getQualityMetrics(filter?: { taskId?: string; dimension?: string; since?: number }): QualityMetric[] {
    let query = 'SELECT * FROM quality_metrics WHERE 1=1';
    const params: any[] = [];

    if (filter?.taskId) {
      query += ' AND task_id = ?';
      params.push(filter.taskId);
    }

    if (filter?.dimension) {
      query += ' AND dimension = ?';
      params.push(filter.dimension);
    }

    if (filter?.since) {
      query += ' AND timestamp >= ?';
      params.push(filter.since);
    }

    query += ' ORDER BY timestamp DESC';

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      task_id: row.task_id,
      dimension: row.dimension,
      score: row.score,
      details: row.details ? JSON.parse(row.details) : undefined
    }));
  }

  getAverageQualityScore(dimension?: string): number {
    let query = 'SELECT AVG(score) as avg FROM quality_metrics WHERE 1=1';
    const params: any[] = [];

    if (dimension) {
      query += ' AND dimension = ?';
      params.push(dimension);
    }

    const row = this.db.prepare(query).get(...params) as any;
    return row.avg || 0;
  }

  // ==========================================================================
  // Critic History
  // ==========================================================================

  recordCriticHistory(entry: Omit<CriticHistoryRecord, 'id'>): CriticHistoryRecord {
    this.assertWritable('record_critic_history');
    const createdAt = entry.created_at ?? Date.now();
    const metadata = entry.metadata ? JSON.stringify(entry.metadata) : null;
    const result = this.db.prepare(
      `INSERT INTO critic_history (critic, category, passed, stderr_sample, created_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(entry.critic, entry.category, entry.passed ? 1 : 0, entry.stderr_sample ?? null, createdAt, metadata);

    return {
      ...entry,
      id: result.lastInsertRowid as number,
      created_at: createdAt,
    };
  }

  getCriticHistory(critic: string, options: { limit?: number } = {}): CriticHistoryRecord[] {
    const limit = Math.max(1, options.limit ?? 20);
    const rows = this.db
      .prepare(
        `SELECT id, critic, category, passed, stderr_sample, created_at, metadata
         FROM critic_history
         WHERE critic = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(critic, limit) as Array<{
        id: number;
        critic: string;
        category: string;
        passed: number;
        stderr_sample?: string;
        created_at: number;
        metadata?: string | null;
      }>;

    return rows.map((row) => ({
      id: row.id,
      critic: row.critic,
      category: row.category,
      passed: row.passed === 1,
      stderr_sample: row.stderr_sample ?? undefined,
      created_at: row.created_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  recordResearchCache(entry: {
    cacheKey: string;
    payload: unknown;
    ttlMs?: number;
    metadata?: Record<string, unknown>;
    stored_at?: number;
  }): ResearchCacheRecord {
    this.assertWritable('record_research_cache');
    const storedAt = entry.stored_at ?? Date.now();
    const ttl = Math.max(1, entry.ttlMs ?? 90 * 24 * 60 * 60 * 1000);
    const expiresAt = storedAt + ttl;
    const metadata = entry.metadata ? JSON.stringify(entry.metadata) : null;

    this.db.prepare(
      `INSERT INTO research_cache (cache_key, payload, stored_at, expires_at, metadata)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         payload = excluded.payload,
         stored_at = excluded.stored_at,
         expires_at = excluded.expires_at,
         metadata = excluded.metadata`
    ).run(entry.cacheKey, JSON.stringify(entry.payload), storedAt, expiresAt, metadata);

    return {
      cache_key: entry.cacheKey,
      payload: entry.payload,
      stored_at: storedAt,
      expires_at: expiresAt,
      metadata: entry.metadata,
    };
  }

  getResearchCache(cacheKey: string): ResearchCacheRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, cache_key, payload, stored_at, expires_at, metadata
         FROM research_cache
         WHERE cache_key = ?`
      )
      .get(cacheKey) as
      | {
          id: number;
          cache_key: string;
          payload: string;
          stored_at: number;
          expires_at: number;
          metadata?: string | null;
        }
      | undefined;

    if (!row) {
      return null;
    }

    let payload: unknown;
    try {
      payload = row.payload ? JSON.parse(row.payload) : null;
    } catch {
      payload = null;
    }

    return {
      id: row.id,
      cache_key: row.cache_key,
      payload,
      stored_at: row.stored_at,
      expires_at: row.expires_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  pruneResearchCache(now: number = Date.now()): number {
    this.assertWritable('prune_research_cache');
    const result = this.db.prepare(`DELETE FROM research_cache WHERE expires_at <= ?`).run(now);
    return typeof result.changes === 'number' ? result.changes : 0;
  }

  getRecentResearchCache(options: { limit?: number; kind?: string } = {}): ResearchCacheRecord[] {
    const limit = Math.max(1, options.limit ?? 20);
    const rows = this.db.prepare(
      `SELECT id, cache_key, payload, stored_at, expires_at, metadata
       FROM research_cache
       ORDER BY stored_at DESC
       LIMIT ?`
    ).all(limit) as Array<{
      id: number;
      cache_key: string;
      payload: string;
      stored_at: number;
      expires_at: number;
      metadata?: string | null;
    }>;

    const normalized = rows.map((row) => ({
      id: row.id,
      cache_key: row.cache_key,
      payload: row.payload ? JSON.parse(row.payload) : null,
      stored_at: row.stored_at,
      expires_at: row.expires_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));

    if (!options.kind) {
      return normalized;
    }

    return normalized.filter((record) =>
      typeof record.metadata?.kind === 'string' && record.metadata.kind === options.kind
    );
  }

  // ==========================================================================
  // Context Management
  // ==========================================================================

  addContextEntry(entry: Omit<ContextEntry, 'id' | 'timestamp'>): ContextEntry {
    const now = Date.now();
    const result = this.db.prepare(`
      INSERT INTO context_entries (timestamp, entry_type, topic, content, related_tasks, confidence, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      now,
      entry.entry_type,
      entry.topic,
      entry.content,
      entry.related_tasks ? JSON.stringify(entry.related_tasks) : null,
      entry.confidence || null,
      entry.metadata ? JSON.stringify(entry.metadata) : null
    );

    return {
      id: result.lastInsertRowid as number,
      timestamp: now,
      ...entry
    };
  }

  getContextEntries(filter?: { type?: ContextEntryType; topic?: string; since?: number }): ContextEntry[] {
    let query = 'SELECT * FROM context_entries WHERE 1=1';
    const params: any[] = [];

    if (filter?.type) {
      query += ' AND entry_type = ?';
      params.push(filter.type);
    }

    if (filter?.topic) {
      query += ' AND topic LIKE ?';
      params.push(`%${filter.topic}%`);
    }

    if (filter?.since) {
      query += ' AND timestamp >= ?';
      params.push(filter.since);
    }

    query += ' ORDER BY timestamp DESC';

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      entry_type: row.entry_type,
      topic: row.topic,
      content: row.content,
      related_tasks: row.related_tasks ? JSON.parse(row.related_tasks) : undefined,
      confidence: row.confidence,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
  }

  // ==========================================================================
  // Checkpoints
  // ==========================================================================

  createCheckpoint(checkpoint: Omit<Checkpoint, 'id' | 'timestamp'>): Checkpoint {
    this.assertWritable('create_checkpoint');
    const now = Date.now();
    const result = this.db.prepare(`
      INSERT INTO checkpoints (timestamp, session_id, git_sha, state_snapshot, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      now,
      checkpoint.session_id,
      checkpoint.git_sha || null,
      JSON.stringify(checkpoint.state_snapshot),
      checkpoint.notes || null
    );

    return {
      id: result.lastInsertRowid as number,
      timestamp: now,
      ...checkpoint
    };
  }

  getLatestCheckpoint(): Checkpoint | null {
    const row = this.db.prepare('SELECT * FROM checkpoints ORDER BY timestamp DESC LIMIT 1').get() as any;
    if (!row) return null;

    return {
      id: row.id,
      timestamp: row.timestamp,
      session_id: row.session_id,
      git_sha: row.git_sha,
      state_snapshot: JSON.parse(row.state_snapshot),
      notes: row.notes
    };
  }

  // ==========================================================================
  // Roadmap Health
  // ==========================================================================

  getRoadmapHealth(): RoadmapHealth {
    // Return cached result if valid
    if (this.healthCacheValid && this.cachedHealth) {
      return { ...this.cachedHealth }; // Return copy to prevent mutations
    }

    // Expensive query - run once and cache
    const all = this.getTasks();
    const total = all.length;
    const pending = all.filter(t => t.status === 'pending').length;
    const inProgress = all.filter(t => t.status === 'in_progress').length;
    const completed = all.filter(t => t.status === 'done').length;
    const blocked = all.filter(t => t.status === 'blocked').length;

    const completionRate = total > 0 ? completed / total : 0;
    const avgQuality = this.getAverageQualityScore();

    // Determine phase based on completion
    let currentPhase = 'foundation';
    if (completionRate > 0.7) currentPhase = 'shipping';
    else if (completionRate > 0.3) currentPhase = 'development';

    this.cachedHealth = {
      totalTasks: total,
      pendingTasks: pending,
      inProgressTasks: inProgress,
      completedTasks: completed,
      blockedTasks: blocked,
      completionRate,
      averageQualityScore: avgQuality,
      currentPhase
    };

    this.healthCacheValid = true;
    return { ...this.cachedHealth };
  }

  replaceCodeIndex(entries: CodeIndexEntry[], updatedAt: number): void {
    this.assertWritable('replace_code_index');
    const insert = this.db.prepare(
      'INSERT INTO code_fts(file_path, content, language) VALUES (?, ?, ?)'
    );
    const upsertMeta = this.db.prepare(
      'REPLACE INTO code_index_metadata(key, value) VALUES (?, ?)'
    );
    const optimize = this.db.prepare("INSERT INTO code_fts(code_fts) VALUES ('optimize')");

    const transaction = this.db.transaction((rows: CodeIndexEntry[]) => {
      this.db.prepare('DELETE FROM code_fts').run();
      for (const row of rows) {
        insert.run(row.file_path, row.content, row.language);
      }
      if (rows.length > 0) {
        optimize.run();
      }
      upsertMeta.run('updated_at', String(updatedAt));
      upsertMeta.run('entry_count', String(rows.length));
    });

    transaction(entries);
  }

  getCodeIndexMetadata(): CodeIndexMetadata {
    const rows = this.db
      .prepare('SELECT key, value FROM code_index_metadata WHERE key IN (\'updated_at\', \'entry_count\')')
      .all() as Array<{ key: string; value: string }>;

    const metadata: CodeIndexMetadata = { entryCount: 0 };
    for (const row of rows) {
      if (row.key === 'updated_at') {
        const parsed = Number.parseInt(row.value, 10);
        if (!Number.isNaN(parsed)) {
          metadata.updatedAt = parsed;
        }
      } else if (row.key === 'entry_count') {
        const parsed = Number.parseInt(row.value, 10);
        if (!Number.isNaN(parsed)) {
          metadata.entryCount = parsed;
        }
      }
    }

    if (typeof metadata.entryCount !== 'number') {
      metadata.entryCount = 0;
    }

    return metadata;
  }

  searchCodeIndex(
    matchQuery: string,
    options: { limit?: number; languages?: string[] } = {}
  ): CodeSearchResult[] {
    const trimmed = matchQuery.trim();
    if (!trimmed) {
      return [];
    }

    const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
    const params: any[] = [trimmed];
    const languageFilters = options.languages?.map(lang => lang.toLowerCase()) ?? [];

    let sql = `
      SELECT
        file_path,
        language,
        snippet(code_fts, 1, '', '', ' … ', 12) AS snippet,
        bm25(code_fts) AS score
      FROM code_fts
      WHERE code_fts MATCH ?
    `;

    if (languageFilters.length > 0) {
      sql += ` AND language IN (${languageFilters.map(() => '?').join(',')})`;
      params.push(...languageFilters);
    }

    sql += ' ORDER BY score ASC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as Array<{
      file_path: string;
      language: string;
      snippet?: string;
      score?: number;
    }>;

    return rows.map(row => ({
      filePath: row.file_path,
      language: row.language,
      snippet: row.snippet,
      score: typeof row.score === 'number' ? row.score : 0,
    }));
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  private rowToTask(row: any): Task {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      type: row.type,
      status: row.status,
      assigned_to: row.assigned_to,
      epic_id: row.epic_id,
      parent_id: row.parent_id,
      created_at: row.created_at,
      started_at: row.started_at,
      completed_at: row.completed_at,
      estimated_complexity: row.estimated_complexity,
      actual_duration_seconds: row.actual_duration_seconds,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Get database instance for direct SQL queries
   * Use with caution - prefer using the typed methods above
   */
  getDatabase(): Database.Database {
    return this.db;
  }

  /**
   * Checkpoint WAL file to reclaim space and improve performance
   *
   * Modes:
   * - PASSIVE: Checkpoint some frames if not busy
   * - FULL: Checkpoint all frames, wait for readers
   * - RESTART: Checkpoint all frames, reset WAL
   * - TRUNCATE: Checkpoint all frames, shrink WAL file to 0 bytes
   */
  private checkpointWAL(trigger: 'periodic' | 'write_threshold' | 'shutdown'): void {
    if (this.readOnly) {
      return;
    }

    try {
      // Use TRUNCATE mode to actually shrink the WAL file
      // This is the most aggressive but safest during low activity periods
      const mode = trigger === 'shutdown' ? 'TRUNCATE' : 'RESTART';
      this.db.pragma(`wal_checkpoint(${mode})`);

      if (trigger === 'write_threshold' || trigger === 'periodic') {
        logDebug('WAL checkpoint completed', { trigger, writeCount: this.writeCount });
      }

      // Reset write counter after checkpoint
      this.writeCount = 0;
    } catch (error) {
      logWarning('WAL checkpoint failed', {
        trigger,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Track database writes and trigger checkpoint if threshold exceeded
   */
  private trackWrite(): void {
    if (this.readOnly) {
      return;
    }

    this.writeCount++;

    if (this.writeCount >= this.CHECKPOINT_WRITE_INTERVAL) {
      this.checkpointWAL('write_threshold');
    }
  }

  close(): void {
    // Stop checkpoint timer
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
      this.checkpointTimer = null;
    }

    // Final WAL checkpoint before closing
    this.checkpointWAL('shutdown');

    this.db.close();
  }
}
