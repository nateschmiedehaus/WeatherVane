from shared.libs.performance import CacheWarmingInputs, evaluate_cache_warming


def _result_for(results, strategy):
    return next(item for item in results if item.strategy == strategy)


def test_predictive_prefetch_leads_under_balanced_workload():
    inputs = CacheWarmingInputs(
        request_rate_per_minute=180,
        hotset_fraction=0.4,
        cache_capacity_fraction=0.55,
        churn_per_hour=0.18,
        hit_latency_ms=12.0,
        miss_penalty_ms=95.0,
        warm_cost_ms=4.0,
        predictive_recall=0.88,
        predictive_precision=0.84,
    )

    results = evaluate_cache_warming(inputs)

    assert results[0].strategy == "predictive"
    predictive = results[0]
    static = _result_for(results, "static")

    assert predictive.expected_latency_ms < static.expected_latency_ms
    assert "prefetch-precision-low" not in predictive.risk_flags


def test_low_precision_prefetch_falls_behind_static_warming():
    inputs = CacheWarmingInputs(
        request_rate_per_minute=200,
        hotset_fraction=0.5,
        cache_capacity_fraction=0.45,
        churn_per_hour=0.22,
        hit_latency_ms=15.0,
        miss_penalty_ms=110.0,
        warm_cost_ms=6.0,
        predictive_recall=0.55,
        predictive_precision=0.58,
    )

    results = evaluate_cache_warming(inputs)

    assert results[0].strategy == "static"
    predictive = _result_for(results, "predictive")
    assert "prefetch-precision-low" in predictive.risk_flags
    assert predictive.score > _result_for(results, "static").score


def test_demand_only_strategy_flags_high_churn_risk():
    inputs = CacheWarmingInputs(
        request_rate_per_minute=150,
        hotset_fraction=0.35,
        cache_capacity_fraction=0.35,
        churn_per_hour=0.55,
        hit_latency_ms=18.0,
        miss_penalty_ms=120.0,
        warm_cost_ms=5.0,
        predictive_recall=0.4,
        predictive_precision=0.6,
    )

    results = evaluate_cache_warming(inputs)
    demand = _result_for(results, "demand")

    assert "churn-causes-frequent-cold-bursts" in demand.risk_flags
    assert demand.expected_latency_ms > _result_for(results, "predictive").expected_latency_ms
