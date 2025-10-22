# WeatherVane Delivery Roadmap

Single source of truth for sequencing critical gaps and planned enhancements. Status key: ✅ Done · 🔄 In Progress · ⏳ Next Up · 🛤️ Planned · ❗ Critical Blocker · 🧩 Dependency.

---

## Phase 0 · Proof of Impact (Critical Path)
Objective: Prove that weather-aware recommendations drive measurable lift so marketers trust the system.

1. ❗ Incrementality & Significance
   - Build geo holdout experimentation framework (`apps/validation/incrementality.py`).
   - Add statistical tests per plan slice; surface significance + lift in API/UI.
   - Backtesting dashboard comparing "recommended vs actual" with attribution.
2. ❗ Confidence & Benchmarking
   - Present marketer-friendly intervals ("70% chance ROAS ≥ 2.5×") in plan UI.
   - Benchmark performance against industry norms; highlight under/over-performance.
   - Publish `docs/CAUSAL_LIMITATIONS.md` and surface UI disclaimers clarifying that current models reflect associations, not causal guarantees.
3. ❗ Performance Tracking link
   - Capture predicted vs actual ROAS; emit context tags when lift is below target.
   - Provide summary report/export for finance/CMO sign-off.
4. ❗ Forecast reliability
   - Validate quantile calibration (target ≥80% coverage for p10–p90 band) and log results in `/calibration`.
   - Inflate forecast uncertainty for long horizons (Day 4–7) and disclose widened bands in plan UI.
