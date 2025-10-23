# WeatherVane Orchestrator Priority Understanding
**Generated**: 2025-10-23
**Purpose**: Ensure orchestrator knows the full logical priorities for demo + beta customer readiness

## Executive Summary

**Primary Business Goal**: Get to demo-ready + beta customers as fast as possible.

**Critical Path (Phase 0)**: Prove measurable lift so marketers trust the system. Without this proof, no one will pay for WeatherVane.

**Secondary Goal (Phase 1)**: Enable decision support + adoption so prospects can socialize recommendations quickly.

---

## What Success Looks Like

### For Demo
1. **Full-fidelity synthetic tenant** with realistic weather + commerce + ads data
2. **End-to-end ML pipeline** showing weather-aware recommendations
3. **Proof of lift** via incrementality experiments and confidence intervals
4. **Visual storytelling** with maps, charts, exports for sales decks

### For Beta Customers
1. **Onboarding flow** that connects their data sources without engineering help
2. **Confidence metrics** showing "70% chance ROAS ≥ 2.5×" so they trust recommendations
3. **Scenario planning** so they can explore trade-offs before committing budget
4. **Performance tracking** with predicted vs actual ROAS for CFO sign-off

---

## Phase 0 Priorities (CRITICAL - Must Ship This Week)

### ❗ 1. Incrementality & Significance
**Why Critical**: Without proof of lift, prospects won't believe weather matters.

**Blockers Found**:
- Geo holdout framework exists but not wired to nightly jobs
- Experiment artifacts not yet persisted to state/analytics/experiments/
- Statistical tests not surfaced in API or UI

**What's Needed**:
```bash
# Wire nightly job
python apps/validation/incrementality.py --tenant demo-brand

# Persist assignments
state/analytics/experiments/geo_holdouts/*.json

# Surface in UI
apps/web/src/pages/plan.tsx - lift/confidence cards
```

**Owner**: Autopilot Engine + Data Platform
**Timeline**: D1 milestone (TODAY)

---

### ❗ 2. Confidence & Benchmarking
**Why Critical**: Marketers need "70% chance ROAS ≥ 2.5×" not "here's a number".

**Blockers Found**:
- Confidence intervals not computed in allocator
- Benchmarks against industry norms missing
- UI shows point estimates only, no uncertainty

**What's Needed**:
- Add quantile outputs to MMM (p10, p50, p90)
- Surface confidence intervals in plan API schema
- Render confidence cards in UI with marketer-friendly language

**Owner**: Modeling squad + Apps/API
**Timeline**: D2 milestone (TOMORROW)

---

### ❗ 3. Forecast Reliability
**Why Critical**: If forecasts are wrong, recommendations are worthless.

**Blockers Found**:
- Calibration pipeline exists but results stale (STATUS.md confirms)
- Quantile coverage not validated (need ≥80% for p10-p90 band)
- No UI disclosure for widened bands on Day 4-7 horizons

**What's Needed**:
```bash
# Regenerate calibration
python apps/model/feedback/calibration.py

# Store results
state/telemetry/calibration/*.json

# Publish report
docs/modeling/forecast_calibration_report.md
```

**Owner**: Modeling squad + Observability
**Timeline**: D3 milestone (END OF WEEK)

---

### ❗ 4. Full-Fidelity Demo Brand
**Why Critical**: Prospects expect to see a believable brand, not toy CSVs.

**Blockers Found** (from DEMO_BRAND_PLAYBOOK.md):
- Weather archive scripts not written (`scripts/demo_brand/build_weather_archive.py`)
- Connector build scripts missing (`scripts/demo_brand/build_connectors.py`)
- Klaviyo fixtures incomplete
- Nightly automated run not set up
- Pytest suite for dataset manifests missing

**What's Needed**:
1. Write weather archive script (Open-Meteo 2-year historical + 14-day forecast)
2. Write connector build script (Shopify, Meta, Google, Klaviyo)
3. Extend `seed_synthetic_tenant` for Klaviyo
4. Add pytest suite for schema validation
5. Wire Prefect flow for nightly regeneration

**Owner**: Autopilot Engine + Solutions + Data Platform
**Timeline**: CRITICAL - Week 1 (started TODAY)

---

## Phase 1 Priorities (Decision Support - Week 2-3)

### ❗ 1. Scenario Planning & Comparison
Interactive scenario builder so prospects can explore "what if I shift $10k from Meta to Google?"

**Status**: Design review scheduled, implementation pending
**Blocker**: Waiting on design sign-off before coding
**Owner**: Priya (Front-end) + Leo (API) + Aria (Design)

### ❗ 2. Visual Storytelling & Exports
Maps, heatmaps, charts, PowerPoint/Excel exports for CMO decks.

**Status**: Partially done (charts exist), maps/exports missing
**Blocker**: MapLibre integration not started, export service stubbed
**Owner**: Priya + Leo

