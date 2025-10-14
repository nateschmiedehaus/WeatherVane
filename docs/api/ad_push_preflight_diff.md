# Ad Push Preflight Diff API & Worker Design

## Problem Statement
WeatherVane’s Assist and Autopilot modes must prove that an outbound “ad push” is safe _before_ the platform mutates live campaigns. Today recommendations surface suggested spend and targeting deltas, but we lack:

- A deterministic diff that reconciles proposed changes against the live ad graph (campaign → ad set → creative → ad).
- Guardrail validation (budget caps, ROAS/CPA limits, change windows, compliance notes) attached to every proposed mutation.
- A preflight artifact the UI can render and an audit log can persist, including forecasted impact deltas and risk callouts.

Task **T5.3.1** moves us toward production automation by introducing an API façade and worker routine that build those diffs, expose them to the UI, and persist an artifact (`state/ad_push_diffs.json`) for Autopilot review.

## Scope
- **In scope**
  - Diffing proposed pushes against current platform state for Meta and Google Ads (others extend via the same contract).
  - Computing field-level change summaries grouped the way the Assist diff drawer renders them (Spend, Audience, Creative, Delivery).
  - Guardrail validation leveraging `AutomationSettings.guardrails`.
  - Persisting structured diff payloads for API delivery and local artifact capture.
  - REST endpoints for fetching the latest diff and requesting new dry-runs.
- **Out of scope (follow-up tasks)**
  - Scheduler/orchestrator integration for recurring preflight runs.
  - UI wiring (Next.js) and screenshot updates.
  - Live push execution / rollback (T5.3.2).

## Architecture Overview
```
Plan (allocator) → Proposed Push Bundle (JSON)
      │
      ▼
Preflight Worker (apps/worker/preflight/ad_push.py)
  1. Loads tenant automation settings + guardrails
  2. Queries current campaign/adset/creative state via shared connectors
  3. Normalises proposed payloads (shared.diffs.ad_push.NormalisedNode)
  4. Runs diff engine to produce AdPushDiff document
  5. Validates guardrails + impact metrics
  6. Persists results:
        - Durable store (Postgres table `ad_push_preflights`)
        - JSON artifact (`state/ad_push_diffs.json`) for Autopilot
        - Emits event → notify API of refresh (future)
      │
      ▼
FastAPI (`apps/api/routes/ad_push.py`)
  - `GET /tenants/{tenant_id}/ad-pushes/latest` → latest AdPushDiffResponse
  - `GET /tenants/{tenant_id}/ad-pushes/{run_id}` → historical diff
  - `POST /tenants/{tenant_id}/ad-pushes/dry-run` → enqueue worker run (deferred execution)
  - Backed by AdPushDiffService + Repository
      │
      ▼
Next.js Automations diff drawer (Assist / Autopilot approvals)
```

## Diff Semantics
- **Entity graph**: `campaign` → `ad_set` → `ad` (+ `creative` where applicable). Each node can be created, updated, or skipped.
- **Baseline snapshot**: Resolved by calling platform connectors (Meta/Google) using IDs present in the proposed bundle. For new entities, baseline is `null`.
- **Proposed snapshot**: Supplied by allocator/autopilot recommendations. The worker normalises the payload into strongly typed specs (`CampaignSpec`, `AdSetSpec`, etc.).
- **Sections** map to UI tabs:
  - **Spend**: budget, bids, scheduling, pacing.
  - **Audience**: geo, demographic, placements, exclusions.
  - **Creative**: copy, assets, templates, destination URLs.
  - **Delivery & Guardrails**: status flips, frequency caps, eligible windows, policy annotations.
- **Field change**: contains `field_path`, `label`, `before`, `after`, numeric deltas (`absolute`, `percentage`), `unit`, and optional `forecast_delta` (revenue / conversions) sourced from feature store uplift estimates.
- **Impact rollups**: per-entity + per-section summaries to feed UI sparklines and total delta badges.

## Data Model
Introduce Pydantic schemas under `apps/api/schemas/ad_push.py` (names subject to refinement during implementation):

```python
class AdPushMetric(APIModel):
    name: str
    unit: Literal["usd", "impressions", "clicks", "conversions", "roas"]
# ... additional fields omitted for brevity

class GuardrailBreach(APIModel):
    code: str
    severity: Literal["warning", "critical"]
    message: str
    limit: float | None = None
    observed: float | None = None

class FieldChange(APIModel):
    field_path: str  # e.g. "ad_set.daily_budget"
    label: str       # human-readable ("Daily budget")
    before: Any | None
    after: Any | None
    delta: float | None = None
    percent_delta: float | None = None
    unit: str | None = None
    forecast_delta: dict[str, float] | None = None  # {"revenue": 1250.0, "conversions": 23}
    guardrails: list[GuardrailBreach] = Field(default_factory=list)

class SectionDiff(APIModel):
    section: Literal["spend", "audience", "creative", "delivery"]
    summary: list[AdPushMetric]
    changes: list[FieldChange]

class EntityDiff(APIModel):
    entity_type: Literal["campaign", "ad_set", "ad", "creative"]
    entity_id: str | None
    name: str | None
    change_type: Literal["create", "update", "delete", "noop"]
    sections: list[SectionDiff]
    guardrails: list[GuardrailBreach]

class AdPushDiffResponse(APIModel):
    run_id: str
    tenant_id: str
    generation_mode: Literal["assist", "autopilot", "manual"]
    generated_at: datetime
    window_start: datetime | None
    window_end: datetime | None
    summary: list[AdPushMetric]
    entities: list[EntityDiff]
    guardrails: list[GuardrailBreach]
    notes: list[str]
    source_plan_id: str | None
```

