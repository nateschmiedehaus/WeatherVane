from __future__ import annotations

from datetime import datetime, timezone

import pytest

from shared.libs.diffs import AdPushDiffBuilder, load_nodes_from_payload
from shared.schemas.base import GuardrailSettings


@pytest.fixture(name="guardrails")
def guardrails_fixture() -> GuardrailSettings:
    return GuardrailSettings(
        max_daily_budget_delta_pct=15.0,
        min_daily_spend=75.0,
    )


def _build_payload(daily_budget: float, *, platform: str = "meta") -> dict[str, object]:
    return {
        "entity_type": "ad_set",
        "entity_id": "adset-123",
        "name": "Prospecting Set",
        "metadata": {"platform": platform},
        "sections": {
            "spend": {
                "daily_budget": {
                    "field_path": "ad_set.daily_budget",
                    "label": "Daily budget",
                    "kind": "numeric",
                    "unit": "usd",
                    "value": daily_budget,
                }
            },
            "audience": {
                "geo_targets": {
                    "field_path": "ad_set.targeting.geo_locations",
                    "label": "Geo targeting",
                    "kind": "set",
                    "value": ["US", "CA"],
                }
            },
        },
    }


def test_budget_increase_triggers_guardrail(guardrails: GuardrailSettings) -> None:
    baseline_nodes = load_nodes_from_payload({"entities": [_build_payload(100.0)]})
    proposed_nodes = load_nodes_from_payload({"entities": [_build_payload(140.0)]})

    builder = AdPushDiffBuilder(guardrails)
    diff = builder.build(
        baseline_nodes=baseline_nodes,
        proposed_nodes=proposed_nodes,
        tenant_id="tenant-1",
        run_id="run-001",
        generation_mode="assist",
        generated_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
    )

    assert diff.entities, "expected at least one entity diff"
    entity = diff.entities[0]
    spend_section = next(
        section for section in entity.sections if section.section.value == "spend"
    )
    change = next(
        field for field in spend_section.changes if field.field_path == "ad_set.daily_budget"
    )
    assert change.delta == pytest.approx(40.0)
    assert change.percent_delta == pytest.approx(40.0)
    assert change.guardrails, "expected guardrail breach for budget increase"
    assert change.guardrails[0].code == "budget_delta_exceeds_limit"

    summary_metric = next(
        metric for metric in diff.summary if metric.name == "total_spend_delta"
    )
    assert summary_metric.value == pytest.approx(40.0)


def test_minimum_spend_guardrail(guardrails: GuardrailSettings) -> None:
    baseline_nodes: list = []
    proposed_payload = _build_payload(20.0)
    proposed_nodes = load_nodes_from_payload({"entities": [proposed_payload]})

    builder = AdPushDiffBuilder(guardrails)
    diff = builder.build(
        baseline_nodes=baseline_nodes,
        proposed_nodes=proposed_nodes,
        tenant_id="tenant-1",
        run_id="run-002",
        generation_mode="autopilot",
        generated_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
    )

    entity = diff.entities[0]
    spend_section = next(
        section for section in entity.sections if section.section.value == "spend"
    )
    change = next(
        field for field in spend_section.changes if field.field_path == "ad_set.daily_budget"
    )
    assert change.guardrails
    breach_codes = {breach.code for breach in change.guardrails}
    assert "spend_below_minimum" in breach_codes


def test_spend_guardrail_report_groups_by_platform(guardrails: GuardrailSettings) -> None:
    baseline_payloads = [
        _build_payload(100.0, platform="meta"),
        _build_payload(120.0, platform="google"),
    ]
    baseline_payloads[0]["entity_id"] = "adset-meta"
    baseline_payloads[0]["name"] = "Meta Prospecting"
    baseline_payloads[1]["entity_id"] = "adset-google"
    baseline_payloads[1]["name"] = "Google Evergreen"

    proposed_payloads = [
        _build_payload(160.0, platform="meta"),
        _build_payload(40.0, platform="google"),
    ]
    proposed_payloads[0]["entity_id"] = "adset-meta"
    proposed_payloads[0]["name"] = "Meta Prospecting"
    proposed_payloads[1]["entity_id"] = "adset-google"
    proposed_payloads[1]["name"] = "Google Evergreen"

    baseline_nodes = load_nodes_from_payload({"entities": baseline_payloads})
    proposed_nodes = load_nodes_from_payload({"entities": proposed_payloads})

    builder = AdPushDiffBuilder(guardrails)
    diff = builder.build(
        baseline_nodes=baseline_nodes,
        proposed_nodes=proposed_nodes,
        tenant_id="tenant-1",
        run_id="run-003",
        generation_mode="assist",
        generated_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
    )

    report = diff.spend_guardrail_report
    assert report is not None, "expected spend guardrail report"
    assert report.totals.baseline_spend == pytest.approx(220.0)
    assert report.totals.proposed_spend == pytest.approx(200.0)
    platform_reports = {item.platform: item for item in report.platforms}
    assert set(platform_reports) == {"meta", "google"}

    meta_report = platform_reports["meta"]
    assert meta_report.spend_delta == pytest.approx(60.0)
    meta_codes = {breach.code for breach in meta_report.guardrails}
    assert "platform_spend_delta_exceeds_limit" in meta_codes

    google_report = platform_reports["google"]
    assert google_report.spend_delta == pytest.approx(-80.0)
    google_codes = {breach.code for breach in google_report.guardrails}
    assert {
        "platform_spend_delta_exceeds_limit",
        "platform_spend_below_minimum",
    } <= google_codes

    diff_guardrail_codes = {breach.code for breach in diff.guardrails}
    assert "platform_spend_below_minimum" in diff_guardrail_codes
    assert "platform_spend_delta_exceeds_limit" in diff_guardrail_codes
