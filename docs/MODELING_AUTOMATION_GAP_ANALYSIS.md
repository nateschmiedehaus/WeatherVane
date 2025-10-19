# Modeling & Automation Logic Gap Analysis

Date: 2025-10-18  
Author: Codex (analysis pass)

This memo reviews the current ML / causal / automation pipeline (baseline + MMM + allocator + automation guardrails) and flags areas where the logic is not yet meaningful for production decisions. Each gap is mapped to roadmap fixes so we can close them deliberately.

---

## 1. MMM → Allocator loop still uses placeholder economics

- `apps/model/mmm.py` produces channel elasticities via covariance/variance heuristics with no adstock, saturation, or cross-channel competition.  
- `apps/allocator/marketing_mix.py` consumes those elasticities as if they were calibrated response curves, but they are deterministic lines through spend averages.  
- Reinforcement-learning “shadow mode” (`apps/allocator/rl_shadow.py`) evaluates policy variants by sampling random shocks against the same heuristic MMM — with no connection to real-world lift, promotions, or inventory state.

**Impact:** Recommendations and shadow experiments risk reinforcing noise; automation cannot prove value without real response curves.

**Roadmap fix:**  
Add explicit roadmap items for (a) integrating LightweightMMM/Robyn response curves, (b) recording executed spend vs model recommendations, and (c) replacing synthetic shocks with empirical replay data.

---

## 2. Unit-of-analysis undefined for causal modeling

- Baseline training (`apps/model/train.py`) and feature builder (`shared/feature_store/feature_builder.py`) operate at tenant-wide aggregates.  
- Product-level feature builder exists but there is no toggle to scope models to “single product + single geo” for demos or production.  
- Docs (`docs/MODELING_REALITY_CHECK.md`) acknowledge the grain problem, but there is no roadmap ownership to lock the hierarchy (product × region × channel).

**Impact:** Models cannot yet reason about weather or marketing at the same granularity that automation needs; demo flows must manually subset data.

**Roadmap fix:**  
Add roadmap work to define and implement modeling grains (product, category, geo) with selectors in the feature store + training jobs.

---

## 3. Automation lacks causal verification loop

- Automation/allocator guardrails only track ROAS floors and learning caps; there is no causal validation of “automation made things better.”  
- No pipeline writes back plan adoption/execution (plan vs actual spend) to train future policies.  
- Reinforcement learning loop uses random noise, not accepted/rejected automation events.

**Impact:** Even once MMM improves, automation cannot prove lift or self-correct.

**Roadmap fix:**  
Add roadmap tasks for automation feedback ingestion (plan adoption, executed spend deltas) and causal audit workflows per deployment.

---

## 4. Minimal demo still depends on manual scoping

- New demo tooling (`scripts/minimal_ml_demo.py`) makes scoping easy, but core models still assume tenant-wide aggregates.  
- Without product/geo filters in the production pipeline, moving from demo to real environments requires bespoke hacks.
- We do not yet automate the “brand proof” flow—analysts must manually inspect available connectors and decide whether synthetic or live data should drive the walkthrough.

**Roadmap fix:**  
Tie demo scope requirements to modeling grain work so production pipelines expose the same per-product/per-geo toggles, and have Autopilot run a dataset sniff + proof script that produces POC-ready recommendations with minimal human labor.

---

## 5. Weather multipliers not grounded in measurement

- Allocator relies on `ChannelConstraint.weather_multiplier`, a manual input (defaults to 1.0).  
- There is no upstream estimation that links weather factors to channel effectiveness; multipliers risk being stale narration.

**Impact:** Automation may exaggerate weather story without statistical backing.

**Roadmap fix:**  
Add task to infer weather-channel interaction coefficients from MMM outputs or causal experiments, replacing static multipliers.

---

## 6. Promotional & lifecycle signals under-modeled

- Promotions, discounts, coupons, lifecycle sequences (Shopify price rules, Meta/Google promo flights, Klaviyo campaigns) are major causal drivers but are only sparsely captured.  
- Without automatic detection and normalization across connectors, causal analysis may attribute promo-driven lift to weather or spend changes.

**Impact:** Recommendations can mis-credit weather when promo activity is the real driver, eroding trust in automation.

**Roadmap fix:**  
Have Autopilot ingest and harmonise promotion/discount metadata from Shopify, ads platforms, Klaviyo, and related sources; surface the features as first-class causal controls and demo axes.

---

## Summary of roadmap updates

1. **Phase 4 – Media Mix & Causal Inference**  
   - Integrate production MMM response curves (LightweightMMM/Robyn) with allocator and shadow-mode replays.  
   - Capture plan adoption + executed spend for causal validation and policy learning.  
   - Define modeling grain (product/category × geo) with selectable scopes that match demo tooling.  
   - Estimate weather→channel coefficients directly from data, retiring manual multipliers.  
   - Detect and encode promotion/discount/lifecycle signals as causal controls before running automation or demos.

2. **Phase 5 – Allocation Automation & Decision Ops**  
   - Replace synthetic reinforcement-learning shocks with empirical telemetry (plan adoption, realised lift).  
   - Add automation audit loop (pre/post causal checks) before recommending Autopilot rollout.  
   - Deliver trust & governance UX (approvals, lifecycle comms) alongside Autopilot-operated demos.

See `docs/ROADMAP.md` for the corresponding bullet updates.
