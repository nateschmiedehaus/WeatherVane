from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from apps.api.services.dashboard_service import DashboardService
from shared.schemas.dashboard import GuardrailStatus
from shared.data_context.service import ContextService
from shared.services.dashboard_analytics_summary import summarize_dashboard_suggestion_telemetry


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2))


@pytest.mark.asyncio
async def test_dashboard_service_aggregates_live_telemetry(tmp_path: Path) -> None:
    tenant_id = "demo-tenant"
    now = datetime(2025, 10, 14, 9, 0, tzinfo=timezone.utc)

    ingestion_root = tmp_path / "ingestion"
    _write_json(
        ingestion_root / f"{tenant_id}_ads.json",
        {
            "updated_at": "2025-10-14T08:40:00+00:00",
            "last_end": "2025-10-14T08:35:00+00:00",
            "meta_rows": 24,
            "google_rows": 19,
            "source": "stub",
        },
    )
    _write_json(
        ingestion_root / f"{tenant_id}_shopify.json",
        {
            "updated_at": "2025-10-14T08:45:00+00:00",
            "last_end": "2025-10-14T08:43:00+00:00",
            "orders_row_count": 128,
            "orders_geocoded_ratio": 0.92,
        },
    )
    _write_json(
        ingestion_root / f"{tenant_id}_promo.json",
        {
            "updated_at": "2025-10-14T08:20:00+00:00",
            "last_end": "2025-10-14T08:19:00+00:00",
            "promo_rows": 6,
        },
    )

    ad_push_root = tmp_path / "state"
    _write_json(
        ad_push_root / "ad_push_diffs.json",
        [
            {
                "tenant_id": tenant_id,
                "generated_at": "2025-10-14T08:15:00+00:00",
                "spend_guardrail_report": {
                    "totals": {
                        "baseline_spend": 640.0,
                        "proposed_spend": 410.0,
                        "spend_delta": -230.0,
                        "percent_delta": -35.94,
                    },
                    "guardrails": [
                        {
                            "code": "platform_spend_below_minimum",
                            "severity": "critical",
                            "message": "meta spend (110.00) falls below minimum spend of 200.00",
                        }
                    ],
                    "platforms": [
                        {
                            "platform": "meta",
                            "baseline_spend": 320.0,
                            "proposed_spend": 110.0,
                            "spend_delta": -210.0,
                            "percent_delta": -65.62,
                            "guardrails": [
                                {
                                    "code": "platform_spend_below_minimum",
                                    "severity": "critical",
                                    "message": "meta spend (110.00) falls below minimum spend of 200.00",
                                }
                            ],
                        },
                        {
                            "platform": "google",
                            "baseline_spend": 320.0,
                            "proposed_spend": 300.0,
                            "spend_delta": -20.0,
                            "percent_delta": -6.25,
                            "guardrails": [
                                {
                                    "code": "platform_spend_delta_exceeds_limit",
                                    "severity": "warning",
                                    "message": "google spend changed by -6.2% exceeding limit of 5.0%",
                                }
                            ],
                        },
                    ],
                },
            }
        ],
    )
    _write_json(
        ad_push_root / "ad_push_alerts.json",
        [
            {
                "tenant_id": tenant_id,
                "run_id": "adpush-202510140815",
                "generated_at": "2025-10-14T08:18:00+00:00",
                "severity": "critical",
                "codes": ["platform_spend_below_minimum"],
                "message": "Critical guardrail breaches detected; rollback recommended.",
            }
        ],
    )

    weather_root = tmp_path / "weather"
    _write_json(
        weather_root / "9q8yy" / "2025-10-14__2025-10-16.json",
        {
            "latitude": 37.7749,
            "longitude": -122.4194,
            "timezone": "America/Los_Angeles",
            "generated_at": "2025-10-14T07:00:00+00:00",
            "daily": {
                "time": ["2025-10-13", "2025-10-14", "2025-10-15"],
                "observation_type": ["observed", "forecast", "forecast"],
                "precipitation_sum": [0.0, 18.0, 2.0],
                "precipitation_probability_max": [10, 85, 25],
                "temperature_2m_max": [19.0, 25.0, 27.0],
                "temperature_2m_mean": [16.0, 21.0, 24.0],
                "windspeed_10m_max": [12.0, 32.0, 18.0],
            },
        },
    )

    context_root = tmp_path / "context"
    _write_json(
        context_root / f"{tenant_id}_2025-10-13T00-00-00.json",
        {
            "tenant_id": tenant_id,
            "created_at": "2025-10-13T00:00:00",
            "dataset_profiles": [],
            "tags": ["ads.sparse"],
            "metadata": {},
        },
    )
    context_service = ContextService(root=context_root)

    service = DashboardService(
        ingestion_state_root=ingestion_root,
        ad_push_diff_path=ad_push_root / "ad_push_diffs.json",
        ad_push_alerts_path=ad_push_root / "ad_push_alerts.json",
        weather_root=weather_root,
        context_service=context_service,
        weather_geohash_overrides={tenant_id: "9q8yy"},
        now_factory=lambda: now,
    )

    dashboard = await service.get_dashboard(tenant_id)

    assert dashboard.tenant_id == tenant_id
    assert dashboard.guardrails
    assert any(segment.status in {GuardrailStatus.watch, GuardrailStatus.breach} for segment in dashboard.guardrails)
    assert dashboard.spend_trackers
    assert dashboard.automation
    assert dashboard.ingestion
    assert any(connector.name == "Shopify" for connector in dashboard.ingestion)
    assert dashboard.alerts
    assert dashboard.weather_events
    assert "ads.sparse" in dashboard.context_tags
    assert dashboard.generated_at.tzinfo is not None


