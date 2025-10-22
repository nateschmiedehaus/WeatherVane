from __future__ import annotations

import math
from pathlib import Path

import cvxpy as cp
import pytest

from apps.allocator.optimizer import (
    BudgetItem,
    HierarchyConstraint,
    OptimizerRequest,
    _clean_roi_curve,
    _evaluate_roi,
    optimize_allocation,
)

_PREFERRED_SOLVERS = ("CLARABEL", "ECOS", "SCS", "SCIPY")
_AVAILABLE_SOLVER = next((solver for solver in _PREFERRED_SOLVERS if solver in cp.installed_solvers()), None)

if _AVAILABLE_SOLVER is None:
    pytest.skip("No supported cvxpy solver available for allocator optimizer tests", allow_module_level=True)


def _solve(request: OptimizerRequest):
    return optimize_allocation(request, solver=_AVAILABLE_SOLVER)


def test_respects_total_budget_constraint():
    items = [
        BudgetItem(
            id="meta_snow",
            name="Meta - Snow Gear",
            min_spend=20.0,
            max_spend=200.0,
            expected_roas=3.0,
            roi_curve=[
                {"spend": 0.0, "revenue": 0.0},
                {"spend": 120.0, "revenue": 360.0},
                {"spend": 200.0, "revenue": 560.0},
            ],
        ),
        BudgetItem(
            id="search_core",
            name="Search - Core",
            min_spend=10.0,
            max_spend=150.0,
            expected_roas=2.4,
            roi_curve=[
                {"spend": 0.0, "revenue": 0.0},
                {"spend": 90.0, "revenue": 216.0},
                {"spend": 150.0, "revenue": 330.0},
            ],
        ),
        BudgetItem(
            id="display_prospecting",
            name="Display - Prospecting",
            min_spend=0.0,
            max_spend=120.0,
            expected_roas=1.6,
        ),
    ]
    request = OptimizerRequest(
        total_budget=260.0,
        items=items,
        hierarchy_constraints=[
            HierarchyConstraint(
                id="total",
                members=[item.id for item in items],
                min_spend=260.0,
                max_spend=260.0,
            )
        ],
    )
    result = _solve(request)
    assert math.isclose(sum(result.spends.values()), 260.0, rel_tol=1e-6, abs_tol=1e-6)
    for item in items:
        spend = result.spends[item.id]
        assert item.min_spend - 1e-6 <= spend <= item.max_spend + 1e-6


def test_respects_hierarchical_constraints():
    items = [
        BudgetItem(
            id="brandA_campaign1_product1",
            name="Brand A / Awareness / Ski Jacket",
            min_spend=0.0,
            max_spend=180.0,
            expected_roas=3.0,
            roi_curve=[
                {"spend": 80.0, "revenue": 256.0},
                {"spend": 120.0, "revenue": 360.0},
                {"spend": 180.0, "revenue": 510.0},
            ],
        ),
        BudgetItem(
            id="brandA_campaign1_product2",
            name="Brand A / Awareness / Gloves",
            min_spend=0.0,
            max_spend=110.0,
            expected_roas=2.4,
            roi_curve=[
                {"spend": 60.0, "revenue": 156.0},
                {"spend": 110.0, "revenue": 250.0},
            ],
        ),
        BudgetItem(
            id="brandB_campaign2_product1",
            name="Brand B / Performance / Boots",
            min_spend=30.0,
            max_spend=140.0,
            expected_roas=2.8,
            roi_curve=[
                {"spend": 50.0, "revenue": 150.0},
                {"spend": 140.0, "revenue": 392.0},
            ],
        ),
    ]
    constraints = [
        HierarchyConstraint(
            id="brand_a",
            members=["brandA_campaign1_product1", "brandA_campaign1_product2"],
            max_spend=220.0,
        ),
        HierarchyConstraint(
            id="campaign_awareness",
            members=["brandA_campaign1_product1", "brandA_campaign1_product2"],
            min_spend=100.0,
        ),
        HierarchyConstraint(
            id="campaign_performance",
            members=["brandB_campaign2_product1"],
            min_spend=80.0,
            max_spend=140.0,
        ),
        HierarchyConstraint(
            id="total",
            members=[item.id for item in items],
            min_spend=280.0,
            max_spend=280.0,
        ),
    ]
    result = _solve(
        OptimizerRequest(
            total_budget=280.0,
            items=items,
            hierarchy_constraints=constraints,
        )
    )
    brand_a_spend = result.diagnostics["hierarchy_actuals"]["brand_a"]
    campaign_awareness = result.diagnostics["hierarchy_actuals"]["campaign_awareness"]
    campaign_performance = result.diagnostics["hierarchy_actuals"]["campaign_performance"]

    assert brand_a_spend <= 220.0 + 1e-6
    assert campaign_awareness >= 100.0 - 1e-6
    assert 80.0 - 1e-6 <= campaign_performance <= 140.0 + 1e-6


def test_oos_products_get_zero_budget():
    items = [
        BudgetItem(
            id="oos_boots",
            name="Boots (OOS)",
            min_spend=0.0,
            max_spend=200.0,
            expected_roas=4.0,
            inventory_status="out_of_stock",
        ),
        BudgetItem(
            id="in_stock_coats",
            name="Coats (In Stock)",
            min_spend=50.0,
            max_spend=220.0,
            expected_roas=2.8,
        ),
    ]
    request = OptimizerRequest(
        total_budget=220.0,
        items=items,
        hierarchy_constraints=[
            HierarchyConstraint(
                id="total",
                members=[item.id for item in items],
                min_spend=220.0,
                max_spend=220.0,
            )
        ],
    )
    result = _solve(request)
    assert result.spends["oos_boots"] == pytest.approx(0.0, abs=1e-6)


