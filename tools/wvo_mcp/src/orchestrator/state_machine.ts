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
import path from 'node:path';
import fs from 'node:fs';

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

// ============================================================================
// State Machine Implementation
// ============================================================================

export class StateMachine extends EventEmitter {
  private db: Database.Database;
  private readonly dbPath: string;
  private readonly workspaceRoot: string;

  // Cache for expensive getRoadmapHealth() queries
  private cachedHealth: RoadmapHealth | null = null;
  private healthCacheValid = false;

  constructor(workspaceRoot: string) {
    super();
    this.workspaceRoot = workspaceRoot;

    const stateDir = path.join(workspaceRoot, 'state');
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }

    this.dbPath = path.join(stateDir, 'orchestrator.db');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');  // Better concurrency
    this.db.pragma('foreign_keys = ON');   // Enforce referential integrity

    this.initializeSchema();
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
    this.db.exec(`
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

      CREATE INDEX IF NOT EXISTS idx_context_type ON context_entries(entry_type);
      CREATE INDEX IF NOT EXISTS idx_context_topic ON context_entries(topic);
      CREATE INDEX IF NOT EXISTS idx_context_timestamp ON context_entries(timestamp);
    `);
  }

  // ==========================================================================
  // Task Operations
  // ==========================================================================

  createTask(task: Omit<Task, 'created_at'>, correlationId?: string): Task {
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

  updateTaskDetails(taskId: string, updates: { title?: string; description?: string }): Task {
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

    const updatedTask = this.getTask(taskId);
    if (!updatedTask) {
      throw new Error(`Task ${taskId} not found after update`);
    }

    this.logEvent({
      timestamp: Date.now(),
      event_type: 'task_updated',
      task_id: taskId,
      data: { updates },
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

  async transition(taskId: string, newStatus: TaskStatus, metadata?: Record<string, unknown>, correlationId?: string): Promise<Task> {
    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const now = Date.now();
    const updates: any = { status: newStatus };

    if (newStatus === 'in_progress' && !task.started_at) {
      updates.started_at = now;
    }

    if (newStatus === 'done' && !task.completed_at) {
      updates.completed_at = now;
      if (task.started_at) {
        updates.actual_duration_seconds = Math.floor((now - task.started_at) / 1000);
      }
    }

    if (metadata) {
      updates.metadata = JSON.stringify({ ...(task.metadata || {}), ...metadata });
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    this.db.prepare(`UPDATE tasks SET ${setClauses} WHERE id = ?`).run(...values, taskId);

    this.logEvent({
      timestamp: now,
      event_type: 'task_transition',
      task_id: taskId,
      data: { from: task.status, to: newStatus, metadata },
      correlation_id: correlationId
    });

    const updatedTask = this.getTask(taskId)!;
    this.invalidateHealthCache();
    this.emit('task:transition', updatedTask, task.status, newStatus);

    if (newStatus === 'done') {
      this.emit('task:completed', updatedTask);
    }

    return updatedTask;
  }

  assignTask(taskId: string, agent: string, correlationId?: string): Task {
    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    this.db.prepare('UPDATE tasks SET assigned_to = ? WHERE id = ?').run(agent, taskId);

    this.logEvent({
      timestamp: Date.now(),
      event_type: 'task_assigned',
      task_id: taskId,
      agent,
      data: { agent },
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
    // Check for circular dependencies
    if (this.wouldCreateCycle(taskId, dependsOnTaskId)) {
      throw new Error(`Adding dependency would create a cycle: ${taskId} -> ${dependsOnTaskId}`);
    }

    this.db.prepare(`
      INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id, dependency_type)
      VALUES (?, ?, ?)
    `).run(taskId, dependsOnTaskId, type);
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
    return pending.filter(task => this.isTaskReady(task.id));
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

  // ==========================================================================
  // Event Logging
  // ==========================================================================

  logEvent(event: Omit<Event, 'id'>): void {
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

  close(): void {
    this.db.close();
  }
}
