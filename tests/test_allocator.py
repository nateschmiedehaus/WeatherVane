from __future__ import annotations

from typing import Dict, Sequence

import pytest

from apps.allocator import marketing_mix
from apps.allocator.heuristics import (
    AllocationInput,
    Guardrails,
    _coordinate_allocate,
    allocate,
    compute_bounds,
)
from apps.allocator.optimizer import OptimizationError
from apps.allocator.marketing_mix import ChannelConstraint, MarketingMixScenario
from apps.model.mmm import MMMModel


def _revenue_from_curve(curve: Sequence[Dict[str, float]], spend: float) -> float:
    """Helper replicating allocator interpolation for assertions."""
    cleaned = sorted(((float(point["spend"]), float(point.get("revenue", 0.0))) for point in curve), key=lambda x: x[0])
    if not cleaned:
        return 0.0
    if spend <= cleaned[0][0]:
        base_spend, base_rev = cleaned[0]
        if base_spend <= 0:
            return base_rev
        return (base_rev / base_spend) * spend
    for idx in range(1, len(cleaned)):
        prev_spend, prev_rev = cleaned[idx - 1]
        curr_spend, curr_rev = cleaned[idx]
        if spend <= curr_spend:
            span = curr_spend - prev_spend
            if span <= 0:
                return curr_rev
            weight = (spend - prev_spend) / span
            return prev_rev + weight * (curr_rev - prev_rev)
    last_spend, last_rev = cleaned[-1]
    if len(cleaned) == 1 or spend <= last_spend:
        return last_rev
    prev_spend, prev_rev = cleaned[-2]
    if last_spend != prev_spend:
        slope = (last_rev - prev_rev) / (last_spend - prev_spend)
    elif last_spend:
        slope = last_rev / last_spend
    else:
        slope = 0.0
    return last_rev + slope * (spend - last_spend)


def _roas_from_curve(curve: Sequence[Dict[str, float]], spend: float) -> float:
    if spend <= 0:
        return 0.0
    revenue = _revenue_from_curve(curve, spend)
    return revenue / spend if spend > 0 else 0.0


def test_allocator_respects_budget_and_cell_caps():
    cells = ["meta", "google"]
    total_budget = 210.0
    current_spend = {"meta": 95.0, "google": 95.0}
    expected_roas = {"meta": 3.1, "google": 2.4}

    guardrails = Guardrails(
        min_spend=40.0,
        max_spend=180.0,
        roas_floor=1.1,
        learning_cap=0.35,
        max_spend_by_cell={"meta": 130.0, "google": 90.0},
        min_spend_by_cell={"meta": 50.0, "google": 45.0},
    )

    result = allocate(
        AllocationInput(
            cells=cells,
            total_budget=total_budget,
            current_spend=current_spend,
            expected_roas=expected_roas,
            guardrails=guardrails,
        ),
        seed=7,
    )

    assert abs(sum(result.spends.values()) - total_budget) < 1e-3
    assert result.spends["meta"] <= 130.0 + 1e-3
    assert result.spends["google"] <= 90.0 + 1e-3
    assert result.diagnostics["optimizer"] in {"trust_constr", "coordinate_ascent", "differential_evolution"}
    assert set(result.diagnostics.get("binding_min_spend_by_cell", [])) <= set(cells)
    assert result.profit > 0
    baseline_total_spend = result.diagnostics["baseline_total_spend"]
    assert abs(baseline_total_spend - sum(current_spend.values())) < 1e-6
    baseline_profit = result.diagnostics["baseline_profit"]
    profit_delta = result.diagnostics["profit_delta_vs_current"]
    assert abs(result.profit - baseline_profit - profit_delta) < 1e-6
    assert profit_delta >= 0
    spend_shift = result.diagnostics["spend_shift_vs_current"]
    assert abs(spend_shift - (sum(result.spends.values()) - baseline_total_spend)) < 1e-6
    delta_pct = result.diagnostics.get("profit_delta_pct_vs_current")
    if delta_pct is not None:
        assert delta_pct > -1.0


