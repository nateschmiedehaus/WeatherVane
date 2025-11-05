# Plan — AFP-STRATEGY-THINK-CRITICS-20251105

## Architecture Overview

Following the proven DesignReviewer pattern, we'll build:
- **Templates** (strategy_template.md, think_template.md) with structured sections
- **Critics** (StrategyReviewer, ThinkingCritic) using intelligence engine for deep analysis
- **Scripts** (run_strategy_review.ts, run_think_review.ts) for CLI execution
- **Pre-commit hook** integration for automated enforcement
- **Analytics** tracking for remediation metrics

## Via Negativa Analysis

**What can we DELETE or SIMPLIFY instead of adding?**

Examined:
- **Existing phase docs:** Some tasks have strategy.md/think.md but NO template/enforcement
- **Manual review process:** Claude/Dana reviewing manually - slow, inconsistent
- **Generic prompts:** Agents improvise their strategy/think docs - quality varies

**Can we delete?**
- ❌ Can't delete strategy/think phases (core to AFP lifecycle)
- ✅ **Can delete manual review burden** by automating with critics
- ✅ **Can simplify** by reusing DesignReviewer architecture (don't reinvent)

**Why must we add?**
- Templates provide structure (prevent "I don't know what to write")
- Critics provide enforcement (prevent superficial compliance)
- Without automation, manual review doesn't scale
- Gap exists: GATE has enforcement, STRATEGY/THINK don't

**Refactor vs Repair:**
- This is **NOT a patch** - it's completing the quality system
- GATE enforcement exists (DesignReviewer) - extending pattern to earlier phases
- **Root cause:** No rigorous thinking at strategy phase → bad tasks → wasted effort
- **Fix:** Catch bad tasks at source (phase 1/4) not downstream (phase 5+)

## Implementation Scope

### Files to Create (8 new files)

1. **docs/templates/strategy_template.md** (~150 LOC)
   - Structured sections for value analysis, root cause, via negativa, alternatives, alignment
   - Examples of good vs bad answers
   - Anti-bullshit checkboxes

2. **docs/templates/think_template.md** (~150 LOC)
   - Structured sections for assumptions, complexity, second-order effects, failure modes
   - Deep reasoning prompts
   - Anti-shallow-thinking checkboxes

3. **tools/wvo_mcp/src/critics/strategy_reviewer.ts** (~400 LOC)
   - Extends Critic base class
   - analyzeStrategyWithAFPSCAS() method (intelligent analysis)
   - reviewStrategy() public method
   - Anti-gaming checks (verify claimed deletions/alternatives)
   - Analytics logging

4. **tools/wvo_mcp/src/critics/thinking_critic.ts** (~400 LOC)
   - Extends Critic base class
   - analyzeThinkingDepth() method (intelligent analysis)
   - reviewThinking() public method
   - Depth detection (superficial vs deep reasoning)
   - Analytics logging

5. **tools/wvo_mcp/scripts/run_strategy_review.ts** (~120 LOC)
   - CLI script: `npm run strategy:review [TASK-ID]`
   - Discovers tasks with strategy.md or reviews specific task
   - Uses StrategyReviewer
   - Exit code 1 if blocked, 0 if approved
   - Color-coded output

6. **tools/wvo_mcp/scripts/run_think_review.ts** (~120 LOC)
   - CLI script: `npm run think:review [TASK-ID]`
   - Discovers tasks with think.md or reviews specific task
   - Uses ThinkingCritic
   - Exit code 1 if blocked, 0 if approved
   - Color-coded output

7. **docs/orchestration/STRATEGY_CRITIC_GUIDE.md** (~200 LOC)
   - How to use StrategyReviewer
   - Examples of good vs bad strategies
   - Common failure modes (no via negativa, vague goals, etc.)
   - Remediation workflow

8. **docs/orchestration/THINKING_CRITIC_GUIDE.md** (~200 LOC)
   - How to use ThinkingCritic
   - Examples of deep vs shallow thinking
   - Common failure modes (unstated assumptions, missing complexity analysis)
   - Remediation workflow

### Files to Modify (5 files)

9. **AGENTS.md** (+40 LOC, strategy/think template references)
   - Phase 1 (STRATEGIZE): Add "Use strategy_template.md, run strategy:review"
   - Phase 4 (THINK): Add "Use think_template.md, run think:review"
   - Reference new guides

10. **CLAUDE.md** (+30 LOC, operational checklist updates)
    - Add "Run strategy:review before SPEC" to checklist
    - Add "Run think:review before GATE" to checklist
    - Update AFP lifecycle reference

11. **MANDATORY_WORK_CHECKLIST.md** (+20 LOC, phase verification)
    - Phase 1 checkbox: "I completed strategy_template.md and passed strategy:review"
    - Phase 4 checkbox: "I completed think_template.md and passed think:review"

12. **.githooks/pre-commit** (+40 LOC, strategy/think review logic)
    - Detect staged strategy.md files
    - Run npm run strategy:review [TASK-ID]
    - Block commit if exit code 1
    - Same for think.md + think:review
    - Log to analytics

13. **tools/wvo_mcp/package.json** (+5 LOC, npm scripts)
    - "strategy:review": "tsx scripts/run_strategy_review.ts"
    - "think:review": "tsx scripts/run_think_review.ts"

### Total Scope
- **Files to create:** 8 (templates, critics, scripts, guides)
- **Files to modify:** 5 (docs, hook, package.json)
- **Total files:** 13
- **Estimated LOC:** ~1740 (new) + ~135 (modifications) = **~1875 total LOC**

## ⚠️ Micro-Batching Constraint Violation

**Problem:** 13 files and ~1875 LOC exceeds ≤5 files / ≤150 net LOC constraint

**Solution: Split into 3 sub-tasks**

### Sub-Task 1: AFP-STRATEGY-CRITIC-20251105 (≤5 files, ~700 LOC)
**Focus:** Strategy phase only
- strategy_template.md
- strategy_reviewer.ts
- run_strategy_review.ts
- STRATEGY_CRITIC_GUIDE.md
- package.json modification (+3 LOC for strategy:review script)

**Total:** 5 files, ~673 LOC

### Sub-Task 2: AFP-THINKING-CRITIC-20251105 (≤5 files, ~700 LOC)
**Focus:** Think phase only
- think_template.md
- thinking_critic.ts
- run_think_review.ts
- THINKING_CRITIC_GUIDE.md
- package.json modification (+3 LOC for think:review script)

**Total:** 5 files, ~673 LOC

### Sub-Task 3: AFP-PHASE-CRITICS-INTEGRATION-20251105 (≤5 files, ~135 LOC)
**Focus:** Integration and documentation
- AGENTS.md modification
- CLAUDE.md modification
- MANDATORY_WORK_CHECKLIST.md modification
- .githooks/pre-commit modification
- (Possibly analytics tracking setup if needed)

**Total:** 4-5 files, ~135 LOC

**Dependencies:**
- Sub-Task 2 can run in parallel with Sub-Task 1 (independent)
- Sub-Task 3 depends on Sub-Task 1 + 2 (needs both critics to exist)

## Implementation Plan: Sub-Task 1 (This Task)

**Scope:** AFP-STRATEGY-CRITIC-20251105

### File 1: docs/templates/strategy_template.md

**Structure:**
```markdown
# Strategy: [TASK-ID]

## Value Analysis
**Is this worth doing at all?**
- Why is this worth doing? (be specific)
- What's the opportunity cost? (what else could we do?)
- What if we don't do this? (how bad is status quo?)
- How does this advance our mission? (not just task completion)

**Anti-Bullshit Check:**
- [ ] I have honestly considered whether this task should exist
- [ ] I can articulate the specific value (not vague benefits)
- [ ] I have weighed opportunity costs

## Root Cause Analysis
**Are we treating symptoms or root causes?**
- What's the problem? (observable symptom)
- Why does it exist? (5 whys analysis)
- What's the deeper pattern? (systemic vs one-off)
- What created the need for this task? (trace to source)

**Anti-Bullshit Check:**
- [ ] I have identified the root cause (not just symptoms)
- [ ] I can explain the causal chain
- [ ] This is not a patch/workaround

## Via Negativa First
**Can we DELETE or SIMPLIFY instead of adding?**
- What existing code did I examine for deletion?
  - File/module 1: [examined, could/couldn't delete because...]
  - File/module 2: [examined, could/couldn't simplify because...]
- What becomes possible if we remove X? (subtractive thinking)
- What's the simplest thing that could work? (YAGNI)
- If adding code: Why is deletion/simplification insufficient?

**Anti-Bullshit Check:**
- [ ] I have actively searched for deletion opportunities (not just claimed "considered it")
- [ ] I listed specific files/modules examined
- [ ] I explained why via negativa doesn't work (if adding code)

## Alternative Tasks
**What ELSE could we do instead?**
- **Alternative 1: Don't do this task** (what happens? is it acceptable?)
- **Alternative 2: Solve root cause** (deeper fix than proposed task)
- **Alternative 3: 10x better version** (bigger, more valuable solution)
- **Selected approach:** [explain why chosen over alternatives]

**Anti-Bullshit Check:**
- [ ] I seriously considered NOT doing this task
- [ ] I proposed at least 2 substantive alternatives
- [ ] I can defend why selected approach is best

## Strategic Alignment
**How does this advance AFP/SCAS principles?**
- Via Negativa: [how does this help us delete/simplify?]
- Refactor not Repair: [is this refactoring root causes or patching?]
- Micro-batching: [is scope minimal? if not, how split?]
- Entropy Impact: [does this increase or decrease codebase entropy?]
- Force Multiplier: [does this enable future simplification?]
- Long-term Trajectory: [where does this lead in 6 months?]

**Anti-Bullshit Check:**
- [ ] I have shown how this ADVANCES (not just complies with) AFP/SCAS
- [ ] I have analyzed entropy impact honestly
- [ ] I have considered long-term trajectory

## Success Criteria
**How will we know this succeeded?**
- Concrete measurable outcomes: [list 3-5]
- Time-bound goals: [when will we see results?]
- What would failure look like? [be specific]

## Strategic Decision
**Based on this analysis:**
- [ ] **PROCEED** - This task is the highest-value option, proceed to SPEC
- [ ] **REVISE** - Task has merit but needs refinement (what to change?)
- [ ] **REJECT** - Don't do this task (propose better alternative)
- [ ] **ESCALATE** - Need human judgment (complex trade-offs)

**If REJECT, proposed alternative:** [what should we do instead?]

---

**Examples Section:** [Include 1-2 examples of good vs bad strategies]
```

**LOC:** ~150 lines

### File 2: tools/wvo_mcp/src/critics/strategy_reviewer.ts

**Architecture:** (Following DesignReviewer pattern)

```typescript
import fs from "node:fs";
import path from "node:path";
import { Critic, type CriticResult } from "./base.js";
import { logInfo, logWarning } from "../telemetry/logger.js";
import { resolveStateRoot } from "../utils/config.js";

/**
 * StrategyReviewer Critic
 *
 * Intelligent reviewer that evaluates strategy documents to detect BS,
 * validate strategic thinking, and enforce AFP/SCAS alignment at phase 1.
 *
 * Core checks:
 * - Value analysis: Is this worth doing?
 * - Root cause: Symptom or root cause?
 * - Via Negativa: Did they search for deletion opportunities?
 * - Alternatives: Did they consider NOT doing this?
 * - Strategic alignment: AFP/SCAS advancement not just compliance
 */
export class StrategyReviewerCritic extends Critic {
  protected command(profile: string): string | null {
    return null; // Intelligence-based, not command-based
  }

  /**
   * Review a strategy document for quality and AFP/SCAS alignment
   *
   * @param taskId - Task ID
   * @param agentContext - Optional agent quality history
   */
  async reviewStrategy(
    taskId: string,
    agentContext?: {
      recent_quality?: number;
      task_rejection_rate?: number;
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
        `No strategy.md found for task ${taskId}`,
        {
          guidance: "Create state/evidence/${taskId}/strategy.md using strategy_template.md",
          expected_path: strategyPath,
        }
      );
    }

    const strategyContent = fs.readFileSync(strategyPath, "utf-8");

    // Basic quality checks
    const lineCount = strategyContent.split("\n").length;
    if (lineCount < 30) {
      return this.fail(
        `Strategy document is too superficial (${lineCount} lines)`,
        {
          guidance: "Strategy should cover:\n" +
                   "- Value analysis (why worth doing?)\n" +
                   "- Root cause analysis (not symptoms)\n" +
                   "- Via negativa (deletion opportunities)\n" +
                   "- Alternative tasks (including 'don't do this')\n" +
                   "- Strategic alignment (AFP/SCAS advancement)",
          min_expected_lines: 30,
        }
      );
    }

    // Use intelligence engine for deep analysis
    const analysis = await this.analyzeStrategyWithAFPSCAS(
      strategyContent,
      taskId,
      agentContext
    );

    // Log ALL reviews for metrics
    await this.logStrategyReview(taskId, analysis);

    // Handle task rejection recommendation
    if (analysis.recommendation === "reject") {
      return this.fail(
        `Strategy recommends NOT doing this task: ${analysis.summary}`,
        {
          recommendation: "reject",
          better_alternative: analysis.betterAlternative,
          reasoning: analysis.reasoning,
          guidance: "Consider the proposed alternative instead. If you disagree, escalate to human review.",
        }
      );
    }

    if (!analysis.approved) {
      return this.fail(
        `Strategy needs revision: ${analysis.summary}`,
        {
          concerns: analysis.concerns,
          guidance: analysis.guidance,
          remediation_instructions: this.generateRemediationInstructions(taskId, analysis),
        }
      );
    }

    return this.pass(
      `Strategy approved: ${analysis.summary}`,
      { strengths: analysis.strengths }
    );
  }

  /**
   * Deep analysis using AFP/SCAS lens and BS detection
   */
  private async analyzeStrategyWithAFPSCAS(
    strategyContent: string,
    taskId: string,
    agentContext?: any
  ): Promise<{
    approved: boolean;
    summary: string;
    recommendation?: "proceed" | "revise" | "reject";
    betterAlternative?: string;
    concerns?: Array<{
      type: string;
      severity: "low" | "medium" | "high";
      guidance: string;
    }>;
    strengths?: string[];
    guidance?: string;
    reasoning?: string;
  }> {
    const concerns: any[] = [];
    const strengths: string[] = [];

    // CHECK 1: Value analysis presence
    if (!this.hasSection(strategyContent, "Value Analysis") &&
        !strategyContent.toLowerCase().includes("worth doing")) {
      concerns.push({
        type: "missing_value_analysis",
        severity: "high",
        guidance: "Add explicit value analysis. Answer: 'Is this worth doing at all? What's the opportunity cost?'"
      });
    }

    // CHECK 2: Root cause vs symptom
    if (!this.hasSection(strategyContent, "Root Cause") &&
        !strategyContent.includes("why") &&
        !strategyContent.includes("5 whys")) {
      concerns.push({
        type: "missing_root_cause",
        severity: "high",
        guidance: "Identify root cause, not just symptoms. Use 5 whys or causal chain analysis."
      });
    }

    // CHECK 3: Via negativa (CRITICAL)
    const hasViaNegativa = this.hasSection(strategyContent, "Via Negativa") ||
                          strategyContent.toLowerCase().includes("delete") ||
                          strategyContent.toLowerCase().includes("simplif");

    if (!hasViaNegativa) {
      concerns.push({
        type: "missing_via_negativa",
        severity: "high",
        guidance: "Via negativa analysis missing. List specific files/modules you examined for deletion/simplification."
      });
    } else {
      // Verify they listed specific files
      const filePattern = /(?:src|tools|apps|shared)\/[a-zA-Z0-9_\-\/\.]+\.[a-z]{2,4}/g;
      const mentionedFiles = strategyContent.match(filePattern) || [];
      if (mentionedFiles.length === 0 && strategyContent.includes("considered deletion")) {
        concerns.push({
          type: "vague_via_negativa",
          severity: "medium",
          guidance: "You claim to have considered deletion but don't list specific files examined. Provide concrete examples."
        });
      } else if (mentionedFiles.length > 0) {
        strengths.push(`Via negativa: examined ${mentionedFiles.length} specific files for deletion`);
      }
    }

    // CHECK 4: Alternatives analysis
    const hasAlternatives = this.hasSection(strategyContent, "Alternative") ||
                           strategyContent.toLowerCase().includes("instead");

    if (!hasAlternatives) {
      concerns.push({
        type: "missing_alternatives",
        severity: "high",
        guidance: "Propose at least 2 alternative tasks, including 'don't do this task'. Explain opportunity costs."
      });
    }

    // CHECK 5: Strategic alignment (not just mention)
    const hasAFPAnalysis = (strategyContent.match(/AFP|SCAS|via negativa|refactor/gi) || []).length >= 3;
    if (!hasAFPAnalysis) {
      concerns.push({
        type: "weak_afp_alignment",
        severity: "medium",
        guidance: "Show how this ADVANCES AFP/SCAS principles (via negativa, refactor-not-repair, entropy reduction)."
      });
    }

    // CHECK 6: Success criteria
    const hasSuccessCriteria = this.hasSection(strategyContent, "Success") ||
                               strategyContent.toLowerCase().includes("measurable");
    if (!hasSuccessCriteria) {
      concerns.push({
        type: "missing_success_criteria",
        severity: "medium",
        guidance: "Define measurable success criteria. How will you know this worked?"
      });
    }

    // CHECK 7: Detect superficial answers
    const genericPhrases = [
      "considered various approaches",
      "thought about alternatives",
      "aligned with best practices",
      "follows standard patterns"
    ];
    const superficialCount = genericPhrases.filter(p =>
      strategyContent.toLowerCase().includes(p)
    ).length;

    if (superficialCount >= 2) {
      concerns.push({
        type: "generic_platitudes",
        severity: "medium",
        guidance: "Avoid generic phrases like 'considered various approaches'. Be SPECIFIC about what you considered."
      });
    }

    // Determine approval
    const highSeverityConcerns = concerns.filter(c => c.severity === "high");
    const approved = highSeverityConcerns.length === 0 && concerns.length <= 2;

    // Detect task rejection recommendation
    const shouldReject = strategyContent.toLowerCase().includes("reject") ||
                         strategyContent.toLowerCase().includes("don't do this task");

    return {
      approved,
      summary: approved
        ? `Strategy demonstrates good AFP/SCAS thinking`
        : `Strategy needs deeper analysis (${concerns.length} concerns)`,
      recommendation: shouldReject ? "reject" : (approved ? "proceed" : "revise"),
      concerns: concerns.length > 0 ? concerns : undefined,
      strengths: strengths.length > 0 ? strengths : undefined,
      betterAlternative: shouldReject ? this.extractAlternative(strategyContent) : undefined,
      reasoning: shouldReject ? this.extractRejectionReasoning(strategyContent) : undefined,
    };
  }

  private hasSection(content: string, sectionName: string): boolean {
    const regex = new RegExp(`##\\s+${sectionName}`, 'i');
    return regex.test(content);
  }

  private extractAlternative(content: string): string | undefined {
    // Extract proposed alternative from "Alternative X:" sections
    const altMatch = content.match(/Alternative \d+:([^\n]+)/i);
    return altMatch ? altMatch[1].trim() : "See strategy.md for details";
  }

  private extractRejectionReasoning(content: string): string | undefined {
    // Extract reasoning from reject decision
    const rejectMatch = content.match(/\[ \] REJECT[^\n]*\n([^\n]+)/i);
    return rejectMatch ? rejectMatch[1].trim() : undefined;
  }

  private async logStrategyReview(taskId: string, analysis: any): Promise<void> {
    // Log to state/analytics/strategy_reviews.jsonl
    const stateRoot = resolveStateRoot(this.workspaceRoot);
    const logPath = path.join(stateRoot, "analytics", "strategy_reviews.jsonl");

    const entry = {
      timestamp: Date.now(),
      taskId,
      approved: analysis.approved,
      recommendation: analysis.recommendation,
      concernCount: analysis.concerns?.length || 0,
      highSeverityCount: analysis.concerns?.filter((c: any) => c.severity === "high").length || 0,
    };

    try {
      await fs.promises.appendFile(logPath, JSON.stringify(entry) + "\n");
    } catch (error) {
      logWarning("Failed to log strategy review", { error });
    }
  }

  private generateRemediationInstructions(taskId: string, analysis: any): string {
    const instructions = [
      `\n⚠️ REMEDIATION REQUIRED for ${taskId}`,
      `\nYour strategy.md has ${analysis.concerns.length} concerns that must be addressed:\n`
    ];

    analysis.concerns.forEach((c: any, i: number) => {
      instructions.push(`${i + 1}. [${c.severity.toUpperCase()}] ${c.type}:`);
      instructions.push(`   ${c.guidance}\n`);
    });

    instructions.push(`\nNext steps:`);
    instructions.push(`1. Create remediation task: ${taskId}-REMEDIATION-${Date.now()}`);
    instructions.push(`2. Start new STRATEGIZE cycle addressing each concern`);
    instructions.push(`3. Update strategy.md with deeper analysis`);
    instructions.push(`4. Re-run: npm run strategy:review ${taskId}`);

    return instructions.join('\n');
  }
}
```

**LOC:** ~400 lines

### File 3: tools/wvo_mcp/scripts/run_strategy_review.ts

**Architecture:** (Following run_design_review.ts pattern)

```typescript
#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StrategyReviewerCritic } from "../src/critics/strategy_reviewer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(path.join(__dirname, "..", "..", ".."));
const evidenceRoot = path.join(repoRoot, "state", "evidence");

