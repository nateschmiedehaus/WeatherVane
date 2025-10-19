# WeatherVane Wireframe Blueprint
Last updated: 2025-10-16  
Authors: WeatherVane product · design · engineering

> These annotated wireframes convert the IA stack and persona journeys into screen-level guidance for T3.3.3. They document Plan, WeatherOps Dashboard, Experiments, and Reports so hi-fi mocks and implementation (T3.4.x) inherit a shared blueprint, instrumentation, and calm/aero motion cues. T3.3.x lives in the MCP orchestration lane; this doc captures product-facing implications while execution stays with MCP owners.

---

## Core Surfaces At-a-Glance

| Surface | Primary personas | Decisions this screen enables | Key telemetry |
| --- | --- | --- | --- |
| Plan Overview | Leo (Operator), Sarah (Decision Maker) | Approve/dismiss weather-driven actions, launch scenarios, monitor connector readiness | `plan.card.approve`, `plan.banner.share`, `scenario_saved`, `connector.step_complete` |
| WeatherOps Dashboard | Leo, Priya (Analyst) | Track guardrails, spend drift, ingestion health, and upcoming weather risks | `dashboard.guardrail_click`, `dashboard.alert_ack`, `dashboard.weather_focus` |
| Experiments Hub | Priya, Sarah | Review causal proof, attach experiments to automations, export evidence | `proof.detail_open`, `proof.attach_to_plan`, `experiment_export` |
| Executive Reports | Sarah, Finance stakeholders | Share executive briefing, trigger exports, highlight success stories | `report.share`, `report.schedule`, `report.story_click` |

---

## 1. Plan Overview (Operator Command Center)

#### 1.1 Layout

```
┌──────────────────────────────────────────────────────────┐
│ [1] Hero impact strip         [2] Mode & persona pills    │
│     ROI + weather chips           Live | Assist | Demo    │
├──────────────────────────────────────────────────────────┤
│ [3] Opportunity queue                                         │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │
│ │ [3a] Primary │ │ [3b] Follow  │ │ [3c] Risk    │          │
│ │ action card  │ │ up card      │ │ alert card   │          │
│ └──────────────┘ └──────────────┘ └──────────────┘          │
├──────────────────────────────────────────────────────────┤
│ [4] 7-day outlook + scenario toggles                        │
│     Heatmap, slider, and “What if?” CTA                     │
├──────────────────────────────────────────────────────────┤
│ [5] Connector tracker & persona prompts                     │
│     Shopify | Meta | Google status, Sarah call-out          │
├──────────────────────────────────────────────────────────┤
│ [6] Activity rail (audit + notifications)                   │
└──────────────────────────────────────────────────────────┘
```

#### 1.2 Callouts & Data Contracts

| Callout | Description | Data / instrumentation | Notes |
| --- | --- | --- | --- |
| [1] Hero impact strip | Weather synopsis, ROI delta, guardrail confidence meter | `plan_hero_view`, ingest ROI trend (`shared/metrics/roi_timeseries`) | Shares copy + CTA to Reports |
| [2] Mode & persona pills | Pills indicating Live/Demo + persona toggle | `plan.mode_switch`, `persona_select` | Demo persona toggle persists in local storage |
| [3a] Primary action card | Highest impact automation with approve/adjust/dismiss | `plan.card.approve`, diff payload from `experiments/allocator/*.json` | Approve opens Automations diff drawer |
| [3b] Follow-up card | Secondary opportunity (e.g., creative swap) | `plan.card.follow_up`, `story.reference_open` | Links into Stories |
| [3c] Risk alert card | Guardrail breach / spend anomaly | `plan.risk_ack`, `alert.snooze` | Acknowledgement updates Dashboard alert feed |
| [4] Outlook + scenarios | Weather outlook heatmap with scenario switches | `scenario_saved`, weather forecast API | Calls scenario builder modal for Priya |
| [5] Connector tracker | Completion steps per connector + SOC2 link | `connector.step_complete`, `connector.help_open` | Demo: seeded statuses; Live: ingestion telemetry |
| [6] Activity rail | Audit log, comments, Slack notifications | `audit.event_open`, `comment.post` | Shared component with Automations |

#### 1.3 Interaction & Instrumentation

- Approve action → `plan.card.approve` (payload includes guardrail summary + experiment ids).
- Adjust → opens scenario builder seeded with card context, emits `plan.card.adjust_open`.
- Dismiss → `plan.card.dismiss` with reason; prompts feedback toast.
- Persona toggle persists via analytics `persona_select` + `dataLayer.persona`.

#### 1.4 Modes & States

- **Demo:** Yellow banner, seeded cards (`apps/web/src/demo/plan_cards.json`), CTA to onboarding drawer.
- **Live - Assist:** Guardrail confidence meter displayed, diff drawer required before Autopilot toggle.
- **Live - Autopilot:** Opportunity queue collapses into status list; hero emphasises automation uptime.
- **Fallback:** If weather API degrades, hero shows fallback toast; logs `telemetry.warn`.

---

## 2. WeatherOps Dashboard (Daily Health)

