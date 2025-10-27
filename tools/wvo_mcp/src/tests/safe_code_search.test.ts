import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';

import { initializeSearch, searchCode, getSearchMetadata, resetSearch } from '../tools/safe_code_search';
import { SafeCodeSearchIndex } from '../utils/safe_code_search';



describe('SafeCodeSearchIndex', () => {
  let tempDir: string;
  let dbPath: string;
  let searchIndex: SafeCodeSearchIndex;

  beforeEach(async () => {
    // Create temp directory and test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'safe-code-search-test-'));
    dbPath = path.join(tempDir, 'test.db');

    // Initialize test database
    let tempDb = new Database(dbPath);
    tempDb.exec(`
      CREATE VIRTUAL TABLE safe_code_fts USING fts5(
        file_path UNINDEXED,
        content,
        language,
        metadata UNINDEXED,
        tokenize = 'unicode61 remove_diacritics 2'
      );

      CREATE TABLE safe_code_index_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE safe_code_index_files (
        file_path TEXT PRIMARY KEY,
        size INTEGER NOT NULL,
        mtime INTEGER NOT NULL,
        hash TEXT NOT NULL,
        language TEXT NOT NULL,
        indexed_at INTEGER NOT NULL
      );
    `);
    tempDb.close();

    // Create test files
    await fs.mkdir(path.join(tempDir, 'src'));
    await fs.writeFile(
      path.join(tempDir, 'src', 'test1.ts'),
      'function hello() { console.log("hello"); }'
    );
    await fs.writeFile(
      path.join(tempDir, 'src', 'test2.py'),
      'def hello():\n    print("hello")'
    );

    // Initialize database with schema
    tempDb = new Database(dbPath);
    tempDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS safe_code_fts USING fts5(
        file_path UNINDEXED,
        content,
        language,
        metadata UNINDEXED,
        tokenize = 'unicode61 remove_diacritics 2'
      );

      CREATE TABLE IF NOT EXISTS safe_code_index_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS safe_code_index_files (
        file_path TEXT PRIMARY KEY,
        size INTEGER NOT NULL,
        mtime INTEGER NOT NULL,
        hash TEXT NOT NULL,
        language TEXT NOT NULL,
        indexed_at INTEGER NOT NULL
      );

      INSERT OR IGNORE INTO safe_code_index_metadata
      (key, value, updated_at)
      VALUES
      ('last_full_index', '0', strftime('%s', 'now')),
      ('entry_count', '0', strftime('%s', 'now')),
      ('version', '1', strftime('%s', 'now'));
    `);
    tempDb.close();

    // Initialize search index
    searchIndex = new SafeCodeSearchIndex(dbPath, {
      rootDir: tempDir,
      indexRefreshInterval: 1000
    });
    await searchIndex.refresh();
  });

  afterEach(async () => {
    searchIndex.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('indexes files on refresh', async () => {
    const metadata = searchIndex.getMetadata();
    expect(parseInt(metadata.entry_count.value)).toBe(2);
  });

  it('finds typescript files', async () => {
    const results = searchIndex.search('function hello', {
      languages: ['typescript']
    });
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toContain('test1.ts');
    expect(results[0].language).toBe('typescript');
  });

  it('finds python files', async () => {
    const results = searchIndex.search('def hello', {
      languages: ['python']
    });
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toContain('test2.py');
    expect(results[0].language).toBe('python');
  });

  it('respects file size limits', async () => {
    // Create a file larger than the default limit
    const largeContent = 'x'.repeat(300 * 1024); // 300KB
    await fs.writeFile(
      path.join(tempDir, 'src', 'large.ts'),
      largeContent
    );

    await searchIndex.refresh();
    const results = searchIndex.search('x');
    expect(results.every(r => !r.filePath.includes('large.ts'))).toBe(true);
  });

  it('updates index when files change', async () => {
    // Modify a file
    await fs.writeFile(
      path.join(tempDir, 'src', 'test1.ts'),
      'function goodbye() { console.log("goodbye"); }'
    );

    await searchIndex.refresh();
    const results = searchIndex.search('goodbye');
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toContain('test1.ts');
  });

  it('returns snippets with matches', async () => {
    const results = searchIndex.search('console.log');
    expect(results[0].snippet).toContain('console.log');
  });

  it('handles special characters in search', async () => {
    const results = searchIndex.search('console\\.log');
    expect(results).toHaveLength(1);
  });
});

describe('Safe Code Search Tools', () => {
  let tempDir: string;
  let origCwd: string;

  beforeEach(async () => {
    // Save original working directory
    origCwd = process.cwd();

    // Create temp directory and test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'safe-code-search-tool-test-'));
    process.chdir(tempDir);

    // Create state directory
    await fs.mkdir(path.join(tempDir, 'state'));

    // Initialize test database
    const tempDb = new Database(path.join(tempDir, 'state', 'orchestrator.db'));
    tempDb.exec(`
      CREATE VIRTUAL TABLE safe_code_fts USING fts5(
        file_path UNINDEXED,
        content,
        language,
        metadata UNINDEXED,
        tokenize = 'unicode61 remove_diacritics 2'
      );

      CREATE TABLE safe_code_index_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE safe_code_index_files (
        file_path TEXT PRIMARY KEY,
        size INTEGER NOT NULL,
        mtime INTEGER NOT NULL,
        hash TEXT NOT NULL,
        language TEXT NOT NULL,
        indexed_at INTEGER NOT NULL
      );
    `);
    tempDb.close();

    // Create test files
    await fs.mkdir(path.join(tempDir, 'src'));
    await fs.writeFile(
      path.join(tempDir, 'src', 'test1.ts'),
      'function hello() { console.log("hello"); }'
    );
  });

  afterEach(async () => {
    resetSearch(); // Reset singleton between tests
    process.chdir(origCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('initializes search and finds content', async () => {
    await initializeSearch();
    const results = await searchCode({
      query: 'function hello'
    });
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toContain('test1.ts');
  });

  it('provides metadata about the index', async () => {
    await initializeSearch();
    const metadata = getSearchMetadata();
    expect(metadata.entry_count.value).toBe('1');
    expect(metadata.version.value).toBe('1');
  });

  it('handles multiple initializations', async () => {
    await initializeSearch();
    await initializeSearch(); // Should not throw
    const results = await searchCode({
      query: 'function hello'
    });
    expect(results).toHaveLength(1);
  });

  it('respects language filters', async () => {
    await initializeSearch();
    const results = await searchCode({
      query: 'function hello',
      languages: ['typescript']
    });
    expect(results).toHaveLength(1);

    const noResults = await searchCode({
      query: 'function hello',
      languages: ['python']
    });
    expect(noResults).toHaveLength(0);
  });

  it('respects result limits', async () => {
    await initializeSearch();
    const results = await searchCode({
      query: 'function',
      limit: 1
    });
    expect(results).toHaveLength(1);
  });
});