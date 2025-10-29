# IMP-ADV-01.2: Inject Hints into Planner Prompt - STRATEGIZE

**Task ID**: IMP-ADV-01.2
**Phase**: STRATEGIZE
**Date**: 2025-10-29
**Status**: In Progress

---

## Problem

**Current State**:
- Quality graph hints are retrieved in `plan_runner.ts:60-95` via `getPlanningHints()`
- Hints achieve EXCELLENT quality (precision@5 = 0.780, per IMP-ADV-01.3)
- Hints are attached to plan result (`plan_runner.ts:136`) but **NOT injected into planner prompt**
- TODO comment at `plan_runner.ts:98` says: "Extend PlannerAgent to accept hints parameter and inject into prompt"
- PlannerAgent is currently a context preparation stub (no actual LLM call)

**Gap**: High-quality similarity hints are generated but **never used for planning**, wasting the value from IMP-ADV-01 Quality Graph investment.

**Evidence from IMP-ADV-01.3**:
- Mean Precision@5: 0.780 (78% of similar tasks are relevant)
- 7 of 20 queries achieved perfect 1.00 precision
- Similar tasks provide valuable context:
  - Same domain (IMP-API-* → IMP-API-*)
  - Related technical approaches (authentication, caching, database patterns)
  - Reusable code patterns and lessons learned

---

## Objectives

**Primary Goal**: Enable planner to use quality graph hints for improved planning decisions

**Success Criteria**:
1. Hints are accessible to planner agent (parameter or context)
2. Feature flag controls hint injection (`quality_graph.hints_injection=observe|enforce`)
3. Telemetry tracks hint usage (hints_provided, hints_used, planning_improved)
4. Forward-compatible with prompt compiler roadmap (IMP-21-24)
5. Ablation study shows planning improvement with hints vs without

**Non-Goals**:
- ❌ Implement full prompt compiler now (IMP-21-24 scope)
- ❌ Implement actual LLM call in PlannerAgent (future work)
- ❌ Complex prompt engineering (keep simple for now)
- ❌ Multi-variate prompting or persona routing (IMP-22-26 scope)

---

## Scope

### In Scope

**Minimal Changes (Forward-Compatible Approach)**:
1. **Plan Runner**: Pass hints to planner agent as new parameter
2. **Planner Agent**: Accept hints parameter, store in context pack
3. **Context Pack**: Include hints in structured format for future prompt compiler
4. **Feature Flag**: Add `quality_graph.hints_injection` flag (observe/enforce/off)
5. **Telemetry**: Log hint availability and size
6. **Documentation**: Mark as bridge solution until prompt compiler

**Why Minimal?**:
- Current PlannerAgent is a stub (no LLM call)
- Prompt compiler (IMP-21) will formalize prompt assembly
- Don't duplicate work that will be replaced
- Focus on data flow and flag infrastructure

### Out of Scope

**Deferred to Future Tasks**:
- Actual LLM call implementation → Prompt Compiler (IMP-21)
- Prompt template design → Domain Overlays (IMP-23)
- Persona-based tool allowlists → PersonaSpec (IMP-22, IMP-25)
- Prompt attestation and drift detection → IMP-24, IMP-35
- Advanced hint formatting (embeddings, citations) → Neural Embeddings (IMP-ADV-01.6)

---

## Context: Prompting Roadmap Integration

### Relationship to Prompting Tasks (IMP-21 through IMP-37)

**This Task (IMP-ADV-01.2)**: Simple bridge solution
- Pass hints to planner agent
- Store in context pack
- Ready for prompt compiler to consume

**Future Prompt Infrastructure** (from IMPROVEMENT_BATCH_PLAN.md:145-229):

1. **IMP-21: Prompt Compiler** (skeleton + canonicalization)
   - Programmatic assembly with typed slots
   - Core header + phase role + domain overlays + skill packs
   - **Integration Point**: Compiler will read hints from context pack and inject into assembled prompt

2. **IMP-22: PersonaSpec** (canonicalize/hash + attestation)
   - Typed PersonaSpec with persona hash
   - **Integration Point**: Planner persona may have hint preferences (summary vs full, filtered by domain)

3. **IMP-23: Domain Overlays Library**
   - Curated overlay packs for orchestrator/web/ml/api/security
   - **Integration Point**: Hints can be formatted per domain overlay (API hints → API-specific format)

4. **IMP-24: StateGraph Hook** (compile/attach prompt per phase)
   - Compile prompt before each runner
   - Record prompt_hash in attestation + ledger
   - **Integration Point**: PLAN phase hook will call compiler, compiler reads hints from context, injects into prompt

5. **IMP-35: Prompt Eval Harness + Gates**
   - Golden tasks + robustness corpus
   - **Integration Point**: Ablation study for hint injection (with/without hints)

**Migration Path**:
```
Current (IMP-ADV-01.2):
  plan_runner → getPlanningHints() → pass to planner → store in context_pack

Future (IMP-21-24):
  plan_runner → getPlanningHints() → pass to planner → store in context_pack
  state_graph → compile_prompt(phase='plan', context_pack) → inject hints → call LLM
```

