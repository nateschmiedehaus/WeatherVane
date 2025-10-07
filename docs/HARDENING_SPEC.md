# WeatherVane Hardening Spec v1.0

**Status:** Final — implementable now  
**Audience:** Engineering, Data Science, Product, Legal  
**Purpose:** Define the investigation, decisions, and implementation plan to harden WeatherVane into a reliable, compliant, and explainable system without breaking existing workflows.

---

## 0) Scope & Non‑Goals

**In-scope:** Modeling pipeline (time series discipline), feature matrix integrity, geocoding/weather join, allocator feasibility, uncertainty semantics, recommendation explainability, failure-mode handling, privacy/data governance, and UX simplifications that reduce operator burden.

**Non-goals:** Full causal-inference R&D beyond an optional, flag‑gated path; advanced multi-agent auction modeling; deep experiment platforms.

---

## 1) Architecture Summary (Target State)

```
apps/
  ingestion/            # zip→lat/lon→geohash
  model/                # ts_training, causal (optional)
  allocator/            # heuristics + constraints
  api/                  # consent, privacy routes, plan
  worker/               # pipelines (poc_pipeline -> hardened)
shared/
  contracts/            # schemas for features & plan slices
  validation/           # leakage, weather column assertions
  feature_store/        # feature_builder (weather join)
  storage/              # lake interfaces with retention
web/ui/
  components/           # PlanSummary, UncertaintyBars, etc.
```

**Core Contracts**

* `FeatureMatrix` must include weather columns and geo keys.
* `PlanSlice` must carry p10/p50/p90, confidence, assumptions, rationale.
* `PlanStatus` communicates data quality (`FULL`, `DEGRADED`, `STALE`).

---

## 2) Investigation → Decision Records (light ADRs)

Each section documents: **Problem → Options considered → Decision → Rationale → Impact**.

### ADR-01: Time-Series Data Leakage & Validation

**Problem**: OLS fit across full history without temporal validation inflates metrics; no holdouts; no blocked folds; spurious correlations likely.

**Options**:

1. Keep OLS; add blocked splits and holdout.
2. Switch to time-aware GAM.
3. Use regularized tree/boosting (e.g., LightGBM) with time splits.

**Decision**: **(3)** default to gradient-boosted trees for robustness and speed; require chronological sorting; use `TimeSeriesSplit` with gaps; reserve final 8 weeks as holdout; add minimal stationarity and auto-differencing where linear models are used.

**Rationale**: Fast incremental training, handles interactions without heavy feature engineering; simpler ops footprint than GAM; avoids linearity assumptions.

**Impact**: New `ts_training.fit()` wrapper is the only entry point for supervised models; CI will fail if bypassed.

### ADR-02: Weather Features Missing in Matrix

**Problem**: Weather loaded but not joined; models observe no weather signal.

**Options**:

1. Join by date only (single-geo tenants).
2. Join by `(date, geohash)` for multi-geo; compute anomalies in builder.
3. Outsource anomalies to a separate preprocessing service.

**Decision**: **(2)** Implement `_weather_daily()` and join by `(date, geohash)` when geo granularity exists; otherwise by `date`. Compute anomalies here for determinism and testability.

**Rationale**: Keeps lineage in one place; easy validation; no network coupling.

**Impact**: New required columns enforced; feature builds will fail early on schema violations.

### ADR-03: Geocoding Strategy & Weather Cache Keys

**Problem**: Default coordinates; no mapping from zip→lat/lon→geohash.

**Options**:

1. `pgeocode` offline DB (US/EU) with fallbacks.
2. External APIs (Google, Mapbox) with cost/latency.
3. Hybrid: local first; API fallback on miss.

**Decision**: **(3)** Hybrid; begin with `pgeocode`; configurable API fallback; cache results; store `ship_geohash`.

**Rationale**: Cost control; resiliency; sufficient accuracy for cell-level weather.

**Impact**: Ingestion enriched; weather cache indexed by geohash; historical backfill job added.

### ADR-04: Allocation Under Non-Convex Constraints

**Problem**: Learning-phase thresholds, ROAS floors, and scenario robustness are non‑convex; convex solvers may fail.

**Options**:

1. Convex relaxation + rounding.
2. Heuristic global optimization (DE/CMA‑ES) with penalties + equality budget constraint.
3. Full MINLP (Pyomo + BONMIN/SCIP).

**Decision**: **(2)** Heuristic allocator (DE) with explicit constraint diagnostics; expose binding/violated constraints; equality constraint on budget.

**Rationale**: Faster delivery; stable; transparent; easy to audit; acceptable for PoC/early prod.

**Impact**: Deterministic seed; nightly scenario runbooks; explainable outputs.

### ADR-05: Predictive vs. Causal Claims

**Problem**: Current pipeline is predictive; causal claims require identification.

**Options**:

1. Remove causal language; keep predictive ranges.
2. Add optional IV path (forecast errors).
3. Add CATE via CausalForestDML.

**Decision**: **(1+2)** Default predictive messaging; implement IV path behind a feature flag when forecasts and realized weather are both present.

**Rationale**: Honesty and speed; unlocks causal claims only when assumptions hold.

**Impact**: Report templates updated; API exposes `mode: predictive|causal`.

