from __future__ import annotations

import json
import logging
import os
import random
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence
from zoneinfo import ZoneInfo

from apps.worker.validation.tenant_coverage import evaluate_tenant_data_coverage
from shared.data_context.service import ContextService, default_context_service
from shared.data_context.warnings import ContextWarningEngine, default_warning_engine
from shared.schemas.base import ContextWarning
from shared.schemas.dashboard import (
    AlertAcknowledgeResponse,
    AlertEscalateResponse,
    AlertSeverity,
    AllocatorDiagnostics,
    AllocatorMode,
    AllocatorRecommendation,
    AllocatorSummary,
    AutomationLane,
    AutomationLaneStatus,
    ConnectorStatus,
    DashboardAlert,
    DashboardResponse,
    DashboardSuggestionTelemetry,
    DashboardSuggestionTelemetrySummary,
    RecommendationSeverity,
    GuardrailSegment,
    GuardrailStatus,
    IngestionConnector,
    SpendTracker,
    WeatherKpi,
    WeatherKpiUnit,
    WeatherRiskEvent,
    WeatherRiskSeverity,
)
from shared.schemas.coverage import TenantCoverageSummary as CoverageSummaryModel
from shared.services.dashboard_analytics_ingestion import (
    DashboardSuggestionAggregate,
    aggregate_dashboard_suggestion_metrics,
    load_dashboard_suggestion_metrics,
)
from shared.services.dashboard_analytics_summary import summarize_dashboard_suggestion_telemetry

DEFAULT_WEATHER_GEOHASH_OVERRIDES = {
    "demo-tenant": "9q8yy",
}
DEFAULT_AUTOMATION_UPTIME = 99.1
ALLOCATOR_DIAGNOSTICS_MAX_AGE_MINUTES = 14 * 24 * 60


