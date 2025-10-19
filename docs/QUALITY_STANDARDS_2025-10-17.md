# Quality Standards & Roadmap Enhancements — 2025-10-17T23:50Z

## Summary

Implemented comprehensive quality standards for tests and documentation, fixed critical domain resolution bug in roadmap parser, and added ML/causal rigor milestone to ensure scientific validity.

---

## 1. Test Quality Standards (CRITICAL)

### Requirements

Tests must verify **ACTUAL BEHAVIOR** matches design intent, not just pass.

### Test Hierarchy

Implement tests at multiple scales:

1. **Small Unit Tests** (pure functions, single responsibility)
   - Example: `test_parse_weather_data()`, `test_calculate_allocation()`
   - Focus: Individual function correctness, edge cases, boundary conditions
   - Fast, isolated, no external dependencies

2. **Large Unit Tests** (component integration, cross-boundary interactions)
   - Example: `test_weather_pipeline_end_to_end()`, `test_allocation_with_real_constraints()`
   - Focus: Component interactions, data flow, internal integration
   - May use test fixtures, mocks for external systems

3. **Integration Tests** (API/database/external system interactions)
   - Example: `test_api_weather_ingestion()`, `test_dashboard_alert_flow()`
   - Focus: External system contracts, real database operations, API calls
   - Slower, requires test infrastructure

4. **End-to-End Tests** (user journeys, full system flows)
   - Example: `test_complete_weather_alert_workflow()`
   - Focus: User scenarios, business workflows, cross-system integration
   - Slowest, most comprehensive

### Quality Criteria

- **Tests must FAIL if the feature doesn't work as designed**
- Include edge cases, error conditions, boundary values
- Don't write tests that merely greenlight code
- Example: Don't just test "function returns something", test "function returns correct weather data for edge case timezone"

### Implementation Files

- `autopilot.sh` lines 3825-3833
- `wvo_prompt.md` line 12

---

## 2. Documentation Quality Standards (CRITICAL)

### Requirements

Documentation must be **meaningful and useful**, not just describe what exists.

### Content Requirements

1. **WHY decisions were made**, not just WHAT was done
2. **Purpose** — What problem does this solve?
3. **Design rationale** — Why this approach over alternatives?
4. **Edge cases handled** — What boundary conditions are covered?
5. **Usage examples** — How do developers use this?
6. **Known limitations** — What doesn't work or isn't supported?
7. **Trade-offs considered** — What alternatives were evaluated?

### Anti-Patterns

- ❌ "This function calculates allocation" (just describes WHAT)
- ✅ "Allocation uses non-linear optimization with ROAS constraints because linear models fail to capture diminishing returns at scale. Edge case: when spend caps conflict, we prioritize weather-aligned campaigns (see experiments/allocator/constraint_resolution.json). Limitation: assumes campaign independence (cross-effects not modeled)."

### Make it Valuable

Documentation should help future developers understand:
- Why the code exists
- How to use it correctly
- What to watch out for
- What was considered and rejected

**Not compliance theater — real knowledge transfer.**

### Implementation Files

- `autopilot.sh` lines 3835-3838
- `wvo_prompt.md` line 13

---

## 3. Domain Resolution Bug Fix (CRITICAL)

### Problem

`roadmap_parser.ts` line 35 only read `domain` from the epic level, completely ignoring task and milestone domain overrides.

**Impact:** Tasks in M3.3 (Autonomous Orchestration Blueprints) explicitly marked `domain: mcp` were being classified as `domain: product` because their parent epic E3 is a product epic.

### Root Cause

```typescript
// BEFORE (buggy):
domain: (epic as unknown as { domain?: "product" | "mcp" }).domain,
```

This always used the epic's domain, even when tasks/milestones had explicit overrides.

### Fix

```typescript
// AFTER (correct):
// Domain resolution: task → milestone → epic (most specific wins)
const taskDomain = (task as unknown as { domain?: "product" | "mcp" }).domain;
const milestoneDomain = (milestone as unknown as { domain?: "product" | "mcp" }).domain;
const epicDomain = (epic as unknown as { domain?: "product" | "mcp" }).domain;
const resolvedDomain = taskDomain ?? milestoneDomain ?? epicDomain;
```

