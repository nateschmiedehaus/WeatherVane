"\"\"\"Parity tests for shared scenario builder helpers.\"\"\""

from __future__ import annotations

from datetime import datetime

from shared.schemas.base import (
    ConfidenceLevel,
    PlanQuantiles,
    PlanRationale,
    PlanResponse,
    PlanSlice,
)
from shared.services.scenario_builder import (
    apply_scenario_adjustments,
    build_scenario_baseline,
)


def _make_slice(
    *,
    channel: str,
    spend: float,
    revenue_p50: float,
    confidence: ConfidenceLevel,
) -> PlanSlice:
    now = datetime.utcnow()
    return PlanSlice(
        plan_date=now,
        geo_group_id="demo-geo",
        category="Demo",
        channel=channel,
        recommended_spend=spend,
        expected_revenue=PlanQuantiles(p10=revenue_p50 * 0.7, p50=revenue_p50, p90=revenue_p50 * 1.3),
        expected_roas=PlanQuantiles(p10=1.2, p50=2.0, p90=2.8),
        confidence=confidence,
        assumptions=["telemetry green"],
        rationale=PlanRationale(
            primary_driver="Weather lift",
            supporting_factors=["seasonal demand"],
            confidence_level=confidence,
            data_quality="complete",
            assumptions=["conversion trend steady"],
            risks=["supply chaining"],
        ),
    )


def _sample_plan() -> PlanResponse:
    now = datetime.utcnow()
    return PlanResponse(
        tenant_id="demo",
        generated_at=now,
        horizon_days=7,
        slices=[
            _make_slice(channel="Meta Advantage+", spend=4200, revenue_p50=11200, confidence=ConfidenceLevel.HIGH),
            _make_slice(channel="Google Search", spend=2600, revenue_p50=7200, confidence=ConfidenceLevel.MEDIUM),
            _make_slice(channel="Email · Klaviyo", spend=1100, revenue_p50=3600, confidence=ConfidenceLevel.LOW),
            _make_slice(
                channel="Meta Advantage+",
                spend=800,
                revenue_p50=2400,
                confidence=ConfidenceLevel.HIGH,
            ),
        ],
    )


def test_build_scenario_baseline_groups_channels_and_preserves_order() -> None:
    plan = _sample_plan()
    baseline = build_scenario_baseline(plan)

    assert baseline.horizon_days == plan.horizon_days
    assert len(baseline.channels) == 3
    # Highest spend (Meta) should rank first after aggregation.
    assert baseline.channels[0].channel == "Meta Advantage+"
    assert baseline.channels[0].spend == 5000
    assert baseline.channels[0].revenue == 13600
    assert baseline.channels[0].confidence is ConfidenceLevel.HIGH
    assert baseline.total_spend == sum(channel.spend for channel in baseline.channels)
    assert baseline.total_revenue == sum(channel.revenue for channel in baseline.channels)


def test_apply_scenario_adjustments_uses_confidence_weighting() -> None:
    baseline = build_scenario_baseline(_sample_plan())
    outcome = apply_scenario_adjustments(
        baseline,
        {
            "Meta Advantage+": 1.1,
            "Google Search": 0.9,
            "Email · Klaviyo": 1.25,
        },
    )

    meta = next(channel for channel in outcome.channels if channel.channel == "Meta Advantage+")
    email = next(channel for channel in outcome.channels if channel.channel == "Email · Klaviyo")

    assert meta.scenario_spend == baseline.channels[0].spend * 1.1
    assert meta.scenario_revenue > meta.base_revenue
    assert email.scenario_revenue <= email.base_revenue * 1.25  # dampened by risk factor
    assert outcome.summary.total_scenario_spend > outcome.summary.total_base_spend
    assert outcome.summary.total_scenario_revenue > outcome.summary.total_base_revenue
    assert outcome.summary.weighted_confidence in {
        ConfidenceLevel.HIGH,
        ConfidenceLevel.MEDIUM,
        ConfidenceLevel.LOW,
    }


def test_neutral_multipliers_preserve_baseline_totals() -> None:
    baseline = build_scenario_baseline(_sample_plan())
    neutral_adjustments = {channel.channel: 1.0 for channel in baseline.channels}
    outcome = apply_scenario_adjustments(baseline, neutral_adjustments)

    assert outcome.summary.delta_spend == 0
    assert outcome.summary.delta_revenue == 0
    assert outcome.summary.total_scenario_spend == baseline.total_spend
    assert outcome.summary.total_scenario_revenue == baseline.total_revenue
