/**
 * AFP-W0-AGENT-SELF-ENFORCEMENT-20251107-REMEDIATION-V
 * Stigmergic Quality Enforcer - FUNCTIONAL INTEGRATION
 *
 * Integrates stigmergic layers with Wave 0 autopilot to provide:
 * 1. Real-time evidence monitoring
 * 2. Bypass pattern detection
 * 3. Forced remediation
 * 4. Phase gate enforcement
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveStateRoot } from '../utils/config.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';
import { ScentEnvironment, ScentType, LayerName } from './prototype/scent_environment.js';
import { ConstitutionalLayer, EvidenceDocument } from './prototype/layer_1_constitutional.js';
import { DebiasLayer, TaskCompletion } from './prototype/layer_2_debiasing.js';
import { DetectionLayer } from './prototype/layer_3_detection.js';
import { RemediationLayer, RemediationTask } from './prototype/layer_4_remediation.js';
import { SemanticEnforcer, SemanticEnforcementResult } from './semantic/semantic_enforcer.js';
import { Indexer } from './semantic/indexer.js';
import type { Task, PhaseContext } from '../wave0/phase_executors.js';

/**
 * Enforcement result for a task phase
 */
export interface EnforcementResult {
  taskId: string;
  phase: string;
  approved: boolean;
  bypassDetected: boolean;
  remediationRequired: boolean;
  remediationTaskId?: string;
  concerns: string[];
  metadata: {
    wordCount?: number;
    duration?: number;
    scentCount: number;
    layerSignals: Record<LayerName, number>;
    semanticResult?: SemanticEnforcementResult;
  };
}

/**
 * Stigmergic Quality Enforcer
 *
 * Hooks into Wave 0 task execution to enforce quality standards using
 * distributed stigmergic coordination.
 */
export class StigmergicEnforcer {
  private workspaceRoot: string;
  private stateRoot: string;
  private environment: ScentEnvironment;
  private layer1: ConstitutionalLayer;
  private layer2: DebiasLayer;
  private layer3: DetectionLayer;
  private layer4: RemediationLayer;
  private semanticEnforcer: SemanticEnforcer;
  private indexer: Indexer;
  private semanticInitialized: boolean = false;

  // Track task execution for duration measurement
  private taskStartTimes: Map<string, number> = new Map();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.stateRoot = resolveStateRoot(workspaceRoot);

    // Initialize stigmergic environment
    this.environment = new ScentEnvironment();
    this.environment.bootstrap();

    // Initialize enforcement layers (L1-L4 only, per Phase 13 findings)
    this.layer1 = new ConstitutionalLayer(this.environment);
    this.layer2 = new DebiasLayer(this.environment);
    this.layer3 = new DetectionLayer(this.environment);
    this.layer4 = new RemediationLayer(this.environment);

    // Initialize semantic layers (L5-L6)
    this.semanticEnforcer = new SemanticEnforcer(workspaceRoot);
    this.indexer = new Indexer({ workspaceRoot });