### ADR-06: Cross-Geo Effects & Inventory

**Problem**: Independent-geo assumption can misallocate; inventory constraints ignored.

**Options**:

1. Add inventory cap constraint only.
2. Add CPM self-competition term.
3. Spatial lag model (SAR) + 1 & 2.

**Decision**: **(1+2)** Enforce total conversions ≤ inventory; CPM increases with total spend via simple param; SAR reserved for later flag.

**Rationale**: 80/20 improvement with minimal complexity; avoids overfitting.

**Impact**: Allocator now consumes `inventory_available` and `cpm_alpha`.

### ADR-07: Promo × Weather Confounding

**Problem**: Promo strategies triggered by forecasts confound weather effects.

**Options**:

1. Always include `weather × promo` interaction; stratified fits.
2. DAG‑based controls; IV when forecast triggers exist.

**Decision**: **(1)** Interaction + stratification as baseline; optional IV via ADR‑05 when data supports.

**Rationale**: Simple, robust, explainable.

**Impact**: Feature builder emits `promo_active` and interaction term; model cards show coefficients/feature importances.

### ADR-08: Uncertainty Semantics & UX

**Problem**: Ranges ambiguous; users anchor to optimistic values.

**Options**:

1. Fixed CI bands.
2. Quantile predictions p10/p50/p90 + confidence level by data volume.
3. Scenario bands only.

**Decision**: **(2)** p10/p50/p90 with `confidence: HIGH|MEDIUM|LOW`; assumptions listed.

**Rationale**: Standard practice; calibratable; easy to teach.

**Impact**: API and UI components updated; calibration scores tracked.

### ADR-09: Automation Safety & Liability

**Problem**: “Autopilot” implies guarantees; risk of losses and regulatory exposure.

**Options**:

1. Rename + consent + circuit breakers + daily cap.
2. Keep as-is.
3. Remove automation.

**Decision**: **(1)** Rename to **Guided Automation**; add explicit consent and kill‑switches.

**Rationale**: Maintain value while managing risk.

**Impact**: New consent flow; push service observes caps and breakers.

### ADR-10: Plan View Cognitive Load

**Problem**: Thousands of cells overwhelm users.

**Options**:

1. Exception-based UI with top opportunities; bulk approve.
2. Show all; paginate.
3. Auto-hide small changes only.

**Decision**: **(1)** Progressive disclosure with summary → opportunities → drilldown.

**Rationale**: Fast comprehension; safer approvals.

**Impact**: New UI components; default screen fits one view.

### ADR-11: Recommendation Explanations

**Problem**: Free-form JSON isn’t renderable or helpful.

**Options**:

1. Typed `Rationale` schema + NLG.
2. Raw metrics dump.

**Decision**: **(1)** Structured rationale + templated natural language; provenance links.

**Rationale**: Trust, education, debuggability.

**Impact**: API and UI changes; snapshot tests on prose.

### ADR-12: Failure Modes

**Problem**: No graceful degradation; unclear status; silent failures.

**Options**:

1. Status codes + fallbacks + error UX.
2. Hard fail only.

**Decision**: **(1)** Add `data_quality` flags and recoveries per upstream dependency.

**Rationale**: Resilience and transparency.

**Impact**: Worker catches; API and UI show status; alerts on critical paths.

### ADR-13: Data Governance (GDPR/CCPA)

**Problem**: PII risk in orders schema; no deletion/export/retention.

**Options**:

1. Aggregate before storage; deletion/export endpoints; retention job; DPA.
2. Keep raw orders at rest.

**Decision**: **(1)** Data minimization and compliance endpoints.

**Rationale**: Legal necessity and customer trust.

**Impact**: Schema changes; new routes; scheduled job.

---

## 3) Contracts & Schemas

### 3.1 `shared/contracts/feature_matrix.schema.json`
```
{...}
```
### 3.2 `shared/contracts/plan_slice.schema.json`
```
{...}
```
### 3.3 `shared/contracts/plan_status.schema.json`
```
{...}
```

(See full spec for exact JSON.)

---

## 4) Implementation Details

* Modeling via `apps/model/ts_training.py` (LightGBM + TimeSeriesSplit + holdouts).
* Feature builder joins weather by `(date, geohash)` and validates required columns.
* Geocoding enriches shipments using `pgeocode` with optional API fallback; weather cache indexed by geohash.
* Allocator uses differential evolution with penalties for ROAS floor, learning-phase caps, inventory, CPM.
* Quantile predictions (p10/p50/p90) with calibration monitoring.
* Structured rationales and progressive-disclosure UI.
* Failure-mode handling and data governance endpoints.

---

## 5) Testing Strategy

Unit, property-based, integration, backtests, and chaos testing outlined to guarantee robustness and transparency.

---

## 6) Migration & Rollout

Outlined in seven steps with flags/rollbacks for each subsystem.

---

## 7) Observability

Model cards, allocator diagnostics, plan status metrics, and privacy audit logs.

---

## 8) Risks & Mitigations

Sparse history, geocode noise, heuristic local minima, legal ambiguity — each with mitigation.

---

## 9) Glossary

Definitions for p10/p50/p90, calibration, Guided Automation.

---

## 10) Appendix: Code Owners & Task List

Week-by-week hardening plan aligned to ADRs.
