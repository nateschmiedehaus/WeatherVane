/**
 * Knowledge Graph - Pattern Learning & Retention
 *
 * Captures, stores, and retrieves learned patterns from task execution.
 * Prevents agents from repeating mistakes and enables compound learning over time.
 *
 * Knowledge Types:
 * - DECISION: Past decisions and their outcomes
 * - PATTERN: Recurring patterns (e.g., "GAM needs 20 knots for hourly data")
 * - CONSTRAINT: Hard rules (e.g., "OAuth tokens expire after 1 hour")
 * - LEARNING: General insights (e.g., "Prefect flows need @task decorators")
 *
 * Each knowledge node has:
 * - Content: The actual insight
 * - Confidence: 0-1, based on evidence count
 * - Evidence count: How many times we've seen this pattern
 * - Last verified: When we last saw evidence for this
 * - Related tasks: Tasks that contributed to this knowledge
 *
 * Knowledge decays over time (stale knowledge loses confidence).
 * Knowledge reinforces with repeated evidence (confidence increases).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import { logInfo, logDebug, logWarning } from '../telemetry/logger.js';

import type { Task } from './state_machine.js';

export type KnowledgeType = 'decision' | 'pattern' | 'constraint' | 'learning';

export interface KnowledgeNode {
  id: string;
  type: KnowledgeType;
  content: string;
  domain?: string; // e.g., 'gam_modeling', 'oauth', 'prefect'
  relatedTasks: string[];
  relatedNodes: string[]; // IDs of related knowledge
  confidence: number; // 0-1
  evidenceCount: number;
  createdAt: Date;
  lastVerified: Date;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeEdge {
  from: string; // node ID
  to: string; // node ID
  type: 'reinforces' | 'contradicts' | 'depends_on' | 'related_to';
  weight: number; // 0-1
}

export interface TaskResult {
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
  metadata?: Record<string, unknown>;
}

export class KnowledgeGraph {
  private nodes = new Map<string, KnowledgeNode>();
  private edges: KnowledgeEdge[] = [];
  private graphFile: string;

  // Knowledge extraction patterns
  private readonly patterns = {
    decision: /decided to|chose to|selected|went with/i,
    constraint: /must|required|needs|always|never/i,
    pattern: /pattern|typically|usually|often|tends to/i,
    learning: /learned that|discovered|found that|realized/i,
  };

  constructor(private readonly workspaceRoot: string) {
    this.graphFile = path.join(workspaceRoot, 'state', 'knowledge_graph.json');
    this.loadGraph();
  }

  /**
   * Extract knowledge from a completed task
   */
  async extractKnowledge(task: Task, result: TaskResult): Promise<KnowledgeNode[]> {
    const insights: KnowledgeNode[] = [];

    // Extract from task description/title
    const textSources = [
      task.description || '',
      task.title || '',
      result.output || '',
    ].filter(s => s.length > 0);

    for (const text of textSources) {
      // Extract different types of knowledge
      const decisions = this.extractByPattern(text, 'decision', task.id);
      const constraints = this.extractByPattern(text, 'constraint', task.id);
      const patterns = this.extractByPattern(text, 'pattern', task.id);
      const learnings = this.extractByPattern(text, 'learning', task.id);

      insights.push(...decisions, ...constraints, ...patterns, ...learnings);
    }

    // Extract from failures (failures teach us a lot!)
    if (!result.success && result.error) {
      const failureInsight = this.extractFromFailure(task, result.error);
      if (failureInsight) {
        insights.push(failureInsight);
      }
    }

    // Add or reinforce knowledge
    for (const insight of insights) {
      await this.addOrReinforceKnowledge(insight);
    }

    return insights;
  }

  /**
   * Get relevant knowledge for a task
   */
  async getRelevantKnowledge(task: Task, maxResults = 10): Promise<KnowledgeNode[]> {
    const relevant: Array<{ node: KnowledgeNode; relevanceScore: number }> = [];

    const taskKeywords = this.extractKeywords(task.title + ' ' + (task.description || ''));

    for (const [id, node] of this.nodes) {
      // Skip low-confidence knowledge
      if (node.confidence < 0.5) continue;

      // Calculate relevance
      const relevance = this.calculateRelevance(node, task, taskKeywords);

      if (relevance > 0.3) {
        relevant.push({ node, relevanceScore: relevance });
      }
    }

    // Sort by relevance * confidence * recency
    relevant.sort((a, b) => {
      const scoreA = a.relevanceScore * a.node.confidence * this.getRecencyFactor(a.node);
      const scoreB = b.relevanceScore * b.node.confidence * this.getRecencyFactor(b.node);
      return scoreB - scoreA;
    });

    return relevant.slice(0, maxResults).map(r => r.node);
  }

  /**
   * Format knowledge for injection into agent context
   */
  formatForContext(nodes: KnowledgeNode[]): string {
    if (nodes.length === 0) {
      return '';
    }

    let formatted = '## Relevant Knowledge from Past Tasks\n\n';

    for (const node of nodes) {
      const confidencePercent = Math.round(node.confidence * 100);
      const evidenceText = node.evidenceCount === 1 ? '1 occurrence' : `${node.evidenceCount} occurrences`;

      formatted += `- **[${node.type.toUpperCase()}]** ${node.content}\n`;
      formatted += `  _Confidence: ${confidencePercent}% (${evidenceText})_\n\n`;
    }

    return formatted;
  }

  /**
   * Decay stale knowledge (run daily)
   */
  async decayStaleKnowledge(): Promise<number> {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;

    let decayed = 0;
    let pruned = 0;

    for (const [id, node] of this.nodes) {
      const age = now - node.lastVerified.getTime();

      // Prune knowledge not verified in 90 days
      if (age > ninetyDaysAgo) {
        this.nodes.delete(id);
        pruned++;
        continue;
      }

      // Decay confidence for knowledge not verified in 30 days
      if (age > thirtyDaysAgo) {
        const decayRate = 0.1; // Lose 10% confidence per 30 days
        node.confidence = Math.max(0.3, node.confidence * (1 - decayRate));
        decayed++;
      }
    }

    if (decayed > 0 || pruned > 0) {
      logInfo('Decayed stale knowledge', { decayed, pruned });
      await this.saveGraph();
    }

    return decayed + pruned;
  }

  /**
   * Get statistics about the knowledge graph
   */
  getStatistics(): {
    totalNodes: number;
    byType: Record<KnowledgeType, number>;
    avgConfidence: number;
    avgEvidenceCount: number;
    highConfidenceNodes: number;
  } {
    const nodes = Array.from(this.nodes.values());

    const byType: Record<KnowledgeType, number> = {
      decision: 0,
      pattern: 0,
      constraint: 0,
      learning: 0,
    };

    for (const node of nodes) {
      byType[node.type]++;
    }

    const avgConfidence = nodes.reduce((sum, n) => sum + n.confidence, 0) / (nodes.length || 1);
    const avgEvidenceCount = nodes.reduce((sum, n) => sum + n.evidenceCount, 0) / (nodes.length || 1);
    const highConfidenceNodes = nodes.filter(n => n.confidence > 0.8).length;

    return {
      totalNodes: nodes.length,
      byType,
      avgConfidence,
      avgEvidenceCount,
      highConfidenceNodes,
    };
  }

  // ==================== Private Methods ====================

  private extractByPattern(text: string, type: KnowledgeType, taskId: string): KnowledgeNode[] {
    const pattern = this.patterns[type];
    if (!pattern.test(text)) {
      return [];
    }

    // Split into sentences
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const insights: KnowledgeNode[] = [];

    for (const sentence of sentences) {
      if (pattern.test(sentence)) {
        const content = sentence.trim();
        const id = this.generateId(content);

        insights.push({
          id,
          type,
          content,
          domain: this.inferDomain(content),
          relatedTasks: [taskId],
          relatedNodes: [],
          confidence: 0.7, // Initial confidence
          evidenceCount: 1,
          createdAt: new Date(),
          lastVerified: new Date(),
        });
      }
    }

    return insights;
  }

  private extractFromFailure(task: Task, error: string): KnowledgeNode | null {
    // Extract actionable knowledge from failures
    // E.g., "Task failed because OAuth token expired" → constraint
    const content = `Task type "${task.title}" failed with: ${error.slice(0, 200)}`;
    const id = this.generateId(content);

    return {
      id,
      type: 'constraint',
      content,
      domain: this.inferDomain(task.title + ' ' + error),
      relatedTasks: [task.id],
      relatedNodes: [],
      confidence: 0.6, // Slightly lower confidence for failure-derived knowledge
      evidenceCount: 1,
      createdAt: new Date(),
      lastVerified: new Date(),
      metadata: { derived_from_failure: true },
    };
  }

  private async addOrReinforceKnowledge(insight: KnowledgeNode): Promise<void> {
    const existing = this.nodes.get(insight.id);

    if (existing) {
      // Reinforce existing knowledge
      existing.evidenceCount++;
      existing.confidence = Math.min(1.0, existing.confidence + 0.05);
      existing.lastVerified = new Date();
      if (!existing.relatedTasks.includes(insight.relatedTasks[0])) {
        existing.relatedTasks.push(insight.relatedTasks[0]);
      }

      logDebug('Reinforced existing knowledge', {
        id: existing.id,
        confidence: existing.confidence,
        evidenceCount: existing.evidenceCount,
      });
    } else {
      // Add new knowledge
      this.nodes.set(insight.id, insight);

      logDebug('Added new knowledge', {
        id: insight.id,
        type: insight.type,
        content: insight.content.slice(0, 100),
      });
    }
  }

  private calculateRelevance(node: KnowledgeNode, task: Task, taskKeywords: Set<string>): number {
    let relevance = 0;

    // Keyword overlap
    const nodeKeywords = this.extractKeywords(node.content);
    const overlap = this.setIntersection(nodeKeywords, taskKeywords);
    relevance += overlap.size / Math.max(nodeKeywords.size, taskKeywords.size);

    // Domain match
    if (node.domain && task.metadata?.domain === node.domain) {
      relevance += 0.3;
    }

    // Note: Could enhance relevance with dependency overlap if needed
    // For now, rely on keyword overlap and domain matching

    return Math.min(1.0, relevance);
  }

  private extractKeywords(text: string): Set<string> {
    // Simple keyword extraction (could use TF-IDF or embeddings)
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3); // Filter short words

    // Remove common stop words
    const stopWords = new Set(['this', 'that', 'with', 'from', 'have', 'been', 'were', 'will']);
    return new Set(words.filter(w => !stopWords.has(w)));
  }

  private setIntersection<T>(a: Set<T>, b: Set<T>): Set<T> {
    return new Set([...a].filter(x => b.has(x)));
  }

  private getRecencyFactor(node: KnowledgeNode): number {
    const ageDays = (Date.now() - node.lastVerified.getTime()) / (1000 * 60 * 60 * 24);
    // Decay factor: 1.0 at day 0, 0.5 at day 30, 0.25 at day 60
    return Math.max(0.1, 1.0 / (1 + ageDays / 30));
  }

  private inferDomain(text: string): string | undefined {
    const domains: Record<string, RegExp> = {
      gam_modeling: /gam|generalized additive|knots|spline/i,
      oauth: /oauth|token|authentication|refresh/i,
      prefect: /prefect|flow|task|workflow/i,
      shopify: /shopify|product|order|metafield/i,
      weather: /weather|forecast|temperature|precipitation/i,
      testing: /test|jest|pytest|assertion/i,
    };

    for (const [domain, pattern] of Object.entries(domains)) {
      if (pattern.test(text)) {
        return domain;
      }
    }

    return undefined;
  }

  private generateId(content: string): string {
    // Simple hash function for generating IDs
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `knowledge-${Math.abs(hash).toString(36)}`;
  }

  private loadGraph(): void {
    try {
      if (existsSync(this.graphFile)) {
        const data = readFileSync(this.graphFile, 'utf-8');
        const parsed = JSON.parse(data);

        // Rehydrate nodes
        if (parsed.nodes) {
          for (const [id, node] of Object.entries(parsed.nodes)) {
            const n = node as KnowledgeNode;
            n.createdAt = new Date(n.createdAt);
            n.lastVerified = new Date(n.lastVerified);
            this.nodes.set(id, n);
          }
        }

        // Rehydrate edges
        if (parsed.edges) {
          this.edges = parsed.edges;
        }

        logInfo('Loaded knowledge graph', {
          nodes: this.nodes.size,
          edges: this.edges.length,
          file: this.graphFile,
        });
      }
    } catch (error) {
      logWarning('Failed to load knowledge graph, starting fresh', {
        error: (error as Error).message,
      });
    }
  }

  private async saveGraph(): Promise<void> {
    try {
      // Convert Map to plain object
      const nodesObj: Record<string, KnowledgeNode> = {};
      for (const [id, node] of this.nodes) {
        nodesObj[id] = node;
      }

      const data = {
        nodes: nodesObj,
        edges: this.edges,
        savedAt: new Date().toISOString(),
      };

      writeFileSync(this.graphFile, JSON.stringify(data, null, 2), 'utf-8');

      logInfo('Saved knowledge graph', {
        nodes: this.nodes.size,
        edges: this.edges.length,
        file: this.graphFile,
      });
    } catch (error) {
      logWarning('Failed to save knowledge graph', {
        error: (error as Error).message,
      });
    }
  }
}
