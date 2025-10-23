# WeatherVane Architecture Overview

This document is a map for new contributors AND strategic guide for orchestrator decision-making. You should be able to glance at this file and understand where everything lives, why it exists, how it serves business objectives, and how to extend it without breaking other pieces.

---

## Strategic Context - Multi-Disciplinary Objectives

**WeatherVane is a weather-aware ad allocation optimizer** that helps e-commerce brands capture 15-30% incremental revenue by dynamically adjusting ad spend based on weather patterns.

### Primary Business Objectives (CEO Lens)
1. **Get to Paying Customers** - Working demo → prospect meetings → pilot deals → commercial contracts (Target: $50K MRR by Q2 2026)
2. **Prove Weather Impact** - Models show quantifiable lift + geo-holdout experiments validate causality (Target: R² ≥0.65, 15%+ validated lift)
3. **Real Data Ingestion** - Shopify/Meta/Google Ads connectors → live dashboards → automated recommendations (Target: 3+ live tenants by Dec 2025)
4. **Autonomous Operation** - Orchestrator runs training/inference/recommendations without human intervention (Target: 95% autonomy by Q1 2026)

### Expert Perspectives (12-Lens Decision Framework)

**Every architectural decision must pass ALL 12 expert lenses:**

**Core Business** (Strategic direction & value):
1. **CEO** - Does this unblock revenue? Is this the highest-ROI use of time?
2. **CFO** - Do unit economics work? (Gross margin ≥70%, CAC payback <12 months, positive contribution margin?)
3. **CMO** - Does this support our GTM narrative ("capture 15-30% more revenue via weather timing")?

**Product Excellence** (User-facing quality):
4. **Designer** - Does this meet world-class visual/brand standards (Vercel/Linear/Stripe quality)?
5. **UX** - Will users understand this without training? Is it frictionless (<5 min to first insight)?
6. **Customer Success** - Does this reduce churn risk? Improve time-to-value? Enable customer growth?

**Technical Foundation** (Scalability & reliability):
7. **CTO** - Does this scale to 10x/100x load? What breaks at 1000 tenants?
8. **DevOps/SRE** - Is this operationally sound? (Monitoring, alerting, uptime ≥99.5%, incident response?)
9. **Ad Expert** - Is this technically feasible within platform constraints (Meta/Google API limits)?

**Rigor & Governance** (Risk management):
10. **Academic** - Can we statistically validate the claims we're making (p<0.05, R²≥0.65)?
11. **Legal/Compliance** - Does this meet regulatory requirements? (GDPR, SOC2, data privacy?)
12. **PM** - What's blocked by this? What's the critical path impact? Dependencies clear?

**Decision Rule**: A task is "ready to execute" only if it passes ALL 12 lenses (score ≥70 on each). Orchestrator autonomously evaluates tasks through this framework.

**Self-Reflection**: Orchestrator periodically audits this framework using `lens_gap_detector.ts` to identify missing perspectives and propose expansions.

**Implementation Status** (2025-10-23): ✅ **COMPLETE**
- `seven_lens_evaluator.ts` - All 12 lenses implemented and tested (26/26 tests passing)
- `holistic_review_manager.ts` - Integrated into orchestrator runtime
- `milestone_review_generator.ts` - Auto-generates 7 review tasks at 80% milestone completion
- `lens_gap_detector.ts` - Meta-cognitive system to identify missing perspectives
- **Validation**: Lens Gap Detector now finds zero gaps (all previously missing lenses successfully added!)

See: `HOLISTIC_REVIEW_IMPLEMENTATION_COMPLETE.md` for full implementation details.

### Success Metrics by Discipline

**Core Business**:
- **CEO**: Monthly Recurring Revenue (MRR) → $50K by Q2 2026
- **CFO**: Gross Margin per Tenant → ≥70%, CAC Payback Period → <12 months
- **CMO**: Qualified Sales Pipeline → 20 prospects by Q1 2026, Win Rate → ≥25%

