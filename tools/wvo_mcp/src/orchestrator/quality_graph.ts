/**
 * Quality Graph Implementation
 *
 * Represents task execution as a directed acyclic graph with quality vectors
 * at each node, enabling multi-dimensional quality assessment and pattern learning.
 */

import { Task, WorkPhase } from './state_machine.js';
import { ModelRouter } from './model_router.js';
import { logInfo, logWarning } from '../telemetry/logger.js';

// 512-dimensional quality vector
type QualityVector = Float32Array;

interface PhaseNode {
  id: string;
  phase: WorkPhase;
  taskId: string;
  status: 'pending' | 'in_progress' | 'complete' | 'failed';
  qualityVector?: QualityVector;
  evidence: Evidence[];
  timestamp: number;
  confidence: number;
}

interface QualityEdge {
  id: string;
  from: string;
  to: string;
  weight: number; // Quality signal strength
  transitionQuality: number; // How well the transition was executed
  requiredEvidence: string[];
}

interface Evidence {
  type: 'test' | 'build' | 'coverage' | 'review' | 'metric';
  value: any;
  confidence: number;
  source: string;
}

interface WorkGraph {
  taskId: string;
  nodes: Map<string, PhaseNode>;
  edges: Map<string, QualityEdge>;
  currentPhase: string | null;
  overallQuality: QualityVector;
}

interface QualityDimensions {
  // Core dimensions (0-127)
  completeness: [number, number];  // [start_idx, end_idx]
  correctness: [number, number];
  coverage: [number, number];
  consistency: [number, number];

  // Technical dimensions (128-255)
  performance: [number, number];
  security: [number, number];
  maintainability: [number, number];
  scalability: [number, number];

  // Process dimensions (256-383)
  evidenceStrength: [number, number];
  peerAgreement: [number, number];
  historicalMatch: [number, number];
  riskMitigation: [number, number];

  // Semantic dimensions (384-511)
  intentAlignment: [number, number];
  purposeConnection: [number, number];
  acceptanceCriteria: [number, number];
  businessValue: [number, number];
}

const QUALITY_DIMENSIONS: QualityDimensions = {
  completeness: [0, 31],
  correctness: [32, 63],
  coverage: [64, 95],
  consistency: [96, 127],
  performance: [128, 159],
  security: [160, 191],
  maintainability: [192, 223],
  scalability: [224, 255],
  evidenceStrength: [256, 287],
  peerAgreement: [288, 319],
  historicalMatch: [320, 351],
  riskMitigation: [352, 383],
  intentAlignment: [384, 415],
  purposeConnection: [416, 447],
  acceptanceCriteria: [448, 479],
  businessValue: [480, 511]
};

/**
 * Quality Graph Enforcer
 *
 * Builds and analyzes quality graphs for task execution,
 * comparing against historical patterns to predict and prevent issues.
 */
export class QualityGraphEnforcer {
  private currentGraphs: Map<string, WorkGraph> = new Map();
  private historicalPatterns: WorkGraph[] = [];
  private modelRouter: ModelRouter;

  constructor(modelRouter: ModelRouter) {
    this.modelRouter = modelRouter;
    this.loadHistoricalPatterns();
  }

  /**
   * Initialize a new quality graph for a task
   */
  initializeGraph(task: Task): WorkGraph {
    const graph: WorkGraph = {
      taskId: task.id,
      nodes: new Map(),
      edges: new Map(),
      currentPhase: null,
      overallQuality: new Float32Array(512)
    };

    // Create nodes for each phase
    const phases: WorkPhase[] = [
      'STRATEGIZE', 'SPEC', 'PLAN', 'THINK',
      'IMPLEMENT', 'VERIFY', 'REVIEW', 'PR', 'MONITOR'
    ];

    phases.forEach((phase, idx) => {
      const nodeId = `${task.id}-${phase}`;
      graph.nodes.set(nodeId, {
        id: nodeId,
        phase,
        taskId: task.id,
        status: 'pending',
        evidence: [],
        timestamp: 0,
        confidence: 0
      });

      // Create edges between sequential phases
      if (idx > 0) {
        const prevNodeId = `${task.id}-${phases[idx - 1]}`;
        const edgeId = `${prevNodeId}->${nodeId}`;
        graph.edges.set(edgeId, {
          id: edgeId,
          from: prevNodeId,
          to: nodeId,
          weight: 1.0,
          transitionQuality: 0,
          requiredEvidence: this.getRequiredEvidence(phases[idx - 1])
        });
      }
    });

    this.currentGraphs.set(task.id, graph);
    return graph;
  }

