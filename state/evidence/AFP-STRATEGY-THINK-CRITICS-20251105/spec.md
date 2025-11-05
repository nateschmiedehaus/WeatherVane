# Specification — AFP-STRATEGY-THINK-CRITICS-20251105

## Overview

This spec defines the requirements for strategy_template.md, think_template.md, StrategyReviewer, and ThinkingCritic to ensure they enforce world-class strategic thinking and critical reasoning.

## Component 1: strategy_template.md

### Purpose
Guide agents through rigorous strategic analysis that detects BS, evaluates value, considers alternatives, and aligns with AFP/SCAS principles.

### Functional Requirements

**FR-ST-1: Value Analysis Section**
- MUST require explicit "Why is this worth doing?" analysis
- MUST require opportunity cost consideration ("What else could we do?")
- MUST require mission alignment check
- MUST require "What if we don't do this?" failure mode analysis

**FR-ST-2: Root Cause Analysis Section**
- MUST distinguish symptoms vs root causes
- MUST require 5-whys or equivalent causal chain
- MUST identify systemic patterns vs one-off issues
- MUST trace problem origin

**FR-ST-3: Via Negativa First Section**
- MUST ask "Can we delete instead of add?" upfront (not at GATE)
- MUST explore simplification before addition
- MUST consider "What becomes possible if we remove X?"
- MUST ask "What's the simplest thing that could work?"

**FR-ST-4: Alternative Tasks Section**
- MUST propose at least 2 alternative tasks (including "don't do this")
- MUST include "10x better version" thinking
- MUST consider root cause solution vs proposed task
- MUST analyze opportunity costs

**FR-ST-5: Strategic Alignment Section**
- MUST show how task advances (not just complies with) AFP/SCAS
- MUST analyze entropy impact (increase/decrease)
- MUST evaluate as force multiplier vs linear effort
- MUST consider long-term trajectory

**FR-ST-6: Anti-Bullshit Checkboxes**
- [ ] "I have analyzed whether this task should be done at all"
- [ ] "I have identified the root cause, not just symptoms"
- [ ] "I have explored deletion/simplification first"
- [ ] "I have proposed at least 2 alternative tasks"
- [ ] "I can explain why this is the highest-value option"

### Non-Functional Requirements

**NFR-ST-1: Clarity**
- Questions MUST be specific and actionable (not vague)
- Examples MUST be provided for each section
- Template MUST distinguish good vs bad answers

**NFR-ST-2: Enforcement**
- Template MUST be structured for automated parsing by StrategyReviewer
- Sections MUST have clear headers for detection
- Checkboxes MUST be machine-verifiable

**NFR-ST-3: Completeness**
- Template MUST cover all insights from strategy.md "brilliant strategist" section
- Template MUST take 30-60 minutes to complete properly
- Superficial answers MUST be detectable

### Acceptance Criteria

- [ ] Template exists at docs/templates/strategy_template.md
- [ ] All 6 functional requirements implemented
- [ ] Contains examples of good vs bad strategic thinking
- [ ] Can be parsed by StrategyReviewer
- [ ] Tested with 3 real tasks (trivial, medium, complex)
- [ ] Takes 30-60 min to complete properly (not 5 min superficially)

---

## Component 2: think_template.md

### Purpose
Guide agents through fundamental reasoning that questions assumptions, analyzes complexity, considers second-order effects, and evaluates robustness.

### Functional Requirements

**FR-TH-1: Assumptions Identification Section**
- MUST make hidden assumptions explicit
- MUST validate model of reality
- MUST question "Is this assumption true?"
- MUST show "What if assumption is wrong?"

**FR-TH-2: Complexity Analysis Section**
- MUST distinguish essential vs accidental complexity (Fred Brooks)
- MUST define complexity budget
- MUST analyze mental model impact
- MUST estimate maintenance burden

**FR-TH-3: Second-Order Effects Section**
- MUST identify ripple consequences
- MUST analyze long-term trajectory vs short-term fix
- MUST consider system-wide impacts
- MUST evaluate unintended consequences

**FR-TH-4: Failure Modes Section**
- MUST analyze "How could this make things worse?" (iatrogenic)
- MUST identify Chesterton's fence concerns
- MUST evaluate reversibility (one-way vs two-way doors)
- MUST assess blast radius of failure

