import crypto from 'node:crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

import { KnowledgeBaseResources } from '../memory/kb_resources.js';
import { ProjectIndex } from '../memory/project_index.js';
import { RunEphemeralMemory } from '../memory/run_ephemeral.js';
import { logDebug, logInfo, logWarning } from '../telemetry/logger.js';

import type { ModelSelection } from './model_router.js';
import { ModelRouter } from './model_router.js';
import type { TaskEnvelope } from './task_envelope.js';

export interface PlannerAgentConfig {
  maxContextFiles?: number;
  workspaceRoot?: string;
}

export interface PlannerAgentInput {
  task: TaskEnvelope;
  attempt: number;
  requireDelta: boolean;
  modelSelection?: ModelSelection; // From ComplexityRouter
  /**
   * Quality graph hints from similar tasks (optional)
   *
   * Hints are stored in context pack for future prompt compiler (IMP-21).
   * Currently used for observability/telemetry only.
   *
   * Format: Markdown list of similar tasks with summaries
   * Example:
   *   ### 1. IMP-API-02 (similarity: 0.87)
   *   Implement JWT authentication...
   *
   * @see tools/wvo_mcp/src/quality_graph/hints.ts - getPlanningHints()
   */
  qualityGraphHints?: string;
}

export interface ProofRequirement {
  command: string;
  expectedOutput?: string;
  critical: boolean;
  artifact?: string;
  hash?: string;
}

export interface PhaseProofMetadata {
  proofSuiteId: string;
  requiredEvidence: ProofRequirement[];
  driftBudget: number;
  governanceChecks: string[];
}

export interface PlannerAgentResult {
  planHash: string;
  requiresThinker: boolean;
  summary: string;
  planDeltaToken: string;
  model?: ModelSelection;
  coverageTarget: number;
  proofMetadata?: PhaseProofMetadata;
  subtasks?: Array<{
    id: string;
    type: 'guardrail' | 'drift-remediation' | 'implementation' | 'proof' | 'verification';
    title: string;
    dependencies: string[];
  }>;
}

interface PlannerAgentDeps {
  router: ModelRouter;
  memory: RunEphemeralMemory;
  kb: KnowledgeBaseResources;
  projectIndex: ProjectIndex;
}

export class PlannerAgent {
  constructor(
    private readonly deps: PlannerAgentDeps,
    private readonly config: PlannerAgentConfig = {}
  ) {}

  async run(input: PlannerAgentInput): Promise<PlannerAgentResult> {
    const base = JSON.stringify({
      id: input.task.id,
      title: input.task.title ?? '',
      labels: input.task.labels ?? [],
      files: this.resolveFileHints(input.task),
      priorityTags: input.task.priorityTags ?? [],
    });
    const planHash = crypto.createHash('sha1').update(base).digest('hex');
    const planDeltaToken = crypto.createHash('sha1').update(`${planHash}:${Date.now()}`).digest('hex');

    logDebug('PlannerAgent produced plan', {
      taskId: input.task.id,
      attempt: input.attempt,
      planHash,
      requireDelta: input.requireDelta,
    });

    // Use ComplexityRouter selection if provided, otherwise fallback to ModelRouter
    const modelSelection = input.modelSelection ?? this.safePickModel(input.task.id);
    if (modelSelection) {
      logInfo('PlannerAgent model selection', {
        taskId: input.task.id,
        model: modelSelection.model,
        provider: modelSelection.provider,
        source: input.modelSelection ? 'ComplexityRouter' : 'ModelRouter',
      });
    }

    await this.deps.projectIndex.refresh(this.resolveFileHints(input.task));
    const indexSnapshot = this.deps.projectIndex.snapshot();
    const kbPack = await this.deps.kb.listPinned();
    const coverageTarget = this.resolveCoverageTarget();

    // NEW: Check if this is a phase task and load proof metadata
    let proofMetadata: PhaseProofMetadata | undefined;
    let subtasks: PlannerAgentResult['subtasks'] = [];

    if (this.isPhaseTask(input.task)) {
      // Load phase metadata from SQLite and drift budgets
      proofMetadata = await this.loadPhaseProofMetadata(input.task);

      // Load governance checklist and identify missing guardrails
      const governanceChecks = await this.loadGovernanceChecklist();
      const missingGuardrails = this.identifyMissingGuardrails(input.task, governanceChecks);

      // Check drift budgets and create remediation tasks if needed
      const driftBudget = await this.loadDriftBudget(input.task.id);

      // Create subtasks based on proof requirements and drift status
      subtasks = this.createPhaseSubtasks(
        input.task,
        proofMetadata,
        missingGuardrails,
        driftBudget
      );

      // Attach proof metadata to task envelope
      if (!input.task.metadata) {
        input.task.metadata = {};
      }
      input.task.metadata.proof = proofMetadata;

      logInfo('Phase task enhanced with proof metadata', {
        taskId: input.task.id,
        proofSuiteId: proofMetadata.proofSuiteId,
        evidenceCount: proofMetadata.requiredEvidence.length,
        driftBudget: proofMetadata.driftBudget,
        subtaskCount: subtasks ? subtasks.length : 0
      });
    }

    const contextPack = {
      planHash,
      kb: kbPack,
      index: indexSnapshot,
      summary: `Context pack for ${input.task.id}`,
      coverageTarget,
      proofMetadata,  // Include proof metadata in context
      qualityGraphHints: input.qualityGraphHints,  // Store hints for prompt compiler
    };
    this.deps.memory.set(input.task.id, 'planner', 'context_pack', contextPack);

    const requiresThinker =
      input.requireDelta ||
      (input.task.priorityTags ?? []).some(tag => ['p0', 'critical'].includes(tag.toLowerCase())) ||
      (proofMetadata?.driftBudget ?? 0) > 0;  // Also require thinker if drift detected

    return {
      planHash,
      requiresThinker,
      summary: `Plan ${planHash.slice(0, 8)} covering ${this.config.maxContextFiles ?? 12} files.`,
      planDeltaToken,
      model: modelSelection,
      coverageTarget,
      proofMetadata,
      subtasks,
    };
  }