def test_allocator_enforces_roas_floor_with_roi_curve():
    cells = ["meta", "google"]
    total_budget = 160.0
    current_spend = {"meta": 70.0, "google": 70.0}
    expected_roas = {"meta": 2.1, "google": 2.0}
    roi_curves = {
        "meta": [
            {"spend": 40.0, "revenue": 96.0},   # ROAS 2.4
            {"spend": 60.0, "revenue": 126.0},  # ROAS 2.1
            {"spend": 90.0, "revenue": 162.0},  # ROAS 1.8
            {"spend": 110.0, "revenue": 181.0},  # ROAS ~1.645
        ],
        "google": [
            {"spend": 40.0, "revenue": 84.0},
            {"spend": 70.0, "revenue": 133.0},
            {"spend": 90.0, "revenue": 162.0},
        ],
    }

    guardrails = Guardrails(
        min_spend=40.0,
        max_spend=120.0,
        roas_floor=1.85,
        learning_cap=0.25,
    )

    result = allocate(
        AllocationInput(
            cells=cells,
            total_budget=total_budget,
            current_spend=current_spend,
            expected_roas=expected_roas,
            roi_curves=roi_curves,
            guardrails=guardrails,
        ),
        seed=11,
    )

    meta_spend = result.spends["meta"]
    assert _roas_from_curve(roi_curves["meta"], meta_spend) >= guardrails.roas_floor - 1e-3
    roas_caps = result.diagnostics.get("roas_caps", {})
    assert "meta" in roas_caps
    assert roas_caps["meta"] <= guardrails.max_spend + 1e-3
    assert abs(sum(result.spends.values()) - result.diagnostics.get("projection_target", total_budget)) < 1e-3


def test_allocator_handles_duplicate_roi_spend_points():
    roi_curve = [
        {"spend": 0.0, "revenue": 0.0},
        {"spend": 100.0, "revenue": 200.0},
        {"spend": 100.0, "revenue": 150.0},
        {"spend": 200.0, "revenue": 320.0},
    ]

    result = allocate(
        AllocationInput(
            cells=["meta"],
            total_budget=150.0,
            current_spend={"meta": 50.0},
            expected_roas={"meta": 2.0},
            roi_curves={"meta": roi_curve},
            guardrails=Guardrails(
                min_spend=0.0,
                max_spend=250.0,
                roas_floor=1.0,
                learning_cap=3.0,
            ),
        ),
        seed=7,
    )

    assert result.spends["meta"] == pytest.approx(150.0, rel=1e-6)
    total_spend = sum(result.spends.values())
    total_revenue = result.profit + total_spend
    assert total_revenue == pytest.approx(260.0, rel=1e-6)
    assert result.profit > 0
    assert (total_revenue / total_spend) >= 1.0


def test_allocator_revenue_cache_tracks_reuse():
    cells = ["meta", "search"]
    total_budget = 200.0
    current_spend = {"meta": 100.0, "search": 100.0}
    expected_roas = {"meta": 2.0, "search": 1.9}
    roi_curves = {
        "meta": [
            {"spend": 80.0, "revenue": 168.0},
            {"spend": 100.0, "revenue": 210.0},
            {"spend": 120.0, "revenue": 240.0},
        ],
        "search": [
            {"spend": 80.0, "revenue": 148.0},
            {"spend": 100.0, "revenue": 190.0},
            {"spend": 120.0, "revenue": 214.0},
        ],
    }

    guardrails = Guardrails(
        min_spend=0.0,
        max_spend=150.0,
        roas_floor=1.0,
        learning_cap=0.25,
        min_spend_by_cell={"meta": 100.0, "search": 100.0},
        max_spend_by_cell={"meta": 100.0, "search": 100.0},
    )

    result = allocate(
        AllocationInput(
            cells=cells,
            total_budget=total_budget,
            current_spend=current_spend,
            expected_roas=expected_roas,
            roi_curves=roi_curves,
            guardrails=guardrails,
            context_tags=["history.short"],
        ),
        seed=5,
    )

    hits = float(result.diagnostics["revenue_cache_hits"])
    misses = float(result.diagnostics["revenue_cache_misses"])
    entries = float(result.diagnostics["revenue_cache_entries"])

    assert hits >= len(cells)
    assert misses >= entries >= len(cells)
    assert hits > 0