**FR-TH-5: Robustness Analysis Section**
- MUST apply antifragility lens (Taleb)
- MUST identify fragile vs robust vs antifragile aspects
- MUST consider edge cases and boundary conditions
- MUST evaluate error handling and degradation

**FR-TH-6: Deep Reasoning Checkboxes**
- [ ] "I have made all assumptions explicit and validated them"
- [ ] "I have distinguished essential vs accidental complexity"
- [ ] "I have analyzed second-order and long-term effects"
- [ ] "I have identified ways this could make things worse"
- [ ] "I have evaluated robustness and reversibility"

### Non-Functional Requirements

**NFR-TH-1: Depth**
- Questions MUST encourage fundamental reasoning, not surface implementation details
- Template MUST prevent "how to implement" from dominating "should we implement"
- Depth of thinking MUST be measurable

**NFR-TH-2: Rigor**
- Reasoning MUST be logical and evidence-based
- Claims MUST be falsifiable
- Analysis MUST be specific (not generic platitudes)

**NFR-TH-3: Integration**
- MUST build on insights from STRATEGY phase
- MUST inform PLAN phase design
- MUST flag issues that GATE would catch (catch earlier)

### Acceptance Criteria

- [ ] Template exists at docs/templates/think_template.md
- [ ] All 6 functional requirements implemented
- [ ] Contains examples of shallow vs deep thinking
- [ ] Can be parsed by ThinkingCritic
- [ ] Tested with 3 real tasks
- [ ] Catches issues that would surface at GATE (earlier detection)

---

## Component 3: StrategyReviewer Critic

### Purpose
Automated critic that analyzes strategy.md files to detect BS, validate strategic thinking, and enforce quality standards.

### Functional Requirements

**FR-SR-1: BS Detection**
- MUST detect missing value analysis ("why worth doing" absent)
- MUST detect symptom-only analysis (no root cause)
- MUST detect missing via negativa exploration
- MUST detect absence of alternatives
- MUST detect vague or generic statements

**FR-SR-2: Via Negativa Enforcement**
- MUST verify deletion/simplification was considered
- MUST check for specific examples of what could be deleted
- MUST reject "I considered deletion but..." without evidence
- MUST suggest concrete deletion opportunities if missing

**FR-SR-3: Alternative Validation**
- MUST verify at least 2 alternatives proposed
- MUST check alternatives are substantive (not superficial)
- MUST verify "don't do this task" was considered
- MUST validate opportunity cost analysis

**FR-SR-4: Strategic Depth**
- MUST detect superficial vs deep root cause analysis
- MUST verify AFP/SCAS alignment (not just mention)
- MUST check mission/value alignment is specific
- MUST validate success criteria are measurable

**FR-SR-5: Intelligent Feedback**
- MUST provide specific, actionable feedback (not generic)
- MUST cite exact sections that need improvement
- MUST suggest concrete next steps
- MUST distinguish critical vs minor concerns

**FR-SR-6: Task Rejection Capability**
- MUST be able to recommend "don't do this task" when appropriate
- MUST propose better alternative tasks when rejecting
- MUST explain why rejection is recommended
- MUST log rejected tasks to state/analytics/task_rejections.jsonl

### Non-Functional Requirements

**NFR-SR-1: Performance**
- MUST complete review in <30 seconds for typical strategy.md
- MUST use research layer efficiently (cache when possible)
- MUST not block workflow excessively

**NFR-SR-2: Accuracy**
- MUST achieve >90% accuracy on test set (good vs bad strategies)
- MUST minimize false positives (blocking good strategies)
- MUST minimize false negatives (approving bad strategies)

**NFR-SR-3: Integration**
- MUST work as npm script: `npm run strategy:review [TASK-ID]`
- MUST work in pre-commit hook
- MUST return exit code 1 when blocking, 0 when approved
- MUST output JSON-structured feedback for parsing

**NFR-SR-4: Evolvability**
- MUST log all reviews to state/analytics/strategy_reviews.jsonl
- MUST support learning from feedback loops
- MUST allow configuration of strictness levels
- MUST be testable with golden examples

### Acceptance Criteria

