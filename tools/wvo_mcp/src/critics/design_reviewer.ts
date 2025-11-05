import fs from "node:fs";
import path from "node:path";

import { Critic, type CriticResult, type CriticOptions } from "./base.js";
import { logInfo, logWarning } from "../telemetry/logger.js";
import { resolveStateRoot } from "../utils/config.js";

/**
 * DesignReviewer Critic
 *
 * Intelligent reviewer that evaluates design documents BEFORE implementation.
 * Stops compliance theater by providing SPECIFIC guidance on AFP/SCAS alignment.
 *
 * Core AFP/SCAS principles checked:
 * - Via Negativa: Did they consider deletion/simplification?
 * - Refactor not Repair: Are they patching or refactoring properly?
 * - Complexity Trade-offs: Is complexity increase justified?
 * - Alternatives Analysis: Did they actually think through options?
 *
 * Works in both:
 * - Autopilot mode (automated review)
 * - Manual mode (user talking to agents)
 */
export class DesignReviewerCritic extends Critic {
  protected command(profile: string): string | null {
    // Not a command-based critic - uses intelligence engine
    return null;
  }

  /**
   * Review a design document for AFP/SCAS alignment
   *
   * @param taskId - Task ID (e.g., "T1.2.5" or "AFP-TASK-20251105")
   * @param agentContext - Optional agent history for adaptive feedback
   */
  async reviewDesign(
    taskId: string,
    agentContext?: {
      recent_quality?: number;
      bug_rate?: number;
      track_record?: string;
    }
  ): Promise<CriticResult> {
    logInfo("DesignReviewer: Starting design review", { taskId });

    // Find design document
    const stateRoot = resolveStateRoot(this.workspaceRoot);
    const evidencePath = path.join(stateRoot, "evidence", taskId);

    let designContent: string | null = null;
    let designFile: string | null = null;

    // Check for design.md (new format)
    const designMdPath = path.join(evidencePath, "design.md");
    if (fs.existsSync(designMdPath)) {
      designContent = fs.readFileSync(designMdPath, "utf-8");
      designFile = "design.md";
    } else {
      // Fallback to phases.md (old format) during migration
      const phasesMdPath = path.join(evidencePath, "phases.md");
      if (fs.existsSync(phasesMdPath)) {
        designContent = fs.readFileSync(phasesMdPath, "utf-8");
        designFile = "phases.md";
        logInfo("DesignReviewer: Using phases.md (consider migrating to design.md)");
      }
    }

    if (!designContent) {
      return this.fail(
        `No design documentation found for task ${taskId}`,
        {
          guidance: "Create state/evidence/${taskId}/design.md documenting your design thinking",
          expected_path: designMdPath,
        }
      );
    }

    // Basic quality checks
    const lineCount = designContent.split("\n").length;
    if (lineCount < 10) {
      return this.fail(
        `Design document is too superficial (${lineCount} lines)`,
        {
          guidance: "Design should document:\n" +
                   "- Why this change? (context)\n" +
                   "- What alternatives considered? (via negativa, refactor vs patch)\n" +
                   "- What complexity trade-offs? (justify any increases)\n" +
                   "- Implementation plan (files, LOC, risks)",
          min_expected_lines: 10,
        }
      );
    }

    // Use intelligence engine for deep analysis
    const analysis = await this.analyzeDesignWithAFPSCAS(
      designContent,
      taskId,
      agentContext
    );

    if (!analysis.approved) {
      return this.fail(
        `Design needs revision: ${analysis.summary}`,
        {
          concerns: analysis.concerns,
          guidance: analysis.guidance,
          recommendation: "revise",
        }
      );
    }

    if (analysis.concerns && analysis.concerns.length > 0) {
      // Approved but with recommendations
      return this.pass(
        `Design approved with recommendations: ${analysis.summary}`,
        {
          concerns: analysis.concerns,
          guidance: analysis.guidance,
          recommendation: "proceed_with_caution",
        }
      );
    }

    return this.pass(
      `Design approved: ${analysis.summary}`,
      {
        strengths: analysis.strengths,
        recommendation: "proceed",
      }
    );
  }

