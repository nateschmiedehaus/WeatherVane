# Phase 0 Blockers - Identified and Fixed
**Date**: 2025-10-23
**Analyzer**: Claude (Strategic Reviewer)
**Context**: Analysis of what autopilot attempted vs. what's needed for demo/beta customers

---

## Executive Summary

**Finding**: Autopilot has been working on **Tier 3 infrastructure and polish** (~90% of time) instead of **Tier 0 Phase 0 critical path** (~10% of time).

**Impact**: Phase 0 exit criteria (required for demo/beta) are stalled while autopilot polishes internal tools.

**Root Cause**: Orchestrator lacked clear priority understanding. The ❗ markers in ROADMAP.md were not translated into actionable priority rules.

**Solution**: Created PRIORITY_UNDERSTANDING.md to ensure orchestrator knows Phase 0 is Tier 0, everything else is Tier 3.

---

## What Autopilot Was Working On (Last 30 Days)

### From autopilot_blockers.json + STATUS.md Analysis:

1. **WeatherOps Dashboard Polish** (~40% of time)
   - Region filter utilities
   - Timeline interactions
   - Analytics event instrumentation
   - Design system badge tokens
   - Escalation summaries
   - **Status**: Tier 3 (internal observability tool)
   - **Customer Impact**: Zero (not customer-facing)

2. **Critic Performance Restoration** (~30% of time)
   - academicrigor critic (10 of 11 runs failing)
   - allocator critic (8 of 10 runs failing)
   - build critic (5 of 6 runs failing)
   - causal critic (12 consecutive failures)
   - designsystem critic (5 consecutive failures)
   - execreview critic (12 consecutive failures)
   - **Status**: Tier 3 (advisory, not blocking)
   - **Customer Impact**: Zero (internal quality gates)

3. **MCP Server Infrastructure** (~20% of time)
   - plan_next YAML parse errors
   - restart_mcp.sh scripts
   - Tool routing fixes
   - Worker dry-run safeguards
   - **Status**: Tier 3 (orchestrator infrastructure)
   - **Customer Impact**: Zero (autopilot tooling)

4. **Phase 0 Work** (~10% of time)
   - Allocator heuristic caching (performance optimization)
   - Plan lift/confidence cards (partially started, not complete)
   - **Status**: Tier 0 (critical path)
   - **Customer Impact**: High (blocks demo/beta)

---

## Phase 0 Critical Blockers (What's Actually Blocking Demo/Beta)

### ❗ Blocker 1: Incrementality Framework Not Wired

**Phase 0 Requirement**: Geo holdout experiments prove statistically significant lift.

**Current State**:
- ✅ Code exists: `apps/validation/incrementality.py` has GeoHoldoutConfig, assign_geo_holdout(), ExperimentEstimate
- ❌ Not wired to nightly jobs (no Prefect flow, no cron, no automation)
- ❌ No experiment artifacts persisted to `state/analytics/experiments/geo_holdouts/`
- ❌ No statistical tests surfaced in API or UI

**Impact**: **Cannot prove lift to prospects** - they ask "how do you know weather works?" and we have no answer.

**Fix Needed**:
1. Create Prefect flow that runs incrementality analysis nightly
2. Persist experiment results to state/analytics/experiments/
3. Add API endpoint `/v1/experiments/incrementality` to surface results
4. Update plan UI to show "Lift: +15% (p=0.02)" cards

**Owner**: Autopilot Engine + Data Platform
**Estimate**: 8 hours
**Priority**: P0 - MUST SHIP THIS WEEK

---

### ❗ Blocker 2: Confidence Intervals Missing

**Phase 0 Requirement**: Show "70% chance ROAS ≥ 2.5×" so marketers trust recommendations.

**Current State**:
- ✅ Plan UI shows point estimates (ROAS, revenue)
- ❌ No confidence intervals (p10, p50, p90)
- ❌ No uncertainty quantification in MMM
- ❌ No marketer-friendly language ("70% chance..." vs "±0.5 std dev")