@dataclass(slots=True)
class _AllocatorDiagnosticsCacheEntry:
    diagnostics: AllocatorDiagnostics | None
    generated_at: datetime | None
    mtime_ns: int
    size: int


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DashboardService:
    """Surface allocator, weather, and ingestion telemetry for WeatherOps."""

    def __init__(
        self,
        *,
        seed_path: Path | None = None,
        ingestion_state_root: Path | str | None = None,
        ad_push_diff_path: Path | str | None = None,
        ad_push_alerts_path: Path | str | None = None,
        alert_ack_path: Path | str | None = None,
        weather_root: Path | str | None = None,
        suggestion_metrics_path: Path | str | None = None,
        suggestion_metrics_root: Path | str | None = None,
        allocator_report_path: Path | str | None = None,
        fallback_tenant_id: str | None = "tenant-safety",
        context_service: ContextService | None = None,
        warning_engine: ContextWarningEngine | None = None,
        weather_geohash_overrides: dict[str, str] | None = None,
        coverage_window_days: int = 90,
        coverage_lake_root: Path | str | None = None,
        coverage_weather_report_template: str | Path | None = None,
        now_factory: Callable[[], datetime] = _utcnow,
    ) -> None:
        self.logger = logging.getLogger(__name__)
        self.seed_path = Path(seed_path).expanduser() if seed_path else None
        self.ingestion_state_root = Path(
            ingestion_state_root or os.getenv("INGESTION_STATE_ROOT", "storage/metadata/state/ingestion")
        ).expanduser()
        self.ad_push_diff_path = Path(
            ad_push_diff_path or os.getenv("AD_PUSH_STATE_PATH", "state/ad_push_diffs.json")
        ).expanduser()
        self.ad_push_alerts_path = Path(
            ad_push_alerts_path or os.getenv("AD_PUSH_ALERTS_PATH", "state/ad_push_alerts.json")
        ).expanduser()
        self.alert_ack_path = Path(
            alert_ack_path or os.getenv("AD_PUSH_ALERT_ACK_PATH", "state/dashboard_alert_ack.json")
        ).expanduser()
        self.weather_root = Path(weather_root or os.getenv("WEATHER_LAKE_ROOT", "storage/lake/weather")).expanduser()
        self.suggestion_metrics_path = (
            Path(suggestion_metrics_path).expanduser() if suggestion_metrics_path else None
        )
        self.suggestion_metrics_root = Path(
            suggestion_metrics_root or os.getenv("METRICS_OUTPUT_DIR", "tmp/metrics")
        ).expanduser()
        self.allocator_report_path = Path(
            allocator_report_path
            or os.getenv("ALLOCATOR_SATURATION_PATH", "experiments/allocator/saturation_report.json")
        ).expanduser()
        self.fallback_tenant_id = fallback_tenant_id
        self.context_service = context_service or default_context_service
        self.warning_engine = warning_engine or default_warning_engine
        self.weather_geohash_overrides = dict(DEFAULT_WEATHER_GEOHASH_OVERRIDES)
        if weather_geohash_overrides:
            self.weather_geohash_overrides.update(weather_geohash_overrides)
        window_env = os.getenv("TENANT_COVERAGE_WINDOW_DAYS")
        fallback_window = coverage_window_days if coverage_window_days > 0 else 90
        try:
            resolved_window = int(window_env) if window_env is not None else int(coverage_window_days)
        except (TypeError, ValueError):
            resolved_window = fallback_window
        self.coverage_window_days = resolved_window if resolved_window > 0 else fallback_window
        lake_template_value = coverage_lake_root or os.getenv("TENANT_COVERAGE_LAKE_ROOT", "storage/lake/raw")
        self.coverage_lake_root_template = str(lake_template_value)
        report_template_value = coverage_weather_report_template or os.getenv(
            "TENANT_COVERAGE_WEATHER_REPORT_TEMPLATE",
            "experiments/features/weather_join_validation.json",
        )
        self.coverage_weather_report_template = str(report_template_value)
        self.now_factory = now_factory
        self.random = random.Random()
        self._allocator_diagnostics_cache: dict[tuple[str, str], _AllocatorDiagnosticsCacheEntry] = {}

    async def get_dashboard(self, tenant_id: str, since: datetime | None = None) -> DashboardResponse:
        try:
            return self._build_dashboard(tenant_id, since=since)
        except Exception:
            self.logger.exception("Failed to assemble WeatherOps dashboard for tenant %s", tenant_id)
            return self._fallback_dashboard(tenant_id)

    # --------------------------------------------------------------------- #
    # Live telemetry assembly
    # --------------------------------------------------------------------- #

    def _build_dashboard(self, tenant_id: str, *, since: datetime | None = None) -> DashboardResponse:
        now = self.now_factory()
        guardrails, spend_trackers, automation, alerts, guardrail_ts = self._load_guardrail_payload(tenant_id, now)
        ingestion, ingestion_ts = self._load_ingestion_connectors(tenant_id, now)
        weather_events, weather_ts = self._load_weather_events(tenant_id, now)
        context_tags, context_warnings = self._context_payload(tenant_id)

        timestamps = [ts for ts in (guardrail_ts, ingestion_ts, weather_ts) if ts is not None]
        generated_at = max(timestamps) if timestamps else now

        if not guardrails:
            guardrails = self._default_guardrail_segments()
        if not automation:
            automation = self._default_automation_lanes(generated_at)

        allocator_summary = self._build_allocator_summary_snapshot(tenant_id, guardrails, now)
        if allocator_summary is None:
            allocator_summary = self._default_allocator_summary(generated_at)

        weather_kpis = self._build_weather_kpis_snapshot(weather_events, generated_at)
        suggestion_telemetry = self._load_suggestion_telemetry(tenant_id, since=since)
        suggestion_telemetry_summary: DashboardSuggestionTelemetrySummary | None = None
        if suggestion_telemetry:
            suggestion_telemetry_summary = summarize_dashboard_suggestion_telemetry(suggestion_telemetry)

        data_coverage = self._load_data_coverage(tenant_id, now)
        if data_coverage:
            coverage_generated_at = self._parse_datetime(data_coverage.generated_at)
            if coverage_generated_at:
                timestamps.append(coverage_generated_at)
            generated_at = max(timestamps) if timestamps else generated_at

        return DashboardResponse(
            tenant_id=tenant_id,
            generated_at=generated_at,
            guardrails=guardrails,
            spend_trackers=spend_trackers,
            weather_events=weather_events,
            automation=automation,
            ingestion=ingestion,
            alerts=alerts,
            allocator=allocator_summary,
            weather_kpis=weather_kpis,
            suggestion_telemetry=suggestion_telemetry,
            suggestion_telemetry_summary=suggestion_telemetry_summary,
            context_tags=context_tags,
            context_warnings=context_warnings,
            data_coverage=data_coverage,
        )

    def _load_data_coverage(self, tenant_id: str, now: datetime) -> CoverageSummaryModel | None:
        try:
            summary = evaluate_tenant_data_coverage(
                tenant_id,
                lake_root=self._resolve_coverage_lake_root(tenant_id),
                weather_report_path=self._resolve_coverage_weather_report_path(tenant_id),
                window_days=self.coverage_window_days,
                end_date=now.date(),
            )
        except Exception:
            self.logger.exception("Failed to evaluate tenant coverage for tenant %s", tenant_id)
            return None

        try:
            return CoverageSummaryModel.model_validate(summary.to_dict())
        except Exception:
            self.logger.exception("Failed to normalise tenant coverage payload for tenant %s", tenant_id)
            return None

    def _context_payload(self, tenant_id: str) -> tuple[list[str], list[ContextWarning]]:
        service = self.context_service
        if not service:
            return [], []

        snapshot = service.latest_snapshot(tenant_id)
        if snapshot is None and self.fallback_tenant_id and tenant_id != self.fallback_tenant_id:
            snapshot = service.latest_snapshot(self.fallback_tenant_id)
        if snapshot is None:
            return [], []

        tags = list(snapshot.tags)
        warnings: list[ContextWarning] = []
        if self.warning_engine:
            payloads = self.warning_engine.evaluate(
                tags,
                autopilot_enabled=True,
                pushes_enabled=True,
            )
            warnings = [
                ContextWarning(code=item.code, message=item.message, severity=item.severity, tags=list(item.tags))
                for item in payloads
            ]
        return tags, warnings

    def _load_guardrail_payload(
        self,
        tenant_id: str,
        now: datetime,
    ) -> tuple[list[GuardrailSegment], list[SpendTracker], list[AutomationLane], list[DashboardAlert], datetime | None]:
        diffs = self._load_diff_entries(tenant_id)
        guardrails = self._build_guardrail_segments(diffs)
        spend_trackers = self._build_spend_trackers(diffs)
        alerts_raw = self._load_alert_entries(tenant_id)
        alerts = self._build_alerts(alerts_raw, tenant_id)
        automation = self._build_automation_lanes(alerts_raw, guardrails, now)

        timestamps: list[datetime] = []
        if diffs:
            last_ts = self._parse_datetime(diffs[-1].get("generated_at"))
            if last_ts:
                timestamps.append(last_ts)
        if alerts_raw:
            alert_ts = [
                ts for ts in (self._parse_datetime(alert.get("generated_at")) for alert in alerts_raw) if ts is not None
            ]
            if alert_ts:
                timestamps.append(max(alert_ts))

        combined_ts = max(timestamps) if timestamps else None
        return guardrails, spend_trackers, automation, alerts, combined_ts

    def _load_diff_entries(self, tenant_id: str) -> list[dict[str, Any]]:
        payload = self._read_json_list(self.ad_push_diff_path)
        entries = [entry for entry in payload if entry.get("tenant_id") == tenant_id]
        if not entries and self.fallback_tenant_id and tenant_id != self.fallback_tenant_id:
            entries = [entry for entry in payload if entry.get("tenant_id") == self.fallback_tenant_id]
        entries.sort(
            key=lambda entry: self._parse_datetime(entry.get("generated_at")) or datetime.min.replace(tzinfo=timezone.utc)
        )
        return entries

    def _load_alert_entries(self, tenant_id: str) -> list[dict[str, Any]]:
        payload = self._read_json_list(self.ad_push_alerts_path)
        entries = [entry for entry in payload if entry.get("tenant_id") == tenant_id]
        if not entries and self.fallback_tenant_id and tenant_id != self.fallback_tenant_id:
            entries = [entry for entry in payload if entry.get("tenant_id") == self.fallback_tenant_id]
        entries.sort(
            key=lambda entry: self._parse_datetime(entry.get("generated_at")) or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )
        return entries

    def _build_guardrail_segments(self, diffs: Sequence[dict[str, Any]]) -> list[GuardrailSegment]:
        if not diffs:
            return []
        latest = diffs[-1]
        report = latest.get("spend_guardrail_report") or {}
        totals = report.get("totals") or {}
        overall_guardrails = report.get("guardrails") or []

        segments: list[GuardrailSegment] = [
            GuardrailSegment(
                name="Total spend delta",
                status=self._status_from_breaches(overall_guardrails),
                value=self._safe_float(totals.get("proposed_spend")),
                target=self._safe_float(totals.get("baseline_spend")),
                unit="usd",
                delta_pct=self._safe_float(totals.get("percent_delta")),
                notes=self._summarise_guardrail_notes(overall_guardrails),
            )
        ]

        for platform in report.get("platforms") or []:
            platform_guardrails = platform.get("guardrails") or []
            platform_name = str(platform.get("platform") or "platform").title()
            segments.append(
                GuardrailSegment(
                    name=f"{platform_name} spend",
                    status=self._status_from_breaches(platform_guardrails),
                    value=self._safe_float(platform.get("proposed_spend")),
                    target=self._safe_float(platform.get("baseline_spend")),
                    unit="usd",
                    delta_pct=self._safe_float(platform.get("percent_delta")),
                    notes=self._summarise_guardrail_notes(platform_guardrails),
                )
            )
        return segments

    def _summarise_guardrail_notes(self, breaches: Sequence[Mapping[str, Any]]) -> str | None:
        if not breaches:
            return None
        messages = [str(breach.get("message")) for breach in breaches if breach.get("message")]
        unique_messages: list[str] = []
        for message in messages:
            if message not in unique_messages:
                unique_messages.append(message)
        return "; ".join(unique_messages[:2]) if unique_messages else None

    def _status_from_breaches(self, breaches: Sequence[Mapping[str, Any]]) -> GuardrailStatus:
        has_critical = any(str(breach.get("severity")).lower() == "critical" for breach in breaches)
        if has_critical:
            return GuardrailStatus.breach
        has_warning = any(str(breach.get("severity")).lower() == "warning" for breach in breaches)
        if has_warning:
            return GuardrailStatus.watch
        return GuardrailStatus.healthy

    def _build_spend_trackers(self, diffs: Sequence[dict[str, Any]]) -> list[SpendTracker]:
        history: dict[str, list[tuple[datetime | None, float, float, float]]] = defaultdict(list)
        for entry in diffs:
            report = entry.get("spend_guardrail_report") or {}
            timestamp = self._parse_datetime(entry.get("generated_at"))
            for platform in report.get("platforms") or []:
                platform_name = str(platform.get("platform") or "platform").title()
                history[platform_name].append(
                    (
                        timestamp,
                        self._safe_float(platform.get("proposed_spend")),
                        self._safe_float(platform.get("baseline_spend")),
                        self._safe_float(platform.get("percent_delta")),
                    )
                )

        trackers: list[SpendTracker] = []
        for platform_name, samples in history.items():
            samples.sort(key=lambda item: item[0] or datetime.min.replace(tzinfo=timezone.utc))
            latest_timestamp, latest_value, latest_target, latest_change = samples[-1]
            sparkline_values = [max(0.0, sample[1]) for sample in samples[-12:]]
            trackers.append(
                SpendTracker(
                    name=f"{platform_name} Spend",
                    channel=self._infer_channel(platform_name),
                    value=latest_value,
                    change_pct=latest_change,
                    target=latest_target,
                    unit="usd",
                    sparkline=sparkline_values or [latest_value],
                )
            )
        return sorted(trackers, key=lambda tracker: tracker.name)

    @staticmethod
    def _infer_channel(platform_name: str) -> str:
        normalized = platform_name.lower()
        if "meta" in normalized or "facebook" in normalized:
            return "Paid Social"
        if "google" in normalized or "search" in normalized:
            return "Paid Search"
        if "email" in normalized or "promo" in normalized:
            return "Lifecycle"
        return "Paid Media"

    def _build_automation_lanes(
        self,
        alerts_raw: Sequence[dict[str, Any]],
        guardrails: Sequence[GuardrailSegment],
        now: datetime,
    ) -> list[AutomationLane]:
        if not alerts_raw and not guardrails:
            return []

        critical_incidents = [
            self._parse_datetime(alert.get("generated_at"))
            for alert in alerts_raw
            if str(alert.get("severity")).lower() == "critical"
        ]
        critical_recent = [ts for ts in critical_incidents if ts and now - ts <= timedelta(days=7)]
        last_incident = max(critical_recent) if critical_recent else None
        incidents_count = len(critical_recent)
        uptime = max(88.0, DEFAULT_AUTOMATION_UPTIME - incidents_count * 1.8)

        guardrail_status = self._derive_guardrail_status(guardrails)
        assist_notes = self._assist_note_from_status(guardrail_status)

        lanes = [
            AutomationLane(
                name="Assist Guardrails",
                uptime_pct=round(uptime, 1),
                incidents_7d=incidents_count,
                last_incident_at=last_incident,
                status=guardrail_status,
                notes=assist_notes,
            )
        ]

        autopilot_status = AutomationLaneStatus.normal
        autopilot_notes = "Automation engine executing pushes within policy."
        if critical_recent:
            autopilot_status = AutomationLaneStatus.degraded
            autopilot_notes = "Automation engine throttled after critical guardrail breach."
        elif any(str(alert.get("severity")).lower() == "warning" for alert in alerts_raw):
            autopilot_status = AutomationLaneStatus.degraded
            autopilot_notes = "Monitoring guardrail warnings before re-enabling full automation."

        autopilot_incidents = len(alerts_raw)
        autopilot_last = self._parse_datetime(alerts_raw[0].get("generated_at")) if alerts_raw else None
        lanes.append(
            AutomationLane(
                name="Automation engine Execution",
                uptime_pct=round(max(85.0, uptime - autopilot_incidents * 1.2), 1),
                incidents_7d=autopilot_incidents,
                last_incident_at=autopilot_last,
                status=autopilot_status,
                notes=autopilot_notes,
            )
        )

        return lanes

    @staticmethod
    def _derive_guardrail_status(guardrails: Sequence[GuardrailSegment]) -> AutomationLaneStatus:
        if any(segment.status == GuardrailStatus.breach for segment in guardrails):
            return AutomationLaneStatus.degraded
        if any(segment.status == GuardrailStatus.watch for segment in guardrails):
            return AutomationLaneStatus.normal
        return AutomationLaneStatus.normal

    @staticmethod
    def _assist_note_from_status(status: AutomationLaneStatus) -> str:
        if status == AutomationLaneStatus.degraded:
            return "Guardrail breach detected; manual review required before approving pushes."
        if status == AutomationLaneStatus.paused:
            return "Automation paused until guardrails recover."
        return "Guardrails holding steady; Assist ready for approvals."

    def _build_allocator_summary_snapshot(
        self,
        tenant_id: str,
        guardrails: Sequence[GuardrailSegment],
        now: datetime,
    ) -> AllocatorSummary | None:
        diffs = self._load_diff_entries(tenant_id)
        if not diffs:
            return None

        latest = diffs[-1]
        report = latest.get("spend_guardrail_report") or {}
        totals = report.get("totals") or {}
        overall_breaches = report.get("guardrails") or []

        generated_at = self._parse_datetime(latest.get("generated_at"))
        mode_raw = str(latest.get("generation_mode") or "assist")
        mode = self._allocator_mode_from_string(mode_raw)

        notes_value = latest.get("notes")
        if isinstance(notes_value, list):
            notes = [str(note) for note in notes_value if isinstance(note, str)]
        elif isinstance(notes_value, str):
            notes = [notes_value]
        else:
            notes = []

        guardrail_breaches = sum(
            1
            for breach in overall_breaches
            if str(breach.get("severity") or "").lower() == "critical"
        )
        if guardrail_breaches == 0:
            guardrail_breaches = sum(
                1 for segment in guardrails if segment.status == GuardrailStatus.breach
            )

        recommendations: list[AllocatorRecommendation] = []
        for platform in report.get("platforms") or []:
            platform_name = str(platform.get("platform") or "platform").title()
            spend_delta = self._safe_float(platform.get("spend_delta"))
            recommendation = AllocatorRecommendation(
                platform=platform_name,
                spend_after=self._safe_float(platform.get("proposed_spend")),
                spend_delta=spend_delta,
                spend_delta_pct=self._safe_float(platform.get("percent_delta")),
                severity=self._recommendation_severity(platform.get("guardrails") or []),
                guardrail_count=len(platform.get("guardrails") or []),
                top_guardrail=self._primary_guardrail(platform.get("guardrails") or []),
                notes=self._summarise_guardrail_notes(platform.get("guardrails") or []),
            )
            recommendations.append(recommendation)

        recommendations.sort(key=self._recommendation_sort_key)

        total_spend = self._safe_float(totals.get("proposed_spend"))
        total_delta = self._safe_float(totals.get("spend_delta"))
        total_delta_pct = self._safe_float(totals.get("percent_delta"))

        run_id = latest.get("run_id") or latest.get("id")
        if not run_id:
            run_id = f"allocator-run-{len(diffs)}"

        diagnostics = self._extract_allocator_diagnostics(latest)
        if diagnostics is None:
            diagnostics = self._load_allocator_diagnostics(tenant_id, now=now)

        return AllocatorSummary(
            run_id=str(run_id),
            generated_at=generated_at,
            mode=mode,
            total_spend=total_spend,
            total_spend_delta=total_delta,
            total_spend_delta_pct=total_delta_pct,
            guardrail_breaches=max(0, guardrail_breaches),
            notes=notes,
            recommendations=recommendations,
            diagnostics=diagnostics,
        )

    def _extract_allocator_diagnostics(self, payload: Mapping[str, Any]) -> AllocatorDiagnostics | None:
        allocator_section = payload.get("allocator")
        if not isinstance(allocator_section, Mapping):
            return None
        return self._build_allocator_diagnostics_model(
            allocator_section.get("diagnostics"),
            summary=allocator_section.get("summary"),
        )

    def _load_allocator_diagnostics(self, tenant_id: str, *, now: datetime) -> AllocatorDiagnostics | None:
        path = self.allocator_report_path
        if not path:
            return None

        cache_key = (tenant_id, str(path))
        try:
            stat = path.stat()
        except (FileNotFoundError, OSError):
            self._allocator_diagnostics_cache.pop(cache_key, None)
            return None

        mtime_ns = getattr(stat, "st_mtime_ns", int(stat.st_mtime * 1_000_000_000))
        size = getattr(stat, "st_size", -1)

        cached = self._allocator_diagnostics_cache.get(cache_key)
        if cached and cached.mtime_ns == mtime_ns and cached.size == size:
            if cached.generated_at is not None:
                age_minutes = self._minutes_between(now, cached.generated_at)
                if age_minutes > ALLOCATOR_DIAGNOSTICS_MAX_AGE_MINUTES:
                    self._allocator_diagnostics_cache.pop(cache_key, None)
                    return None
            if cached.diagnostics is None:
                return None
            return cached.diagnostics.model_copy(deep=True)

        try:
            raw_text = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            self._allocator_diagnostics_cache.pop(cache_key, None)
            return None
        except OSError:
            self.logger.warning("Unable to read allocator diagnostics at %s", path, exc_info=True)
            self._allocator_diagnostics_cache.pop(cache_key, None)
            return None

        try:
            payload = json.loads(raw_text)
        except json.JSONDecodeError:
            self.logger.warning("Invalid allocator diagnostics payload at %s", path, exc_info=True)
            self._allocator_diagnostics_cache.pop(cache_key, None)
            return None

        tenant_marker = payload.get("tenant_id")
        if isinstance(tenant_marker, str) and tenant_marker and tenant_marker != tenant_id:
            self._allocator_diagnostics_cache.pop(cache_key, None)
            return None

        generated_at = self._parse_datetime(payload.get("generated_at"))
        if generated_at is not None:
            age_minutes = self._minutes_between(now, generated_at)
            if age_minutes > ALLOCATOR_DIAGNOSTICS_MAX_AGE_MINUTES:
                self._allocator_diagnostics_cache.pop(cache_key, None)
                return None

        allocator_section = payload.get("allocator")
        summary_section = payload.get("summary")
        diagnostics = self._build_allocator_diagnostics_model(
            allocator_section.get("diagnostics") if isinstance(allocator_section, Mapping) else None,
            summary=summary_section if isinstance(summary_section, Mapping) else None,
        )

        try:
            stat_after = path.stat()
            mtime_ns = getattr(stat_after, "st_mtime_ns", int(stat_after.st_mtime * 1_000_000_000))
            size = getattr(stat_after, "st_size", -1)
        except (FileNotFoundError, OSError):
            pass

        self._allocator_diagnostics_cache[cache_key] = _AllocatorDiagnosticsCacheEntry(
            diagnostics=diagnostics,
            generated_at=generated_at,
            mtime_ns=mtime_ns,
            size=size,
        )
        return diagnostics

    def _build_allocator_diagnostics_model(
        self,
        diagnostics_payload: Any,
        *,
        summary: Mapping[str, Any] | None,
    ) -> AllocatorDiagnostics | None:
        if not isinstance(diagnostics_payload, Mapping):
            return None

        def maybe_float(value: Any) -> float | None:
            try:
                if value is None:
                    return None
                return float(value)
            except (TypeError, ValueError):
                return None

        def clean_sequence(values: Any) -> list[str]:
            if not isinstance(values, Sequence) or isinstance(values, (str, bytes)):
                return []
            cleaned: list[str] = []
            for entry in values:
                if isinstance(entry, str):
                    candidate = entry.strip()
                    if candidate:
                        cleaned.append(candidate)
                elif isinstance(entry, (int, float)):
                    cleaned.append(str(entry))
            return cleaned

        summary_payload = summary or {}
        baseline_profit = maybe_float(summary_payload.get("baseline_profit"))
        profit_lift = maybe_float(summary_payload.get("profit_lift"))

        scenario_p10 = maybe_float(diagnostics_payload.get("scenario_profit_p10"))
        scenario_p50 = maybe_float(diagnostics_payload.get("scenario_profit_p50"))
        scenario_p90 = maybe_float(diagnostics_payload.get("scenario_profit_p90"))
        expected_profit_raw = maybe_float(diagnostics_payload.get("expected_profit_raw"))
        worst_case_profit = maybe_float(diagnostics_payload.get("worst_case_profit"))

        profit_delta_p50 = None
        if scenario_p50 is not None and baseline_profit is not None:
            profit_delta_p50 = scenario_p50 - baseline_profit

        profit_delta_expected = None
        if expected_profit_raw is not None and baseline_profit is not None:
            profit_delta_expected = expected_profit_raw - baseline_profit

        binding_constraints: dict[str, list[str]] = {}
        for key in (
            "binding_min_spend",
            "binding_max_spend",
            "binding_min_spend_by_cell",
            "binding_max_spend_by_cell",
            "binding_roas_floor",
            "binding_learning_cap",
        ):
            values = clean_sequence(diagnostics_payload.get(key))
            if values:
                binding_constraints[key] = values

        raw_candidates = diagnostics_payload.get("optimizer_candidates")
        optimizer_candidates: list[dict[str, Any]] = []
        if isinstance(raw_candidates, Sequence) and not isinstance(raw_candidates, (str, bytes)):
            for candidate in raw_candidates:
                if not isinstance(candidate, Mapping):
                    continue
                cleaned_candidate: dict[str, Any] = {}
                for key, value in candidate.items():
                    key_str = str(key)
                    if isinstance(value, (int, float)):
                        cleaned_candidate[key_str] = float(value)
                    elif isinstance(value, str):
                        cleaned_candidate[key_str] = value
                if cleaned_candidate:
                    optimizer_candidates.append(cleaned_candidate)

        evaluations = maybe_float(diagnostics_payload.get("nfev"))
        iterations = maybe_float(
            diagnostics_payload.get("iterations")
            if diagnostics_payload.get("iterations") is not None
            else diagnostics_payload.get("nit")
        )
        iterations_with_improvement = maybe_float(diagnostics_payload.get("iterations_with_improvement"))
        improvements = maybe_float(diagnostics_payload.get("improvements"))
        if improvements is None and iterations_with_improvement is not None:
            improvements = iterations_with_improvement

        projection_target = maybe_float(diagnostics_payload.get("projection_target"))
        projection_residual_lower = maybe_float(diagnostics_payload.get("projection_residual_lower"))
        projection_residual_upper = maybe_float(diagnostics_payload.get("projection_residual_upper"))
        success_score = maybe_float(diagnostics_payload.get("success"))
        objective_value = maybe_float(diagnostics_payload.get("objective_value"))

        min_softened_value = diagnostics_payload.get("min_softened")
        min_softened: bool | None
        if isinstance(min_softened_value, bool):
            min_softened = min_softened_value
        else:
            coerced = maybe_float(min_softened_value)
            min_softened = bool(coerced) if coerced is not None else None

        optimizer_raw = diagnostics_payload.get("optimizer")
        optimizer = str(optimizer_raw).strip() if isinstance(optimizer_raw, str) and optimizer_raw.strip() else None

        optimizer_winner_raw = diagnostics_payload.get("optimizer_winner")
        optimizer_winner = (
            str(optimizer_winner_raw).strip()
            if isinstance(optimizer_winner_raw, str) and optimizer_winner_raw.strip()
            else None
        )

        return AllocatorDiagnostics(
            optimizer=optimizer,
            optimizer_winner=optimizer_winner,
            scenario_profit_p10=scenario_p10,
            scenario_profit_p50=scenario_p50,
            scenario_profit_p90=scenario_p90,
            expected_profit_raw=expected_profit_raw,
            worst_case_profit=worst_case_profit,
            baseline_profit=baseline_profit,
            profit_lift=profit_lift,
            profit_delta_p50=profit_delta_p50,
            profit_delta_expected=profit_delta_expected,
            binding_constraints=binding_constraints,
            optimizer_candidates=optimizer_candidates,
            evaluations=evaluations,
            iterations=iterations,
            improvements=improvements,
            iterations_with_improvement=iterations_with_improvement,
            projection_target=projection_target,
            projection_residual_lower=projection_residual_lower,
            projection_residual_upper=projection_residual_upper,
            success=success_score,
            objective_value=objective_value,
            min_softened=min_softened,
        )
    @staticmethod
    def _allocator_mode_from_string(raw: str) -> AllocatorMode:
        normalised = raw.strip().lower()
        if normalised == "autopilot":
            return AllocatorMode.autopilot
        if normalised == "assist":
            return AllocatorMode.assist
        if normalised == "demo":
            return AllocatorMode.demo
        return AllocatorMode.fallback

    @staticmethod
    def _recommendation_sort_key(recommendation: AllocatorRecommendation) -> tuple[int, float]:
        severity_order = {
            RecommendationSeverity.critical: 0,
            RecommendationSeverity.warning: 1,
            RecommendationSeverity.info: 2,
        }
        order = severity_order.get(recommendation.severity, 3)
        magnitude = -abs(recommendation.spend_delta)
        return order, magnitude

    @staticmethod
    def _recommendation_severity(
        guardrails: Sequence[Mapping[str, Any]],
    ) -> RecommendationSeverity:
        severities = [str(item.get("severity") or "").lower() for item in guardrails]
        if any(severity == "critical" for severity in severities):
            return RecommendationSeverity.critical
        if any(severity == "warning" for severity in severities):
            return RecommendationSeverity.warning
        return RecommendationSeverity.info

    @staticmethod
    def _primary_guardrail(guardrails: Sequence[Mapping[str, Any]]) -> str | None:
        for entry in guardrails:
            message = entry.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()
        return None

    def _build_weather_kpis_snapshot(
        self,
        weather_events: Sequence[WeatherRiskEvent],
        now: datetime,
    ) -> list[WeatherKpi]:
        events = list(weather_events)
        if not events:
            return [
                WeatherKpi(
                    id="high_risk_alerts",
                    label="High-risk alerts",
                    value=0.0,
                    unit=WeatherKpiUnit.count,
                    delta_pct=None,
                    sparkline=[0.0],
                    description="No weather alerts are impacting guardrails right now.",
                ),
                WeatherKpi(
                    id="regions_impacted",
                    label="Regions impacted",
                    value=0.0,
                    unit=WeatherKpiUnit.count,
                    delta_pct=None,
                    sparkline=[0.0],
                    description="No regions reporting weather-driven risk windows.",
                ),
                WeatherKpi(
                    id="next_event_lead_time",
                    label="Lead time to next event",
                    value=0.0,
                    unit=WeatherKpiUnit.hours,
                    delta_pct=None,
                    sparkline=[0.0],
                    description="Upcoming weather events are not yet scheduled.",
                ),
            ]

        total_events = len(events)
        high_risk_count = sum(1 for event in events if event.severity == WeatherRiskSeverity.high)
        medium_risk_count = sum(1 for event in events if event.severity == WeatherRiskSeverity.medium)

        sorted_events = sorted(events, key=lambda event: event.starts_at)
        severity_trend = [
            float(self._weather_severity_weight(event.severity))
            for event in sorted_events
        ]

        unique_regions = {
            self._normalize_region_label(event.geo_region)
            for event in events
        }

        upcoming_events = [
            event for event in events if event.starts_at >= now
        ]
        next_event = min(upcoming_events, key=lambda event: event.starts_at) if upcoming_events else None
        hours_to_next = (
            max(0.0, (next_event.starts_at - now).total_seconds() / 3600.0)
            if next_event
            else 0.0
        )

        events_within_day = [
            event
            for event in events
            if 0.0 <= (event.starts_at - now).total_seconds() <= 86400.0
        ]

        impacted_sparkline = [
            float(self._weather_severity_weight(event.severity))
            for event in events_within_day
        ] or [0.0]

        high_risk_description = (
            f"{high_risk_count} of {total_events} weather windows carry high risk."
            if total_events
            else "No weather telemetry available."
        )
        region_description = (
            f"{len(unique_regions)} regions reporting weather signals in the next 24 hours."
        )
        lead_time_description = (
            f"Next weather event begins in approximately {hours_to_next:.1f} hours."
            if next_event
            else "No upcoming weather events on the calendar."
        )

        return [
            WeatherKpi(
                id="high_risk_alerts",
                label="High-risk alerts",
                value=float(high_risk_count),
                unit=WeatherKpiUnit.count,
                delta_pct=(
                    ((high_risk_count - medium_risk_count) / max(1, total_events)) * 100.0
                    if total_events
                    else None
                ),
                sparkline=severity_trend or [0.0],
                description=high_risk_description,
            ),
            WeatherKpi(
                id="regions_impacted",
                label="Regions impacted",
                value=float(len(unique_regions)),
                unit=WeatherKpiUnit.count,
                delta_pct=None,
                sparkline=impacted_sparkline,
                description=region_description,
            ),
            WeatherKpi(
                id="next_event_lead_time",
                label="Lead time to next event",
                value=round(hours_to_next, 1),
                unit=WeatherKpiUnit.hours,
                delta_pct=None,
                sparkline=[round(hours_to_next, 1)],
                description=lead_time_description,
            ),
        ]

    @staticmethod
    def _weather_severity_weight(severity: WeatherRiskSeverity) -> int:
        if severity == WeatherRiskSeverity.high:
            return 3
        if severity == WeatherRiskSeverity.medium:
            return 2
        return 1

    @staticmethod
    def _normalize_region_label(region: str | None) -> str:
        if not region:
            return "Unspecified region"
        normalized = " ".join(str(region).split()).strip()
        return normalized if normalized else "Unspecified region"

    def _resolve_suggestion_metrics_file(self) -> Path | None:
        if self.suggestion_metrics_path:
            candidate = self.suggestion_metrics_path
            if candidate.is_dir():
                metrics_file = candidate / "metrics.jsonl"
                return metrics_file if metrics_file.exists() else None
            return candidate if candidate.exists() else None

        root = self.suggestion_metrics_root
        if not root.exists():
            return None

        if root.is_file():
            return root

        candidates: list[Path] = []
        direct = root / "metrics.jsonl"
        if direct.exists():
            candidates.append(direct)

        try:
            for child in root.iterdir():
                if child.is_dir():
                    metrics_file = child / "metrics.jsonl"
                    if metrics_file.exists():
                        candidates.append(metrics_file)
                elif child.is_file() and child.name == "metrics.jsonl":
                    candidates.append(child)
        except OSError:
            return None

        latest: Path | None = None
        latest_mtime = float("-inf")
        for candidate in candidates:
            try:
                mtime = candidate.stat().st_mtime
            except OSError:
                continue
            if mtime > latest_mtime:
                latest = candidate
                latest_mtime = mtime
        return latest

    def _load_suggestion_telemetry(
        self,
        tenant_id: str,
        *,
        since: datetime | None = None,
    ) -> list[DashboardSuggestionTelemetry]:
        metrics_file = self._resolve_suggestion_metrics_file()
        if not metrics_file:
            return []

        try:
            records = load_dashboard_suggestion_metrics(metrics_file)
        except Exception:
            self.logger.exception(
                "Failed to load dashboard suggestion analytics from metrics file: %s",
                metrics_file,
            )
            return []

        if not records:
            return []

        since_utc: datetime | None = None
        if since is not None:
            if since.tzinfo is None:
                since = since.replace(tzinfo=timezone.utc)
            since_utc = since.astimezone(timezone.utc)

        def _aggregated_for(target: str) -> list[DashboardSuggestionAggregate]:
            scoped_records = [
                record
                for record in records
                if record.tenant_id == target and (since_utc is None or record.occurred_at >= since_utc)
            ]
            if not scoped_records:
                return []
            aggregates = aggregate_dashboard_suggestion_metrics(scoped_records)
            return aggregates[:6]

        aggregates = _aggregated_for(tenant_id)
        if not aggregates and self.fallback_tenant_id and tenant_id != self.fallback_tenant_id:
            aggregates = _aggregated_for(self.fallback_tenant_id)
        if not aggregates:
            return []

        return [self._map_suggestion_aggregate(aggregate) for aggregate in aggregates]

    @staticmethod
    def _map_suggestion_aggregate(aggregate: DashboardSuggestionAggregate) -> DashboardSuggestionTelemetry:
        view_count = aggregate.view_count
        focus_count = aggregate.focus_count
        dismiss_count = aggregate.dismiss_count
        engagement_count = focus_count + dismiss_count
        return DashboardSuggestionTelemetry(
            signature=aggregate.signature,
            region=aggregate.region,
            reason=aggregate.reason,
            view_count=view_count,
            focus_count=focus_count,
            dismiss_count=dismiss_count,
            high_risk_count=aggregate.high_risk_count,
            event_count=aggregate.event_count,
            focus_rate=DashboardService._calculate_rate(focus_count, view_count),
            dismiss_rate=DashboardService._calculate_rate(dismiss_count, view_count),
            engagement_rate=DashboardService._calculate_rate(engagement_count, view_count),
            has_scheduled_start=aggregate.has_scheduled_start,
            next_event_starts_at=aggregate.next_event_starts_at,
            first_occurred_at=aggregate.first_occurred_at,
            last_occurred_at=aggregate.last_occurred_at,
            tenants=sorted(aggregate.tenants),
            severities=sorted(aggregate.severities),
            viewport_breakpoints=sorted(aggregate.viewport_breakpoints),
            metadata=dict(aggregate.metadata),
        )

    def _default_allocator_summary(self, generated_at: datetime) -> AllocatorSummary:
        return AllocatorSummary(
            run_id="allocator-demo",
            generated_at=generated_at,
            mode=AllocatorMode.assist,
            total_spend=250000.0,
            total_spend_delta=-33000.0,
            total_spend_delta_pct=-11.6,
            guardrail_breaches=1,
            notes=[
                "Demo allocator recommendations seeded from fallback telemetry.",
            ],
            recommendations=[
                AllocatorRecommendation(
                    platform="Meta",
                    spend_after=110000.0,
                    spend_delta=-15000.0,
                    spend_delta_pct=-12.0,
                    severity=RecommendationSeverity.critical,
                    guardrail_count=1,
                    top_guardrail="CPA ceiling at risk; keep Apparel South throttled.",
                    notes="Storm risk and CPA breach require throttling high-cost ad sets.",
                ),
                AllocatorRecommendation(
                    platform="Google",
                    spend_after=140000.0,
                    spend_delta=-18000.0,
                    spend_delta_pct=-11.4,
                    severity=RecommendationSeverity.warning,
                    guardrail_count=1,
                    top_guardrail="Budget delta exceeds governance limit.",
                    notes="Shifted budget away from storm-impacted search clusters.",
                ),
                AllocatorRecommendation(
                    platform="Email",
                    spend_after=30000.0,
                    spend_delta=3000.0,
                    spend_delta_pct=11.1,
                    severity=RecommendationSeverity.info,
                    guardrail_count=0,
                    top_guardrail=None,
                    notes="Lifecycle nurture spend increased to offset paid throttles.",
                ),
            ],
        )

    def _build_alerts(self, alerts_raw: Sequence[dict[str, Any]], tenant_id: str) -> list[DashboardAlert]:
        alerts: list[DashboardAlert] = []
        for entry in alerts_raw:
            timestamp = self._parse_datetime(entry.get("generated_at")) or self.now_factory()
            severity_value = str(entry.get("severity") or "warning").lower()
            try:
                severity = AlertSeverity(severity_value)
            except ValueError:
                severity = AlertSeverity.warning
            codes = [str(code) for code in entry.get("codes", []) if isinstance(code, str)]
            title = self._derive_alert_title(entry, codes)
            detail = str(entry.get("message") or title)
            alerts.append(
                DashboardAlert(
                    id=str(entry.get("run_id") or entry.get("id") or f"alert-{abs(hash(detail))}"),
                    title=title,
                    detail=detail,
                    severity=severity,
                    occurred_at=timestamp,
                    acknowledged=severity != AlertSeverity.critical,
                    acknowledged_at=None,
                    escalated_to=None,
                    escalated_at=None,
                    escalation_channel=None,
                    related_objects=codes,
                )
            )
        alerts.sort(key=lambda alert: alert.occurred_at, reverse=True)
        self._apply_alert_acknowledgements(tenant_id, alerts)
        return alerts

    def _derive_alert_title(self, entry: Mapping[str, Any], codes: Sequence[str]) -> str:
        if entry.get("title"):
            return str(entry["title"])
        if codes:
            primary = codes[0].replace("_", " ").title()
            return f"{primary} alert"
        message = entry.get("message")
        if isinstance(message, str) and ":" in message:
            return message.split(":", 1)[0].strip()
        return "Guardrail alert"

    def _apply_alert_acknowledgements(
        self,
        tenant_id: str,
        alerts: Sequence[DashboardAlert],
    ) -> None:
        if not alerts:
            return
        ack_map = self._read_alert_ack_map()
        if not ack_map:
            return
        for alert in alerts:
            key = self._alert_ack_key(tenant_id, alert.id)
            record = ack_map.get(key)
            if not record:
                continue
            acknowledged_at = self._parse_datetime(record.get("acknowledged_at"))
            if acknowledged_at:
                alert.acknowledged = True
                alert.acknowledged_at = acknowledged_at
            escalated_to = record.get("escalated_to")
            if escalated_to:
                alert.escalated_to = str(escalated_to)
                alert.escalated_at = self._parse_datetime(record.get("escalated_at"))
                channel = record.get("escalated_channel")
                if isinstance(channel, str) and channel:
                    alert.escalation_channel = channel

    def _alert_ack_key(self, tenant_id: str, alert_id: str) -> str:
        return f"{tenant_id}:{alert_id}"

    def _read_alert_ack_map(self) -> dict[str, dict[str, Any]]:
        payload = self._read_json_object(self.alert_ack_path)
        if not isinstance(payload, dict):
            return {}
        return {
            str(key): value
            for key, value in payload.items()
            if isinstance(key, str) and isinstance(value, dict)
        }

    def _write_alert_ack_map(self, ack_map: Mapping[str, Mapping[str, Any]]) -> None:
        serialisable = {key: dict(value) for key, value in ack_map.items()}
        self.alert_ack_path.parent.mkdir(parents=True, exist_ok=True)
        self.alert_ack_path.write_text(json.dumps(serialisable, indent=2, sort_keys=True))

    def acknowledge_alert(
        self,
        tenant_id: str,
        alert_id: str,
        *,
        acknowledged_by: str | None = None,
        note: str | None = None,
    ) -> AlertAcknowledgeResponse:
        alerts_raw = self._load_alert_entries(tenant_id)
        alerts = self._build_alerts(alerts_raw, tenant_id)
        if not any(alert.id == alert_id for alert in alerts):
            raise ValueError(f"Alert {alert_id} not found for tenant {tenant_id}")

        acknowledged_at = self.now_factory()
        key = self._alert_ack_key(tenant_id, alert_id)
        ack_map = self._read_alert_ack_map()
        record: dict[str, Any] = dict(ack_map.get(key, {}))
        record.update(
            {
                "tenant_id": tenant_id,
                "alert_id": alert_id,
                "acknowledged_at": acknowledged_at.isoformat(),
            }
        )
        if acknowledged_by:
            record["acknowledged_by"] = acknowledged_by
        if note:
            record["note"] = note
        ack_map[key] = record
        self._write_alert_ack_map(ack_map)

        return AlertAcknowledgeResponse(
            tenant_id=tenant_id,
            alert_id=alert_id,
            acknowledged_at=acknowledged_at,
            acknowledged_by=acknowledged_by,
            note=note,
        )

    def escalate_alert(
        self,
        tenant_id: str,
        alert_id: str,
        *,
        channel: str,
        target: str,
        note: str | None = None,
    ) -> AlertEscalateResponse:
        alerts_raw = self._load_alert_entries(tenant_id)
        alerts = self._build_alerts(alerts_raw, tenant_id)
        if not any(alert.id == alert_id for alert in alerts):
            raise ValueError(f"Alert {alert_id} not found for tenant {tenant_id}")

        escalated_at = self.now_factory()
        key = self._alert_ack_key(tenant_id, alert_id)
        ack_map = self._read_alert_ack_map()
        record: dict[str, Any] = dict(ack_map.get(key, {}))
        record.update(
            {
                "tenant_id": tenant_id,
                "alert_id": alert_id,
                "escalated_at": escalated_at.isoformat(),
                "escalated_channel": channel,
                "escalated_to": target,
            }
        )
        if note:
            record["escalation_note"] = note
        ack_map[key] = record
        self._write_alert_ack_map(ack_map)

        return AlertEscalateResponse(
            tenant_id=tenant_id,
            alert_id=alert_id,
            escalated_at=escalated_at,
            channel=channel,
            target=target,
            note=note,
        )

    def _load_ingestion_connectors(
        self,
        tenant_id: str,
        now: datetime,
    ) -> tuple[list[IngestionConnector], datetime | None]:
        root = self.ingestion_state_root
        if not root.exists():
            return [], None
        paths = list(root.glob(f"{tenant_id}_*.json"))
        if not paths and self.fallback_tenant_id and tenant_id != self.fallback_tenant_id:
            paths = list(root.glob(f"{self.fallback_tenant_id}_*.json"))

        connectors: list[IngestionConnector] = []
        timestamps: list[datetime] = []
        for path in paths:
            data = self._read_json_object(path)
            if not data:
                continue
            updated_at = self._parse_datetime(data.get("updated_at"))
            if updated_at:
                timestamps.append(updated_at)
            name = path.name
            if name.endswith("_ads.json"):
                connectors.extend(self._connectors_from_ads(data, now))
            elif name.endswith("_shopify.json"):
                connectors.extend(self._connectors_from_shopify(data, now))
            elif name.endswith("_promo.json"):
                connectors.extend(self._connectors_from_promo(data, now))

        unique_connectors = self._dedupe_connectors(connectors)
        timestamp = max(timestamps) if timestamps else None
        return unique_connectors, timestamp

    def _connectors_from_ads(self, data: Mapping[str, Any], now: datetime) -> list[IngestionConnector]:
        updated = self._parse_datetime(data.get("updated_at")) or now
        connectors: list[IngestionConnector] = []
        meta_rows = self._safe_int(data.get("meta_rows"))
        if meta_rows is not None:
            connectors.append(
                self._build_connector(
                    name="Meta Ads",
                    source="Paid Social",
                    rows=meta_rows,
                    last_synced_at=self._parse_datetime(data.get("last_end")),
                    updated_at=updated,
                    now=now,
                    sla_minutes=20,
                    notes="Meta Ads ingestion via stub source" if data.get("source") == "stub" else "Meta Ads ingestion stream",
                )
            )
        google_rows = self._safe_int(data.get("google_rows"))
        if google_rows is not None:
            connectors.append(
                self._build_connector(
                    name="Google Ads",
                    source="Paid Search",
                    rows=google_rows,
                    last_synced_at=self._parse_datetime(data.get("last_end")),
                    updated_at=updated,
                    now=now,
                    sla_minutes=20,
                    notes="Google Ads ingestion via stub source" if data.get("source") == "stub" else "Google Ads ingestion stream",
                )
            )
        return connectors

    def _connectors_from_shopify(self, data: Mapping[str, Any], now: datetime) -> list[IngestionConnector]:
        updated = self._parse_datetime(data.get("updated_at")) or now
        notes_parts: list[str] = []
        if data.get("orders_row_count") is not None:
            notes_parts.append(f"Orders rows: {data.get('orders_row_count')}")
        if data.get("orders_geocoded_ratio") is not None:
            ratio = self._safe_float(data.get("orders_geocoded_ratio"))
            notes_parts.append(f"Geocoded ratio: {ratio:.2f}")
        notes = "; ".join(notes_parts) if notes_parts else "Shopify ingestion window"
        connector = self._build_connector(
            name="Shopify",
            source="Commerce",
            rows=self._safe_int(data.get("orders_row_count")),
            last_synced_at=self._parse_datetime(data.get("last_end")),
            updated_at=updated,
            now=now,
            sla_minutes=15,
            notes=notes,
        )
        return [connector]

    def _connectors_from_promo(self, data: Mapping[str, Any], now: datetime) -> list[IngestionConnector]:
        updated = self._parse_datetime(data.get("updated_at")) or now
        notes = "Promo sync (stub data)" if data.get("source") == "stub" else "Promo campaign ingestion"
        connector = self._build_connector(
            name="Email Promotions",
            source="Lifecycle",
            rows=self._safe_int(data.get("promo_rows")),
            last_synced_at=self._parse_datetime(data.get("last_end")),
            updated_at=updated,
            now=now,
            sla_minutes=30,
            notes=notes,
        )
        return [connector]

    def _build_connector(
        self,
        *,
        name: str,
        source: str,
        rows: int | None,
        last_synced_at: datetime | None,
        updated_at: datetime,
        now: datetime,
        sla_minutes: int,
        notes: str,
    ) -> IngestionConnector:
        lag_minutes = self._minutes_between(now, updated_at)
        status = self._connector_status_from_lag(lag_minutes, sla_minutes)
        if last_synced_at is None:
            last_synced_at = updated_at
        connector_notes = notes
        if rows is not None:
            connector_notes = f"{notes}; rows={rows}"
        return IngestionConnector(
            name=name,
            source=source,
            status=status,
            lag_minutes=int(round(lag_minutes)),
            sla_minutes=sla_minutes,
            last_synced_at=last_synced_at,
            notes=connector_notes,
        )

    @staticmethod
    def _connector_status_from_lag(lag_minutes: float, sla_minutes: int) -> ConnectorStatus:
        if lag_minutes <= sla_minutes:
            return ConnectorStatus.healthy
        if lag_minutes <= sla_minutes * 2:
            return ConnectorStatus.syncing
        if lag_minutes <= sla_minutes * 6:
            return ConnectorStatus.delayed
        return ConnectorStatus.failed

    @staticmethod
    def _dedupe_connectors(connectors: Sequence[IngestionConnector]) -> list[IngestionConnector]:
        dedup: dict[str, IngestionConnector] = {}
        for connector in connectors:
            existing = dedup.get(connector.name)
            if existing is None:
                dedup[connector.name] = connector
                continue
            existing_synced = existing.last_synced_at or datetime.min.replace(tzinfo=timezone.utc)
            candidate_synced = connector.last_synced_at or datetime.min.replace(tzinfo=timezone.utc)
            if candidate_synced > existing_synced:
                dedup[connector.name] = connector
        return list(dedup.values())

    def _load_weather_events(self, tenant_id: str, now: datetime) -> tuple[list[WeatherRiskEvent], datetime | None]:
        geohash = self._resolve_weather_geohash(tenant_id)
        if not geohash:
            return [], None
        weather_path = self._latest_weather_path(geohash)
        if not weather_path:
            return [], None
        data = self._read_json_object(weather_path)
        if not data:
            return [], None

        generated_at = self._parse_datetime(data.get("generated_at"))
        daily = data.get("daily") or {}
        times = daily.get("time") or []
        observation_types = daily.get("observation_type") or []
        precip = daily.get("precipitation_sum") or []
        precip_prob = daily.get("precipitation_probability_max") or []
        temp_max = daily.get("temperature_2m_max") or []
        temp_mean = daily.get("temperature_2m_mean") or []
        wind_max = daily.get("windspeed_10m_max") or []
        latitude = self._safe_float(data.get("latitude"))
        longitude = self._safe_float(data.get("longitude"))
        timezone_name = data.get("timezone") or "UTC"
        try:
            tzinfo: timezone | ZoneInfo = ZoneInfo(timezone_name)
        except Exception:
            tzinfo = timezone.utc

        events: list[WeatherRiskEvent] = []
        for idx, date_str in enumerate(times):
            if idx >= len(observation_types):
                break
            if observation_types[idx] != "forecast":
                continue
            start = self._combine_date_time(date_str, tzinfo)
            if start is None or start < now - timedelta(hours=1):
                continue
            precip_mm = self._safe_float(precip[idx] if idx < len(precip) else 0.0)
            prob = self._safe_float(precip_prob[idx] if idx < len(precip_prob) else 0.0)
            temperature = self._safe_float(temp_max[idx] if idx < len(temp_max) else 0.0)
            mean_temp = self._safe_float(temp_mean[idx] if idx < len(temp_mean) else 0.0)
            wind = self._safe_float(wind_max[idx] if idx < len(wind_max) else 0.0)
            severity, weather_type = self._classify_weather_event(precip_mm, prob, temperature, mean_temp, wind)
            if severity is None or weather_type is None:
                continue
            description = self._describe_weather_event(weather_type, precip_mm, temperature, wind, prob)
            event = WeatherRiskEvent(
                id=f"{geohash}-{date_str}",
                title=self._seasonal_event_title(weather_type),
                description=description,
                severity=severity,
                geo_region=f"Geohash {geohash.upper()}",
                starts_at=start,
                ends_at=start + timedelta(hours=12),
                latitude=latitude,
                longitude=longitude,
                weather_type=weather_type,
            )
            events.append(event)
        events.sort(key=lambda evt: evt.starts_at)
        return events[:5], generated_at

    def _resolve_weather_geohash(self, tenant_id: str) -> str | None:
        if tenant_id in self.weather_geohash_overrides:
            return self.weather_geohash_overrides[tenant_id]
        if self.fallback_tenant_id and self.fallback_tenant_id in self.weather_geohash_overrides:
            return self.weather_geohash_overrides[self.fallback_tenant_id]
        if not self.weather_root.exists():
            return None
        directories = sorted(child.name for child in self.weather_root.iterdir() if child.is_dir())
        return directories[0] if directories else None

    def _latest_weather_path(self, geohash: str) -> Path | None:
        candidate_root = self.weather_root / geohash
        if not candidate_root.exists():
            return None
        files = sorted(candidate_root.glob("*.json"))
        return files[-1] if files else None

    def _classify_weather_event(
        self,
        precipitation_mm: float,
        precip_probability: float,
        temperature_max_c: float,
        temperature_mean_c: float,
        wind_kmh: float,
    ) -> tuple[WeatherRiskSeverity | None, str | None]:
        temp = temperature_max_c or temperature_mean_c
        if precipitation_mm >= 15 or (precip_probability >= 80 and precipitation_mm >= 5) or wind_kmh >= 40:
            return WeatherRiskSeverity.high, "storm"
        if temp >= 32:
            return WeatherRiskSeverity.high, "heatwave"
        if temp <= -2:
            return WeatherRiskSeverity.high, "freeze"
        if precipitation_mm >= 6 or precip_probability >= 60 or wind_kmh >= 28:
            weather_type = "storm" if precipitation_mm >= 6 else "wind"
            return WeatherRiskSeverity.medium, weather_type
        if temp >= 28:
            return WeatherRiskSeverity.medium, "heatwave"
        if temp <= 3:
            return WeatherRiskSeverity.medium, "freeze"
        if precipitation_mm >= 2 or wind_kmh >= 20:
            return WeatherRiskSeverity.low, "rain"
        return None, None

    def _describe_weather_event(
        self,
        weather_type: str,
        precipitation_mm: float,
        temperature_c: float,
        wind_kmh: float,
        precip_probability: float,
    ) -> str:
        if weather_type == "heatwave":
            return f"Temperatures reaching {temperature_c:.1f}°C; adjust spend for hot-market demand."
        if weather_type == "freeze":
            return "Freeze risk expected; safeguard cold-weather inventory and promos."
        if weather_type == "wind":
            return f"High winds up to {wind_kmh:.0f} km/h forecast; monitor logistics delays."
        if weather_type == "storm":
            probability_text = f"{int(round(precip_probability))}% chance" if precip_probability else "Elevated risk"
            return f"{probability_text} of heavy precipitation ({precipitation_mm:.1f} mm). Prepare guardrails."
        return "Light precipitation expected; continue monitoring."

    @staticmethod
    def _seasonal_event_title(weather_type: str) -> str:
        if weather_type == "heatwave":
            return "Heatwave surge"
        if weather_type == "freeze":
            return "Freeze warning"
        if weather_type == "wind":
            return "High wind advisory"
        if weather_type == "storm":
            return "Storm window"
        return "Weather pulse"

    # --------------------------------------------------------------------- #
    # Helpers
    # --------------------------------------------------------------------- #

    def _resolve_coverage_lake_root(self, tenant_id: str) -> Path:
        formatted = self.coverage_lake_root_template.format(tenant_id=tenant_id)
        return Path(formatted).expanduser()

    def _resolve_coverage_weather_report_path(self, tenant_id: str) -> Path:
        formatted = self.coverage_weather_report_template.format(tenant_id=tenant_id)
        return Path(formatted).expanduser()

    def _read_json_list(self, path: Path) -> list[dict[str, Any]]:
        try:
            if not path.exists():
                return []
            raw = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            return []
        if isinstance(raw, list):
            return [item for item in raw if isinstance(item, dict)]
        if isinstance(raw, dict):
            return [raw]
        return []

    def _read_json_object(self, path: Path) -> dict[str, Any]:
        try:
            if not path.exists():
                return {}
            raw = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            return {}
        return raw if isinstance(raw, dict) else {}

    @staticmethod
    def _parse_datetime(value: Any) -> datetime | None:
        if not value:
            return None
        if isinstance(value, datetime):
            return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        text = str(value)
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    @staticmethod
    def _minutes_between(now: datetime, then: datetime) -> float:
        delta = now - then
        return max(0.0, delta.total_seconds() / 60.0)

    @staticmethod
    def _safe_float(value: Any) -> float:
        try:
            if value is None:
                return 0.0
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _calculate_rate(numerator: int, denominator: int) -> float:
        if denominator <= 0 or numerator <= 0:
            return 0.0
        try:
            ratio = numerator / denominator
        except ZeroDivisionError:
            return 0.0
        if not (ratio > 0):
            return 0.0
        return min(1.0, float(ratio))

    @staticmethod
    def _safe_int(value: Any) -> int | None:
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _combine_date_time(date_str: str, tzinfo: timezone | ZoneInfo) -> datetime | None:
        if not date_str:
            return None
        try:
            parsed_date = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            try:
                dt = datetime.fromisoformat(date_str)
            except ValueError:
                return None
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(tzinfo)
        return datetime(parsed_date.year, parsed_date.month, parsed_date.day, 8, 0, tzinfo=tzinfo)

    def _default_guardrail_segments(self) -> list[GuardrailSegment]:
        return [
            GuardrailSegment(
                name="Guardrail readiness",
                status=GuardrailStatus.watch,
                value=0.0,
                target=0.0,
                unit="usd",
                delta_pct=0.0,
                notes="Live guardrail telemetry unavailable; monitoring demo-safe defaults.",
            )
        ]

    def _default_automation_lanes(self, now: datetime) -> list[AutomationLane]:
        return [
            AutomationLane(
                name="Assist Guardrails",
                uptime_pct=DEFAULT_AUTOMATION_UPTIME,
                incidents_7d=0,
                last_incident_at=now - timedelta(hours=8),
                status=AutomationLaneStatus.normal,
                notes="Assist guardrails idle; ready for operator approvals.",
            ),
            AutomationLane(
                name="Automation engine Execution",
                uptime_pct=DEFAULT_AUTOMATION_UPTIME,
                incidents_7d=0,
                last_incident_at=None,
                status=AutomationLaneStatus.normal,
                notes="Automation engine standing by; enable once live telemetry streams in.",
            ),
        ]

    # --------------------------------------------------------------------- #
    # Demo fallback
    # --------------------------------------------------------------------- #

    def _fallback_dashboard(self, tenant_id: str) -> DashboardResponse:
        now = self.now_factory()
        generated_at = now.replace(microsecond=0)
        midnight = generated_at.replace(hour=0, minute=0, second=0, microsecond=0)
        offsets = [i for i in range(12)]
        sparkline_seed = [92 + self.random.uniform(-3, 4) for _ in offsets]

        guardrails = [
            GuardrailSegment(
                name="Budget adherence",
                status=GuardrailStatus.healthy,
                value=94.2,
                target=90.0,
                unit="pct",
                delta_pct=2.4,
                notes="Daily cap holding steady across channels.",
            ),
            GuardrailSegment(
                name="ROAS floor",
                status=GuardrailStatus.watch,
                value=3.1,
                target=3.0,
                unit="ratio",
                delta_pct=-0.8,
                notes="Meta creative fatigue pushing ROAS towards floor.",
            ),
            GuardrailSegment(
                name="CPA ceiling",
                status=GuardrailStatus.breach,
                value=54.5,
                target=50.0,
                unit="usd",
                delta_pct=6.9,
                notes="Automation engine paused for Apparel South due to storm drag.",
            ),
        ]

        spend_trackers = [
            SpendTracker(
                name="Meta Spend",
                channel="Paid Social",
                value=42500,
                change_pct=5.2,
                target=43000,
                unit="usd",
                sparkline=sparkline_seed,
            ),
            SpendTracker(
                name="Google Revenue",
                channel="Paid Search",
                value=132000,
                change_pct=3.6,
                target=128000,
                unit="usd",
                sparkline=[p * 1.08 for p in sparkline_seed],
            ),
            SpendTracker(
                name="Email Contribution",
                channel="Lifecycle",
                value=24000,
                change_pct=-1.5,
                target=23500,
                unit="usd",
                sparkline=[88 + self.random.uniform(-2, 3) for _ in offsets],
            ),
        ]

        weather_events = [
            WeatherRiskEvent(
                id="storm-midwest",
                title="Severe storm window",
                description="Cold front with hail risk across Chicago and Detroit markets.",
                severity=WeatherRiskSeverity.high,
                geo_region="Midwest USA",
                starts_at=midnight + timedelta(hours=6),
                ends_at=midnight + timedelta(hours=18),
                latitude=41.8781,
                longitude=-87.6298,
                weather_type="hail",
            ),
            WeatherRiskEvent(
                id="heatwave-south",
                title="Heat surge boosting demand",
                description="Apparel conversions trending +12% in Austin & Dallas.",
                severity=WeatherRiskSeverity.medium,
                geo_region="Texas",
                starts_at=midnight - timedelta(hours=12),
                ends_at=midnight + timedelta(hours=12),
                latitude=30.2672,
                longitude=-97.7431,
                weather_type="heatwave",
            ),
            WeatherRiskEvent(
                id="marine-layer",
                title="Marine layer dampening store visits",
                description="Expect slower coastal traffic until the marine layer clears.",
                severity=WeatherRiskSeverity.low,
                geo_region="SoCal Coast",
                starts_at=midnight,
                ends_at=midnight + timedelta(hours=9),
                latitude=34.0195,
                longitude=-118.4912,
                weather_type="fog",
            ),
        ]

        gulf_signature = "Gulf Coast|High-risk weather events incoming.|2025-10-14T16:00:00+00:00|2|3"
        pacific_signature = "Pacific Northwest|Monitoring heavy rain bands.|2025-10-15T08:00:00+00:00|1|1"
        gulf_view_count = 54
        gulf_focus_count = 19
        gulf_dismiss_count = 6
        pacific_view_count = 31
        pacific_focus_count = 11
        pacific_dismiss_count = 4
        suggestion_telemetry = [
            DashboardSuggestionTelemetry(
                signature=gulf_signature,
                region="Gulf Coast",
                reason="High-risk conditions detected. Next event in 2 hours. 2 high-risk alerts in queue.",
                view_count=gulf_view_count,
                focus_count=gulf_focus_count,
                dismiss_count=gulf_dismiss_count,
                high_risk_count=2,
                event_count=3,
                focus_rate=self._calculate_rate(gulf_focus_count, gulf_view_count),
                dismiss_rate=self._calculate_rate(gulf_dismiss_count, gulf_view_count),
                engagement_rate=self._calculate_rate(
                    gulf_focus_count + gulf_dismiss_count, gulf_view_count
                ),
                has_scheduled_start=True,
                next_event_starts_at=(midnight + timedelta(hours=16)).isoformat(),
                first_occurred_at=generated_at - timedelta(days=1, hours=2),
                last_occurred_at=generated_at - timedelta(hours=1),
                tenants=[tenant_id],
                severities=["high"],
                viewport_breakpoints=["desktop", "tablet"],
                metadata={
                    "layoutVariant": "dense",
                    "ctaShown": True,
                    "regionSlug": "gulf-coast",
                    "suggestionSummary": "3 events · 2 high-risk alerts · Next starts in 2 hours",
                    "regionSummary": "3 events · 2 high-risk alerts · Next starts in 2 hours",
                    "tenantMode": "demo",
                    "guardrailStatus": "watch",
                    "criticalAlertCount": 3,
                    "signature": gulf_signature,
                },
            ),
            DashboardSuggestionTelemetry(
                signature=pacific_signature,
                region="Pacific Northwest",
                reason="Monitoring heavy rain bands; shift spend to insulated regions.",
                view_count=pacific_view_count,
                focus_count=pacific_focus_count,
                dismiss_count=pacific_dismiss_count,
                high_risk_count=1,
                event_count=1,
                focus_rate=self._calculate_rate(pacific_focus_count, pacific_view_count),
                dismiss_rate=self._calculate_rate(pacific_dismiss_count, pacific_view_count),
                engagement_rate=self._calculate_rate(
                    pacific_focus_count + pacific_dismiss_count, pacific_view_count
                ),
                has_scheduled_start=True,
                next_event_starts_at=(midnight + timedelta(hours=32)).isoformat(),
                first_occurred_at=generated_at - timedelta(days=2, hours=5),
                last_occurred_at=generated_at - timedelta(hours=5),
                tenants=[tenant_id],
                severities=["medium"],
                viewport_breakpoints=["desktop"],
                metadata={
                    "layoutVariant": "dense",
                    "ctaShown": True,
                    "regionSlug": "pacific-northwest",
                    "suggestionSummary": "Rain bands approaching; prep reallocation.",
                    "regionSummary": "Rain bands approaching; prep reallocation.",
                    "tenantMode": "demo",
                    "guardrailStatus": "healthy",
                    "criticalAlertCount": 1,
                    "signature": pacific_signature,
                },
            ),
        ]

        automation = [
            AutomationLane(
                name="Assist Guardrails",
                uptime_pct=99.4,
                incidents_7d=1,
                last_incident_at=generated_at - timedelta(hours=14),
                status=AutomationLaneStatus.normal,
                notes="Operator acknowledged CPA drift within SLA.",
            ),
            AutomationLane(
                name="Automation engine Execution",
                uptime_pct=96.8,
                incidents_7d=2,
                last_incident_at=generated_at - timedelta(hours=6),
                status=AutomationLaneStatus.degraded,
                notes="Paused Apparel South while storm response recalibrates.",
            ),
        ]

        ingestion = [
            IngestionConnector(
                name="Shopify",
                source="Commerce",
                status=ConnectorStatus.healthy,
                lag_minutes=4,
                sla_minutes=10,
                last_synced_at=generated_at - timedelta(minutes=4),
                notes="Webhooks flowing normally.",
            ),
            IngestionConnector(
                name="Meta Ads",
                source="Paid Social",
                status=ConnectorStatus.delayed,
                lag_minutes=28,
                sla_minutes=15,
                last_synced_at=generated_at - timedelta(minutes=28),
                notes="Rate limiting triggered; retry backoff active.",
            ),
            IngestionConnector(
                name="Google Ads",
                source="Paid Search",
                status=ConnectorStatus.syncing,
                lag_minutes=12,
                sla_minutes=20,
                last_synced_at=generated_at - timedelta(minutes=12),
                notes="Sync resumed after nightly window.",
            ),
        ]

        alerts = [
            DashboardAlert(
                id="alert-apparel-south",
                title="CPA breach: Apparel South",
                detail="Automation engine paused pushes while CPA exceeds $50 ceiling.",
                severity=AlertSeverity.critical,
                occurred_at=generated_at - timedelta(minutes=35),
                acknowledged=False,
                acknowledged_at=None,
                escalated_to="On-call Operator",
                escalated_at=generated_at - timedelta(minutes=32),
                escalation_channel="slack",
                related_objects=["campaign:apparel-south", "guardrail:cpa"],
            ),
            DashboardAlert(
                id="alert-meta-rate",
                title="Meta rate limiting",
                detail="Meta Ads connector backing off; expect refreshed metrics in 15 minutes.",
                severity=AlertSeverity.warning,
                occurred_at=generated_at - timedelta(hours=1, minutes=10),
                acknowledged=True,
                acknowledged_at=generated_at - timedelta(hours=1),
                escalated_to=None,
                escalated_at=None,
                escalation_channel=None,
                related_objects=["connector:meta"],
            ),
            DashboardAlert(
                id="alert-weather-brief",
                title="Brief: Midwest hail window",
                detail="Share scenario with Priya so promo caps adjust before storm hits.",
                severity=AlertSeverity.info,
                occurred_at=generated_at - timedelta(hours=2),
                acknowledged=False,
                acknowledged_at=None,
                related_objects=["scenario:midwest-hail"],
                escalated_to=None,
                escalated_at=None,
                escalation_channel=None,
            ),
        ]

        self._apply_alert_acknowledgements(tenant_id, alerts)

        allocator_summary = self._default_allocator_summary(generated_at)
        weather_kpis = self._build_weather_kpis_snapshot(weather_events, generated_at)
        suggestion_summary = summarize_dashboard_suggestion_telemetry(suggestion_telemetry)

        return DashboardResponse(
            tenant_id=tenant_id,
            generated_at=generated_at,
            guardrails=guardrails,
            spend_trackers=spend_trackers,
            weather_events=weather_events,
            automation=automation,
            ingestion=ingestion,
            alerts=alerts,
            allocator=allocator_summary,
            weather_kpis=weather_kpis,
            suggestion_telemetry=suggestion_telemetry,
            suggestion_telemetry_summary=suggestion_summary,
            context_tags=["fallback", "demo"],
        )