  private safePickModel(taskId: string): ModelSelection | undefined {
    try {
      return this.deps.router.pickModel('plan', { taskId });
    } catch (error) {
      logWarning('PlannerAgent failed to pick model', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private resolveFileHints(task: TaskEnvelope): string[] {
    const files = task.metadata?.files as unknown;
    if (Array.isArray(files)) {
      return files.filter((value): value is string => typeof value === 'string');
    }
    return [];
  }

  private resolveCoverageTarget(): number {
    const raw = process.env.WVO_COVERAGE_MIN_DELTA ?? '0.05';
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0.05;
    }
    return Math.min(0.5, Math.max(0.01, parsed));
  }

  /**
   * Check if this task is a phase-level task requiring proof
   */
  private isPhaseTask(task: TaskEnvelope): boolean {
    const phaseKeywords = ['phase', 'PHASE', 'Phase 3', 'Phase 4', 'Phase 5'];
    const title = task.title || '';
    const isPhase = phaseKeywords.some(keyword => title.includes(keyword));

    // Also check labels for phase indicators
    const hasPhaseLabel = (task.labels || []).some(label =>
      label.toLowerCase().includes('phase') ||
      label.includes('milestone')
    );

    return isPhase || hasPhaseLabel;
  }

  /**
   * Load phase proof metadata from SQLite database
   */
  private async loadPhaseProofMetadata(task: TaskEnvelope): Promise<PhaseProofMetadata> {
    const workspaceRoot = this.config.workspaceRoot || process.cwd();
    const dbPath = path.join(workspaceRoot, 'state/orchestrator.db');

    // Default metadata if DB doesn't exist
    let proofSuiteId = 'phase-unknown';
    let requiredEvidence: ProofRequirement[] = [];

    // Determine phase from task title
    if (task.title?.includes('Phase 3') || task.title?.includes('phase3')) {
      proofSuiteId = 'phase3-intelligence';
      requiredEvidence = [
        { command: 'npm run build', critical: true },
        { command: 'npm test', critical: true },
        { command: 'grep "enableAdaptiveRoadmap.*true" src/orchestrator/orchestrator_loop.ts', critical: true },
        { command: 'test -f src/orchestrator/adaptive_roadmap.ts', expectedOutput: 'exists', critical: true },
        { command: 'test -f src/orchestrator/context_manager.ts', expectedOutput: 'exists', critical: true },
      ];
    } else if (task.title?.includes('Phase 4') || task.title?.includes('phase4')) {
      proofSuiteId = 'phase4-mcp';
      requiredEvidence = [
        { command: 'node scripts/mcp_tool_cli.mjs plan_next \'{ "minimal": true }\'', critical: true },
        { command: 'grep "mcp__weathervane__plan_next" src/orchestrator/mcp_client.ts', critical: true },
        { command: 'test -f src/orchestrator/work_process_enforcer.ts', expectedOutput: 'exists', critical: true },
        { command: 'npm run build', critical: true },
        { command: 'npm test', critical: true },
      ];
    } else if (task.title?.includes('Phase 5') || task.title?.includes('phase5')) {
      proofSuiteId = 'phase5-production';
      requiredEvidence = [
        { command: 'test -f src/orchestrator/completion_verifier.ts', expectedOutput: 'exists', critical: true },
        { command: 'test -f src/orchestrator/evidence_collector.ts', expectedOutput: 'exists', critical: true },
        { command: 'npm run build', critical: true },
        { command: 'npm test', critical: true },
        { command: 'npm audit --json | jq ".metadata.vulnerabilities.critical"', expectedOutput: '0', critical: false },
      ];
    }

    // Try to load additional metadata from SQLite if it exists
    if (fs.existsSync(dbPath)) {
      try {
        const db = new Database(dbPath, { readonly: true });
        const stmt = db.prepare(`
          SELECT proofSuiteId, requiredEvidence, driftBudget
          FROM phase_metadata
          WHERE phaseId = ?
          LIMIT 1
        `);
        const row = stmt.get(proofSuiteId) as any;

        if (row) {
          if (row.requiredEvidence) {
            requiredEvidence = JSON.parse(row.requiredEvidence);
          }
        }

        db.close();
      } catch (error) {
        logWarning('Failed to load phase metadata from SQLite', { error });
      }
    }

    // Load drift budget
    const driftBudget = await this.loadDriftBudget(task.id);

    // Load governance checks from quality bar
    const governanceChecks = await this.loadGovernanceChecklist();

    return {
      proofSuiteId,
      requiredEvidence,
      driftBudget,
      governanceChecks: governanceChecks.slice(0, 5)  // Top 5 governance checks
    };
  }

  /**
   * Load drift budget for a task
   */
  private async loadDriftBudget(taskId: string): Promise<number> {
    const workspaceRoot = this.config.workspaceRoot || process.cwd();
    const driftPath = path.join(workspaceRoot, 'state/drift_budgets.json');

    if (!fs.existsSync(driftPath)) {
      // Create default drift budgets file
      const defaultBudgets = {
        global: 0.1,
        phases: {
          'phase3-intelligence': 0.05,
          'phase4-mcp': 0.05,
          'phase5-production': 0.02
        },
        tasks: {}
      };

      const stateDir = path.dirname(driftPath);
      if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
      }

      fs.writeFileSync(driftPath, JSON.stringify(defaultBudgets, null, 2));
      return defaultBudgets.global;
    }

    try {
      const budgets = JSON.parse(fs.readFileSync(driftPath, 'utf-8'));

      // Check task-specific budget first
      if (budgets.tasks && budgets.tasks[taskId]) {
        return budgets.tasks[taskId];
      }

      // Check phase budget
      for (const [phaseId, budget] of Object.entries(budgets.phases || {})) {
        if (taskId.includes(phaseId)) {
          return budget as number;
        }
      }

      // Fall back to global
      return budgets.global || 0.1;
    } catch (error) {
      logWarning('Failed to load drift budgets', { error });
      return 0.1;
    }
  }

  /**
   * Load governance checklist from quality bar
   */
  private async loadGovernanceChecklist(): Promise<string[]> {
    const workspaceRoot = this.config.workspaceRoot || process.cwd();
    const qualityBarPath = path.join(workspaceRoot, 'docs/autopilot/QUALITY_BAR.md');
    const jsonPath = path.join(workspaceRoot, 'state/governance_checklist.json');

    // Try to load pre-generated JSON first
    if (fs.existsSync(jsonPath)) {
      try {
        const checklist = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        return checklist.checks || [];
      } catch {
        // Fall through to parse markdown
      }
    }

    // Parse from markdown if JSON doesn't exist
    if (fs.existsSync(qualityBarPath)) {
      const content = fs.readFileSync(qualityBarPath, 'utf-8');
      const checks: string[] = [];

      // Extract checklist items (look for bullet points)
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.match(/^[\s]*[-*]\s+/)) {
          const check = line.replace(/^[\s]*[-*]\s+/, '').trim();
          if (check.length > 10 && !check.startsWith('#')) {
            checks.push(check);
          }
        }
      }

      // Save as JSON for next time
      if (checks.length > 0) {
        const stateDir = path.dirname(jsonPath);
        if (!fs.existsSync(stateDir)) {
          fs.mkdirSync(stateDir, { recursive: true });
        }
        fs.writeFileSync(jsonPath, JSON.stringify({ checks }, null, 2));
      }

      return checks;
    }

