import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { DocsyncOptions, DirectoryEntry, FileEntry, DirectoryMetrics, MetricWarning, MetricWarningRecord } from './types.js';
import { readIgnorePatterns } from './fs-utils.js';

interface DirectoryScanContext {
  repoRoot: string;
  ignorePatterns: string[];
  entries: Map<string, DirectoryEntry>;
}

const ALLOWED_ROOTS = new Set(['apps', 'docs', 'shared', 'tools']);
const ALLOWED_APPS = new Set(['api', 'model', 'web', 'allocator', 'validation', 'simulator', 'shopify_app']);
const ALLOWED_TOOLS = new Set(['docsync', 'wvo_mcp']);
const ALLOWED_WVO_SEGMENTS = new Set(['src', 'scripts']);
const ALWAYS_EXCLUDE_SEGMENTS = new Set([
  'node_modules',
  '__pycache__',
  '.pytest_cache',
  '.cache',
  '.tmp',
  'tmp',
  'temp',
  'build',
  'dist',
  'coverage',
  'snapshots',
  'public',
  'sandbox',
]);

const EXCLUDED_PATHS = [
  'apps/web/offline-cache',
  'apps/web/test-results',
  'apps/web/scripts',
  'apps/web/playwright',
  'tools/wvo_mcp/dist',
  'tools/wvo_mcp/tests',
  'tools/wvo_mcp/state',
  'tools/wvo_mcp/docs',
  'tools/wvo_mcp/prompts',
  'tools/wvo_mcp/config',
  'tools/wvo_mcp/tools',
  'tools/wvo_mcp/.tmp',
  'tools/wvo_mcp/.cache',
  'docs/weather',
  'docs/product/design_reviews',
  'docs/product/screenshots',
];

export async function collectRepositoryDirectories(options: DocsyncOptions): Promise<Map<string, DirectoryEntry>> {
  const ignorePatterns = await readIgnorePatterns(path.join(options.repoRoot, '.docsyncignore'));
  const ctx: DirectoryScanContext = {
    repoRoot: options.repoRoot,
    ignorePatterns,
    entries: new Map(),
  };

  await scanDirectory(ctx, options.repoRoot);
  computeDownstreamConsumers(ctx.entries);
  return ctx.entries;
}

async function scanDirectory(ctx: DirectoryScanContext, absolutePath: string): Promise<void> {
  const relativeDir = path.relative(ctx.repoRoot, absolutePath) || '.';

  if (shouldIgnoreDirectory(ctx, relativeDir)) {
    return;
  }

  let dirents: fs.Dirent[];
  try {
    dirents = await fs.readdir(absolutePath, { withFileTypes: true });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  const files: FileEntry[] = [];
  const childDirectories: string[] = [];

  for (const dirent of dirents) {
    const abs = path.join(absolutePath, dirent.name);
    const rel = path.relative(ctx.repoRoot, abs);

    if (dirent.isDirectory()) {
      childDirectories.push(rel);
      await scanDirectory(ctx, abs);
      continue;
    }

    let stats;
    try {
      stats = await fs.stat(abs);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    const extension = path.extname(dirent.name).toLowerCase();
    const contentSample = await sampleContent(abs, extension);

    files.push({
      path: rel,
      absolutePath: abs,
      relativeDir,
      name: dirent.name,
      extension,
      size: stats.size,
      contentSample,
    });
  }

  const readmePath = path.join(absolutePath, 'README.md');
  const hasReadme = await fileExists(readmePath);
  const metrics = computeMetrics(relativeDir, files);

  if (!shouldMaterialize(relativeDir)) {
    return;
  }

  ctx.entries.set(relativeDir, {
    path: relativeDir,
    name: relativeDir === '.' ? path.basename(ctx.repoRoot) : path.basename(relativeDir),
    absolutePath,
    parent: relativeDir === '.' ? null : path.dirname(relativeDir) === '.' ? '.' : path.dirname(relativeDir),
    readmePath,
    hasReadme,
    files,
    metrics,
    childDirectories,
  });
}

function shouldMaterialize(relativeDir: string): boolean {
  if (relativeDir === '.') {
    return false;
  }
  const parts = relativeDir.split(path.sep);
  if (parts.length <= 1) {
    return false;
  }
  if (parts[0] === 'tools' && parts.length === 2 && parts[1] === 'wvo_mcp') {
    return false;
  }
  return true;
}

function shouldIgnoreDirectory(ctx: DirectoryScanContext, relativeDir: string): boolean {
  if (relativeDir === '.') {
    return false;
  }

  if (ctx.ignorePatterns.some((pattern) => matchesPattern(relativeDir, pattern))) {
    return true;
  }

  const parts = relativeDir.split(path.sep);
  if (parts.some((seg) => seg.startsWith('.'))) {
    return true;
  }
  if (parts.some((seg) => ALWAYS_EXCLUDE_SEGMENTS.has(seg))) {
    return true;
  }
  if (parts.some((seg) => isLikelyHash(seg))) {
    return true;
  }

  const root = parts[0];
  if (!ALLOWED_ROOTS.has(root)) {
    return true;
  }

  if (EXCLUDED_PATHS.some((prefix) => relativeDir.startsWith(prefix))) {
    return true;
  }

  if (root === 'apps') {
    if (parts.length >= 2 && !ALLOWED_APPS.has(parts[1])) {
      return true;
    }
    if (parts[1] === 'shopify_app' && parts.includes('storage')) {
      return parts.length > 3;
    }
    if (parts[1] === 'web') {
      const excludedWeb = ['offline-cache', 'test-results', 'playwright', 'public', 'scripts'];
      if (parts.length >= 3 && excludedWeb.includes(parts[2])) {
        return true;
      }
    }
  }

  if (root === 'tools') {
    if (parts.length >= 2 && !ALLOWED_TOOLS.has(parts[1])) {
      return true;
    }
    if (parts[1] === 'wvo_mcp') {
      if (parts.length === 2) {
        return false;
      }
      if (!ALLOWED_WVO_SEGMENTS.has(parts[2])) {
        return true;
      }
    }
  }

  return false;
}

function matchesPattern(relativeDir: string, pattern: string): boolean {
  if (pattern.endsWith('/**')) {
    const base = pattern.slice(0, -3);
    return relativeDir === base || relativeDir.startsWith(`${base}/`);
  }
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2);
    return relativeDir.startsWith(`${base}/`);
  }
  return relativeDir === pattern;
}

