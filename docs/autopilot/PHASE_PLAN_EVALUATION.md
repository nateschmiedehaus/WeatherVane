# Phase Plan Evaluation & Integration

## Current Status vs. Plan

### Phase -1: Foundation ✅ COMPLETE
**Planned:**
- Runtime phase order enforced
- Prompts unambiguous
- Integrity batch green

**Achieved:**
- ✅ WorkProcessEnforcer connected at orchestrator_loop.ts:693
- ✅ validatePhaseSequence() method implemented
- ✅ Tests at 100% pass (1419/1419, 12 skipped)
- ✅ System prompts updated in CLAUDE.md and AGENTS.md
- ✅ Violations logged as constraints

**Evidence:**
- orchestrator_loop.ts:692-727 shows enforcement
- work_process_enforcer.ts:228-261 has validatePhaseSequence
- npm test output: 100% pass
- CLAUDE.md:39-47 has mandatory process section

**Remaining from Plan:**
- [ ] Add process.validation span (Phase 0 work)
- [ ] Confirm run_integrity_tests.sh passes (need to run)

### Phase 0: Instrumentation ⏳ NEXT
**Plan is solid:**
- Add OpenTelemetry spans to state transitions
- Track violation metrics
- Log to traces.jsonl and metrics.jsonl

**Priority: HIGH** - This gives us visibility before Observer

### Phase 1: Observer 📋 READY TO START
**Plan aligns with our design:**
- Read-only analysis
- Feature flagged (enabled=false, cadence=3)
- No gating impact
- Logs to observer.jsonl

**Enhancement from our work:**
- Use gpt-5-high for deeper analysis (user confirmed this!)
- Multi-model assessment for different dimensions
- Quality vector computation (complementary to structural graph)

### Phase 2-5: As Planned 📅
These phases are well-defined and incremental.

## Two Graph Approaches - COMPLEMENTARY!

### Your Structural Graph (Phase "Graph Layer")
```typescript
// Code structure analysis
nodes: [File, Symbol, Test, Route, EnvVar, Table, Migration]
edges: [imports, calls, covers, reads_env, writes_table, touches_config, uses_auth]

// Policies (structural correctness)
- "Changed node must have test edge"
- "Route must have auth edge"
- "Config toggle must have app-smoke edge"
```

**Purpose:** Structural correctness
**Question:** "Did you follow the code architecture rules?"

### My Quality Graph (Enhancement to Observer)
```typescript
// Task execution analysis
nodes: [WorkPhase with QualityVector]
edges: [Phase transitions with quality metrics]

// Policies (pattern matching)
- "Quality trajectory matches successful patterns"
- "Dimensions meet learned thresholds"
- "Predictions indicate low risk"
```

**Purpose:** Execution quality
**Question:** "Is this task on a successful trajectory?"

### Integration: Both Graphs Working Together

```typescript
class UnifiedQualitySystem {
  // Your structural graph
  private structuralGraph: ProjectGraphAnalyzer;

  // My quality graph
  private qualityGraph: QualityGraphEnforcer;

  async assessTask(task: Task, phase: WorkPhase): Promise<Assessment> {
    // Structural correctness
    const structural = await this.structuralGraph.analyze({
      changedFiles: task.changedFiles,
      newTests: task.addedTests,
      touchedRoutes: task.affectedRoutes
    });

    // Execution quality
    const quality = await this.qualityGraph.updatePhaseQuality(
      task.id,
      phase,
      this.convertToEvidence(structural)
    );

    // Combined decision
    return {
      structuralScore: structural.score,      // "Did you add tests?"
      qualityScore: quality.overallScore,     // "Does this match success patterns?"
      predictions: quality.predictions,        // "What might go wrong?"
      structuralViolations: structural.violations,
      recommendation: this.combine(structural, quality)
    };
  }
}
```

## How This Changes Observer Implementation

### Original Observer Plan (Phase 1)
```typescript
class ObserverAgent {
  async observe(task: Task, verifyResult: VerifyResult): Promise<ObserverReport> {
    // Read-only analysis
    // Use gpt-5-high
    // Log observations
  }
}
```

### Enhanced Observer (Integrating Both Graphs)
```typescript
class ObserverAgent {
  private structuralGraph: ProjectGraphAnalyzer;
  private qualityGraph: QualityGraphEnforcer;

  async observe(task: Task, verifyResult: VerifyResult): Promise<ObserverReport> {
    // 1. Structural analysis (your graph)
    const structural = await this.structuralGraph.analyze(task);

    // 2. Quality trajectory (my graph)
    const quality = await this.qualityGraph.getGraph(task.id);

    // 3. Multi-model assessment using gpt-5-high
    const semanticAnalysis = await this.assessWithHighModel({
      structural,
      quality,
      verifyResult
    });

    return {
      // Structural findings
      structuralViolations: structural.violations,
      // "Missing test coverage for auth.ts"
      // "Route /api/admin lacks auth edge"

      // Quality findings
      qualityDivergence: quality.divergence,
      // "78% divergence from successful patterns"
      // "Risk mitigation dimension weak"

      // Semantic findings (gpt-5-high)
      semanticConcerns: semanticAnalysis.concerns,
      // "Error handling insufficient for network failures"
      // "Edge case not considered: empty dataset"

      // Combined recommendation
      recommendation: this.synthesize(structural, quality, semanticAnalysis)
    };
  }
}
```