def test_allocator_evaluation_cache_captures_reuse():
    cells = ["meta", "search"]
    total_budget = 210.0
    current_spend = {"meta": 95.0, "search": 95.0}
    expected_roas = {"meta": 2.1, "search": 1.95}
    roi_curves = {
        "meta": [
            {"spend": 70.0, "revenue": 154.0},
            {"spend": 95.0, "revenue": 205.0},
            {"spend": 120.0, "revenue": 246.0},
        ],
        "search": [
            {"spend": 70.0, "revenue": 138.0},
            {"spend": 95.0, "revenue": 182.5},
            {"spend": 120.0, "revenue": 222.0},
        ],
    }

    guardrails = Guardrails(
        min_spend=50.0,
        max_spend=160.0,
        roas_floor=1.2,
        learning_cap=0.35,
        min_spend_by_cell={"meta": 80.0, "search": 80.0},
    )

    result = allocate(
        AllocationInput(
            cells=cells,
            total_budget=total_budget,
            current_spend=current_spend,
            expected_roas=expected_roas,
            roi_curves=roi_curves,
            guardrails=guardrails,
        ),
        seed=11,
    )

    diagnostics = result.diagnostics
    hits = int(diagnostics["evaluation_cache_hits"])
    misses = int(diagnostics["evaluation_cache_misses"])
    entries = int(diagnostics["evaluation_cache_entries"])

    assert misses >= 1
    assert hits >= 1
    assert entries == misses


def test_allocator_projected_gradient_candidate_respects_constraints():
    cells = ["meta", "google", "display"]
    total_budget = 240.0
    current_spend = {"meta": 80.0, "google": 80.0, "display": 55.0}
    expected_roas = {"meta": 2.2, "google": 1.9, "display": 1.8}
    roi_curves = {
        "meta": [
            {"spend": 35.0, "revenue": 77.0},
            {"spend": 80.0, "revenue": 152.0},
            {"spend": 120.0, "revenue": 204.0},
        ],
        "google": [
            {"spend": 30.0, "revenue": 60.0},
            {"spend": 70.0, "revenue": 126.0},
            {"spend": 110.0, "revenue": 187.0},
        ],
        "display": [
            {"spend": 25.0, "revenue": 48.0},
            {"spend": 60.0, "revenue": 108.0},
            {"spend": 100.0, "revenue": 168.0},
        ],
    }

    guardrails = Guardrails(
        min_spend=30.0,
        max_spend=150.0,
        roas_floor=1.6,
        learning_cap=0.25,
        min_spend_by_cell={"display": 40.0},
        max_spend_by_cell={"meta": 120.0, "google": 110.0, "display": 110.0},
    )

    result = allocate(
        AllocationInput(
            cells=cells,
            total_budget=total_budget,
            current_spend=current_spend,
            expected_roas=expected_roas,
            roi_curves=roi_curves,
            guardrails=guardrails,
            quantile_factors={"p10": 0.85, "p50": 1.0, "p90": 1.1},
        ),
        seed=19,
    )

    assert abs(sum(result.spends.values()) - total_budget) < 1e-3

    for cell, spend in result.spends.items():
        if spend <= 1e-6:
            continue
        assert _roas_from_curve(roi_curves[cell], spend) >= guardrails.roas_floor - 1e-3

    candidate_summaries = result.diagnostics.get("optimizer_candidates", [])
    assert any(summary.get("optimizer") == "projected_gradient" for summary in candidate_summaries)
    assert result.diagnostics.get("optimizer_winner") in {"projected_gradient", "trust_constr", "coordinate_ascent"}


def test_project_to_feasible_handles_large_rebalance():
    from apps.allocator.heuristics import _project_to_feasible

    values = [160.0 + (idx % 5) * 12.0 for idx in range(80)]
    lower = [40.0 + (idx % 3) * 5.0 for idx in range(80)]
    upper = [220.0 - (idx % 4) * 8.0 for idx in range(80)]
    original_sum = sum(values)
    target_sum = original_sum * 0.85

    projected, info = _project_to_feasible(values, lower, upper, target_sum)

    assert all(lower[idx] - 1e-6 <= projected[idx] <= upper[idx] + 1e-6 for idx in range(80))
    assert abs(sum(projected) - info["target_sum"]) <= 1e-6
    assert abs(info["target_sum"] - target_sum) <= 1e-6
    assert info["residual_lower"] <= 1e-6
    assert info["residual_upper"] <= 1e-6


