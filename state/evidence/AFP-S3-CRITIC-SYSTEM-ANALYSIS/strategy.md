# STRATEGIZE: Critic System Analysis Through AFP/SCAS

**Task ID:** AFP-S3-CRITIC-SYSTEM-ANALYSIS
**Date:** 2025-11-05
**Agent:** Claude Council

---

## Problem Statement

The critic system has **8,078 LOC across 46 implementations** with a **broken build**, **13% test coverage**, and **30% code duplication**. This violates core AFP and SCAS principles and represents accumulated technical debt that threatens system reliability.

---

## Root Cause Analysis (Via AFP/SCAS Lens)

### 1. VIA NEGATIVA VIOLATIONS: Addition Without Subtraction

**Principle:** "Perfection is achieved not when there is nothing more to add, but when there is nothing more to take away."

**VIOLATIONS FOUND:**

**V1.1: Accumulation Without Deletion**
- 46 critics exist, but no evidence of critic retirement
- `modeling_reality` v1 AND v2 both in registry (v1 is pure wrapper)
- Intelligence engine (298 LOC) used by only 4/46 critics (9%)
- Escalation system (200 LOC) rarely triggered
- **AFP VIOLATION:** Adding features without removing unused ones

**V1.2: Trivial Critics That Should Be Config**
```typescript
// build.ts - 10 LOC for this?
export class BuildCritic extends Critic {
  protected command(profile: string): string | null {
    return "make lint"; // Could be: { build: "make lint" }
  }
}
```

8 critics (build, tests, security, typecheck, etc.) are just shell command wrappers.

**AFP DIAGNOSIS:** **"The best code is no code"** - these shouldn't be classes.

**V1.3: Dead Code in Graveyard Still Referenced**
- `ml_task_aggregator.ts` moved to graveyard (20251104 cleanup)
- 3 test files still import it (BROKEN BUILD)
- `research_types.ts` missing, breaks intelligence_engine.ts
- **AFP VIOLATION:** Incomplete deletion - like pulling a weed but leaving the roots

**QUANTITATIVE WASTE:**
- ModelingReality duplicate: ~200 LOC waste
- Trivial critics: ~150 LOC waste
- Intelligence engine (unused): ~200 LOC waste
- **TOTAL VIA NEGATIVA OPPORTUNITY: ~550 LOC (7% of critic code)**

---

### 2. REFACTOR NOT REPAIR VIOLATIONS: Patching Over Root Issues

**Principle:** "Don't patch symptoms, refactor to eliminate root causes."

**VIOLATIONS FOUND:**

**V2.1: Observation Critic Copy-Paste Pattern**

**Evidence of REPAIR thinking:**
```typescript
// api_observation.ts (564 LOC)
export interface APIIssue { severity, issue, suggestion }
export interface APIOpportunity { pattern, observation, opportunity }
export interface APIReport { overall_score, issues, opportunities }

// database_observation.ts (484 LOC)
export interface DatabaseIssue { severity, issue, suggestion } // COPY-PASTE
export interface DatabaseOpportunity { pattern, observation, opportunity } // COPY-PASTE
export interface DatabaseReport { overall_score, issues, opportunities } // COPY-PASTE

// infrastructure_observation.ts (543 LOC)
export interface InfrastructureIssue { severity, issue, suggestion } // COPY-PASTE
// ... and so on for 5 critics
```

**ROOT CAUSE:** No shared `ObservationCritic` base class

**REFACTOR SOLUTION:**
```typescript
// Should be:
export abstract class ObservationCritic<T extends Trace> extends Critic {
  protected abstract observe(): Promise<ObservationReport<T>>;
  // Share: Issue, Opportunity, Report, dev server, analysis patterns
}
```

**AFP DIAGNOSIS:** **"Each copy-paste is a missed abstraction"** - 2,449 LOC with 80% duplication is REPAIR thinking, not REFACTOR thinking.

**V2.2: God Class Base.ts Growing Over Time**

