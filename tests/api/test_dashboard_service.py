from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from apps.api.services.dashboard_service import DashboardService
from shared.schemas.dashboard import GuardrailStatus
from shared.data_context.service import ContextService


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
