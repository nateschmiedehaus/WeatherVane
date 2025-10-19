## Dashboard Suggestion Analytics Metadata

### Purpose
- Document how WeatherOps dashboard suggestion events capture contextual metadata for downstream analytics consumers.
- Provide implementation notes so API and data teams align on payload contracts when adding new UI signals.

### Design Rationale
- We surface rich UI context (layout variant, CTA exposure, experimentation buckets) alongside the core event so the metrics sink can power localized dashboards without extra joins.
- Snapshotting the guardrail/alert posture and on-screen copy lets storytelling surfaces replay what operators saw during an incident without rehydrating multiple services.
- Metadata is optional to keep the ingestion path backwards compatible for clients that have not yet shipped the richer payload.
- Sanitizing keys (strip + non-empty) and enforcing JSON-serializable values protects the shared metrics writer from silently dropping events due to serialization errors.
- When metadata omits the deterministic suggestion signature, the API backfills a canonical value derived from the payload (region, reason, schedule, and counts) so downstream deduplication logic works for legacy clients.

### Usage
1. Include a `metadata` object inside `payload` when POSTing to `/v1/analytics/dashboard/suggestion-events`.
2. Populate keys with concise snake- or camel-cased labels; values may be strings, numbers, booleans, or nested JSON-compatible objects.
3. The ingestion layer trims key whitespace and preserves stable ordering before writing to `metrics.jsonl`.
4. Downstream jobs should rely on `payload.metadata` in the emitted record for self-serve dashboard filters.

### WeatherOps UI Metadata Envelope
- `layoutVariant` *(string)* – responsive layout rendered for the suggestion banner. We emit `dense` for desktop/tablet and `stacked` for mobile to correlate adoption with presentation density.
- `ctaShown` *(boolean)* – whether the “Focus this region” CTA was visible when the event fired. Once true for a suggestion signature it remains true across focus/dismiss telemetry so downstream funnels can attribute interactions correctly.
- `regionSlug` *(string)* – slugified region label displayed to the operator, matching the WeatherOps filter tokens.
- `signature` *(string)* – deterministic signature produced by `buildSuggestionSignature`; mirrors the dedupe key used on the client so ingestion can aggregate impressions, focuses, and dismissals.
- `suggestionSummary` *(string)* – the exact summary copy rendered in the banner. Preserving the on-screen narrative lets downstream dashboards reuse the vetted language without re-deriving copy from raw metrics.
- `regionSummary` *(string | null)* – localized region synopsis (event counts, high-risk coverage, upcoming schedule) sourced from `describeWeatherRegionGroup`. Enables analysts to slice funnels by the situational story we showed to operators.
- `tenantMode` *(string)* – indicates whether the dashboard was running in `live` or `demo` mode when the event fired. This keeps demo walkthroughs from polluting production adoption metrics.
- `guardrailStatus` *(string)* – current guardrail health (`healthy`, `watch`, or `breach`) at the moment of emission. Helps correlate suggestion engagement with incident posture.
- `criticalAlertCount` *(number)* – count of active critical alerts visible in the inbox. Downstream observers can measure whether high-alert moments drive suggestion interaction spikes.

### Edge Cases
- Blank keys, whitespace-only keys, or non-string keys reject the request with 422 to surface client bugs early.
- Non-JSON-serializable values (e.g., Python objects, datetime instances) also raise 422 to prevent corrupt records.
- When the UI lacks a synthesized region synopsis (e.g., telemetry still streaming), the client backfills `metadata.regionSummary` with the on-screen suggestion summary so storytelling dashboards never lose the operator-facing narrative.
- If `metadata` is omitted or empty, the API persists an empty object; analytics jobs can safely `get("metadata", {})`.
- The ingestion layer auto-populates `metadata.signature` when missing or blank, using the same canonical join key as the WeatherOps UI.

### Known Limitations
- Metadata is limited to values that the JSON encoder supports; binary blobs or large arrays should be stored externally and referenced via identifiers.
- We currently trim leading/trailing whitespace but do not de-duplicate semantically equivalent keys (e.g., case differences); choose canonical keys on the client.

## Downstream Ingestion
- `shared/services/dashboard_analytics_ingestion.py` provides `load_dashboard_suggestion_metrics()` so worker jobs and notebooks can hydrate canonical suggestion events directly from `metrics.jsonl`. The loader validates tenant identifiers, normalises timestamps, and backfills deterministic signatures when clients omit them.
- `aggregate_dashboard_suggestion_metrics()` rolls events up by signature, tracking view/focus/dismiss counts, participating tenants, and the latest contextual metadata. This guards against impression double-counting while keeping CTA exposure and responsive layout data intact for storytelling dashboards. The aggregate now emits `focus_rate`, `dismiss_rate`, and `engagement_rate` values using the same clamp-to-one logic as the API, so notebooks that persist `to_dict()` output stay in lockstep with the WeatherOps contract.
- `summarize_dashboard_suggestion_telemetry()` feeds the dashboard response with `top_region_summary` and `top_reason`, preserving the exact headline copy operators saw for the leading signal so the UI (and notebooks) can echo incident context without rehydrating raw timing data.
- Aggregates expose both the first and last occurrence timestamps, making it straightforward to build recency windows (e.g., “active in the past 6 hours”) without re-implementing ordering logic downstream.
- When new metadata keys ship from the UI they flow straight into the aggregate `metadata` payload—dashboards can experiment with filters immediately while longer-term modelling decides which keys deserve promotion to typed columns.

