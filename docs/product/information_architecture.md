# WeatherVane Information Architecture
Last updated: 2025-10-15  
Authors: WeatherVane product, design, and engineering leads

## Purpose & Scope
- Translate persona journeys in `docs/product/user_journeys.md` into a navigable product architecture.
- Define the global navigation model, page hierarchy, and connective workflow patterns required for T3.3.3–T3.3.4 (note: T3.3.x is MCP-owned orchestration work; this IA briefs product consumers of those outputs).
- Provide engineering-ready guidance for routing, state management, and instrumentation so demo and live tenants stay in sync.

---

## IA Principles
- **Narrative-first:** Every surface must reinforce the Plan → Automations → Proof loop promised in marketing copy.
- **Persona-aware:** Primary navigation prioritises Operator (Leo) workflows while secondary affordances keep Decision Makers (Sarah) and Analysts (Priya) in the narrative without clutter.
- **State continuity:** Demo state, onboarding progress, and live tenant data ride the same layouts with banner-level context switches instead of separate microsites.
- **Proof within two clicks:** Any automation or recommendation carries provenance (guardrails, data coverage, experiments) no more than two interactions away.
- **Telemetry-backed decisions:** Each decision point emits analytics events so we can validate adoption targets (<30s time-to-demo, <4h Assist approvals, etc.).

---

## Global Product Shell
- **Top shell:** Calm/aero app bar with product logo, tenant switcher, notification bell, help menu (links to docs, security), and persona avatar menu.
- **Primary navigation (left rail):** `Plan`, `Automations`, `Stories`, `Reports`, `Experiments`, `Catalog`. Operator journey enters on Plan, then cascades clockwise according to daily ritual.
- **Secondary navigation (page header tabs):** Contextual filters or detail tabs (e.g., Plan → `Overview`, `Action Queue`, `Scenarios`; Automations → `Assist`, `Autopilot`, `Guardrails`; Reports → `Executive`, `Performance`, `Exports`).
- **Utility strip (right rail/drawer):** Houses activity feed, audit log, and collaboration actions; available from Plan and Automations to maintain trust cues.
- **Status banners:** Global banners communicate tenant state (`Demo`, `Live`, `Shadow Mode`) and persist across navigation; toggling state does not reload the shell.

---

## Primary Navigation Architecture

| Surface | Purpose | Primary Modules | Key Personas Served | Critical Metrics / Events |
| --- | --- | --- | --- | --- |
| Plan | Daily command center for weather-driven decisions | Hero KPI strip, Opportunity queue, 7-day outlook, Connector progress tracker, Scenario builder | Leo (Operator), Sarah (Decision Maker) | `plan_hero_view`, `action_opened`, `scenario_saved`, connector completion events |
| Automations | Manage Assist/Autopilot workflows and guardrails | Assist approvals, Change diff panel, Guardrail configuration, Audit timeline | Leo, Sarah | `assist_approve`, `assist_reject`, `autopilot_enable`, `guardrail_update`, audit exports |
| Stories | Narrative insights & campaign stories | Story cards grouped by theme, Context panel, Share to Slack/email | Sarah, Priya | `story_open`, `story_share_slack`, `story_save` |
| Reports | Executive reporting & exports | Weekly briefing, KPI trends, PDF/CSV exports, Success highlights | Sarah | `report_download`, `report_share`, `success_share` |
| Experiments | Experiment backlog & causal validation | Lift summaries, Experiment detail view, Confidence bands, Data export | Priya | `experiment_view`, `experiment_export`, `alert_configured` |
| Catalog | Product tagging & metadata governance | Product list, Tag manager, Weather coverage meters, Sync status | Priya, Leo | `catalog_tag_created`, `tag_diff_saved`, `catalog_sync_retry` |

---

## Page-Level Architecture

### Plan
- **Overview hero:** ROI framing, spend impact, weather narrative; includes CTA to weekly report and guardrail confidence.
- **Opportunity queue:** Ranked cards with quick approve/dismiss, linking into Automations diff panel; persistence across sessions.
- **7-day outlook:** Time-series + weather overlays; integrates scenario builder toggles.
- **Connector progress tracker:** Inline onboarding steps with status badges for Shopify, Meta, Google; hides once live.
- **Persona callouts:** Exec summary tile for Sarah; “Ready to push?” prompts for Leo.