- [ ] StrategyReviewer implemented at tools/wvo_mcp/src/critics/strategy_reviewer.ts
- [ ] All FR-SR-* requirements met
- [ ] All NFR-SR-* requirements met
- [ ] Unit tests with 10+ examples (good/bad strategies)
- [ ] Integration test with pre-commit hook
- [ ] npm run strategy:review [TASK-ID] works
- [ ] Achieves >90% accuracy on test set
- [ ] Successfully rejects at least 1 low-quality strategy
- [ ] Documentation in docs/orchestration/STRATEGY_CRITIC_GUIDE.md

---

## Component 4: ThinkingCritic

### Purpose
Automated critic that analyzes think.md files to validate reasoning depth, detect shallow thinking, and ensure fundamental analysis.

### Functional Requirements

**FR-TC-1: Assumptions Detection**
- MUST verify assumptions are made explicit
- MUST check assumptions are validated (not just stated)
- MUST detect hidden unstated assumptions
- MUST verify "what if wrong?" analysis for each assumption

**FR-TC-2: Complexity Validation**
- MUST verify essential vs accidental complexity distinction
- MUST check complexity budget is defined
- MUST validate maintenance burden analysis
- MUST detect unjustified complexity increases

**FR-TC-3: Second-Order Effects**
- MUST verify ripple consequences are analyzed
- MUST check for long-term trajectory consideration
- MUST detect missing system-wide impact analysis
- MUST validate unintended consequences exploration

**FR-TC-4: Failure Mode Analysis**
- MUST verify iatrogenic effects ("make worse") considered
- MUST check reversibility analysis (one-way vs two-way doors)
- MUST validate blast radius assessment
- MUST detect Chesterton's fence violations

**FR-TC-5: Depth vs Breadth**
- MUST distinguish deep reasoning from shallow checklists
- MUST detect "how to implement" dominating "should we"
- MUST verify reasoning is specific (not generic)
- MUST check claims are falsifiable

**FR-TC-6: Intelligent Feedback**
- MUST provide specific examples of shallow thinking
- MUST suggest deeper questions to explore
- MUST cite which assumptions need validation
- MUST distinguish critical vs minor gaps

### Non-Functional Requirements

**NFR-TC-1: Performance**
- MUST complete review in <30 seconds for typical think.md
- MUST use research layer efficiently
- MUST not bottleneck workflow

**NFR-TC-2: Accuracy**
- MUST achieve >85% accuracy on test set (deep vs shallow thinking)
- MUST catch issues that GATE would catch (earlier detection)
- MUST minimize false positives

**NFR-TC-3: Integration**
- MUST work as npm script: `npm run think:review [TASK-ID]`
- MUST work in pre-commit hook
- MUST return exit code 1 when blocking, 0 when approved
- MUST output JSON-structured feedback

**NFR-TC-4: Evolvability**
- MUST log all reviews to state/analytics/think_reviews.jsonl
- MUST support learning from feedback
- MUST allow configuration of depth thresholds
- MUST be testable with golden examples

### Acceptance Criteria

- [ ] ThinkingCritic implemented at tools/wvo_mcp/src/critics/thinking_critic.ts
- [ ] All FR-TC-* requirements met
- [ ] All NFR-TC-* requirements met
- [ ] Unit tests with 10+ examples (deep/shallow thinking)
- [ ] Integration test with pre-commit hook
- [ ] npm run think:review [TASK-ID] works
- [ ] Achieves >85% accuracy on test set
- [ ] Successfully blocks at least 1 shallow think.md
- [ ] Documentation in docs/orchestration/THINKING_CRITIC_GUIDE.md

---

## Component 5: Documentation Integration

### Functional Requirements

**FR-DOC-1: AGENTS.md Updates**
- MUST add strategy_template.md reference to phase 1 (STRATEGIZE)
- MUST add think_template.md reference to phase 4 (THINK)
- MUST add StrategyReviewer workflow (like DesignReviewer)
- MUST add ThinkingCritic workflow

**FR-DOC-2: CLAUDE.md Updates**
- MUST reference strategy/think critics in operational checklist
- MUST add "run strategy:review before SPEC phase" guidance
- MUST add "run think:review before GATE phase" guidance
- MUST update AFP lifecycle section