**Key Insight**: By storing hints in context_pack NOW, we make them available for prompt compiler LATER without changing the data flow.

---

## Inputs

**Available Data**:
1. ✅ Quality graph hints (via `getPlanningHints()`)
2. ✅ Hint quality evaluation (precision@5 = 0.780)
3. ✅ Feature flag infrastructure (`LiveFlags`)
4. ✅ Context pack storage (`RunEphemeralMemory`)
5. ✅ Telemetry logging (`logInfo`, `logDebug`)

**Dependencies**:
- IMP-ADV-01.3 (evaluation) ✅ COMPLETE
- Quality graph embeddings ✅ COMPLETE
- Feature flags system ✅ EXISTS

**Blocking Issues**: None

---

## Risks

### Risk 1: Premature Implementation
**Risk**: Implementing full prompt injection now duplicates work that IMP-21-24 will replace
**Mitigation**: Minimal approach - only pass hints to context, don't implement LLM call
**Likelihood**: High if we overengineer
**Impact**: Medium (wasted effort, technical debt)

### Risk 2: Incompatibility with Prompt Compiler
**Risk**: Our approach conflicts with future prompt compiler architecture
**Mitigation**: Store hints in context_pack (standard location prompt compiler will read)
**Likelihood**: Low with minimal approach
**Impact**: High (would require refactor)

### Risk 3: No Measurable Impact
**Risk**: Hints don't actually improve planning (even with 0.780 precision)
**Mitigation**: Ablation study in VERIFY phase, feature flag for easy rollback
**Likelihood**: Medium (hints are relevant but may not affect decisions)
**Impact**: Low (learning from negative result is valuable)

### Risk 4: Hint Injection Overhead
**Risk**: Processing/injecting hints adds latency to planning
**Mitigation**: Hints already retrieved (non-blocking), storage is O(1)
**Likelihood**: Very Low
**Impact**: Low (marginal latency increase)

---

## Strategy

### Approach: Minimal Forward-Compatible Bridge

**Phase 1 (This Task - IMP-ADV-01.2)**:
1. Extend `PlannerAgentInput` to accept `qualityGraphHints?: string`
2. Extend `planner.run()` to store hints in context_pack
3. Add `quality_graph.hints_injection` feature flag (observe/enforce/off)
4. Log hint availability to telemetry
5. Document as bridge solution for prompt compiler

**Phase 2 (Future - IMP-21)**:
- Prompt compiler reads hints from context_pack
- Assembles prompt with hints in appropriate section
- No changes needed to plan_runner or planner_agent

**Phase 3 (Future - IMP-35)**:
- Ablation study measures planning improvement
- A/B test with/without hints
- Evaluate via success rate, plan quality, task completion

### Implementation Approach

**Option A (Chosen): Minimal Context Flow**
```typescript
// plan_runner.ts (minimal change)
const planResult = await deps.planner.run({
  task,
  attempt: attemptNumber,
  requireDelta: requirePlanDelta ?? false,
  modelSelection,
  qualityGraphHints,  // NEW: pass hints
});

// planner_agent.ts (minimal change)
const contextPack = {
  planHash,
  kb: kbPack,
  index: indexSnapshot,
  summary: `Context pack for ${input.task.id}`,
  coverageTarget,
  proofMetadata,
  qualityGraphHints: input.qualityGraphHints,  // NEW: store hints
};
```

**Pros**:
- Minimal code changes (~10 lines)
- Forward-compatible with prompt compiler
- Feature flag controls availability
- Easy to measure via telemetry

**Cons**:
- Doesn't demonstrate actual planning improvement (requires IMP-21)
- Hints are stored but not used yet

**Option B (Rejected): Full Prompt Injection**
```typescript
// planner_agent.ts (complex change)
async run(input: PlannerAgentInput): Promise<PlannerAgentResult> {
  const systemPrompt = this.buildSystemPrompt(input);
  const userPrompt = this.buildUserPrompt(input, input.qualityGraphHints);
  const response = await this.deps.router.generate({ system, user });
  // ... parse response into PlannerAgentResult
}
```

**Pros**:
- Demonstrates actual planning improvement immediately

**Cons**:
- Duplicates work that IMP-21 will replace
- Complex prompt engineering before infrastructure ready
- High risk of incompatibility with future prompt compiler

**Decision**: **Option A** - Minimal context flow

