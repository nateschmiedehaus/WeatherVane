# Demo Onboarding Wiring Plan
**Updated:** 2025-10-15  
**Authoring Crew:** WeatherVane super-team (Product · Eng · Design)

---

## Why This Plan Exists
- The demo tour drawer now renders connector progress bars and automation audit previews via `apps/web/src/demo/onboarding.ts`, but the data is static.
- Exec review exit criteria for **T11.2.2** require demonstrating a credible bridge from demo storytelling to live setup progress, including guardrail evidence.
- We need a traced, incremental path for swapping the static builders with live API responses once services mature, without breaking the demo-only fallback.

---

## Goals & Success Metrics
- **Single source of truth:** Connector + automation audit states come from the API, even in demo mode (with deterministic seeds).
- **Progress continuity:** When a visitor finishes the tour, the Plan empty state shows the same connector states and the Automations page shows matching guardrail logs.
- **Telemetry coverage:** Every transition (demo → live, connector updates, audit approvals) emits analytics events that feed exec review evidence.
- **Failure resilience:** When real APIs are unavailable, the UI gracefully falls back to seeded demo data and logs a telemetry warning.

---

## Current State Audit

| Surface | Implementation | Gaps |
|---------|----------------|------|
| DemoTourDrawer | `buildConnectorProgress` + `buildAutomationAuditPreview` (static builders) | No API wiring, no tenant awareness, no telemetry hooks |
| Plan empty state | Static checklist in `apps/web/src/pages/plan.tsx` | Not aware of demo preferences or API status |
| Automations page | Demo audit list seeded via local builders | No persistence, lacks approval metadata |
| API layer | No connector-progress or automation-audit endpoints | Needs aggregation of ingestion + guardrail data |

---

## Proposed Architecture

```
┌──────────────┐      ┌─────────────────────┐      ┌──────────────────────┐
│ Front-end    │◀────▶│ API Aggregator      │◀────▶│ Data Sources         │
│ (Next.js)    │      │ (FastAPI service)   │      │ (connectors, audits) │
└──────────────┘      └─────────────────────┘      └──────────────────────┘
       │                        │                            │
       ├─ GET /onboarding-demo  ├─ shared.services.connector_statuses fetches per-connector state
       │                        ├─ shared.services.audit_events pulls latest automation approvals
       └─ POST /onboarding-demo │  │
         (telemetry)            └─ Aggregates + shapes response for UI consumption
```

- **API Aggregator:** New FastAPI route (`apps/api/routes/onboarding.py`) exposes:
  - `GET /onboarding/progress?tenant_id=...&mode=demo|live` → returns connector progress + audit preview payloads.
  - `POST /onboarding/events` → records analytics + health flags.
- **Shared services:** Introduce `shared.services.onboarding_progress` with helpers to:
  - Query connector readiness from ingestion metadata (`shared.libs.connectors.registry`).
  - Read automation audit events from existing storage (`shared.libs.storage.JsonStateStore` fallback).
- **Front-end integration:** New hook `useOnboardingProgress` fetches data, merges with demo seeds when `mode=demo`, and feeds the drawer + plan + automations surfaces.

---

## Front-End Implementation Plan

1. **Shared Hook & Context**
   - Create `apps/web/src/hooks/useOnboardingProgress.ts` returning `{ connectors, audits, loading, error }`.
   - Persist latest payload in `useDemo` state so `/plan` and `/automations` reuse identical data.
   - Inject instrumentation (`analytics.track("onboarding_progress_viewed", …)`).

2. **DemoTourDrawer**
   - Replace calls to `buildConnectorProgress`/`buildAutomationAuditPreview` with hook data.
   - Maintain deterministic fallback by calling builders when the hook errors or returns empty.
   - Emit `cta=start_connector_setup` when user launches live plan.

3. **Plan Empty State**
   - Wire progress cards to hook data; highlight action-needed items with the same copy as the drawer.
   - Offer deep links: `/connectors/<slug>` (future stub) or mailto fallback.