**Product Excellence**:
- **Designer**: Design System Completeness → 100% documented (Figma + React Storybook)
- **UX**: Time to First Insight → <5 minutes (onboarding analytics)
- **Customer Success**: Onboarding Completion Rate → ≥70%, Monthly Churn → <3%

**Technical Foundation**:
- **CTO**: P95 Query Latency → <500ms at 100 tenants, Database Scaling Plan → Documented
- **DevOps/SRE**: Uptime → ≥99.5%, MTTD → <5 minutes, MTTR → <1 hour
- **Ad Expert**: API Integration Uptime → 99.5%, Rate Limit Compliance → 100%

**Rigor & Governance**:
- **Academic**: Model R² (out-of-sample) → ≥0.65, Statistical Significance → p<0.05
- **Legal/Compliance**: SOC2 Certification → In progress, GDPR Compliance → Yes/No
- **PM**: On-Time Milestone Delivery → 80%+, Critical Path Visibility → Real-time

### Critical Path to Revenue
```
PoC Fix (done) ✅
  → Synthetic Data Generation (T-MLR-1.2, in progress) ⏳
    → Model Training (T-MLR-2.3, pending)
      → Model Validation (T-MLR-2.4, pending)
        → Demo Readiness (T12.Demo.1, pending)
          → Prospect Meetings (Q4 2025)
            → Pilot Deals (Q1 2026)
              → Revenue (Q1 2026) 💰
```

**Current Bottleneck**: T-MLR-1.2 (synthetic data generation) - Blocks everything downstream

### Milestone Review Requirements

**Orchestrator must auto-generate 7 review tasks when ANY milestone reaches 80% completion:**

1. **Technical Review** - Verify all exit criteria met (build passes, tests pass, features work)
2. **Quality Review** - Run all critics (tests, security, performance, design_system)
3. **Business Review** - Confirm alignment with objectives (CEO lens: does this unblock revenue?)
4. **UX Review** - Validate user experience meets standards (UX lens: <5min to value, frictionless?)
5. **Academic Review** - Verify statistical rigor + reproducibility (Academic lens: R²≥0.65, p<0.05?)
6. **Risk Review** - Document lessons learned + update risk register (PM lens: what could go wrong?)
7. **Go/No-Go Decision** - Proceed to next phase or iterate? (All 7 lenses must pass)

**Format**: Review tasks should be named `[MILESTONE-ID]-Review-[Lens]` (e.g., `T-MLR-1-Review-CEO`)

**Trigger**: Orchestrator monitors milestone completion percentage. When tasks_done/tasks_total ≥ 0.80, auto-generate these 7 review tasks and add to roadmap.

**Owner**: Each review task assigned to appropriate expert (CEO reviews to Director Dana, Academic reviews to Academic Rigor critic, etc.)

---

## PoC Validation Priority (UPDATED 2025-10-23)

**STATUS: ACTIVE - THIS IS THE TOP PRIORITY**

### The Goal

**Prove the model works when it should AND correctly identifies when it won't work.**

We are NOT building infrastructure for the sake of infrastructure. We are building a **proof of concept** that demonstrates:

1. ✅ **Positive Case**: For weather-sensitive brands, the model predicts ad performance lift with high accuracy (R²≥0.65)
2. ✅ **Negative Case**: For random/non-weather-sensitive data, the model recognizes it can't help (low R², high uncertainty)
3. ✅ **End-to-End Simulation**: Full product experience simulated for diverse tenants

**Success = Demonstrating the model is NOT snake oil. It works when weather matters, and honestly admits when it doesn't.**

### How the 12-Lens Framework Prioritizes PoC Validation

**CEO Lens** (Updated scoring):
- Tasks with PoC validation keywords (synthetic data, model training, simulation, negative case testing): **+40 score boost**
- Tasks with negative case testing: **additional +10 boost**
- Infrastructure work WITHOUT PoC relevance: **-30 penalty**
- **Result**: PoC validation tasks score 100-110/100, infrastructure tasks score 20/100

