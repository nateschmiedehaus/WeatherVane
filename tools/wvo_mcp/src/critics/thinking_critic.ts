import fs from "node:fs";
import path from "node:path";

import { Critic, type CriticResult, type CriticOptions } from "./base.js";
import { logInfo, logWarning } from "../telemetry/logger.js";
import { resolveStateRoot } from "../utils/config.js";

/**
 * ThinkingCritic
 *
 * Intelligent reviewer that evaluates deep thinking BEFORE implementation.
 * Ensures agents have thought through edge cases, failure modes, and complexity.
 *
 * Core thinking quality checks:
 * - Edge Cases: Are boundary conditions identified and handled?
 * - Failure Modes: Did they think through what could go wrong?
 * - Assumptions: Are assumptions documented with risk assessment?
 * - Complexity Analysis: Is complexity realistic and justified?
 * - Mitigation Strategies: Are preventions/detections/recoveries concrete?
 * - Testing Strategy: Is test coverage comprehensive?
 * - Paranoid Thinking: Did they consider worst-case scenarios?
 *
 * Works in both:
 * - Autopilot mode (automated review)
 * - Manual mode (user talking to agents)
 */
export class ThinkingCritic extends Critic {
  protected command(profile: string): string | null {
    // Not a command-based critic - uses intelligence engine
    return null;
  }

  /**
   * Review a thinking document for depth and comprehensiveness
   *
   * @param taskId - Task ID (e.g., "T1.2.5" or "AFP-TASK-20251105")
   * @param agentContext - Optional agent history for adaptive feedback
   */
  async reviewThinking(
    taskId: string,
    agentContext?: {
      recent_quality?: number;
      bug_rate?: number;
      track_record?: string;
    }
  ): Promise<CriticResult> {
    logInfo("ThinkingCritic: Starting thinking review", { taskId });

    // Find thinking document
    const stateRoot = resolveStateRoot(this.workspaceRoot);
    const evidencePath = path.join(stateRoot, "evidence", taskId);
    const thinkPath = path.join(evidencePath, "think.md");

    if (!fs.existsSync(thinkPath)) {
      return this.fail(
        `No thinking documentation found for task ${taskId}`,
        {
          guidance: "Create state/evidence/${taskId}/think.md documenting your deep thinking:\n" +
                   "- Edge cases: What boundary conditions exist?\n" +
                   "- Failure modes: What could go wrong?\n" +
                   "- Assumptions: What are you assuming? Risks?\n" +
                   "- Complexity: Essential vs accidental?\n" +
                   "- Mitigation: Prevention, detection, recovery?\n" +
                   "- Testing: How will you verify it works?\n\n" +
                   "Use docs/templates/think_template.md as a starting point.",
          expected_path: thinkPath,
        }
      );
    }

    const thinkContent = fs.readFileSync(thinkPath, "utf-8");

    // Basic quality checks
    const lineCount = thinkContent.split("\n").filter(line => line.trim().length > 0).length;
    if (lineCount < 30) {
      return this.fail(
        `Thinking document is too superficial (${lineCount} substantive lines)`,
        {
          guidance: "Deep thinking requires thoroughness, not surface-level answers.\n" +
                   "Minimum ~30 lines of substantive content (excluding template headers).\n" +
                   "Each section should show evidence of genuine analysis:\n" +
                   "- Edge Cases: 5-10 specific scenarios with mitigation\n" +
                   "- Failure Modes: 5-10 ways this could fail with detection/recovery\n" +
                   "- Assumptions: 10-15 assumptions with risk assessment\n" +
                   "- Complexity: Essential vs accidental analysis\n" +
                   "- Mitigation: Prevention, detection, recovery strategies\n" +
                   "- Testing: Comprehensive test strategy",
          min_expected_lines: 30,
          actual_lines: lineCount,
        }
      );
    }

    // Use intelligence engine for deep analysis
    const analysis = await this.analyzeThinkingQuality(
      thinkContent,
      taskId,
      agentContext
    );

    // **Log ALL reviews (approved and blocked) for metrics tracking**
    await this.logThinkingReview(taskId, analysis);

    if (!analysis.approved) {
      return this.fail(
        `Thinking needs deeper analysis: ${analysis.summary}`,
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
        `Thinking approved with recommendations: ${analysis.summary}`,
        {
          concerns: analysis.concerns,
          guidance: analysis.guidance,
          recommendation: "proceed_with_caution",
        }
      );
    }

    return this.pass(
      `Thinking approved: ${analysis.summary}`,
      {
        strengths: analysis.strengths,
        recommendation: "proceed",
      }
    );
  }

