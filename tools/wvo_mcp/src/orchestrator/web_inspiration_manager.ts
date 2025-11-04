import { promises as fs } from 'node:fs';
import path from 'node:path';

import YAML from 'yaml';

import { logError, logInfo, logWarning } from '../telemetry/logger.js';
import { InspirationFetcher, type WebInspirationResult } from '../web_tools/inspiration_fetcher.js';

import type { OperationsManager } from './operations_manager.js';
import type { Task , StateMachine } from './state_machine.js';

interface InspirationStats {
  url: string;
  success: boolean;
  cached: boolean;
  durationMs?: number;
  screenshotSizeKb?: number;
  htmlSizeKb?: number;
  category?: string;
}

export interface InspirationAsset {
  taskId: string;
  url: string;
  timestamp: number;
  screenshot?: string;
  html?: string;
  screenshotSizeKb?: number;
  htmlSizeKb?: number;
  cached: boolean;
  category?: string;
}

interface SourceCategory {
  id: string;
  description?: string;
  keywords: string[];
  sources: string[];
  fallback?: boolean;
}

interface MetadataRecord {
  screenshotPath?: string;
  htmlPath?: string;
  metadata: (WebInspirationResult['metadata'] & { category?: string }) | undefined;
}

export class WebInspirationManager {
  private readonly enabled: boolean;
  private readonly fetcher: InspirationFetcher;
  private readonly configPath: string;
  private sourceConfig?: { categories: SourceCategory[]; mtimeMs: number };
  private readonly stats: InspirationStats[] = [];

