from __future__ import annotations

import json
import math

import pytest

from apps.allocator import rl_shadow
from apps.allocator.marketing_mix import (
    ChannelConstraint,
    ChannelRecommendation,
    MarketingMixResult,
    MarketingMixScenario,
)
from apps.allocator.rl_shadow import (
    ShadowPolicyConfig,
    run_shadow_mode,
)
from apps.model.mmm import MMMModel


def _build_scenario() -> MarketingMixScenario:
    mmm = MMMModel(
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
    channels = [
        ChannelConstraint(
            name="meta",
            current_spend=90.0,
            min_spend=60.0,
            max_spend=150.0,
            weather_multiplier=1.35,
        ),
        ChannelConstraint(
            name="search",
            current_spend=110.0,
            min_spend=50.0,
            max_spend=140.0,
            weather_multiplier=0.8,
        ),
        ChannelConstraint(
            name="display",
            current_spend=40.0,
            min_spend=25.0,
            max_spend=90.0,
            weather_multiplier=1.1,
        ),
    ]
    return MarketingMixScenario(
        mmm_model=mmm,
        channels=channels,
        total_budget=260.0,
        roas_floor=1.25,
        context_tags=("weather.outlook.warm",),
    )


def test_shadow_mode_runs_and_respects_guardrails() -> None:
    scenario = _build_scenario()
    config = ShadowPolicyConfig(episodes=12, epsilon=0.35, reward_noise=0.0, seed=24)
    result = run_shadow_mode(scenario, config)

    assert len(result.episodes) == config.episodes
    assert sum(result.selection_counts.values()) == config.episodes
    assert result.guardrail_violations == 0
    assert all(count == 0 for count in result.guardrail_breach_counts.values())
    assert result.disabled_variants == []
    assert all(not episode.disabled_after_episode for episode in result.episodes)
    assert all(not episode.safety_override for episode in result.episodes)

    average_reward = sum(ep.reward for ep in result.episodes) / len(result.episodes)
    assert abs(result.average_reward - average_reward) <= 1e-9
    assert result.diagnostics["baseline_fraction"] >= config.min_baseline_fraction
    assert result.diagnostics["safety_override_rate"] == 0.0


def test_shadow_mode_serialises_to_json() -> None:
    scenario = _build_scenario()
    config = ShadowPolicyConfig(episodes=6, epsilon=0.5, reward_noise=0.02, seed=5)
    result = run_shadow_mode(scenario, config)

    payload = result.to_dict()
    # Ensure baseline variant reward stays anchored at zero.
    assert abs(result.q_values["baseline"]) <= 1e-9
    assert payload["average_reward"] == result.average_reward
    assert "guardrail_breach_counts" in payload
    assert "disabled_variants" in payload
    assert all("disabled_after_episode" in episode for episode in payload["episodes"])
    assert all("safety_override" in episode for episode in payload["episodes"])
    assert "baseline_fraction" in payload["diagnostics"]
    assert "safety_override_rate" in payload["diagnostics"]
    json.dumps(payload)


def test_shadow_policy_config_validation() -> None:
    config = ShadowPolicyConfig(episodes=10, epsilon=0.1, reward_noise=0.1, seed=1)
    config.validate()

    bad_episodes = ShadowPolicyConfig(episodes=0)
    try:
        bad_episodes.validate()
    except ValueError as err:
        assert "episodes" in str(err)
    else:
        raise AssertionError("expected ValueError for episodes <= 0")

    bad_epsilon = ShadowPolicyConfig(episodes=5, epsilon=1.5)
    try:
        bad_epsilon.validate()
    except ValueError as err:
        assert "epsilon" in str(err)
    else:
        raise AssertionError("expected ValueError for epsilon outside [0, 1]")

    bad_breaches = ShadowPolicyConfig(episodes=5, max_guardrail_breaches=0)
    try:
        bad_breaches.validate()
    except ValueError as err:
        assert "max_guardrail_breaches" in str(err)
    else:
        raise AssertionError("expected ValueError for max_guardrail_breaches <= 0")


def test_shadow_mode_disables_variant_after_guardrail(monkeypatch: pytest.MonkeyPatch) -> None:
    scenario = _build_scenario()
    base_learning_cap = scenario.learning_cap

    order = iter(["baseline", "risk_off", "risk_off", "baseline"])

    def fake_select(
        *,
        variants,
        q_values,
        epsilon,
        rng,
        disabled,
    ):
        try:
            target = next(order)
        except StopIteration:
            target = "baseline"
        for variant in variants:
            if variant.name == target and variant.name not in disabled:
                return variant
        for variant in variants:
            if variant.name not in disabled:
                return variant
        return variants[0]

    def fake_solve(candidate_scenario, seed):
        if candidate_scenario.learning_cap < base_learning_cap:
            recommendations = {
                "meta": ChannelRecommendation(
                    name="meta",
                    recommended_spend=140.0,
                    average_roas=1.0,
                    marginal_roas=0.95,
                    expected_revenue=140.0,
                    weather_multiplier=1.35,
                    commentary=None,
                ),
                "search": ChannelRecommendation(
                    name="search",
                    recommended_spend=90.0,
                    average_roas=0.95,
                    marginal_roas=0.9,
                    expected_revenue=85.5,
                    weather_multiplier=0.8,
                    commentary=None,
                ),
                "display": ChannelRecommendation(
                    name="display",
                    recommended_spend=30.0,
                    average_roas=0.9,
                    marginal_roas=0.85,
                    expected_revenue=27.0,
                    weather_multiplier=1.1,
                    commentary=None,
                ),
            }
            profit = (140.0 + 85.5 + 27.0) - (140.0 + 90.0 + 30.0)
        else:
            recommendations = {
                "meta": ChannelRecommendation(
                    name="meta",
                    recommended_spend=90.0,
                    average_roas=1.5,
                    marginal_roas=1.45,
                    expected_revenue=135.0,
                    weather_multiplier=1.35,
                    commentary=None,
                ),
                "search": ChannelRecommendation(
                    name="search",
                    recommended_spend=110.0,
                    average_roas=1.4,
                    marginal_roas=1.35,
                    expected_revenue=154.0,
                    weather_multiplier=0.8,
                    commentary=None,
                ),
                "display": ChannelRecommendation(
                    name="display",
                    recommended_spend=40.0,
                    average_roas=1.3,
                    marginal_roas=1.25,
                    expected_revenue=52.0,
                    weather_multiplier=1.1,
                    commentary=None,
                ),
            }
            profit = (135.0 + 154.0 + 52.0) - (90.0 + 110.0 + 40.0)
        total_revenue = sum(rec.expected_revenue for rec in recommendations.values())
        return MarketingMixResult(
            allocation=None,
            recommendations=recommendations,
            total_revenue=total_revenue,
            profit=float(profit),
            diagnostics={"stub": "ok"},
        )

    def fake_realised_profit(
        *,
        recommendations,
        channel_lookup,
        shocks,
        model,
    ):
        revenue = sum(rec.expected_revenue for rec in recommendations.values())
        spend = sum(rec.recommended_spend for rec in recommendations.values())
        realised = {name: rec.average_roas for name, rec in recommendations.items()}
        return float(revenue - spend), realised

    monkeypatch.setattr(rl_shadow, "_select_variant", fake_select)
    monkeypatch.setattr(rl_shadow, "solve_marketing_mix", fake_solve)
    monkeypatch.setattr(rl_shadow, "_realised_profit", fake_realised_profit)

    config = ShadowPolicyConfig(
        episodes=4,
        epsilon=0.0,
        reward_noise=0.0,
        seed=7,
        max_guardrail_breaches=1,
    )
    result = run_shadow_mode(scenario, config)

    assert result.guardrail_violations == 1
    assert result.guardrail_breach_counts["risk_off"] == 1
    assert result.guardrail_breach_counts["baseline"] == 0
    assert result.disabled_variants == ["risk_off"]
    assert result.selection_counts["risk_off"] == 1
    assert result.selection_counts["baseline"] == config.episodes - 1
    assert result.episodes[1].variant == "risk_off"
    assert result.episodes[1].guardrail_violated is True
    assert result.episodes[1].disabled_after_episode is True
    assert all(
        not episode.guardrail_violated
        for idx, episode in enumerate(result.episodes)
        if idx != 1
    )
    payload = result.to_dict()
    assert payload["q_values"]["risk_off"] is None


def test_shadow_mode_enforces_minimum_baseline_fraction(monkeypatch: pytest.MonkeyPatch) -> None:
    scenario = _build_scenario()

    sequence = iter(["learning_expansion"] * 30)

    def fake_select(**kwargs):
        try:
            target = next(sequence)
        except StopIteration:
            target = "learning_expansion"
        for variant in kwargs["variants"]:
            if variant.name == target:
                return variant
        return kwargs["variants"][0]

    monkeypatch.setattr(rl_shadow, "_select_variant", fake_select)

    config = ShadowPolicyConfig(
        episodes=20,
        epsilon=0.0,
        reward_noise=0.0,
        seed=3,
        min_baseline_fraction=0.35,
    )
    result = run_shadow_mode(scenario, config)

    baseline_runs = result.selection_counts["baseline"]
    expected_min = math.ceil(config.min_baseline_fraction * config.episodes)
    assert baseline_runs >= expected_min
    assert result.diagnostics["baseline_fraction"] >= config.min_baseline_fraction
    assert result.diagnostics["safety_override_rate"] > 0.0
    assert any(episode.safety_override for episode in result.episodes)


def test_shadow_mode_throttles_variant_share(monkeypatch: pytest.MonkeyPatch) -> None:
    scenario = _build_scenario()

    target_variant = "weather_aggressive"

    def fake_select(**kwargs):
        for variant in kwargs["variants"]:
            if variant.name == target_variant:
                return variant
        return kwargs["variants"][0]

    monkeypatch.setattr(rl_shadow, "_select_variant", fake_select)

    config = ShadowPolicyConfig(
        episodes=18,
        epsilon=0.0,
        reward_noise=0.0,
        seed=5,
        max_variant_fraction=0.25,
    )
    result = run_shadow_mode(scenario, config)

    assert result.selection_counts[target_variant] <= math.floor(config.max_variant_fraction * config.episodes)
    assert result.diagnostics["max_variant_fraction"] <= config.max_variant_fraction + 1e-9


def test_shadow_mode_throttles_when_variant_cap_rounds_to_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    scenario = _build_scenario()

    def choose_variant(**kwargs):
        for variant in kwargs["variants"]:
            if variant.name != "baseline":
                return variant
        return kwargs["variants"][0]

    monkeypatch.setattr(rl_shadow, "_select_variant", choose_variant)

    config = ShadowPolicyConfig(
        episodes=5,
        epsilon=0.0,
        reward_noise=0.0,
        seed=11,
        min_baseline_fraction=0.0,
        max_variant_fraction=0.1,
    )

    result = run_shadow_mode(scenario, config)

    assert result.selection_counts["baseline"] == config.episodes
    assert all(count == 0 for name, count in result.selection_counts.items() if name != "baseline")
    assert result.diagnostics["max_variant_fraction"] == 0.0
    assert result.diagnostics["safety_override_rate"] > 0.0