**Academic Lens** (Updated scoring):
- Tasks with negative case testing (random data, control tenants, placebo testing): **+35 score boost**
- Tasks that only test positive cases: **-15 penalty**
- **Rationale**: Negative results are GOOD SCIENCE - proves we're not hallucinating patterns

**Concrete Examples**:
- ✅ **HIGH PRIORITY**: "Generate 20 diverse synthetic tenants with 3 years data (weather-sensitive AND random control tenants)" → CEO: 100/100, Academic: 85/100, Ranks #1
- ✅ **HIGH PRIORITY**: "Build end-to-end simulation: forecast ingestion → recommendations → automation demo" → CEO: 110/100, Ranks #2
- ❌ **LOW PRIORITY**: "Implement database sharding for multi-tenant scalability" → CEO: 20/100, Ranks Last, Warning: "Infrastructure work before PoC proven - wrong priority"

### What Gets Deprioritized (Until PoC Proven)

- Production infrastructure scaling (DB sharding, multi-tenant architecture)
- Real customer OAuth integrations (Shopify, Meta API)
- UI/UX polish beyond demo quality
- DevOps hardening (monitoring, alerting, SLAs)
- Multi-tenant database architecture

**These become priorities AFTER we prove the model works!**

### Reference

For full PoC validation strategy including tenant types, data requirements, model training process, and end-to-end simulation details, see: **`docs/POC_OBJECTIVES_PRIORITY.md`**

For test demonstrating prioritization works, run: `npx tsx test_poc_prioritization.ts` (from `tools/wvo_mcp/`)

---

## High-Level Layout

```
apps/
  api/          # FastAPI service (health, plans, settings)
  worker/       # Prefect flows, ingestion, scheduling entrypoints
  web/          # Next.js frontend (landing + app shell)
shared/
  libs/         # Reusable helper libraries (connectors, storage, tagging, logging)
  schemas/      # Pydantic models shared between API and worker
  feature_store/# Weather cache + feature engineering utilities
storage/
  lake/         # Parquet snapshots (ingested data)
  metadata/     # Placeholder for relational dumps (if needed)
```

## Execution Path (Plan & Proof mode)
1. **Worker flow** (`apps/worker/flows/poc_pipeline.py`) orchestrates ingestion → features →
   modeling → simulation → report generation. Each Prefect task is intentionally tiny and
   documented so a junior engineer can edit it without scrolling for minutes.
2. **Ingestion** modules live under `apps/worker/ingestion`. Every ingestor returns an
   `IngestionSummary` with `path`, `row_count`, and `source`, keeping contracts simple.
3. **Storage** utilities (`shared/libs/storage/lake.py`) hide Polars/DuckDB usage behind a
   `LakeWriter`. You always write Parquet using the same method, so schema changes are easy.
4. **Weather cache** (`shared/feature_store/weather_cache.py`) stores upstream responses per
   geocell. The scaffold writes JSON now; swapping to Parquet later only requires edits there.
5. **API** surfaces read-only endpoints for health, plans, and automation defaults.
6. **Frontend** consumes API responses, renders Plan/Stories/Catalog/Automations views.

## Design Principles
- **Readability first:** modules are short and heavily commented. Complex logic is broken into
  helpers and dataclasses.
- **Predictable contracts:** ingestors always return `IngestionSummary`, flows pass around
  dicts with explicit keys, APIs use typed schemas.
- **Feature isolation:** weather cache, tagging, storage each live in their own modules.
  Replacing one implementation does not require touching others.
- **OSS stack:** everything runs on FastAPI, Prefect OSS, DuckDB/Polars, ONNX Runtime, etc.
- **No hidden side-effects:** flows write to `storage/lake/*` and return summaries; API remains
  read-only until a tenant enables pushes.

If something feels unclear, add a docstring or expand this document—future you (or the next
junior hire) will thank you.