@pytest.mark.asyncio
async def test_dashboard_service_surfaces_suggestion_telemetry(tmp_path: Path) -> None:
    tenant_id = "demo-tenant"
    now = datetime(2025, 10, 18, 12, 0, tzinfo=timezone.utc)
    metrics_file = tmp_path / "metrics.jsonl"
    signature = "Gulf Coast|High-risk weather events incoming.|2025-05-01T14:00:00Z|2|3"

    metrics_records = [
        {
            "timestamp": "2025-10-18T11:50:00Z",
            "event": "dashboard.weather_focus.suggestion",
            "payload": {
                "tenant_id": tenant_id,
                "event": "dashboard.weather_focus.suggestion.view",
                "region": "Gulf Coast",
                "severity": "high",
                "high_risk_count": 2,
                "event_count": 3,
                "next_event_starts_at": "2025-05-01T14:00:00Z",
                "has_scheduled_start": True,
                "viewport_breakpoint": "desktop",
                "reason": "High-risk weather events incoming.",
                "occurred_at": "2025-10-18T11:49:00Z",
                "metadata": {
                    "layoutVariant": "dense",
                    "ctaShown": True,
                    "tenantMode": "live",
                    "guardrailStatus": "watch",
                    "criticalAlertCount": 4,
                    "regionSummary": "3 events · 2 high-risk alerts · Next starts in 2 hours",
                    "signature": signature,
                },
            },
        },
        {
            "timestamp": "2025-10-18T11:55:00Z",
            "event": "dashboard.weather_focus.suggestion",
            "payload": {
                "tenant_id": tenant_id,
                "event": "dashboard.weather_focus.suggestion.focus",
                "region": "Gulf Coast",
                "severity": "high",
                "high_risk_count": 2,
                "event_count": 3,
                "next_event_starts_at": "2025-05-01T14:00:00Z",
                "has_scheduled_start": True,
                "viewport_breakpoint": "desktop",
                "reason": "High-risk weather events incoming.",
                "occurred_at": "2025-10-18T11:54:00Z",
                "metadata": {
                    "layoutVariant": "dense",
                    "ctaShown": False,
                    "tenantMode": "live",
                    "guardrailStatus": "watch",
                    "criticalAlertCount": 4,
                },
            },
        },
        {
            "timestamp": "2025-10-18T11:57:00Z",
            "event": "dashboard.weather_focus.suggestion",
            "payload": {
                "tenant_id": "alt-tenant",
                "event": "dashboard.weather_focus.suggestion.view",
                "region": "Pacific Northwest",
                "severity": "medium",
                "high_risk_count": 1,
                "event_count": 1,
                "next_event_starts_at": "2025-05-01T18:00:00Z",
                "has_scheduled_start": True,
                "viewport_breakpoint": "desktop",
                "reason": "Monitoring heavy rain bands.",
                "occurred_at": "2025-10-18T11:56:00Z",
                "metadata": {
                    "layoutVariant": "dense",
                    "ctaShown": True,
                    "tenantMode": "live",
                    "guardrailStatus": "healthy",
                    "criticalAlertCount": 1,
                    "regionSummary": "Rain bands approaching; prep reallocation.",
                    "signature": "Pacific Northwest|Monitoring heavy rain bands.|2025-05-01T18:00:00Z|1|1",
                },
            },
        },
        {
            "timestamp": "2025-10-18T11:59:00Z",
            "event": "dashboard.weather_focus.suggestion",
            "payload": {
                "tenant_id": "alt-tenant",
                "event": "dashboard.weather_focus.suggestion.focus",
                "region": "Pacific Northwest",
                "severity": "medium",
                "high_risk_count": 1,
                "event_count": 1,
                "next_event_starts_at": "2025-05-01T18:00:00Z",
                "has_scheduled_start": True,
                "viewport_breakpoint": "desktop",
                "reason": "Monitoring heavy rain bands.",
                "occurred_at": "2025-10-18T11:58:00Z",
                "metadata": {
                    "layoutVariant": "dense",
                    "ctaShown": False,
                    "tenantMode": "live",
                    "guardrailStatus": "healthy",
                    "criticalAlertCount": 1,
                    "signature": "Pacific Northwest|Monitoring heavy rain bands.|2025-05-01T18:00:00Z|1|1",
                },
            },
        },
    ]

    metrics_file.write_text("\n".join(json.dumps(record) for record in metrics_records))

    service = DashboardService(
        suggestion_metrics_path=metrics_file,
        now_factory=lambda: now,
        ingestion_state_root=tmp_path / "ingestion",
        ad_push_diff_path=tmp_path / "state" / "ad_push_diffs.json",
        ad_push_alerts_path=tmp_path / "state" / "ad_push_alerts.json",
        alert_ack_path=tmp_path / "state" / "alert_ack.json",
        weather_root=tmp_path / "weather",
    )

    dashboard = await service.get_dashboard(tenant_id)

    assert dashboard.suggestion_telemetry, "expected suggestion telemetry to be surfaced"
    telemetry = dashboard.suggestion_telemetry[0]
    assert telemetry.signature == signature
    assert telemetry.view_count == 1
    assert telemetry.focus_count == 1
    assert telemetry.dismiss_count == 0
    assert telemetry.focus_rate == 1.0
    assert dashboard.suggestion_telemetry_summary is not None
    summary = dashboard.suggestion_telemetry_summary
    assert summary.total_suggestions == len(dashboard.suggestion_telemetry)
    assert summary.top_signature == signature
    assert summary.top_guardrail_status == "watch"
    assert telemetry.dismiss_rate == 0.0
    assert telemetry.engagement_rate == 1.0
    assert telemetry.metadata.get("guardrailStatus") == "watch"
    assert telemetry.metadata.get("ctaShown") is True
    assert telemetry.tenants == ["demo-tenant"]
    assert summary.average_focus_rate == pytest.approx(1.0)
    assert summary.average_dismiss_rate == pytest.approx(0.0)
    assert summary.average_engagement_rate == pytest.approx(1.0)