  /**
   * Update phase with quality vector
   */
  async updatePhaseQuality(
    taskId: string,
    phase: WorkPhase,
    evidence: Evidence[]
  ): Promise<QualityVector> {
    const graph = this.currentGraphs.get(taskId);
    if (!graph) throw new Error(`No graph for task ${taskId}`);

    const nodeId = `${taskId}-${phase}`;
    const node = graph.nodes.get(nodeId);
    if (!node) throw new Error(`No node for phase ${phase}`);

    // Compute quality vector using multiple models
    const qualityVector = await this.computeQualityVector(node, evidence);

    node.qualityVector = qualityVector;
    node.evidence = evidence;
    node.status = 'complete';
    node.timestamp = Date.now();
    node.confidence = this.calculateConfidence(evidence);

    // Update overall graph quality
    this.updateOverallQuality(graph);

    // Check for quality issues
    const issues = await this.detectQualityIssues(graph, node);
    if (issues.length > 0) {
      logWarning('Quality issues detected', {
        taskId,
        phase,
        issues,
        qualityScore: this.getQualityScore(qualityVector)
      });
    }

    return qualityVector;
  }

  /**
   * Compute quality vector using multi-model consensus
   */
  private async computeQualityVector(
    node: PhaseNode,
    evidence: Evidence[]
  ): Promise<QualityVector> {
    const vector = new Float32Array(512);

    // Different models evaluate different dimensions
    const assessments = await Promise.all([
      // gpt-5-high for semantic dimensions
      this.assessSemanticQuality(node, evidence),

      // gpt-5-medium for technical dimensions
      this.assessTechnicalQuality(node, evidence),

      // Deterministic validators for core dimensions
      this.assessCoreQuality(node, evidence),

      // Historical pattern matching for process dimensions
      this.assessProcessQuality(node, evidence)
    ]);

    // Aggregate assessments into final vector
    this.aggregateAssessments(vector, assessments);

    return vector;
  }

  /**
   * Assess semantic quality using gpt-5-high
   */
  private async assessSemanticQuality(
    node: PhaseNode,
    evidence: Evidence[]
  ): Promise<Partial<QualityVector>> {
    const model = 'gpt-5-high'; // For deep semantic understanding

    const assessment = new Float32Array(128); // Dimensions 384-511

    // Assess intent alignment
    const intentScore = await this.assessDimension(
      model,
      node,
      evidence,
      'How well does this phase align with the original task intent?'
    );
    this.fillDimension(assessment, 0, 31, intentScore);

    // Assess purpose connection
    const purposeScore = await this.assessDimension(
      model,
      node,
      evidence,
      'How strongly connected is this to the WeatherVane <5% error purpose?'
    );
    this.fillDimension(assessment, 32, 63, purposeScore);

    // Assess acceptance criteria
    const acceptanceScore = await this.assessDimension(
      model,
      node,
      evidence,
      'How well are acceptance criteria being met?'
    );
    this.fillDimension(assessment, 64, 95, acceptanceScore);

    // Assess business value
    const valueScore = await this.assessDimension(
      model,
      node,
      evidence,
      'What is the business value delivered by this phase?'
    );
    this.fillDimension(assessment, 96, 127, valueScore);

    return assessment;
  }

  /**
   * Find similar historical patterns
   */
  findSimilarPatterns(currentGraph: WorkGraph): WorkGraph[] {
    const similar: Array<{graph: WorkGraph, similarity: number}> = [];

    for (const historical of this.historicalPatterns) {
      const similarity = this.calculateGraphSimilarity(currentGraph, historical);
      if (similarity > 0.7) { // 70% similarity threshold
        similar.push({ graph: historical, similarity });
      }
    }

    // Sort by similarity
    similar.sort((a, b) => b.similarity - a.similarity);

    return similar.slice(0, 5).map(s => s.graph);
  }