def test_coordinate_allocate_avoids_duplicate_evaluations():
    cells = ["meta", "search", "display"]
    guardrails = Guardrails(
        min_spend=30.0,
        max_spend=150.0,
        roas_floor=0.0,
        learning_cap=0.5,
    )
    input_data = AllocationInput(
        cells=cells,
        total_budget=240.0,
        current_spend={"meta": 90.0, "search": 80.0, "display": 70.0},
        expected_roas={"meta": 2.2, "search": 2.0, "display": 1.8},
        guardrails=guardrails,
    )

    min_bounds, max_bounds, softened = compute_bounds(cells, guardrails, input_data.total_budget)
    seen_vectors: Dict[tuple[float, ...], int] = {}
    evaluation_stats = {"hits": 0, "misses": 0}

    def evaluate_stub(vector):
        key = tuple(round(value, 6) for value in vector)
        count = seen_vectors.get(key, 0)
        seen_vectors[key] = count + 1
        if count == 0:
            evaluation_stats["misses"] += 1
        else:
            evaluation_stats["hits"] += 1
        total = float(sum(vector))
        return total, {"p50": total}, {"penalty": 0.0}

    def roas_stub(cell: str, spend: float) -> float:
        return 2.0 if spend > 0 else 0.0

    result = _coordinate_allocate(
        input_data=input_data,
        evaluate_fn=evaluate_stub,
        roas_for=roas_stub,
        seed=11,
        min_bounds=min_bounds,
        max_bounds=max_bounds,
        min_softened=softened,
        roas_caps={},
        evaluation_stats=evaluation_stats,
    )

    assert len(seen_vectors) == evaluation_stats["misses"]
    assert abs(result.diagnostics["nfev"] - float(evaluation_stats["misses"])) < 1e-6
    if any(count > 1 for count in seen_vectors.values()):
        assert evaluation_stats["hits"] >= 1


def test_projected_gradient_records_evaluation_count():
    guardrails = Guardrails(
        min_spend=40.0,
        max_spend=150.0,
        roas_floor=1.1,
        learning_cap=0.3,
    )
    input_data = AllocationInput(
        cells=["meta", "search", "display"],
        total_budget=260.0,
        current_spend={"meta": 90.0, "search": 90.0, "display": 70.0},
        expected_roas={"meta": 2.4, "search": 2.2, "display": 1.7},
        guardrails=guardrails,
        context_tags=["history.short"],
    )

    result = allocate(input_data, seed=5)

    assert result.diagnostics.get("optimizer") == "projected_gradient"
    evaluations = result.diagnostics.get("evaluations")
    nfev = result.diagnostics.get("nfev")
    assert evaluations is not None and evaluations > 0
    assert nfev is not None and nfev > 0
    assert abs(float(evaluations) - float(nfev)) <= 1e-6


def test_project_to_feasible_clamps_unreachable_targets():
    from apps.allocator.heuristics import _project_to_feasible

    values = [95.0 for _ in range(12)]
    lower = [10.0 for _ in range(12)]
    upper = [120.0 for _ in range(12)]
    target_sum = 2000.0  # exceeds aggregate max

    projected, info = _project_to_feasible(values, lower, upper, target_sum)

    assert abs(sum(projected) - sum(upper)) <= 1e-6
    assert info["target_sum"] == sum(upper)
    assert info["residual_lower"] <= 1e-6
    assert info["residual_upper"] <= 1e-6