4. **Automations Page**
   - Feed guardrail audit list from hook data; show mode-specific copy from payload metadata.
   - Add badge for “Demo proof” vs “Live proof” for clarity during audits.

---

## Back-End Implementation Plan

1. **Route Skeleton**
   - Add `apps/api/routes/onboarding.py` with router registration in `apps/api/routes/__init__.py`.
   - Define schemas in `apps/api/schemas/onboarding.py`.

2. **Connector Progress Service**
   - New module `shared/services/onboarding/progress.py` (async) reading:
     - Connector registry for status, OAuth, and last-ingest metrics.
     - Ingestion metadata tables (Postgres or state store) for progress percentages.
   - Provide deterministic mock (`get_demo_progress`) for demo tenants.

3. **Automation Audit Service**
   - Module `shared/services/onboarding/audit.py` to gather:
     - Recent approvals/denials from guardrail audit logs.
     - Guardrail simulation snapshots (`experiments/rl/shadow_mode.json`).
   - Provide summarised payload with safety headlines + timestamps.

4. **Telemetry Sink**
   - Route `POST /onboarding/events` writing to `shared.libs.observability.telemetry`.
   - Capture fallbacks (“demo fallback due to connector service error”) for exec review.

---

## Data Contract Sketch

```json
{
  "tenant_id": "demo-tenant",
  "mode": "demo",
  "connectors": [
    {
      "slug": "meta-primary",
      "label": "Meta Ads",
      "status": "ready",
      "progress": 100,
      "summary": "Advantage+ budgets mapped …",
      "action": null,
      "updated_at": "2025-10-15T03:10:00Z"
    }
  ],
  "audits": [
    {
      "id": "audit-1",
      "status": "approved",
      "headline": "Autopilot executed Meta ramp",
      "detail": "Budgets rebalanced +12% …",
      "actor": "Autopilot engine",
      "occurred_at": "2025-10-15T03:08:00Z"
    }
  ]
}
```

---

## Phased Delivery

1. **Phase A – API foundations (2 days)**
   - Ship FastAPI routes + shared services with deterministic demo payloads.
   - Add unit tests + fixtures under `tests/api/onboarding/test_progress.py`.
2. **Phase B – Front-end hook integration (2–3 days)**
   - Replace static builders with hook + fallback.
   - Update Plan + Automations surfaces; snapshot tests once dependencies unblock.
3. **Phase C – Live data wiring (3–5 days)**
   - Connect to real ingestion metadata + guardrail logs.
   - Add e2e smoke via `make smoke-context` covering onboarding payload.
4. **Phase D – Telemetry & analytics (1 day)**
   - Instrument events, dashboard in Looker/Mode, exec-review evidence doc.

---

## Risks & Mitigations
- **Connector metadata incomplete:** Use `JsonStateStore` fallback; flag missing fields in telemetry.
- **Automation audit latency:** Cache latest approvals in Redis/state store to avoid heavy scans.
- **Sandbox dependencies blocked:** Keep `buildConnectorProgress`/`buildAutomationAuditPreview` exported for storybook + offline mode.
- **Capability profile gating critics:** Document progress in `docs/UX_CRITIQUE.md` until critics unblock; attach API contract samples.

---

## Next Actions
1. Align with backend owners on data sources for connector readiness percentages.
2. Draft API schemas + submit PR for `apps/api/routes/onboarding.py`.
3. Prototype `useOnboardingProgress` hook with mocked fetcher while waiting on API.
4. Update `docs/UX_CRITIQUE.md` with this wiring plan reference for exec review evidence.

## Progress Log
- 2025-10-15: Front-end surfaces now consume `useOnboardingProgress` — the demo tour preview, Plan empty state, and Automations guardrail sidebar share the same connector/audit snapshot with graceful demo fallback.
- 2025-10-15: Demo tour + onboarding hook emit telemetry via `POST /onboarding/events` (`progress.requested|loaded|fallback|error`, `tour.*`) so exec review can trace demo-to-live engagement.
