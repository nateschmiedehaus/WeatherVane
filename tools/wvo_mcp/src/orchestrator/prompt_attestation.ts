/**
 * Prompt Attestation System - Drift Detection via SHA-256 Hashing
 *
 * Prevents prompt drift between cycles by cryptographically hashing
 * the full prompt specification and comparing against baseline.
 *
 * Design:
 * - Hash all inputs that affect agent behavior: phase, task, requirements, context
 * - Store baseline hash on first execution
 * - Compare subsequent hashes to detect drift
 * - Report drift metrics for analysis
 * - Support prompt evolution tracking across versions
 */

import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { WorkPhase } from './work_process_enforcer.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';
import { withFileLock } from '../utils/file_lock_manager.js';

/**
 * Prompt specification that defines agent behavior
 */
export interface PromptSpec {
  // Core identity
  phase: WorkPhase;
  taskId: string;
  timestamp: string;

  // Requirements and constraints
  requirements: string[];
  qualityGates: string[];
  artifacts: string[];

  // Context (truncated to prevent hash volatility)
  contextSummary: string;  // First 500 chars of context

  // Metadata
  agentType?: string;
  modelVersion?: string;
}

/**
 * Prompt attestation record
 */
export interface PromptAttestation {
  attestation_id: string;
  task_id: string;
  phase: WorkPhase;
  prompt_hash: string;        // SHA-256 of canonical prompt spec
  baseline_hash?: string;     // First hash for this task/phase
  drift_detected: boolean;
  drift_details?: string;
  timestamp: string;

  // Metadata for analysis
  prompt_version?: string;
  agent_type?: string;
}

/**
 * Drift analysis result
 */
export interface DriftAnalysis {
  hasDrift: boolean;
  baselineHash?: string;
  currentHash: string;
  driftDetails?: string;
  severity: 'none' | 'low' | 'medium' | 'high';
  recommendation?: string;
}

/**
 * Prompt Attestation Manager
 *
 * Tracks prompt consistency across task cycles to detect drift.
 */
export class PromptAttestationManager {
  private readonly attestationPath: string;
  private readonly baselinePath: string;

  constructor(
    private readonly workspaceRoot: string
  ) {
    this.attestationPath = path.join(workspaceRoot, 'state/process/prompt_attestations.jsonl');
    this.baselinePath = path.join(workspaceRoot, 'state/process/prompt_baselines.json');
  }

