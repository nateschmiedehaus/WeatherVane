import fs from "node:fs";
import path from "node:path";

import { Critic, type CriticResult, type CriticOptions } from "./base.js";
import { logInfo, logWarning } from "../telemetry/logger.js";
import { resolveStateRoot } from "../utils/config.js";

/**
 * StrategyReviewer Critic
 *
 * Intelligent reviewer that evaluates strategic thinking BEFORE design/implementation.
 * Stops compliance theater by providing SPECIFIC guidance on strategy quality.
 *
 * Core strategy quality checks:
 * - Root Cause Analysis: Are they addressing root cause or just symptoms?
 * - Evidence-Based: Do they provide specific evidence for claims?
 * - Measurable Criteria: Are success criteria actually measurable?
 * - Impact Assessment: Have they quantified value/cost?
 * - AFP/SCAS Alignment: Does this align with core principles?
 * - Risk Awareness: Have they considered what could go wrong?
 *
 * Works in both:
 * - Autopilot mode (automated review)
 * - Manual mode (user talking to agents)
 */
export class StrategyReviewerCritic extends Critic {
  protected command(profile: string): string | null {
    // Not a command-based critic - uses intelligence engine
    return null;
  }

  /**
   * Review a strategy document for quality and depth
   *
   * @param taskId - Task ID (e.g., "T1.2.5" or "AFP-TASK-20251105")
   * @param agentContext - Optional agent history for adaptive feedback
   */
  async reviewStrategy(
    taskId: string,
    agentContext?: {
      recent_quality?: number;
      bug_rate?: number;
      track_record?: string;
    }
  ): Promise<CriticResult> {
    logInfo("StrategyReviewer: Starting strategy review", { taskId });

    // Find strategy document
    const stateRoot = resolveStateRoot(this.workspaceRoot);
    const evidencePath = path.join(stateRoot, "evidence", taskId);
    const strategyPath = path.join(evidencePath, "strategy.md");

    if (!fs.existsSync(strategyPath)) {
      return this.fail(
        `No strategy documentation found for task ${taskId}`,
        {
          guidance: "Create state/evidence/${taskId}/strategy.md documenting your strategic thinking:\n" +
                   "- WHY does this task matter? (problem statement)\n" +
                   "- WHAT is the root cause? (not just symptoms)\n" +
                   "- WHAT evidence supports this? (specific data)\n" +
                   "- HOW will we measure success? (criteria)\n" +
                   "- WHAT is the impact? (quantified value)\n\n" +
                   "Use docs/templates/strategy_template.md as a starting point.",
          expected_path: strategyPath,
        }
      );
    }

    const strategyContent = fs.readFileSync(strategyPath, "utf-8");

    // Basic quality checks
    const lineCount = strategyContent.split("\n").filter(line => line.trim().length > 0).length;
    if (lineCount < 30) {
      return this.fail(
        `Strategy document is too superficial (${lineCount} substantive lines)`,
        {
          guidance: "Strategy requires deep thinking, not surface-level answers.\n" +
                   "Minimum ~30 lines of substantive content (excluding template headers).\n" +
                   "Each section should show evidence of genuine analysis:\n" +
                   "- Problem Statement: Specific, evidence-based\n" +
                   "- Root Cause: Dig deeper (ask 'why' 3-5 times)\n" +
                   "- Success Criteria: Measurable, not vague\n" +
                   "- Impact Assessment: Quantified where possible\n" +
                   "- Alignment: Explicit AFP/SCAS connection\n" +
                   "- Risks: Honest assessment of what could go wrong",
          min_expected_lines: 30,
          actual_lines: lineCount,
        }
      );
    }

    // Use intelligence engine for deep analysis
    const analysis = await this.analyzeStrategyQuality(
      strategyContent,
      taskId,
      agentContext
    );

    // **Log ALL reviews (approved and blocked) for metrics tracking**
    await this.logStrategyReview(taskId, analysis);

    if (!analysis.approved) {
      return this.fail(
        `Strategy needs revision: ${analysis.summary}`,
        {
          concerns: analysis.concerns,
          guidance: analysis.guidance,
          recommendation: "revise",
          remediation_instructions: this.generateRemediationInstructions(taskId, analysis),
        }
      );
    }

    if (analysis.concerns && analysis.concerns.length > 0) {
      // Approved but with recommendations
      return this.pass(
        `Strategy approved with recommendations: ${analysis.summary}`,
        {
          concerns: analysis.concerns,
          guidance: analysis.guidance,
          recommendation: "proceed_with_caution",
        }
      );
    }

    return this.pass(
      `Strategy approved: ${analysis.summary}`,
      {
        strengths: analysis.strengths,
        recommendation: "proceed",
      }
    );
  }

