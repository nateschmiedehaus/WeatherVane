/**
 * Type definitions for proof-driven development system
 *
 * This module defines the core types for:
 * - Task phase decomposition
 * - Proof criteria and results
 * - Achievements and agent stats
 */

/**
 * Task Phase Types
 */

export type PhaseType =
  | 'implementation'   // Write code
  | 'discovery'        // Run proof, find issues
  | 'improvement'      // Fix specific issue
  | 'verification'     // Final proof check
  | 'review';          // Critic validation

export type PhaseStatus = 'pending' | 'in_progress' | 'complete';

export interface TaskPhase {
  id: string;                       // "AFP-TASK-123.impl-1"
  title: string;                    // "Implementation phase"
  type: PhaseType;
  status: PhaseStatus;
  completedAt?: string;             // ISO 8601 timestamp
  result?: PhaseResult;
  nextPhases?: string[];            // Phases unlocked after this completes
  context?: Record<string, unknown>; // Additional context (e.g., issue details)
}

export interface PhaseResult {
  outcome: 'success' | 'discovery' | 'blocked';
  message: string;
  discoveries?: Discovery[];        // Issues found (if discovery phase)
  evidence?: Evidence;              // Proof evidence (if verification)
  nextSteps?: string[];             // What to do next
}

/**
 * Discovery Types (Issues Found During Proof)
 */

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface Discovery {
  id: string;
  title: string;                    // "Memory leak in data processor"
  description: string;              // Detailed error message
  severity: Severity;
  context: {
    file?: string;
    line?: number;
    expected?: string;
    actual?: string;
    error?: string;
  };
}

/**
 * Proof Criteria Types
 */

export interface ProofCriteria {
  build: boolean;                   // Run build check
  test: boolean;                    // Run test check
  runtime: RuntimeCriterion[];      // Runtime checks to execute
  integration: IntegrationCriterion[]; // Integration checks
  manual: ManualCriterion[];        // Manual verification steps
}

export interface RuntimeCriterion {
  description: string;              // What is being tested
  command?: string;                 // Command to run (if automated)
  expected?: string;                // Expected outcome
}

export interface IntegrationCriterion {
  description: string;              // What is being tested
  command?: string;                 // Command to run (if automated)
  expected?: string;                // Expected outcome
}

export interface ManualCriterion {
  description: string;              // What needs to be checked manually
  checklistItem: string;            // Checklist item to display
}

/**
 * Proof Result Types
 */

export type ProofStatus = 'proven' | 'unproven';

export interface ProofResult {
  status: ProofStatus;
  timestamp: string;                // ISO 8601
  criteria: ProofCriteria;          // Criteria that were checked
  checks: CheckResult[];            // Results of each check
  discoveries: Discovery[];         // Issues found
  evidence?: Evidence;              // Evidence if proven
  executionTimeMs: number;          // Time to run proof
}

export interface CheckResult {
  type: 'build' | 'test' | 'runtime' | 'integration' | 'manual';
  description: string;
  success: boolean;
  message: string;
  error?: string;
  output?: string;
  skipped?: boolean;                // True if check was skipped (e.g., no build script)
}

/**
 * Evidence Types (For verify.md)
 */

export interface Evidence {
  taskId: string;
  timestamp: string;
  criteria: ProofCriteria;
  checks: CheckResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  executionTimeMs: number;
}

/**
 * Achievement Types
 */

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;                     // Emoji icon
  condition: (stats: AgentStats) => boolean;
}

export interface AgentStats {
  sessionId: string;
  phasesCompletedThisSession: number;
  issuesFixedThisSession: number;
  maxIterationsOnTask: number;      // Highest iteration count on any task
  firstTimeProvenCount: number;     // Tasks proven on first try
  totalTasksCompleted: number;
  achievements: string[];           // Achievement IDs unlocked
}

export interface TaskStats {
  phasesCompleted: number;
  issuesFixed: number;
  iterationCount: number;           // Times proof attempted
  firstTimeProven: boolean;         // Passed on first try?
}

/**
 * Progress Types
 */

export interface ProgressInfo {
  completed: number;
  total: number;
  percentage: number;
  recentlyCompleted: TaskPhase[];
  currentPhase?: TaskPhase;
  nextPhases: TaskPhase[];
}

export interface CompletionSummary {
  taskId: string;
  progress: ProgressInfo;
  displayText: string;              // Formatted progress text
}

export interface SessionSummary {
  totalPhasesCompleted: number;
  totalIssuesFixed: number;
  totalTasksCompleted: number;
  achievementsUnlocked: number;
  topAchievements: Achievement[];
}

/**
 * Language Reframing Types
 */

export interface ReframedResult {
  original: PhaseResult | ProofResult;
  reframed: {
    status: string;                 // Positive status name
    message: string;                // Encouraging message
    discoveries: OpportunityMessage[]; // Reframed as opportunities
  };
}

export interface OpportunityMessage {
  icon: string;                     // ✨ for opportunities
  title: string;                    // Positive framing
  description: string;
  actionable: string;               // What to do next
}

/**
 * Extended Task Type (for Phase Support)
 */

export interface TaskWithPhases {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'discovering' | 'improving' | 'proven' | 'blocked';
  phases?: TaskPhase[];
  stats?: TaskStats;
  // ... other task properties
}
