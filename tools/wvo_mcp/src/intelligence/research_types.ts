export type AcademicDomain = 'arxiv' | 'scholar' | 'ssrn';

export interface ResearchQuery {
  topic: string;
  keywords?: string[];
  domains?: AcademicDomain[];
  recency?: 'latest' | '1-year' | '3-year';
}

export interface ResearchFinding {
  id: string;
  title: string;
  summary: string;
  url?: string;
  source: string;
  confidence: number;
  publishedAt?: string;
}

export interface PatternMiningInput {
  problem: string;
  sources?: string[];
  filters?: Record<string, string>;
}

export interface PatternInsight {
  id: string;
  title: string;
  repository?: string;
  url?: string;
  summary: string;
  stars?: number;
  language?: string;
}

export interface AlternativeRequest {
  taskId: string;
  taskTitle: string;
  taskDescription?: string;
  contextTags?: string[];
  creativity?: 'conservative' | 'balanced' | 'high';
}

export interface AlternativeOption {
  id: string;
  title: string;
  summary: string;
  pros: string[];
  cons: string[];
  confidence: number;
}

export interface CachedResearchSynopsis {
  topic: string;
  cacheKey: string;
  findings: ResearchFinding[];
  alternatives?: AlternativeOption[];
  patterns?: PatternInsight[];
  storedAt: number;
}
