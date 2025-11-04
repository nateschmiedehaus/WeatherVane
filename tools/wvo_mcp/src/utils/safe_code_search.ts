import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

import Database from 'better-sqlite3';
import glob from 'fast-glob';

export interface SafeCodeSearchOptions {
  rootDir?: string;
  excludeDirs?: string[];
  maxFileSize?: number;
  concurrency?: number;
  fileExtensions?: string[];
  indexRefreshInterval?: number;
}

export interface SafeCodeSearchResult {
  filePath: string;
  language: string;
  snippet: string;
  score: number;
  metadata: {
    size: number;
    mtime: number;
  };
}

interface CodeIndexFileInfo {
  path: string;
  size: number;
  mtime: number;
  hash: string;
  content: string;
  language: string;
}

interface DatabaseRow {
  key: string;
  value: string;
  updated_at: number;
}

const DEFAULT_OPTIONS: Required<SafeCodeSearchOptions> = {
  rootDir: process.cwd(),
  excludeDirs: [
    '.git', '.hg', 'node_modules', 'dist', 'build',
    '.venv', '.pytest_cache', '__pycache__'
  ],
  maxFileSize: 256 * 1024, // 256KB
  concurrency: 12,
  fileExtensions: [
    '.ts', '.tsx', '.js', '.jsx', '.mjs',
    '.py', '.rb', '.java', '.go', '.rs',
    '.c', '.cpp', '.h', '.hpp',
    '.sql', '.sh', '.bash',
    '.md', '.rst', '.txt',
    '.yml', '.yaml', '.json'
  ],
  indexRefreshInterval: 10 * 60 * 1000 // 10 minutes
};

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.py': 'python',
  '.rb': 'ruby',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.md': 'markdown',
  '.rst': 'rst',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.json': 'json',
  '.txt': 'text'
};

export class SafeCodeSearchIndex {
  private db: Database.Database;
  private options: Required<SafeCodeSearchOptions>;
  private refreshTimer: NodeJS.Timeout | null = null;
  private isRefreshing = false;

  constructor(
    dbPath: string,
    options: SafeCodeSearchOptions = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // Prepared statements for better performance
    this.prepareStatements();

    // Start refresh timer
    this.startRefreshTimer();
  }