def test_low_stock_products_reduced_budget():
    base_max = 180.0
    items = [
        BudgetItem(
            id="low_stock_hats",
            name="Hats (Low Stock)",
            min_spend=10.0,
            max_spend=base_max,
            expected_roas=3.2,
            inventory_status="low_stock",
            inventory_multiplier=0.3,
        ),
        BudgetItem(
            id="in_stock_jackets",
            name="Jackets",
            min_spend=40.0,
            max_spend=220.0,
            expected_roas=2.6,
        ),
    ]
    request = OptimizerRequest(
        total_budget=240.0,
        items=items,
        hierarchy_constraints=[
            HierarchyConstraint(
                id="total",
                members=[item.id for item in items],
                min_spend=240.0,
                max_spend=240.0,
            )
        ],
    )
    result = _solve(request)
    assert result.spends["low_stock_hats"] <= base_max * 0.3 + 1e-6


def test_platform_minimums_respected():
    items = [
        BudgetItem(
            id="meta_brand",
            name="Meta Brand",
            min_spend=0.0,
            max_spend=180.0,
            expected_roas=3.5,
            platform_minimum=25.0,
        ),
        BudgetItem(
            id="search_perf",
            name="Search Performance",
            min_spend=10.0,
            max_spend=210.0,
            expected_roas=2.0,
        ),
    ]
    request = OptimizerRequest(
        total_budget=220.0,
        items=items,
        hierarchy_constraints=[
            HierarchyConstraint(
                id="total",
                members=[item.id for item in items],
                min_spend=220.0,
                max_spend=220.0,
            )
        ],
    )
    result = _solve(request)
    meta_spend = result.spends["meta_brand"]
    assert meta_spend >= 25.0 - 1e-6


def test_roas_floor_limits_spend_with_dense_roi_curve():
    roi_curve = [
        {"spend": 0.0, "revenue": 0.0},
        {"spend": 50.0, "revenue": 150.0},
        {"spend": 100.0, "revenue": 260.0},
    ]
    floor_item = BudgetItem(
        id="floor_sensitive",
        name="High ROAS then drop",
        min_spend=50.0,
        max_spend=120.0,
        expected_roas=3.2,
        roi_curve=roi_curve,
    )
    anchor_item = BudgetItem(
        id="anchor",
        name="Stable channel",
        min_spend=0.0,
        max_spend=40.0,
        expected_roas=3.4,
        roi_curve=[
            {"spend": 0.0, "revenue": 0.0},
            {"spend": 40.0, "revenue": 136.0},
        ],
    )
    request = OptimizerRequest(
        total_budget=100.0,
        items=[floor_item, anchor_item],
        hierarchy_constraints=[
            HierarchyConstraint(
                id="total",
                members=["floor_sensitive", "anchor"],
                min_spend=100.0,
                max_spend=100.0,
            )
        ],
        roas_floor=2.8,
    )
    result = _solve(request)
    floor_spend = result.spends["floor_sensitive"]
    anchor_spend = result.spends["anchor"]
    floor_revenue = _evaluate_roi(roi_curve, floor_spend, floor_item.expected_roas)
    anchor_revenue = _evaluate_roi(anchor_item.roi_curve, anchor_spend, anchor_item.expected_roas)

    assert floor_spend == pytest.approx(60.0, abs=1e-6)
    assert anchor_spend == pytest.approx(40.0, abs=1e-6)
    assert floor_revenue / max(floor_spend, 1e-9) >= request.roas_floor - 1e-6
    assert pytest.approx(floor_revenue + anchor_revenue, rel=1e-6, abs=1e-6) == result.total_revenue


def test_dense_roi_curve_evaluation_matches_linear_interpolation():
    roi_curve = [
        {"spend": float(step), "revenue": float((4.0 - 0.001 * step) * step)}
        for step in range(0, 1001, 5)
    ]
    cleaned = _clean_roi_curve(roi_curve)
    expected_roas = 3.0

    def manual_eval(points, spend):
        if spend <= 0:
            return 0.0
        if not points:
            return max(expected_roas, 0.0) * spend
        for idx in range(1, len(points)):
            prev_spend, prev_rev = points[idx - 1]
            curr_spend, curr_rev = points[idx]
            if spend <= curr_spend + 1e-9:
                span = curr_spend - prev_spend
                if span <= 1e-9:
                    return curr_rev
                weight = (spend - prev_spend) / span
                return prev_rev + weight * (curr_rev - prev_rev)
        last_spend, last_rev = points[-1]
        if len(points) == 1 or spend <= last_spend + 1e-9:
            return last_rev
        prev_spend, prev_rev = points[-2]
        if last_spend != prev_spend:
            slope = (last_rev - prev_rev) / (last_spend - prev_spend)
        elif last_spend > 0:
            slope = last_rev / last_spend
        else:
            slope = expected_roas
        return last_rev + slope * (spend - last_spend)

    for spend in [0.0, 12.5, 175.0, 400.0, 999.0, 1500.0]:
        expected = manual_eval(cleaned, spend)
        observed = _evaluate_roi(roi_curve, spend, expected_roas)
        assert observed == pytest.approx(expected, rel=1e-6, abs=1e-6)


def test_no_heuristic_rules_in_code():
    content = Path("apps/allocator/optimizer.py").read_text()
    assert "budget *= 1.10" not in content
    assert "if roas >" not in content
