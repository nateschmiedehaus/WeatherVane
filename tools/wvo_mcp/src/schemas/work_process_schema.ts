/**
 * Work Process Schema - Hierarchical Work Processes with Meta-Review
 *
 * Defines TypeScript types for:
 * - Hierarchical work processes (task set, epic)
 * - Meta-review and self-improvement
 * - Process effectiveness metrics
 * - Template evolution
 * - Roadmap mutations
 * - Remediation tasks
 *
 * Task: AFP-HIERARCHICAL-WORK-PROCESSES-20251105
 * Pattern: hierarchical-work-process-with-meta-review
 */

// ============================================================================
// Core Work Process Types
// ============================================================================

/**
 * Work process types at different organizational levels
 */
export type WorkProcessType = 'task' | 'task_set' | 'epic' | 'meta_process';

/**
 * Task Set Work Process (6 phases)
 * Purpose: Ensure tasks collectively achieve objectives
 */
export interface TaskSetWorkProcess {
  id: string;
  type: 'task_set';
  taskSetId: string;
  timestamp: number;

  phases: {
    ASSESS: TaskSetAssessment;
    VALIDATE: TaskSetValidation;
    VIA_NEGATIVA: TaskSetViaNegativa;
    OPTIMIZE: TaskSetOptimization;
    DOCUMENT: TaskSetDocumentation;
    META_REVIEW: MetaReviewResult;
  };

  output: {
    healthReport: TaskSetHealthReport;
    proposedMutations: RoadmapMutation[];
    effectivenessMetrics: ProcessEffectivenessMetrics;
    remediationTasks: RemediationTask[];
  };
}

export interface TaskSetAssessment {
  tasks: {
    id: string;
    status: 'pending' | 'in_progress' | 'blocked' | 'done';
  }[];
  dependenciesValid: boolean;
  missingDependencies: string[];
  cyclesDetected: boolean;
}

export interface TaskSetValidation {
  goalAchieved: boolean;
  redundantTasks: string[];
  misalignedTasks: string[];
  coherenceScore: number; // 0-100
}

export interface TaskSetViaNegativa {
  tasksToDelete: string[];
  tasksToMerge: Array<{ target: string; mergeWith: string[] }>;
  justifications: Record<string, string>;
}

export interface TaskSetOptimization {
  reorderingNeeded: boolean;
  newOrdering?: string[];
  tasksToAdd: Array<{ title: string; reason: string }>;
}

export interface TaskSetDocumentation {
  mutationsProposed: number;
  decisionsRecorded: number;
  evidenceLinks: string[];
}

export interface TaskSetHealthReport {
  status: 'healthy' | 'needs_attention' | 'critical';
  issues: string[];
  metrics: {
    taskCompletionRate: number;
    coherenceScore: number;
    dependencyHealth: number;
  };
}

/**
 * Epic Work Process (7 phases)
 * Purpose: Validate epic solves right problem, ROI > 10×
 */
export interface EpicWorkProcess {
  id: string;
  type: 'epic';
  epicId: string;
  timestamp: number;

  phases: {
    STRATEGIZE: EpicStrategize;
    ALTERNATIVES: EpicAlternatives;
    ROI: EpicROI;
    VIA_NEGATIVA: EpicViaNegativa;
    STRUCTURE: EpicStructure;
    DOCUMENT: EpicDocumentation;
    META_REVIEW: MetaReviewResult;
  };

  output: {
    healthReport: EpicHealthReport;
    structuralRecommendations: string[];
    effectivenessMetrics: ProcessEffectivenessMetrics;
    remediationTasks: RemediationTask[];
  };
}

export interface EpicStrategize {
  rootProblemValidated: boolean;
  symptomOnly: boolean;
  strategicAlignment: 'high' | 'medium' | 'low';
  alignment: string;
}

export interface EpicAlternatives {
  alternativesConsidered: number;
  alternatives: Array<{
    approach: string;
    pros: string[];
    cons: string[];
    roiEstimate: number;
  }>;
  canAchieveWithoutEpic: boolean;
}

export interface EpicROI {
  costLOC: number;
  costTime: number;
  costComplexity: number;
  benefitMetrics: string[];
  benefitImpact: string;
  roiRatio: number;
  meetsThreshold: boolean; // > 10×
}

