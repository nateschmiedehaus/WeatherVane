from apps.allocator.heuristics import Guardrails
from apps.allocator.stress import (
    StressTestConfig,
    default_stress_suite,
    run_stress_test,
)


def test_default_stress_suite_returns_regret_bounds():
    report = default_stress_suite()
    assert len(report.results) == 3
    assert report.worst_regret_pct < 0.35
    names = {result.name for result in report.results}
    assert {"balanced-curve", "underestimated-meta", "inventory-constrained"} <= names
    for result in report.results:
        assert result.actual_profit <= result.oracle_profit + 1e-6
        assert result.regret >= 0.0


def test_run_stress_test_zero_regret_when_curves_match():
    linear_curve = [
        {"spend": 100.0, "revenue": 200.0},
        {"spend": 200.0, "revenue": 400.0},
    ]
    config = StressTestConfig(
        name="flat-response",
        cells=("meta", "search"),
        total_budget=200.0,
        current_spend={"meta": 100.0, "search": 100.0},
        expected_roas={"meta": 2.0, "search": 2.0},
        actual_roi_curves={"meta": linear_curve, "search": linear_curve},
        guardrails=Guardrails(min_spend=80.0, max_spend=150.0, roas_floor=1.0, learning_cap=0.5),
    )

    result = run_stress_test(config)
    assert result.regret < 1e-6
    assert result.regret_pct < 1e-6
    assert abs(result.actual_profit - result.oracle_profit) < 1e-6
