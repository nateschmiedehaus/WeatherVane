from __future__ import annotations

import json

from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.services import creative_service


def test_get_creative_response_returns_payload(monkeypatch, tmp_path):
    destination = tmp_path / "creative.json"
    destination.write_text(
        json.dumps(
            {
                "generated_at": "2025-01-01T00:00:00Z",
                "policy": {
                    "roas_floor": 1.2,
                    "warn_threshold": 0.6,
                    "block_threshold": 0.3,
                    "min_impressions": 200,
                },
                "summary": {
                    "creative_count": 2,
                    "active_creatives": 1,
                    "blocked_creatives": 0,
                    "watchlist_creatives": 1,
                    "average_roas": 2.4,
                    "median_roas": 2.25,
                    "active_spend_share": 0.6,
                    "watchlist_spend_share": 0.4,
                    "blocked_spend_share": 0.0,
                    "guardrail_counts": {"brand_safety_watch": 1},
                },
                "top_creatives": [
                    {
                        "creative_id": "cr_001",
                        "channel": "meta",
                        "roas_adjusted": 2.75,
                        "brand_safety_score": 0.91,
                        "status": "active",
                    }
                ],
                "creatives": [
                    {
                        "creative_id": "cr_001",
                        "channel": "meta",
                        "impressions": 1200,
                        "clicks": 84,
                        "conversions": 12,
                        "spend": 420.0,
                        "revenue": 1155.0,
                        "brand_safety_score": 0.91,
                        "brand_safety_tier": "safe",
                        "brand_safety_factor": 1.0,
                        "sample_size_factor": 1.0,
                        "ctr": 0.07,
                        "cvr": 0.14,
                        "aov": 96.25,
                        "roas_smoothed": 2.75,
                        "roas_adjusted": 2.75,
                        "guardrail_factor": 1.0,
                        "status": "active",
                        "guardrail": None,
                        "spend_share": 0.6,
                        "profit_expectation": 1.55,
                    },
                    {
                        "creative_id": "cr_002",
                        "channel": "search",
                        "impressions": 980,
                        "clicks": 45,
                        "conversions": 6,
                        "spend": 360.0,
                        "revenue": 720.0,
                        "brand_safety_score": 0.48,
                        "brand_safety_tier": "watchlist",
                        "brand_safety_factor": 0.7,
                        "sample_size_factor": 0.9,
                        "ctr": 0.0459,
                        "cvr": 0.1333,
                        "aov": 120.0,
                        "roas_smoothed": 2.0,
                        "roas_adjusted": 1.26,
                        "guardrail_factor": 0.63,
                        "status": "watchlist",
                        "guardrail": "brand_safety_watch",
                        "spend_share": 0.4,
                        "profit_expectation": 0.06,
                    },
                ],
                "channel_guardrails": [
                    {
                        "channel": "meta",
                        "creative_count": 2,
                        "active_creatives": 1,
                        "watchlist_creatives": 1,
                        "blocked_creatives": 0,
                        "flagged_creatives": 1,
                        "active_spend_share": 0.6,
                        "watchlist_spend_share": 0.4,
                        "blocked_spend_share": 0.0,
                        "flagged_spend_share": 0.4,
                        "average_roas": 2.38,
                        "average_brand_safety": 0.695,
                        "top_guardrail": "brand_safety_watch",
                        "top_guardrail_count": 1,
                        "representative_creative": "cr_002",
                        "representative_status": "watchlist",
                    }
                ],
            }
        )
    )
    monkeypatch.setattr(creative_service, "DEFAULT_CREATIVE_PATH", destination)

    client = TestClient(app)
    response = client.get("/v1/creative/demo-tenant")
    assert response.status_code == 200
    payload = response.json()
    assert payload["policy"]["roas_floor"] == 1.2
    assert len(payload["creatives"]) == 2
    assert payload["top_creatives"][0]["creative_id"] == "cr_001"
    assert payload["summary"]["active_spend_share"] == 0.6
    assert payload["summary"]["watchlist_spend_share"] == 0.4
    assert payload["summary"]["guardrail_counts"]["brand_safety_watch"] == 1
    assert payload["channel_guardrails"][0]["channel"] == "meta"
    assert payload["channel_guardrails"][0]["representative_creative"] == "cr_002"