#### 2.1 Layout

```
┌──────────────────────────────────────────────────────────┐
│ [1] Guardrail health bar     [2] Spend & revenue trackers │
├──────────────────────────────────────────────────────────┤
│ [3] Weather risk map + timeline                           │
│ ┌─────────────┐ ┌──────────────┐                          │
│ │ Map w/ zones│ │ Timeline list │                         │
│ └─────────────┘ └──────────────┘                          │
├──────────────────────────────────────────────────────────┤
│ [4] Automation uptime & incidents                         │
├──────────────────────────────────────────────────────────┤
│ [5] Ingestion telemetry + connector SLA                   │
├──────────────────────────────────────────────────────────┤
│ [6] Alert inbox & escalation shortcuts                    │
└──────────────────────────────────────────────────────────┘
```

#### 2.2 Callouts

| Callout | Description | Data / instrumentation | Notes |
| --- | --- | --- | --- |
| [1] Guardrail health | Stacked bar (budget, ROAS, CPA) | `dashboard.guardrail_click`, `state/ad_push_alerts.json` | Clicking a segment deep-links to Guardrails tab |
| [2] Spend & revenue trackers | Sparklines with p50/p90 bands | `dashboard.spend_hover`, `shared/metrics/budget_variance` | Finance export uses same dataset |
| [3] Weather risk map & timeline | Geospatial heatmap + chronological events | `dashboard.weather_focus`, `weather.alert_ack` | Mobile fallback → timeline only |
| [4] Automation uptime | Cards summarising Assist/Autopilot uptime | `dashboard.autopilot_status_view`, `autopilot_disable` | Pulls from `state/telemetry/automation_uptime.json` |
| [5] Ingestion telemetry | Table of connectors w/ current lag | `dashboard.ingestion_ack`, `ingestion.retry` | Shares component with onboarding tracker |
| [6] Alert inbox | List of newest incidents with escalation CTAs | `dashboard.alert_ack`, `alert.escalate` | Exports to Slack/email via worker |

#### 2.3 Interaction & Instrumentation

- Guardrail bar click toggles Guardrails modal (reuse from Automations) and emits `dashboard.guardrail_click`.
- Weather map selection updates timeline filter (`dashboard.weather_focus`).
- Alert acknowledge uses `alert_ack` + writes to audit log.
- “Escalate” CTA triggers worker webhook; confirm toast logs `alert.escalate`.

#### 2.4 Modes & Alerts

- **Morning Brief:** Default view with daily summary banner.
- **Incident Mode:** When guardrail breach exists, header turns warning orange with “Jump to incident” CTA.
- **Offline Mode:** If telemetry stale >30m, inject grey overlay + `telemetry.warn`.

---

## 3. Experiments Hub (Proof Center)

#### 3.1 Layout

```
┌──────────────────────────────────────────────────────────┐
│ [1] Proof hero (forecast accuracy, lift summaries)        │
├──────────────────────────────────────────────────────────┤
│ [2] Experiment backlog table                             │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│ │ Ready to ship│ │ Needs review │ │ Guardrail link│       │
│ └──────────────┘ └──────────────┘ └──────────────┘       │
├──────────────────────────────────────────────────────────┤
│ [3] Detail drawer                                        │
│  Charts, narrative, reproducibility pledge               │
├──────────────────────────────────────────────────────────┤
│ [4] Attach to surfaces footer                            │
│  Buttons: [Plan], [Automations], [Stories]               │
└──────────────────────────────────────────────────────────┘
```

#### 3.2 Callouts

| Callout | Description | Data / instrumentation | Notes |
| --- | --- | --- | --- |
| [1] Proof hero | Aggregated accuracy + top experiment badge | `proof.hero_view`, `tests/apps/test_experiments.py` dataset | Links to methodology doc |
| [2] Backlog table | Columns: status, guardrail impact, owner | `proof.row_open`, `proof.filter_change` | Filters (market, weather type) persist via query params |
| [3] Detail drawer | Tabs for Lift, Methodology, Raw data preview | `proof.detail_open`, `proof.chart_download` | “Raw data” requires Priya role |
| [4] Attach footer | Quick actions to propagate proof chips | `proof.attach_to_plan`, `proof.attach_to_guardrail`, `proof.story_seed` | Writes attachments to JSON artifacts consumed by Plan/Stories |

#### 3.3 Interaction & Instrumentation

- Backlog row expand toggles detail drawer; selection event includes experiment id + persona.
- Export CSV triggers worker job; UI shows spinner with `experiment_export`.
- “Attach to Plan” writes to `experiments/allocator/proof_links.json` and refreshes Plan queue chips.

#### 3.4 States

- **Demo:** Pre-seeded experiments (Apparel Heatwave, CPG Storm).
- **Live:** Query from experiment service; gating ensures incomplete confidence intervals flagged.
- **No data:** Empty state card with CTA to schedule experiment (links to scenario builder).

---

## 4. Executive Reports (Narrative Briefing)

#### 4.1 Layout