**Growth pattern (speculation based on 776 LOC):**
1. v1: Basic command execution (~200 LOC)
2. v2: + Escalation system (~200 LOC added)
3. v3: + Delegation system (~150 LOC added)
4. v4: + Intelligence integration (~100 LOC added)
5. v5: + Identity profiles (~50 LOC added)

**AFP DIAGNOSIS:** This is **additive patching**, not refactoring. Each feature bolted onto base class instead of extracted to collaborators.

**REFACTOR SOLUTION:**
```typescript
// Extract collaborators:
class Critic { /* 200 LOC core */ }
class EscalationManager { /* 200 LOC */ }
class DelegationCoordinator { /* 150 LOC */ }
class CriticIntelligence { /* 100 LOC */ }
class IdentityManager { /* 50 LOC */ }
```

**V2.3: Broken Build "Fixed" by Skipping**

**Current "repair":**
- Build fails with missing imports
- Tests broken? Just skip them in CI
- TypeScript errors? Add `@ts-ignore`

**ROOT CAUSE:** Incomplete graveyard cleanup

**REFACTOR SOLUTION:** Delete ALL references, or restore ALL dependencies. Half-measures = broken builds.

**QUANTITATIVE COST OF REPAIR THINKING:**
- Observation duplication: 1,500 LOC could be saved
- God class sprawl: 400 LOC could be extracted
- Broken build: 3 test files unusable
- **REPAIR DEBT: ~1,900 LOC + broken tests**

---

### 3. COMPLEXITY CONTROL VIOLATIONS: Unjustified Complexity

**Principle:** "Complexity must earn its keep. Every 100 LOC must justify its existence."

**VIOLATIONS FOUND:**

**V3.1: Intelligence Engine - High Cost, Low Value**

**Metrics:**
- LOC: 298 (3.7% of critic system)
- Usage: 4/46 critics (8.7%)
- Dependencies: ResearchManager, StateMachine (broken)
- Benefit: Categorizes failures (timeout, test, lint) - could be 20 LOC regex

**Cost-Benefit Analysis:**
```
COST:
- 298 LOC to maintain
- Complex dependency on ResearchManager (broken)
- Only works if critics opt-in with intelligenceEnabled: true
- Research paper integration (ambitious but unused)

BENEFIT:
- Failure categorization: "timeout", "test_failure", "lint_error"
- Remediation suggestions (generic)
- Historical tracking (unused in practice)

ROI: 298 LOC / 4 users = 74.5 LOC per user
```

**AFP VERDICT:** **UNJUSTIFIED COMPLEXITY** - 20 LOC regex would achieve 80% of value.

**V3.2: Escalation System - Sophisticated but Rarely Triggered**

**Code:** 200 LOC in base.ts (lines 341-551)

**Usage pattern:**
```typescript
// Triggered when:
// 1. Critic fails with critical severity
// 2. Escalation config exists for this critic
// 3. No recent escalation (within cooldown)

// In practice:
// - Escalation config exists for: ? (unknown, not documented)
// - Frequency of triggers: ? (no metrics)
// - Task completion rate: ? (no measurement)
```

**AFP DIAGNOSIS:** 200 LOC with unknown ROI is **speculative complexity**.

**V3.3: Delegation System - Similar to Escalation**

**Code:** 150 LOC in base.ts (lines 445-634)

**Pattern:** Create child tasks for specialist critics

**Question:** When is this used vs. just running another critic directly?

**AFP DIAGNOSIS:** Coordination complexity without clear value prop.

**COMPLEXITY BUDGET ANALYSIS:**

| Feature | LOC | Users | LOC/User | Justified? |
|---------|-----|-------|----------|------------|
| Intelligence Engine | 298 | 4 | 74.5 | ❌ NO - 20 LOC regex sufficient |
| Escalation System | 200 | ? | ? | ⚠️ UNKNOWN - no metrics |
| Delegation System | 150 | ? | ? | ⚠️ UNKNOWN - no metrics |
| Identity Profiles | 50 | ? | ? | ⚠️ UNKNOWN - unclear value |

