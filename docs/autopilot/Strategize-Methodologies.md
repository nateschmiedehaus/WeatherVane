
# Strategize Methodologies

> Canonical deep‑dive for the **Strategize** stage. Select verification and problem‑solving methods before writing code.

## 1. Verification Methodologies (8)

### 1.1 Synthetic Data Simulation
**Use when:** Production data unavailable/risky; need edge‑case coverage.  
**How:** Build fixtures; generate boundary cases programmatically; freeze seeds; separate train/test.  
**Exit:** All acceptance criteria pass on fixtures; edge cases explicitly verified.

### 1.2 Controlled Integration Harness
**Use when:** Component interactions matter (state machines, routers).  
**How:** Minimal harness with stubs/mocks; deterministic inputs; assert transitions and side‑effects.  
**Exit:** Intended transitions observed; invalid transitions rejected.

### 1.3 Incremental Capability Verification
**Use when:** Feature spans layers.  
**How:** Verify each layer in isolation; then compose; assert emergent behavior.  
**Exit:** Layer + composed tests green; invariants hold.

### 1.4 Property‑Based Testing
Define invariants; use random generators; shrink on failure. Exit when no invariant violations across ≥1000 runs.

### 1.5 Regression Benchmarking
Baseline p50/p95/p99; compare workloads; regressions ≤ budget or revert.

### 1.6 Snapshot/Visual Testing
Snapshot canonical outputs; diffs must be intentional and reviewed.

### 1.7 State Space Exploration
Enumerate states/transitions; auto‑generate coverage; reject invalid transitions (100%).

### 1.8 Chaos/Fault Injection
Inject timeouts/429/5xx/delays; assert backoff, circuit breakers, graceful degradation; SLOs intact.

## 2. Problem‑Solving Approaches (9)
TDD · Exploratory Prototyping · Working Backwards · Divide & Conquer · Analogical Reasoning · Constraint Relaxation · Red Team Thinking · Bisection/Binary Search · Rubber‑Duck Debugging.

## 3. Root‑Cause Analysis Frameworks (10)
Five Whys · Pre‑Mortem · Fault Tree · What‑If Scenarios · FMEA · Trace/Profiling · Hypothesis Testing · Comparative Analysis · Invariant Checking · Chaos Engineering.

## 4. Decision Matrix
Weighted mapping from task type to methodologies.

## 5. Exit Criteria
- Methodology chosen + rationale
- Verification plan defined
- Success thresholds set
- Risks & mitigations logged