### WeatherOps Dashboard
- **Suggestion banner instrumentation:** `dashboard.weather_focus.suggestion.view`, `.focus`, and `.dismiss` analytics events normalise timestamps before emission. View emission is deduplicated with a deterministic signature so impressions aren’t double-counted, and the dismiss event fires when operators clear or switch away from the suggestion to illuminate drop-off moments. We only flag `hasScheduledStart=true` when the banner carries a parseable ISO string so adoption reporting is not polluted by malformed data.
- **Suggestion telemetry ingestion:** `/v1/analytics/dashboard/suggestion-events` persists banner analytics to the metrics sink with action metadata for downstream enrichment jobs.
- **Region filters:** Analytics payloads include severity and high-risk counts for the active region, mirroring the banner summary so decision science can correlate filter usage with mitigation outcomes.

### Automations
- **Assist tab:** Pending recommendations, impact diff, inline guardrail reasons; Slack notification settings.
- **Autopilot tab:** Summary of enabled campaigns, guardrail compliance chart, quick disable button.
- **Guardrails tab:** Form for spend limits, alert thresholds, escalation contacts; inline validation + preview.
- **Audit timeline drawer:** Chronological log with filters by actor, automation, outcome; export button and SOC2 link.

### Stories
- **Story grid:** Weather events grouped by theme (Heatwave, Storm, Opportunity); card contains lead, proof metrics, CTA.
- **Context panel:** Highlights affected regions/products, links back to Plan opportunities.
- **Save/share actions:** Buttons for Slack, email, PDF; instrumentation for each share.

### Reports
- **Executive briefing:** Curated summary for Sarah with ROI, budget shifts, automation performance.
- **Trend explorer:** Time-series for spend, revenue, weather indices; toggles for segments.
- **Export center:** CSV/PDF scheduler, API token link, “Send to finance” quick actions.

### Experiments
- **Backlog list:** Live/queued experiments with stage badges and guardrail status.
- **Detail view:** Lift charts, causal explainers, segment breakdown, reproducibility summary.
- **Alerts module:** Configure lift deviation or guardrail breach notifications.

### Catalog
- **Inventory table:** Products with tag status, weather coverage indicator, sync health.
- **Tag editor drawer:** Inline editing, previews of downstream automation rules.
- **Integrations strip:** Links to Shopify, Klaviyo, GCS mapping health.

---

## Cross-Surface Workflows
- **Demo → Live onboarding:** Guided tour writes to `demoState`; upon OAuth completion, Connector tracker swaps to live ingestion progress without nav change.
- **Daily action triage:** Notification → Plan opportunity → Automations diff panel → Approve/Reject → Audit log entry.
- **Exec reporting loop:** Weekly email → Reports briefing → Share success story → Plan hero updates to reflect adoption.
- **Experiment validation:** Plan opportunity flagged “Needs proof” → Experiments detail → Attach result to automation guardrail → Stories highlight win.
- **Catalog tagging:** Data quality alert → Catalog tag editor → Save diff → Automations and Plan refresh to include new segments.

---

## Instrumentation & Data Requirements
- Standardise analytics IDs: `event_category` per surface (`plan`, `automations`, etc.) and `event_action` per module (`open`, `approve`, `export`).
- Persist onboarding progress in shared context to avoid divergence between demo and live flows.
- Guardrail, automation, and scenario modules must emit audit events to `JsonStateStore` for worker reconciliation.
- Ensure offline demo state stores sample datasets under `apps/web/src/demo/` with versioning to match future hi-fi mocks.

---

## Dependencies & Next Actions
- **Design (T3.3.3 · MCP):** Translate modules above into annotated wireframes; include calm/aero motion language for state transitions.
- **Engineering:** Align routing (`apps/web/src/pages/*.tsx`) with navigation model; implement shared layout primitives for shell/banners.
- **Data/ML:** Vet experiment + coverage metrics used in Plan, Reports, Experiments to ensure consistency with `docs/EXPERIMENTS.md`.
- **Product Ops/GTM:** Prepare collateral (security one-pager, ROI calculator) linked from help menu and onboarding banners.
- **Validation:** Once modules scaffolded, run `critics_run(design_system, exec_review)` to confirm award-level polish before closing T3.3.x.

---

## Open Questions
- Do we surface Assist approvals inside notifications center or keep them scoped to Automations?
- Should Stories and Reports merge into a single “Narratives” surface for execs, or remain distinct for analytics depth?
- What is the responsive breakpoint behaviour for the left rail navigation on tablets/mobile during demos?
