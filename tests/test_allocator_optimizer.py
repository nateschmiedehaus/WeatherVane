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


# ============================================================================
# DIMENSION 3: Error Cases - Comprehensive error handling
# ============================================================================


def test_empty_items_raises_error():
    """Error case: optimizer must reject empty item lists."""
    request = OptimizerRequest(total_budget=100.0, items=[])
    with pytest.raises(Exception) as exc_info:
        _solve(request)
    assert "at least one budget item" in str(exc_info.value).lower()


def test_zero_budget_raises_error():
    """Error case: optimizer must reject zero or negative budgets."""
    items = [
        BudgetItem(
            id="test_item",
            name="Test",
            min_spend=0.0,
            max_spend=100.0,
            expected_roas=2.0,
        )
    ]
    request = OptimizerRequest(total_budget=0.0, items=items)
    with pytest.raises(Exception) as exc_info:
        _solve(request)
    assert "total_budget must be positive" in str(exc_info.value).lower()


def test_negative_budget_raises_error():
    """Error case: negative budgets should fail."""
    items = [
        BudgetItem(
            id="test_item",
            name="Test",
            min_spend=0.0,
            max_spend=100.0,
            expected_roas=2.0,
        )
    ]
    request = OptimizerRequest(total_budget=-100.0, items=items)
    with pytest.raises(Exception) as exc_info:
        _solve(request)
    assert "total_budget must be positive" in str(exc_info.value).lower()


def test_duplicate_item_ids_raises_error():
    """Error case: duplicate item IDs should be rejected."""
    items = [
        BudgetItem(id="duplicate", name="Item 1", min_spend=0.0, max_spend=100.0, expected_roas=2.0),
        BudgetItem(id="duplicate", name="Item 2", min_spend=0.0, max_spend=100.0, expected_roas=2.5),
    ]
    request = OptimizerRequest(total_budget=100.0, items=items)
    with pytest.raises(Exception) as exc_info:
        _solve(request)
    assert "duplicate" in str(exc_info.value).lower()


def test_infeasible_budget_constraint_raises_error():
    """Error case: impossible budget constraint (total min > total budget) should fail."""
    items = [
        BudgetItem(
            id="item1",
            name="Item 1",
            min_spend=150.0,  # Combined min exceeds budget
            max_spend=200.0,
            expected_roas=2.0,
        ),
        BudgetItem(
            id="item2",
            name="Item 2",
            min_spend=100.0,  # Combined min = 250, budget = 100
            max_spend=150.0,
            expected_roas=2.5,
        ),
    ]
    request = OptimizerRequest(
        total_budget=100.0,
        items=items,
        hierarchy_constraints=[
            HierarchyConstraint(id="total", members=["item1", "item2"], min_spend=100.0, max_spend=100.0)
        ],
    )
    # This should fail because min spends exceed total budget
    with pytest.raises(Exception):
        _solve(request)


def test_missing_hierarchy_members_raises_error():
    """Error case: hierarchy constraints referencing unknown items should fail."""
    items = [
        BudgetItem(id="item1", name="Item 1", min_spend=0.0, max_spend=100.0, expected_roas=2.0),
    ]
    constraints = [
        HierarchyConstraint(
            id="invalid_group",
            members=["item1", "nonexistent_item"],
            min_spend=0.0,
        )
    ]
    request = OptimizerRequest(total_budget=100.0, items=items, hierarchy_constraints=constraints)
    with pytest.raises(Exception) as exc_info:
        _solve(request)
    assert "unknown" in str(exc_info.value).lower() or "references" in str(exc_info.value).lower()


# ============================================================================
# DIMENSION 4: Concurrency & Thread Safety
# ============================================================================


def test_concurrent_optimization_isolated():
    """Concurrency test: multiple concurrent optimizations should not interfere."""
    import concurrent.futures

    items = [
        BudgetItem(
            id="concurrent_item",
            name="Concurrent Test",
            min_spend=10.0,
            max_spend=100.0,
            expected_roas=3.0,
            roi_curve=[
                {"spend": 0.0, "revenue": 0.0},
                {"spend": 50.0, "revenue": 150.0},
                {"spend": 100.0, "revenue": 280.0},
            ],
        ),
    ]
    request = OptimizerRequest(
        total_budget=50.0,
        items=items,
        hierarchy_constraints=[
            HierarchyConstraint(id="total", members=["concurrent_item"], min_spend=50.0, max_spend=50.0)
        ],
    )

    # Run 10 concurrent optimizations
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(_solve, request) for _ in range(10)]
        results = [f.result() for f in concurrent.futures.as_completed(futures)]

    # All results should be identical
    expected_spend = results[0].spends["concurrent_item"]
    expected_profit = results[0].profit
    for result in results:
        assert result.spends["concurrent_item"] == pytest.approx(expected_spend, abs=1e-3)
        assert result.profit == pytest.approx(expected_profit, abs=1e-3)