### ❗ 3. Onboarding & Guidance
Setup wizard, sample data mode, contextual tooltips so prospects self-serve.

**Status**: Progress API exists, wizard UI not built
**Blocker**: Front-end implementation of wizard flow
**Owner**: Priya + Sam (FastAPI)

---

## What Autopilot Has Been Doing vs. What's Needed

### What Autopilot Attempted (from blockers.json):
1. **Critic remediation** - Many critics failing, autopilot spent time fixing them
2. **WeatherOps dashboard polish** - Design system, region filters, analytics events
3. **Dashboard features** - Timeline, map interactions, automation cards
4. **MCP tooling fixes** - plan_next YAML errors, restart scripts

### Critical Gap Analysis:

**❌ Autopilot was NOT working on Phase 0 critical path items:**
- No work on incrementality framework wiring
- No work on confidence interval surfaces
- No work on forecast calibration regeneration
- No work on demo brand data generation scripts

**✅ Autopilot WAS working on:**
- WeatherOps dashboard polish (Phase 6 - Observability, not critical for demo/beta)
- Critic performance fixes (maintenance, not value delivery)
- MCP tooling (orchestrator infrastructure, not product)

### Root Cause:
**Autopilot didn't understand that Phase 0 is the ONLY thing that matters right now.**

The roadmap shows Phase 0 with ❗ Critical Blocker markers, but autopilot was:
1. Distracted by failing critics (which are advisory, not blocking)
2. Working on WeatherOps dashboard (internal tool, not customer-facing)
3. Fixing MCP infrastructure (orchestrator maintenance, not product delivery)

---

## Corrected Priority Framework

### Tier 0: SHIP OR DIE (This Week)
These are the ONLY things that matter for demo/beta readiness:

1. **Phase 0 Exit Criteria** (all 5 items)
   - Incrementality framework LIVE
   - Confidence intervals in UI
   - Calibration report published
   - Demo brand fully automated
   - Performance tracking with predicted vs actual

### Tier 1: Demo Experience (Week 2-3)
Customer-facing features that enable sales conversations:

1. **Phase 1 Scenario Builder** - interactive exploration
2. **Phase 1 Visual Exports** - PowerPoint/Excel for CMO decks
3. **Phase 1 Onboarding Wizard** - self-serve setup

### Tier 2: Product Polish (Week 3-4)
Nice-to-haves that improve UX but don't block launch:

1. Maps with weather overlays
2. Mobile responsiveness
3. Loading skeletons
4. Advanced animations

### Tier 3: Infrastructure (Ongoing, Parallel)
Things that need to work but shouldn't block product delivery:

1. Critic performance (advisory, not blocking)
2. MCP server stability (autopilot infrastructure)
3. Build/test/audit fixes (must pass, but not customer-facing)
4. WeatherOps dashboard (internal observability tool)

### Tier 4: Future (Parking Lot)
Important long-term but not for first customers:

1. Phases 3-10 from roadmap
2. Connector platform SDK
3. Explainability infrastructure
4. Creative intelligence
5. Automation execution (Phase 5)

---

## Decision Rules for Orchestrator

### When choosing what to work on next:

**Rule 1: Phase 0 always wins**
If there's a Phase 0 item pending, work on that. Ignore everything else.

**Rule 2: Critic failures are advisory, not blocking**
Critics should run, but their failures don't block Phase 0 delivery. Fix them in Tier 3 time.

**Rule 3: MCP infrastructure is Tier 3**
Autopilot orchestration improvements are valuable but NOT more important than Phase 0.

**Rule 4: "Polish" is Tier 2-3**
Design system, animations, perfect test coverage - these are great but come AFTER Phase 0.

**Rule 5: Follow the ❗ markers**
The roadmap has ❗ Critical Blocker markers on Phase 0 items. Those are the truth.

---

## Immediate Action Plan (Next 48 Hours)

### TODAY (D1):
1. ✅ Wire incrementality framework to nightly jobs
2. ✅ Persist experiment artifacts to state/analytics/
3. ✅ Start demo brand weather archive script

### TOMORROW (D2):
1. ✅ Add confidence intervals to MMM outputs
2. ✅ Surface lift/confidence in plan API
3. ✅ Render lift cards in plan UI
4. ✅ Continue demo brand connector build script

### DAY 3:
1. ✅ Regenerate calibration report with quantile coverage
2. ✅ Validate ≥80% coverage for p10-p90 bands
3. ✅ Complete demo brand data generation
4. ✅ Run `make demo-ml` end-to-end

### END OF WEEK:
1. ✅ All Phase 0 exit criteria met
2. ✅ Demo brand fully automated
3. ✅ Calibration report published
4. ✅ Ready for sales demos

---

## Success Metrics

### Demo Readiness (Phase 0):
- [ ] Incrementality framework shows statistically significant lift (p < 0.05)
- [ ] Confidence intervals render in UI ("70% chance ROAS ≥ 2.5×")
- [ ] Calibration report shows ≥80% coverage for p10-p90 bands
- [ ] Demo brand generates realistic data end-to-end in <5 minutes
- [ ] Performance tracking compares predicted vs actual with <10% MAE