5. ❗ Full-fidelity demo brand
   - Generate a realistic synthetic tenant (weather, Shopify, Meta, Google, Klaviyo) seeded from public schemas + Open-Meteo archives so the entire lake matches production column coverage.
   - Stand up an automated pipeline that ingests the dataset, trains the MMM/causal stack end-to-end, and publishes allocator outputs + diagnostics as a regression fixture.
   - Document dataset provenance, connector assumptions, and reset instructions in `docs/DEMO_BRAND_PLAYBOOK.md`; add smoke tests that fail if any connector payload shape or MMM outcome drifts.
   - Feed three-year Open-Meteo daily history into `seed_synthetic_tenant`/`seed_synthetic_brand_portfolio`, enforce scenario guardrails via `tests/model/test_weather_brand_scenarios.py` + `tests/apps/model/test_train.py::test_weather_fit_flags_low_signal`, and wire Autopilot (task `T13.3.1`) to rerun those suites whenever modeling or geo reporting changes.
   - Align synthetic + live geo coverage with platform limits: follow Meta Insights breakdown constraints (`country`, `region`, `dma` only; off-Meta actions omit `region`/`dma` per [Meta Marketing API – Insights Breakdowns](https://developers.facebook.com/docs/marketing-api/insights/breakdowns/)) and rely on first-party orders for city/ZIP lift; leverage Google Ads segments (`segments.geo_target_city`, `segments.geo_target_postal_code`, etc.) per [Google Ads API fields](https://developers.google.com/google-ads/api/fields/v22/segments) when campaigns export granular geo IDs.
   - Evaluate Meteostat as a supplemental historical feed (station-level accuracy, CC-BY licence) to decide whether we should pair it with Open-Meteo for dense urban tenants; document findings and integration requirements.

Exit criteria: A/B experiment results available for at least one tenant; plan UI displays significance, confidence, lift benchmarks, and clear causal disclaimers; demo brand runs nightly on the full-fidelity synthetic dataset with green MMM/allocator diagnostics.

---

## Phase 1 · Decision Support & Adoption
Objective: Help marketers explore scenarios, tell the story, and socialize recommendations quickly.

1. ❗ Scenario Planning & Comparison
   - Interactive scenario builder (`apps/web/src/pages/scenarios.tsx`).
   - Side-by-side plan comparison mode, trade-off visualization (e.g., reallocating spend).
2. ❗ Visual Storytelling & Exports
   - Maps + heatmaps (MapLibre) for geo performance & weather overlays.
   - Trend/forecast charts (Recharts/ECharts), waterfall views, 30-day calendar outlook.
   - Export service (PowerPoint/Excel/CSV) and one-click downloads across UI.
3. ❗ Onboarding & Guidance
   - Setup wizard (connect connectors, run backfill, generate first plan).
   - Empty states, contextual tooltips, sample-data demo mode, embedded videos.
   - Loading skeletons, error boundaries, mobile-friendly layout.
4. Quick wins (parallelizable)
   - CSV export buttons, webhook payload docs, loading skeletons, API reference page, help tooltips.

Exit criteria: Marketers can simulate scenarios, export decks, and onboard without engineering help; decision visuals replace raw tables.

---

## Phase 2 · Execution & Feedback Loops
Objective: Close the loop between recommendations, execution, and continual improvement.

1. 🔄 Outcome Ingestion & Tracker
   - Canonical performance payload; worker writes to `storage/metadata/performance/{tenant}.json`.
   - CLI/Prefect task `python apps/worker/run.py <tenant> --check-performance` summarizing MAE/MAPE & lift.
2. 🔄 Calibration & Drift Monitoring
   - Quantile coverage service (`apps/model/feedback/calibration.py`) + `/calibration` dashboard.
   - Drift heuristics (feature importance/PSI) with context tags & alerts.
3. 🔄 Manual Retraining Playbook
   - Prefect flow for retraining with shadow evaluation before promotion.
   - Artifact storage & runbook updates; metrics `model.retrain.summary`.
4. 🛤️ Alerting & Rollback
   - Weather forecast change alerts, ROAS drop notifications, rollback/undo support.
5. 🛤️ Forecast uncertainty management
   - Scale predictive intervals by horizon variance; raise alerts when calibration bands miss targets.

Dependencies: Phase 0 confidence metrics; Phase 1 onboarding surfaces for alerts.

Exit criteria: Operators can verify outcomes, understand calibration, trigger retraining, receive alerts on anomalies, and trust published uncertainty bands.

---

## Phase 3 · Connector Platform & Data Ingestion
Objective: Make connecting new data sources fast, safe, and observable.

1. 🔄 SDK & Registry (Milestone A/B)
   - `make connector-skeleton`; migrate Shopify/Meta/Google to `ConnectorPlugin`.
   - Manifest registry feeding onboarding; harness support for SDK plugins.
2. 🔄 Guided Onboarding (Milestone C)
   - Connector gallery, credential flows, success/failure telemetry.
3. 🛤️ Taxonomy & Relevance (Milestone D)
   - Rules-based intent tagging, connector health metrics, overlap detection.
4. 🛤️ Connector Expansion
   - Klaviyo flows, backfill tooling, Google Analytics ingestion, prioritized new connectors.
5. 🛤️ Data Quality Telemetry
   - Freshness/anomaly alerts for each connector; surface in data-quality dashboard.

Exit criteria: Adding a new connector is a template-driven exercise with onboarding UI, telemetry, and harness coverage.

---

## Phase 4 · Modeling & Feature Store Excellence
Objective: Upgrade models from placeholder heuristics to production-grade intelligence.

1. 🔄 Time-series & Gradient Boosting
   - Replace OLS with LightGBM/pyGAM; enforce blocked time splits per ADR-01.
   - Expand weather feature engineering (seasonality, humidity, UV, wind, pollen, lagged anomalies, event flags).
2. 🛤️ Media Mix & Causal Inference
   - Integrate Robyn/LightweightMMM (adstock + saturation) and DoWhy/EconML pipelines; retire correlation-based elasticity placeholders.
   - Build a unified marketing exposure warehouse (channel spend, impressions, pacing, creative/placement tags, plan-vs-actual adoption) so MMM sees the allocator as both input and output.
   - Ingest pricing, promotion, inventory, margin, and supply-side signals; stitch product taxonomy + weather affinity metadata required for causal controls.
   - Capture external context (forecast error, severe weather alerts, holidays, macro indices, competitor share-of-voice) and surface coverage gaps in data-quality telemetry.
   - Track owner-level ingestion work in `docs/MODELING_SIGNAL_GAP_ACTIONS.md` to keep catalog gaps aligned with roadmap execution.
   - Define supported modeling grains (product/category × geo) with selectors in the feature store + training jobs so demo scope matches production.
   - Replace static weather multipliers with data-driven channel/weather interaction coefficients derived from MMM or causal experiments.
   - Persist plan adoption vs executed spend to enable automation feedback loops and causal audits.
   - Automatically detect promotions, coupons, discounts, and lifecycle campaigns from Shopify, ad platforms, Klaviyo, and related connectors so they become first-class causal controls.
   - Ship causal validation playbooks (pre/post, holdouts, IVs) that make automation lift auditable for customers and internal reviewers.
   - Automate brand demo planning (dataset sniffing → minimal scope recommendation) so Autopilot can deliver tenant-specific proofs with negligible manual setup.
   - Backtesting + odds ratios exposed in tracker UI with documented assumptions.
3. 🛤️ Explainability Infrastructure
   - SHAP importances, counterfactual insights; surface explanations in plan UI.
4. 🛤️ Geo heterogeneity & spatial awareness
   - Cluster climates and train region-specific models; add spatial smoothing to respect geographic response differences.
5. 🛤️ Automated retrain (future)
   - Promote manual playbook to scheduled automation once telemetry & guardrails mature.

Exit criteria: Model stack delivers validated lift, explanations, and robust feature coverage per tenant.

---

## Phase 5 · Allocation Automation & Decision Ops
Objective: Move from recommendations to end-to-end campaign execution and collaboration.

1. 🛤️ Campaign Creation & Creative Guidance
   - Campaign generation APIs (Meta/Google) with creative suggestions & targeting exports.
2. 🛤️ Collaboration & Approvals
   - Approval workflows, comments/annotations, role-based dashboards, scheduled reports, Slack/Teams notifications.
3. 🛤️ Execution Monitoring & Rollback
   - Performance comparison UI, forecast-change alerts, undo/rollback capabilities.
4. 🛤️ Creative Intelligence Enhancements
   - Weather-driven creative inspiration board with brand guard compliance checks.
   - Creative scoring rubric (story, imagery, compliance) + executive-ready narrative summaries.
5. 🛤️ Ad Platform Command & Safety Rails
   - Meta Marketing API + sandbox executor with credential vaulting.
   - Google Ads API integration (campaign create/update, shared budgets, spend reconciliation).
   - Dry-run diff visualizer, automated rollback, and alerting when performance regresses.
6. 🛤️ Automation Feedback & Policy Learning
   - Collect plan adoption telemetry (recommended vs executed spend) and surface causal audit dashboards before enabling pushes.
   - Replace synthetic RL shocks with replay data from real tenants; calibrate policy variants against empirical guardrail breaches.
   - Ship an automation audit log with pre/post metrics so Autopilot rollout has measurable lift evidence.
   - Deliver Autopilot-operated demo flows (synthetic fallback + brand-connected proof) so prospects experience WeatherVane with minimal human facilitation.
7. 🛤️ Trust & Governance Experience
   - Productise guardrail overrides, approval flows, and rollback UX so operators can supervise Autopilot actions with confidence.
   - Model operational constraints (inventory, fulfilment, promo conflicts) in recommendations and surface clashes proactively.
   - Map the customer lifecycle (onboarding → pilot → production) with executive-ready status, renewal metrics, and stakeholder comms.

Dependencies: Phases 2 & 4 deliver reliable metrics and model insights.

---

## Phase 6 · Observability & Reliability
1. 🔄 CI/CD hardening, branch protections, tagged releases.
2. 🔄 Unified telemetry (metrics/logs/traces) into dashboards; on-call runbooks updated.
3. 🛤️ Data quality dashboards (freshness, anomalies, nulls, schema drift).
4. 🛤️ Load & cost benchmarking; tenant isolation policies; caching strategy (Redis) + documentation.
5. 🛤️ Chaos drills & resilience playbook (latency fault injection, disaster recovery runbooks).

---

## Phase 7 · Security, Privacy & Compliance
1. 🔄 Vault migration, API authentication, rate limiting, token rotation.
2. 🔄 Privacy webhooks, DPA/privacy policy, GDPR/CCPA documentation, data residency options.
3. 🛤️ Pen tests, SOC2 evidence checklist, encryption at rest documentation.

---

## Phase 8 · Interoperability & Ecosystem
1. 🔄 API & Webhooks
   - OpenAPI spec, client SDKs (@weathervane/client, weathervane-python), webhook guide with payloads.
2. 🔄 BI & Warehouse Integrations
   - CSV/Excel/PPT exports, BigQuery/Snowflake/Redshift sync, data catalog API.
3. 🛤️ Workflow Integrations
   - Zapier/Make triggers, reverse ETL, GitHub Actions automation, Salesforce/HubSpot and analytics connectors.

---

## Phase 9 · Frontend Polish & Accessibility
1. 🔄 Accessibility audit (WCAG AA), keyboard navigation, aria labels, reduced motion, theme toggle.
2. 🔄 Mobile responsiveness, skeleton loaders, error boundaries, internationalization framework.
3. 🛤️ Design system deep dive (tokens, iconography, motion guidelines, component docs).
4. 🛤️ Award-winning visual language
   - Commission motion/illustration guidelines; ensure layouts meet world-class design benchmarks (Awwwards, Lovie).
   - Implement dynamic theming and storytelling templates (executive dashboards, brand customisations).

---

## Phase 10 · Business & Strategy Enablement
1. ❗ Pricing & Packaging
   - Define tiers in `docs/PRICING.md`, implement billing/metering.
2. 🛤️ Competitive Differentiation
   - `docs/COMPETITIVE_ANALYSIS.md`, case studies proving weather lift.
3. 🛤️ Long-Term Vision
   - `docs/VISION.md` outlining multi-vertical expansion, creative optimization, supply-chain tie-ins.

---

## Phase 11 · Resource-Aware Intelligence & Personalisation
Objective: Guarantee WeatherVane runs lean on constrained hardware (e.g., M1 Mac mini) while scaling seamlessly to heavier infra.

1. 🔄 Hardware & capability detection
   - Runtime probe to detect CPU/GPU/RAM and select the appropriate execution path.
   - Maintain device profiles (M1, cloud GPU, edge VM) with default batch sizes and concurrency limits.
   - ✅ Local hardware probe now records structured profiles in `state/device_profiles.json` (CPU, memory, accelerators, recommended batch sizing).
2. 🔄 Adaptive scheduling & quotas
   - Work scheduler that staggers heavy tasks (model retrain, calibration, ingest) based on detected capacity.
   - Idle/off-peak windows for expensive simulations; optional cloud burst hooks when capacity is available.
3. 🛤️ Degraded-mode UX & model fallbacks
   - Lightweight heuristics/mini models for low-resource environments; cache reuse across tenants.
   - Gradual feature elevation when more compute is detected (e.g., enable SHAP, full MMM only on capable nodes).
4. 🛤️ Performance benchmarking & health dashboards
   - Track local resource usage, wall-clock times, and surface alerts when workloads exceed safe thresholds.
5. 🛤️ Future-ready acceleration
   - Optional connectors for external GPU runners (Modal, RunPod, AWS Batch) when high-end hardware is available—with auto reset to lean mode when those resources disappear.

Exit criteria: WeatherVane auto-detects machine capabilities, routes workloads appropriately, and provides a smooth experience on an M1 Mac mini while scaling up gracefully when more compute is present.

---

## Quick Wins (Always-On Backlog)
- CSV export buttons, webhook docs, API examples, loading skeletons, help tooltips, empty states for new tenants, sample dataset toggle.
- UX polish backlog (micro-interactions, award-level motion demos, global typography review).
- Resource-aware checklist (confirm hardware probe logs, degrade-mode smoke tests).

---

## Future Concepts (Ideation Parking Lot)
- Autonomous budget allocation with RL shadow mode.
- Weather-driven creative generation (Ad-Kits) and inventory-aware planning.
- Data marketplace & partner portal.
- Weather derivatives / revenue hedging products.
- Advanced storytelling map overlays (animated) once telemetry proves stable.