@pytest.mark.asyncio
async def test_dashboard_service_since_filters_suggestion_telemetry(tmp_path: Path) -> None:
    tenant_id = "demo-tenant"
    now = datetime(2025, 10, 18, 12, 0, tzinfo=timezone.utc)
    cutoff = now - timedelta(days=1)
    older_timestamp = (now - timedelta(days=2)).isoformat().replace("+00:00", "Z")
    older_occurred_at = (now - timedelta(days=2, minutes=5)).isoformat().replace("+00:00", "Z")
    recent_timestamp = (now - timedelta(minutes=2)).isoformat().replace("+00:00", "Z")
    recent_occurred_at = (now - timedelta(minutes=3)).isoformat().replace("+00:00", "Z")
    signature = "Gulf Coast|High-risk weather events incoming.|2025-05-01T14:00:00Z|2|3"

    records = [
        {
            "timestamp": older_timestamp,
            "event": "dashboard.weather_focus.suggestion",
            "payload": {
                "tenant_id": tenant_id,
                "event": "dashboard.weather_focus.suggestion.view",
                "region": "Gulf Coast",
                "severity": "high",
                "high_risk_count": 2,
                "event_count": 3,
                "next_event_starts_at": "2025-05-01T14:00:00Z",
                "has_scheduled_start": True,
                "viewport_breakpoint": "desktop",
                "reason": "High-risk weather events incoming.",
                "occurred_at": older_occurred_at,
                "metadata": {
                    "layoutVariant": "dense",
                    "ctaShown": True,
                    "tenantMode": "live",
                    "guardrailStatus": "watch",
                    "criticalAlertCount": 4,
                    "regionSummary": "Legacy event prior to cutoff.",
                    "signature": signature,
                },
            },
        },
        {
            "timestamp": recent_timestamp,
            "event": "dashboard.weather_focus.suggestion",
            "payload": {
                "tenant_id": tenant_id,
                "event": "dashboard.weather_focus.suggestion.view",
                "region": "Gulf Coast",
                "severity": "high",
                "high_risk_count": 2,
                "event_count": 3,
                "next_event_starts_at": "2025-05-01T14:00:00Z",
                "has_scheduled_start": True,
                "viewport_breakpoint": "desktop",
                "reason": "High-risk weather events incoming.",
                "occurred_at": recent_occurred_at,
                "metadata": {
                    "layoutVariant": "dense",
                    "ctaShown": True,
                    "tenantMode": "live",
                    "guardrailStatus": "watch",
                    "criticalAlertCount": 4,
                    "regionSummary": "Recent event to retain after cutoff.",
                    "signature": signature,
                },
            },
        },
        {
            "timestamp": now.isoformat().replace("+00:00", "Z"),
            "event": "dashboard.weather_focus.suggestion",
            "payload": {
                "tenant_id": tenant_id,
                "event": "dashboard.weather_focus.suggestion.focus",
                "region": "Gulf Coast",
                "severity": "high",
                "high_risk_count": 2,
                "event_count": 3,
                "next_event_starts_at": "2025-05-01T14:00:00Z",
                "has_scheduled_start": True,
                "viewport_breakpoint": "desktop",
                "reason": "High-risk weather events incoming.",
                "occurred_at": now.isoformat().replace("+00:00", "Z"),
                "metadata": {
                    "layoutVariant": "dense",
                    "ctaShown": False,
                    "tenantMode": "live",
                    "guardrailStatus": "watch",
                    "criticalAlertCount": 4,
                    "signature": signature,
                },
            },
        },
    ]

    metrics_file = tmp_path / "metrics.jsonl"
    metrics_file.write_text("\n".join(json.dumps(record) for record in records))

    service = DashboardService(
        suggestion_metrics_path=metrics_file,
        now_factory=lambda: now,
        ingestion_state_root=tmp_path / "ingestion",
        ad_push_diff_path=tmp_path / "state" / "ad_push_diffs.json",
        ad_push_alerts_path=tmp_path / "state" / "ad_push_alerts.json",
        alert_ack_path=tmp_path / "state" / "alert_ack.json",
        weather_root=tmp_path / "weather",
    )

    dashboard = await service.get_dashboard(tenant_id, since=cutoff)

    telemetry = dashboard.suggestion_telemetry
    assert telemetry, "expected suggestion telemetry to be surfaced after cutoff"
    assert len(telemetry) == 1
    entry = telemetry[0]
    assert entry.view_count == 1, "expected only post-cutoff views to be counted"
    assert entry.focus_count == 1, "expected only post-cutoff focus events to be counted"
    assert entry.last_occurred_at is not None
    assert entry.last_occurred_at >= cutoff
    assert dashboard.suggestion_telemetry_summary is not None
    summary = dashboard.suggestion_telemetry_summary
    assert summary.total_suggestions == 1
    assert summary.total_view_count == 1
    assert summary.total_focus_count == 1
    assert summary.average_focus_rate == pytest.approx(1.0)


