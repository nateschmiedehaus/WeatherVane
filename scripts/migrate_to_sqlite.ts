import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'state', 'orchestrator.db');
const db = new Database(dbPath, { verbose: console.log });

// Enable WAL journal mode and foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Add new FTS5 tables for safe code search
db.exec(`
  -- Create new virtual table for FTS5 search
  CREATE VIRTUAL TABLE IF NOT EXISTS safe_code_fts USING fts5(
    file_path UNINDEXED,  -- Store but don't index file paths
    content,             -- Full content for searching
    language,            -- Programming language
    metadata UNINDEXED,  -- JSON metadata (size, mtime, etc)
    tokenize = 'unicode61 remove_diacritics 2'
  );

  -- Create metadata table for tracking indexing state
  CREATE TABLE IF NOT EXISTS safe_code_index_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Create table for tracking file changes
  CREATE TABLE IF NOT EXISTS safe_code_index_files (
    file_path TEXT PRIMARY KEY,
    size INTEGER NOT NULL,
    mtime INTEGER NOT NULL,
    hash TEXT NOT NULL,
    language TEXT NOT NULL,
    indexed_at INTEGER NOT NULL
  );

  -- Add indexes for performance
  CREATE INDEX IF NOT EXISTS idx_safe_code_files_mtime
    ON safe_code_index_files(mtime);

  CREATE INDEX IF NOT EXISTS idx_safe_code_files_language
    ON safe_code_index_files(language);
`);

// Initialize metadata
db.prepare(`
  INSERT OR IGNORE INTO safe_code_index_metadata
  (key, value, updated_at)
  VALUES
  ('last_full_index', '0', strftime('%s', 'now')),
  ('entry_count', '0', strftime('%s', 'now')),
  ('version', '1', strftime('%s', 'now'))
`).run();

console.log('Migration completed successfully');