**Impact**: **Prospects don't trust recommendations** - they see a number with no context about reliability.

**Fix Needed**:
1. Add quantile outputs to MMM (return p10, p50, p90 instead of just mean)
2. Update plan API schema to include confidence_intervals field
3. Render confidence cards in UI with clear language
4. Add benchmark comparisons ("20% better than industry average")

**Owner**: Modeling squad + Apps/API squad
**Estimate**: 12 hours
**Priority**: P0 - MUST SHIP THIS WEEK

---

### ❗ Blocker 3: Forecast Calibration Stale

**Phase 0 Requirement**: Validate quantile calibration (≥80% coverage for p10-p90 band).

**Current State**:
- ✅ Calibration pipeline exists (`apps/model/feedback/calibration.py`)
- ❌ Results stale (STATUS.md: "Base calibration artifacts stale")
- ❌ No validation that p10-p90 bands achieve 80% coverage
- ❌ No UI disclosure for widened bands on Day 4-7 horizons

**Impact**: **Forecasts may be unreliable** - if p10-p90 only covers 60%, recommendations are garbage.

**Fix Needed**:
1. Regenerate calibration: `python apps/model/feedback/calibration.py`
2. Validate coverage: assert p10-p90 band achieves ≥80% coverage
3. Publish report: `docs/modeling/forecast_calibration_report.md`
4. Add UI disclosure: "7-day forecasts have wider uncertainty"

**Owner**: Modeling squad + Observability
**Estimate**: 6 hours
**Priority**: P0 - MUST SHIP THIS WEEK

---

### ❗ Blocker 4: Demo Brand Data Generation Scripts Missing

**Phase 0 Requirement**: Full-fidelity synthetic tenant with realistic data.

**Current State** (from DEMO_BRAND_PLAYBOOK.md backlog):
- ❌ `scripts/demo_brand/build_weather_archive.py` doesn't exist
- ❌ `scripts/demo_brand/build_connectors.py` doesn't exist
- ✅ `scripts/minimal_ml_demo.py` exists (partial coverage)
- ✅ `scripts/plan_brand_demo.py` exists (partial coverage)
- ❌ Klaviyo fixtures incomplete
- ❌ Pytest suite for dataset manifests missing

**Impact**: **Cannot show prospects a realistic demo** - synthetic data looks fake, doesn't exercise full pipeline.

**Fix Needed**:
1. Write `scripts/demo_brand/build_weather_archive.py`:
   - Fetch Open-Meteo historical (2 years) + forecast (14 days)
   - Store raw JSON in `storage/seeds/open_meteo/`
   - Normalize to Parquet in `tmp/demo_brand/lake/weather_*`

2. Write `scripts/demo_brand/build_connectors.py`:
   - Generate Shopify orders/products/inventory/discounts
   - Generate Meta Ads campaigns/spend/impressions
   - Generate Google Ads campaigns/keywords
   - Generate Klaviyo campaigns/flows/events
   - Store in `tmp/demo_brand/lake/` as Parquet

3. Extend `seed_synthetic_tenant()` for Klaviyo support

4. Add pytest suite: `tests/demo_brand/test_demo_brand_datasets.py`
   - Assert schema hashes match expected
   - Assert row counts in reasonable ranges
   - Assert no nulls on required columns

5. Wire Prefect flow for nightly regeneration

**Owner**: Autopilot Engine + Solutions + Data Platform
**Estimate**: 24 hours (1 day per script + testing)
**Priority**: P0 - START TODAY

---

### ❗ Blocker 5: Performance Tracking Not Surfaced

**Phase 0 Requirement**: Compare predicted vs actual ROAS with <10% MAE.

**Current State**:
- ✅ Prediction logic exists in allocator
- ❌ No API endpoint to store actual outcomes
- ❌ No comparison dashboard showing predicted vs actual
- ❌ No MAE/MAPE calculation or alerts