    logInfo('StigmergicEnforcer: Initialized with L1-L6 layers (stigmergic + semantic)');
  }

  /**
   * Called when task phase starts - record start time
   */
  recordPhaseStart(taskId: string, phase: string): void {
    const key = `${taskId}:${phase}`;
    this.taskStartTimes.set(key, Date.now());
    logInfo('StigmergicEnforcer: Phase started', { taskId, phase });
  }

  /**
   * Called when task phase completes - enforce quality standards
   *
   * This is the main integration point with Wave 0.
   */
  async enforcePhaseCompletion(
    task: Task,
    phase: string,
    context: PhaseContext
  ): Promise<EnforcementResult> {
    logInfo('StigmergicEnforcer: Enforcing phase completion', {
      taskId: task.id,
      phase
    });

    try {
      // 1. Extract evidence document
      const evidence = await this.extractEvidenceDocument(task, phase, context);
      if (!evidence) {
        return this.createPassResult(task.id, phase, 'No evidence to evaluate');
      }

      // 2. Calculate task completion metrics
      const completion = this.calculateCompletion(task, phase);

      // 3. Run semantic enforcement (L5-L6) BEFORE phase execution
      // This provides context and citations to the agent
      let semanticResult: SemanticEnforcementResult | undefined;
      const semanticConcerns: string[] = [];

      try {
        // Initialize semantic system if not already done
        if (!this.semanticInitialized) {
          await this.initializeSemantic();
        }

        // Read evidence content for coherence check
        const evidencePath = path.join(this.stateRoot, 'evidence', task.id, `${phase}.md`);
        const evidenceContent = fs.existsSync(evidencePath)
          ? fs.readFileSync(evidencePath, 'utf-8')
          : '';

        // Run semantic enforcement
        semanticResult = await this.semanticEnforcer.enforcePhase(
          task,
          phase,
          evidenceContent
        );

        // Add semantic concerns
        if (!semanticResult.approved) {
          semanticConcerns.push(...semanticResult.concerns);
        }
      } catch (error) {
        logWarning('StigmergicEnforcer: Semantic enforcement failed', { error, taskId: task.id, phase });
      }

      // 4. Run stigmergic patrol (L1-L4)
      await this.layer1.patrol([evidence]);
      await this.sleep(10);

      await this.layer2.patrol([completion]);
      await this.sleep(10);

      await this.layer3.patrol();
      await this.sleep(10);

      const remediationTasks = await this.layer4.patrol();
      await this.sleep(10);

      // 5. Analyze scent environment
      const allScents = await this.environment.detectScents({ taskId: task.id });
      const bypassDetected = allScents.some(s => s.type === ScentType.BYPASS_PATTERN);
      const remediationCreated = remediationTasks.length > 0;

      // 6. Build enforcement result
      const stigmergicConcerns = this.extractConcerns(allScents);
      const layerSignals = this.countLayerSignals(allScents);

      // Combine all concerns
      const concerns = [...stigmergicConcerns, ...semanticConcerns];

      // Combined approval requires BOTH stigmergic and semantic approval
      const stigmergicApproved = !bypassDetected;
      const semanticApproved = !semanticResult || semanticResult.approved;
      const approved = stigmergicApproved && semanticApproved;

      const result: EnforcementResult = {
        taskId: task.id,
        phase,
        approved,
        bypassDetected: bypassDetected || !semanticApproved,
        remediationRequired: remediationCreated,
        remediationTaskId: remediationTasks[0]?.taskId,
        concerns,
        metadata: {
          wordCount: evidence.wordCount,
          duration: completion.duration,
          scentCount: allScents.length,
          layerSignals,
          semanticResult
        }
      };

      // 6. Create remediation task if needed
      if (remediationCreated) {
        await this.createRemediationRoadmapTask(remediationTasks[0], task);
        logWarning('StigmergicEnforcer: BLOCKED - Remediation required', {
          taskId: task.id,
          phase,
          remediationTaskId: remediationTasks[0].taskId,
          pattern: remediationTasks[0].pattern
        });
      } else {
        logInfo('StigmergicEnforcer: APPROVED - No bypasses detected', {
          taskId: task.id,
          phase
        });
      }

      return result;

    } catch (error) {
      logError('StigmergicEnforcer: Enforcement failed', { error, taskId: task.id, phase });
      // On error, allow passage but log warning
      return this.createPassResult(task.id, phase, `Enforcement error: ${error}`);
    }
  }

  /**
   * Extract evidence document from file system
   */
  private async extractEvidenceDocument(
    task: Task,
    phase: string,
    context: PhaseContext
  ): Promise<EvidenceDocument | null> {
    try {
      const evidencePath = path.join(
        this.stateRoot,
        'evidence',
        task.id,
        `${phase}.md`
      );

      if (!fs.existsSync(evidencePath)) {
        logWarning('StigmergicEnforcer: Evidence file not found', { evidencePath });
        return null;
      }

      const content = fs.readFileSync(evidencePath, 'utf-8');
      const wordCount = content.split(/\s+/).length;
      const sections = this.extractSections(content);

      return {
        taskId: task.id,
        phase,
        path: evidencePath,
        wordCount,
        sections
      };
    } catch (error) {
      logError('StigmergicEnforcer: Failed to extract evidence', { error, taskId: task.id, phase });
      return null;
    }
  }

  /**
   * Extract section headers from markdown
   */
  private extractSections(content: string): string[] {
    const headers: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const match = line.match(/^#+\s+(.+)$/);
      if (match) {
        headers.push(match[1].trim());
      }
    }

    return headers;
  }

  /**
   * Calculate task completion metrics
   */
  private calculateCompletion(task: Task, phase: string): TaskCompletion {
    const key = `${task.id}:${phase}`;
    const startTime = this.taskStartTimes.get(key) || Date.now();
    const duration = (Date.now() - startTime) / 60000; // minutes

    // Expected durations (from research)
    const expectedDurations: Record<string, number> = {
      'strategize': 30,
      'spec': 20,
      'plan': 45,
      'think': 30,
      'design': 30,
      'implement': 120,
      'verify': 45,
      'review': 30
    };

    const expected = expectedDurations[phase] || 30;

    // Estimate confidence and complexity based on duration ratio
    const ratio = duration / expected;
    const confidence = ratio < 0.5 ? 95 : (ratio < 0.8 ? 85 : 75);
    const complexity = ratio > 1.5 ? 80 : (ratio > 1.0 ? 60 : 40);

    return {
      taskId: task.id,
      phase,
      duration,
      confidence,
      complexity
    };
  }

  /**
   * Extract human-readable concerns from scents
   */
  private extractConcerns(scents: Array<{ type: ScentType; metadata: any }>): string[] {
    const concerns: string[] = [];

    for (const scent of scents) {
      if (scent.type === ScentType.QUALITY_CONCERN) {
        concerns.push(
          `Low word count: ${scent.metadata.wordCount} (min ${scent.metadata.minRequired})`
        );
      } else if (scent.type === ScentType.PRESENT_BIAS_DETECTED) {
        concerns.push(
          `Rushed completion: ${scent.metadata.actualDuration}min (expected ${scent.metadata.expectedDuration}min)`
        );
      } else if (scent.type === ScentType.OVERCONFIDENCE_DETECTED) {
        concerns.push(
          `Overconfident: ${scent.metadata.confidence}% confidence on ${scent.metadata.complexity}% complexity task`
        );
      } else if (scent.type === ScentType.BYPASS_PATTERN) {
        concerns.push(
          `Bypass pattern detected: ${scent.metadata.pattern} (${scent.metadata.concernCount} signals)`
        );
      }
    }

    return concerns;
  }

  /**
   * Count signals by layer
   */
  private countLayerSignals(scents: Array<{ layer: LayerName }>): Record<LayerName, number> {
    const counts: Record<LayerName, number> = {
      [LayerName.L1_CONSTITUTIONAL]: 0,
      [LayerName.L2_DEBIASING]: 0,
      [LayerName.L3_DETECTION]: 0,
      [LayerName.L4_REMEDIATION]: 0,
      [LayerName.L5_CONSENSUS]: 0,
      [LayerName.L6_DOCUMENTATION]: 0,
      [LayerName.BOOTSTRAP]: 0
    };

    for (const scent of scents) {
      counts[scent.layer]++;
    }

    return counts;
  }

  /**
   * Create remediation task in roadmap
   */
  private async createRemediationRoadmapTask(
    remediation: RemediationTask,
    originalTask: Task
  ): Promise<void> {
    try {
      // Read current roadmap
      const roadmapPath = path.join(this.stateRoot, 'roadmap.yaml');
      let roadmapContent = '';

      if (fs.existsSync(roadmapPath)) {
        roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
      }

      // Create remediation task entry
      const remediationEntry = `
  - id: ${remediation.taskId}
    title: "REMEDIATION: Fix bypass pattern ${remediation.pattern} in ${remediation.originalTaskId}"
    status: pending
    priority: critical
    created_by: stigmergic_enforcer
    created_at: ${new Date().toISOString()}
    original_task: ${remediation.originalTaskId}
    bypass_pattern: ${remediation.pattern}
    concerns:
${remediation.concerns.map(c => `      - ${c.type}: ${c.phase}`).join('\n')}
`;

      // Append to roadmap (simple append for now - proper YAML parsing would be better)
      roadmapContent += remediationEntry;
      fs.writeFileSync(roadmapPath, roadmapContent);

      logInfo('StigmergicEnforcer: Created remediation task in roadmap', {
        remediationTaskId: remediation.taskId,
        originalTaskId: remediation.originalTaskId
      });
    } catch (error) {
      logError('StigmergicEnforcer: Failed to create remediation task', {
        error,
        remediationTaskId: remediation.taskId
      });
    }
  }

  /**
   * Create a passing result (used for errors or missing evidence)
   */
  private createPassResult(taskId: string, phase: string, reason: string): EnforcementResult {
    logWarning('StigmergicEnforcer: Allowing passage', { taskId, phase, reason });

    return {
      taskId,
      phase,
      approved: true,
      bypassDetected: false,
      remediationRequired: false,
      concerns: [reason],
      metadata: {
        scentCount: 0,
        layerSignals: {
          [LayerName.L1_CONSTITUTIONAL]: 0,
          [LayerName.L2_DEBIASING]: 0,
          [LayerName.L3_DETECTION]: 0,
          [LayerName.L4_REMEDIATION]: 0,
          [LayerName.L5_CONSENSUS]: 0,
          [LayerName.L6_DOCUMENTATION]: 0,
          [LayerName.BOOTSTRAP]: 0
        }
      }
    };
  }

  /**
   * Initialize semantic search system
   */
  private async initializeSemantic(): Promise<void> {
    try {
      logInfo('StigmergicEnforcer: Initializing semantic search system');

      // Initialize semantic enforcer
      await this.semanticEnforcer.initialize();

      // Index critical documents for retrieval
      const criticalPaths = [
        path.join(this.workspaceRoot, 'docs', 'MANDATORY_WORK_CHECKLIST.md'),
        path.join(this.workspaceRoot, 'docs', 'adrs'),
        path.join(this.workspaceRoot, 'state', 'evidence'),
        path.join(this.workspaceRoot, 'src')
      ];

      const chunks = await this.indexer.indexFiles(
        criticalPaths.filter(fs.existsSync),
        'doc'
      );

      // Add to vector store
      await this.semanticEnforcer.indexDocuments(chunks);

      this.semanticInitialized = true;
      logInfo('StigmergicEnforcer: Semantic search initialized', {
        documentsIndexed: chunks.length
      });
    } catch (error) {
      logError('StigmergicEnforcer: Failed to initialize semantic search', { error });
      // Continue without semantic search rather than blocking
      this.semanticInitialized = false;
    }
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    this.environment.destroy();
    this.taskStartTimes.clear();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