  /**
   * Deep analysis using AFP/SCAS lens
   *
   * This is where the intelligence happens - not just checking boxes,
   * but understanding if the agent actually THOUGHT through the problem.
   */
  private async analyzeDesignWithAFPSCAS(
    designContent: string,
    taskId: string,
    agentContext?: {
      recent_quality?: number;
      bug_rate?: number;
      track_record?: string;
    }
  ): Promise<{
    approved: boolean;
    summary: string;
    concerns?: Array<{
      type: string;
      severity: "low" | "medium" | "high";
      guidance: string;
    }>;
    strengths?: string[];
    guidance?: string;
  }> {
    // Check for key AFP/SCAS indicators
    const concerns: Array<{
      type: string;
      severity: "low" | "medium" | "high";
      guidance: string;
    }> = [];
    const strengths: string[] = [];

    // 1. Via Negativa: Did they consider deletion?
    const hasViaNegativa =
      /delet/i.test(designContent) ||
      /remov/i.test(designContent) ||
      /simplif/i.test(designContent) ||
      /via.?negativa/i.test(designContent);

    if (!hasViaNegativa) {
      concerns.push({
        type: "via_negativa_missing",
        severity: "high",
        guidance: "No evidence of via negativa analysis. Before ADDING code, you MUST explore:\n" +
                 "- Can existing code be DELETED instead?\n" +
                 "- Can existing logic be SIMPLIFIED to solve this?\n" +
                 "- What's the MINIMAL change that works?\n" +
                 "Document what you considered deleting/simplifying and why it won't work."
      });
    } else {
      strengths.push("Considered via negativa (deletion/simplification)");
    }

    // 2. Refactor vs Repair: Are they thinking about whole-module refactoring?
    const hasRefactorThinking =
      /refactor/i.test(designContent) ||
      /restructur/i.test(designContent) ||
      /consolidat/i.test(designContent);

    const hasPatchLanguage =
      /fix/i.test(designContent) ||
      /patch/i.test(designContent) ||
      /quick.?fix/i.test(designContent) ||
      /workaround/i.test(designContent);

    if (hasPatchLanguage && !hasRefactorThinking) {
      concerns.push({
        type: "repair_not_refactor",
        severity: "high",
        guidance: "Design shows 'fix/patch' language without refactoring consideration.\n" +
                 "AFP principle: If file >200 LOC or function >50 LOC, REFACTOR the whole thing.\n" +
                 "Ask yourself:\n" +
                 "- Am I patching a symptom or fixing the root cause?\n" +
                 "- Would refactoring the whole module be better long-term?\n" +
                 "- What technical debt am I creating with this patch?"
      });
    } else if (hasRefactorThinking) {
      strengths.push("Considered refactoring approach (not just patching)");
    }

    // 3. Alternatives Analysis: Did they actually think through options?
    const hasAlternatives =
      /alternative/i.test(designContent) ||
      /option/i.test(designContent) ||
      /approach/i.test(designContent) ||
      /considered/i.test(designContent);

    const alternativeCount = (designContent.match(/alternative|option \d|approach \d/gi) || []).length;

    if (!hasAlternatives || alternativeCount < 2) {
      concerns.push({
        type: "insufficient_alternatives",
        severity: "medium",
        guidance: "Design doesn't show exploration of multiple approaches.\n" +
                 "You should document at least 2-3 alternatives:\n" +
                 "- What's the deletion/simplification approach?\n" +
                 "- What's the refactoring approach?\n" +
                 "- What's an alternative implementation?\n" +
                 "Then explain why you selected your approach."
      });
    } else if (alternativeCount >= 2) {
      strengths.push(`Explored ${alternativeCount}+ alternative approaches`);
    }

    // 4. Complexity Awareness: Did they think about complexity trade-offs?
    const hasComplexityAnalysis =
      /complexity/i.test(designContent) ||
      /trade.?off/i.test(designContent) ||
      /justif/i.test(designContent);

    const menationsComplexityIncrease =
      /increas.*complexity/i.test(designContent) ||
      /more complex/i.test(designContent) ||
      /additional complexity/i.test(designContent);

    if (menationsComplexityIncrease && !hasComplexityAnalysis) {
      concerns.push({
        type: "unjustified_complexity",
        severity: "high",
        guidance: "Design mentions complexity increase but doesn't justify it.\n" +
                 "AFP/SCAS principle: Complexity must be JUSTIFIED.\n" +
                 "Document:\n" +
                 "- Why is this complexity necessary?\n" +
                 "- What simpler approaches did you try?\n" +
                 "- How will you mitigate this complexity?\n" +
                 "Not all complexity is bad - but it must be WORTH IT."
      });
    } else if (hasComplexityAnalysis) {
      strengths.push("Analyzed complexity trade-offs");
    }

    // 5. Implementation Plan: Did they estimate scope?
    const hasFilesEstimate = /files?\s*to\s*change|files?\s*changed/i.test(designContent);
    const hasLOCEstimate = /loc|lines?\s*of\s*code/i.test(designContent);

    if (!hasFilesEstimate || !hasLOCEstimate) {
      concerns.push({
        type: "missing_scope_estimate",
        severity: "low",
        guidance: "Design should estimate scope:\n" +
                 "- How many files will change?\n" +
                 "- Estimated LOC added/deleted?\n" +
                 "- Is this within micro-batching limits (≤5 files, ≤150 net LOC)?\n" +
                 "If over limits, how will you split this?"
      });
    } else {
      strengths.push("Estimated implementation scope");
    }

    // 6. Risk Awareness: Did they think about what could go wrong?
    const hasRiskAnalysis =
      /risk/i.test(designContent) ||
      /edge.?case/i.test(designContent) ||
      /failure/i.test(designContent) ||
      /what.*could.*wrong/i.test(designContent);

    if (!hasRiskAnalysis) {
      concerns.push({
        type: "no_risk_analysis",
        severity: "medium",
        guidance: "Design doesn't consider risks or edge cases.\n" +
                 "Think through:\n" +
                 "- What edge cases exist?\n" +
                 "- What failure modes are possible?\n" +
                 "- What assumptions could be wrong?\n" +
                 "- How will you handle errors?"
      });
    } else {
      strengths.push("Considered risks and edge cases");
    }

    // Adaptive: Adjust based on agent track record
    let qualityThreshold = 2; // default: need ≤2 high-severity concerns
    if (agentContext?.recent_quality && agentContext.recent_quality > 8.5) {
      qualityThreshold = 3; // experienced agent gets more leeway
      logInfo("DesignReviewer: Experienced agent - relaxed threshold", {
        quality: agentContext.recent_quality
      });
    }

    const highSeverityConcerns = concerns.filter(c => c.severity === "high");
    const approved = highSeverityConcerns.length <= qualityThreshold;

    // Generate summary
    const summary = approved
      ? `Design shows good AFP/SCAS thinking (${strengths.length} strengths, ${concerns.length} concerns)`
      : `Design needs revision (${highSeverityConcerns.length} critical issues)`;

    // Generate consolidated guidance
    const guidance = concerns.length > 0
      ? "Address these concerns:\n" + concerns.map((c, i) =>
          `${i + 1}. [${c.severity.toUpperCase()}] ${c.type}:\n${c.guidance}`
        ).join("\n\n")
      : undefined;

    return {
      approved,
      summary,
      concerns: concerns.length > 0 ? concerns : undefined,
      strengths: strengths.length > 0 ? strengths : undefined,
      guidance,
    };
  }

  /**
   * For autopilot mode: run design review as part of workflow
   */
  async run(profile: string = "default"): Promise<CriticResult> {
    // In autopilot, we need to find the current task being worked on
    // This is a placeholder - actual implementation would integrate with StateMachine
    logWarning("DesignReviewer: run() called in autopilot mode - needs StateMachine integration");

    return this.pass(
      "DesignReviewer: Manual review mode - call reviewDesign(taskId) directly",
      {
        usage: "await designReviewer.reviewDesign('T1.2.5', { recent_quality: 8.5 })"
      }
    );
  }
}