**Impact**: **Cannot prove recommendations work** - prospects ask "did your predictions come true?" and we have no data.

**Fix Needed**:
1. Add API endpoint: `POST /v1/performance/actual`
   - Accept tenant_id, date, channel, actual_spend, actual_roas
   - Store in `storage/metadata/performance/{tenant}.json`

2. Add comparison logic:
   - Load predictions from plan
   - Load actuals from performance API
   - Calculate MAE, MAPE, lift delta

3. Create dashboard card:
   - Show predicted vs actual chart
   - Highlight wins ("Predicted 2.5×, actual 2.8× - beat forecast!")
   - Flag misses ("Predicted 3.0×, actual 2.2× - investigating")

4. Alert on systematic errors:
   - If MAE > 15% for 3+ days, escalate to modeling squad

**Owner**: Apps/API squad + Observability
**Estimate**: 16 hours
**Priority**: P0 - WEEK 1

---

## Secondary Blockers (Phase 1 - Week 2-3)

### Phase 1 Scenario Builder (Decision Support)

**Current State**:
- Design review scheduled
- Implementation pending approval
- No blockers except design sign-off

**Owner**: Priya (Front-end) + Leo (API) + Aria (Design)
**Priority**: P1 - START WEEK 2

---

### Phase 1 Visual Exports (Storytelling)

**Current State**:
- Charts exist
- Maps missing (MapLibre not integrated)
- Export service stubbed but not implemented

**Blockers**:
- MapLibre integration (~8 hours)
- PowerPoint/Excel export service (~12 hours)

**Owner**: Priya + Leo
**Priority**: P1 - WEEK 2

---

### Phase 1 Onboarding Wizard

**Current State**:
- Progress API exists
- Wizard UI not built
- Design mockups ready

**Blockers**:
- Front-end implementation (~16 hours)

**Owner**: Priya + Sam (FastAPI)
**Priority**: P1 - WEEK 3

---

## Why Autopilot Missed These Blockers

### Root Cause Analysis:

1. **No clear priority framework**
   - Roadmap has ❗ markers but autopilot didn't translate them to action
   - No decision rules like "Phase 0 always wins"
   - No understanding that critics are advisory (Tier 3), not blocking (Tier 0)

2. **Reacting to failures instead of pursuing goals**
   - Saw critics failing → spent time fixing them
   - Saw MCP errors → spent time on infrastructure
   - Should have asked: "Does this block Phase 0?" (Answer: No)

3. **Confusing internal polish with customer value**
   - WeatherOps dashboard is for operators, not customers
   - Perfect test coverage doesn't ship products
   - Design system tokens don't prove lift

4. **Missing the forest for the trees**
   - Worked on many small tasks (dashboard polish, critic fixes)
   - Lost sight of big goal (demo/beta customer readiness)
   - Needed to step back and ask: "What do we actually need to ship?"

---

## Fixes Applied

### 1. Created PRIORITY_UNDERSTANDING.md

**What it does**:
- Defines Tier 0 (Phase 0 - SHIP OR DIE)
- Defines Tier 1 (Phase 1 - Demo Experience)
- Defines Tier 2 (Product Polish)
- Defines Tier 3 (Infrastructure)
- Defines Tier 4 (Future)

**Decision rules**:
- "Phase 0 always wins"
- "Critic failures are advisory, not blocking"
- "MCP infrastructure is Tier 3"
- "Polish is Tier 2-3"
- "Follow the ❗ markers"

**Impact**: Orchestrator now knows Phase 0 is the ONLY priority until it ships.

---

### 2. Identified Concrete Blockers

**What it does**:
- Lists 5 Phase 0 blockers with clear descriptions
- Estimates hours for each
- Assigns owners
- Provides actionable "Fix Needed" steps

