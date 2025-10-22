"""Reinforcement-learning shadow mode for allocator safety validation.

This module evaluates alternative allocation policies in a sandboxed
reinforcement-learning loop. We keep the production allocator untouched
while simulating policy variants (different risk/learning settings) to
measure potential lift and guardrail adherence before enabling them live.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, List, Mapping, MutableMapping, Sequence, Set, Tuple

import math
import random

from apps.allocator.marketing_mix import (
    ChannelConstraint,
    ChannelRecommendation,
    MarketingMixResult,
    MarketingMixScenario,
    prepare_marketing_mix,
    solve_marketing_mix,
)


@dataclass(frozen=True)
class ShadowPolicyConfig:
    """Configuration for the shadow-mode simulation."""

    episodes: int = 30
    epsilon: float = 0.2
    reward_noise: float = 0.08
    seed: int = 11
    max_guardrail_breaches: int = 1
    min_baseline_fraction: float = 0.2
    max_variant_fraction: float = 0.5

    def validate(self) -> None:
        if self.episodes <= 0:
            raise ValueError("episodes must be positive")
        if not (0.0 <= self.epsilon <= 1.0):
            raise ValueError("epsilon must be within [0, 1]")
        if self.reward_noise < 0.0:
            raise ValueError("reward_noise must be non-negative")
        if self.max_guardrail_breaches <= 0:
            raise ValueError("max_guardrail_breaches must be positive")
        if not (0.0 <= self.min_baseline_fraction <= 1.0):
            raise ValueError("min_baseline_fraction must be within [0, 1]")
        if not (0.0 < self.max_variant_fraction <= 1.0):
            raise ValueError("max_variant_fraction must be within (0, 1]")


@dataclass(frozen=True)
class PolicyVariant:
    """Discrete policy variant explored in shadow mode."""

    name: str
    risk_delta: float = 0.0
    learning_cap_delta: float = 0.0
    p90_scale: float = 1.0
    p10_scale: float = 1.0


@dataclass(frozen=True)
class ShadowEpisodeLog:
    """Single episode outcome from the shadow loop."""

    index: int
    variant: str
    reward: float
    candidate_profit: float
    baseline_profit: float
    guardrail_violated: bool
    realised_roas: Dict[str, float]
    disabled_after_episode: bool
    safety_override: bool


@dataclass(frozen=True)
class ShadowRunResult:
    """Aggregate outcome of a shadow-mode evaluation."""

    baseline: MarketingMixResult
    episodes: List[ShadowEpisodeLog]
    average_reward: float
    q_values: Dict[str, float]
    selection_counts: Dict[str, int]
    guardrail_violations: int
    guardrail_breach_counts: Dict[str, int]
    disabled_variants: List[str]
    diagnostics: Dict[str, float]

    def to_dict(self) -> Dict[str, object]:
        def _serialise_number(value: object) -> object:
            if isinstance(value, float) and not math.isfinite(value):
                return None
            return value

        return {
            "average_reward": self.average_reward,
            "guardrail_violations": self.guardrail_violations,
            "q_values": {
                name: _serialise_number(value) for name, value in self.q_values.items()
            },
            "selection_counts": dict(self.selection_counts),
            "episodes": [
                {
                    "index": episode.index,
                    "variant": episode.variant,
                    "reward": episode.reward,
                    "candidate_profit": episode.candidate_profit,
                    "baseline_profit": episode.baseline_profit,
                    "guardrail_violated": episode.guardrail_violated,
                    "realised_roas": dict(episode.realised_roas),
                    "disabled_after_episode": episode.disabled_after_episode,
                    "safety_override": episode.safety_override,
                }
                for episode in self.episodes
            ],
            "baseline_profit": self.baseline.profit,
            "guardrail_breach_counts": dict(self.guardrail_breach_counts),
            "disabled_variants": list(self.disabled_variants),
            "diagnostics": dict(self.diagnostics),
        }


def _channel_roas(model, channel: ChannelConstraint, spend: float) -> float:
    """Return adjusted ROAS including optional elasticity override."""
    weather_multiplier = channel.weather_multiplier if channel.weather_multiplier > 0 else 0.0
    if spend <= 0.0 or weather_multiplier <= 0.0:
        return 0.0
    if channel.elasticity_override is not None and channel.name in model.mean_spend:
        mean = model.mean_spend.get(channel.name, 0.0)
        base = model.mean_roas.get(channel.name, model.base_roas)
        if mean <= 0.0:
            roas = base
        else:
            ratio = (spend - mean) / max(mean, 1e-6)
            roas = base + channel.elasticity_override * ratio
    else:
        roas = model.roas_for(channel.name, spend)
    return max(roas, 0.0) * weather_multiplier


def _realised_profit(
    *,
    recommendations: Mapping[str, ChannelRecommendation],
    channel_lookup: Mapping[str, ChannelConstraint],
    shocks: Mapping[str, float],
    model,
    roas_cache: Dict[Tuple[ChannelConstraint, float], float] | None = None,
) -> tuple[float, Dict[str, float]]:
    total_revenue = 0.0
    total_spend = 0.0
    realised_roas: Dict[str, float] = {}
    for name, recommendation in recommendations.items():
        spend = float(recommendation.recommended_spend)
        channel = channel_lookup[name]
        cache_key: Tuple[ChannelConstraint, float] | None = None
        expected: float
        if roas_cache is not None:
            cache_key = (channel, round(spend, 6))
            cached = roas_cache.get(cache_key)
            if cached is not None:
                expected = cached
            else:
                expected = _channel_roas(model, channel, spend)
                roas_cache[cache_key] = expected
        else:
            expected = _channel_roas(model, channel, spend)
        shock = shocks.get(name, 0.0)
        realised = max(expected * (1.0 + shock), 0.0)
        total_spend += spend
        total_revenue += realised * spend
        realised_roas[name] = realised
    profit = total_revenue - total_spend
    return float(profit), realised_roas


DEFAULT_REALISED_PROFIT = _realised_profit


def _build_variants() -> List[PolicyVariant]:
    return [
        PolicyVariant(name="baseline"),
        PolicyVariant(name="steady_defensive", risk_delta=0.12, p10_scale=0.95),
        PolicyVariant(name="weather_aggressive", risk_delta=-0.12, p90_scale=1.08),
        PolicyVariant(name="learning_expansion", risk_delta=-0.05, learning_cap_delta=0.05, p90_scale=1.04),
        PolicyVariant(name="risk_off", risk_delta=0.20, learning_cap_delta=-0.05, p10_scale=0.9),
    ]


def _apply_variant(scenario: MarketingMixScenario, variant: PolicyVariant) -> MarketingMixScenario:
    quantiles = dict(scenario.quantile_factors)
    if quantiles:
        quantiles["p90"] = max(0.1, quantiles.get("p90", 1.0) * variant.p90_scale)
        quantiles["p10"] = max(0.0, quantiles.get("p10", 1.0) * variant.p10_scale)
        quantiles["p50"] = quantiles.get("p50", 1.0)
    new_learning_cap = min(0.5, max(0.05, scenario.learning_cap + variant.learning_cap_delta))
    new_risk = min(1.0, max(0.0, scenario.risk_aversion + variant.risk_delta))
    return MarketingMixScenario(
        mmm_model=scenario.mmm_model,
        channels=scenario.channels,
        total_budget=scenario.total_budget,
        roas_floor=scenario.roas_floor,
        learning_cap=new_learning_cap,
        risk_aversion=new_risk,
        quantile_factors=quantiles or dict(scenario.quantile_factors),
        context_tags=scenario.context_tags,
    )


def _select_variant(
    *,
    variants: Sequence[PolicyVariant],
    q_values: MutableMapping[str, float],
    epsilon: float,
    rng: random.Random,
    disabled: Set[str],
) -> PolicyVariant:
    available = [variant for variant in variants if variant.name not in disabled]
    if not available:
        return rng.choice(list(variants))
    if rng.random() < epsilon:
        return rng.choice(list(available))
    scoped_q_values = {name: score for name, score in q_values.items() if name not in disabled}
    best_score = max(scoped_q_values.values()) if scoped_q_values else 0.0
    candidates = [
        variant
        for variant in available
        if scoped_q_values.get(variant.name, q_values.get(variant.name, 0.0)) >= best_score - 1e-6
    ]
    if not candidates:
        return rng.choice(list(available))
    return rng.choice(candidates)


def _baseline_variant(variants: Sequence[PolicyVariant]) -> PolicyVariant:
    for variant in variants:
        if variant.name == "baseline":
            return variant
    raise ValueError("baseline variant is required for safety enforcement")


def _enforce_safety_bounds(
    *,
    requested: PolicyVariant,
    variants: Sequence[PolicyVariant],
    selection_counts: Mapping[str, int],
    config: ShadowPolicyConfig,
    episodes_completed: int,
) -> tuple[PolicyVariant, bool]:
    """Throttle exploration so baseline coverage and variant caps are respected."""

    baseline = _baseline_variant(variants)
    total = config.episodes
    remaining = total - episodes_completed
    baseline_required = math.ceil(config.min_baseline_fraction * total)
    baseline_completed = selection_counts[baseline.name]
    baseline_remaining = max(baseline_required - baseline_completed, 0)
    if baseline_remaining >= remaining and requested.name != baseline.name:
        return baseline, True

    if requested.name == baseline.name:
        return requested, False

    cap = math.floor(config.max_variant_fraction * total)
    if cap <= 0:
        return baseline, True

    if selection_counts[requested.name] >= cap:
        return baseline, True

    return requested, False


def _guardrail_violated(
    *,
    baseline: MarketingMixResult,
    candidate: MarketingMixResult,
    learning_cap: float,
    roas_floor: float,
) -> bool:
    for name, recommendation in candidate.recommendations.items():
        spend = recommendation.recommended_spend
        if spend > 1e-6 and recommendation.average_roas < roas_floor - 1e-3:
            return True
    return False


def _learning_delta_exceeds_cap(
    *,
    candidate: MarketingMixResult,
    channel_lookup: Mapping[str, ChannelConstraint],
    learning_cap: float,
) -> bool:
    for name, recommendation in candidate.recommendations.items():
        channel = channel_lookup[name]
        base_spend = max(channel.current_spend, 1e-6)
        delta = abs(recommendation.recommended_spend - channel.current_spend) / base_spend
        if delta > learning_cap + 1e-6:
            return True
    return False


def run_shadow_mode(
    scenario: MarketingMixScenario,
    config: ShadowPolicyConfig | None = None,
    *,
    variant_selector: Callable[
        [Sequence[PolicyVariant], MutableMapping[str, float], float, random.Random, Set[str]], PolicyVariant
    ]
    | None = None,
    marketing_mix_solver: Callable[[MarketingMixScenario, int], MarketingMixResult] | None = None,
    realised_profit_fn: Callable[
        [Mapping[str, ChannelRecommendation], Mapping[str, ChannelConstraint], Mapping[str, float], object],
        tuple[float, Dict[str, float]],
    ]
    | None = None,
) -> ShadowRunResult:
    """Run the shadow-mode loop against the provided scenario."""

    config = config or ShadowPolicyConfig()
    config.validate()
    rng = random.Random(config.seed)

    prepared = prepare_marketing_mix(scenario)
    baseline_solver = solve_marketing_mix
    variant_solver = marketing_mix_solver or baseline_solver
    try:
        baseline = baseline_solver(scenario, seed=config.seed, prepared=prepared)
    except TypeError as error:
        if "prepared" not in str(error):
            raise
        baseline = baseline_solver(scenario, seed=config.seed)
    channel_lookup = prepared.channel_lookup
    variants = _build_variants()
    q_values: Dict[str, float] = {variant.name: 0.0 for variant in variants}
    selection_counts: Dict[str, int] = {variant.name: 0 for variant in variants}
    guardrail_breach_counts: Dict[str, int] = {variant.name: 0 for variant in variants}
    safety_overrides = 0
    disabled_variants: Set[str] = set()
    episodes: List[ShadowEpisodeLog] = []
    guardrail_violations = 0
    variant_scenarios_cache: Dict[str, MarketingMixScenario] = {}
    variant_results_cache: Dict[str, MarketingMixResult] = {}

    def _wrapped_select() -> Callable[
        [Sequence[PolicyVariant], MutableMapping[str, float], float, random.Random, Set[str]], PolicyVariant
    ]:
        if variant_selector is not None:
            return variant_selector

        def default_selector(
            variants_input: Sequence[PolicyVariant],
            q_values_input: MutableMapping[str, float],
            epsilon_input: float,
            rng_input: random.Random,
            disabled_input: Set[str],
        ) -> PolicyVariant:
            return _select_variant(
                variants=variants_input,
                q_values=q_values_input,
                epsilon=epsilon_input,
                rng=rng_input,
                disabled=disabled_input,
            )

        return default_selector

    select_variant = _wrapped_select()
    # Cache channel ROAS evaluations across episodes so repeated candidate checks stay cheap.
    roas_cache: Dict[Tuple[ChannelConstraint, float], float] = {}
    if realised_profit_fn is None and _realised_profit is DEFAULT_REALISED_PROFIT:
        def profit_fn(
            *,
            recommendations: Mapping[str, ChannelRecommendation],
            channel_lookup: Mapping[str, ChannelConstraint],
            shocks: Mapping[str, float],
            model,
        ) -> tuple[float, Dict[str, float]]:
            return DEFAULT_REALISED_PROFIT(
                recommendations=recommendations,
                channel_lookup=channel_lookup,
                shocks=shocks,
                model=model,
                roas_cache=roas_cache,
            )
    else:
        profit_fn = realised_profit_fn or _realised_profit

    for idx in range(config.episodes):
        variant = select_variant(
            variants,
            q_values,
            config.epsilon,
            rng,
            disabled_variants,
        )
        variant, overridden = _enforce_safety_bounds(
            requested=variant,
            variants=variants,
            selection_counts=selection_counts,
            config=config,
            episodes_completed=idx,
        )
        if overridden:
            safety_overrides += 1
        selection_counts[variant.name] += 1

        if variant.name == "baseline":
            candidate_scenario = scenario
            candidate_result = baseline
        else:
            if variant_solver is baseline_solver:
                cached_scenario = variant_scenarios_cache.get(variant.name)
                if cached_scenario is None:
                    cached_scenario = _apply_variant(scenario, variant)
                    variant_scenarios_cache[variant.name] = cached_scenario
                candidate_scenario = cached_scenario

                cached_result = variant_results_cache.get(variant.name)
                if cached_result is not None:
                    candidate_result = cached_result
                else:
                    seed_value = config.seed + idx + 1
                    try:
                        computed = variant_solver(
                            candidate_scenario,
                            seed=seed_value,
                            prepared=prepared,
                        )
                    except TypeError as error:
                        if "prepared" not in str(error):
                            raise
                        computed = variant_solver(candidate_scenario, seed=seed_value)
                    variant_results_cache[variant.name] = computed
                    candidate_result = computed
            else:
                candidate_scenario = _apply_variant(scenario, variant)
                candidate_result = variant_solver(candidate_scenario, seed=config.seed + idx + 1)

        shocks = {name: rng.gauss(0.0, config.reward_noise) if config.reward_noise > 0 else 0.0 for name in channel_lookup}
        baseline_profit, baseline_roas = profit_fn(
            recommendations=baseline.recommendations,
            channel_lookup=channel_lookup,
            shocks=shocks,
            model=scenario.mmm_model,
        )
        candidate_profit, realised_roas = profit_fn(
            recommendations=candidate_result.recommendations,
            channel_lookup=channel_lookup,
            shocks=shocks,
            model=scenario.mmm_model,
        )
        reward = candidate_profit - baseline_profit

        count = selection_counts[variant.name]
        q_prev = q_values.get(variant.name, 0.0)
        q_values[variant.name] = q_prev + (reward - q_prev) / max(count, 1)

        violated = _guardrail_violated(
            baseline=baseline,
            candidate=candidate_result,
            learning_cap=candidate_scenario.learning_cap,
            roas_floor=candidate_scenario.roas_floor,
        ) or _learning_delta_exceeds_cap(
            candidate=candidate_result,
            channel_lookup=channel_lookup,
            learning_cap=candidate_scenario.learning_cap,
        )
        if violated:
            guardrail_violations += 1
            guardrail_breach_counts[variant.name] += 1
            if variant.name != "baseline" and guardrail_breach_counts[variant.name] >= config.max_guardrail_breaches:
                disabled_variants.add(variant.name)
                q_values[variant.name] = float("-inf")

        episodes.append(
            ShadowEpisodeLog(
                index=idx,
                variant=variant.name,
                reward=float(reward),
                candidate_profit=candidate_profit,
                baseline_profit=baseline_profit,
                guardrail_violated=violated,
                realised_roas=realised_roas,
                disabled_after_episode=variant.name in disabled_variants,
                safety_override=overridden,
            )
        )

    average_reward = sum(ep.reward for ep in episodes) / len(episodes) if episodes else 0.0
    diagnostics = {
        "max_reward": max((ep.reward for ep in episodes), default=0.0),
        "min_reward": min((ep.reward for ep in episodes), default=0.0),
        "std_reward": math.sqrt(
            sum((ep.reward - average_reward) ** 2 for ep in episodes) / len(episodes)
        )
        if episodes
        else 0.0,
        "baseline_fraction": (selection_counts.get("baseline", 0) / len(episodes)) if episodes else 0.0,
        "max_variant_fraction": (
            max(
                (selection_counts[name] / len(episodes) for name in selection_counts if name != "baseline"),
                default=0.0,
            )
        )
        if episodes
        else 0.0,
        "safety_override_rate": (safety_overrides / len(episodes)) if episodes else 0.0,
        "safety_overrides": float(safety_overrides),
    }
    diagnostics["disabled_variant_count"] = float(len(disabled_variants))

    return ShadowRunResult(
        baseline=baseline,
        episodes=episodes,
        average_reward=float(average_reward),
        q_values=q_values,
        selection_counts=selection_counts,
        guardrail_violations=guardrail_violations,
        guardrail_breach_counts=guardrail_breach_counts,
        disabled_variants=sorted(disabled_variants),
        diagnostics=diagnostics,
    )


__all__ = [
    "PolicyVariant",
    "ShadowEpisodeLog",
    "ShadowPolicyConfig",
    "ShadowRunResult",
    "run_shadow_mode",
]