def test_prepare_marketing_mix_reuses_components(monkeypatch):
    mmm = MMMModel(
        base_roas=1.8,
        elasticity={"meta": 0.22, "search": -0.1, "display": 0.05},
        mean_roas={"meta": 2.2, "search": 1.6, "display": 1.4},
        mean_spend={"meta": 100.0, "search": 120.0, "display": 60.0},
        features=["meta", "search", "display"],
    )
    channels = [
        ChannelConstraint(
            name="meta",
            current_spend=95.0,
            min_spend=60.0,
            max_spend=150.0,
            weather_multiplier=1.2,
        ),
        ChannelConstraint(
            name="search",
            current_spend=105.0,
            min_spend=55.0,
            max_spend=155.0,
            weather_multiplier=0.9,
        ),
        ChannelConstraint(
            name="display",
            current_spend=65.0,
            min_spend=30.0,
            max_spend=110.0,
            weather_multiplier=1.05,
        ),
    ]
    scenario = MarketingMixScenario(
        mmm_model=mmm,
        channels=channels,
        total_budget=280.0,
        roas_floor=1.15,
        learning_cap=0.3,
        risk_aversion=0.25,
        quantile_factors={"p10": 0.85, "p50": 1.0, "p90": 1.15},
        context_tags=("test",),
    )

    call_count = 0
    original = marketing_mix._build_allocation_components

    def counting_components(model, channel_defs):
        nonlocal call_count
        call_count += 1
        return original(model, channel_defs)

    monkeypatch.setattr(marketing_mix, "_build_allocation_components", counting_components)

    prepared = marketing_mix.prepare_marketing_mix(scenario)
    assert call_count == 1

    baseline_result = marketing_mix.solve_marketing_mix(scenario, prepared=prepared)
    assert baseline_result.recommendations
    assert call_count == 1

    variant = MarketingMixScenario(
        mmm_model=mmm,
        channels=channels,
        total_budget=280.0,
        roas_floor=1.15,
        learning_cap=0.26,
        risk_aversion=0.18,
        quantile_factors={"p10": 0.9, "p50": 1.0, "p90": 1.12},
        context_tags=("test", "variant"),
    )
    marketing_mix.solve_marketing_mix(variant, prepared=prepared)
    assert call_count == 1


def test_marketing_mix_summary_reuses_prepared_curves(monkeypatch):
    mmm = MMMModel(
        base_roas=1.7,
        elasticity={"meta": 0.2, "search": -0.15},
        mean_roas={"meta": 2.1, "search": 1.5},
        mean_spend={"meta": 80.0, "search": 90.0},
        features=["meta", "search"],
    )
    channels = [
        ChannelConstraint(
            name="meta",
            current_spend=70.0,
            min_spend=40.0,
            max_spend=120.0,
            weather_multiplier=1.1,
        ),
        ChannelConstraint(
            name="search",
            current_spend=60.0,
            min_spend=20.0,
            max_spend=100.0,
            weather_multiplier=0.95,
        ),
    ]
    scenario = MarketingMixScenario(
        mmm_model=mmm,
        channels=channels,
        total_budget=150.0,
        roas_floor=1.2,
        context_tags=("test",),
    )

    gate = {"allow": True}
    original = mmm.roas_for

    def instrumented_roas(feature: str, spend: float) -> float:
        if not gate["allow"]:
            raise AssertionError("roas_for should not be called during solve_marketing_mix")
        return original(feature, spend)

    monkeypatch.setattr(mmm, "roas_for", instrumented_roas)

    prepared = marketing_mix.prepare_marketing_mix(scenario)
    assert prepared.components.cells

    gate["allow"] = False
    result = marketing_mix.solve_marketing_mix(scenario, prepared=prepared)
    assert result.recommendations


def test_marketing_mix_fallback_uses_precomputed_curves(monkeypatch):
    mmm = MMMModel(
        base_roas=1.65,
        elasticity={"meta": 0.18, "search": -0.12},
        mean_roas={"meta": 2.05, "search": 1.48},
        mean_spend={"meta": 75.0, "search": 85.0},
        features=["meta", "search"],
    )
    channels = [
        ChannelConstraint(
            name="meta",
            current_spend=68.0,
            min_spend=40.0,
            max_spend=115.0,
            weather_multiplier=1.05,
        ),
        ChannelConstraint(
            name="search",
            current_spend=62.0,
            min_spend=30.0,
            max_spend=105.0,
            weather_multiplier=0.92,
        ),
    ]
    scenario = MarketingMixScenario(
        mmm_model=mmm,
        channels=channels,
        total_budget=150.0,
        roas_floor=1.15,
        context_tags=("test", "fallback"),
    )

    prepared = marketing_mix.prepare_marketing_mix(scenario)

    def fail_optimize(*_args, **_kwargs):
        raise OptimizationError("forced failure to trigger heuristic fallback")

    monkeypatch.setattr(marketing_mix, "optimize_allocation", fail_optimize)

    import apps.allocator.heuristics as heuristics_module

    def forbid_prepare(_roi_curves):
        raise AssertionError("heuristic fallback should reuse precomputed ROI curves")

    monkeypatch.setattr(heuristics_module, "_prepare_roi_lookup", forbid_prepare)

    result = marketing_mix.solve_marketing_mix(scenario, prepared=prepared)
    assert result.recommendations
    diagnostics = result.allocation.diagnostics
    assert diagnostics.get("optimizer_failure") == "forced failure to trigger heuristic fallback"
    assert diagnostics.get("optimizer") != "cvxpy"


