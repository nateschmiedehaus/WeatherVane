from __future__ import annotations

import json

import polars as pl
import pytest

from apps.model.creative_response import (
    BrandSafetyPolicy,
    generate_response_report,
    generate_synthetic_creative_dataset,
    score_creatives,
)


def test_score_creatives_applies_brand_safety_and_roas_guardrails() -> None:
    frame = pl.DataFrame(
        [
            {
                "creative_id": "safe",
                "channel": "meta",
                "impressions": 5200,
                "clicks": 290,
                "conversions": 52,
                "spend": 780.0,
                "revenue": 2120.0,
                "brand_safety_score": 0.91,
            },
            {
                "creative_id": "warn",
                "channel": "meta",
                "impressions": 1400,
                "clicks": 68,
                "conversions": 5,
                "spend": 420.0,
                "revenue": 360.0,
                "brand_safety_score": 0.55,
            },
            {
                "creative_id": "block",
                "channel": "meta",
                "impressions": 4600,
                "clicks": 150,
                "conversions": 18,
                "spend": 640.0,
                "revenue": 720.0,
                "brand_safety_score": 0.18,
            },
        ]
    )
    policy = BrandSafetyPolicy(roas_floor=1.3, warn_threshold=0.65, block_threshold=0.3, min_impressions=200)
    scored = score_creatives(frame, policy)
    rows = {row["creative_id"]: row for row in scored.to_dicts()}

    assert rows["safe"]["status"] == "active"
    assert rows["safe"]["guardrail"] is None
    assert rows["safe"]["roas_adjusted"] > policy.roas_floor

    assert rows["warn"]["status"] == "watchlist"
    assert rows["warn"]["guardrail"] == "brand_safety_watch"
    assert rows["warn"]["guardrail_factor"] < 1.0
    assert rows["warn"]["brand_safety_factor"] < 1.0
    assert rows["warn"]["roas_adjusted"] < policy.roas_floor

    assert rows["block"]["status"] == "blocked"
    assert rows["block"]["guardrail"] == "brand_safety_block"
    assert rows["block"]["guardrail_factor"] == 0.0
    assert rows["block"]["roas_adjusted"] == 0.0


def test_generate_response_report_persists_json(tmp_path) -> None:
    policy = BrandSafetyPolicy(roas_floor=1.2, warn_threshold=0.6, block_threshold=0.3)
    frame = generate_synthetic_creative_dataset(creatives=7, seed=19)
    destination = tmp_path / "report.json"

    report = generate_response_report(frame, policy, output_path=destination)
    payload = json.loads(destination.read_text(encoding="utf-8"))

    assert destination.exists()
    assert payload["summary"]["creative_count"] == len(payload["creatives"])
    assert len(payload["creatives"]) == len(report["creatives"])
    assert payload["policy"]["roas_floor"] == policy.roas_floor
    assert "active_spend_share" in payload["summary"]
    assert "watchlist_spend_share" in payload["summary"]
    assert "blocked_spend_share" in payload["summary"]
    assert "channel_guardrails" in payload
    assert isinstance(payload["channel_guardrails"], list)
    assert pytest.approx(
        payload["summary"]["active_spend_share"]
        + payload["summary"]["watchlist_spend_share"]
        + payload["summary"]["blocked_spend_share"],
        rel=1e-6,
    ) == 1.0
    guardrail_counts = payload["summary"].get("guardrail_counts", {})
    assert isinstance(guardrail_counts, dict)
    assert set(guardrail_counts) <= {
        "brand_safety_block",
        "brand_safety_watch",
        "low_roas",
        "limited_sample",
    }


def test_channel_guardrails_capture_flagged_mix(tmp_path) -> None:
    frame = pl.DataFrame(
        [
            {
                "creative_id": "meta_safe",
                "channel": "meta",
                "impressions": 6200,
                "clicks": 430,
                "conversions": 82,
                "spend": 960.0,
                "revenue": 2985.0,
                "brand_safety_score": 0.9,
            },
            {
                "creative_id": "meta_risky",
                "channel": "meta",
                "impressions": 2600,
                "clicks": 94,
                "conversions": 12,
                "spend": 540.0,
                "revenue": 420.0,
                "brand_safety_score": 0.4,
            },
            {
                "creative_id": "display_blocked",
                "channel": "display",
                "impressions": 1800,
                "clicks": 44,
                "conversions": 4,
                "spend": 320.0,
                "revenue": 160.0,
                "brand_safety_score": 0.2,
            },
        ]
    )
    policy = BrandSafetyPolicy(roas_floor=1.25, warn_threshold=0.65, block_threshold=0.35)
    destination = tmp_path / "channel-report.json"

    report = generate_response_report(frame, policy, output_path=destination)
    payload = json.loads(destination.read_text(encoding="utf-8"))

    channel_guardrails = {entry["channel"]: entry for entry in report["channel_guardrails"]}
    payload_guardrails = {entry["channel"]: entry for entry in payload["channel_guardrails"]}

    assert set(channel_guardrails) == {"meta", "display"}
    assert set(payload_guardrails) == {"meta", "display"}

    meta_summary = channel_guardrails["meta"]
    assert meta_summary["creative_count"] == 2
    assert meta_summary["flagged_creatives"] == 1
    assert meta_summary["flagged_creatives"] == meta_summary["watchlist_creatives"] + meta_summary["blocked_creatives"]
    assert meta_summary["flagged_spend_share"] == pytest.approx(
        meta_summary["watchlist_spend_share"] + meta_summary["blocked_spend_share"]
    )
    assert meta_summary["representative_creative"] == "meta_risky"
    assert meta_summary["representative_status"] == "watchlist"
    assert meta_summary["top_guardrail"] in {"brand_safety_watch", "low_roas"}
    assert meta_summary["top_guardrail_count"] >= 1

    display_summary = channel_guardrails["display"]
    assert display_summary["creative_count"] == 1
    assert display_summary["blocked_creatives"] == 1
    assert display_summary["representative_creative"] == "display_blocked"
    assert display_summary["representative_status"] == "blocked"
    assert display_summary["top_guardrail"] == "brand_safety_block"
    assert display_summary["top_guardrail_count"] == 1
    assert display_summary["flagged_spend_share"] == pytest.approx(display_summary["blocked_spend_share"])

    assert payload_guardrails["meta"]["representative_creative"] == "meta_risky"
    assert payload_guardrails["display"]["top_guardrail"] == "brand_safety_block"

    roas_values = [row["roas_adjusted"] for row in payload["creatives"]]
    assert payload["top_creatives"][0]["roas_adjusted"] == max(roas_values)