### Beta Customer Readiness (Phase 1):
- [ ] Onboarding wizard connects Shopify + Meta + Google without engineering
- [ ] Scenario builder allows exploring budget trade-offs
- [ ] Visual exports generate PowerPoint decks for CMO review
- [ ] Empty states guide new users through setup

### Orchestrator Effectiveness:
- [ ] 80%+ of autopilot time spent on Phase 0 items (currently ~10%)
- [ ] <20% of time on infrastructure/polish (currently ~90%)
- [ ] Phase 0 exit criteria met within 1 week (currently stalled)

---

## Communication Protocol

### When escalating blockers:
1. **Always specify which Phase 0 item is blocked** - e.g., "Incrementality framework blocked on Prefect job wiring"
2. **Explain customer impact** - e.g., "Without this, we can't prove lift to prospects"
3. **Propose solution** - e.g., "Need 4 hours to write nightly job script"
4. **Assign owner** - e.g., "Autopilot Engine + Data Platform"

### When reporting progress:
1. **Track against Phase 0 milestones** - e.g., "M0.1 (D1) complete: Geo holdout job live"
2. **Include evidence** - e.g., "Artifacts in state/analytics/experiments/geo_holdouts/"
3. **Update STATUS.md** - Keep "Current Focus" section aligned with Phase 0 progress
4. **Log in context.md** - Timestamped entries for accountability

---

## FAQ for Orchestrator

**Q: A critic is failing. Should I fix it?**
A: Only if it blocks Phase 0 delivery (e.g., build/test/audit must pass). Otherwise, log it and continue Phase 0 work.

**Q: WeatherOps dashboard needs a feature. Should I add it?**
A: No. WeatherOps is Tier 3 (internal observability). Focus on Phase 0 (customer-facing proof).

**Q: MCP server has a bug. Should I fix it?**
A: Only if it prevents Phase 0 work (e.g., can't run incrementality jobs). Otherwise, Tier 3.

**Q: Design review is scheduled for Phase 1. Should I wait?**
A: If it's blocking Phase 1 implementation, escalate to expedite. If Phase 0 isn't done, continue Phase 0.

**Q: How do I know what's Phase 0?**
A: Look for ❗ markers in docs/ROADMAP.md Phase 0 section. Those 5 items are the ONLY critical path.

**Q: What if I'm 80% done with a Tier 3 task?**
A: Stop. Finish it later. Phase 0 always wins. Context-switch cost is lower than shipping late.

**Q: Can I work on multiple phases in parallel?**
A: Only if Phase 0 is DONE. Before that, single-thread on Phase 0 to maximize velocity.

---

## Appendix: Historical Mistakes to Avoid

### ❌ Mistake 1: Working on WeatherOps instead of Phase 0
**What happened**: Autopilot spent days polishing WeatherOps dashboard (region filters, timeline interactions, analytics events).

**Why wrong**: WeatherOps is an internal observability tool (Phase 6). It doesn't help us get beta customers.

**Lesson**: Always ask "Does this block demo/beta readiness?" If no, it's Tier 3.

---

### ❌ Mistake 2: Fixing advisory critics instead of Phase 0
**What happened**: Autopilot spent time restoring allocator, academic rigor, design system critics.

**Why wrong**: Critic failures are advisory (they don't block shipping). Phase 0 is blocking.

**Lesson**: Critics should run, but fixing them is Tier 3 unless they're build/test/audit (required for ship).

---

### ❌ Mistake 3: MCP infrastructure over product delivery
**What happened**: Autopilot worked on MCP restart scripts, tool routing, error detection.

**Why wrong**: MCP is orchestrator infrastructure. Phase 0 is product delivery for customers.

**Lesson**: Infrastructure is valuable but NOT more valuable than getting to first customer.

---

### ❌ Mistake 4: Not understanding the ❗ markers
**What happened**: Roadmap clearly marked Phase 0 items with ❗ Critical Blocker, but autopilot worked on other things.

**Why wrong**: The ❗ markers exist to tell orchestrator what's urgent. Ignoring them breaks priorities.

**Lesson**: ❗ markers = truth. If it doesn't have ❗, it's not Tier 0.

---

## Summary

**The Rule**: If it's not Phase 0, it's not Tier 0. Ship Phase 0, then worry about polish.

**The Goal**: Demo-ready with proof of lift + beta customers using the product.

**The Timeline**: 1 week for Phase 0 exit criteria, 2-3 weeks for Phase 1 decision support.

**The Focus**: Incrementality, confidence, calibration, demo brand, tracking. Everything else is Tier 3.

---

**Orchestrator**: You now understand the full logical priorities. Execute Phase 0 first. Everything else is noise until Phase 0 ships.
