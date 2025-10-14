# WeatherVane User Journeys & Personas
Last updated: 2025-10-15  
Authors: WeatherVane product, design, engineering, and data leads

## Purpose
- Codify who WeatherVane serves, what problems they bring to the product, and how the product delivers value end to end.
- Align roadmap, UX, and GTM workstreams around a shared narrative before producing information architecture and wireframes (T3.3.2–T3.3.4).
- Provide instrumentation hooks so we can prove each journey delivers value inside 30 minutes (demo) and 7 days (live data).

---

## Primary Personas

### 1. Sarah Lee — Marketing Director (Decision Maker)
- **Mandate:** Hit revenue targets while protecting ROAS; reports to the CMO.
- **Maturity:** Strategic, budget owner, light technical depth.
- **Biggest friction today:** Weather-driven swings cause mid-week scramble; agency decks arrive too late.
- **Win condition:** Confidence that WeatherVane automations stay inside guardrails and surface proof she can show the executive team.

### 2. Leo Martinez — Performance Marketing Manager (Operator)
- **Mandate:** Execute daily budget changes across Meta/Google and coordinate creatives.
- **Maturity:** Deep channel knowledge; lives inside ad consoles, spreadsheets, and Slack.
- **Biggest friction today:** Manual monitoring of weather triggers; no consolidated briefing or clear next action.
- **Win condition:** A prioritised action queue he can approve or dismiss in under 3 minutes, with shadow-mode validation before Autopilot.

### 3. Priya Desai — Data & Insights Lead (Analyst / Champion)
- **Mandate:** Validate forecasts, own marketing analytics stack, and vet new tools.
- **Maturity:** SQL/Python comfortable, steward for data governance.
- **Biggest friction today:** Limited visibility into causal impact and experiment quality; sceptical of black-box automation.
- **Win condition:** Transparent metrics (p10/p50/p90, experiment outcomes) plus the ability to export or share findings with finance.

---

## Journey Overview

| Phase | Sarah (Decision Maker) | Leo (Operator) | Priya (Analyst) | Product Surfaces | Success Signals |
| --- | --- | --- | --- | --- | --- |
| **Discover** | Spots WeatherVane via referral / landing video | Receives invite from Sarah | Pulled in to evaluate data quality | Landing hero, demo tour drawer, Loom walkthrough | Time-to-demo <30s; CTA → guided tour start rate >55% |
| **Evaluate** | Completes demo intake, scans Plan overview, inspects Automations guardrails | Clicks through seeded Plan actions, preview shadow mode | Reviews demo experiments + data coverage summary | Demo Tour (`DemoTourDrawer`), Plan demo mode, Automations timeline, Experiments proof view | Tour completion >70%; guardrail tooltip engagement; demo proof exports |
| **Activate** | Authorises at least one connector and requests stakeholder access | Runs connector checklist, ensures permissions, initiates first pipeline | Validates source mappings, checks schema coverage | Connector drawers, onboarding wizard, Plan empty-state progress tracker, ingestion telemetry | Shopify OAuth completion, ingestion progress events, first plan generation email click |
| **Adopt** | Reviews weekly briefing, approves/denies automation mode | Action queue triage, Assist approvals, monitors audit log | Analyzes experiments tab, downloads reports, configures alerts | Plan cards, Automations approval queue, Experiments page, Stories timeline | Weekly active days ≥3, Assist approval turnaround <4h, experiment share/export events |
| **Scale & Advocate** | Presents WeatherVane wins to exec staff, extends to new regions | Enables Autopilot for mature markets, sets guardrails | Implements advanced tagging, builds scenario analyses | Reports page, Automations guardrail settings, Catalog/Product Intelligence, scenario builder | Autopilot enablement event, retention of guardrail settings, advanced tagging completion, referral NPS |

---

## Detailed Journey Narratives

### A. Sarah — Strategic Decision Maker
1. **Discover:** Watches the 90-second walkthrough while demo panel loads; starts guided tour to see ROI framing before asking Leo to join.  
   _Instrumentation:_ `cta=start_tour`, `tour_step=persona_select`, `tour_complete`.
2. **Evaluate:** In demo Plan mode, focuses on the “This week’s opportunity” hero card and Automations guardrail preview to judge risk posture.  
   _Key needs:_ Plain-English confidence meters, exec-ready copy, ability to export summary.  
   _Risks:_ If guardrail proof is missing, she defers decision ⇒ ensure seeded audit trail is prominent.
3. **Activate:** Approves OAuth scopes but wants assurance on data security; expects security doc link + contact for SOC2.  
   _Product requirement:_ Inline link to `docs/security/SECURITY_AUDIT.md` snapshot + callout to Ops contact.
