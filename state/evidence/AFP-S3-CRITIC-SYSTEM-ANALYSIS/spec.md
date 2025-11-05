# SPEC: Critic System Analysis & Recommendations

**Task ID:** AFP-S3-CRITIC-SYSTEM-ANALYSIS
**Date:** 2025-11-05
**Phase:** SPEC (Phase 2 of 10)

---

## Acceptance Criteria

### AC1: Complete Critical Analysis Delivered

**GIVEN** the critic system exists with 46 implementations (8,078 LOC)
**WHEN** analysis is complete
**THEN** deliverable must include:

✅ **AFP/SCAS Scorecard** with quantified scores (0-10) for each principle:
- Via Negativa compliance
- Refactor not Repair adherence
- Complexity Control metrics
- SIMPLE score
- CORRECT score
- ADAPTABLE score

✅ **Quantitative Metrics:**
- Total LOC count
- LOC per critic (histogram)
- Duplication percentage (with evidence)
- Test coverage percentage
- Build health status

✅ **Critical Issues Ranked by Severity** (1-4):
- SEVERITY 1: Build-breaking (must fix now)
- SEVERITY 2: High risk (fix this sprint)
- SEVERITY 3: Technical debt (fix next quarter)
- SEVERITY 4: Nice to have (backlog)

✅ **Specific Code Examples:**
- At least 5 examples of violations
- With file names and line numbers
- With "before/after" recommendations

**Success:** Analysis document reviewed by user, findings accepted as accurate.

---

### AC2: Complete System Inventory Documented

**GIVEN** the critic system has multiple integration points
**WHEN** inventory is complete
**THEN** documentation must include:

✅ **Full Critic Inventory:**
- All 46 critics listed with LOC counts
- Categorized by type (Shell, Observation, Document Reviewer, etc.)
- Status indicators (working, broken, duplicate)

✅ **Type System Documentation:**
- All interfaces documented (CriticResult, CriticOptions, etc.)
- Inheritance hierarchy mapped
- Connection to CommandResult shown