function isLikelyHash(segment: string): boolean {
  return segment.length >= 16 && /^[0-9a-f-]+$/i.test(segment);
}

async function sampleContent(absPath: string, extension: string): Promise<string | undefined> {
  if (!['.ts', '.tsx', '.js', '.jsx', '.py'].includes(extension)) {
    return undefined;
  }
  const buffer = await fs.readFile(absPath, { encoding: 'utf8' });
  return buffer.slice(0, 5000);
}

function computeMetrics(relativeDir: string, files: FileEntry[]): DirectoryMetrics {
  const languageHistogram: Record<string, number> = {};
  const importTargets = new Set<string>();
  let todoCount = 0;
  let testFileCount = 0;
  let criticFileCount = 0;

  for (const file of files) {
    languageHistogram[file.extension] = (languageHistogram[file.extension] ?? 0) + 1;
    if (file.name.includes('.test.') || file.name.includes('.spec.')) {
      testFileCount += 1;
    }
    if (/critic/i.test(file.name)) {
      criticFileCount += 1;
    }
    if (file.contentSample) {
      todoCount += (file.contentSample.match(/TODO|FIXME/gi) || []).length;
      extractImports(relativeDir, file, importTargets);
    }
  }

  const warnings = buildWarnings({
    languageHistogram,
    todoCount,
    testFileCount,
    criticFileCount,
    importTargets,
    fileCount: files.length,
  });

  return {
    languageHistogram,
    todoCount,
    testFileCount,
    criticFileCount,
    importTargets,
    downstreamConsumers: new Set(),
    warnings,
    summary: summarizeScores(warnings),
  };
}

function extractImports(relativeDir: string, file: FileEntry, importTargets: Set<string>) {
  const content = file.contentSample ?? '';
  const regex = file.extension === '.py'
    ? /^\s*(?:from|import)\s+([a-zA-Z0-9_.]+)/gm
    : /^\s*import\s+(?:.+?\s+from\s+)?['"]([^'"`]+)['"];?/gm;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const target = match[1];
    if (!target || (!target.startsWith('.') && !target.startsWith('@/'))) {
      continue;
    }
    const normalized = normalizeImport(relativeDir, target);
    if (normalized) {
      importTargets.add(normalized);
    }
  }
}