  /**
   * Calculate similarity between two graphs
   */
  private calculateGraphSimilarity(g1: WorkGraph, g2: WorkGraph): number {
    let totalSimilarity = 0;
    let nodeCount = 0;

    // Compare quality vectors of completed nodes
    for (const [nodeId, node1] of g1.nodes) {
      if (node1.status === 'complete' && node1.qualityVector) {
        const phase = node1.phase;
        const node2Id = `${g2.taskId}-${phase}`;
        const node2 = g2.nodes.get(node2Id);

        if (node2?.qualityVector) {
          const similarity = this.cosineSimilarity(
            node1.qualityVector,
            node2.qualityVector
          );
          totalSimilarity += similarity;
          nodeCount++;
        }
      }
    }

    return nodeCount > 0 ? totalSimilarity / nodeCount : 0;
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(v1: QualityVector, v2: QualityVector): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < v1.length; i++) {
      dotProduct += v1[i] * v2[i];
      norm1 += v1[i] * v1[i];
      norm2 += v2[i] * v2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    return norm1 === 0 || norm2 === 0 ? 0 : dotProduct / (norm1 * norm2);
  }

  /**
   * Detect quality issues by comparing against patterns
   */
  private async detectQualityIssues(
    graph: WorkGraph,
    node: PhaseNode
  ): Promise<string[]> {
    const issues: string[] = [];

    if (!node.qualityVector) return issues;

    // Find similar historical patterns
    const similar = this.findSimilarPatterns(graph);

    if (similar.length === 0) {
      issues.push('No similar successful patterns found - high risk');
      return issues;
    }

    // Calculate divergence from successful patterns
    const divergences: number[] = [];
    for (const pattern of similar) {
      const patternNode = pattern.nodes.get(`${pattern.taskId}-${node.phase}`);
      if (patternNode?.qualityVector) {
        const divergence = 1 - this.cosineSimilarity(
          node.qualityVector,
          patternNode.qualityVector
        );
        divergences.push(divergence);
      }
    }

    const avgDivergence = divergences.reduce((a, b) => a + b, 0) / divergences.length;

    if (avgDivergence > 0.3) {
      issues.push(`High divergence from successful patterns: ${(avgDivergence * 100).toFixed(1)}%`);
    }

    // Check specific quality dimensions
    const score = this.getQualityScore(node.qualityVector);
    if (score.completeness < 0.7) {
      issues.push(`Low completeness score: ${(score.completeness * 100).toFixed(1)}%`);
    }
    if (score.correctness < 0.8) {
      issues.push(`Low correctness score: ${(score.correctness * 100).toFixed(1)}%`);
    }
    if (score.evidenceStrength < 0.6) {
      issues.push(`Weak evidence: ${(score.evidenceStrength * 100).toFixed(1)}%`);
    }

    return issues;
  }

  /**
   * Get quality scores from vector
   */
  private getQualityScore(vector: QualityVector): Record<string, number> {
    const scores: Record<string, number> = {};

    for (const [dimension, [start, end]] of Object.entries(QUALITY_DIMENSIONS)) {
      let sum = 0;
      for (let i = start; i <= end; i++) {
        sum += vector[i];
      }
      scores[dimension] = sum / (end - start + 1);
    }

    return scores;
  }

  /**
   * Update overall graph quality
   */
  private updateOverallQuality(graph: WorkGraph): void {
    const completedNodes = Array.from(graph.nodes.values())
      .filter(n => n.status === 'complete' && n.qualityVector);

    if (completedNodes.length === 0) return;

    // Average quality vectors of completed nodes
    const overall = new Float32Array(512);
    for (const node of completedNodes) {
      for (let i = 0; i < 512; i++) {
        overall[i] += node.qualityVector![i];
      }
    }

    for (let i = 0; i < 512; i++) {
      overall[i] /= completedNodes.length;
    }

    graph.overallQuality = overall;
  }