## Revised Implementation Priority

### Immediate (This Week)
1. **Phase 0: Instrumentation** (1-2 days)
   - Add OTel spans to state_graph.ts transitions
   - Add metrics for phase violations
   - Validates that enforcement is working

2. **Structural Graph Foundation** (2-3 days)
   - Implement quality/graph_index.ts using ProjectIndex
   - Build nodes: file, symbol, test, route
   - Build edges: imports, calls, covers
   - Store in graph.json per run

### Next Week
3. **Observer with Dual Graphs** (3-4 days)
   - Implement ObserverAgent
   - Integrate structural graph analysis
   - Integrate quality graph (simplified version)
   - Use gpt-5-high for semantic layer
   - Feature flag and telemetry

### Following Weeks
4. **Phase 2: Tool-level Enforcement** (2 days)
5. **Phase 3: Cross-Check** (2 days)

### Supporting Capabilities Roadmap (Prioritized)
**Immediate (Unblock Phase 0/1)**
1. ✅ Phase Ledger *(DONE – commit 7fa439e2)*  
   - Hash-chained `state/process/ledger.jsonl`; baseline for downstream controls.
2. Evidence-Gated Transitions  
   - Wire WorkProcessEnforcer validators to artifact inventory; refuse phase advancement without required evidence; update integrity docs/tests.
3. Prompt Attestation  
   - Finalize header signatures, manifest hashes, and session abort on drift; surface signature evidence in PR/Monitor packs.

**Near Term (Align with Phase 0–3)**
4. Phase Leases  
   - Scheduler-issued leases per phase/task; expiry handling; reconcile with ledger entries. Essential for multi-agent safety before Phase 4.
5. OTEL Integration  
   - Full span/counter coverage (`process.validation`, `agent.cross_check`, etc.), streaming to telemetry files, dashboards/alerts wired.
6. Metrics Dashboard  
   - Visualization of violation counters, success SLOs, lease timeouts; tie into decision journal links.

**Parallel Foundations (Support Phases 1–5)**
7. Quality Graph Integration  
   - Build vector/structural hybrid; feed Observer + policies; persist `graph.json` snapshots.
8. Atlas Integration  
   - Update manifest cards/hashes (prompt enforcement, telemetry, graph); ensure attestation catches drift.
9. Context Fabric Provenance  
   - Embed ledger/graph pointers in LCPs; track evidence provenance for handoffs.

## Key Insights from Your Plan

### 1. Structural Graph is More Immediate
Your graph layer focuses on **code relationships** that can be extracted statically:
- "This file imports that module"
- "This test covers that function"
- "This route uses this auth middleware"

This is **immediately actionable** and doesn't require ML.

### 2. Quality Graph is Longer Term
My quality graph requires:
- Historical data collection
- Pattern learning
- Model training

It's more powerful but takes longer to build.

### 3. Start with Structure, Add Quality
**Your approach is correct:**
1. Get structural correctness working (Graph Layer)
2. Add semantic analysis (Observer with gpt-5-high)
3. Layer on pattern learning (Quality Graph)
4. Eventually: Full predictive system

### 4. Observer is the Integration Point
The Observer becomes the place where all analysis converges:
```
Structural Graph → "Architecture violations"
Quality Graph → "Pattern divergence"
gpt-5-high → "Semantic concerns"
           ↓
      Observer Report
           ↓
    Actionable Guidance
```

## Revised Observer Task Breakdown

Following the STRATEGIZE→MONITOR process properly:

### STRATEGIZE
- **Problem**: Need read-only verification with multiple quality signals
- **Approach**: Observer integrates structural + quality + semantic analysis
- **Connection**: Supports <5% error rate through comprehensive verification

### SPEC
- **Acceptance Criteria**:
  - [ ] Uses structural graph for architecture checks
  - [ ] Uses quality graph for pattern matching
  - [ ] Uses gpt-5-high for semantic analysis
  - [ ] Feature flagged and telemetry enabled
  - [ ] No side effects (read-only)

### PLAN
1. Phase 0: Add instrumentation (dependency)
2. Build structural graph (dependency)
3. Implement ObserverAgent with dual graphs
4. Add gpt-5-high semantic layer
5. Wire into verify_runner
6. Add telemetry and feature flags

### The Bottom Line

**Your phased plan is excellent and we should follow it.**

**My quality graph proposal enhances but doesn't replace your structural graph.**

**Together they create:**
- **Structural correctness** (your graph): "Did you follow the architecture?"
- **Execution quality** (my graph): "Are you on a successful path?"
- **Semantic understanding** (gpt-5-high): "Does this actually make sense?"

**Next actions:**
1. Validate Phase -1 complete with run_integrity_tests.sh
2. Start Phase 0: Instrumentation
3. Build structural graph (your Graph Layer)
4. Implement enhanced Observer with all three layers

This gives us a complete quality system that's both immediately useful (structural) and continuously learning (quality patterns).