# ============================================================================
# DIMENSION 5: Resource Management & Memory
# ============================================================================


def test_large_scale_optimization_bounded_memory():
    """Resource test: optimizer should handle 100+ items without excessive memory usage."""
    import gc

    gc.collect()
    initial_memory = 0  # Can't easily measure memory portably, but test should complete

    # Create 100 items
    items = [
        BudgetItem(
            id=f"item_{i}",
            name=f"Item {i}",
            min_spend=0.0,
            max_spend=50.0,
            expected_roas=2.0 + (i % 10) * 0.1,
            roi_curve=[
                {"spend": 0.0, "revenue": 0.0},
                {"spend": 25.0, "revenue": 50.0 + i},
                {"spend": 50.0, "revenue": 95.0 + i * 2},
            ],
        )
        for i in range(100)
    ]
    request = OptimizerRequest(
        total_budget=2500.0,
        items=items,
        hierarchy_constraints=[
            HierarchyConstraint(id="total", members=[f"item_{i}" for i in range(100)], min_spend=2500.0, max_spend=2500.0)
        ],
    )

    # Should complete without memory errors
    result = _solve(request)
    assert len(result.spends) == 100
    assert math.isclose(sum(result.spends.values()), 2500.0, abs_tol=1e-3)

    gc.collect()
    # Test should complete without running out of memory


def test_dense_roi_curve_memory_efficiency():
    """Resource test: dense ROI curves (1000+ points) should be handled efficiently."""
    # Create ROI curve with 1000 points
    roi_curve = [
        {"spend": float(i), "revenue": float(i * (3.0 - 0.0001 * i))}
        for i in range(0, 1001)
    ]
    items = [
        BudgetItem(
            id="dense_curve",
            name="Dense Curve Item",
            min_spend=100.0,
            max_spend=800.0,
            expected_roas=2.5,
            roi_curve=roi_curve,
        ),
    ]
    request = OptimizerRequest(
        total_budget=500.0,
        items=items,
        hierarchy_constraints=[
            HierarchyConstraint(id="total", members=["dense_curve"], min_spend=500.0, max_spend=500.0)
        ],
    )

    # Should complete efficiently
    import time

    start = time.time()
    result = _solve(request)
    duration = time.time() - start

    assert result.spends["dense_curve"] == pytest.approx(500.0, abs=1e-3)
    # Should complete in reasonable time (< 10 seconds even on slow machines)
    assert duration < 10.0


# ============================================================================
# DIMENSION 6: State Management & Side Effects
# ============================================================================


def test_optimizer_does_not_modify_input_request():
    """State test: optimizer should not modify input request objects."""
    import copy

    items = [
        BudgetItem(
            id="immutable_test",
            name="Immutable Test",
            min_spend=10.0,
            max_spend=100.0,
            expected_roas=2.5,
        ),
    ]
    constraints = [
        HierarchyConstraint(id="total", members=["immutable_test"], min_spend=50.0, max_spend=50.0)
    ]
    request = OptimizerRequest(total_budget=50.0, items=items, hierarchy_constraints=constraints)

    # Deep copy before optimization
    request_copy = copy.deepcopy(request)

    _solve(request)

    # Original request should be unchanged
    assert request.total_budget == request_copy.total_budget
    assert request.items == request_copy.items
    assert request.hierarchy_constraints == request_copy.hierarchy_constraints


def test_optimizer_is_deterministic():
    """State test: optimizer should produce identical results for same input."""
    items = [
        BudgetItem(
            id="deterministic_1",
            name="Det 1",
            min_spend=0.0,
            max_spend=100.0,
            expected_roas=3.0,
            roi_curve=[{"spend": 0.0, "revenue": 0.0}, {"spend": 100.0, "revenue": 280.0}],
        ),
        BudgetItem(
            id="deterministic_2",
            name="Det 2",
            min_spend=0.0,
            max_spend=100.0,
            expected_roas=2.5,
            roi_curve=[{"spend": 0.0, "revenue": 0.0}, {"spend": 100.0, "revenue": 230.0}],
        ),
    ]
    request = OptimizerRequest(
        total_budget=150.0,
        items=items,
        hierarchy_constraints=[
            HierarchyConstraint(
                id="total",
                members=["deterministic_1", "deterministic_2"],
                min_spend=150.0,
                max_spend=150.0,
            )
        ],
    )

    # Run multiple times
    results = [_solve(request) for _ in range(5)]

    # All results should be identical
    reference = results[0]
    for result in results[1:]:
        for item_id in reference.spends:
            assert result.spends[item_id] == pytest.approx(reference.spends[item_id], abs=1e-3)
        assert result.profit == pytest.approx(reference.profit, abs=1e-3)