    // Default governance checks if nothing found
    return [
      'Build must pass with 0 errors',
      'All tests must pass (100% pass rate)',
      'No mock implementations in production code',
      'Acceptance criteria must be verified',
      'Security audit must show 0 critical vulnerabilities',
      'Documentation must be complete',
      'Evidence bundle must be generated'
    ];
  }

  /**
   * Identify missing guardrails that need to be added as subtasks
   */
  private identifyMissingGuardrails(
    task: TaskEnvelope,
    governanceChecks: string[]
  ): string[] {
    const missingGuardrails: string[] = [];

    // Check if task description mentions required checks
    const taskContent = `${task.title} ${task.description || ''}`.toLowerCase();

    // Map governance checks to detection patterns
    const checkPatterns = {
      'Build must pass': !taskContent.includes('build') && !taskContent.includes('compile'),
      'Tests must pass': !taskContent.includes('test') && !taskContent.includes('verify'),
      'No mocks': !taskContent.includes('mock') && !taskContent.includes('real implementation'),
      'Evidence required': !taskContent.includes('evidence') && !taskContent.includes('proof'),
      'Security check': !taskContent.includes('security') && !taskContent.includes('audit')
    };

    for (const [pattern, isMissing] of Object.entries(checkPatterns)) {
      if (isMissing) {
        const matchingCheck = governanceChecks.find(check =>
          check.toLowerCase().includes(pattern.split(' ')[0].toLowerCase())
        );
        if (matchingCheck) {
          missingGuardrails.push(matchingCheck);
        }
      }
    }

    return missingGuardrails;
  }

  /**
   * Create subtasks for phase execution
   */
  private createPhaseSubtasks(
    task: TaskEnvelope,
    proofMetadata: PhaseProofMetadata,
    missingGuardrails: string[],
    driftBudget: number
  ): PlannerAgentResult['subtasks'] {
    const subtasks: PlannerAgentResult['subtasks'] = [];
    let taskIdCounter = 0;

    // Add drift remediation task if drift budget exceeded
    if (driftBudget > 0.1) {
      subtasks.push({
        id: `${task.id}-drift-${++taskIdCounter}`,
        type: 'drift-remediation',
        title: `Remediate drift (budget: ${driftBudget})`,
        dependencies: []
      });
    }

    // Add missing guardrail tasks
    for (const guardrail of missingGuardrails) {
      subtasks.push({
        id: `${task.id}-guard-${++taskIdCounter}`,
        type: 'guardrail',
        title: `Ensure: ${guardrail}`,
        dependencies: subtasks.length > 0 ? [subtasks[subtasks.length - 1].id] : []
      });
    }

    // Add main implementation task
    const implTaskId = `${task.id}-impl-${++taskIdCounter}`;
    subtasks.push({
      id: implTaskId,
      type: 'implementation',
      title: `Implement: ${task.title}`,
      dependencies: subtasks.length > 0 ? [subtasks[subtasks.length - 1].id] : []
    });

    // Add proof generation task
    const proofTaskId = `${task.id}-proof-${++taskIdCounter}`;
    subtasks.push({
      id: proofTaskId,
      type: 'proof',
      title: `Generate proof: ${proofMetadata.proofSuiteId}`,
      dependencies: [implTaskId]
    });

    // Add verification tasks
    subtasks.push({
      id: `${task.id}-verify-${++taskIdCounter}`,
      type: 'verification',
      title: 'Independent verification (VerifierAgent)',
      dependencies: [proofTaskId]
    });

    subtasks.push({
      id: `${task.id}-critical-${++taskIdCounter}`,
      type: 'verification',
      title: 'Adversarial probe (CriticalAgent)',
      dependencies: [proofTaskId]
    });

    // Add final status generation
    subtasks.push({
      id: `${task.id}-status-${++taskIdCounter}`,
      type: 'proof',
      title: 'Regenerate status documents',
      dependencies: subtasks.slice(-2).map(t => t.id)  // After both verifications
    });

    return subtasks;
  }
}
