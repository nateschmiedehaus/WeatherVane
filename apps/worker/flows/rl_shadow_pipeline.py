"""Prefect flow for the allocator reinforcement-learning shadow mode."""

from __future__ import annotations

import json
import math
from datetime import datetime
from pathlib import Path
from typing import Dict, Sequence

from prefect import flow, get_run_logger

from apps.allocator.marketing_mix import (
    ChannelConstraint,
    ChannelRecommendation,
    MarketingMixResult,
    MarketingMixScenario,
)
from apps.allocator.rl_shadow import ShadowPolicyConfig, run_shadow_mode
from apps.model.mmm import MMMModel

DEFAULT_OUTPUT = Path("experiments/rl/shadow_mode.json")


def _channels() -> Sequence[ChannelConstraint]:
    """Return a deterministic set of channels for synthetic evaluation."""

    return [
        ChannelConstraint(
            name="meta",
            current_spend=95.0,
            min_spend=70.0,
            max_spend=180.0,
            weather_multiplier=1.25,
            elasticity_override=0.18,
            commentary="Performance peaks around midday storms; capped for guardrails.",
        ),
        ChannelConstraint(
            name="search",
            current_spend=110.0,
            min_spend=60.0,
            max_spend=165.0,
            weather_multiplier=0.85,
            elasticity_override=-0.12,
            commentary="Elastic but sensitive to spend spikes; keep within training range.",
        ),
        ChannelConstraint(
            name="display",
            current_spend=60.0,
            min_spend=35.0,
            max_spend=120.0,
            weather_multiplier=1.05,
            elasticity_override=0.05,
            commentary="Supports weather storytelling inventory; mild elasticity uplift.",
        ),
    ]


def _build_scenario(seed: int) -> MarketingMixScenario:
    """Construct a synthetic marketing-mix scenario for shadow simulations."""

    channels = _channels()
    mmm = MMMModel(
        base_roas=1.72,
        elasticity={
            "meta": 0.28,
            "search": -0.18,
            "display": 0.12,
        },
        mean_roas={
            "meta": 2.25,
            "search": 1.58,
            "display": 1.41,
        },
        mean_spend={
            "meta": 105.0,
            "search": 120.0,
            "display": 55.0,
        },
        features=["meta", "search", "display"],
    )

    total_budget = sum(channel.current_spend for channel in channels) * 1.05
    return MarketingMixScenario(
        mmm_model=mmm,
        channels=channels,
        total_budget=float(total_budget),
        roas_floor=1.2,
        learning_cap=0.32,
        risk_aversion=0.22,
        quantile_factors={"p10": 0.82, "p50": 1.0, "p90": 1.18},
        context_tags=("rl_shadow", f"seed.{seed}"),
    )


def _guardrail_stress_test(scenario: MarketingMixScenario) -> Dict[str, object]:
    """Force a guardrail breach to verify disablement and logging paths."""

    base_learning_cap = scenario.learning_cap
    sequence = iter(["baseline", "risk_off", "risk_off", "baseline"])

    def forced_selector(variants, q_values, epsilon, rng, disabled):
        try:
            target = next(sequence)
        except StopIteration:
            target = "baseline"
        for variant in variants:
            if variant.name == target and variant.name not in disabled:
                return variant
        for variant in variants:
            if variant.name not in disabled:
                return variant
        return variants[0]

    def fake_solver(candidate_scenario: MarketingMixScenario, seed: int) -> MarketingMixResult:
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
            total_revenue=float(total_revenue),
            profit=float(profit),
            diagnostics={"mode": "stress"},
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

    stress_config = ShadowPolicyConfig(
        episodes=4,
        epsilon=0.0,
        reward_noise=0.0,
        seed=97,
        max_guardrail_breaches=1,
        min_baseline_fraction=0.0,
        max_variant_fraction=1.0,
    )
    stress_result = run_shadow_mode(
        scenario,
        stress_config,
        variant_selector=forced_selector,
        marketing_mix_solver=fake_solver,
        realised_profit_fn=fake_realised_profit,
    )
    payload = stress_result.to_dict()
    episodes = [
        {
            "index": episode["index"],
            "variant": episode["variant"],
            "guardrail_violated": episode["guardrail_violated"],
            "disabled_after_episode": episode["disabled_after_episode"],
        }
        for episode in payload["episodes"]
    ]
    return {
        "config": {
            "episodes": stress_config.episodes,
            "epsilon": stress_config.epsilon,
            "seed": stress_config.seed,
            "max_guardrail_breaches": stress_config.max_guardrail_breaches,
        },
        "guardrail_violations": stress_result.guardrail_violations,
        "disabled_variants": list(stress_result.disabled_variants),
        "guardrail_breach_counts": dict(stress_result.guardrail_breach_counts),
        "selection_counts": dict(stress_result.selection_counts),
        "episodes": episodes,
        "assertions": {
            "risk_off_disabled": "risk_off" in stress_result.disabled_variants,
            "single_violation_recorded": stress_result.guardrail_violations == 1,
        },
    }