def test_allocator_inventory_penalty_reuses_cached_revenue(monkeypatch):
    import apps.allocator.heuristics as heuristics_module

    def build_input(inventory_available: float | None) -> AllocationInput:
        guardrails = Guardrails(
            min_spend=40.0,
            max_spend=140.0,
            roas_floor=1.1,
            learning_cap=0.35,
            inventory_available=inventory_available,
            avg_order_value=50.0,
        )
        return AllocationInput(
            cells=["meta", "search"],
            total_budget=200.0,
            current_spend={"meta": 90.0, "search": 90.0},
            expected_roas={"meta": 2.0, "search": 1.8},
            roi_curves={
                "meta": [
                    {"spend": 80.0, "revenue": 184.0},
                    {"spend": 120.0, "revenue": 216.0},
                ],
                "search": [
                    {"spend": 70.0, "revenue": 133.0},
                    {"spend": 110.0, "revenue": 187.0},
                ],
            },
            guardrails=guardrails,
        )

    def count_interpolations(inventory_available: float | None) -> int:
        with monkeypatch.context() as patcher:
            calls = {"count": 0}
            original = heuristics_module._interpolate_revenue

            def counting(spends, revenues, spend):
                calls["count"] += 1
                return original(spends, revenues, spend)

            patcher.setattr(heuristics_module, "_interpolate_revenue", counting)
            allocate(build_input(inventory_available), seed=7)
        return calls["count"]

    baseline_calls = count_interpolations(None)
    constrained_calls = count_interpolations(500.0)

    # Inventory-aware runs should stay within ~10% of the baseline interpolation count,
    # ensuring we reuse cached revenues instead of re-evaluating ROI curves for every penalty check.
    assert constrained_calls <= baseline_calls * 1.1


def test_allocator_quantile_profits_reflect_total_revenue():
    cells = ["meta", "search"]
    roi_curves = {
        "meta": [
            {"spend": 0.0, "revenue": 0.0},
            {"spend": 80.0, "revenue": 168.0},
            {"spend": 120.0, "revenue": 252.0},
        ],
        "search": [
            {"spend": 0.0, "revenue": 0.0},
            {"spend": 80.0, "revenue": 136.0},
            {"spend": 120.0, "revenue": 204.0},
        ],
    }
    guardrails = Guardrails(
        min_spend=0.0,
        max_spend=220.0,
        roas_floor=0.0,
        learning_cap=10.0,
    )

    result = allocate(
        AllocationInput(
            cells=cells,
            total_budget=200.0,
            current_spend={"meta": 90.0, "search": 90.0},
            expected_roas={"meta": 2.1, "search": 1.7},
            roi_curves=roi_curves,
            guardrails=guardrails,
            quantile_factors={"p10": 0.85, "p50": 1.0, "p90": 1.1},
            risk_aversion=0.0,
        ),
        seed=13,
    )

    total_spend = sum(result.spends.values())
    total_revenue = sum(_revenue_from_curve(roi_curves[cell], result.spends[cell]) for cell in cells)

    expected_scenarios = {
        "scenario_profit_p10": total_revenue * 0.85 - total_spend,
        "scenario_profit_p50": total_revenue * 1.0 - total_spend,
        "scenario_profit_p90": total_revenue * 1.1 - total_spend,
    }

    for key, expected in expected_scenarios.items():
        assert result.diagnostics[key] == pytest.approx(expected, rel=1e-6)

    blended = (
        0.2 * expected_scenarios["scenario_profit_p10"]
        + 0.6 * expected_scenarios["scenario_profit_p50"]
        + 0.2 * expected_scenarios["scenario_profit_p90"]
    )
    assert result.diagnostics["expected_profit_raw"] == pytest.approx(blended, rel=1e-6)
    assert result.diagnostics["worst_case_profit"] == pytest.approx(
        min(expected_scenarios.values()), rel=1e-6
    )
    assert result.diagnostics["risk_penalty"] == pytest.approx(0.0, abs=1e-9)
