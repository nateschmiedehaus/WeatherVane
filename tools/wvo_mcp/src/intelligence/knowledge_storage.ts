/**
 * SQLite storage for knowledge graph data.
 *
 * Provides persistence layer for semantic understanding, call graphs,
 * and architectural knowledge.
 */

import Database from 'better-sqlite3';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  CallGraphEdge,
  DecisionKnowledge,
  FunctionKnowledge,
  ModuleKnowledge,
  PatternKnowledge,
} from './knowledge_types.js';

export class KnowledgeStorage {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(workspaceRoot: string) {
    this.dbPath = path.join(workspaceRoot, 'state', 'knowledge', 'knowledge_graph.db');
  }

  /**
   * Initialize database and create schema if needed.
   */
  async initialize(): Promise<void> {
    // Ensure state/knowledge directory exists
    const dir = path.dirname(this.dbPath);
    await fs.mkdir(dir, { recursive: true });

    // Open database
    this.db = new Database(this.dbPath);

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Create schema
    this.createSchema();
  }

  /**
   * Close database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Create database schema.
   */
  private createSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Functions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS functions (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        name TEXT NOT NULL,
        purpose TEXT NOT NULL,
        confidence REAL NOT NULL,
        complexity INTEGER NOT NULL,
        coverage REAL NOT NULL,
        last_updated TEXT NOT NULL,
        git_sha TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_functions_file_path ON functions(file_path);
      CREATE INDEX IF NOT EXISTS idx_functions_name ON functions(name);
    `);

    // Call graph edges table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS call_graph (
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line_number INTEGER NOT NULL,
        PRIMARY KEY (from_id, to_id, file_path, line_number),
        FOREIGN KEY (from_id) REFERENCES functions(id) ON DELETE CASCADE,
        FOREIGN KEY (to_id) REFERENCES functions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_call_graph_from ON call_graph(from_id);
      CREATE INDEX IF NOT EXISTS idx_call_graph_to ON call_graph(to_id);
    `);

