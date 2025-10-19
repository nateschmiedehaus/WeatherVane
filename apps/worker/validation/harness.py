"""Integration smoke test helpers."""

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

from apps.worker.flows.poc_pipeline import orchestrate_poc_flow, DEFAULT_LOOKBACK_DAYS
from apps.worker.maintenance.retention import run_retention_sweep
from apps.worker.reporting.dashboard import load_suggestion_telemetry_with_summary
from shared.observability import metrics
from shared.schemas.dashboard import DashboardSuggestionTelemetry, DashboardSuggestionTelemetrySummary


@dataclass
class SmokeTestSummary:
    plan_status: str
    geocoding_status: str
    sources: Dict[str, Any]
    tags: list[str]
    ads_rows: Dict[str, int]
    shopify_rows: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "plan_status": self.plan_status,
            "geocoding_status": self.geocoding_status,
            "sources": self.sources,
            "tags": self.tags,
            "ads_rows": self.ads_rows,
            "shopify_rows": self.shopify_rows,
        }


@dataclass
class HarnessArtifacts:
    summary: SmokeTestSummary
    raw: Dict[str, Any]
    run_directory: Path
    retention_summary: Dict[str, Any] | None = None
    suggestion_telemetry: list[DashboardSuggestionTelemetry] = field(default_factory=list)
    suggestion_telemetry_summary: DashboardSuggestionTelemetrySummary | None = None


async def run_smoke_test(
    tenant_id: str,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> SmokeTestSummary:
    result = await run_ingest_to_plan_harness(
        tenant_id,
        start_date=start_date,
        end_date=end_date,
        metrics_tags={"harness": "smoke"},
    )
    return result.summary


async def run_ingest_to_plan_harness(
    tenant_id: str,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    *,
    metrics_tags: Optional[Mapping[str, str]] = None,
    run_retention: bool = False,
    retention_days: int | None = None,
) -> HarnessArtifacts:
    if end_date is None:
        end_date = datetime.utcnow()
    if start_date is None:
        start_date = end_date - timedelta(days=DEFAULT_LOOKBACK_DAYS)

    started_at = datetime.utcnow()

    raw = await orchestrate_poc_flow(
        tenant_id=tenant_id,
        start_date=start_date,
        end_date=end_date,
    )

    suggestion_telemetry, computed_summary = load_suggestion_telemetry_with_summary(
        tenant_id=tenant_id,
    )
    suggestion_telemetry_summary: DashboardSuggestionTelemetrySummary | None = None
    if suggestion_telemetry:
        suggestion_telemetry_summary = computed_summary
        serialized_entries = [
            entry.model_dump(mode="json") for entry in suggestion_telemetry
        ]
        raw = dict(raw)
        raw["suggestion_telemetry"] = serialized_entries
        raw["suggestion_telemetry_summary"] = suggestion_telemetry_summary.model_dump(mode="json")

    summary = _build_summary(raw)
    tags = _derive_tags(summary.sources)
    if metrics_tags:
        tags.update({key: str(value) for key, value in metrics_tags.items()})

    duration = (datetime.utcnow() - started_at).total_seconds()
    payload = {
        "tenant_id": tenant_id,
        "duration_seconds": round(duration, 3),
        "plan_status": summary.plan_status,
        "geocoding_status": summary.geocoding_status,
        "context_tags": summary.tags,
        "orders_rows": summary.shopify_rows.get("orders", 0),
        "ads_rows": {key: int(value) for key, value in summary.ads_rows.items()},
        "source_summary": summary.sources,
    }

    metrics.emit("harness.summary", payload, tags=tags)

    if suggestion_telemetry_summary:
        metrics.emit(
            "harness.suggestion_telemetry",
            suggestion_telemetry_summary.model_dump(mode="json"),
            tags=tags,
        )

    guardrails = raw.get("plan", {}).get("guardrails", {})
    if guardrails:
        numeric_guardrails = {key: float(value) for key, value in guardrails.items() if _is_number(value)}
        if numeric_guardrails:
            metrics.emit(
                "harness.guardrails",
                numeric_guardrails,
                tags=tags,
            )

    context = raw.get("context")
    if context and hasattr(context, "start_date") and hasattr(context, "end_date"):
        metrics.emit(
            "harness.window",
            {
                "start": getattr(context, "start_date").isoformat(),
                "end": getattr(context, "end_date").isoformat(),
            },
            tags=tags,
        )

    retention_summary: Dict[str, Any] | None = None
    if run_retention:
        resolved_retention_days = retention_days or int(os.getenv("HARNESS_RETENTION_DAYS", "365"))
        lake_root = os.getenv("STORAGE_LAKE_ROOT", "storage/lake/raw")
        retention_summary = run_retention_sweep(
            retention_days=resolved_retention_days,
            tenant_ids=[tenant_id],
            lake_root=lake_root,
        )
        metrics.emit(
            "harness.retention",
            {
                "tenant_id": tenant_id,
                "retention_days": resolved_retention_days,
                "removed_files": retention_summary.get("total_removed", 0),
                "timestamp": retention_summary.get("timestamp"),
            },
            tags={
                "removed": "yes" if retention_summary.get("total_removed", 0) else "no",
            },
        )

    return HarnessArtifacts(
        summary=summary,
        raw=raw,
        run_directory=metrics.get_run_directory(),
        retention_summary=retention_summary,
        suggestion_telemetry=suggestion_telemetry,
        suggestion_telemetry_summary=suggestion_telemetry_summary,
    )


def _build_summary(result: Dict[str, Any]) -> SmokeTestSummary:
    plan = result.get("plan", {})
    geocoding = result.get("geocoding_validation", {})
    data_context = result.get("data_context", {})

    return SmokeTestSummary(
        plan_status=str(plan.get("status", "UNKNOWN")),
        geocoding_status=str(geocoding.get("status", "unknown")),
        sources=dict(result.get("sources", {})),
        tags=list(data_context.get("tags", [])),
        ads_rows=dict(result.get("ads_summary", {})),
        shopify_rows=dict(result.get("shopify_summary", {})),
    )


def run_smoke_test_sync(
    tenant_id: str,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> SmokeTestSummary:
    return asyncio.run(run_smoke_test(tenant_id, start_date=start_date, end_date=end_date))


def _derive_tags(sources: Dict[str, Any]) -> Dict[str, str]:
    tags: Dict[str, str] = {}
    live_sources = any(_is_live_source(value) for value in sources.values())
    tags["mode"] = "live" if live_sources else "synthetic"
    for key, value in sources.items():
        tags[f"{key}_source"] = str(value or "unknown")
    return tags


def _is_live_source(value: Any) -> bool:
    if isinstance(value, str):
        if value.endswith("_api"):
            return True
        return value not in {"stub", "fixture", "unknown"}
    return False


def _is_number(value: Any) -> bool:
    try:
        float(value)
    except (TypeError, ValueError):
        return False
    return True
