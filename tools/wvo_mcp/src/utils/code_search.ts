import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  CodeIndexEntry,
  CodeIndexMetadata,
  CodeSearchResult,
  StateMachine,
} from '../orchestrator/state_machine.js';
import { logInfo, logWarning } from '../telemetry/logger.js';

interface CodeSearchOptions {
  limit?: number;
  languages?: string[];
  forceRefresh?: boolean;
}

interface CodeSearchIndexOptions {
  includeDirs?: string[];
  maxFileSizeBytes?: number;
  allowedExtensions?: string[];
  maxIndexAgeMs?: number;
  maxConcurrentReads?: number;
}

const DEFAULT_INCLUDE_DIRS = ['apps', 'shared', 'tools/wvo_mcp/src', 'tests'];

const DEFAULT_ALLOWED_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.json',
  '.py',
  '.md',
  '.rst',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.cfg',
  '.sql',
  '.sh',
  '.bash',
];

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '.tox',
  '.venv',
  '.vscode',
  '.idea',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'state',
  'storage',
  '__pycache__',
  'tmp',
  'logs',
]);

export class CodeSearchIndex {
  private readonly includeDirs: string[];
  private readonly allowedExtensions: Set<string>;
  private readonly maxFileSizeBytes: number;
  private readonly maxIndexAgeMs: number;
  private readonly maxConcurrentReads: number;
  private buildPromise?: Promise<void>;
  private cachedMetadata?: CodeIndexMetadata;

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly workspaceRoot: string,
    options: CodeSearchIndexOptions = {}
  ) {
    this.includeDirs = options.includeDirs ?? DEFAULT_INCLUDE_DIRS;
    this.allowedExtensions = new Set(
      (options.allowedExtensions ?? DEFAULT_ALLOWED_EXTENSIONS).map((ext) =>
        ext.toLowerCase()
      )
    );
    this.maxFileSizeBytes = options.maxFileSizeBytes ?? 256 * 1024; // 256KB
    this.maxIndexAgeMs = options.maxIndexAgeMs ?? 10 * 60 * 1000; // 10 minutes
    this.maxConcurrentReads = Math.max(2, options.maxConcurrentReads ?? 12);
  }

  async search(rawQuery: string, options: CodeSearchOptions = {}): Promise<CodeSearchResult[]> {
    const normalizedQuery = this.buildMatchQuery(rawQuery);
    if (!normalizedQuery) {
      return [];
    }

    await this.ensureFreshIndex(options.forceRefresh ?? false);

    const languages = options.languages?.map((lang) => lang.toLowerCase());
    return this.stateMachine.searchCodeIndex(normalizedQuery, {
      limit: options.limit,
      languages,
    });
  }

  async refresh(): Promise<void> {
    await this.ensureFreshIndex(true);
  }

  private async ensureFreshIndex(force: boolean): Promise<void> {
    const metadata = this.getMetadata();

    if (force || metadata.entryCount === 0) {
      await this.initRebuildAndWait();
      return;
    }

    const updatedAt = typeof metadata.updatedAt === 'number' ? metadata.updatedAt : 0;
    const isStale = Date.now() - updatedAt > this.maxIndexAgeMs;

    if (isStale) {
      this.triggerBackgroundRebuild();
    }
  }

  async awaitIdle(): Promise<void> {
    if (!this.buildPromise) {
      return;
    }
    try {
      await this.buildPromise;
    } catch {
      // Error already surfaced via initRebuild logger; preserve background semantics.
    }
  }

  private getMetadata(): CodeIndexMetadata {
    if (!this.cachedMetadata) {
      this.cachedMetadata = this.stateMachine.getCodeIndexMetadata();
    }
    return this.cachedMetadata;
  }

  private initRebuild(): Promise<void> {
    if (!this.buildPromise) {
      const rebuildPromise = this.rebuildIndex().catch((error) => {
        logWarning('Code search index rebuild failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      });

      this.buildPromise = rebuildPromise.finally(() => {
        this.buildPromise = undefined;
      });
    }

    return this.buildPromise;
  }

  private async initRebuildAndWait(): Promise<void> {
    await this.initRebuild();
  }

  private triggerBackgroundRebuild(): void {
    const promise = this.initRebuild();
    void promise.catch(() => {
      // Error already logged; suppress unhandled rejection warnings for background rebuilds.
    });
  }

  private async rebuildIndex(): Promise<void> {
    const start = Date.now();
    const files = await this.collectCandidateFiles();
    const entries: CodeIndexEntry[] = [];

    if (files.length > 0) {
      let fileIndex = 0;
      const nextIndex = (): number | null => {
        if (fileIndex >= files.length) {
          return null;
        }
        const current = fileIndex;
        fileIndex += 1;
        return current;
      };

      const workerCount = Math.min(this.maxConcurrentReads, files.length);
      const workers = Array.from({ length: workerCount }, async () => {
        while (true) {
          const currentIndex = nextIndex();
          if (currentIndex === null) {
            break;
          }

          const relativePath = files[currentIndex];
          const absolutePath = path.join(this.workspaceRoot, relativePath);
          const entry = await this.readFileEntry(relativePath, absolutePath);
          if (entry) {
            entries.push(entry);
          }
        }
      });

      await Promise.all(workers);
    }

    this.stateMachine.replaceCodeIndex(entries, Date.now());
    this.cachedMetadata = {
      entryCount: entries.length,
      updatedAt: Date.now(),
    };

    logInfo('Code search index rebuilt', {
      filesProcessed: entries.length,
      durationMs: Date.now() - start,
    });
  }

  private async collectCandidateFiles(): Promise<string[]> {
    const results: string[] = [];

    for (const dir of this.includeDirs) {
      const absolute = path.join(this.workspaceRoot, dir);
      const exists = await this.pathExists(absolute);
      if (!exists) {
        continue;
      }
      await this.walkDirectory(absolute, dir, results);
    }

    return results;
  }

  private async walkDirectory(
    absoluteDir: string,
    relativeDir: string,
    results: string[]
  ): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    } catch (error) {
      logWarning('Failed to read directory during code indexing', {
        directory: absoluteDir,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env') {
        continue;
      }

      const relativePath = path.join(relativeDir, entry.name);
      const absolutePath = path.join(absoluteDir, entry.name);

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(entry.name)) {
          continue;
        }
        await this.walkDirectory(absolutePath, relativePath, results);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!this.allowedExtensions.has(extension)) {
        continue;
      }

      results.push(relativePath);
    }
  }

  private async pathExists(target: string): Promise<boolean> {
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }

  private async readFileEntry(
    relativePath: string,
    absolutePath: string
  ): Promise<CodeIndexEntry | null> {
    let content: string;
    try {
      const stat = await fs.stat(absolutePath);
      if (stat.size > this.maxFileSizeBytes) {
        return null;
      }

      content = await fs.readFile(absolutePath, 'utf8');
    } catch (error) {
      logWarning('Failed to read file for code indexing', {
        file: relativePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }

    if (!content || content.includes('\u0000')) {
      return null;
    }

    return {
      file_path: relativePath,
      content,
      language: this.detectLanguage(relativePath),
    };
  }

  private detectLanguage(relativePath: string): string {
    const extension = path.extname(relativePath).toLowerCase();
    switch (extension) {
      case '.ts':
      case '.tsx':
        return 'ts';
      case '.js':
      case '.mjs':
      case '.cjs':
      case '.jsx':
        return 'js';
      case '.py':
        return 'py';
      case '.md':
      case '.rst':
        return 'md';
      case '.json':
        return 'json';
      case '.yml':
      case '.yaml':
        return 'yaml';
      case '.sql':
        return 'sql';
      case '.sh':
      case '.bash':
        return 'sh';
      default:
        return extension.replace('.', '') || 'text';
    }
  }

  private buildMatchQuery(rawQuery: string): string | null {
    if (!rawQuery) {
      return null;
    }

    const tokens = rawQuery
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1)
      .map((token) => this.escapeToken(token));

    if (tokens.length === 0) {
      return null;
    }

    return tokens.map((token) => `${token}*`).join(' AND ');
  }

  private escapeToken(token: string): string {
    return token.replace(/["']/g, '');
  }
}