  /**
   * Initialize attestation storage
   */
  async initialize(): Promise<void> {
    try {
      const attestationDir = path.dirname(this.attestationPath);
      await fs.mkdir(attestationDir, { recursive: true });

      // Initialize baselines file if not exists
      if (!await this.fileExists(this.baselinePath)) {
        await fs.writeFile(this.baselinePath, JSON.stringify({}, null, 2));
      }

      logInfo('Prompt attestation initialized', {
        attestationPath: this.attestationPath,
        baselinePath: this.baselinePath
      });
    } catch (error) {
      logError('Failed to initialize prompt attestation', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Attest to a prompt specification
   *
   * Returns drift analysis comparing to baseline.
   */
  async attest(spec: PromptSpec): Promise<DriftAnalysis> {
    try {
      // Compute hash of prompt specification
      const currentHash = this.computePromptHash(spec);

      // Load baselines
      const baselines = await this.loadBaselines();
      const baselineKey = `${spec.taskId}:${spec.phase}`;
      const baselineHash = baselines[baselineKey];

      // Check for drift
      let hasDrift = false;
      let driftDetails: string | undefined;
      let severity: DriftAnalysis['severity'] = 'none';

      if (baselineHash && baselineHash !== currentHash) {
        hasDrift = true;
        driftDetails = this.analyzeDrift(spec, baselineHash, currentHash);
        severity = this.calculateSeverity(spec, baselineHash, currentHash);

        logWarning('PROMPT DRIFT DETECTED', {
          taskId: spec.taskId,
          phase: spec.phase,
          baselineHash: baselineHash.slice(0, 16),
          currentHash: currentHash.slice(0, 16),
          severity,
          details: driftDetails
        });
      } else if (!baselineHash) {
        // First attestation - establish baseline
        baselines[baselineKey] = currentHash;
        await this.saveBaselines(baselines);

        logInfo('Prompt baseline established', {
          taskId: spec.taskId,
          phase: spec.phase,
          hash: currentHash.slice(0, 16)
        });
      }

      // Record attestation
      const attestation: PromptAttestation = {
        attestation_id: crypto.randomUUID(),
        task_id: spec.taskId,
        phase: spec.phase,
        prompt_hash: currentHash,
        baseline_hash: baselineHash,
        drift_detected: hasDrift,
        drift_details: driftDetails,
        timestamp: new Date().toISOString(),
        agent_type: spec.agentType,
        prompt_version: spec.modelVersion
      };

      await this.recordAttestation(attestation);

      return {
        hasDrift,
        baselineHash,
        currentHash,
        driftDetails,
        severity,
        recommendation: this.getRecommendation(severity)
      };

    } catch (error) {
      logError('Prompt attestation failed', {
        taskId: spec.taskId,
        phase: spec.phase,
        error: error instanceof Error ? error.message : String(error)
      });

      // Return non-drift result on error (fail-open for attestation)
      return {
        hasDrift: false,
        currentHash: '',
        severity: 'none'
      };
    }
  }

  /**
   * Compute SHA-256 hash of prompt specification
   */
  private computePromptHash(spec: PromptSpec): string {
    // Create canonical representation for hashing
    // Order matters for consistency!
    const canonical = {
      phase: spec.phase,
      taskId: spec.taskId,
      requirements: spec.requirements.sort(),  // Sorted for consistency
      qualityGates: spec.qualityGates.sort(),
      artifacts: spec.artifacts.sort(),
      contextSummary: spec.contextSummary,
      agentType: spec.agentType,
      modelVersion: spec.modelVersion
    };

    const canonicalJson = JSON.stringify(canonical);
    return crypto.createHash('sha256').update(canonicalJson).digest('hex');
  }

  /**
   * Analyze prompt drift to provide details
   */
  private analyzeDrift(
    spec: PromptSpec,
    baselineHash: string,
    currentHash: string
  ): string {
    // For now, return generic message
    // Could be enhanced to do field-by-field comparison
    return `Prompt specification changed from baseline (${baselineHash.slice(0, 8)}... → ${currentHash.slice(0, 8)}...)`;
  }

  /**
   * Calculate drift severity
   */
  private calculateSeverity(
    spec: PromptSpec,
    baselineHash: string,
    currentHash: string
  ): DriftAnalysis['severity'] {
    // Severity based on phase criticality
    const criticalPhases: WorkPhase[] = ['VERIFY', 'REVIEW', 'MONITOR'];

    if (criticalPhases.includes(spec.phase)) {
      return 'high';
    }

    const earlyPhases: WorkPhase[] = ['STRATEGIZE', 'SPEC', 'PLAN'];
    if (earlyPhases.includes(spec.phase)) {
      return 'low';
    }

    return 'medium';
  }

  /**
   * Get recommendation based on severity
   */
  private getRecommendation(severity: DriftAnalysis['severity']): string {
    switch (severity) {
      case 'high':
        return 'CRITICAL: Prompt drift in critical phase - review immediately';
      case 'medium':
        return 'WARNING: Prompt drift detected - verify intentional';
      case 'low':
        return 'INFO: Minor prompt drift in early phase';
      case 'none':
      default:
        return 'Prompt specification matches baseline';
    }
  }

  /**
   * Load prompt baselines from disk
   */
  private async loadBaselines(): Promise<Record<string, string>> {
    try {
      const content = await fs.readFile(this.baselinePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  /**
   * Save prompt baselines to disk
   */
  private async saveBaselines(baselines: Record<string, string>): Promise<void> {
    try {
      await fs.writeFile(this.baselinePath, JSON.stringify(baselines, null, 2));
    } catch (error) {
      logError('Failed to save prompt baselines', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Record attestation to JSONL log
   *
   * Uses file locking to prevent race conditions in multi-process scenarios.
   */
  private async recordAttestation(attestation: PromptAttestation): Promise<void> {
    try {
      const lockPath = this.attestationPath + '.lock';

      await withFileLock(lockPath, async () => {
        await fs.appendFile(
          this.attestationPath,
          JSON.stringify(attestation) + '\n'
        );
      });
    } catch (error) {
      logError('Failed to record prompt attestation', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get attestation history for a task
   */
  async getAttestationHistory(taskId: string): Promise<PromptAttestation[]> {
    try {
      if (!await this.fileExists(this.attestationPath)) {
        return [];
      }

      const content = await fs.readFile(this.attestationPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);

      return lines
        .map(line => JSON.parse(line) as PromptAttestation)
        .filter(att => att.task_id === taskId);

    } catch (error) {
      logError('Failed to get attestation history', {
        taskId,
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Get drift statistics
   */
  async getDriftStats(): Promise<{
    totalAttestations: number;
    driftDetections: number;
    driftRate: number;
    severityCounts: Record<string, number>;
  }> {
    try {
      if (!await this.fileExists(this.attestationPath)) {
        return {
          totalAttestations: 0,
          driftDetections: 0,
          driftRate: 0,
          severityCounts: {}
        };
      }

      const content = await fs.readFile(this.attestationPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);

      const attestations = lines.map(line => JSON.parse(line) as PromptAttestation);

      const driftDetections = attestations.filter(a => a.drift_detected).length;
      const driftRate = attestations.length > 0 ? driftDetections / attestations.length : 0;

      return {
        totalAttestations: attestations.length,
        driftDetections,
        driftRate,
        severityCounts: {}  // Would need to store severity in attestation
      };

    } catch (error) {
      logError('Failed to get drift stats', {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        totalAttestations: 0,
        driftDetections: 0,
        driftRate: 0,
        severityCounts: {}
      };
    }
  }

  /**
   * Reset baseline for a task/phase
   * (Use when intentional prompt change is made)
   */
  async resetBaseline(taskId: string, phase: WorkPhase, newHash: string): Promise<void> {
    try {
      const baselines = await this.loadBaselines();
      const baselineKey = `${taskId}:${phase}`;

      baselines[baselineKey] = newHash;
      await this.saveBaselines(baselines);

      logInfo('Prompt baseline reset', {
        taskId,
        phase,
        newHash: newHash.slice(0, 16)
      });

    } catch (error) {
      logError('Failed to reset baseline', {
        taskId,
        phase,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