def test_fallback_dashboard_includes_suggestion_telemetry() -> None:
    now = datetime(2025, 10, 18, 12, 0, tzinfo=timezone.utc)
    service = DashboardService(now_factory=lambda: now)

    fallback = service._fallback_dashboard("demo-tenant")

    assert fallback.suggestion_telemetry
    assert fallback.suggestion_telemetry_summary is not None
    summary = fallback.suggestion_telemetry_summary
    expected = summarize_dashboard_suggestion_telemetry(fallback.suggestion_telemetry)
    assert summary.model_dump(mode="json") == expected.model_dump(mode="json")
    assert "signature" in fallback.suggestion_telemetry[0].metadata
    assert any(entry.metadata.get("ctaShown") is True for entry in fallback.suggestion_telemetry)


def test_calculate_rate_handles_boundaries() -> None:
    assert DashboardService._calculate_rate(0, 10) == 0.0
    assert DashboardService._calculate_rate(5, 0) == 0.0
    assert DashboardService._calculate_rate(-1, 10) == 0.0
    assert DashboardService._calculate_rate(5, 10) == 0.5
    assert DashboardService._calculate_rate(15, 10) == 1.0


@pytest.mark.asyncio
async def test_acknowledge_alert_persists_and_updates_dashboard(tmp_path: Path) -> None:
    tenant_id = "tenant-ack"
    now = datetime(2025, 10, 14, 12, 0, tzinfo=timezone.utc)

    ad_push_root = tmp_path / "state"
    _write_json(
        ad_push_root / "ad_push_alerts.json",
        [
            {
                "tenant_id": tenant_id,
                "run_id": "alert-run-1",
                "generated_at": "2025-10-14T11:45:00+00:00",
                "severity": "critical",
                "codes": ["guardrail:cpa"],
                "message": "CPA breach detected; rollback recommended.",
            }
        ],
    )

    service = DashboardService(
        ad_push_alerts_path=ad_push_root / "ad_push_alerts.json",
        alert_ack_path=ad_push_root / "alert_ack.json",
        now_factory=lambda: now,
    )

    dashboard = await service.get_dashboard(tenant_id)
    assert dashboard.alerts
    target_alert = dashboard.alerts[0]
    assert target_alert.acknowledged is False

    record = service.acknowledge_alert(tenant_id, target_alert.id, acknowledged_by="leo")
    assert record.alert_id == target_alert.id
    assert record.acknowledged_by == "leo"

    ack_path = ad_push_root / "alert_ack.json"
    stored = json.loads(ack_path.read_text())
    assert f"{tenant_id}:{target_alert.id}" in stored

    refreshed = await service.get_dashboard(tenant_id)
    refreshed_ids = {alert.id: alert for alert in refreshed.alerts}
    assert refreshed_ids[target_alert.id].acknowledged is True


