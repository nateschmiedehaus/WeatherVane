from __future__ import annotations

import json

import polars as pl

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

    roas_values = [row["roas_adjusted"] for row in payload["creatives"]]
    assert payload["top_creatives"][0]["roas_adjusted"] == max(roas_values)