  constructor(
    private readonly workspaceRoot: string,
    private readonly stateMachine: StateMachine,
    private readonly operationsManager: OperationsManager
  ) {
    this.enabled = process.env.WVO_ENABLE_WEB_INSPIRATION === '1';
    this.fetcher = new InspirationFetcher(workspaceRoot);
    const overrideConfig = process.env.WVO_WEB_INSPIRATION_CONFIG;
    this.configPath = overrideConfig
      ? path.resolve(overrideConfig)
      : path.join(workspaceRoot, 'tools', 'wvo_mcp', 'config', 'web_inspiration_sources.yaml');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  shouldFetch(task: Task): boolean {
    if (!this.enabled) return false;

    const exitCriteria = this.getExitCriteria(task);
    const combinedText = `${task.title} ${task.description ?? ''} ${exitCriteria.join(' ')}`.toLowerCase();

    if (this.getKeywordHints().some((hint) => combinedText.includes(hint))) {
      return true;
    }

    if (exitCriteria.some((criterion) => this.isDesignExitCriterion(criterion))) {
      return true;
    }

    return false;
  }

  async ensureInspiration(task: Task): Promise<void> {
    if (!this.enabled || !this.shouldFetch(task)) {
      return;
    }

    const metadataPath = this.getMetadataPath(task.id);
    const existing = await this.readMetadata(metadataPath);

    if (existing && await this.pathsExist(existing)) {
      logInfo('Using cached web inspiration', {
        taskId: task.id,
        url: existing.metadata?.url ?? 'cache',
        category: existing.metadata?.category,
      });
      this.operationsManager.recordWebInspiration({
        taskId: task.id,
        url: existing.metadata?.url ?? 'cache',
        success: true,
        cached: true,
        category: existing.metadata?.category
      });
      return;
    }

    const selection = await this.selectSource(task);
    if (!selection) {
      logWarning('No inspiration source matched task', { taskId: task.id });
      return;
    }

    const { url, category } = selection;
    logInfo('Fetching web inspiration', { taskId: task.id, url, category });

    const started = Date.now();
    const result = await this.fetcher.capture({
      url,
      taskId: task.id
    });

    this.logResult(task.id, result, url, category, Date.now() - started);

    if (!result.success) {
      this.operationsManager.recordWebInspiration({
        taskId: task.id,
        url,
        success: false,
        cached: false,
        durationMs: Date.now() - started,
        category
      });
      return;
    }

    const record: MetadataRecord = {
      screenshotPath: result.screenshotPath,
      htmlPath: result.htmlPath,
      metadata: {
        ...result.metadata,
        category,
        cached: result.metadata.cached ?? false
      }
    };

    await this.writeMetadata(metadataPath, record);

    this.operationsManager.recordWebInspiration({
      taskId: task.id,
      url,
      success: true,
      cached: Boolean(result.metadata.cached),
      durationMs: Date.now() - started,
      screenshotSizeKb: result.metadata.screenshotSizeKb,
      htmlSizeKb: result.metadata.htmlSizeKb,
      category
    });

    this.stateMachine.addContextEntry({
      entry_type: 'learning',
      topic: 'Design Inspiration',
      content: `Captured inspiration from ${url} (category: ${category}) for task ${task.id}. Screenshot: ${result.screenshotPath}`,
      related_tasks: [task.id],
      confidence: 0.9,
      metadata: {
        url,
        category,
        screenshot: result.screenshotPath,
        html: result.htmlPath
      }
    });
  }

  getStats(): InspirationStats[] {
    return [...this.stats];
  }

  async listAssets(options: { taskId?: string; limit?: number } = {}): Promise<InspirationAsset[]> {
    const { taskId, limit = 20 } = options;
    const baseDir = path.join(this.workspaceRoot, 'state', 'web_inspiration');

    try {
      await fs.access(baseDir);
    } catch {
      return [];
    }

    const entries = await fs.readdir(baseDir, { withFileTypes: true }).catch(() => []);
    const assets: InspirationAsset[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const currentTaskId = entry.name;
      if (taskId && currentTaskId !== taskId) continue;

      const metadata = await this.readMetadata(path.join(baseDir, currentTaskId, 'metadata.json'));
      if (!metadata) continue;

      assets.push({
        taskId: currentTaskId,
        url: metadata.metadata?.url ?? 'unknown',
        timestamp: metadata.metadata?.timestamp ?? 0,
        screenshot: metadata.screenshotPath,
        html: metadata.htmlPath,
        screenshotSizeKb: metadata.metadata?.screenshotSizeKb,
        htmlSizeKb: metadata.metadata?.htmlSizeKb,
        cached: Boolean(metadata.metadata?.cached),
        category: metadata.metadata?.category
      });
    }

    assets.sort((a, b) => b.timestamp - a.timestamp);
    return assets.slice(0, Math.max(1, limit));
  }

  private async selectSource(task: Task): Promise<{ url: string; category: string } | null> {
    const categories = await this.loadSourceCategories();
    if (categories.length === 0) {
      return null;
    }

    const text = `${task.title} ${task.description ?? ''}`.toLowerCase();
    let best: SourceCategory | undefined;
    let bestScore = 0;

    for (const category of categories) {
      let score = 0;
      for (const keyword of category.keywords) {
        if (text.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }

      if (score > bestScore && category.sources.length > 0) {
        best = category;
        bestScore = score;
      }
    }

    if (!best) {
      best = categories.find((c) => c.fallback && c.sources.length > 0) ?? categories.find((c) => c.sources.length > 0);
    }

    if (!best || best.sources.length === 0) {
      return null;
    }

    const url = best.sources[Math.floor(Math.random() * best.sources.length)];
    return { url, category: best.id };
  }

  private async loadSourceCategories(): Promise<SourceCategory[]> {
    try {
      const stat = await fs.stat(this.configPath);
      if (!this.sourceConfig || this.sourceConfig.mtimeMs !== stat.mtimeMs) {
        const raw = await fs.readFile(this.configPath, 'utf-8');
        const parsed = YAML.parse(raw) ?? {};
        const categoriesInput: unknown[] = Array.isArray(parsed.categories) ? parsed.categories : [];
        const normalized: SourceCategory[] = categoriesInput
          .map((entry) => this.normalizeCategory(entry))
          .filter((entry): entry is SourceCategory => entry !== null);

        if (normalized.length > 0) {
          this.sourceConfig = { categories: normalized, mtimeMs: stat.mtimeMs };
        }
      }
    } catch (error) {
      if (!this.sourceConfig) {
        logWarning('Web inspiration source config not found or invalid, using defaults', {
          path: this.configPath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (!this.sourceConfig) {
      this.sourceConfig = { categories: this.defaultCategories(), mtimeMs: 0 };
    }

    return this.sourceConfig.categories;
  }

  private normalizeCategory(entry: unknown): SourceCategory | null {
    if (!entry || typeof entry !== 'object') return null;
    const raw = entry as Record<string, unknown>;
    const idValue = raw.id;
    const sourcesValue = raw.sources;
    const keywordsValue = raw.keywords;

    const id = typeof idValue === 'string' && idValue.trim() ? idValue.trim() : null;
    const sources = Array.isArray(sourcesValue)
      ? sourcesValue.filter((url: unknown) => typeof url === 'string' && url.trim())
      : [];
    const keywords = Array.isArray(keywordsValue)
      ? keywordsValue.filter((kw: unknown) => typeof kw === 'string' && kw.trim())
      : [];

    if (!id || sources.length === 0) {
      return null;
    }

    return {
      id,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      keywords,
      sources,
      fallback: Boolean(raw.fallback)
    };
  }

  private defaultCategories(): SourceCategory[] {
    return [
      {
        id: 'web_design',
        description: 'Modern web and marketing experiences',
        keywords: ['landing', 'website', 'pricing', 'marketing', 'homepage', 'hero', 'cta'],
        sources: [
          'https://www.awwwards.com/websites/ui-design/',
          'https://www.awwwards.com/websites/landing-page/',
          'https://dribbble.com/shots/popular/web-design'
        ]
      },
      {
        id: 'data_visualization',
        description: 'Dashboards, analytics, data storytelling',
        keywords: ['dashboard', 'analytics', 'chart', 'graph', 'visualization', 'metrics'],
        sources: [
          'https://www.behance.net/search/projects?search=data%20visualization',
          'https://www.siteinspire.com/websites?categories=analytics',
          'https://dribbble.com/tags/dashboard'
        ]
      },
      {
        id: 'product_storytelling',
        description: 'Narrative product launches and storytelling',
        keywords: ['story', 'launch', 'campaign', 'case study', 'brand narrative'],
        sources: [
          'https://www.awwwards.com/websites/product/',
          'https://dribbble.com/tags/product_launch'
        ]
      },
      {
        id: 'hardware',
        description: 'Hardware, industrial, physical product inspiration',
        keywords: ['hardware', 'industrial', 'device', 'physical', 'equipment'],
        sources: [
          'https://www.behance.net/search/projects?search=industrial%20design',
          'https://www.behance.net/search/projects?search=hardware%20product'
        ]
      },
      {
        id: 'fallback',
        description: 'General inspiration fallback',
        keywords: [],
        sources: [
          'https://www.awwwards.com/websites/',
          'https://www.behance.net/'
        ],
        fallback: true
      }
    ];
  }

  private getKeywordHints(): string[] {
    return ['design', 'ui', 'ux', 'layout', 'visual', 'style', 'frontend', 'marketing', 'story', 'branding', 'hardware'];
  }

  private getDesignExitCriteriaHints(): string[] {
    return [
      'design_system',
      'design-system',
      'design review',
      'design_review',
      'designsystem',
      'apps/web',
      'styleguide',
      'storybook'
    ];
  }

  private getExitCriteria(task: Task): string[] {
    const collected: string[] = [];
    const push = (value: unknown) => {
      if (typeof value === 'string' && value.trim()) {
        collected.push(value.trim().toLowerCase());
      }
    };

    const metadata = task.metadata as Record<string, unknown> | undefined;
    if (metadata) {
      const metaExit = metadata['exit_criteria'] ?? metadata['exitCriteria'];
      if (Array.isArray(metaExit)) {
        metaExit.forEach(push);
      } else if (typeof metaExit === 'string') {
        push(metaExit);
      }
    }

    const taskAny = task as unknown as { exit_criteria?: unknown };
    if (Array.isArray(taskAny.exit_criteria)) {
      taskAny.exit_criteria.forEach(push);
    }

    return Array.from(new Set(collected));
  }

  private isDesignExitCriterion(value: string): boolean {
    const hints = this.getDesignExitCriteriaHints();
    return hints.some((hint) => value.includes(hint));
  }

  private getMetadataPath(taskId: string): string {
    return path.join(this.workspaceRoot, 'state', 'web_inspiration', taskId, 'metadata.json');
  }

  private async readMetadata(metadataPath: string): Promise<MetadataRecord | null> {
    try {
      const raw = await fs.readFile(metadataPath, 'utf-8');
      const parsed = JSON.parse(raw) as MetadataRecord;
      return parsed;
    } catch {
      return null;
    }
  }

  private async writeMetadata(metadataPath: string, record: MetadataRecord): Promise<void> {
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(metadataPath, JSON.stringify(record, null, 2), 'utf-8');
  }

  private async pathsExist(record: MetadataRecord): Promise<boolean> {
    if (!record) return false;
    const checks: Array<Promise<boolean>> = [];
    if (record.screenshotPath) {
      checks.push(this.pathExists(record.screenshotPath));
    }
    if (record.htmlPath) {
      checks.push(this.pathExists(record.htmlPath));
    }
    if (checks.length === 0) {
      return false;
    }
    const results = await Promise.all(checks);
    return results.every(Boolean);
  }

  private async pathExists(target: string): Promise<boolean> {
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }

  private logResult(taskId: string, result: WebInspirationResult, url: string, category: string, durationMs: number): void {
    this.stats.push({
      url,
      success: result.success,
      cached: Boolean(result.metadata.cached),
      durationMs,
      screenshotSizeKb: result.metadata.screenshotSizeKb,
      htmlSizeKb: result.metadata.htmlSizeKb,
      category
    });

    if (this.stats.length > 100) {
      this.stats.splice(0, this.stats.length - 100);
    }

    if (result.success) {
      logInfo('Web inspiration captured', {
        taskId,
        url,
        category,
        durationMs,
        screenshotPath: result.screenshotPath,
        htmlPath: result.htmlPath,
        sizeKb: (result.metadata.screenshotSizeKb ?? 0) + (result.metadata.htmlSizeKb ?? 0)
      });
    } else {
      logError('Failed to capture web inspiration', {
        taskId,
        url,
        category,
        durationMs,
        error: result.error
      });
    }
  }
}