### Resolution Hierarchy

1. Check task for explicit `domain` field (most specific)
2. If not found, check milestone
3. If not found, fall back to epic (least specific)

### Affected Tasks

Fixed classification for:
- T3.3.2: Implement hierarchical consensus & escalation engine
- T3.3.3: Build closed-loop simulation harness for autonomous teams
- T3.3.4: Instrument dynamic staffing telemetry & learning pipeline

All now correctly classified as `domain: mcp` instead of incorrectly inheriting `domain: product` from epic E3.

### Implementation Files

- `tools/wvo_mcp/src/planner/roadmap_parser.ts` lines 16-20, 41

---

## 4. ML/Causal Rigor Milestone Added

### Context

Existing ML/causal tasks (T2.2.1, T4.1.3-7) were marked "done" but likely implemented as scaffolds/placeholders without rigorous scientific validation.

### New Milestone: M4.2 — ML/Causal Rigor & Scientific Validation

**Epic:** E4 (Operational Excellence)
**Description:** Ensure models have proper causal inference, statistical rigor, and documented assumptions

### Tasks Added

#### T4.2.1: Causal inference methodology review (propensity scores, IVs, sensitivity)
- **Status:** pending
- **Estimate:** 12 hours
- **Exit Criteria:**
  - critic: causal
  - doc: `docs/models/causal_methodology.md`
  - artifact: `experiments/causal/sensitivity_analysis.json`

**What:** Implement proper causal inference methods (propensity score matching, instrumental variables, sensitivity analysis) instead of naive correlations.

#### T4.2.2: Implement holdout validation for causal claims with multiple test correction
- **Status:** pending
- **Estimate:** 8 hours
- **Exit Criteria:**
  - critic: causal
  - tests: `tests/models/test_causal_validation.py`
  - artifact: `experiments/causal/holdout_results.json`

**What:** Validate causal claims on holdout data with proper multiple testing correction (Bonferroni, Benjamini-Hochberg) to avoid false discoveries.

#### T4.2.3: Statistical diagnostics suite (confidence intervals, residual analysis, model assumptions)
- **Status:** pending
- **Estimate:** 10 hours
- **Exit Criteria:**
  - critic: causal
  - tests: `tests/models/test_diagnostics.py`
  - artifact: `experiments/models/diagnostics_report.json`

**What:** Implement comprehensive statistical diagnostics: confidence intervals for all estimates, residual analysis, homoscedasticity checks, normality tests, model assumption validation.

#### T4.2.4: Document ML/causal assumptions, limitations, and decision boundaries
- **Status:** pending
- **Estimate:** 6 hours
- **Exit Criteria:**
  - doc: `docs/models/assumptions_and_limitations.md`
  - artifact: `experiments/models/assumption_validation.json`