### Artifact Contract
`state/ad_push_diffs.json` stores an array of `AdPushDiffResponse` (latest run first). Implementation will downsample to a single latest record for Autopilot if the file grows large. The artifact should match the API contract so QA can diff the JSON directly.

## Worker Preflight Script (`apps/worker/preflight/ad_push.py`)
Responsibilities:
1. **Load input**: `tenant_id`, `plan_run_id`, `proposed_actions_path` (JSON exported by allocator). Accept CLI args + environment overrides for local dry-runs.
2. **Resolve settings**: `AutomationRepository.fetch_policy` (existing) to hydrate guardrail thresholds.
3. **Fetch baseline**:
   - Use `shared.libs.connectors.meta_marketing.MetaMarketingClient` and `google_ads.GoogleAdsService` abstractions.
   - Batch reads, default field sets tuned to diff sections (budget, targeting, creative specs).
   - Cache responses per run to avoid rate limit hits.
4. **Normalise proposals**: Convert incoming JSON into `NormalisedNode` dataclasses (new module under `shared/libs/diffs/ad_push.py`). Validate schema using JSON Schema derived from marketing specs.
5. **Diff computation**:
   - Field-level comparisons via typed rules (e.g., budgets compare numeric, placements compare sets).
   - Guardrail evaluation (budget delta %, spend floors, ROAS/CPA predictions). Flag severity using automation settings.
   - Forecast deltas by piping proposed vs baseline spends into uplift estimates (existing `shared.feature_store.reports` + allocator response metadata).
6. **Persist**:
   - Write JSON to durable repository (`storage/metadata/ad_push_preflight/{tenant_id}/{run_id}.json`) for API ingestion.
   - Append latest diff to `state/ad_push_diffs.json`.
   - (Future) Publish `automation.ad_push.preflight.completed` event via webhook publisher.
7. **Exit codes**:
   - `0` success (even if guardrails warn; warnings encoded in payload).
   - Non-zero for structural failures (missing baseline, malformed proposal, connector auth issue). These map to Autopilot blockers.

## Shared Diff Module (`shared/libs/diffs/ad_push.py`)
Key components:
- `class NormalisedNode(enum.Enum)` for entity types.
- Dataclasses `CampaignNode`, `AdSetNode`, `AdNode`, `CreativeNode` with canonical fields.
- Registry of `FieldDiffRule` objects describing comparison behaviour (numeric, categorical, set, JSON blob).
- Guardrail evaluator functions (budget delta %, ROAS floor) returning `GuardrailBreach`.
- Helper to aggregate metrics (spend delta totals, incremental revenue).
- Serialization helpers to emit Pydantic-friendly dicts.

This module is intentionally platform-agnostic; connector-specific adapters live in `shared/libs/connectors/<platform>_adapter.py` (new) to map native payloads → normalised nodes.

## API Surface (`apps/api/routes/ad_push.py`)
- `GET /tenants/{tenant_id}/ad-pushes/latest` → returns the most recent diff for tenant.
- `GET /tenants/{tenant_id}/ad-pushes/{run_id}` → fetch diff by run identifier.
- `POST /tenants/{tenant_id}/ad-pushes/dry-run`
  - Request payload: `{ "plan_run_id": "...", "mode": "assist" | "autopilot", "proposed_actions": {...} }`.
  - Behaviour: enqueue worker job via Prefect `ad_push_preflight_flow` (new flow). Returns 202 with `run_id`.
- Authentication + rate limiting follow existing automation routes (dependency injection via `AutomationService`).
- Responses reuse `AdPushDiffResponse`.

### Service Layer
- `AdPushDiffService` orchestrates repository lookup, guardrail summarisation, and platform metadata hydration.
- Repository backed by new table `automation_preflights` (columns: `id`, `tenant_id`, `run_id`, `mode`, `status`, `payload`, `generated_at`, `plan_run_id`, `notes`, `created_at`, `updated_at`). For design, emphasise JSONB `payload`.
- Async DB model added under `apps/api/db/models.py`.

## Testing & Observability
- **Unit tests**:
  - Diff rules per entity type (fixtures for baseline/proposed combos).
  - Guardrail evaluator edge cases (threshold boundaries, missing data).
  - Pydantic validation of sample diff payload.
- **Worker integration test** (`tests/worker/test_ad_push_preflight.py`):
  - Mocks connectors to return baseline fixtures (Meta/Google).
  - Runs CLI entrypoint, asserts artifact generated + guardrails captured.
- **API tests** (`tests/api/test_ad_push_routes.py`):
  - `GET` happy path + missing run (404).
  - `POST` enqueues flow, returns accepted.
- **Observability**:
  - Log diff summary metrics (spend delta, new entities count, guardrail severity).
  - Emit Prometheus counters: `preflight_runs_total{mode=,status=}`.
  - Structured logging for guardrail breaches to power alerting.

## Open Questions / Follow-Ups
1. **Plan integration**: Should allocator emit normalized ad payloads directly? If not, we’ll add a translation layer in worker.
2. **Creative asset diffs**: For binary assets we cannot embed, we should reference asset IDs + thumbnails (requires CDN integration).
3. **Large account pagination**: Long-term, diff should stream results; initial version can limit to entities referenced by proposals.
4. **Rollback linkage** (T5.3.2): Need to persist a reversible manifest (baseline snapshot) for automation rollback.
5. **Cross-platform guardrails**: Multi-platform pushes may need aggregate guardrails (total account spend). Document as extension.

With this design, subsequent tasks can implement the shared diff library, worker script, and API routes with a clear contract that aligns with the Automations UX and Autopilot QA requirements.
