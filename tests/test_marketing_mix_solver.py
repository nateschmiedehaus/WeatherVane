from __future__ import annotations

from apps.allocator.marketing_mix import (
    ChannelConstraint,
    MarketingMixScenario,
    solve_marketing_mix,
)
from apps.model.mmm import MMMModel


def _build_mmm_model() -> MMMModel:
    return MMMModel(
        base_roas=1.6,
        elasticity={
            "meta": 0.45,
            "search": -0.25,
            "display": 0.15,
        },
        mean_roas={
            "meta": 2.1,
            "search": 1.7,
            "display": 1.5,
        },
        mean_spend={
            "meta": 90.0,
            "search": 110.0,
            "display": 60.0,
        },
        features=["meta", "search", "display"],
    )


def test_marketing_mix_solver_shifts_budget_towards_weather_tailwinds() -> None:
    mmm = _build_mmm_model()
    channels = [
        ChannelConstraint(
            name="meta",
            current_spend=90.0,
            min_spend=60.0,
            max_spend=150.0,
            weather_multiplier=1.35,
            commentary="Warm weekend: lean into paid social creative.",
        ),
        ChannelConstraint(
            name="search",
            current_spend=110.0,
            min_spend=50.0,
            max_spend=140.0,
            weather_multiplier=0.8,
            commentary="Rain dampens impulsive search demand.",
        ),
        ChannelConstraint(
            name="display",
            current_spend=40.0,
            min_spend=25.0,
            max_spend=90.0,
            weather_multiplier=1.1,
        ),
    ]

    scenario = MarketingMixScenario(
        mmm_model=mmm,
        channels=channels,
        total_budget=260.0,
        roas_floor=1.25,
        context_tags=("weather.outlook.warm",),
    )

    result = solve_marketing_mix(scenario, seed=21)

    total_spend = sum(result.allocation.spends.values())
    assert abs(total_spend - scenario.total_budget) <= 1e-6

    for constraint in channels:
        spend = result.recommendations[constraint.name].recommended_spend
        assert constraint.min_spend - 1e-6 <= spend <= constraint.max_spend + 1e-6

    meta_spend = result.recommendations["meta"].recommended_spend
    search_spend = result.recommendations["search"].recommended_spend
    assert meta_spend > search_spend

    multipliers = result.diagnostics["weather_multipliers"]
    assert multipliers["meta"] == 1.35
    assert multipliers["search"] == 0.8


def test_marketing_mix_solver_respects_roas_floor_and_caps() -> None:
    mmm = MMMModel(
        base_roas=1.4,
        elasticity={
            "storm": 0.4,
            "slack": -0.5,
        },
        mean_roas={
            "storm": 2.0,
            "slack": 1.2,
        },
        mean_spend={
            "storm": 80.0,
            "slack": 60.0,
        },
        features=["storm", "slack"],
    )

    channels = [
        ChannelConstraint(
            name="storm",
            current_spend=70.0,
            min_spend=40.0,
            max_spend=140.0,
            weather_multiplier=1.1,
        ),
        ChannelConstraint(
            name="slack",
            current_spend=50.0,
            min_spend=10.0,
            max_spend=80.0,
            weather_multiplier=0.75,
        ),
    ]

    scenario = MarketingMixScenario(
        mmm_model=mmm,
        channels=channels,
        total_budget=150.0,
        roas_floor=1.5,
        context_tags=("weather.front.cold",),
    )

    result = solve_marketing_mix(scenario, seed=9)

    slack_spend = result.recommendations["slack"].recommended_spend
    assert slack_spend <= channels[1].min_spend + 1e-6

    constraint_lookup = {channel.name: channel for channel in channels}
    for recommendation in result.recommendations.values():
        constraint = constraint_lookup[recommendation.name]
        if recommendation.recommended_spend > constraint.min_spend + 1e-6:
            assert recommendation.average_roas >= scenario.roas_floor - 1e-3

    assert result.diagnostics["roas_floor"] == scenario.roas_floor
