/**
 * Wave 0 Integration for Proof System
 *
 * Extends Wave 0 runner with proof-driven development capabilities.
 * This module can be imported into wave0/runner.ts to add proof system support.
 */

import type { Task } from '../wave0/task_executor.js';
import type { TaskWithPhases } from './types.js';
import { PhaseManager } from './phase_manager.js';
import { ProofSystem } from './proof_system.js';
import { DiscoveryReframer } from './discovery_reframer.js';
import { ProgressTracker } from './progress_tracker.js';
import { AchievementSystem } from './achievement_system.js';
import { logInfo, logWarning } from '../telemetry/logger.js';

export interface ProofIntegrationDependencies {
  phaseManager?: PhaseManager;
  proofSystem?: ProofSystem;
  reframer?: DiscoveryReframer;
  progressTracker?: ProgressTracker;
  achievementSystem?: AchievementSystem;
}

export class ProofIntegration {
  private phaseManager: PhaseManager;
  private proofSystem: ProofSystem;
  private reframer: DiscoveryReframer;
  private progressTracker: ProgressTracker;
  private achievementSystem: AchievementSystem;
  private sessionId: string;

  constructor(
    workspaceRoot: string,
    sessionId: string = 'wave0-session',
    deps: ProofIntegrationDependencies = {}
  ) {
    this.phaseManager = deps.phaseManager ?? new PhaseManager();
    this.proofSystem = deps.proofSystem ?? new ProofSystem(workspaceRoot);
    this.reframer = deps.reframer ?? new DiscoveryReframer();
    this.progressTracker =
      deps.progressTracker ?? new ProgressTracker(this.phaseManager);
    this.achievementSystem =
      deps.achievementSystem ?? new AchievementSystem(workspaceRoot);
    this.sessionId = sessionId;
  }

  /**
   * Process task after execution (integrate proof system)
   */
  async processTaskAfterExecution(
    task: Task,
    executionStatus: 'completed' | 'failed'
  ): Promise<'proven' | 'discovering' | 'blocked'> {
    // Convert task to TaskWithPhases
    const taskWithPhases = this.ensurePhases(task);

    if (executionStatus === 'failed') {
      return 'blocked';
    }

    // Complete implementation phase
    const implPhase = taskWithPhases.phases?.find((p) => p.type === 'implementation');
    if (implPhase && implPhase.status !== 'complete') {
      await this.phaseManager.completePhase(taskWithPhases, implPhase.id, {
        outcome: 'success',
        message: 'Implementation complete',
      });

      // Display progress
      this.progressTracker.displayProgress(taskWithPhases);

      // Track achievement
      await this.achievementSystem.trackPhaseCompletion(
        this.sessionId,
        implPhase,
        taskWithPhases
      );
    }

    // Attempt proof
    logInfo(`ProofIntegration: Attempting proof for ${task.id}`);
    const proofResult = await this.proofSystem.attemptProof(task.id);

    // Reframe result
    const reframed = this.reframer.reframeProofResult(proofResult);

    // Display reframed result
    console.log(`\n${reframed.reframed.status}: ${reframed.reframed.message}\n`);

    if (proofResult.status === 'proven') {
      // Complete discovery phase
      const discoveryPhase = taskWithPhases.phases?.find((p) => p.type === 'discovery');
      if (discoveryPhase) {
        await this.phaseManager.completePhase(taskWithPhases, discoveryPhase.id, {
          outcome: 'success',
          message: 'All checks passed',
        });

        // Track achievement
        await this.achievementSystem.trackPhaseCompletion(
          this.sessionId,
          discoveryPhase,
          taskWithPhases
        );
      }

      // Complete final verification phase
      const verifyPhase = taskWithPhases.phases?.find((p) => p.type === 'verification');
      if (verifyPhase) {
        await this.phaseManager.completePhase(taskWithPhases, verifyPhase.id, {
          outcome: 'success',
          message: 'Task proven',
          evidence: proofResult.evidence,
        });

        // Track achievement
        await this.achievementSystem.trackPhaseCompletion(
          this.sessionId,
          verifyPhase,
          taskWithPhases
        );
      }

      // Display final progress
      this.progressTracker.displayProgress(taskWithPhases);

      // Mark first-time proven if iteration count is 0
      if (!taskWithPhases.stats) {
        taskWithPhases.stats = {
          phasesCompleted: 0,
          issuesFixed: 0,
          iterationCount: 0,
          firstTimeProven: true,
        };
      } else if (taskWithPhases.stats.iterationCount === 0) {
        taskWithPhases.stats.firstTimeProven = true;
      }

      return 'proven';
    } else {
      // Unproven - discoveries found
      logInfo(`ProofIntegration: Found ${proofResult.discoveries.length} discoveries`);

      // Display opportunities
      const opportunityDisplay = this.reframer.formatDiscoveryList(
        reframed.reframed.discoveries
      );
      console.log(opportunityDisplay);

      // Complete discovery phase with discoveries
      const discoveryPhase = taskWithPhases.phases?.find((p) => p.type === 'discovery');
      if (discoveryPhase) {
        await this.phaseManager.completePhase(taskWithPhases, discoveryPhase.id, {
          outcome: 'discovery',
          message: `Found ${proofResult.discoveries.length} issues`,
          discoveries: proofResult.discoveries,
        });

        // Track achievement
        const achievements = await this.achievementSystem.trackPhaseCompletion(
          this.sessionId,
          discoveryPhase,
          taskWithPhases
        );

        // Display any unlocked achievements
        for (const achievement of achievements) {
          this.achievementSystem.displayAchievementUnlock(achievement);
        }
      }

      // Display progress (shows improvement phases)
      this.progressTracker.displayProgress(taskWithPhases);

      return 'discovering';
    }
  }

  /**
   * Ensure task has phases
   */
  private ensurePhases(task: Task): TaskWithPhases {
    const taskWithPhases = task as TaskWithPhases;

    if (!taskWithPhases.phases || taskWithPhases.phases.length === 0) {
      taskWithPhases.phases = this.phaseManager.createInitialPhases(task.id);
    }

    return taskWithPhases;
  }

  /**
   * Display session summary (call at end of Wave 0 session)
   */
  displaySessionSummary(tasks: TaskWithPhases[]): void {
    const achievements = this.achievementSystem.getAchievements(this.sessionId);
    const summary = this.progressTracker.getSessionSummary(tasks, achievements);
    this.progressTracker.displaySessionSummary(summary);
  }

  /**
   * Check if proof system is enabled
   */
  static isEnabled(): boolean {
    return process.env.PROOF_SYSTEM_ENABLED !== '0';
  }
}