export interface EpicViaNegativa {
  taskSetsToDelete: string[];
  epicsToMerge: string[];
  justifications: Record<string, string>;
}

export interface EpicStructure {
  taskSetsCoherent: boolean;
  granularityCorrect: boolean;
  restructuringNeeded: boolean;
  proposedStructure?: any;
}

export interface EpicDocumentation {
  mutationsProposed: number;
  strategicAnalysisRecorded: boolean;
  evidenceLinks: string[];
}

export interface EpicHealthReport {
  status: 'healthy' | 'needs_attention' | 'critical';
  strategicAlignment: 'high' | 'medium' | 'low';
  roiValid: boolean;
  issues: string[];
}

// ============================================================================
// Meta-Review Types
// ============================================================================

/**
 * Meta-review runs automatically after each process execution
 * Identifies flaws, creates remediation tasks
 */
export interface MetaReviewResult {
  processType: WorkProcessType;
  executionId: string;
  timestamp: number;

  // Effectiveness metrics
  metrics: {
    issuesFound: number;
    falsePositives: number;
    missedIssues: number; // discovered later
    executionTime: number; // seconds
    coverageScore: number; // 0-100
  };

  // Phase analysis
  phaseBreakdown: Record<string, number>; // phase name -> time (seconds)
  phasesExecuted: string[];
  phasesSkipped: string[];

  // Flaw detection
  flaws: ProcessFlaw[];

  // Remediation
  remediationNeeded: boolean;
  remediationTasks: RemediationTask[];

  // Self-assessment
  effectivenessScore: number; // 0-100
  improvementSuggestions: string[];
}

export interface ProcessFlaw {
  type: 'effectiveness' | 'efficiency' | 'coverage' | 'template_design' | 'adoption';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: string; // What data shows this is a flaw?
  suggestedFix: string;
  phase?: string; // Which phase is flawed?
}

export interface RemediationTask {
  id: string;
  type: 'fix_task' | 'restructure_set' | 'improve_process';
  description: string;
  priority: 'high' | 'critical';
  mustExecuteBefore: string; // "Next process execution"
  createdBy: string; // Process execution ID
  createdAt: number;
  status: 'pending' | 'in_progress' | 'done';
}

/**
 * Milestone Meta-Review (periodic deep analysis)
 * Runs every 10 task sets or at epic completion
 */
export interface MilestoneMetaReview {
  processType: WorkProcessType;
  reviewPeriod: {
    start: number;
    end: number;
  };
  executionsAnalyzed: number;

  // Aggregate metrics
  averageMetrics: {
    executionTime: number;
    issuesFound: number;
    falsePositives: number;
    coverageScore: number;
  };

  // Pattern analysis
  patterns: {
    commonFlaws: ProcessFlaw[];
    ineffectivePhases: string[];
    missingCoverage: string[];
  };

  // Template improvement proposals
  templateChanges: TemplateChange[];

  // Comparison to previous version
  comparedToVersion: string;
  improvement: Record<string, number>; // metric -> % change
}

export interface TemplateChange {
  type: 'add_phase' | 'remove_phase' | 'modify_phase' | 'reorder_phases';
  phase: string;
  justification: string;
  expectedImprovement: Record<string, number>; // metric -> expected % improvement
  abTestingPlan?: ABTestConfig;
}

// ============================================================================
// Process Effectiveness Metrics
// ============================================================================

export interface ProcessEffectivenessMetrics {
  processType: WorkProcessType;
  executionId: string;
  timestamp: number;

  effectiveness: {
    issuesFoundRate: number;
    falsePositiveRate: number;
    coverageScore: number;
  };

  efficiency: {
    executionTime: number;
    automationRate: number;
  };

  adoption: {
    executionCount: number;
    skipRate: number;
  };

  overall: {
    score: number; // Weighted average (0-100)
  };
}

/**
 * Metrics definitions for each process type
 */
export interface ProcessMetricsDefinition {
  processType: WorkProcessType;

  metrics: {
    [metricName: string]: {
      definition: string;
      target: string;
      measurement: string;
      weight: number; // For overall score calculation
    };
  };
}