```
┌──────────────────────────────────────────────────────────┐
│ [1] Executive hero tiles (Revenue, ROAS, Wins)            │
│     Share buttons: [Email] [Slack] [Copy link]            │
├──────────────────────────────────────────────────────────┤
│ [2] Narrative storyline                                   │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│ │ Story card 1 │ │ Story card 2 │ │ Story card 3 │        │
│ └──────────────┘ └──────────────┘ └──────────────┘        │
├──────────────────────────────────────────────────────────┤
│ [3] Trend explorer (Spend, Weather index, Guardrails)     │
├──────────────────────────────────────────────────────────┤
│ [4] Export scheduler & recipients                         │
├──────────────────────────────────────────────────────────┤
│ [5] Success highlight + referral CTA                      │
└──────────────────────────────────────────────────────────┘
```

#### 4.2 Callouts

| Callout | Description | Data / instrumentation | Notes |
| --- | --- | --- | --- |
| [1] Executive hero | Three KPI tiles with YoY vs forecast | `report.hero_view`, `report.share` | Shares to Slack uses webhook captured in telemetry |
| [2] Narrative storyline | Cards linked to Stories feed | `report.story_click`, `story.share` | Current story pinned for 7 days |
| [3] Trend explorer | Combined chart with selectors | `report.trend_filter`, `report.trend_export` | Allows CSV download independent from scheduler |
| [4] Export scheduler | Choose format/frequency/recipients | `report.schedule`, `report.schedule_test_send` | Writes to `experiments/allocator/report_schedule.json` |
| [5] Success highlight | Social-proof copy + referral link | `report.referral_click`, `report.referral_copy` | Backs GTM pipeline |

#### 4.3 Interaction & Instrumentation

- Share buttons log persona, target channel, and include preview string for Exec Review critic.
- Scheduler requires validation before enabling save CTA; errors log `report.schedule_error`.
- Referral CTA opens modal capturing reason → `report.referral_submit`.

#### 4.4 States

- **Demo:** Uses synthetic KPI dataset with disclaimers, disables scheduler until connectors live.
- **Live Weekly:** Auto-refresh 06:00 local time; header banner shows “Last refreshed at…”.
- **Quarterly:** Adds additional tile (Enterprise view) once finance role granted.

---

## Supporting Automations & Onboarding States

These flows remain prerequisites for rendering the four core surfaces seamlessly.

### Guided Demo Finale → Connector Checklist

```
┌──────────── Demo Finale ────────────┐
│ Recap cards + guardrail proof       │
│ CTA: [Start live setup]             │
└─────────────────────────────────────┘
              │
              ▼
┌──────── Connector Drawer ──────────┐
│ Progress meter (3 steps)           │
│ Shopify ✓   Meta ●   Google ▢      │
│ Inline support + SOC2 link         │
│ CTA: [Continue →]                  │
└─────────────────────────────────────┘
```

- Telemetry: `tour.complete`, `cta=start_live_setup`, `connector.authorize.click`.
- Error slot under CTA surfaces remediation copy and logs `connector.error_view`.

### Pipeline Progress Overlay → First Plan Celebration

```
┌────────── Pipeline Progress ───────────┐
│ Step ticks + ETA chip                  │
│ CTA: [Notify me in Slack]              │
└────────────────────────────────────────┘
              │
              ▼
┌──────── Welcome Modal ─────────────┐
│ “Your plan is ready” + persona CTA │
│ [Take quick tour] [Jump to Automations] │
└────────────────────────────────────┘
```

- Telemetry: `ingestion.progress`, `plan_first_ready`, `tour.start`.
- Personas selected here pre-seed Plan view mode.

---

## Cross-Surface Journeys

- **Daily action loop:** Dashboard alert → Plan risk card → Automations diff drawer → Audit timeline.
- **Proof loop:** Plan action requests proof → Experiments attach → Reports storyline updates.
- **Onboarding loop:** Demo persona tour → Connector checklist → Dashboard ingestion pane → Plan hero.
- **Executive loop:** Reports share → Scenario saved → Plan hero updates → Referral CTA triggered.

---

## Instrumentation Schema

- Every primary CTA includes `data-analytics-id=<surface>.<action>`.
- Shared payload keys: `surface`, `action`, `persona`, `tenant_mode`, `context_id`.
- Offline demo mode logs to `state/telemetry/onboarding_events.jsonl` with severity levels.
- Guardrail proof attachments persist under `experiments/allocator/*` to unblock audits.

---

## Handoff Notes & Next Steps

- **Design:** Translate callouts into hi-fi Figma frames (12-column grid, calm motion 200 ms ease-out) and capture both light/dark calm palettes.
- **Engineering:** Stub shared layout primitives (`AppShell`, `ActivityRail`, `PersonaToggle`) and wire demo data sources listed above.
- **Data/ML:** Ensure experimentation and guardrail datasets expose the metrics invoked here (`shared/metrics` package alignment).
- **Product Ops:** Prepare SOC2 + ROI collateral linked from connector drawer and Reports referral CTA.
- **Validation:** Once capability uplift lands, rerun `critics_run(design_system, exec_review)` with updated artifacts.