@pytest.mark.asyncio
async def test_escalate_alert_records_destination(tmp_path: Path) -> None:
    tenant_id = "tenant-escalate"
    now = datetime(2025, 10, 15, 9, 30, tzinfo=timezone.utc)

    ad_push_root = tmp_path / "state"
    _write_json(
        ad_push_root / "ad_push_alerts.json",
        [
            {
                "tenant_id": tenant_id,
                "run_id": "alert-run-2",
                "generated_at": "2025-10-15T09:10:00+00:00",
                "severity": "critical",
                "codes": ["guardrail:cpa"],
                "message": "CPA breach detected; rollback recommended.",
            }
        ],
    )

    service = DashboardService(
        ad_push_alerts_path=ad_push_root / "ad_push_alerts.json",
        alert_ack_path=ad_push_root / "alert_ack.json",
        now_factory=lambda: now,
    )

    dashboard = await service.get_dashboard(tenant_id)
    assert dashboard.alerts
    target_alert = dashboard.alerts[0]
    assert target_alert.escalated_to is None

    record = service.escalate_alert(tenant_id, target_alert.id, channel="slack", target="#weather-ops")
    assert record.alert_id == target_alert.id
    assert record.channel == "slack"
    assert record.target == "#weather-ops"

    ack_path = ad_push_root / "alert_ack.json"
    stored = json.loads(ack_path.read_text())
    key = f"{tenant_id}:{target_alert.id}"
    assert key in stored
    assert stored[key]["escalated_to"] == "#weather-ops"
    assert stored[key]["escalated_channel"] == "slack"
    assert "acknowledged_at" not in stored[key]

    refreshed = await service.get_dashboard(tenant_id)
    refreshed_alerts = {alert.id: alert for alert in refreshed.alerts}
    refreshed_alert = refreshed_alerts[target_alert.id]
    assert refreshed_alert.escalated_to == "#weather-ops"
    assert refreshed_alert.acknowledged is False