**UNJUSTIFIED COMPLEXITY: 300-700 LOC (4-9% of system)**

---

### 4. SIMPLE VIOLATION: The System is NOT Simple

**SCAS Principle #1: SIMPLE** - "A system should be as simple as possible, but no simpler."

**COMPLEXITY INDICATORS:**

**C1: Learning Curve Too Steep**

To add a new critic, you must understand:
1. Critic base class (776 LOC with 10+ responsibilities)
2. CriticResult interface (extends CommandResult)
3. Profile system (low/medium/high)
4. command() vs evaluate() patterns (inconsistent)
5. Registration in session.ts CRITIC_REGISTRY
6. Optional: intelligence, escalation, delegation, identity
7. Optional: custom review methods (like reviewDesign())

**AFP VERDICT:** Should be: "Extend Critic, implement command(), register." Currently: 7-step process with optional complexity.

**C2: Two Patterns for Same Purpose**

```typescript
// Pattern 1: Command-based (43 critics)
class BuildCritic extends Critic {
  protected command(profile: string): string | null {
    return "make lint";
  }
}

// Pattern 2: Evaluate-based (3 critics)
class DesignReviewerCritic extends Critic {
  protected command(_profile: string): string | null {
    return null; // ???
  }

  async reviewDesign(taskId: string): Promise<CriticResult> {
    // Custom logic
  }
}
```

**AFP DIAGNOSIS:** **Liskov Substitution Principle violated** - not all critics can be used the same way.

**SIMPLE SOLUTION:** Split into `ShellCritic` and `DocumentCritic` base classes.

**C3: Hardcoded Registry = Poor Extensibility**

```typescript
// session.ts - must edit this file to add critics
const CRITIC_REGISTRY = {
  build: BuildCritic,
  tests: TestsCritic,
  // ... 44 more entries
} as const;
```

**SCAS VIOLATION:** Not adaptable - requires code change to extend.

**SIMPLE SOLUTION:** Convention-based discovery or registration API.

**SIMPLICITY SCORE: 3/10** - Too many concepts, inconsistent patterns, high coupling.

---

### 5. CORRECT VIOLATION: The System is NOT Correct

**SCAS Principle #2: CORRECT** - "A system must do what it claims reliably."

**CORRECTNESS FAILURES:**

**F1: Build is Broken**
```bash
$ npm run build
# error TS2307: Cannot find module '../ml_task_aggregator.js'
# error TS2307: Cannot find module '../intelligence/research_types.js'
# ... 20+ errors
```

**AFP VERDICT:** **NOT CORRECT** - cannot compile = cannot run.

**F2: Test Coverage: 13%**

| Category | Count | Tested | Coverage |
|----------|-------|--------|----------|
| Total Critics | 46 | 6 | 13% |
| Large Critics (>400 LOC) | 8 | 0 | 0% |
| Document Reviewers | 3 | 0 | 0% |
| Observation Critics | 5 | 0 | 0% |

**AFP VERDICT:** **NOT CORRECT** - untested code is assumed broken.

**F3: Broken Test Files**

3/9 test files have import errors:
- `ml_task_aggregator.test.ts`
- `ml_task_aggregator_critic_results.test.ts`
- `ml_task_meta_critic.test.ts`

**TEST FAILURE RATE: 33%** (3/9 test files broken)

**F4: No Measurement of Critic Effectiveness**

Questions we cannot answer:
- Which critics find real bugs?
- Which critics always pass (useless)?
- Which critics always fail (flaky)?
- False positive rate?
- False negative rate?

**AFP DIAGNOSIS:** **"You cannot manage what you do not measure"** - no effectiveness data = cannot improve.

**CORRECTNESS SCORE: 2/10** - Broken build, poor tests, no metrics.

---