    // Modules table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS modules (
        path TEXT PRIMARY KEY,
        purpose TEXT NOT NULL,
        responsibilities TEXT NOT NULL,
        patterns TEXT NOT NULL,
        dependencies TEXT NOT NULL
      );
    `);

    // Patterns table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        name TEXT PRIMARY KEY,
        use_case TEXT NOT NULL,
        examples TEXT NOT NULL,
        usage_count INTEGER NOT NULL,
        bug_rate REAL NOT NULL,
        last_used TEXT NOT NULL
      );
    `);

    // Decisions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        decision TEXT NOT NULL,
        rationale TEXT NOT NULL,
        code_locations TEXT NOT NULL,
        alternatives TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        task_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON decisions(timestamp DESC);
    `);
  }

  /**
   * Store or update function knowledge.
   */
  storeFunctionKnowledge(fn: FunctionKnowledge): void {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO functions
      (id, file_path, name, purpose, confidence, complexity, coverage, last_updated, git_sha)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      fn.id,
      fn.filePath,
      fn.name,
      fn.purpose,
      fn.confidence,
      fn.complexity,
      fn.coverage,
      fn.lastUpdated,
      fn.gitSha,
    );
  }

  /**
   * Get function knowledge by ID.
   */
  getFunctionKnowledge(id: string): FunctionKnowledge | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM functions WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      filePath: row.file_path,
      name: row.name,
      purpose: row.purpose,
      confidence: row.confidence,
      complexity: row.complexity,
      coverage: row.coverage,
      lastUpdated: row.last_updated,
      gitSha: row.git_sha,
    };
  }

  /**
   * Search functions by semantic purpose.
   */
  searchFunctionsByPurpose(query: string, limit = 10): FunctionKnowledge[] {
    if (!this.db) throw new Error('Database not initialized');

    // Simple LIKE search (can be enhanced with FTS5 later)
    const stmt = this.db.prepare(`
      SELECT * FROM functions
      WHERE purpose LIKE ?
      ORDER BY confidence DESC
      LIMIT ?
    `);

    const rows = stmt.all(`%${query}%`, limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      filePath: row.file_path,
      name: row.name,
      purpose: row.purpose,
      confidence: row.confidence,
      complexity: row.complexity,
      coverage: row.coverage,
      lastUpdated: row.last_updated,
      gitSha: row.git_sha,
    }));
  }

  /**
   * Search functions by name.
   */
  searchFunctionsByName(query: string, limit = 10): FunctionKnowledge[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM functions
      WHERE name LIKE ? OR purpose LIKE ?
      ORDER BY confidence DESC
      LIMIT ?
    `);

    const rows = stmt.all(`%${query}%`, `%${query}%`, limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      filePath: row.file_path,
      name: row.name,
      purpose: row.purpose,
      confidence: row.confidence,
      complexity: row.complexity,
      coverage: row.coverage,
      lastUpdated: row.last_updated,
      gitSha: row.git_sha,
    }));
  }

  /**
   * Store call graph edge.
   */
  storeCallGraphEdge(edge: CallGraphEdge): void {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO call_graph (from_id, to_id, file_path, line_number)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(edge.from, edge.to, edge.filePath, edge.lineNumber);
  }

  /**
   * Get functions that call the given function (callers).
   */
  getCallers(functionId: string): string[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT from_id FROM call_graph WHERE to_id = ?');
    const rows = stmt.all(functionId) as { from_id: string }[];

    return rows.map((row) => row.from_id);
  }

  /**
   * Get functions called by the given function (callees).
   */
  getCallees(functionId: string): string[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT to_id FROM call_graph WHERE from_id = ?');
    const rows = stmt.all(functionId) as { to_id: string }[];

    return rows.map((row) => row.to_id);
  }

  /**
   * Store or update module knowledge.
   */
  storeModuleKnowledge(module: ModuleKnowledge): void {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO modules (path, purpose, responsibilities, patterns, dependencies)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      module.path,
      module.purpose,
      JSON.stringify(module.responsibilities),
      JSON.stringify(module.patterns),
      JSON.stringify(module.dependencies),
    );
  }

  /**
   * Get module knowledge by path.
   */
  getModuleKnowledge(path: string): ModuleKnowledge | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM modules WHERE path = ?');
    const row = stmt.get(path) as any;

    if (!row) return null;

    return {
      path: row.path,
      purpose: row.purpose,
      responsibilities: JSON.parse(row.responsibilities),
      patterns: JSON.parse(row.patterns),
      dependencies: JSON.parse(row.dependencies),
    };
  }

  /**
   * Store or update pattern knowledge.
   */
  storePatternKnowledge(pattern: PatternKnowledge): void {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO patterns (name, use_case, examples, usage_count, bug_rate, last_used)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      pattern.name,
      pattern.useCase,
      JSON.stringify(pattern.examples),
      pattern.fitness.usageCount,
      pattern.fitness.bugRate,
      pattern.fitness.lastUsed,
    );
  }

  /**
   * Get pattern knowledge by name.
   */
  getPatternKnowledge(name: string): PatternKnowledge | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM patterns WHERE name = ?');
    const row = stmt.get(name) as any;

    if (!row) return null;

    return {
      name: row.name,
      useCase: row.use_case,
      examples: JSON.parse(row.examples),
      fitness: {
        usageCount: row.usage_count,
        bugRate: row.bug_rate,
        lastUsed: row.last_used,
      },
    };
  }

  /**
   * Store decision knowledge.
   */
  storeDecisionKnowledge(decision: DecisionKnowledge): void {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO decisions
      (id, question, decision, rationale, code_locations, alternatives, timestamp, task_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      decision.id,
      decision.question,
      decision.decision,
      decision.rationale,
      JSON.stringify(decision.codeLocations),
      JSON.stringify(decision.alternatives),
      decision.timestamp,
      decision.taskId || null,
    );
  }

  /**
   * Get decision knowledge by ID.
   */
  getDecisionKnowledge(id: string): DecisionKnowledge | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM decisions WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      question: row.question,
      decision: row.decision,
      rationale: row.rationale,
      codeLocations: JSON.parse(row.code_locations),
      alternatives: JSON.parse(row.alternatives),
      timestamp: row.timestamp,
      taskId: row.task_id,
    };
  }

  /**
   * Search decisions by question or rationale.
   */
  searchDecisions(query: string, limit = 10): DecisionKnowledge[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM decisions
      WHERE question LIKE ? OR rationale LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(`%${query}%`, `%${query}%`, limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      question: row.question,
      decision: row.decision,
      rationale: row.rationale,
      codeLocations: JSON.parse(row.code_locations),
      alternatives: JSON.parse(row.alternatives),
      timestamp: row.timestamp,
      taskId: row.task_id,
    }));
  }

  /**
   * Get database statistics.
   */
  getStatistics(): {
    functions: number;
    edges: number;
    modules: number;
    patterns: number;
    decisions: number;
  } {
    if (!this.db) throw new Error('Database not initialized');

    const functions = this.db.prepare('SELECT COUNT(*) as count FROM functions').get() as { count: number };
    const edges = this.db.prepare('SELECT COUNT(*) as count FROM call_graph').get() as { count: number };
    const modules = this.db.prepare('SELECT COUNT(*) as count FROM modules').get() as { count: number };
    const patterns = this.db.prepare('SELECT COUNT(*) as count FROM patterns').get() as { count: number };
    const decisions = this.db.prepare('SELECT COUNT(*) as count FROM decisions').get() as { count: number };

    return {
      functions: functions.count,
      edges: edges.count,
      modules: modules.count,
      patterns: patterns.count,
      decisions: decisions.count,
    };
  }
}