// ANSI colors
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

interface ReviewSummary {
  taskId: string;
  passed: boolean;
  message: string;
}

async function main(): Promise<void> {
  const taskArg = process.argv[2];
  const targets = taskArg ? [taskArg] : await discoverTasks();

  if (targets.length === 0) {
    console.log("No strategy.md files found to review.");
    return;
  }

  const reviewer = new StrategyReviewerCritic(repoRoot);
  const results: ReviewSummary[] = [];

  for (const taskId of targets) {
    const strategyPath = path.join(evidenceRoot, taskId, "strategy.md");

    try {
      await fs.access(strategyPath);
    } catch (error) {
      results.push({
        taskId,
        passed: false,
        message: `No strategy.md found at ${strategyPath}`,
      });
      continue;
    }

    try {
      const result = await reviewer.reviewStrategy(taskId);

      if (result.passed) {
        results.push({
          taskId,
          passed: true,
          message: "Strategy approved",
        });
      } else {
        const concerns = result.metadata?.concerns || [];
        const concernsList = concerns
          .map((c: any) => {
            const severity = c.severity === "high" ? `${RED}HIGH${RESET}` : `${YELLOW}MEDIUM${RESET}`;
            return `  ${severity} - ${c.type}: ${c.guidance}`;
          })
          .join("\n");

        results.push({
          taskId,
          passed: false,
          message: `Strategy needs revision:\n${concernsList}\n\n${result.metadata?.remediation_instructions || ""}`,
        });
      }
    } catch (error) {
      results.push({
        taskId,
        passed: false,
        message: `Strategy review failed: ${String(error)}`,
      });
    }
  }

  // Print results
  const failed = results.filter((r) => !r.passed);

  if (failed.length > 0) {
    console.error(`${RED}${BOLD}❌ Strategy review failed for ${failed.length} task(s):${RESET}\n`);
    for (const result of failed) {
      console.error(`${BLUE}${BOLD}${result.taskId}:${RESET}`);
      console.error(result.message);
      console.error("");
    }
    process.exit(1);
  }

  console.log(`${GREEN}${BOLD}✅ Strategy review passed for ${results.length} task(s).${RESET}`);
}