// ============================================================================
// Template Evolution Types
// ============================================================================

export interface WorkProcessTemplate {
  id: string;
  type: WorkProcessType;
  version: string; // "1.0.0", "1.1.0", etc.

  phases: {
    name: string;
    description: string;
    requiredOutputs: string[];
    estimatedTime: number; // seconds
  }[];

  metadata: {
    createdAt: number;
    lastModified: number;
    executionCount: number;
    effectivenessScore: number;
  };
}

export interface TemplateEvolution {
  templateId: string;
  versions: WorkProcessTemplate[];
  currentVersion: string;

  evolution: {
    date: number;
    fromVersion: string;
    toVersion: string;
    changes: TemplateChange[];
    abTestResults?: ABTestResults;
  }[];
}

export interface ABTestConfig {
  newVersion: string;
  oldVersion: string;
  splitRatio: number; // 0.5 = 50/50
  minExecutions: number; // Min executions before decision
  significanceThreshold: number; // p-value threshold (e.g., 0.05)
  rollbackThreshold: number; // % degradation that triggers rollback
}

export interface ABTestResults {
  newVersionExecutions: number;
  oldVersionExecutions: number;

  newVersionMetrics: ProcessEffectivenessMetrics[];
  oldVersionMetrics: ProcessEffectivenessMetrics[];

  statisticalSignificance: boolean;
  pValue: number;

  decision: 'rollout' | 'rollback' | 'continue_testing';
  justification: string;
}

// ============================================================================
// Roadmap Mutation Types
// ============================================================================

export type MutationType = 'add_task' | 'remove_task' | 'reorder_tasks' | 'add_task_set' | 'remove_task_set' | 'restructure_epic';

export interface RoadmapMutation {
  id: string;
  type: MutationType;
  timestamp: number;
  proposedBy: string; // Process execution ID

  // What's changing
  target: string; // Task/set/epic ID
  operation: any; // Type-specific operation details

  // Justification
  reason: string;
  evidence: string[];

  // Validation
  validated: boolean;
  validationErrors: string[];

  // Impact analysis
  impact: {
    tasksAffected: number;
    dependenciesAffected: number;
    complexityChange: number;
  };

  // Approval
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  appliedAt?: number;
}

export interface AddTaskMutation extends RoadmapMutation {
  type: 'add_task';
  operation: {
    title: string;
    description: string;
    dependencies: string[];
    exitCriteria: string[];
    insertAfter?: string;
  };
}

export interface RemoveTaskMutation extends RoadmapMutation {
  type: 'remove_task';
  operation: {
    taskId: string;
    reason: 'redundant' | 'out_of_scope' | 'via_negativa';
  };
}

export interface ReorderTasksMutation extends RoadmapMutation {
  type: 'reorder_tasks';
  operation: {
    taskSetId: string;
    newOrdering: string[]; // Array of task IDs in new order
  };
}

// ============================================================================
// Guardrails & Validation
// ============================================================================

export interface MutationGuardrails {
  maxMutationsPerDay: number; // Default: 100
  dependencyValidationRequired: boolean;
  impactAnalysisRequired: boolean;
  conflictDetectionEnabled: boolean;
}

export interface MutationValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];

  checks: {
    noCycles: boolean;
    noOrphans: boolean;
    dependenciesValid: boolean;
    impactAcceptable: boolean;
    noConflicts: boolean;
  };
}

// ============================================================================
// Enforcement Types
// ============================================================================

export interface ProcessEnforcementRule {
  processType: WorkProcessType;
  trigger: 'task_set_complete' | 'epic_ship' | 'periodic';
  enforcer: 'pre_commit_hook' | 'critic' | 'autopilot_self_check' | 'quarterly_audit';
  required: boolean;
}

export interface ProcessComplianceReport {
  timestamp: number;
  processType: WorkProcessType;
  targetId: string; // Task set or epic ID

  compliance: {
    processExecuted: boolean;
    metaReviewCompleted: boolean;
    remediationTasksCreated: boolean;
    remediationTasksExecuted: boolean;
  };

  violations: string[];
  remediationRequired: boolean;
}
