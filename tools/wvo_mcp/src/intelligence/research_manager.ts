import { AcademicSearchClient, type AcademicSearchOptions } from './academic_search.js';
import { AlternativeGenerator, type AlternativeGeneratorOptions } from './alternative_generator.js';
import { PatternMiningClient, type PatternMiningOptions } from './pattern_mining.js';
import { ResearchCache, ResearchCacheEntry } from './research_cache.js';
import type { StateMachine } from '../orchestrator/state_machine.js';
import type {
  AlternativeOption,
  AlternativeRequest,
  PatternInsight,
  PatternMiningInput,
  ResearchFinding,
  ResearchQuery,
} from './research_types.js';

export interface ResearchManagerOptions {
  cacheTtlMs?: number;
  academicSearch?: AcademicSearchClient;
  academicSearchOptions?: AcademicSearchOptions;
  patternMining?: PatternMiningClient;
  patternMiningOptions?: PatternMiningOptions;
  alternativeGenerator?: AlternativeGenerator;
  alternativeGeneratorOptions?: AlternativeGeneratorOptions;
  stateMachine?: StateMachine;
}

/**
 * Coordinates research acquisition across academic sources,
 * industry pattern mining, and alternative generation. All heavy
 * operations remain behind a feature flag and stub implementation.
 */
export class ResearchManager {
  private readonly queryCache: ResearchCache<ResearchFinding[]>;
  private readonly patternCache: ResearchCache<PatternInsight[]>;
  private readonly alternativeCache: ResearchCache<AlternativeOption[]>;
  private readonly academicSearch: AcademicSearchClient;
  private readonly patternMining: PatternMiningClient;
  private readonly alternativeGenerator: AlternativeGenerator;
  private readonly stateMachine?: StateMachine;
  private readonly cacheTtlMs: number;

  constructor(options: ResearchManagerOptions = {}) {
    this.stateMachine = options.stateMachine;
    this.cacheTtlMs = options.cacheTtlMs ?? 90 * 24 * 60 * 60 * 1000;
    this.queryCache = new ResearchCache<ResearchFinding[]>({ ttlMs: this.cacheTtlMs });
    this.patternCache = new ResearchCache<PatternInsight[]>({ ttlMs: this.cacheTtlMs });
    this.alternativeCache = new ResearchCache<AlternativeOption[]>({ ttlMs: this.cacheTtlMs });
    this.academicSearch =
      options.academicSearch ??
      new AcademicSearchClient(options.academicSearchOptions ?? { enabled: false });
    this.patternMining =
      options.patternMining ??
      new PatternMiningClient(options.patternMiningOptions ?? { enabled: false });
    this.alternativeGenerator =
      options.alternativeGenerator ??
      new AlternativeGenerator(options.alternativeGeneratorOptions ?? { enabled: false });
  }

  async query(query: ResearchQuery): Promise<ResearchFinding[]> {
    const key = ResearchCache.createKey(['query', query]);
    const cached = this.queryCache.get(key);
    if (cached) {
      return cached.value;
    }

    const stored = this.readPersisted<ResearchFinding[]>(key);
    if (stored) {
      this.queryCache.set(key, stored);
      return stored;
    }

    const results = await this.academicSearch.search(query);
    this.queryCache.set(key, results);
    this.persist(key, results, {
      kind: 'query',
      topic: query.topic,
      keywords: query.keywords,
      domains: query.domains,
      recency: query.recency,
    });
    return results;
  }

  getCachedQuery(query: ResearchQuery): ResearchCacheEntry<ResearchFinding[]> | undefined {
    const key = ResearchCache.createKey(['query', query]);
    return this.queryCache.get(key);
  }

  async findPatterns(input: PatternMiningInput): Promise<PatternInsight[]> {
    const key = ResearchCache.createKey(['patterns', input]);
    const cached = this.patternCache.get(key);
    if (cached) {
      return cached.value;
    }

    const stored = this.readPersisted<PatternInsight[]>(key);
    if (stored) {
      this.patternCache.set(key, stored);
      return stored;
    }

    const results = await this.patternMining.findPatterns(input);
    this.patternCache.set(key, results);
    this.persist(key, results, {
      kind: 'patterns',
      problem: input.problem,
      sources: input.sources,
      filters: input.filters,
    });
    return results;
  }

  getCachedPatterns(input: PatternMiningInput): ResearchCacheEntry<PatternInsight[]> | undefined {
    const key = ResearchCache.createKey(['patterns', input]);
    return this.patternCache.get(key);
  }

  async suggestAlternatives(request: AlternativeRequest): Promise<AlternativeOption[]> {
    const key = ResearchCache.createKey(['alternatives', request]);
    const cached = this.alternativeCache.get(key);
    if (cached) {
      return cached.value;
    }

    const stored = this.readPersisted<AlternativeOption[]>(key);
    if (stored) {
      this.alternativeCache.set(key, stored);
      return stored;
    }

    const results = await this.alternativeGenerator.suggestAlternatives(request);
    this.alternativeCache.set(key, results);
    this.persist(key, results, {
      kind: 'alternatives',
      taskId: request.taskId,
      taskTitle: request.taskTitle,
      contextTags: request.contextTags,
      creativity: request.creativity,
    });
    return results;
  }

  getCachedAlternatives(
    request: AlternativeRequest,
  ): ResearchCacheEntry<AlternativeOption[]> | undefined {
    const key = ResearchCache.createKey(['alternatives', request]);
    return this.alternativeCache.get(key);
  }

  pruneCaches(): void {
    this.queryCache.prune();
    this.patternCache.prune();
    this.alternativeCache.prune();
    this.stateMachine?.pruneResearchCache();
  }

  private readPersisted<T>(cacheKey: string): T | null {
    if (!this.stateMachine) return null;
    const record = this.stateMachine.getResearchCache(cacheKey);
    if (!record) return null;
    if (record.expires_at <= Date.now()) {
      return null;
    }
    return record.payload as T;
  }

  private persist(cacheKey: string, payload: unknown, metadata: Record<string, unknown>): void {
    if (!this.stateMachine) return;
    try {
      this.stateMachine.recordResearchCache({
        cacheKey,
        payload,
        ttlMs: this.cacheTtlMs,
        metadata,
      });
    } catch (error) {
      // Persistence is best-effort; ignore failures to keep flow non-blocking.
    }
  }
}