  private prepareStatements() {
    // Prepare common SQL statements
    this.db.prepare(`
      INSERT OR REPLACE INTO safe_code_index_files
      (file_path, size, mtime, hash, language, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.db.prepare(`
      INSERT INTO safe_code_fts
      (file_path, content, language, metadata)
      VALUES (?, ?, ?, ?)
    `);

    this.db.prepare(`
      UPDATE safe_code_index_metadata
      SET value = ?, updated_at = strftime('%s', 'now')
      WHERE key = ?
    `);
  }

  private startRefreshTimer() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.refreshTimer = setInterval(() => {
      void this.refresh();
    }, this.options.indexRefreshInterval);
  }

  private async getFileInfo(filePath: string) {
    const stat = await fs.stat(filePath);
    const ext = path.extname(filePath);
    const language = LANGUAGE_MAP[ext] || 'unknown';

    if (stat.size > this.options.maxFileSize) {
      return null;
    }

    const content = await fs.readFile(filePath, 'utf8');
    const hash = crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');

    return {
      path: filePath,
      size: stat.size,
      mtime: stat.mtimeMs,
      hash,
      content,
      language
    };
  }

  public async refresh() {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    try {
      // Get all matching files
      const files = await glob(this.options.fileExtensions.map(ext =>
        `**/*${ext}`
      ), {
        cwd: this.options.rootDir,
        absolute: true,
        ignore: this.options.excludeDirs.map(dir => `**/${dir}/**`),
        followSymbolicLinks: false
      });

      // Process files in batches
      const batchSize = this.options.concurrency;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const fileInfos = await Promise.all(
          batch.map(f => this.getFileInfo(f))
        );

        // Update database in a transaction
        this.db.transaction((fileInfos: (CodeIndexFileInfo | null)[]) => {
          for (const info of fileInfos) {
            if (!info) continue;

            // Check if file changed
            const existing = this.db.prepare(`
              SELECT hash FROM safe_code_index_files
              WHERE file_path = ?
            `).get(info.path) as { hash: string } | undefined;

            if (existing?.hash === info.hash) {
              continue;
            }

            // Update index
            const metadata = JSON.stringify({
              size: info.size,
              mtime: info.mtime
            });

            // FTS tables don't handle INSERT OR REPLACE correctly - must DELETE first
            this.db.prepare(`
              DELETE FROM safe_code_fts WHERE file_path = ?
            `).run(info.path);

            this.db.prepare(`
              INSERT INTO safe_code_fts
              (file_path, content, language, metadata)
              VALUES (?, ?, ?, ?)
            `).run(info.path, info.content, info.language, metadata);

            this.db.prepare(`
              INSERT OR REPLACE INTO safe_code_index_files
              (file_path, size, mtime, hash, language, indexed_at)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(
              info.path,
              info.size,
              info.mtime,
              info.hash,
              info.language,
              Date.now()
            );
          }
        })(fileInfos);
      }

      // Update metadata
      const result = this.db.prepare(`
        SELECT COUNT(*) as count FROM safe_code_index_files
      `).get() as { count: number };
      const count = result.count;

      this.db.prepare(`
        INSERT OR REPLACE INTO safe_code_index_metadata (key, value, updated_at)
        VALUES (?, ?, strftime('%s', 'now'))
      `).run('entry_count', count.toString());

      this.db.prepare(`
        INSERT OR REPLACE INTO safe_code_index_metadata (key, value, updated_at)
        VALUES (?, ?, strftime('%s', 'now'))
      `).run('last_full_index', Date.now().toString());

      this.db.prepare(`
        INSERT OR REPLACE INTO safe_code_index_metadata (key, value, updated_at)
        VALUES (?, ?, strftime('%s', 'now'))
      `).run('version', '1');

    } finally {
      this.isRefreshing = false;
    }
  }

  public search(
    query: string,
    options: {
      limit?: number;
      languages?: string[];
      after?: number;
    } = {}
  ): SafeCodeSearchResult[] {
    const limit = Math.min(options.limit || 50, 100);
    let sql = `
      SELECT
        file_path as filePath,
        language,
        snippet(safe_code_fts, 1, '', '', ' … ', 12) as snippet,
        bm25(safe_code_fts) as score,
        metadata
      FROM safe_code_fts
      WHERE safe_code_fts MATCH ?
    `;

    const params: any[] = [query];

    if (options.languages?.length) {
      sql += ' AND language IN (' +
        options.languages.map(() => '?').join(',') +
      ')';
      params.push(...options.languages);
    }

    if (options.after) {
      sql += ' AND json_extract(metadata, \'$.mtime\') > ?';
      params.push(options.after);
    }

    sql += '\nORDER BY score ASC LIMIT ?';
    params.push(limit);

    // Wrap non-word characters in quotes for FTS5
    // Handle special characters in query
    const escaped = query.split(/\s+/).map(term => {
      // Keep quoted terms as-is
      if (term.startsWith('"') && term.endsWith('"')) {
        return term;
      }
      // Wrap non-word terms in quotes
      if (/[^\w]/.test(term)) {
        return `"${term}"`;
      }
      return term;
    }).join(' ');
    params[0] = escaped;

    const rows = this.db.prepare(sql).all(...params) as Array<{
      filePath: string;
      language: string;
      snippet: string;
      score: number;
      metadata: string;
    }>;

    return rows.map(row => ({
      filePath: row.filePath,
      language: row.language,
      snippet: row.snippet,
      score: row.score,
      metadata: JSON.parse(row.metadata)
    }));
  }

  public getMetadata() {
    const rows = this.db.prepare(`
      SELECT key, value, updated_at
      FROM safe_code_index_metadata
    `).all() as DatabaseRow[];

    return rows.reduce((acc, row) => {
      acc[row.key] = {
        value: row.value,
        updatedAt: row.updated_at
      };
      return acc;
    }, {} as Record<string, {value: string, updatedAt: number}>);
  }

  public async awaitIdle() {
    while (this.isRefreshing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  public close() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.db.close();
  }
}