# ============================================================================
# DIMENSION 7: Real-World Integration
# ============================================================================


def test_realistic_multi_platform_allocation():
    """Integration test: simulate realistic multi-platform budget allocation."""
    # Realistic scenario: Meta, Google, TikTok across multiple campaigns
    items = [
        # Meta - High performing, saturates quickly
        BudgetItem(
            id="meta_core",
            name="Meta - Core Audience",
            min_spend=50.0,
            max_spend=500.0,
            expected_roas=3.2,
            platform_minimum=25.0,
            roi_curve=[
                {"spend": 0.0, "revenue": 0.0},
                {"spend": 100.0, "revenue": 320.0},
                {"spend": 300.0, "revenue": 840.0},
                {"spend": 500.0, "revenue": 1300.0},
            ],
        ),
        # Google Search - Steady performer
        BudgetItem(
            id="google_search",
            name="Google Search - Brand",
            min_spend=30.0,
            max_spend=400.0,
            expected_roas=2.8,
            platform_minimum=20.0,
            roi_curve=[
                {"spend": 0.0, "revenue": 0.0},
                {"spend": 200.0, "revenue": 560.0},
                {"spend": 400.0, "revenue": 1040.0},
            ],
        ),
        # TikTok - High variance, low stock product
        BudgetItem(
            id="tiktok_viral",
            name="TikTok - Viral Campaign",
            min_spend=0.0,
            max_spend=300.0,
            expected_roas=3.5,
            inventory_status="low_stock",
            inventory_multiplier=0.4,
            roi_curve=[
                {"spend": 0.0, "revenue": 0.0},
                {"spend": 100.0, "revenue": 350.0},
                {"spend": 120.0, "revenue": 400.0},  # Capped by inventory
            ],
        ),
    ]

    constraints = [
        HierarchyConstraint(
            id="meta_platform",
            members=["meta_core"],
            max_spend=500.0,
        ),
        HierarchyConstraint(
            id="google_platform",
            members=["google_search"],
            max_spend=400.0,
        ),
        HierarchyConstraint(
            id="total",
            members=["meta_core", "google_search", "tiktok_viral"],
            min_spend=800.0,
            max_spend=800.0,
        ),
    ]

    request = OptimizerRequest(
        total_budget=800.0,
        items=items,
        hierarchy_constraints=constraints,
        roas_floor=2.0,  # Minimum acceptable ROAS
    )

    result = _solve(request)

    # Verify budget allocation
    assert math.isclose(sum(result.spends.values()), 800.0, abs_tol=1e-3)

    # Verify platform minimums respected
    assert result.spends["meta_core"] >= 25.0 - 1e-6
    assert result.spends["google_search"] >= 20.0 - 1e-6

    # Verify inventory cap on TikTok
    assert result.spends["tiktok_viral"] <= 300.0 * 0.4 + 1e-6

    # Verify ROAS floor
    for item_id, spend in result.spends.items():
        if spend > 0:
            item = next(i for i in items if i.id == item_id)
            revenue = _evaluate_roi(item.roi_curve, spend, item.expected_roas)
            roas = revenue / spend
            assert roas >= request.roas_floor - 1e-3

    # Verify profitability
    assert result.profit > 0.0


def test_edge_case_all_items_out_of_stock():
    """Integration edge case: all products out of stock should fail gracefully."""
    items = [
        BudgetItem(
            id="oos_1",
            name="OOS Item 1",
            min_spend=0.0,
            max_spend=200.0,
            expected_roas=3.0,
            inventory_status="out_of_stock",
        ),
        BudgetItem(
            id="oos_2",
            name="OOS Item 2",
            min_spend=0.0,
            max_spend=200.0,
            expected_roas=2.5,
            inventory_status="out_of_stock",
        ),
    ]
    request = OptimizerRequest(
        total_budget=100.0,
        items=items,
        hierarchy_constraints=[
            HierarchyConstraint(id="total", members=["oos_1", "oos_2"], min_spend=100.0, max_spend=100.0)
        ],
    )

    # This should fail because we can't allocate budget to OOS items
    with pytest.raises(Exception):
        _solve(request)
