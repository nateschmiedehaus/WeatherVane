from pathlib import Path

import pytest

from apps.model.weather_backtest import (
    aggregate_results,
    evaluate_backtests,
    render_markdown,
)


@pytest.fixture(scope="module")
def backtest_results():
    data_root = Path("experiments/weather/backtests")
    results = evaluate_backtests(data_root)
    # Sort results for deterministic assertions
    results.sort(key=lambda item: item.tenant_id)
    return results


def test_evaluate_backtests_reports_consistent_improvement(backtest_results):
    assert backtest_results, "Expected at least one tenant backtest result"
    for result in backtest_results:
        assert result.sample_size > 0
        assert result.mae_weather < result.mae_control
        assert result.relative_mae_improvement > 0
        assert 0 <= result.win_rate <= 1
        if result.coverage_ratio is not None:
            assert 0 <= result.coverage_ratio <= 1

    # Spot-check demo tenant for stability of sample sizing
    demo = next(res for res in backtest_results if res.tenant_id == "demo-tenant")
    assert demo.sample_size == 8
    assert demo.win_rate > 0.8


def test_aggregate_results_and_render_markdown(backtest_results):
    aggregate = aggregate_results(backtest_results)

    assert aggregate.total_samples == sum(result.sample_size for result in backtest_results)
    assert aggregate.mae_weather < aggregate.mae_control
    assert aggregate.relative_mae_improvement > 0

    markdown = render_markdown(backtest_results, aggregate)
    assert markdown.startswith("# Weather Model Backtest Summary")
    assert "| Tenant | Weather MAE" in markdown
    for result in backtest_results:
        assert result.tenant_id in markdown
    assert "python -m apps.model.weather_backtest" in markdown