**Impact**: No more vague "work on Phase 0" - specific tasks ready to execute.

---

### 3. Created Action Plan (Next 48 Hours)

**TODAY (D1)**:
- Wire incrementality framework
- Start demo brand weather script

**TOMORROW (D2)**:
- Add confidence intervals
- Continue demo brand connectors

**DAY 3**:
- Regenerate calibration
- Complete demo brand

**END OF WEEK**:
- All Phase 0 exit criteria met
- Ready for sales demos

**Impact**: Clear timeline to Phase 0 completion.

---

## Next Steps for Orchestrator

### Immediate (Next 4 Hours):

1. **Create demo brand weather archive script** (P0 blocker)
   ```bash
   # Create script structure
   touch scripts/demo_brand/build_weather_archive.py

   # Implement Open-Meteo fetching
   # Store to storage/seeds/open_meteo/
   # Normalize to Parquet
   ```

2. **Create demo brand connectors script** (P0 blocker)
   ```bash
   # Create script structure
   touch scripts/demo_brand/build_connectors.py

   # Generate Shopify/Meta/Google/Klaviyo data
   # Store to tmp/demo_brand/lake/
   ```

3. **Wire incrementality framework** (P0 blocker)
   ```python
   # Create Prefect flow
   # Run apps/validation/incrementality.py nightly
   # Persist to state/analytics/experiments/
   ```

### Today (Next 8 Hours):

4. **Add confidence intervals to MMM** (P0 blocker)
   - Modify MMM to return quantiles
   - Update plan API schema
   - Render in UI

5. **Regenerate calibration** (P0 blocker)
   - Run calibration pipeline
   - Validate coverage
   - Publish report

### This Week:

6. **Complete performance tracking** (P0 blocker)
   - Add actuals API endpoint
   - Build comparison logic
   - Create dashboard card

7. **Run end-to-end demo**
   - `make demo-ml`
   - Verify all Phase 0 exit criteria
   - Document for sales

---

## Success Criteria

### Phase 0 Complete When:
- [x] PRIORITY_UNDERSTANDING.md exists
- [ ] All 5 P0 blockers fixed
- [ ] `make demo-ml` runs end-to-end
- [ ] Incrementality shows significant lift (p < 0.05)
- [ ] Confidence intervals render in UI
- [ ] Calibration report published with ≥80% coverage
- [ ] Demo brand generates realistic data
- [ ] Performance tracking compares predicted vs actual

### Orchestrator Effective When:
- [ ] 80%+ time on Phase 0 (currently 10%)
- [ ] <20% time on infrastructure (currently 90%)
- [ ] Phase 0 ships within 1 week

---

## Lessons Learned

### For Orchestrator:

1. **Always ask "Does this block Phase 0?"** before starting work
2. **Follow the ❗ markers** - they're there for a reason
3. **Tier 0 always wins** - context-switch cost < shipping late
4. **Critics are advisory** - fix them in Tier 3 time
5. **Infrastructure is important but not urgent** - Phase 0 first

### For Humans:

1. **Make priorities explicit** - orchestrator needs decision rules, not just roadmap items
2. **Use the ❗ markers** - they should drive prioritization, not be ignored
3. **Monitor where orchestrator spends time** - catch misalignment early
4. **Celebrate progress on critical path** - reinforce Tier 0 work, not polish

---

## Conclusion

**Before**: Autopilot spent 90% of time on Tier 3 (infrastructure, polish, critics) and 10% on Tier 0 (Phase 0 customer value).

**After**: Orchestrator has clear priority framework, concrete blockers identified, action plan for next 48 hours.

**Expected Impact**: Phase 0 ships within 1 week, ready for demo/beta customers.

**Key Insight**: The work autopilot was doing was valuable (fixing critics, polishing UX), but it wasn't *the most valuable thing* (shipping Phase 0). Clarity on Tier 0 vs Tier 3 is what was missing.

Now let's ship Phase 0.