function normalizeImport(relativeDir: string, importPath: string): string | null {
  if (importPath.startsWith('@/')) {
    const withoutAlias = importPath.replace(/^@\//, '');
    const [first] = withoutAlias.split('/');
    return first ? first : null;
  }
  const combined = path.normalize(path.join(relativeDir, importPath));
  const dir = path.dirname(combined);
  if (dir === '.') {
    return null;
  }
  return dir.replace(/\\/g, '/');
}

function buildWarnings(args: {
  languageHistogram: Record<string, number>;
  todoCount: number;
  testFileCount: number;
  criticFileCount: number;
  importTargets: Set<string>;
  fileCount: number;
}): MetricWarning[] {
  const warnings: MetricWarning[] = [];
  const languages = Object.keys(args.languageHistogram).filter((ext) => ext !== '.md');

  if (languages.length >= 3) {
    warnings.push({
      severity: 'medium',
      force: 'coherence',
      message: `Directory contains ${languages.length} languages (${languages.join(', ')}).`,
      recommendation: 'Consider splitting language-specific modules.',
    });
  }

  if (args.todoCount >= 5) {
    warnings.push({
      severity: 'medium',
      force: 'evolution',
      message: `Found ${args.todoCount} TODO/FIXME markers.`,
      recommendation: 'Promote TODOs into roadmap remediation tasks.',
    });
  }

  if (args.testFileCount === 0 && languages.some((ext) => ['.ts', '.tsx', '.py'].includes(ext))) {
    warnings.push({
      severity: 'high',
      force: 'visibility',
      message: 'No tests detected for executable code.',
      recommendation: 'Add unit/integration tests before merging changes.',
    });
  }

  if (args.importTargets.size >= 5) {
    warnings.push({
      severity: 'medium',
      force: 'locality',
      message: `Imports reference ${args.importTargets.size} directories.`,
      recommendation: 'Review module boundaries; consider extracting shared utilities.',
    });
  }

  if (args.fileCount === 0) {
    warnings.push({
      severity: 'low',
      force: 'economy',
      message: 'Directory is empty; consider removing it.',
    });
  }

  return warnings;
}

function summarizeScores(warnings: MetricWarning[]): DirectoryMetrics['summary'] {
  const base = { coherence: 5, economy: 5, locality: 5, visibility: 5, evolution: 5 };
  for (const warning of warnings) {
    const key = warning.force;
    const penalty = warning.severity === 'high' ? 2 : warning.severity === 'medium' ? 1 : 0.5;
    base[key] = Math.max(0, base[key] - penalty);
  }
  return {
    coherenceScore: base.coherence,
    economyScore: base.economy,
    localityScore: base.locality,
    visibilityScore: base.visibility,
    evolutionScore: base.evolution,
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function groupWarnings(entries: Map<string, DirectoryEntry>): MetricWarningRecord[] {
  const records: MetricWarningRecord[] = [];
  for (const [pathKey, entry] of entries) {
    if (entry.metrics.warnings.length > 0) {
      records.push({ directory: pathKey, warnings: entry.metrics.warnings });
    }
  }
  return records.sort((a, b) => a.directory.localeCompare(b.directory));
}

function computeDownstreamConsumers(entries: Map<string, DirectoryEntry>) {
  for (const entry of entries.values()) {
    for (const target of entry.metrics.importTargets) {
      const targetEntry = entries.get(target);
      if (targetEntry) {
        targetEntry.metrics.downstreamConsumers.add(entry.path);
      }
    }
  }
}

export function filterEntriesByMode(
  entries: Map<string, DirectoryEntry>,
  mode: DocsyncOptions['mode'],
  repoRoot: string,
): Map<string, DirectoryEntry> {
  if (mode === 'all') {
    return entries;
  }
  const staged = stagedDirectories(repoRoot);
  if (staged.size === 0) {
    return new Map();
  }
  const expanded = expandDirectorySet(staged);
  const filtered = new Map<string, DirectoryEntry>();
  for (const [pathKey, entry] of entries) {
    if (shouldIncludeEntry(entry, expanded)) {
      filtered.set(pathKey, entry);
    }
  }
  return filtered;
}

function stagedDirectories(repoRoot: string): Set<string> {
  try {
    const output = execSync('git diff --cached --name-only', {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    if (!output) {
      return new Set();
    }
    const dirs = new Set<string>();
    for (const line of output.split(/\r?\n/)) {
      const dir = path.dirname(line).replace(/\\/g, '/');
      dirs.add(dir === '.' ? '.' : dir);
      const parent = path.dirname(dir);
      if (parent && parent !== '.' && parent !== '..') {
        dirs.add(parent.replace(/\\/g, '/'));
      }
    }
    return dirs;
  } catch {
    return new Set();
  }
}

function expandDirectorySet(initial: Set<string>): Set<string> {
  const expanded = new Set<string>();
  for (const dir of initial) {
    if (!dir || dir === '.' || dir === '..') {
      continue;
    }
    const normalized = dir.replace(/\\/g, '/');
    const parts = normalized.split('/');
    for (let i = 1; i <= parts.length; i += 1) {
      const prefix = parts.slice(0, i).join('/');
      if (prefix) {
        expanded.add(prefix);
      }
    }
  }
  return expanded;
}

function shouldIncludeEntry(entry: DirectoryEntry, expanded: Set<string>): boolean {
  if (expanded.has(entry.path)) {
    return true;
  }
  if (entry.parent && expanded.has(entry.parent)) {
    return true;
  }
  const ancestors = collectAncestors(entry.path);
  if (ancestors.some((ancestor) => expanded.has(ancestor))) {
    return true;
  }
  for (const upstream of entry.metrics.importTargets) {
    if (expanded.has(upstream)) {
      return true;
    }
  }
  for (const downstream of entry.metrics.downstreamConsumers) {
    if (expanded.has(downstream)) {
      return true;
    }
  }
  return false;
}

function collectAncestors(pathKey: string): string[] {
  const result: string[] = [];
  const normalized = pathKey.replace(/\\/g, '/');
  const parts = normalized.split('/');
  for (let i = parts.length - 1; i > 0; i -= 1) {
    const ancestor = parts.slice(0, i).join('/');
    if (ancestor) {
      result.push(ancestor);
    }
  }
  return result;
}
