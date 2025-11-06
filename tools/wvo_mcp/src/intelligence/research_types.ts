export type AcademicDomain = 'arxiv' | 'scholar' | 'ssrn' | string;

export interface ResearchQuery {
  topic: string;
  keywords?: string[];
  domains?: AcademicDomain[];
  recency?: 'latest' | 'month' | 'quarter' | 'year' | 'all';
}

export interface ResearchFinding {
  id: string;
  title: string;
  summary: string;
  url?: string;
  source?: string;
  confidence?: number;
  publishedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface PatternMiningInput {
  problem: string;
  context?: string;
  sources?: string[];
  filters?: Record<string, unknown>;
}

export interface PatternInsight {
  id: string;
  title: string;
  summary: string;
  source: string;
  url?: string;
  evidence?: string[];
  tags?: string[];
  confidence?: number;
  repository?: string;
  stars?: number;
  language?: string;
  metadata?: Record<string, unknown>;
}

export interface AlternativeRequest {
  taskId: string;
  taskTitle: string;
  taskDescription?: string;
  contextTags?: string[];
  creativity?: 'conservative' | 'balanced' | 'high';
  constraints?: string[];
}

export interface AlternativeOption {
  id: string;
  title: string;
  summary: string;
  pros?: string[];
  cons?: string[];
  confidence?: number;
  effortEstimate?: string;
  metadata?: Record<string, unknown>;
}

export interface CachedResearchSynopsis {
  topic: string;
  cacheKey: string;
  findings: ResearchFinding[];
  alternatives?: AlternativeOption[];
  patterns?: PatternInsight[];
  storedAt: number;
}

export interface ResearchTriggerPayload {
  taskId: string;
  triggerType: string;
  reason?: string;
  confidence?: number;
  hints?: string[];
}