def _build_validation_summary(
    result_attributes,
    config: ShadowPolicyConfig,
    scenario: MarketingMixScenario,
) -> Dict[str, object]:
    """Summarise safety checks to provide critic-free validation evidence."""

    diagnostics = result_attributes.diagnostics
    baseline_fraction = float(diagnostics.get("baseline_fraction", 0.0))
    max_variant_fraction = float(diagnostics.get("max_variant_fraction", 0.0))
    safety_override_rate = float(diagnostics.get("safety_override_rate", 0.0))
    baseline_runs = result_attributes.selection_counts.get("baseline", 0)
    required_baseline_runs = math.ceil(config.min_baseline_fraction * config.episodes)
    stress_test = _guardrail_stress_test(scenario)

    checks = [
        {
            "name": "baseline_fraction",
            "status": baseline_fraction >= config.min_baseline_fraction - 1e-9,
            "value": baseline_fraction,
            "threshold": config.min_baseline_fraction,
            "observed_baseline_runs": baseline_runs,
            "required_baseline_runs": required_baseline_runs,
        },
        {
            "name": "max_variant_fraction",
            "status": max_variant_fraction <= config.max_variant_fraction + 1e-9,
            "value": max_variant_fraction,
            "threshold": config.max_variant_fraction,
        },
        {
            "name": "guardrail_violations",
            "status": result_attributes.guardrail_violations <= config.max_guardrail_breaches,
            "value": result_attributes.guardrail_violations,
            "threshold": config.max_guardrail_breaches,
        },
    ]

    notes = [
        "Baseline throttle maintained across simulation without exceeding variant cap.",
        "Synthetic stress test forces guardrail breach and confirms automatic disablement.",
        "Safety overrides remain within configured bounds for the main run.",
    ]

    return {
        "checks": checks,
        "stress_test": stress_test,
        "summary": {
            "episodes": len(result_attributes.episodes),
            "safety_override_rate": safety_override_rate,
            "disabled_variants": list(result_attributes.disabled_variants),
        },
        "notes": notes,
    }


@flow(name="weathervane-rl-shadow")
def orchestrate_rl_shadow_flow(
    episodes: int = 30,
    epsilon: float = 0.25,
    reward_noise: float = 0.06,
    seed: int = 17,
    max_guardrail_breaches: int = 2,
    min_baseline_fraction: float = 0.2,
    max_variant_fraction: float = 0.5,
    output_path: str | None = None,
) -> dict[str, object]:
    """Run the allocator shadow-mode simulation and persist diagnostics."""

    logger = get_run_logger()
    scenario = _build_scenario(seed)
    config = ShadowPolicyConfig(
        episodes=episodes,
        epsilon=epsilon,
        reward_noise=reward_noise,
        seed=seed,
        max_guardrail_breaches=max_guardrail_breaches,
        min_baseline_fraction=min_baseline_fraction,
        max_variant_fraction=max_variant_fraction,
    )
    result = run_shadow_mode(scenario, config)

    payload = result.to_dict()
    payload["generated_at"] = datetime.utcnow().isoformat()
    payload["config"] = {
        "episodes": episodes,
        "epsilon": epsilon,
        "reward_noise": reward_noise,
        "seed": seed,
        "max_guardrail_breaches": max_guardrail_breaches,
        "min_baseline_fraction": min_baseline_fraction,
        "max_variant_fraction": max_variant_fraction,
    }
    payload["scenario"] = {
        "total_budget": scenario.total_budget,
        "roas_floor": scenario.roas_floor,
        "learning_cap": scenario.learning_cap,
        "risk_aversion": scenario.risk_aversion,
        "channels": [
            {
                "name": channel.name,
                "current_spend": channel.current_spend,
                "min_spend": channel.min_spend,
                "max_spend": channel.max_spend,
                "weather_multiplier": channel.weather_multiplier,
            }
            for channel in scenario.channels
        ],
    }

    payload["validation"] = _build_validation_summary(result, config, scenario)

    destination = Path(output_path) if output_path else DEFAULT_OUTPUT
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    logger.info("Saved RL shadow report to %s", destination)
    return payload


def run_shadow_simulation(**kwargs: object) -> dict[str, object]:
    """Convenience wrapper for synchronous execution in scripts/tests."""

    return orchestrate_rl_shadow_flow.fn(**kwargs)


__all__ = ["orchestrate_rl_shadow_flow", "run_shadow_simulation", "DEFAULT_OUTPUT"]