  /**
   * Deep analysis using thinking quality lens
   *
   * This is where the intelligence happens - not just checking boxes,
   * but understanding if the agent actually THOUGHT through the problems.
   *
   * Anti-gaming measures:
   * - Check for specific examples (not generic edge cases)
   * - Verify mitigation strategies are concrete (not hand-wavy)
   * - Ensure testing strategy is comprehensive (not superficial)
   */
  private async analyzeThinkingQuality(
    thinkContent: string,
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

    // 1. Edge Cases: Are they comprehensive and specific?
    const hasEdgeCasesSection = /edge cases/i.test(thinkContent);
    const edgeCaseCount = (thinkContent.match(/edge case|boundary|corner case/gi) || []).length;
    const hasSpecificExamples = /example|scenario|what if/gi.test(thinkContent);

    if (!hasEdgeCasesSection) {
      concerns.push({
        type: "no_edge_cases",
        severity: "high",
        guidance: "No edge cases section found.\n" +
                 "Think through boundary conditions:\n" +
                 "- Empty/null/missing data: What if input is empty?\n" +
                 "- Extreme values: What if input is huge? tiny?\n" +
                 "- Invalid data: What if input format is wrong?\n" +
                 "- Timing issues: Race conditions? ordering?\n" +
                 "- State issues: Unexpected state? concurrent modifications?\n" +
                 "Document 5-10 specific edge cases with mitigation for each."
      });
    } else if (edgeCaseCount < 3) {
      concerns.push({
        type: "insufficient_edge_cases",
        severity: "high",
        guidance: `Only ${edgeCaseCount} edge case mentions found.\n` +
                 "Think deeper - you need 5-10 specific edge cases:\n" +
                 "- Data edge cases (empty, huge, invalid)\n" +
                 "- Timing edge cases (race conditions, timeouts)\n" +
                 "- State edge cases (unexpected states, concurrent mods)\n" +
                 "For each: scenario, impact, mitigation."
      });
    } else if (!hasSpecificExamples) {
      concerns.push({
        type: "generic_edge_cases",
        severity: "medium",
        guidance: "Edge cases section lacks specific examples.\n" +
                 "Don't just list categories - give SPECIFIC scenarios:\n" +
                 "- ❌ 'What if input is invalid?'\n" +
                 "- ✅ 'What if strategy.md contains only template headings with no content? → critic should detect and fail with guidance'\n" +
                 "Be concrete about what could happen and how you'll handle it."
      });
    } else {
      strengths.push(`Comprehensive edge case analysis (${edgeCaseCount}+ cases documented)`);
    }

    // 2. Failure Modes: Did they think through what could go wrong?
    const hasFailureModesSection = /failure mode|failure scenario|what.*go wrong/i.test(thinkContent);
    const failureModeCount = (thinkContent.match(/failure|fail|error|break|crash/gi) || []).length;
    const hasMitigations = /mitigation|prevent|detect|recover/gi.test(thinkContent);

    if (!hasFailureModesSection) {
      concerns.push({
        type: "no_failure_modes",
        severity: "high",
        guidance: "No failure modes analysis found.\n" +
                 "Think through how this could fail:\n" +
                 "- Implementation failures (logic errors, integration breaks)\n" +
                 "- Operational failures (resource exhaustion, permissions)\n" +
                 "- Quality failures (false positives, false negatives)\n" +
                 "For each failure mode: cause, symptom, impact, likelihood, detection, mitigation."
      });
    } else if (failureModeCount < 5) {
      concerns.push({
        type: "insufficient_failure_analysis",
        severity: "high",
        guidance: `Only ${failureModeCount} failure mentions found.\n` +
                 "Think through 5-10 specific failure modes:\n" +
                 "- Logic errors: What if algorithm is wrong?\n" +
                 "- Performance failures: What if too slow?\n" +
                 "- Resource failures: What if out of memory/disk?\n" +
                 "- False positives/negatives: What if quality checks fail?\n" +
                 "Document cause, impact, likelihood, detection, mitigation for each."
      });
    } else if (!hasMitigations) {
      concerns.push({
        type: "no_failure_mitigation",
        severity: "high",
        guidance: "Failure modes documented but no mitigation strategies.\n" +
                 "For EACH failure mode, document:\n" +
                 "- Prevention: How to stop it from happening\n" +
                 "- Detection: How to know it happened\n" +
                 "- Recovery: How to fix it when it happens\n" +
                 "Don't just list problems - plan solutions."
      });
    } else {
      strengths.push("Comprehensive failure mode analysis with mitigations");
    }

    // 3. Assumptions: Are they documented with risk assessment?
    const hasAssumptionsSection = /assumption/i.test(thinkContent);
    const assumptionCount = (thinkContent.match(/assume|assuming|assumption/gi) || []).length;
    const hasRiskAssessment = /if wrong|likelihood|impact|risk/gi.test(thinkContent);

    if (!hasAssumptionsSection) {
      concerns.push({
        type: "no_assumptions",
        severity: "high",
        guidance: "No assumptions section found.\n" +
                 "Be explicit about what you're assuming:\n" +
                 "- Technical assumptions (file format, encoding, dependencies)\n" +
                 "- Behavioral assumptions (how users/agents will act)\n" +
                 "- Data assumptions (input format, constraints)\n" +
                 "For each: What if I'm wrong? Likelihood? Impact? Mitigation?\n" +
                 "Document 10-15 specific assumptions with risk assessment."
      });
    } else if (assumptionCount < 5) {
      concerns.push({
        type: "insufficient_assumptions",
        severity: "medium",
        guidance: `Only ${assumptionCount} assumption mentions found.\n` +
                 "You're making more assumptions than you think.\n" +
                 "Document 10-15 specific assumptions:\n" +
                 "- About the system (encoding, paths, dependencies)\n" +
                 "- About users (behavior, language, workflow)\n" +
                 "- About data (format, size, validity)\n" +
                 "For each: if wrong, likelihood, impact, mitigation."
      });
    } else if (!hasRiskAssessment) {
      concerns.push({
        type: "no_assumption_risk_assessment",
        severity: "high",
        guidance: "Assumptions documented but no risk assessment.\n" +
                 "For EACH assumption, analyze:\n" +
                 "- What happens if I'm wrong?\n" +
                 "- How likely is it to be wrong? (High/Medium/Low)\n" +
                 "- What's the impact if wrong? (Critical/High/Medium/Low)\n" +
                 "- How will I mitigate the risk?\n" +
                 "Assumptions without risk assessment are dangerous."
      });
    } else {
      strengths.push(`Documented ${assumptionCount}+ assumptions with risk assessment`);
    }

    // 4. Complexity Analysis: Is it realistic?
    const hasComplexitySection = /complexity analysis/i.test(thinkContent);
    const hasEssentialVsAccidental = /essential.*complexity|accidental.*complexity/i.test(thinkContent);
    const hasComplexityEstimate = /loc|lines|functions|components/gi.test(thinkContent);

    if (!hasComplexitySection) {
      concerns.push({
        type: "no_complexity_analysis",
        severity: "medium",
        guidance: "No complexity analysis found.\n" +
                 "Analyze the complexity honestly:\n" +
                 "- Is this simpler or more complex than it appears?\n" +
                 "- Essential vs accidental complexity?\n" +
                 "- Cyclomatic complexity (decision points)?\n" +
                 "- Cognitive complexity (how hard to understand)?\n" +
                 "- Integration complexity (how many systems touched)?\n" +
                 "Complexity surprises derail projects - think it through upfront."
      });
    } else if (!hasEssentialVsAccidental) {
      concerns.push({
        type: "no_essential_vs_accidental",
        severity: "medium",
        guidance: "Complexity analysis doesn't distinguish essential vs accidental.\n" +
                 "Essential complexity: Inherent to the problem (can't be avoided)\n" +
                 "Accidental complexity: From your approach (could be eliminated)\n" +
                 "Knowing the difference helps you simplify the accidental parts."
      });
    } else if (hasComplexityEstimate) {
      strengths.push("Realistic complexity analysis (essential vs accidental)");
    }

    // 5. Mitigation Strategies: Are they concrete?
    const hasMitigationSection = /mitigation strateg/i.test(thinkContent);
    const hasPrevention = /prevent/i.test(thinkContent);
    const hasDetection = /detect|monitor|log|alert/i.test(thinkContent);
    const hasRecovery = /recover|fallback|retry|rollback/i.test(thinkContent);

    if (!hasMitigationSection) {
      concerns.push({
        type: "no_mitigation_strategies",
        severity: "high",
        guidance: "No mitigation strategies section found.\n" +
                 "Plan how you'll handle problems:\n" +
                 "- Prevention: Stop problems before they happen (input validation, error handling)\n" +
                 "- Detection: Know when something goes wrong (logging, monitoring, alerting)\n" +
                 "- Recovery: Fix problems when they happen (graceful degradation, retry, rollback)\n" +
                 "Document 5-10 specific strategies in each category."
      });
    } else {
      let mitigationGaps = [];
      if (!hasPrevention) mitigationGaps.push("prevention");
      if (!hasDetection) mitigationGaps.push("detection");
      if (!hasRecovery) mitigationGaps.push("recovery");

      if (mitigationGaps.length > 0) {
        concerns.push({
          type: "incomplete_mitigation",
          severity: "high",
          guidance: `Mitigation strategies missing: ${mitigationGaps.join(", ")}\n` +
                   "You need all three:\n" +
                   "- Prevention: Input validation, defensive programming, testing\n" +
                   "- Detection: Logging, monitoring, analytics, alerting\n" +
                   "- Recovery: Graceful degradation, retry logic, human escalation, rollback\n" +
                   "One-dimensional mitigation (only prevention OR only detection) is insufficient."
        });
      } else {
        strengths.push("Comprehensive mitigation (prevention + detection + recovery)");
      }
    }

    // 6. Testing Strategy: Is it comprehensive?
    const hasTestingSection = /testing strateg/i.test(thinkContent);
    const hasUnitTests = /unit test/i.test(thinkContent);
    const hasIntegrationTests = /integration test|end.?to.?end/i.test(thinkContent);
    const hasTestCases = /test case|test.*:/gi.test(thinkContent);
    const testCaseCount = (thinkContent.match(/test case|test.*:/gi) || []).length;

    if (!hasTestingSection) {
      concerns.push({
        type: "no_testing_strategy",
        severity: "high",
        guidance: "No testing strategy found.\n" +
                 "Plan how you'll verify this works:\n" +
                 "- Unit tests: Test individual functions (10+ test cases)\n" +
                 "- Integration tests: Test components together\n" +
                 "- Edge case tests: Test boundary conditions\n" +
                 "- Failure tests: Test error handling\n" +
                 "- Manual tests: Real-world scenarios\n" +
                 "Document specific test cases (not just 'we'll test it')."
      });
    } else if (!hasUnitTests && !hasIntegrationTests) {
      concerns.push({
        type: "vague_testing_strategy",
        severity: "high",
        guidance: "Testing strategy is too vague.\n" +
                 "Specify:\n" +
                 "- Unit tests: Which functions? What test cases?\n" +
                 "- Integration tests: Which components together?\n" +
                 "- Test coverage: What % of code? edge cases?\n" +
                 "- Success criteria: How do you know tests passed?\n" +
                 "'We'll test it' is not a strategy."
      });
    } else if (testCaseCount < 5) {
      concerns.push({
        type: "insufficient_test_cases",
        severity: "medium",
        guidance: `Only ${testCaseCount} test case mentions found.\n` +
                 "Document 10+ specific test cases:\n" +
                 "- Happy path test\n" +
                 "- Empty input test\n" +
                 "- Invalid input test\n" +
                 "- Edge case tests (5+ cases)\n" +
                 "- Failure mode tests (3+ failure scenarios)\n" +
                 "Be specific about WHAT you'll test, not just that you'll test."
      });
    } else {
      strengths.push(`Comprehensive testing strategy (${testCaseCount}+ test cases documented)`);
    }

    // 7. Paranoid Thinking: Did they consider worst-case scenarios?
    const hasWorstCase = /worst.?case|disaster|catastrophic|critical failure/i.test(thinkContent);
    const hasParanoidThinking = /what if.*fail|cascade|breach|data loss|corruption/i.test(thinkContent);

    if (!hasWorstCase && !hasParanoidThinking) {
      concerns.push({
        type: "no_paranoid_thinking",
        severity: "medium",
        guidance: "No worst-case scenario thinking found.\n" +
                 "Think like a pessimist - what's the worst that could happen?\n" +
                 "- Complete failure: What if this completely fails?\n" +
                 "- Cascade failure: What if this breaks other things?\n" +
                 "- Security breach: What if this creates vulnerability?\n" +
                 "- Data loss: What if this deletes/corrupts data?\n" +
                 "- Performance degradation: What if this makes everything slow?\n" +
                 "Document 5-8 worst-case scenarios with prevention/recovery."
      });
    } else {
      strengths.push("Paranoid thinking present (worst-case scenarios considered)");
    }

    // 8. Depth Check: Is thinking substantive or superficial?
    const genericPhrases = [
      "might have issues",
      "could be a problem",
      "should work",
      "will probably",
      "seems fine"
    ];
    const hasGenericThinking = genericPhrases.some(phrase =>
      new RegExp(phrase, "i").test(thinkContent)
    );

    if (hasGenericThinking) {
      concerns.push({
        type: "superficial_thinking",
        severity: "medium",
        guidance: "Thinking contains generic/vague phrases ('might have issues', 'seems fine').\n" +
                 "Be specific:\n" +
                 "- ❌ 'Might have issues' → ✅ 'If file exceeds 10MB, review will timeout → need 30s timeout + fallback'\n" +
                 "- ❌ 'Should work' → ✅ 'Works if UTF-8 encoding (assumption) → verify with file encoding detection'\n" +
                 "Replace vague thinking with concrete analysis."
      });
    }

    // Adaptive: Adjust based on agent track record
    let qualityThreshold = 2; // default: need ≤2 high-severity concerns
    if (agentContext?.recent_quality && agentContext.recent_quality > 8.5) {
      qualityThreshold = 3; // experienced agent gets more leeway
      logInfo("ThinkingCritic: Experienced agent - relaxed threshold", {
        quality: agentContext.recent_quality
      });
    }

    const highSeverityConcerns = concerns.filter(c => c.severity === "high");
    const approved = highSeverityConcerns.length <= qualityThreshold;

    // Generate summary
    const summary = approved
      ? `Thinking shows good depth (${strengths.length} strengths, ${concerns.length} concerns)`
      : `Thinking needs deeper analysis (${highSeverityConcerns.length} critical issues)`;

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
   * Log ALL thinking reviews (approved and blocked) for metrics tracking
   */
  private async logThinkingReview(
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
      "thinking_reviews.jsonl"
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

    logInfo("ThinkingCritic: Review logged", {
      taskId,
      approved: analysis.approved,
      concerns: analysis.concerns?.length || 0,
      strengths: analysis.strengths?.length || 0,
    });
  }

  /**
   * Generate remediation instructions that enforce THINK phase work
   */
  private generateRemediationInstructions(
    taskId: string,
    analysis: {
      concerns?: Array<{ type: string; severity: string; guidance: string }>;
    }
  ): string {
    const highSeverityConcerns = analysis.concerns?.filter(c => c.severity === "high") || [];

    let instructions = `
⚠️  THINKING REMEDIATION REQUIRED

You have ${analysis.concerns?.length || 0} thinking concerns (${highSeverityConcerns.length} critical).

**DO NOT just edit think.md superficially.** That's compliance theater.

🚨 **CRITICAL: ThinkingCritic reviews your DEPTH OF ANALYSIS, NOT your documentation**

If ThinkingCritic blocks you, you haven't thought deeply enough. You must:

1. **DO ACTUAL DEEP THINKING** (30-60 min per critical issue):
   - no_edge_cases → Think through 5-10 boundary conditions and how to handle each
   - no_failure_modes → Think through 5-10 ways this could fail with detection/recovery
   - no_assumptions → List 10-15 assumptions and assess risk for each
   - no_mitigation_strategies → Plan prevention, detection, recovery for each problem
   - no_testing_strategy → Document 10+ specific test cases

2. **UPDATE think.md with REAL analysis** (not generic text):
   - Be specific: Give concrete scenarios, not categories
   - Be comprehensive: Cover 5-10 items per section minimum
   - Be honest: Admit what could go wrong
   - Think adversarially: What breaks this?
   - Plan mitigation: For every problem, document how to prevent/detect/recover

3. **RE-RUN ThinkingCritic**:
   \`\`\`bash
   cd tools/wvo_mcp && npm run think:review ${taskId}
   \`\`\`

4. **ITERATE until approved** (2-3 rounds is normal):
   - This is EXPENSIVE but NECESSARY for quality
   - Better to spend time thinking than debugging later
   - THINK enforces that implementation is based on SOLID analysis, not rushed assumptions

5. **IF YOU FIND CRITICAL ISSUES**: GO BACK to STRATEGY/SPEC/PLAN and revise
   - Don't just document problems - FIX THE APPROACH
   - THINK phase is your last chance to catch design flaws before implementing

**Remember:** If your think.md is < 30 substantive lines, you haven't thought deeply enough.

**Common anti-patterns to avoid:**
- 🚫 Generic edge cases ("what if input is invalid")
- 🚫 Listing problems without mitigation
- 🚫 Vague testing ("we'll test it")
- 🚫 No worst-case thinking
- 🚫 Missing assumptions
- 🚫 Superficial analysis

**Quality examples:**
- ✅ "Edge case: If strategy.md exceeds 10MB → review timeout after 30s → fallback to heuristics, log warning"
- ✅ "Failure mode: False positives (critic blocks good work) → Impact: High, Likelihood: Medium → Detection: track rate in analytics → Mitigation: human escalation path, tune thresholds"
- ✅ "Assumption: Files are UTF-8 encoded → If wrong: parse errors → Likelihood: Low → Impact: Medium → Mitigation: detect encoding, convert or fail gracefully"
- ✅ "Test case: Empty strategy.md (0 bytes) → expect failure with guidance message → verify clear error"
`;

    return instructions;
  }

  /**
   * Run the thinking review (convenience method for scripts)
   */
  async run(profile: string = "default"): Promise<CriticResult> {
    // In autopilot, we need to find the current task being worked on
    // This is a placeholder - actual implementation would integrate with StateMachine
    logWarning("ThinkingCritic: run() called in autopilot mode - needs StateMachine integration");

    return this.pass(
      "ThinkingCritic: Manual review mode - call reviewThinking(taskId) directly",
      {
        usage: "await thinkingCritic.reviewThinking('AFP-TASK-20251105', { recent_quality: 8.5 })"
      }
    );
  }
}