4. **Adopt:** Receives weekly email briefing; expects clear bullet summary + link to Plan hero view. Uses proof tab in exec meetings.  
   _Instrumentation:_ Email open/click, `plan_hero_view`, `proof_export`.
5. **Scale:** Champions Autopilot pilot once Priya validates accuracy; leverages success stories in QBR deck.  
   _Signals:_ Autopilot enable event, `success_share` telemetry, referral invites.

### B. Leo — Performance Operator
1. **Discover/Evaluate:** Sarah shares demo link; Leo cares about if recommendations map to actual campaign levers.  
   _Need:_ Quick path to action queue; ability to see creative/channel context.  
   _Instrumentation:_ `demo_action_viewed`, `action_hover`, CTA to Automations audit log.
2. **Activate:** Walks through connector checklist drawer, coordinating API credentials with Priya.  
   _Product requirement:_ Real-time status + fallback instructions; progress bar for ingestion tasks.  
   _Risks:_ OAuth failure loops; provide retry guidance + support contact.
3. **Adopt:** Uses Assist mode. Approvals should be thumb-friendly, with Slack notifications.  
   _Instrumentation:_ Assist approve/deny events, `assist_preview_time`, `shadow_mode_toggle`.  
   _Need:_ Inline diff of spend changes + simulated impact over next 72 hours.
4. **Scale:** Enables Autopilot for stable campaigns; tunes guardrails; expects audit log to prove compliance.  
   _Requirement:_ Historical timeline, exportable logs, quick switch back to Assist.  
   _Signal:_ Guardrail adjustments tracked, Autopilot rollback events near-zero.

### C. Priya — Data & Insights Lead
1. **Discover:** Join demo to vet methodology; immediately navigates to Proof/Experiments surfaces.  
   _Need:_ Transparent methodology, dataset coverage, ability to export data.  
   _Instrumentation:_ `demo_proof_open`, `coverage_panel_view`.
2. **Activate:** Validates schema mapping and ingestion completeness; expects diff vs source tables.  
   _Requirement:_ Connector drawer includes schema previews, sample records, status of geocoding.  
   _Signal:_ `schema_preview_download`, `coverage_ack`.
3. **Adopt:** Monitors experiment accuracy; configures alerts when lift deviates.  
   _Instrumentation:_ `experiment_report_export`, `alert_configured`, `dq_alert_ack`.  
   _Need:_ Notebook-ready exports (CSV/Parquet) and reproducibility statements.
4. **Scale:** Builds seasonal scenarios using Plan scenario builder; tags new products in Catalog with weather semantics.  
   _Signal:_ `scenario_saved`, `catalog_tag_created`, `api_usage_metrics`.

---

## Cross-Team Dependencies & Next Actions
- **Design:** Translate journey touchpoints into IA (T3.3.2) and hi-fi wireframes; ensure calm/aero tokens support persona-specific themes (exec vs operator views).
- **Engineering:**  
  - Implement demo state provider + seeded datasets (per `docs/ONBOARDING_DEMO_WIREFRAMES.md`).  
  - Add instrumentation events listed above to analytics SDK.  
  - Ensure plan/automation surfaces expose guardrail proof and diff summaries.
- **Data/ML:** Publish coverage + accuracy metrics (p50 vs actual) within Proof surfaces; maintain experiments backlog for Priya’s validation steps.
- **Product Ops/GTM:** Create onboarding collateral: security one-pager, ROI calculator, QBR template referencing journey KPIs.

---

## Metrics & Instrumentation Checklist
- _Time to first demo insight:_ duration from `cta=start_tour` to first `demo_action_viewed`. Target ≤90s.
- _Connector activation:_ ratio of tenants completing Shopify OAuth within 24h of invite. Target ≥60%.
- _Assist adoption:_ percentage of weekly recommendations actioned via Assist; monitor average approval latency.
- _Autopilot trust:_ number of Autopilot enablements vs rollbacks; guardrail breaches per week (should trend toward zero).
- _Proof engagement:_ exports from Experiments/Stories per active tenant; correlation with renewal likelihood.
- _Advocacy:_ NPS prompt after 30 days; track referrals triggered from success overview modal.

---

## Risks & Open Questions
- Can we support multiple personas in-product simultaneously (e.g., Sarah wants exec summary while Leo needs granular controls) without overwhelming layout?  
- Do we have enough seeded demo data variants to cover key verticals (apparel, CPG, home goods)?  
- How will restricted network environments (like ours) impact telemetry collection and offline demo states?  
- What guardrails are required before marketing shares Autopilot success publicly?

---

## Alignment Summary
- Journeys above satisfy T3.3.1 exit criteria by documenting personas, journeys, success signals, and dependencies.
- Outputs flow directly into IA + wireframe tasks and unblock exec_review gating; update `WEB_DESIGN_SYSTEM.md` once IA decisions are made.