✅ **Connection Points Mapped:**
- Registration mechanism (CRITIC_REGISTRY)
- Invocation paths (CriticEnforcer → SessionContext → Critic)
- Persistence locations (state/critics/*.json)
- Configuration files (escalation, identity, screenshots)

✅ **Data Flow Diagrams:**
- At least 3 major flows documented (simple critic, observation, document reviewer)
- ASCII diagrams showing component interactions

✅ **Extension Points:**
- Current mechanisms (extend Critic, override methods)
- Missing mechanisms (plugins, runtime registration)

✅ **Multiple Perspectives:**
- Architect view (layered architecture)
- Developer view (how to add critic)
- Operator view (runtime behavior)
- Security view (risks, mitigations)
- Testing view (coverage analysis)

**Success:** Any developer can understand the critic system from this inventory alone.

---

### AC3: Actionable Recommendations Provided

**GIVEN** critical issues have been identified
**WHEN** recommendations are delivered
**THEN** they must be:

✅ **Prioritized** in clear phases:
- Week 1: Immediate fixes (broken build)
- Weeks 2-3: High-priority refactoring
- Month 2: Technical debt reduction
- Month 3: Capability enhancement

✅ **Specific** with implementation guidance:
- File names to edit/create/delete
- LOC savings estimates
- Risk assessment (low/medium/high)
- Effort estimates (hours/days/weeks)

✅ **Measurable** with success criteria:
- Before: Build fails with 20 errors
- After: Build passes with 0 errors
- Before: 13% test coverage
- After: 70% test coverage

✅ **AFP/SCAS Aligned:**
- Via Negativa first (deletion before addition)
- Refactor not Repair (address root causes)
- Complexity reduction justified (ROI analysis)

✅ **Realistic:**
- Acknowledges constraints (time, risk, dependencies)
- Offers incremental path (not "rewrite everything")
- Identifies quick wins vs. long-term projects

**Success:** User can execute recommendations without further research.

---

### AC4: Evidence of Thoroughness

**GIVEN** this is a critical analysis
**WHEN** evaluation is performed
**THEN** evidence must show:

✅ **Comprehensive Code Reading:**
- Not just file names, but actual code examined
- Direct quotes from source files
- Line number references for violations

✅ **Quantitative Analysis:**
- LOC counts from actual files (not estimates)
- Test coverage calculated from test files found
- Duplication measured (not assumed)

✅ **Pattern Recognition:**
- Identified shared patterns (Observation critics)
- Identified anti-patterns (God class, Shotgun Surgery)
- Compared implementations (v1 vs v2)

✅ **Multiple Search Methods:**
- grep for patterns (TODO, FIXME, imports)
- File tree exploration (find critics, tests)
- Build output analysis (error messages)
- Code path tracing (registration → execution)

**Success:** Analysis holds up to peer review, no major gaps.

---

### AC5: AFP/SCAS Lens Applied Rigorously

**GIVEN** this analysis must use AFP/SCAS principles
**WHEN** evaluation is complete
**THEN** each principle must be:

✅ **Via Negativa:**
- Identified what should be DELETED (duplicates, dead code, trivial critics)
- Quantified deletion opportunity (LOC savings)
- Prioritized deletion before addition

✅ **Refactor not Repair:**
- Distinguished between patches (bad) and refactoring (good)
- Identified root causes (copy-paste, god class)
- Proposed structural fixes (extract base classes)

✅ **Complexity Control:**
- Calculated complexity ROI (LOC vs users)
- Identified unjustified complexity (intelligence engine)
- Recommended simplification (remove unused features)

✅ **SIMPLE:**
- Assessed learning curve (too steep)
- Identified pattern inconsistencies (command vs evaluate)
- Proposed clearer abstractions

✅ **CORRECT:**
- Verified build status (broken)
- Measured test coverage (13%)
- Identified reliability gaps (no metrics)

✅ **ADAPTABLE:**
- Assessed extensibility (hardcoded registry)
- Identified coupling (critics → orchestrator)
- Proposed flexibility improvements (plugins)

**Success:** Each AFP/SCAS principle has dedicated analysis section with score.

---

## Functional Requirements

### FR1: Analysis Completeness

The analysis MUST cover:
- ✅ All 46 critic implementations (no sampling)
- ✅ Base class (base.ts) in detail
- ✅ Supporting systems (intelligence, escalation, delegation)
- ✅ Test suite (coverage, quality, broken tests)
- ✅ Integration points (orchestrator, session, registry)

### FR2: Inventory Completeness

The inventory MUST document:
- ✅ Every critic file with LOC count
- ✅ Every interface type
- ✅ Every connection point (≥10 identified)
- ✅ Every data flow path (≥3 major flows)
- ✅ Every anti-pattern detected (≥5 examples)

### FR3: Recommendation Actionability

Recommendations MUST include:
- ✅ Specific file paths to edit
- ✅ Before/after code examples
- ✅ Effort estimates (hours/days/weeks)
- ✅ Risk assessment (low/medium/high)
- ✅ Dependencies between recommendations
- ✅ Rollback strategies for risky changes

### FR4: Evidence Quality

All claims MUST be supported by:
- ✅ Direct code quotes (with file:line references)
- ✅ Quantitative data (LOC counts, percentages)
- ✅ Build output (error messages)
- ✅ Test results (coverage reports)
- ✅ Pattern examples (multiple instances)

---

## Non-Functional Requirements

### NFR1: Readability

- Documents must be skimmable (headers, tables, bullet points)
- Technical jargon explained on first use
- ASCII diagrams for visual learners
- Examples for every abstract concept

### NFR2: Credibility

- No speculation without labeling as such
- Citations to actual code (file:line)
- Quantitative > qualitative claims
- Conservative estimates (not worst-case)

### NFR3: Actionability

- Recommendations executable without further research
- Clear dependencies (do X before Y)
- Effort estimates realistic (not optimistic)
- Quick wins identified (low-hanging fruit)

### NFR4: AFP/SCAS Alignment

- Via Negativa first in recommendations
- Refactor not Repair emphasized throughout
- Complexity reductions prioritized over additions
- SIMPLE, CORRECT, ADAPTABLE as goals

---

## Out of Scope

This analysis will NOT:
- ❌ Implement any changes (analysis only)
- ❌ Write tests (testing strategy only)
- ❌ Refactor code (refactor plan only)
- ❌ Make decisions (recommendations only)

This analysis WILL provide:
- ✅ Complete understanding of current state
- ✅ Clear assessment of problems
- ✅ Actionable path forward
- ✅ Risk/benefit analysis

---

## Success Metrics

### Metric 1: AFP/SCAS Compliance Score

**Current State:** 3.2/10 (from analysis)
**Target State:** 8.0/10 (after refactor)

**Breakdown:**
| Principle | Current | Target | Delta |
|-----------|---------|--------|-------|
| Via Negativa | 4/10 | 9/10 | +5 |
| Refactor not Repair | 3/10 | 8/10 | +5 |
| Complexity Control | 4/10 | 8/10 | +4 |
| SIMPLE | 3/10 | 8/10 | +5 |
| CORRECT | 2/10 | 9/10 | +7 |
| ADAPTABLE | 3/10 | 7/10 | +4 |

### Metric 2: Code Reduction

**Current:** 8,078 LOC
**Target:** 5,500-6,000 LOC
**Reduction:** 2,000-2,500 LOC (25-31%)

**Breakdown:**
- Via Negativa deletions: 500 LOC
- Refactor consolidations: 1,500-2,000 LOC

### Metric 3: Test Coverage

**Current:** 13% (6/46 critics tested)
**Target:** 70% (32/46 critics tested)
**Increase:** +57 percentage points

**Priority:**
- Document reviewers: 0% → 100% (GATE-critical)
- Observation critics: 0% → 80% (high-risk)
- All critics >200 LOC: 0% → 70%

### Metric 4: Build Health

**Current:**
- Build: ❌ FAILING (20+ errors)
- Tests: ⚠️ 33% broken (3/9 files)

**Target:**
- Build: ✅ PASSING (0 errors)
- Tests: ✅ 100% working (0 broken files)

### Metric 5: Developer Experience

**Current:** 8 steps to add a critic (includes editing core files)
**Target:** 3 steps to add a critic (no core file edits)

**Measurements:**
- Time to add critic: Current ~30 min → Target ~10 min
- Restarts required: Current 1 → Target 0 (plugin system)
- Files to edit: Current 2 → Target 1 (just the critic)

---

## Acceptance Test Plan

### Test 1: Completeness Validation

**Procedure:**
1. Count all critics in analysis
2. Verify against src/critics directory
3. Check all claimed LOC counts
4. Verify all code examples exist

**Pass Criteria:** 100% accuracy (no missing critics, no wrong LOC counts)

### Test 2: Actionability Validation

**Procedure:**
1. Select 3 recommendations at random
2. Ask developer to execute without guidance
3. Measure completion time and blockers

**Pass Criteria:** All 3 executable in <2 hours with 0 questions

### Test 3: AFP/SCAS Alignment Validation

**Procedure:**
1. Review each AFP/SCAS section
2. Verify evidence supports claims
3. Check quantitative metrics provided

**Pass Criteria:** Every principle has ≥3 examples with quantitative data

### Test 4: Peer Review

**Procedure:**
1. Submit analysis to another engineer
2. Ask: "Can you find errors or gaps?"
3. Collect feedback

**Pass Criteria:** <5 minor corrections, 0 major gaps

---

## Constraints

### Time Constraints
- Analysis completion: Same session (no multi-day research)
- Depth vs breadth: Comprehensive but not exhaustive (won't read all 8,078 LOC)

### Knowledge Constraints
- Based on static analysis (no runtime profiling)
- Based on current codebase (no historical analysis)
- No access to production metrics (usage patterns unknown)

### Scope Constraints
- Analysis only (no implementation)
- Recommendations only (no decisions)
- Current architecture (no blue-sky redesigns)

---

## Deliverables Checklist

- ✅ **strategy.md** - Root cause analysis via AFP/SCAS lens (COMPLETE)
- ✅ **inventory.md** - Complete system inventory with all connection points (COMPLETE)
- ⏳ **spec.md** - Acceptance criteria and success metrics (THIS FILE)
- 🔜 **plan.md** - Refactor plan with alternatives considered
- 🔜 **think.md** - Edge case analysis and failure modes
- 🔜 **design.md** - Five Forces analysis, implementation plan (GATE)
- 🔜 **verify.md** - Verification evidence (if implementation proceeds)
- 🔜 **review.md** - Quality review results (if implementation proceeds)

---

## Conclusion

This SPEC defines what "complete and correct critical analysis" means for the critic system. Success is measurable: AFP/SCAS scores, LOC reduction, test coverage, build health, and developer experience.

The analysis is not just description—it's a foundation for action. Every recommendation must be specific, measurable, achievable, relevant, and time-bound (SMART).

**Next Phase:** PLAN - Define approach for executing recommendations, considering alternatives.