### 6. ADAPTABLE VIOLATION: The System is NOT Adaptable

**SCAS Principle #3: ADAPTABLE** - "A system must handle change gracefully."

**RIGIDITY INDICATORS:**

**R1: Hardcoded Registry Prevents Extension**

To add a critic:
1. Write critic class
2. Edit session.ts CRITIC_REGISTRY (hardcoded)
3. Restart MCP server
4. Hope import works

**Cannot:**
- Add critics at runtime
- Load critics from plugins
- Disable critics without code change
- A/B test critic variations

**R2: Tight Coupling: Critics → Orchestrator**

```typescript
// base.ts
import type { StateMachine, Task, TaskStatus } from "../orchestrator/state_machine.js";
```

**Impact:** Orchestrator changes break critics. Cannot use critics standalone.

**R3: Profile System (low/medium/high) Not Extensible**

```typescript
protected abstract command(profile: string): string | null;
// What if we need: "quick", "thorough", "chaos"?
// Must change every critic signature
```

**R4: No Feature Flags for Experimental Critics**

Want to try a new critic without risk?
- No way to enable for 10% of tasks
- No way to compare old vs new side-by-side
- No gradual rollout

**ADAPTABILITY SCORE: 3/10** - Hardcoded, coupled, inflexible.

---

## AFP/SCAS Scorecard

| Principle | Score | Critical Issues |
|-----------|-------|-----------------|
| **Via Negativa** | 4/10 | Accumulation (46 critics), duplicates (v1/v2), trivial critics, dead code |
| **Refactor not Repair** | 3/10 | Copy-paste (2,449 LOC), god class (776 LOC), broken build |
| **Complexity Control** | 4/10 | Intelligence (298 LOC, 4 users), escalation (200 LOC, unknown ROI) |
| **Simple** | 3/10 | Two patterns, steep learning curve, hardcoded registry |
| **Correct** | 2/10 | **Broken build**, 13% test coverage, no metrics |
| **Adaptable** | 3/10 | Hardcoded registry, tight coupling, no plugins |

**OVERALL AFP/SCAS COMPLIANCE: 3.2/10** ⚠️ **FAILING**

---

## Strategic Recommendations (Via Negativa First)

### PHASE 1: DELETION (Via Negativa)

**What to DELETE (Week 1):**

1. **Delete ModelingReality v1** (~100 LOC)
   ```typescript
   // It's just a wrapper around v2
   // Keep: ModelingRealityV2Critic
   // Delete: ModelingRealityCritic
   ```

2. **Delete broken test files** (3 files)
   ```bash
   rm src/critics/__tests__/ml_task_aggregator*.test.ts
   # They reference deleted ml_task_aggregator.ts
   ```

3. **Delete intelligence engine research integration** (~150 LOC)
   ```typescript
   // Keep: Basic failure categorization (20 LOC)
   // Delete: ResearchManager integration, academic paper lookups
   ```

4. **Delete trivial critic classes** (~150 LOC)
   ```typescript
   // Replace with config:
   const SHELL_CRITICS = {
     build: "make lint",
     tests: "bash tools/wvo_mcp/scripts/run_integrity_tests.sh",
     // ...
   };
   ```

**DELETION SAVINGS: 400-500 LOC (5-6% reduction)**

### PHASE 2: REFACTOR (Address Root Causes)

**What to REFACTOR (Weeks 2-3):**

1. **Extract ObservationCritic base class** (HIGHEST PRIORITY)
   ```typescript
   // Consolidate 2,449 LOC → ~1,000 LOC
   // Savings: 1,500 LOC (18% of system)
   ```

2. **Extract DocumentReviewerCritic base class**
   ```typescript
   // Consolidate 1,882 LOC → ~1,500 LOC
   // Savings: 300-400 LOC (4-5% of system)
   ```

3. **Split Critic god class**
   ```typescript
   // Extract: EscalationManager, DelegationCoordinator
   // Reduce base.ts: 776 → 300 LOC
   // Improve: Testability, clarity
   ```