  /**
   * Get required evidence for phase transition
   */
  private getRequiredEvidence(phase: WorkPhase): string[] {
    const requirements: Record<WorkPhase, string[]> = {
      'STRATEGIZE': ['problem_identified', 'approach_selected'],
      'SPEC': ['acceptance_criteria', 'success_metrics'],
      'PLAN': ['task_breakdown', 'time_estimates'],
      'THINK': ['risks_analyzed', 'edge_cases_considered'],
      'IMPLEMENT': ['code_written', 'tests_updated'],
      'VERIFY': ['tests_passing', 'build_success', 'coverage_met'],
      'REVIEW': ['peer_reviewed', 'feedback_addressed'],
      'PR': ['pr_created', 'evidence_attached'],
      'MONITOR': ['metrics_tracked', 'success_validated']
    };

    return requirements[phase] || [];
  }

  /**
   * Helper methods for vector operations
   */
  private fillDimension(
    vector: Float32Array,
    start: number,
    end: number,
    value: number
  ): void {
    for (let i = start; i <= end; i++) {
      vector[i] = value;
    }
  }

  private calculateConfidence(evidence: Evidence[]): number {
    if (evidence.length === 0) return 0;

    const totalConfidence = evidence.reduce((sum, e) => sum + e.confidence, 0);
    return totalConfidence / evidence.length;
  }

  private async assessDimension(
    model: string,
    node: PhaseNode,
    evidence: Evidence[],
    prompt: string
  ): Promise<number> {
    // This would call the actual model
    // For now, return a simulated score based on evidence
    const hasEvidence = evidence.length > 0;
    const avgConfidence = this.calculateConfidence(evidence);

    return hasEvidence ? avgConfidence : 0.5;
  }

  private assessTechnicalQuality(
    node: PhaseNode,
    evidence: Evidence[]
  ): Promise<Float32Array> {
    // Technical assessment implementation
    return Promise.resolve(new Float32Array(128));
  }

  private assessCoreQuality(
    node: PhaseNode,
    evidence: Evidence[]
  ): Promise<Float32Array> {
    // Core quality assessment
    return Promise.resolve(new Float32Array(128));
  }

  private assessProcessQuality(
    node: PhaseNode,
    evidence: Evidence[]
  ): Promise<Float32Array> {
    // Process quality assessment
    return Promise.resolve(new Float32Array(128));
  }

  private aggregateAssessments(
    target: Float32Array,
    assessments: Float32Array[]
  ): void {
    // Aggregate multiple assessments into final vector
    for (const assessment of assessments) {
      for (let i = 0; i < assessment.length; i++) {
        target[i] = (target[i] + assessment[i]) / 2;
      }
    }
  }

  private loadHistoricalPatterns(): void {
    // Load successful task patterns from storage
    // This would connect to a database or file system
    logInfo('Loading historical quality patterns');
  }
}

/**
 * Quality Graph Predictor
 *
 * Uses patterns to predict quality issues before they occur
 */
export class QualityPredictor {
  private patterns: Map<string, WorkGraph> = new Map();

  /**
   * Predict quality issues for remaining phases
   */
  async predictIssues(graph: WorkGraph): Promise<PredictedIssue[]> {
    const issues: PredictedIssue[] = [];

    // Find similar patterns
    const enforcer = new QualityGraphEnforcer(new ModelRouter());
    const similar = enforcer.findSimilarPatterns(graph);

    if (similar.length === 0) {
      issues.push({
        phase: 'GENERAL',
        issue: 'No similar patterns - unpredictable quality',
        probability: 0.8,
        impact: 'high'
      });
      return issues;
    }

    // Analyze how similar tasks failed or succeeded
    for (const pattern of similar) {
      const patternIssues = this.extractPatternIssues(pattern);
      issues.push(...patternIssues);
    }

    return this.deduplicateAndRank(issues);
  }

  private extractPatternIssues(pattern: WorkGraph): PredictedIssue[] {
    // Extract issues from historical pattern
    return [];
  }

  private deduplicateAndRank(issues: PredictedIssue[]): PredictedIssue[] {
    // Remove duplicates and rank by probability * impact
    return issues;
  }
}

interface PredictedIssue {
  phase: WorkPhase | 'GENERAL';
  issue: string;
  probability: number;
  impact: 'low' | 'medium' | 'high';
}

/**
 * Export for use in orchestrator
 */
export { WorkGraph, PhaseNode, QualityVector, Evidence };