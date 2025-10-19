"""Helpers for surfacing WeatherOps dashboard telemetry to worker consumers."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from shared.observability import metrics
from shared.schemas.dashboard import (
    DashboardSuggestionTelemetry,
    DashboardSuggestionTelemetrySummary,
)
from shared.services.dashboard_analytics_ingestion import (
    DashboardSuggestionAggregate,
    aggregate_dashboard_suggestion_metrics,
    load_dashboard_suggestion_metrics,
)
from shared.services.dashboard_analytics_summary import summarize_dashboard_suggestion_telemetry

_METRICS_FILE = "metrics.jsonl"


def _resolve_metrics_file(run_directory: Path | None) -> Path:
    """Determine the metrics.jsonl path for a given run directory."""

    if run_directory is not None:
        if run_directory.is_file():
            return run_directory
        return run_directory / _METRICS_FILE
    return metrics.get_run_directory() / _METRICS_FILE


def _aggregate_to_telemetry(
    aggregates: Iterable[DashboardSuggestionAggregate],
) -> list[DashboardSuggestionTelemetry]:
    """Convert suggestion aggregates into API-aligned telemetry models."""

    telemetry: list[DashboardSuggestionTelemetry] = []
    for aggregate in aggregates:
        payload = aggregate.to_dict()
        telemetry.append(DashboardSuggestionTelemetry.model_validate(payload))
    return telemetry


def _normalise_since(since: datetime) -> datetime:
    if since.tzinfo is None:
        return since.replace(tzinfo=timezone.utc)
    return since.astimezone(timezone.utc)


def _is_recent(entry: DashboardSuggestionTelemetry, threshold: datetime) -> bool:
    checkpoints = (entry.last_occurred_at, entry.first_occurred_at)
    for candidate in checkpoints:
        if candidate is None:
            continue
        if candidate.tzinfo is None:
            candidate = candidate.replace(tzinfo=timezone.utc)
        else:
            candidate = candidate.astimezone(timezone.utc)
        if candidate >= threshold:
            return True
    return False


def load_suggestion_telemetry(
    run_directory: Path | None = None,
    *,
    tenant_id: str | None = None,
    since: datetime | None = None,
) -> list[DashboardSuggestionTelemetry]:
    """Load aggregated suggestion telemetry for the active metrics run.

    Parameters
    ----------
    run_directory:
        Optional run directory override. When omitted the globally configured
        metrics run directory is used.

    tenant_id:
        Optional tenant filter. When provided the aggregated telemetry only
        includes signatures observed for the requested tenant.

    since:
        Optional timestamp filter. When provided only entries that last (or
        first) occurred at or after this threshold are returned. Naive
        datetimes are assumed to be UTC.

    Returns
    -------
    list[DashboardSuggestionTelemetry]
        Telemetry entries ordered by most recent occurrence, matching the API
        contract used by WeatherOps UI and notebooks.
    """

    metrics_file = _resolve_metrics_file(run_directory)
    if not metrics_file.exists():
        return []

    records = load_dashboard_suggestion_metrics(metrics_file)
    if not records:
        return []

    if tenant_id:
        records = [record for record in records if record.tenant_id == tenant_id]
        if not records:
            return []

    aggregates = aggregate_dashboard_suggestion_metrics(records)
    if tenant_id:
        aggregates = [
            aggregate
            for aggregate in aggregates
            if tenant_id in aggregate.tenants
        ]

    telemetry = _aggregate_to_telemetry(aggregates)
    if since is not None:
        cutoff = _normalise_since(since)
        telemetry = [entry for entry in telemetry if _is_recent(entry, cutoff)]
    return telemetry


def load_suggestion_telemetry_with_summary(
    run_directory: Path | None = None,
    *,
    tenant_id: str | None = None,
    since: datetime | None = None,
) -> tuple[list[DashboardSuggestionTelemetry], DashboardSuggestionTelemetrySummary]:
    """Load suggestion telemetry alongside an aggregate summary.

    This helper keeps worker notebooks aligned with the API contract by
    returning the same aggregate rate fields that power the dashboard.
    """

    telemetry = load_suggestion_telemetry(
        run_directory,
        tenant_id=tenant_id,
        since=since,
    )
    summary = summarize_dashboard_suggestion_telemetry(telemetry)
    return telemetry, summary


__all__ = ["load_suggestion_telemetry", "load_suggestion_telemetry_with_summary"]
