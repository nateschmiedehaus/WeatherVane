import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import Database from 'better-sqlite3';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';

import { SafeCodeSearchIndex } from './safe_code_search';

describe('SafeCodeSearchIndex', () => {
  let testDir: string;
  let dbPath: string;
  let index: SafeCodeSearchIndex;

  beforeEach(async () => {
    // Create temp test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-search-test-'));
    dbPath = path.join(testDir, 'test.db');

    // Create test database and initialize schema
    const tempDb = new Database(dbPath);
    tempDb.pragma('journal_mode = WAL');
    tempDb.pragma('foreign_keys = ON');

    tempDb.exec(`
      -- Create virtual table for FTS5 search
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
    tempDb.prepare(`
      INSERT OR IGNORE INTO safe_code_index_metadata
      (key, value, updated_at)
      VALUES
      ('last_full_index', '0', strftime('%s', 'now')),
      ('entry_count', '0', strftime('%s', 'now')),
      ('version', '1', strftime('%s', 'now'))
    `).run();

    tempDb.close();

    // Initialize search index
    index = new SafeCodeSearchIndex(dbPath, {
      rootDir: testDir,
      indexRefreshInterval: 1000
    });
  });

  afterEach(async () => {
    index.close();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('indexes and searches TypeScript files', async () => {
    // Create test file
    const filePath = path.join(testDir, 'test.ts');
    await fs.writeFile(filePath, `
      function add(a: number, b: number): number {
        return a + b;
      }
    `);

    // Refresh index
    await index.refresh();
    await index.awaitIdle();

    // Search with quoted function name
    const results = index.search('"function" "add"');
    expect(results).toHaveLength(1);
    expect(results[0].language).toBe('typescript');
    expect(results[0].filePath).toBe(filePath);
    expect(results[0].snippet).toContain('function add');
  });

  test('respects file size limits', async () => {
    // Create large test file
    const filePath = path.join(testDir, 'large.ts');
    const largeContent = 'x'.repeat(1024 * 1024); // 1MB
    await fs.writeFile(filePath, largeContent);

    // Refresh index
    await index.refresh();
    await index.awaitIdle();

    // Verify large file was skipped
    const results = index.search('x');
    expect(results).toHaveLength(0);
  });

  test('updates index when files change', async () => {
    // Create initial file
    const filePath = path.join(testDir, 'changing.ts');
    await fs.writeFile(filePath, 'const x = 1;');

    // Initial index
    await index.refresh();
    await index.awaitIdle();

    // Update file
    await fs.writeFile(filePath, 'const y = 2;');

    // Refresh index
    await index.refresh();
    await index.awaitIdle();

    // Search for old and new content
    const oldResults = index.search('const x');
    const newResults = index.search('const y');

    expect(oldResults).toHaveLength(0);
    expect(newResults).toHaveLength(1);
  });

  test('handles multiple languages', async () => {
    // Create files in different languages
    await fs.writeFile(path.join(testDir, 'code.ts'), 'function test() {}');
    await fs.writeFile(path.join(testDir, 'code.py'), 'def test():');
    await fs.writeFile(path.join(testDir, 'code.rb'), 'def test');

    // Refresh index
    await index.refresh();
    await index.awaitIdle();

    // Search with language filter
    const tsResults = index.search('test', { languages: ['typescript'] });
    const pyResults = index.search('test', { languages: ['python'] });
    const rbResults = index.search('test', { languages: ['ruby'] });

    expect(tsResults).toHaveLength(1);
    expect(pyResults).toHaveLength(1);
    expect(rbResults).toHaveLength(1);

    expect(tsResults[0].language).toBe('typescript');
    expect(pyResults[0].language).toBe('python');
    expect(rbResults[0].language).toBe('ruby');
  });

  test('provides accurate metadata', async () => {
    // Create test file
    const filePath = path.join(testDir, 'meta.ts');
    await fs.writeFile(filePath, 'const meta = true;');

    // Refresh index
    await index.refresh();
    await index.awaitIdle();

    // Get metadata
    const metadata = index.getMetadata();

    expect(metadata.entry_count.value).toBe('1');
    expect(metadata.last_full_index.value).toBeDefined();
    expect(metadata.version.value).toBe('1');
  });

  test('handles incremental updates', async () => {
    // Create initial files
    await fs.writeFile(path.join(testDir, 'v1.ts'), 'const a = 1;');
    await fs.writeFile(path.join(testDir, 'v2.ts'), 'const b = 2;');

    // Initial index
    await index.refresh();
    await index.awaitIdle();

    // Record initial time
    const firstIndexTime = Date.now();

    // Wait briefly
    await new Promise(resolve => setTimeout(resolve, 100));

    // Add new file
    await fs.writeFile(path.join(testDir, 'v3.ts'), 'const c = 3;');

    // Refresh index
    await index.refresh();
    await index.awaitIdle();

    // Search for recent changes only
    const recentResults = index.search('const', { after: firstIndexTime });
    expect(recentResults).toHaveLength(1);
    expect(recentResults[0].snippet).toContain('c = 3');
  });
});