**What:** Document every assumption made (IID data, no hidden confounders, linearity, etc.), known limitations (what the model can't do), and decision boundaries (when to trust vs. distrust predictions).

#### T4.2.5: Implement sensitivity analysis for allocation decisions under uncertainty
- **Status:** pending
- **Estimate:** 8 hours
- **Exit Criteria:**
  - critic: allocator
  - critic: causal
  - tests: `tests/allocator/test_sensitivity.py`
  - artifact: `experiments/allocator/sensitivity_bounds.json`

**What:** Quantify how allocation recommendations change under different assumptions (parameter uncertainty, model misspecification). Provide confidence bounds, not just point estimates.

### Implementation File

- `state/roadmap.yaml` lines 266-309

---

## 5. Files Modified

1. **tools/wvo_mcp/scripts/autopilot.sh**
   - Lines 3825-3833: Test quality standards with hierarchy
   - Lines 3835-3838: Documentation quality standards

2. **docs/wvo_prompt.md**
   - Line 12: Test quality standards
   - Line 13: Documentation quality standards

3. **tools/wvo_mcp/src/planner/roadmap_parser.ts**
   - Lines 16-20: Domain resolution hierarchy
   - Line 41: Use resolved domain instead of epic-only domain

4. **state/roadmap.yaml**
   - Lines 266-309: New M4.2 milestone with 5 ML/causal rigor tasks

5. **state/context.md**
   - Line 14: Documented all enhancements

---

## 5. Comprehensive Test Coverage Milestone Added

### Context

Many features marked "done" (ingestion, weather harmonization, allocator, models, UX) likely lack comprehensive test coverage with proper hierarchy.

### New Milestone: M4.3 — Comprehensive Test Coverage for Completed Features

**Epic:** E4 (Operational Excellence)
**Description:** Add proper test hierarchy (small unit, large unit, integration, e2e) for features marked "done" but lacking thorough test coverage

### Tasks Added

#### T4.3.1: Test coverage for ingestion pipeline (Shopify, Meta, Google Ads, weather)
- **Status:** pending
- **Estimate:** 10 hours
- **Tests Required:**
  - Small unit: `test_shopify_connector.py`, `test_ads_connectors.py`, `test_weather_ingestion.py`
  - Large unit: `test_pipeline_end_to_end.py`
  - Integration: `test_ingestion_integration.py`
- **Quality Standard:** Must verify actual behavior (data contracts, error handling, checkpointing, deduplication)

#### T4.3.2: Test coverage for weather harmonization & leakage prevention
- **Status:** pending
- **Estimate:** 8 hours
- **Tests Required:**
  - Small unit: `test_blending.py`, `test_timezone_alignment.py`
  - Large unit: `test_leakage_guardrails.py`
  - Integration: `test_feature_builder_integration.py`
- **Quality Standard:** Must validate leakage prevention works AS INTENDED (future data never enters training)

#### T4.3.3: Test coverage for allocation optimizer & budget solver
- **Status:** pending
- **Estimate:** 12 hours
- **Tests Required:**
  - Small unit: `test_optimizer_small.py`, `test_budget_solver_small.py`
  - Large unit: `test_allocation_large.py` (full optimization with real constraints)
  - Integration: `test_marketing_mix_integration.py` (multi-channel scenarios)
- **Quality Standard:** Must verify valid allocations under edge cases (zero budget, conflicting constraints, weather spikes)

#### T4.3.4: Test coverage for baseline models & forecasting
- **Status:** pending
- **Estimate:** 10 hours
- **Tests Required:**
  - Small unit: `test_gam_baseline.py`, `test_ensemble_forecasting.py`
  - Large unit: `test_model_pipeline.py` (training & prediction flow)
  - Integration: `test_forecast_validation.py` (multi-horizon backtest)
- **Quality Standard:** Must validate proper train/test split, no leakage, reproducible results with seeds

#### T4.3.5: Test coverage for UX components (Plan, WeatherOps dashboard)
- **Status:** pending
- **Estimate:** 8 hours
- **Tests Required:**
  - Small unit: `test_plan_components.spec.ts`, `test_dashboard_components.spec.ts`
  - Large unit: `test_plan_page_flow.spec.ts` (full page interactions)
  - E2E: `test_dashboard_e2e.spec.ts` (user journey from login to alert acknowledgment)
- **Quality Standard:** Must validate accessibility, responsive breakpoints, error states, loading states

### Implementation File

- `state/roadmap.yaml` lines 310-403

---

## Impact

### ✅ Fixed
- Domain misclassification bug that caused MCP tasks to be treated as product tasks
- Autopilot now respects task/milestone domain overrides

### ✅ Added
- Comprehensive test quality standards with hierarchy (small unit → large unit → integration → e2e)
- Documentation quality standards requiring WHY not just WHAT
- 5 new tasks for ML/causal scientific rigor (M4.2)
- 5 new tasks for comprehensive test coverage of completed features (M4.3)

### ✅ Next Steps
- Autopilot will now write tests at multiple scales
- Autopilot will write meaningful documentation
- ML/causal work can be revisited with proper statistical rigor
- All "done" features will get comprehensive test coverage
- MCP tasks (T3.3.*) will no longer be incorrectly scheduled during product-only cycles

---

**Author:** Claude Code (Director Dana escalation)
**Date:** 2025-10-17T23:50Z
**MCP Server:** Rebuilt and restarted (worker pid 95225)