**FR-DOC-3: MANDATORY_WORK_CHECKLIST.md Updates**
- MUST add Phase 1 checklist: "I completed strategy_template.md"
- MUST add Phase 4 checklist: "I completed think_template.md"
- MUST add "Run npm run strategy:review [TASK-ID]"
- MUST add "Run npm run think:review [TASK-ID]"

**FR-DOC-4: New Guides**
- MUST create docs/orchestration/STRATEGY_CRITIC_GUIDE.md
- MUST create docs/orchestration/THINKING_CRITIC_GUIDE.md
- MUST include examples of good/bad strategies/thinking
- MUST document common failure modes

### Acceptance Criteria

- [ ] All 4 docs (AGENTS.md, CLAUDE.md, MANDATORY_WORK_CHECKLIST.md, guides) updated
- [ ] References are consistent across docs
- [ ] Examples included in guides
- [ ] Pre-commit hook documented

---

## Component 6: Pre-Commit Hook Integration

### Functional Requirements

**FR-HOOK-1: Strategy Review**
- MUST run StrategyReviewer when strategy.md is staged
- MUST block commit if concerns found (exit code 1)
- MUST show clear error message with next steps
- MUST allow bypass only with documented override

**FR-HOOK-2: Think Review**
- MUST run ThinkingCritic when think.md is staged
- MUST block commit if concerns found (exit code 1)
- MUST show clear error message with next steps
- MUST allow bypass only with documented override

**FR-HOOK-3: Analytics**
- MUST log to state/analytics/strategy_remediations.jsonl when blocked
- MUST log to state/analytics/think_remediations.jsonl when blocked
- MUST track remediation iterations (1st review, 2nd review, etc.)
- MUST track time spent (estimate based on timestamps)

### Acceptance Criteria

- [ ] .githooks/pre-commit updated with strategy/think review logic
- [ ] Blocking works (exit 1 on concerns)
- [ ] Analytics logging works
- [ ] Error messages are clear and actionable
- [ ] Tested with real commit attempts

---

## System-Wide Acceptance Criteria

**This task is complete when:**

1. **All 6 components meet their individual acceptance criteria**
2. **Integration test passes:**
   - Create new task with task ID AFP-TEST-INTEGRATION-XXXXXX
   - Follow AFP lifecycle using new templates and critics
   - StrategyReviewer blocks superficial strategy.md (test blocking works)
   - Fix strategy.md based on feedback
   - StrategyReviewer approves improved strategy.md
   - ThinkingCritic blocks shallow think.md (test blocking works)
   - Fix think.md based on feedback
   - ThinkingCritic approves improved think.md
   - Complete full lifecycle to verify no regressions
3. **Quality evidence:**
   - Test with 3-5 existing tasks' strategy/think files
   - Critics identify real gaps (via negativa missing, etc.)
   - Feedback is specific and actionable
   - No false positives (blocking good work)
4. **Documentation complete:**
   - All guides exist and are comprehensive
   - Examples of good/bad included
   - AGENTS.md, CLAUDE.md, MANDATORY_WORK_CHECKLIST.md updated
5. **Analytics tracking:**
   - Logs exist: strategy_reviews.jsonl, think_reviews.jsonl, strategy_remediations.jsonl, think_remediations.jsonl
   - Task rejection log working (if any tasks rejected)

## Success Metrics (Post-Deployment)

Track these over next 10 tasks:

1. **Strategy quality improvement:**
   - % of strategies that pass StrategyReviewer first try (baseline <30%, target >60%)
   - % of tasks rejected at STRATEGY phase (expect 5-10%)
   - Alternative adoption rate (when critic suggests better task)

2. **Downstream impact:**
   - Reduction in GATE failures (expect 30-50% reduction)
   - Reduction in VERIFY failures (expect 20-30% reduction)
   - Time saved by catching bad tasks early (track hours)

3. **Thinking quality improvement:**
   - % of think.md that pass ThinkingCritic first try (baseline <40%, target >70%)
   - Complexity increase rate (expect decrease)
   - Assumption validation rate (expect increase)

4. **Compliance:**
   - % of tasks that use templates (target 100%)
   - % of commits blocked by hook (expect 20-40% initially, decreasing over time)
   - Remediation iteration count (2-3 is normal, >5 indicates systemic issue)

---

**Next Phase:** PLAN - Design the architecture and implementation approach for templates and critics