**REFACTOR SAVINGS: 1,800-2,000 LOC (22-25% reduction)**

### PHASE 3: SIMPLIFY (Reduce Complexity)

**What to SIMPLIFY (Month 2):**

1. **Simplify intelligence engine**
   - Keep: Basic failure categorization (regex-based, 20 LOC)
   - Remove: ResearchManager, complex tracking
   - Result: 298 → 50 LOC (80% reduction)

2. **Standardize critic patterns**
   - Split: ShellCritic vs DocumentCritic base classes
   - Clarify: When to use each
   - Remove: Dual command()/reviewX() pattern confusion

3. **Replace hardcoded registry**
   - Add: CriticRegistry with register() API
   - Enable: Plugin system, dynamic loading
   - Improve: Testability (mock critics)

### PHASE 4: MEASURE (Establish Correctness)

**What to MEASURE (Month 2-3):**

1. **Add tests to reach 70% coverage**
   - Priority 1: Document reviewers (GATE-critical)
   - Priority 2: Observation critics (spawn processes)
   - Priority 3: All critics with >200 LOC

2. **Track critic effectiveness**
   ```typescript
   interface CriticMetrics {
     runs: number;
     failures: number;
     falsePositives: number; // User override
     avgDuration: number;
     lastUpdated: Date;
   }
   ```

3. **Monitor build health**
   - CI: Fail on build errors (currently passing with errors!)
   - CI: Fail on test failures
   - CI: Track coverage delta

### PHASE 5: ADAPT (Enable Flexibility)

**What to ENABLE (Month 3):**

1. **Feature flags for critics**
   ```typescript
   // Gradual rollout, A/B testing
   if (featureFlags.isEnabled('new_perf_critic', taskId)) {
     return new PerformanceCriticV2();
   }
   ```

2. **Plugin system**
   ```typescript
   // Allow external critics without editing session.ts
   registry.register('custom_critic', CustomCritic);
   ```

3. **Decouple from orchestrator**
   ```typescript
   // Use dependency injection, not direct imports
   interface TaskContext { /* minimal interface */ }
   // Instead of: import { StateMachine } from "../orchestrator"
   ```

---

## Success Criteria (SPEC Preview)

**VIA NEGATIVA SUCCESS:**
- ✅ Deleted 400-500 LOC in Phase 1
- ✅ Zero duplicate implementations
- ✅ All trivial critics replaced with config

**REFACTOR SUCCESS:**
- ✅ Observation critics share base class
- ✅ Document reviewers share base class
- ✅ Critic base class <300 LOC (from 776)

**SIMPLICITY SUCCESS:**
- ✅ One clear pattern: extend base, implement method, register
- ✅ Plugin system working
- ✅ New critic can be added in <15 minutes

**CORRECTNESS SUCCESS:**
- ✅ Build passes: `npm run build` zero errors
- ✅ Test coverage >70%
- ✅ Effectiveness metrics tracked

**ADAPTABILITY SUCCESS:**
- ✅ Can add critic without editing core files
- ✅ Can A/B test critics
- ✅ Critics work standalone (no orchestrator dependency)

---

## Conclusion

The critic system demonstrates **classic technical debt accumulation**: initial good design (elegant base class, template method pattern) degraded through **repair thinking** (copy-paste, bolt-on features) instead of **refactor thinking** (extract abstractions, via negativa).

**Core Issue:** **Violation of "Refactor not Repair"** led to 30% duplication and god class sprawl.

**Path Forward:** Via Negativa first (delete 500 LOC), then Refactor (consolidate 2,000 LOC), then Measure (add tests), then Adapt (enable plugins).

**Estimated Total Savings:** 2,500-3,000 LOC (31-37% reduction) with INCREASED correctness and adaptability.

**AFP/SCAS Alignment:** Current 3.2/10 → Target 8/10 after refactor.