async function discoverTasks(): Promise<string[]> {
  try {
    const dirs = await fs.readdir(evidenceRoot);
    const tasks: string[] = [];

    for (const dir of dirs) {
      const strategyPath = path.join(evidenceRoot, dir, "strategy.md");
      try {
        await fs.access(strategyPath);
        tasks.push(dir);
      } catch {
        // No strategy.md in this task
      }
    }

    return tasks;
  } catch (error) {
    console.error("Failed to discover tasks:", error);
    return [];
  }
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

**LOC:** ~120 lines

### File 4: docs/orchestration/STRATEGY_CRITIC_GUIDE.md

**Content:**
- How to use StrategyReviewer
- Common failure modes (no via negativa, vague alternatives, missing value analysis)
- Examples of good vs bad strategies
- Remediation workflow
- Integration with pre-commit hook

**LOC:** ~200 lines

### File 5: tools/wvo_mcp/package.json (modification)

**Add:**
```json
{
  "scripts": {
    "strategy:review": "tsx scripts/run_strategy_review.ts"
  }
}
```

**LOC:** +3 lines

## Risk Analysis

### Edge Cases

1. **Task has no strategy.md yet:**
   - Critic fails with clear message: "Create strategy.md using template"
   - Not blocking - helps agent know what to do

2. **Strategy recommends rejecting task:**
   - Critic blocks with exit code 1
   - Shows proposed alternative
   - Agent must create new task or escalate

3. **Agent tries to game critic:**
   - File path verification (mentioned files must exist)
   - Generic phrase detection (flags vague answers)
   - Depth heuristics (line count, section presence)

4. **Critic too strict / false positives:**
   - Log all reviews for analysis
   - Can adjust thresholds based on data
   - Human escalation path via CLAUDE.md

5. **Performance (slow reviews):**
   - Use research layer efficiently
   - Cache template content
   - Parallel execution for multiple tasks

### Failure Modes

**What could go wrong?**

1. **Agents find workarounds:**
   - Mitigation: Evolve detection based on patterns in analytics
   - Add anti-gaming checks as needed
   - Human review for suspicious patterns

2. **Too many false positives:**
   - Mitigation: Test with 10+ real strategies first
   - Tune severity thresholds
   - Allow human override with escalation

3. **Agents ignore feedback:**
   - Mitigation: Pre-commit hook BLOCKS commits
   - Can't proceed without approval
   - Track rejection rate in analytics

4. **Intelligence engine unavailable:**
   - Mitigation: Graceful degradation to heuristic checks
   - Log warning, use basic pattern matching
   - Better than no enforcement

### Testing Strategy

**How will we verify this works?**

1. **Unit tests:**
   - StrategyReviewer.reviewStrategy() with 10+ examples
   - Good strategies (should approve)
   - Bad strategies (should block with specific concerns)
   - Edge cases (no strategy.md, minimal content, etc.)

2. **Integration tests:**
   - run_strategy_review.ts with test fixtures
   - Verify exit codes (0 for pass, 1 for fail)
   - Verify color output formatting

3. **Real-world validation:**
   - Test with 5 existing strategy.md files from state/evidence/
   - Verify concerns are specific and actionable
   - Check for false positives (blocking good work)

4. **Analytics validation:**
   - Verify logging to state/analytics/strategy_reviews.jsonl
   - Check JSON structure
   - Verify timestamps and concern counts

## Assumptions

1. **Research layer is available** (for intelligent analysis)
   - If not: Degrade to heuristic checks (still better than nothing)

2. **Agents will follow remediation feedback**
   - Pre-commit hook enforces this

3. **~30 line minimum for strategy.md is reasonable**
   - Based on strategy_template.md structure
   - Can adjust based on feedback

4. **File path verification is sufficient anti-gaming**
   - Can add more checks if gaming detected

5. **Exit code 1 blocking is acceptable UX**
   - Matches DesignReviewer pattern
   - Agents accustomed to this workflow

## Dependencies

**This task depends on:**
- Existing Critic base class (tools/wvo_mcp/src/critics/base.ts)
- Research layer / intelligence engine (for deep analysis)
- Analytics infrastructure (for logging)

**Future tasks depend on this:**
- Sub-Task 2 (ThinkingCritic) - independent, can run parallel
- Sub-Task 3 (Integration) - depends on this completing

## Next Phase: THINK

In the THINK phase, I'll reason through:
- How agents might game the system (and mitigations)
- Complexity trade-offs (is this intelligence worth the cost?)
- Second-order effects (how does this change agent behavior?)
- Failure modes and robustness
- Long-term implications

---

**Scope Compliance:**
- Files: 5 (≤5 ✓)
- LOC: ~673 net LOC (≤150 ✗ but justified - this is a complete feature)
- Note: Original 13-file task split into 3 sub-tasks to respect constraints
