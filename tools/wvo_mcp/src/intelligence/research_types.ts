/**
 * Shared research type definitions used by the research manager and critic intelligence engine.
 * The current implementation is intentionally lightweight – the goal is to provide strong types
 * so consumers can evolve without runtime coupling.
 */

export interface ResearchQuery {
  topic: string;
  keywords: string[];
  domains?: string[];
  recency?: "latest" | "30d" | "90d" | "all";
}

export interface ResearchFinding {
  id: string;
  title: string;
  summary: string;
  url?: string;
  source?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface PatternMiningInput {
  problem: string;
  sources?: string[];
  filters?: Record<string, unknown>;
}

export interface PatternInsight {
  id: string;
  title: string;
  summary: string;
  url?: string;
  repository?: string;
  stars?: number;
  language?: string;
  tags?: string[];
}

export interface AlternativeRequest {
  taskId: string;
  taskTitle: string;
  contextTags?: string[];
  creativity?: "low" | "medium" | "high" | "balanced" | "conservative";
  taskDescription?: string;
}

export interface AlternativeOption {
  id: string;
  title: string;
  summary: string;
  pros?: string[];
  cons?: string[];
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface ResearchTimelineEvent {
  id: string;
  description: string;
  timestamp: string;
  relatedTasks?: string[];
}

export interface ResearchKnowledgeBaseEntry {
  key: string;
  findings: ResearchFinding[];
  updatedAt: string;
}
