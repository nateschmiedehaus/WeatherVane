"""
Lightweight cache warming evaluators used for WeatherVane orchestration research.

The helpers model three cache warming strategies:

* ``static`` – Preload the known hotset on a fixed cadence.
* ``predictive`` – Prefetch using demand signals or ML predictions.
* ``demand`` – Allow cache fills on demand with opportunistic reuse.

Each strategy returns the expected steady-state latency, operational load, and
warnings that highlight when an approach is likely to underperform.  The models
are intentionally simple so we can reason about trade-offs when shaping product
work and orchestration improvements.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Literal

StrategyName = Literal["static", "predictive", "demand"]


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


@dataclass(frozen=True)
class CacheWarmingInputs:
    """
    Input parameters describing workload and cache behaviour.

    Attributes:
        request_rate_per_minute: Steady-state requests routed through the cache.
        hotset_fraction: Portion of traffic concentrated on the hottest entities (0-1).
        cache_capacity_fraction: Fraction of hotset the cache can hold (0-1).
        churn_per_hour: Fraction of the hotset that changes each hour (0-1).
        hit_latency_ms: Latency for a warm cache hit.
        miss_penalty_ms: Additional latency when serving a cold request.
        warm_cost_ms: Cost of issuing a proactive warm/fill operation.
        predictive_recall: Recall of the predictive prefetcher for future demand (0-1).
        predictive_precision: Precision of the predictive prefetcher (0-1).
    """

    request_rate_per_minute: float
    hotset_fraction: float
    cache_capacity_fraction: float
    churn_per_hour: float
    hit_latency_ms: float
    miss_penalty_ms: float
    warm_cost_ms: float
    predictive_recall: float
    predictive_precision: float

    def normalised(self) -> "CacheWarmingInputs":
        """Return a copy clamped to sensible bounds."""
        return CacheWarmingInputs(
            request_rate_per_minute=max(0.0, self.request_rate_per_minute),
            hotset_fraction=_clamp(self.hotset_fraction, 0.0, 1.0),
            cache_capacity_fraction=_clamp(self.cache_capacity_fraction, 0.0, 1.0),
            churn_per_hour=_clamp(self.churn_per_hour, 0.0, 1.0),
            hit_latency_ms=max(0.0, self.hit_latency_ms),
            miss_penalty_ms=max(0.0, self.miss_penalty_ms),
            warm_cost_ms=max(0.0, self.warm_cost_ms),
            predictive_recall=_clamp(self.predictive_recall, 0.0, 1.0),
            predictive_precision=_clamp(self.predictive_precision, 0.0, 1.0),
        )


@dataclass(frozen=True)
class CacheWarmingResult:
    """Evaluation summary for a single cache warming strategy."""

    strategy: StrategyName
    expected_latency_ms: float
    ops_load_per_minute: float
    warm_coverage: float
    risk_flags: List[str]
    score: float


def evaluate_cache_warming(raw_inputs: CacheWarmingInputs) -> List[CacheWarmingResult]:
    """
    Evaluate cache warming strategies under a given workload.

    Returns strategy results ordered from most to least favourable using a
    blended score (latency plus a light penalty for operational load).
    """

    inputs = raw_inputs.normalised()
    base_latency = inputs.hit_latency_ms
    cold_latency = inputs.hit_latency_ms + inputs.miss_penalty_ms
    capacity = inputs.cache_capacity_fraction
    target_hotset = inputs.hotset_fraction
    hotset = min(target_hotset, capacity if capacity > 0 else target_hotset)
    churn_per_minute = inputs.churn_per_hour / 60.0

    static_result = _evaluate_static_strategy(
        base_latency=base_latency,
        cold_latency=cold_latency,
        hotset=hotset,
        target_hotset=target_hotset,
        capacity=capacity,
        request_rate=inputs.request_rate_per_minute,
        churn_per_minute=churn_per_minute,
    )
    predictive_result = _evaluate_predictive_strategy(
        base_latency=base_latency,
        cold_latency=cold_latency,
        capacity=capacity,
        hotset=hotset,
        target_hotset=target_hotset,
        request_rate=inputs.request_rate_per_minute,
        churn_per_minute=churn_per_minute,
        warm_cost=inputs.warm_cost_ms,
        recall=inputs.predictive_recall,
        precision=inputs.predictive_precision,
    )
    demand_result = _evaluate_demand_strategy(
        base_latency=base_latency,
        cold_latency=cold_latency,
        hotset=hotset,
        churn_per_minute=churn_per_minute,
    )

    results = [static_result, predictive_result, demand_result]
    results.sort(key=lambda item: item.score)
    return results


def _evaluate_static_strategy(
    *,
    base_latency: float,
    cold_latency: float,
    hotset: float,
    target_hotset: float,
    capacity: float,
    request_rate: float,
    churn_per_minute: float,
) -> CacheWarmingResult:
    warm_coverage = hotset
    expected_latency = warm_coverage * base_latency + (1 - warm_coverage) * cold_latency
    warm_ops = warm_coverage * request_rate * churn_per_minute

    risks: List[str] = []
    if capacity + 1e-6 < target_hotset:
        risks.append("cache-capacity-gap")
    if churn_per_minute > 0.2 / 60:
        risks.append("churn-spikes-increase-prewarm-cost")

    score = expected_latency + warm_ops * 0.5 + len(risks) * 1.5
    return CacheWarmingResult(
        strategy="static",
        expected_latency_ms=expected_latency,
        ops_load_per_minute=warm_ops,
        warm_coverage=warm_coverage,
        risk_flags=risks,
        score=score,
    )


def _evaluate_predictive_strategy(
    *,
    base_latency: float,
    cold_latency: float,
    capacity: float,
    hotset: float,
    target_hotset: float,
    request_rate: float,
    churn_per_minute: float,
    warm_cost: float,
    recall: float,
    precision: float,
) -> CacheWarmingResult:
    capacity_remaining = max(0.0, capacity - hotset)
    additional_coverage = min(capacity_remaining, (1 - hotset) * recall)
    warm_coverage = hotset + additional_coverage

    expected_latency = warm_coverage * base_latency + (1 - warm_coverage) * cold_latency
    over_fetch_rate = additional_coverage * max(0.0, 1 - precision)
    warm_ops = warm_coverage * request_rate * churn_per_minute + over_fetch_rate * request_rate
    expected_latency += over_fetch_rate * warm_cost

    risks: List[str] = []
    if precision < 0.75:
        risks.append("prefetch-precision-low")
    if recall < 0.6:
        risks.append("insufficient-recall-for-tail-traffic")
    if capacity + 1e-6 < target_hotset and recall < 0.8:
        risks.append("capacity-shortfall-requires-better-modeling")
    if warm_ops > request_rate * 0.4:
        risks.append("prefetch-load-heavy")

    score = expected_latency + warm_ops * 0.5 + len(risks) * 1.5
    return CacheWarmingResult(
        strategy="predictive",
        expected_latency_ms=expected_latency,
        ops_load_per_minute=warm_ops,
        warm_coverage=warm_coverage,
        risk_flags=risks,
        score=score,
    )


def _evaluate_demand_strategy(
    *,
    base_latency: float,
    cold_latency: float,
    hotset: float,
    churn_per_minute: float,
) -> CacheWarmingResult:
    warm_coverage = hotset * max(0.0, 1 - churn_per_minute * 60)
    warm_coverage = _clamp(warm_coverage, 0.0, hotset)

    expected_latency = warm_coverage * base_latency + (1 - warm_coverage) * cold_latency
    warm_ops = warm_coverage * 0.05  # primarily opportunistic reuse

    risks: List[str] = []
    if warm_coverage < 0.5 * hotset:
        risks.append("low-steady-hit-rate")
    if churn_per_minute > 0.3 / 60:
        risks.append("churn-causes-frequent-cold-bursts")

    score = expected_latency + warm_ops * 0.5 + len(risks) * 1.5
    return CacheWarmingResult(
        strategy="demand",
        expected_latency_ms=expected_latency,
        ops_load_per_minute=warm_ops,
        warm_coverage=warm_coverage,
        risk_flags=risks,
        score=score,
    )
