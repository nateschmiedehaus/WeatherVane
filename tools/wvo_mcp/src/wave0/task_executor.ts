/**
 * Wave 0 Task Executor
 *
 * Executes a single task end-to-end:
 * - Create evidence bundle
 * - Execute task (placeholder for now - will integrate MCP tools)
 * - Log execution metrics
 * - Handle errors gracefully
 */

import fs from "node:fs";
import path from "node:path";
import { resolveStateRoot } from "../utils/config.js";
import { logInfo, logError, logWarning } from "../telemetry/logger.js";
import { EvidenceScaffolder } from "./evidence_scaffolder.js";
import { MCPClient } from "./mcp_client.js";
import {
  executeStrategize,
  executeSpec,
  executePlan,
  executeThink,
  executeGate,
  executeImplement,
  executeVerify,
  executeReview,
  type PhaseContext
} from "./phase_executors.js";
import { StigmergicEnforcer } from "../enforcement/stigmergic_enforcer.js";

export interface Task {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "done" | "blocked";
}

export interface ExecutionResult {
  taskId: string;
  status: "completed" | "blocked" | "error";
  startTime: Date;
  endTime: Date;
  executionTimeMs: number;
  error?: string;
}

export class TaskExecutor {
  private workspaceRoot: string;
  private stateRoot: string;
  private evidenceScaffolder: EvidenceScaffolder;
  private enforcer: StigmergicEnforcer;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.stateRoot = resolveStateRoot(workspaceRoot);
    this.evidenceScaffolder = new EvidenceScaffolder(workspaceRoot);
    this.enforcer = new StigmergicEnforcer(workspaceRoot);
  }

  async execute(task: Task): Promise<ExecutionResult> {
    const startTime = new Date();
    logInfo(`TaskExecutor: Starting task ${task.id}`, { taskId: task.id });

    try {
      // Create evidence bundle
      await this.createEvidenceBundle(task);

      const startTimestamp = startTime.toISOString();
      this.evidenceScaffolder.updateSummary(task.id, task.title, {
        status: "in_progress",
        stage: "implementation",
        note: "Wave 0 autopilot is executing the placeholder implementation step.",
        timestamp: startTimestamp,
      });
      this.evidenceScaffolder.updatePhase(
        task.id,
        "implement",
        "in_progress",
        `Implementation started at ${startTimestamp}.`,
      );

      // Execute task (placeholder - actual execution would call MCP tools)
      await this.performImplementation(task);

      const implementationComplete = new Date().toISOString();
      this.evidenceScaffolder.updatePhase(
        task.id,
        "implement",
        "done",
        `Placeholder implementation logged at ${implementationComplete}.`,
      );
      this.evidenceScaffolder.updateSummary(task.id, task.title, {
        status: "in_progress",
        stage: "implementation",
        note: "Implementation recorded; awaiting proof verification.",
        timestamp: implementationComplete,
      });

      // Success
      const endTime = new Date();
      const result: ExecutionResult = {
        taskId: task.id,
        status: "completed",
        startTime,
        endTime,
        executionTimeMs: endTime.getTime() - startTime.getTime(),
      };

      await this.logExecution(result);
      logInfo(`TaskExecutor: Task completed ${task.id}`, { result });

      return result;
    } catch (error) {
      // Handle errors gracefully
      const endTime = new Date();
      const result: ExecutionResult = {
        taskId: task.id,
        status: "error",
        startTime,
        endTime,
        executionTimeMs: endTime.getTime() - startTime.getTime(),
        error: error instanceof Error ? error.message : String(error),
      };

      await this.logExecution(result);
      logError(`TaskExecutor: Task failed ${task.id}`, { error, result });

      return result;
    }
  }

  private async createEvidenceBundle(task: Task): Promise<void> {
    const evidencePath = path.join(this.stateRoot, "evidence", task.id);

    // Create directory if it doesn't exist
    if (!fs.existsSync(evidencePath)) {
      fs.mkdirSync(evidencePath, { recursive: true });
      logInfo(`TaskExecutor: Created evidence bundle`, { evidencePath });
    }

    this.evidenceScaffolder.seed(task.id, task.title);
  }

  private async performImplementation(task: Task): Promise<void> {
    logInfo(`TaskExecutor: Starting full AFP execution for ${task.id}`);

    const mcp = new MCPClient();
    await mcp.initialize();

    const context: PhaseContext = {};
    const evidenceDir = path.join(this.stateRoot, "evidence", task.id);

    try {
      // STRATEGIZE Phase
      logInfo(`TaskExecutor: Executing STRATEGIZE for ${task.id}`);
      this.enforcer.recordPhaseStart(task.id, "strategize");
      this.evidenceScaffolder.updatePhase(task.id, "strategize", "in_progress");
      const strategyContent = await executeStrategize(task, mcp);
      context.strategy = strategyContent;
      fs.writeFileSync(path.join(evidenceDir, "strategy.md"), strategyContent, "utf-8");

      // Enforce quality before marking done
      const strategizeResult = await this.enforcer.enforcePhaseCompletion(task, "strategize", context);
      if (!strategizeResult.approved) {
        logWarning(`TaskExecutor: STRATEGIZE blocked by enforcer`, {
          taskId: task.id,
          concerns: strategizeResult.concerns
        });
        this.evidenceScaffolder.updatePhase(task.id, "strategize", "blocked",
          `Quality enforcement blocked: ${strategizeResult.concerns.join(", ")}`);
        return;
      }

      this.evidenceScaffolder.updatePhase(task.id, "strategize", "done", "Strategic analysis complete");

      // SPEC Phase
      logInfo(`TaskExecutor: Executing SPEC for ${task.id}`);
      this.enforcer.recordPhaseStart(task.id, "spec");
      this.evidenceScaffolder.updatePhase(task.id, "spec", "in_progress");
      const specContent = await executeSpec(task, mcp, context);
      context.spec = specContent;
      fs.writeFileSync(path.join(evidenceDir, "spec.md"), specContent, "utf-8");

      // Enforce quality before marking done
      const specResult = await this.enforcer.enforcePhaseCompletion(task, "spec", context);
      if (!specResult.approved) {
        logWarning(`TaskExecutor: SPEC blocked by enforcer`, {
          taskId: task.id,
          concerns: specResult.concerns
        });
        this.evidenceScaffolder.updatePhase(task.id, "spec", "blocked",
          `Quality enforcement blocked: ${specResult.concerns.join(", ")}`);
        return;
      }

      this.evidenceScaffolder.updatePhase(task.id, "spec", "done", "Specifications defined");

      // PLAN Phase
      logInfo(`TaskExecutor: Executing PLAN for ${task.id}`);
      this.enforcer.recordPhaseStart(task.id, "plan");
      this.evidenceScaffolder.updatePhase(task.id, "plan", "in_progress");
      const planContent = await executePlan(task, mcp, context);
      context.plan = planContent;
      fs.writeFileSync(path.join(evidenceDir, "plan.md"), planContent, "utf-8");

      // Enforce quality before marking done
      const planResult = await this.enforcer.enforcePhaseCompletion(task, "plan", context);
      if (!planResult.approved) {
        logWarning(`TaskExecutor: PLAN blocked by enforcer`, {
          taskId: task.id,
          concerns: planResult.concerns
        });
        this.evidenceScaffolder.updatePhase(task.id, "plan", "blocked",
          `Quality enforcement blocked: ${planResult.concerns.join(", ")}`);
        return;
      }

      this.evidenceScaffolder.updatePhase(task.id, "plan", "done", "Plan and tests authored");

      // THINK Phase
      logInfo(`TaskExecutor: Executing THINK for ${task.id}`);
      this.enforcer.recordPhaseStart(task.id, "think");
      this.evidenceScaffolder.updatePhase(task.id, "think", "in_progress");
      const thinkContent = await executeThink(task, mcp, context);
      context.think = thinkContent;
      fs.writeFileSync(path.join(evidenceDir, "think.md"), thinkContent, "utf-8");

      // Enforce quality before marking done
      const thinkResult = await this.enforcer.enforcePhaseCompletion(task, "think", context);
      if (!thinkResult.approved) {
        logWarning(`TaskExecutor: THINK blocked by enforcer`, {
          taskId: task.id,
          concerns: thinkResult.concerns
        });
        this.evidenceScaffolder.updatePhase(task.id, "think", "blocked",
          `Quality enforcement blocked: ${thinkResult.concerns.join(", ")}`);
        return;
      }

      this.evidenceScaffolder.updatePhase(task.id, "think", "done", "Edge cases analyzed");

      // GATE Phase (Design with quality validation)
      logInfo(`TaskExecutor: Executing GATE for ${task.id}`);
      this.enforcer.recordPhaseStart(task.id, "design");
      this.evidenceScaffolder.updatePhase(task.id, "design", "in_progress");
      const gateResult = await executeGate(task, mcp, context);

      // Write design.md file for stigmergic enforcement (generate from context)
      const designContent = `# Design

**Task:** ${task.title}
**Date:** ${new Date().toISOString()}

## Design Decision

${gateResult.approved ? `Design approved with score ${gateResult.score}/9` : `Design needs revision: ${gateResult.concerns?.join(', ')}`}

## Context

Based on strategy, spec, and plan phases, this design has been evaluated by the DesignReviewer.

${gateResult.remediation ? `## Remediation\n\n${gateResult.remediation}` : ''}
`;
      fs.writeFileSync(path.join(evidenceDir, "design.md"), designContent, "utf-8");

      if (!gateResult.approved) {
        logWarning(`TaskExecutor: GATE phase blocked for ${task.id}`, { concerns: gateResult.concerns });
        this.evidenceScaffolder.updatePhase(task.id, "design", "blocked",
          `Quality gate failed: ${gateResult.concerns?.join(", ")}`);

        // Attempt remediation (max 3 attempts)
        // For Wave 0.0, we'll skip remediation and escalate
        this.evidenceScaffolder.appendImplementLog(
          task.id,
          `Wave 0 blocked at GATE phase. DesignReviewer concerns: ${gateResult.concerns?.join(", ")}`
        );
        return;
      }

      // Additional stigmergic enforcement on top of DesignReviewer
      const designResult = await this.enforcer.enforcePhaseCompletion(task, "design", context);
      if (!designResult.approved) {
        logWarning(`TaskExecutor: DESIGN blocked by enforcer`, {
          taskId: task.id,
          concerns: designResult.concerns
        });
        this.evidenceScaffolder.updatePhase(task.id, "design", "blocked",
          `Quality enforcement blocked: ${designResult.concerns.join(", ")}`);
        return;
      }

      this.evidenceScaffolder.updatePhase(task.id, "design", "done",
        `Design approved (score: ${gateResult.score}/9)`);

      // IMPLEMENT Phase
      logInfo(`TaskExecutor: Executing IMPLEMENT for ${task.id}`);
      this.enforcer.recordPhaseStart(task.id, "implement");
      this.evidenceScaffolder.updatePhase(task.id, "implement", "in_progress");
      const implementResult = await executeImplement(task, mcp, context);
      context.implement = `Files changed: ${implementResult.filesChanged.join(", ")}
LOC added: ${implementResult.locAdded}
LOC deleted: ${implementResult.locDeleted}`;

      // Write implement.md for stigmergic enforcement
      const implementContent = `# Implementation

**Task:** ${task.title}
**Date:** ${new Date().toISOString()}

## Changes Made

- Files changed: ${implementResult.filesChanged.length}
- LOC added: ${implementResult.locAdded}
- LOC deleted: ${implementResult.locDeleted}

## Files Changed

${implementResult.filesChanged.map((f: string) => `- ${f}`).join('\n')}

## Summary

Implementation completed successfully. Tests ${implementResult.testsPassed ? 'passed' : 'need attention'}.
`;
      fs.writeFileSync(path.join(evidenceDir, "implement.md"), implementContent, "utf-8");

      // Enforce quality before marking done
      const implementEnforceResult = await this.enforcer.enforcePhaseCompletion(task, "implement", context);
      if (!implementEnforceResult.approved) {
        logWarning(`TaskExecutor: IMPLEMENT blocked by enforcer`, {
          taskId: task.id,
          concerns: implementEnforceResult.concerns
        });
        this.evidenceScaffolder.updatePhase(task.id, "implement", "blocked",
          `Quality enforcement blocked: ${implementEnforceResult.concerns.join(", ")}`);
        return;
      }

      this.evidenceScaffolder.appendImplementLog(
        task.id,
        `Wave 0 implemented ${task.title}. Files changed: ${implementResult.filesChanged.length}, ` +
        `LOC: +${implementResult.locAdded} -${implementResult.locDeleted}`
      );
      this.evidenceScaffolder.updatePhase(task.id, "implement", "done", "Implementation complete");

      // VERIFY Phase
      logInfo(`TaskExecutor: Executing VERIFY for ${task.id}`);
      this.enforcer.recordPhaseStart(task.id, "verify");
      this.evidenceScaffolder.updatePhase(task.id, "verify", "in_progress");
      const verifyResult = await executeVerify(task, mcp, context);
      context.verify = `Build: ${verifyResult.buildPassed ? "PASSED" : "FAILED"}
Tests: ${verifyResult.testsPassed ? "PASSED" : "FAILED"}
Test count: ${verifyResult.testCount}
Failures: ${verifyResult.failureCount}`;

      // Write verify.md for stigmergic enforcement
      const verifyContent = `# Verification

**Task:** ${task.title}
**Date:** ${new Date().toISOString()}

## Test Results

- Build: ${verifyResult.buildPassed ? "✅ PASSED" : "❌ FAILED"}
- Tests: ${verifyResult.testsPassed ? "✅ PASSED" : "❌ FAILED"}
- Test count: ${verifyResult.testCount}
- Failures: ${verifyResult.failureCount}

## Test Details

Tests executed. Total: ${verifyResult.testCount}, Failures: ${verifyResult.failureCount}

## Summary

All verification checks ${verifyResult.buildPassed && verifyResult.testsPassed ? 'passed' : 'failed'}.
`;
      fs.writeFileSync(path.join(evidenceDir, "verify.md"), verifyContent, "utf-8");

      if (!verifyResult.buildPassed || !verifyResult.testsPassed) {
        logWarning(`TaskExecutor: Verification failed for ${task.id}`, { verifyResult });
        this.evidenceScaffolder.updatePhase(task.id, "verify", "blocked", "Build or tests failed");
        return;
      }

      // Enforce quality before marking done
      const verifyEnforceResult = await this.enforcer.enforcePhaseCompletion(task, "verify", context);
      if (!verifyEnforceResult.approved) {
        logWarning(`TaskExecutor: VERIFY blocked by enforcer`, {
          taskId: task.id,
          concerns: verifyEnforceResult.concerns
        });
        this.evidenceScaffolder.updatePhase(task.id, "verify", "blocked",
          `Quality enforcement blocked: ${verifyEnforceResult.concerns.join(", ")}`);
        return;
      }

      this.evidenceScaffolder.updatePhase(task.id, "verify", "done", "All verifications passed");

      // REVIEW Phase
      logInfo(`TaskExecutor: Executing REVIEW for ${task.id}`);
      this.enforcer.recordPhaseStart(task.id, "review");
      this.evidenceScaffolder.updatePhase(task.id, "review", "in_progress");
      const reviewContent = await executeReview(task, mcp, context);
      context.review = reviewContent;
      fs.writeFileSync(path.join(evidenceDir, "review.md"), reviewContent, "utf-8");

      // Enforce quality before marking done
      const reviewResult = await this.enforcer.enforcePhaseCompletion(task, "review", context);
      if (!reviewResult.approved) {
        logWarning(`TaskExecutor: REVIEW blocked by enforcer`, {
          taskId: task.id,
          concerns: reviewResult.concerns
        });
        this.evidenceScaffolder.updatePhase(task.id, "review", "blocked",
          `Quality enforcement blocked: ${reviewResult.concerns.join(", ")}`);
        return;
      }

      this.evidenceScaffolder.updatePhase(task.id, "review", "done", "Review complete");

      // Update final summary
      this.evidenceScaffolder.updateSummary(task.id, task.title, {
        status: "done",
        stage: "final",
        note: "Wave 0 successfully executed all AFP phases and delivered implementation"
      });

      logInfo(`TaskExecutor: Successfully completed all phases for ${task.id}`);

    } catch (error) {
      logError(`TaskExecutor: Phase execution failed for ${task.id}`, { error });
      this.evidenceScaffolder.appendImplementLog(
        task.id,
        `Wave 0 encountered error: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    } finally {
      await mcp.cleanup();
    }
  }

  private async logExecution(result: ExecutionResult): Promise<void> {
    const logPath = path.join(this.stateRoot, "analytics", "wave0_runs.jsonl");

    // Ensure directory exists
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Append to JSONL log
    const logEntry = {
      ...result,
      timestamp: new Date().toISOString(),
    };

    fs.appendFileSync(logPath, JSON.stringify(logEntry) + "\n", "utf-8");
  }
}