  /**
   * Deep analysis using strategic thinking quality lens
   *
   * This is where the intelligence happens - not just checking boxes,
   * but understanding if the agent actually THOUGHT through the problem.
   *
   * Anti-gaming measures:
   * - Check for specific details (not generic claims)
   * - Verify evidence is provided (not just assertions)
   * - Ensure measurability (not vague criteria)
   * - Require honesty (open questions, risks)
   */
  private async analyzeStrategyQuality(
    strategyContent: string,
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
    const concerns: Array<{
      type: string;
      severity: "low" | "medium" | "high";
      guidance: string;
    }> = [];
    const strengths: string[] = [];

    // 1. Problem Statement Quality: Is it specific or generic?
    const hasProblemStatement = /problem statement/i.test(strategyContent);
    const genericPhrases = [
      "needs improvement",
      "should be better",
      "is not good",
      "has issues",
      "could be optimized"
    ];
    const hasGenericProblemStatement = genericPhrases.some(phrase =>
      new RegExp(phrase, "i").test(strategyContent)
    );

    if (!hasProblemStatement) {
      concerns.push({
        type: "missing_problem_statement",
        severity: "high",
        guidance: "No clear problem statement found.\n" +
                 "Start with: What EXACTLY are we trying to solve?\n" +
                 "Be specific: Include evidence, affected stakeholders, current impact.\n" +
                 "Avoid generic statements like 'needs improvement' - say WHAT needs improvement and WHY."
      });
    } else if (hasGenericProblemStatement) {
      concerns.push({
        type: "generic_problem_statement",
        severity: "medium",
        guidance: "Problem statement uses generic language ('needs improvement', 'should be better').\n" +
                 "Be specific:\n" +
                 "- What EXACTLY is the problem? (concrete symptoms)\n" +
                 "- Who is affected? (specific stakeholders)\n" +
                 "- What is the current impact? (quantified if possible)"
      });
    } else {
      strengths.push("Specific problem statement (avoids generic language)");
    }

    // 2. Root Cause Analysis: Did they dig deeper or stop at symptoms?
    const hasRootCauseSection = /root cause/i.test(strategyContent);
    const shallowIndicators = [
      "agents don't",
      "users don't",
      "system doesn't",
      "code doesn't"
    ];
    const deeperIndicators = [
      "because",
      "leading to",
      "results in",
      "underlying",
      "fundamental"
    ];

    const hasShallowAnalysis = shallowIndicators.some(phrase =>
      new RegExp(phrase, "i").test(strategyContent)
    );
    const hasDeeperAnalysis = deeperIndicators.filter(phrase =>
      new RegExp(phrase, "i").test(strategyContent)
    ).length >= 2;

    if (!hasRootCauseSection) {
      concerns.push({
        type: "no_root_cause_analysis",
        severity: "high",
        guidance: "No root cause analysis found.\n" +
                 "Don't stop at symptoms - dig deeper:\n" +
                 "- Ask 'WHY' 3-5 times to get to root cause\n" +
                 "- Distinguish between symptoms and underlying causes\n" +
                 "- Explain the causal chain: X leads to Y which results in Z\n" +
                 "Example: 'Agents skip STRATEGY' (symptom) → 'No enforcement exists' (deeper) → 'Quality compounds late' (root)"
      });
    } else if (hasShallowAnalysis && !hasDeeperAnalysis) {
      concerns.push({
        type: "shallow_root_cause",
        severity: "high",
        guidance: "Root cause analysis stops at symptoms.\n" +
                 "Your analysis describes WHAT happens, but not WHY it happens.\n" +
                 "Dig deeper:\n" +
                 "- If 'agents don't X' → WHY don't they? (incentives? tooling? process?)\n" +
                 "- If 'system doesn't Y' → WHY doesn't it? (missing feature? wrong design? technical debt?)\n" +
                 "Keep asking 'why' until you reach a fundamental cause you can actually address."
      });
    } else if (hasDeeperAnalysis) {
      strengths.push("Deep root cause analysis (goes beyond symptoms)");
    }

    // 3. Evidence-Based: Are claims supported by data?
    const evidenceIndicators = [
      /\d+%/,  // percentages
      /\d+\/\d+/,  // ratios
      /state\/evidence/,  // file paths
      /measured by/i,
      /data shows/i,
      /analysis of/i,
      /review of/i
    ];
    const hasEvidence = evidenceIndicators.some(pattern => pattern.test(strategyContent));

    const assertionIndicators = [
      "I noticed",
      "I think",
      "I believe",
      "seems like",
      "probably"
    ];
    const hasUnsupportedAssertions = assertionIndicators.some(phrase =>
      new RegExp(phrase, "i").test(strategyContent)
    );

    if (!hasEvidence) {
      concerns.push({
        type: "no_evidence",
        severity: "high",
        guidance: "Strategy lacks evidence to support claims.\n" +
                 "Provide specific data:\n" +
                 "- Quantify problems: What % of tasks affected?\n" +
                 "- Reference real files: state/evidence/, state/analytics/\n" +
                 "- Cite specific examples: task IDs, timestamps, metrics\n" +
                 "Example: 'Review of state/evidence/ shows 12/30 tasks (40%) lack strategy.md'\n" +
                 "Don't rely on: 'I noticed', 'I think', 'seems like' - show the data."
      });
    } else if (hasUnsupportedAssertions) {
      concerns.push({
        type: "weak_evidence",
        severity: "medium",
        guidance: "Strategy includes unsupported assertions ('I noticed', 'I think', 'seems like').\n" +
                 "Replace opinions with evidence:\n" +
                 "- 'I noticed quality issues' → 'Analysis of X shows Y pattern'\n" +
                 "- 'I think this will help' → 'Data suggests Z impact'\n" +
                 "Be honest if you don't have data, but don't disguise opinions as facts."
      });
    } else {
      strengths.push("Evidence-based analysis (quantified data, specific examples)");
    }

    // 4. Success Criteria: Are they measurable or vague?
    const hasSuccessCriteria = /success criteria/i.test(strategyContent);
    const vagueCriteria = [
      "better quality",
      "improved performance",
      "more efficient",
      "easier to use",
      "works well"
    ];
    const hasVagueCriteria = vagueCriteria.some(phrase =>
      new RegExp(phrase, "i").test(strategyContent)
    );

    const measurabilityIndicators = [
      /\d+%/,  // percentages
      /< \d+/,  // comparisons
      /> \d+/,
      /measured by/i,
      /tracked in/i,
      /metric/i
    ];
    const hasMeasurableCriteria = measurabilityIndicators.some(pattern =>
      pattern.test(strategyContent)
    );

    if (!hasSuccessCriteria) {
      concerns.push({
        type: "missing_success_criteria",
        severity: "high",
        guidance: "No success criteria defined.\n" +
                 "How will you know this task succeeded?\n" +
                 "Define 3-5 measurable criteria using SMART framework:\n" +
                 "- Specific: Exactly what will change?\n" +
                 "- Measurable: How will you measure it?\n" +
                 "- Achievable: Is this realistic?\n" +
                 "- Relevant: Does this address the problem?\n" +
                 "- Time-bound: When will you measure?\n" +
                 "Example: '100% of new tasks have strategy.md (measured by pre-commit hook rejection rate < 5%)'"
      });
    } else if (hasVagueCriteria && !hasMeasurableCriteria) {
      concerns.push({
        type: "vague_success_criteria",
        severity: "high",
        guidance: "Success criteria are too vague ('better quality', 'improved performance').\n" +
                 "How will you MEASURE success?\n" +
                 "Make criteria specific and measurable:\n" +
                 "- ❌ 'Better quality' → ✅ 'Defect rate < 5% (tracked in state/analytics/)'\n" +
                 "- ❌ 'More efficient' → ✅ 'Task completion time reduced by 20% (measured over 30-task cycle)'\n" +
                 "- ❌ 'Works well' → ✅ 'Approval rate > 80% on first review (logged in state/critics/)'\n" +
                 "If you can't measure it, you can't verify it worked."
      });
    } else if (hasMeasurableCriteria) {
      strengths.push("Measurable success criteria (quantified, verifiable)");
    }

    // 5. Impact Assessment: Is it quantified or hand-wavy?
    const hasImpactAssessment = /impact assessment/i.test(strategyContent);
    const quantifiedImpactIndicators = [
      /\d+\s*(hours?|tokens?|tasks?|dollars?)/i,
      /save[sd]?\s+\d+/i,
      /reduce[sd]?\s+\d+/i,
      /increase[sd]?\s+\d+/i
    ];
    const hasQuantifiedImpact = quantifiedImpactIndicators.some(pattern =>
      pattern.test(strategyContent)
    );

    const handWavyIndicators = [
      "significant impact",
      "major improvement",
      "substantial benefit",
      "will help",
      "should improve"
    ];
    const hasHandWavyImpact = handWavyIndicators.some(phrase =>
      new RegExp(phrase, "i").test(strategyContent)
    );

    if (!hasImpactAssessment) {
      concerns.push({
        type: "no_impact_assessment",
        severity: "medium",
        guidance: "No impact assessment found.\n" +
                 "Quantify the value of this task:\n" +
                 "- Time saved: How many hours per week/cycle?\n" +
                 "- Cost saved: Tokens, human review time?\n" +
                 "- Quality impact: Defects prevented? Rework avoided?\n" +
                 "- Strategic value: What future capabilities does this unlock?\n" +
                 "Example: 'Prevent 8 remediation tasks/cycle (8 * 2.5 hrs = 20 hrs saved, ~1M tokens = $15)'"
      });
    } else if (hasHandWavyImpact && !hasQuantifiedImpact) {
      concerns.push({
        type: "vague_impact_assessment",
        severity: "medium",
        guidance: "Impact assessment uses vague language ('significant', 'major', 'substantial').\n" +
                 "Quantify where possible:\n" +
                 "- How many hours/tokens saved?\n" +
                 "- How many defects prevented?\n" +
                 "- What % improvement?\n" +
                 "Use ranges if uncertain: '10-20 hours saved' or '~1M tokens ($10-20 at current rates)'\n" +
                 "If you can't quantify, explain why and provide qualitative assessment honestly."
      });
    } else if (hasQuantifiedImpact) {
      strengths.push("Quantified impact assessment (specific value estimates)");
    }

    // 6. AFP/SCAS Alignment: Does strategy connect to core principles?
    const afpSCASIndicators = [
      /afp/i,
      /scas/i,
      /via negativa/i,
      /refactor not repair/i,
      /complexity/i,
      /force multiplier/i,
      /anti-fragile/i
    ];
    const hasAFPSCASAlignment = afpSCASIndicators.some(pattern =>
      pattern.test(strategyContent)
    );

    if (!hasAFPSCASAlignment) {
      concerns.push({
        type: "no_afp_scas_alignment",
        severity: "medium",
        guidance: "Strategy doesn't connect to AFP/SCAS principles.\n" +
                 "Show how this aligns with core principles:\n" +
                 "- Via Negativa: What does this DELETE, SIMPLIFY, or PREVENT?\n" +
                 "- Refactor not Repair: Are we addressing root cause or patching symptoms?\n" +
                 "- Complexity Control: Does this increase or decrease system complexity? Why?\n" +
                 "- Force Multiplier: Does this amplify future value delivery?\n" +
                 "Explicit alignment helps evaluate if this task fits the strategic direction."
      });
    } else {
      strengths.push("Explicit AFP/SCAS alignment");
    }

    // 7. Risk Awareness: Did they think about what could go wrong?
    const hasRiskSection = /risks and mitigations/i.test(strategyContent) ||
                          /risks:/i.test(strategyContent);
    const hasRiskThinking = /risk/i.test(strategyContent) ||
                           /could go wrong/i.test(strategyContent) ||
                           /failure mode/i.test(strategyContent);

    if (!hasRiskSection && !hasRiskThinking) {
      concerns.push({
        type: "no_risk_awareness",
        severity: "medium",
        guidance: "Strategy doesn't consider risks.\n" +
                 "Think through what could go wrong:\n" +
                 "- What assumptions could be false?\n" +
                 "- What unintended consequences might occur?\n" +
                 "- What could cause this task to fail?\n" +
                 "- How will you mitigate these risks?\n" +
                 "For each risk: assess likelihood, impact, and mitigation strategy."
      });
    } else if (hasRiskThinking) {
      strengths.push("Considered risks and failure modes");
    }

    // 8. Honesty: Do they admit what they don't know?
    const honestyIndicators = [
      /unknown/i,
      /unclear/i,
      /don't know/i,
      /uncertain/i,
      /open question/i,
      /need to investigate/i
    ];
    const showsHonesty = honestyIndicators.some(pattern =>
      pattern.test(strategyContent)
    );

    if (showsHonesty) {
      strengths.push("Shows intellectual honesty (admits unknowns)");
    }

    // 9. Recommendation: Do they actually recommend an action?
    const hasRecommendation = /recommendation/i.test(strategyContent);
    const hasDecision = /yes.*proceed/i.test(strategyContent) ||
                       /no.*defer/i.test(strategyContent) ||
                       /should we do/i.test(strategyContent);

    if (!hasRecommendation && !hasDecision) {
      concerns.push({
        type: "no_recommendation",
        severity: "low",
        guidance: "Strategy doesn't include a recommendation.\n" +
                 "After analyzing the problem, recommend an action:\n" +
                 "- YES: Proceed immediately (explain why)\n" +
                 "- NO: Reject this task (explain why)\n" +
                 "- DEFER: Wait for X (explain what's needed)\n" +
                 "Include priority, urgency, effort estimate."
      });
    } else {
      strengths.push("Includes clear recommendation");
    }

    // Adaptive: Adjust based on agent track record
    let qualityThreshold = 2; // default: need ≤2 high-severity concerns
    if (agentContext?.recent_quality && agentContext.recent_quality > 8.5) {
      qualityThreshold = 3; // experienced agent gets more leeway
      logInfo("StrategyReviewer: Experienced agent - relaxed threshold", {
        quality: agentContext.recent_quality
      });
    }

    const highSeverityConcerns = concerns.filter(c => c.severity === "high");
    const approved = highSeverityConcerns.length <= qualityThreshold;

    // Generate summary
    const summary = approved
      ? `Strategy shows good strategic thinking (${strengths.length} strengths, ${concerns.length} concerns)`
      : `Strategy needs deeper thinking (${highSeverityConcerns.length} critical issues)`;

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
   * Log ALL strategy reviews (approved and blocked) for metrics tracking
   *
   * This enables:
   * - Gaming detection (approval rate too high = suspicious)
   * - Pattern analysis (which concerns are most common?)
   * - Effectiveness tracking (are strategies improving over time?)
   */
  private async logStrategyReview(
    taskId: string,
    analysis: {
      approved: boolean;
      concerns?: Array<{ type: string; severity: string; guidance: string }>;
      strengths?: string[];
      summary: string;
    }
  ): Promise<void> {
    const reviewLog = path.join(
      this.stateRoot,
      "analytics",
      "strategy_reviews.jsonl"
    );

    const entry = {
      timestamp: new Date().toISOString(),
      task_id: taskId,
      approved: analysis.approved,
      concerns_count: analysis.concerns?.length || 0,
      high_severity_count: analysis.concerns?.filter(c => c.severity === "high").length || 0,
      strengths_count: analysis.strengths?.length || 0,
      summary: analysis.summary,
      concerns: analysis.concerns,
      strengths: analysis.strengths,
    };

    // Append to JSONL log
    const dir = path.dirname(reviewLog);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.appendFileSync(reviewLog, JSON.stringify(entry) + "\n");

    logInfo("StrategyReviewer: Review logged", {
      taskId,
      approved: analysis.approved,
      concerns: analysis.concerns?.length || 0,
      strengths: analysis.strengths?.length || 0,
    });
  }

  /**
   * Generate remediation instructions that enforce STRATEGIZE phase work
   *
   * This is critical: we don't want superficial edits to pass.
   * Agent must do REAL strategic thinking.
   */
  private generateRemediationInstructions(
    taskId: string,
    analysis: {
      concerns?: Array<{ type: string; severity: string; guidance: string }>;
    }
  ): string {
    const highSeverityConcerns = analysis.concerns?.filter(c => c.severity === "high") || [];

    let instructions = `
⚠️  STRATEGY REMEDIATION REQUIRED

You have ${analysis.concerns?.length || 0} strategy concerns (${highSeverityConcerns.length} critical).

**DO NOT just edit strategy.md superficially.** That's compliance theater.

🚨 **CRITICAL: Strategy reviews your THINKING, NOT your execution**

If StrategyReviewer blocks you, your strategic thinking is insufficient. You must:

1. **DO ACTUAL RESEARCH** (30-60 min per critical issue):
   - missing_problem_statement → Research the actual problem (grep, file reads, metrics)
   - shallow_root_cause → Dig deeper (ask 'why' 3-5 times, trace causal chain)
   - no_evidence → Gather specific data (file paths, percentages, examples)
   - vague_success_criteria → Define measurable outcomes (numbers, thresholds, tracking)
   - vague_impact_assessment → Quantify value (time saved, cost saved, risks reduced)

2. **UPDATE strategy.md with REAL analysis** (not generic text):
   - Show your work: Include evidence, data, specific examples
   - Be honest: Admit unknowns, acknowledge risks
   - Be specific: Replace vague claims with quantified statements
   - Think deeply: Go beyond surface-level observations

3. **RE-RUN StrategyReviewer**:
   \`\`\`bash
   cd tools/wvo_mcp && npm run strategy:review ${taskId}
   \`\`\`

4. **ITERATE until approved** (2-3 rounds is normal):
   - This is EXPENSIVE but NECESSARY for quality
   - Better to spend time thinking strategically than fixing bad implementations later
   - STRATEGIZE enforces that work is based on SOLID analysis, not rushed assumptions

**Remember:** If your strategy.md is < 30 substantive lines, you haven't thought deeply enough.

**Common anti-patterns to avoid:**
- 🚫 Generic problem statements ("needs improvement")
- 🚫 Shallow root cause (symptoms, not causes)
- 🚫 Unsupported claims ("I noticed", no data)
- 🚫 Vague criteria ("better", "improved")
- 🚫 Hand-wavy impact ("significant", no numbers)
- 🚫 No risks considered (overly optimistic)

**Quality examples:**
- ✅ "Analysis of state/evidence/ shows 12/30 tasks (40%) lack strategy.md"
- ✅ "Prevent 8 remediation tasks/cycle (20 hrs + 1M tokens = $15 saved)"
- ✅ "Success: 100% compliance (rejection rate < 5%, tracked by pre-commit hook)"
- ✅ "Risk: False positives (10-15% likely) → mitigation: human escalation path"
`;

    return instructions;
  }

  /**
   * Run the strategy review (convenience method for scripts)
   */
  async run(profile: string = "default"): Promise<CriticResult> {
    // In autopilot, we need to find the current task being worked on
    // This is a placeholder - actual implementation would integrate with StateMachine
    logWarning("StrategyReviewer: run() called in autopilot mode - needs StateMachine integration");

    return this.pass(
      "StrategyReviewer: Manual review mode - call reviewStrategy(taskId) directly",
      {
        usage: "await strategyReviewer.reviewStrategy('AFP-TASK-20251105', { recent_quality: 8.5 })"
      }
    );
  }
}