## Product Consumers
- `/v1/dashboard/{tenant}` now returns a `suggestion_telemetry` collection populated from the aggregated metrics loader. Each item preserves impression/focus/dismiss counters, guardrail posture, CTA exposure, and first/last occurrence timestamps so UI consumers can render engagement summaries without re-reading `metrics.jsonl`.
- The dashboard endpoint accepts an optional `since` query parameter (ISO 8601) to scope suggestion telemetry and summaries to fresh events, mirroring the worker loader’s recency filter so notebooks, UI cards, and downstream audits stay aligned when focusing on the latest engagement signals.
- The WeatherOps UI now calls the dashboard endpoint with a 48-hour `since` window so stale suggestion metrics disappear automatically when operators refresh the page, keeping focus on the most recent engagement signals.
- The WeatherOps dashboard surfaces the three most recent suggestion signatures, echoing the enriched metadata envelope directly in the UI to help operators connect guardrail posture, CTA exposure, and interaction mix while reviewing live weather focus recommendations.
- Derived engagement telemetry (focus, dismiss, and blended rates) is now calculated directly in the product layer, clamping to 0–100%. This protects the UI from divide-by-zero artefacts while giving operators a rapid read on conversion quality during sparse telemetry windows.
- The WeatherOps suggestion engagement banner now backfills average focus, dismiss, and engagement rates from aggregate counts when older API payloads omit the new summary fields. This keeps partially upgraded tenants aligned during phased rollouts while we finish migrating every consumer to the richer response.
- The suggestion engagement banner now highlights guardrail posture and layout density for the top-performing signature by promoting `top_guardrail_status` and `top_layout_variant` from the summary payload. Operators see the same watch/breach cues and layout experiments that downstream analytics track, keeping storytelling aligned end to end.
- The API now promotes `focus_rate`, `dismiss_rate`, and `engagement_rate` on every `DashboardSuggestionTelemetry` item. Worker notebooks and downstream storytellers can ingest rate metrics without re-implementing ratio logic, ensuring parity with the UI’s safeguards against divide-by-zero and out-of-range values.
- Worker ingest-to-plan harness runs now expose `HarnessArtifacts.suggestion_telemetry`, hydrated via `apps.worker.reporting.dashboard.load_suggestion_telemetry()`, so notebooks and downstream analyses receive the same rate-stabilised payload the API serves.
- Harness execution now emits a `harness.suggestion_telemetry` metrics event summarising aggregate focus/dismiss/engagement rates and the top-performing signature so Ops dashboards can monitor engagement health without replaying raw telemetry.
- API and worker consumers share `summarize_dashboard_suggestion_telemetry()`, which returns a typed `suggestion_telemetry_summary` payload on the dashboard response and harness artifacts. The summary fuses rate fallbacks with tenant-level impression counts and highlights the highest-engagement signature so notebooks, UI cards, and Ops metrics stay consistent without bespoke aggregation code.
- The telemetry summary also stamps the top signature with an engagement confidence level/label pair (`top_engagement_confidence_level`, `top_engagement_confidence_label`), mirroring the WeatherOps UI thresholds (60 views / 20 interactions for “High confidence”, 20 views / 6 interactions for “Directional signal”) so downstream dashboards narrate reliability with the same language operators see in product.
- The WeatherOps suggestion engagement card now pairs the per-signature list with a telemetry overview banner that surfaces total signals tracked, aggregate views/interactions, and the top signal confidence language via `buildSuggestionTelemetryOverview()`. Operators get an immediate sense of cohort health before diving into the per-signature narrative, and the banner’s confidence label matches the summary fields Ops dashboards consume.
- The suggestion engagement banner now also highlights average focus and dismiss rates straight from `suggestion_telemetry_summary`, keeping UI narratives, worker notebooks, and shared schemas aligned on the new rate fields. Fresh Vitest + API tests guard against future drift by verifying the product layer reads these summary values rather than recomputing them client-side.
- Suggestion telemetry summaries now classify high-risk alert volume into `none`, `elevated`, or `critical` severities (thresholds: ≥1 alert for elevated, ≥3 for critical). WeatherOps renders the severity as a badge beside each signature and folds the narrative copy (`Critical risk · N alerts`) into the meta rows so Ops can prioritise the riskiest regions instantly. Vitest coverage locks the thresholds and ensures downstream consumers can rely on the severity field without re-deriving it.
- The suggestion telemetry overview now promotes the computed `topHighRiskSeverity` alongside the alert count, and CSV exports emit a dedicated “Top high-risk severity” metadata row. This keeps WeatherOps copy, downstream dashboards, and audit exports aligned on the exact risk language we surface to operators once the engagement banner highlights the riskiest signature.
- Worker notebooks can now call `apps.worker.reporting.dashboard.load_suggestion_telemetry_with_summary()` to retrieve API-aligned telemetry plus the aggregate summary—including the new focus, dismiss, and engagement rates—in one hop. This avoids hand-rolled aggregation code in notebooks and ensures adoption audits always read the same rate values validated by the product suite.
