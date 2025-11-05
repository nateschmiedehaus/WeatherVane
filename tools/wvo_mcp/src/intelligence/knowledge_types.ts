/**
 * Type definitions for the Knowledge Infrastructure system.
 *
 * This module defines the core data structures for semantic understanding,
 * call graphs, and knowledge queries.
 */

/**
 * Represents a function or method with semantic understanding.
 */
export interface FunctionKnowledge {
  /** Unique identifier (file:function format) */
  id: string;

  /** File path relative to workspace root */
  filePath: string;

  /** Function name */
  name: string;

  /** LLM-generated semantic description of what this function DOES */
  purpose: string;

  /** Confidence score for semantic understanding (0-1) */
  confidence: number;

  /** Cyclomatic complexity */
  complexity: number;

  /** Test coverage percentage (0-100) */
  coverage: number;

  /** Last time this knowledge was extracted */
  lastUpdated: string;

  /** Git SHA when this knowledge was extracted */
  gitSha: string;
}

/**
 * Represents a function call relationship.
 */
export interface CallGraphEdge {
  /** Function making the call (caller ID) */
  from: string;

  /** Function being called (callee ID) */
  to: string;

  /** File where the call occurs */
  filePath: string;

  /** Line number of the call */
  lineNumber: number;
}

/**
 * Query context for knowledge lookups.
 */
export interface QueryContext {
  /** Current task ID (for contextual ranking) */
  taskId?: string;

  /** Files currently being worked on (for relevance boosting) */
  activeFiles?: string[];

  /** Query type hint */
  type?: 'location' | 'semantic' | 'impact' | 'usage' | 'pattern';

  /** Maximum number of results */
  limit?: number;
}

/**
 * Result of a knowledge query.
 */
export interface KnowledgeResult {
  /** Whether the query was answered successfully */
  success: boolean;

  /** Query answer (if successful) */
  answer?: string;

  /** Supporting evidence (function IDs, file paths, etc.) */
  evidence?: KnowledgeEvidence[];

  /** Confidence score (0-1) */
  confidence: number;

  /** Whether this required fallback to traditional file search */
  fallback: boolean;

  /** Error message (if failed) */
  error?: string;
}

/**
 * Evidence supporting a knowledge query answer.
 */
export interface KnowledgeEvidence {
  /** Type of evidence */
  type: 'function' | 'file' | 'module' | 'pattern';

  /** Identifier (function ID, file path, etc.) */
  id: string;

  /** Human-readable description */
  description: string;

  /** Relevance score (0-1) */
  relevance: number;

  /** File path (if applicable) */
  filePath?: string;

  /** Line number (if applicable) */
  lineNumber?: number;
}

/**
 * Module-level knowledge (architectural understanding).
 */
export interface ModuleKnowledge {
  /** Module path (directory path) */
  path: string;

  /** LLM-generated description of module purpose */
  purpose: string;

  /** Primary responsibilities */
  responsibilities: string[];

  /** Key patterns used in this module */
  patterns: string[];

  /** Dependencies on other modules */
  dependencies: string[];
}

/**
 * Pattern knowledge (reusable solution structures).
 */
export interface PatternKnowledge {
  /** Pattern name */
  name: string;

  /** Description of when to use this pattern */
  useCase: string;

  /** Example implementations (file:line references) */
  examples: string[];

  /** Success metrics (usage count, bug rate, etc.) */
  fitness: {
    usageCount: number;
    bugRate: number;
    lastUsed: string;
  };
}

/**
 * Historical decision knowledge.
 */
export interface DecisionKnowledge {
  /** Unique identifier */
  id: string;

  /** Question or problem addressed */
  question: string;

  /** Decision made */
  decision: string;

  /** Rationale/justification */
  rationale: string;

  /** Code locations affected by this decision */
  codeLocations: string[];

  /** Alternative approaches considered */
  alternatives: string[];

  /** When this decision was made */
  timestamp: string;

  /** Task ID where decision was made */
  taskId?: string;
}

/**
 * Extraction metadata (logged for analytics).
 */
export interface ExtractionLog {
  /** Timestamp of extraction */
  timestamp: string;

  /** Git SHA being extracted */
  gitSha: string;

  /** Number of functions extracted */
  functionsExtracted: number;

  /** Number of call graph edges extracted */
  edgesExtracted: number;

  /** Extraction duration (ms) */
  durationMs: number;

  /** Whether extraction succeeded */
  success: boolean;

  /** Error message (if failed) */
  error?: string;
}

/**
 * Query analytics (logged for improving query understanding).
 */
export interface QueryLog {
  /** Timestamp of query */
  timestamp: string;

  /** Original query string */
  query: string;

  /** Query context */
  context?: QueryContext;

  /** Whether query was answered */
  answered: boolean;

  /** Whether fallback was used */
  fallback: boolean;

  /** Query latency (ms) */
  latencyMs: number;

  /** Task ID (if applicable) */
  taskId?: string;
}