**Rationale**:
1. Respects prompting roadmap (IMP-21-24 owns prompt assembly)
2. Enables quick rollout with low risk
3. Can measure hint availability and size
4. Forward-compatible migration path
5. Follows "fundamentals first" principle (don't build on unstable base)

---

## Alternatives Considered

### Alternative 1: Do Nothing (Wait for IMP-21)
**Approach**: Defer all hint injection until prompt compiler ready
**Pros**: No duplication of work
**Cons**: Quality graph value remains unrealized for months
**Decision**: Rejected - low-hanging fruit, minimal work

### Alternative 2: MCP Client Injection
**Approach**: Have MCP client (Claude Code) read hints from file system and inject
**Pros**: Works with current stub planner
**Cons**: Tight coupling to MCP client, not forward-compatible
**Decision**: Rejected - wrong architecture layer

### Alternative 3: Inline Hints in Task Description
**Approach**: Append hints to task.description before planning
**Pros**: Simple, works with any planner
**Cons**: Pollutes task metadata, hard to toggle, not structured
**Decision**: Rejected - violates separation of concerns

---

## Success Metrics

### Immediate (This Task)
1. ✅ Hints available in context_pack (binary: yes/no)
2. ✅ Feature flag controls hint injection (observe/enforce/off)
3. ✅ Telemetry logs hint availability and size
4. ✅ Zero regression in plan_runner tests
5. ✅ Forward-compatible with prompt compiler (documented migration path)

### Future (IMP-21 Integration)
1. Planning improvement with hints vs without (ablation study)
2. Task success rate increase (target: +5-10%)
3. Plan quality scores (via human review or automated rubric)
4. Hint usage rate (% of plans that used hints)

### Future (IMP-ADV-01.6 Neural Embeddings)
1. Hint relevance improvement (0.78 → 0.85+ precision)
2. Cross-domain similarity (better handling of generic terms)
3. Semantic understanding (synonyms: JWT/OAuth, Redis/Memcached)

---

## Rollout Plan

**Stage 1: Observe Mode** (default)
- Hints stored in context_pack
- Logged to telemetry
- Not injected into prompts (requires IMP-21)
- Collect baseline metrics

**Stage 2: Prompt Compiler Integration** (IMP-21)
- Compiler reads hints from context_pack
- Injects into PLAN phase prompt
- A/B test with/without hints

**Stage 3: Enforce Mode** (IMP-35 validation)
- Ablation study confirms improvement
- Hints enabled by default
- Monitor for regressions

**Rollback**:
- Set `quality_graph.hints_injection=off`
- Planner ignores hints parameter
- No data migration required

---

## Worthiness

### Epic Alignment
- **Epic**: Advanced Features - Quality Graph (IMP-ADV-01)
- **Parent**: IMP-ADV-01 (Quality Graph Integration)
- **Siblings**: IMP-ADV-01.3 (evaluation), IMP-ADV-01.4 (monitoring), IMP-ADV-01.5 (dependencies)

### KPI Impact
- **Quality**: Planning accuracy (future measurement via IMP-35)
- **Efficiency**: Reuse past learnings (reduce trial-and-error)
- **Velocity**: Faster planning with relevant context
- **Cost**: No additional compute (hints already generated)

### ROI Analysis
- **Effort**: 2-3 hours (minimal changes)
- **Value**: Unlocks quality graph investment (~10 hours so far)
- **Risk**: Very low (feature flag, forward-compatible)
- **Opportunity Cost**: Low (doesn't block other work)

**Decision**: **PROCEED** - High value, low risk, forward-compatible

---

## Alternative: Not-Do Decision

**If we decided NOT to do this task:**

**Rationale for Deferral**:
- Wait for prompt compiler (IMP-21-24) to be complete
- Avoid any temporary solution
- Focus on fundamentals first

**Cost of Deferral**:
- Quality graph value remains unrealized (9 tasks completed, AC met, but no usage)
- Hints precision@5=0.780 is wasted
- Delay learning about hint effectiveness (requires real usage to validate)

**Decision**: **Do NOT defer** - This is the right time:
1. Quality graph is stable (IMP-ADV-01.3 complete)
2. Minimal work (2-3 hours)
3. Forward-compatible with prompt compiler
4. Enables learning about hint effectiveness

---

## Kill Trigger

**Conditions for abandoning this task**:
1. Prompt compiler (IMP-21) completes before this task → Integrate directly into compiler
2. Ablation study (IMP-35) shows hints have **negative** impact on planning → Disable via flag
3. Technical blocker discovered that makes forward-compatible approach impossible → Escalate

**None of these conditions are currently met → PROCEED**

---

## Next Steps

1. ✅ Complete STRATEGIZE (this document)
2. → SPEC: Write acceptance criteria and verification mapping
3. → PLAN: Break down implementation into subtasks
4. → THINK: Design feature flag behavior and telemetry schema
5. → IMPLEMENT: Make minimal code changes
6. → VERIFY: Test with/without hints, check telemetry
7. → REVIEW: Adversarial review of forward-compatibility
8. → PR: Commit with evidence
9. → MONITOR: Track hint availability metrics

**Estimated Timeline**: 2-3 hours (as planned)

---

## References

- IMP-ADV-01.3 Evaluation Report: `state/evidence/IMP-ADV-01.3/evaluation_report.md`
- Quality Graph README: `tools/wvo_mcp/src/quality_graph/README.md`
- Prompting Roadmap: `docs/autopilot/IMPROVEMENT_BATCH_PLAN.md:145-229`
- Plan Runner: `tools/wvo_mcp/src/orchestrator/state_runners/plan_runner.ts:98`
- Planner Agent: `tools/wvo_mcp/src/orchestrator/planner_agent.ts`
