from __future__ import annotations

import json
import logging
import os
import random
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Sequence
from zoneinfo import ZoneInfo

from shared.data_context.service import ContextService, default_context_service
from shared.data_context.warnings import ContextWarningEngine, default_warning_engine
from shared.schemas.base import ContextWarning
from shared.schemas.dashboard import (
    AlertSeverity,
    AutomationLane,
    AutomationLaneStatus,
    ConnectorStatus,
    DashboardAlert,
    DashboardResponse,
    GuardrailSegment,
    GuardrailStatus,
    IngestionConnector,
    SpendTracker,
    WeatherRiskEvent,
    WeatherRiskSeverity,
)

DEFAULT_WEATHER_GEOHASH_OVERRIDES = {
    "demo-tenant": "9q8yy",
}
DEFAULT_AUTOMATION_UPTIME = 99.1


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
        weather_root: Path | str | None = None,
        fallback_tenant_id: str | None = "tenant-safety",
        context_service: ContextService | None = None,
        warning_engine: ContextWarningEngine | None = None,
        weather_geohash_overrides: dict[str, str] | None = None,
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
        self.weather_root = Path(weather_root or os.getenv("WEATHER_LAKE_ROOT", "storage/lake/weather")).expanduser()
        self.fallback_tenant_id = fallback_tenant_id
        self.context_service = context_service or default_context_service
        self.warning_engine = warning_engine or default_warning_engine
        self.weather_geohash_overrides = dict(DEFAULT_WEATHER_GEOHASH_OVERRIDES)
        if weather_geohash_overrides:
            self.weather_geohash_overrides.update(weather_geohash_overrides)
        self.now_factory = now_factory
        self.random = random.Random()

    async def get_dashboard(self, tenant_id: str) -> DashboardResponse:
        try:
            return self._build_dashboard(tenant_id)
        except Exception:
            self.logger.exception("Failed to assemble WeatherOps dashboard for tenant %s", tenant_id)
            return self._fallback_dashboard(tenant_id)

    # --------------------------------------------------------------------- #
    # Live telemetry assembly
    # --------------------------------------------------------------------- #

    def _build_dashboard(self, tenant_id: str) -> DashboardResponse:
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

        return DashboardResponse(
            tenant_id=tenant_id,
            generated_at=generated_at,
            guardrails=guardrails,
            spend_trackers=spend_trackers,
            weather_events=weather_events,
            automation=automation,
            ingestion=ingestion,
            alerts=alerts,
            context_tags=context_tags,
            context_warnings=context_warnings,
        )

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
        alerts = self._build_alerts(alerts_raw)
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
        autopilot_notes = "Autopilot executing pushes within policy."
        if critical_recent:
            autopilot_status = AutomationLaneStatus.degraded
            autopilot_notes = "Autopilot throttled after critical guardrail breach."
        elif any(str(alert.get("severity")).lower() == "warning" for alert in alerts_raw):
            autopilot_status = AutomationLaneStatus.degraded
            autopilot_notes = "Monitoring guardrail warnings before re-enabling full automation."

        autopilot_incidents = len(alerts_raw)
        autopilot_last = self._parse_datetime(alerts_raw[0].get("generated_at")) if alerts_raw else None
        lanes.append(
            AutomationLane(
                name="Autopilot Execution",
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

    def _build_alerts(self, alerts_raw: Sequence[dict[str, Any]]) -> list[DashboardAlert]:
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
                    escalated_to=None,
                    related_objects=codes,
                )
            )
        alerts.sort(key=lambda alert: alert.occurred_at, reverse=True)
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
                name="Autopilot Execution",
                uptime_pct=DEFAULT_AUTOMATION_UPTIME,
                incidents_7d=0,
                last_incident_at=None,
                status=AutomationLaneStatus.normal,
                notes="Autopilot standing by; enable once live telemetry streams in.",
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
                notes="Autopilot paused for Apparel South due to storm drag.",
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
                name="Autopilot Execution",
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
                detail="Autopilot paused pushes while CPA exceeds $50 ceiling.",
                severity=AlertSeverity.critical,
                occurred_at=generated_at - timedelta(minutes=35),
                acknowledged=False,
                escalated_to="On-call Operator",
                related_objects=["campaign:apparel-south", "guardrail:cpa"],
            ),
            DashboardAlert(
                id="alert-meta-rate",
                title="Meta rate limiting",
                detail="Meta Ads connector backing off; expect refreshed metrics in 15 minutes.",
                severity=AlertSeverity.warning,
                occurred_at=generated_at - timedelta(hours=1, minutes=10),
                acknowledged=True,
                escalated_to=None,
                related_objects=["connector:meta"],
            ),
            DashboardAlert(
                id="alert-weather-brief",
                title="Brief: Midwest hail window",
                detail="Share scenario with Priya so promo caps adjust before storm hits.",
                severity=AlertSeverity.info,
                occurred_at=generated_at - timedelta(hours=2),
                acknowledged=False,
                related_objects=["scenario:midwest-hail"],
            ),
        ]

        return DashboardResponse(
            tenant_id=tenant_id,
            generated_at=generated_at,
            guardrails=guardrails,
            spend_trackers=spend_trackers,
            weather_events=weather_events,
            automation=automation,
            ingestion=ingestion,
            alerts=alerts,
            context_tags=["fallback", "demo"],
        )
