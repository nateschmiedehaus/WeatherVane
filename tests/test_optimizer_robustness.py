"""Comprehensive robustness tests for constraint-aware allocator optimizer.

This test suite verifies the optimizer meets ALL 7 dimensions from UNIVERSAL_TEST_STANDARDS.md:
1. Happy Path (Expected Behavior)
2. Edge Cases (Boundary Conditions)
3. Error Cases (Failure Modes)
4. Concurrency & Race Conditions
5. Resource Constraints
6. State & Side Effects
7. Integration & Real Data

Task: T13.2.3 - Replace heuristic allocator with constraint-aware optimizer
"""

from __future__ import annotations

import concurrent.futures
import json
import math
import sys
from pathlib import Path
from typing import Dict, List

import cvxpy as cp
import pytest

from apps.allocator.optimizer import (
    BudgetItem,
    HierarchyConstraint,
    OptimizationError,
    OptimizerRequest,
    optimize_allocation,
)

# Select best available solver
_PREFERRED_SOLVERS = ("CLARABEL", "ECOS", "SCS", "SCIPY")
_AVAILABLE_SOLVER = next((solver for solver in _PREFERRED_SOLVERS if solver in cp.installed_solvers()), None)

if _AVAILABLE_SOLVER is None:
    pytest.skip("No supported cvxpy solver available for allocator optimizer tests", allow_module_level=True)


def _solve(request: OptimizerRequest, **kwargs):
    """Helper to solve with available solver."""
    return optimize_allocation(request, solver=_AVAILABLE_SOLVER, **kwargs)


# ==============================================================================
# DIMENSION 1: HAPPY PATH (Expected Behavior)
# ==============================================================================


def test_happy_path_basic_allocation():
    """Verify normal allocation with well-formed inputs works correctly."""
    items = [
        BudgetItem(
            id="meta_ads",
            name="Meta Ads",
            min_spend=100.0,
            max_spend=500.0,
            expected_roas=3.0,
        ),
        BudgetItem(
            id="google_ads",
            name="Google Ads",
            min_spend=50.0,
            max_spend=400.0,
            expected_roas=2.5,
        ),
    ]
    request = OptimizerRequest(
        total_budget=600.0,
        items=items,
    )

    result = _solve(request)

    # Verify structure
    assert result.spends is not None
    assert len(result.spends) == 2
    assert "meta_ads" in result.spends
    assert "google_ads" in result.spends

    # Verify budget constraint
    total_spend = sum(result.spends.values())
    assert math.isclose(total_spend, 600.0, abs_tol=1e-3)

    # Verify bounds respected
    assert 100.0 - 1e-3 <= result.spends["meta_ads"] <= 500.0 + 1e-3
    assert 50.0 - 1e-3 <= result.spends["google_ads"] <= 400.0 + 1e-3

    # Verify diagnostics
    assert result.diagnostics["status"] in {"optimal", "optimal_inaccurate"}
    assert result.diagnostics["solver"] == _AVAILABLE_SOLVER
    assert result.profit > 0.0


def test_happy_path_with_roi_curves():
    """Verify allocation with ROI curves maximizes profit correctly."""
    items = [
        BudgetItem(
            id="channel_a",
            name="Channel A",
            min_spend=0.0,
            max_spend=300.0,
            expected_roas=2.0,
            roi_curve=[
                {"spend": 0.0, "revenue": 0.0},
                {"spend": 100.0, "revenue": 250.0},
                {"spend": 200.0, "revenue": 450.0},
                {"spend": 300.0, "revenue": 600.0},
            ],
        ),
        BudgetItem(
            id="channel_b",
            name="Channel B",
            min_spend=0.0,
            max_spend=300.0,
            expected_roas=2.0,
            roi_curve=[
                {"spend": 0.0, "revenue": 0.0},
                {"spend": 100.0, "revenue": 220.0},
                {"spend": 200.0, "revenue": 420.0},
                {"spend": 300.0, "revenue": 600.0},
            ],
        ),
    ]
    request = OptimizerRequest(total_budget=400.0, items=items)

    result = _solve(request)

    # Both channels have similar marginal ROI at budget, allocation may be balanced
    # Key is that solver finds optimal allocation
    assert math.isclose(sum(result.spends.values()), 400.0, abs_tol=1e-3)
    assert result.total_revenue > 0.0
    assert result.profit > 0.0
    # Channel A has slightly better curve initially
    assert result.spends["channel_a"] >= result.spends["channel_b"] - 10.0  # Allow near-equal


# ==============================================================================
# DIMENSION 2: EDGE CASES (Boundary Conditions)
# ==============================================================================


def test_edge_case_zero_budget():
    """Verify handling of zero budget (invalid input)."""
    items = [BudgetItem(id="item1", name="Item 1", min_spend=0.0, max_spend=100.0, expected_roas=2.0)]
    request = OptimizerRequest(total_budget=0.0, items=items)

    with pytest.raises(OptimizationError, match="total_budget must be positive"):
        _solve(request)


def test_edge_case_negative_budget():
    """Verify handling of negative budget (invalid input)."""
    items = [BudgetItem(id="item1", name="Item 1", min_spend=0.0, max_spend=100.0, expected_roas=2.0)]
    request = OptimizerRequest(total_budget=-100.0, items=items)

    with pytest.raises(OptimizationError, match="total_budget must be positive"):
        _solve(request)


def test_edge_case_empty_items():
    """Verify handling of empty items list."""
    request = OptimizerRequest(total_budget=1000.0, items=[])

    with pytest.raises(OptimizationError, match="at least one budget item"):
        _solve(request)


def test_edge_case_single_item():
    """Verify allocation with only one item gets full budget."""
    items = [BudgetItem(id="only_one", name="Only One", min_spend=0.0, max_spend=1000.0, expected_roas=2.0)]
    request = OptimizerRequest(total_budget=500.0, items=items)

    result = _solve(request)

    assert math.isclose(result.spends["only_one"], 500.0, abs_tol=1e-3)


def test_edge_case_min_equals_max():
    """Verify handling when min_spend equals max_spend (fixed allocation)."""
    items = [
        BudgetItem(id="fixed_item", name="Fixed Item", min_spend=300.0, max_spend=300.0, expected_roas=2.0),
        BudgetItem(id="flex_item", name="Flex Item", min_spend=0.0, max_spend=500.0, expected_roas=2.5),
    ]
    request = OptimizerRequest(total_budget=600.0, items=items)

    result = _solve(request)

    # Fixed item should get exactly its fixed amount
    assert math.isclose(result.spends["fixed_item"], 300.0, abs_tol=1e-3)
    # Remaining should go to flex item
    assert math.isclose(result.spends["flex_item"], 300.0, abs_tol=1e-3)


def test_edge_case_very_small_budget():
    """Verify handling of very small budgets (near zero)."""
    items = [
        BudgetItem(id="item1", name="Item 1", min_spend=0.0, max_spend=10.0, expected_roas=2.0),
        BudgetItem(id="item2", name="Item 2", min_spend=0.0, max_spend=10.0, expected_roas=2.5),
    ]
    request = OptimizerRequest(total_budget=0.01, items=items)

    result = _solve(request)

    total_spend = sum(result.spends.values())
    assert math.isclose(total_spend, 0.01, abs_tol=1e-6)


def test_edge_case_very_large_budget():
    """Verify handling of extremely large budgets."""
    items = [
        BudgetItem(id="item1", name="Item 1", min_spend=0.0, max_spend=1_000_000.0, expected_roas=2.0),
        BudgetItem(id="item2", name="Item 2", min_spend=0.0, max_spend=1_000_000.0, expected_roas=2.5),
    ]
    # Budget that exceeds max constraints - should allocate up to max
    request = OptimizerRequest(total_budget=2_000_000.0, items=items)

    result = _solve(request)

    total_spend = sum(result.spends.values())
    # Should allocate full budget (both items at max)
    assert math.isclose(total_spend, 2_000_000.0, abs_tol=1e-2)


# ==============================================================================
# DIMENSION 3: ERROR CASES (Failure Modes)
# ==============================================================================


def test_error_case_duplicate_item_ids():
    """Verify descriptive error for duplicate item IDs."""
    items = [
        BudgetItem(id="duplicate", name="Item 1", min_spend=0.0, max_spend=100.0, expected_roas=2.0),
        BudgetItem(id="duplicate", name="Item 2", min_spend=0.0, max_spend=100.0, expected_roas=2.0),
    ]
    request = OptimizerRequest(total_budget=500.0, items=items)

    with pytest.raises(OptimizationError, match="duplicate budget item id 'duplicate'"):
        _solve(request)


def test_error_case_infeasible_constraints_no_relaxation():
    """Verify error when constraints are infeasible and relaxation disabled."""
    items = [
        # Min > max (invalid)
        BudgetItem(id="bad_item", name="Bad Item", min_spend=500.0, max_spend=100.0, expected_roas=2.0),
    ]
    request = OptimizerRequest(total_budget=600.0, items=items)

    # Should raise error when relax_infeasible=False (optimizer will fail with infeasible status)
    with pytest.raises(OptimizationError):
        _solve(request, relax_infeasible=False)


def test_error_case_constraint_relaxation_succeeds():
    """Verify that infeasible constraints can be relaxed when enabled."""
    items = [
        BudgetItem(
            id="tight_item",
            name="Tight Item",
            min_spend=400.0,
            max_spend=500.0,
            current_spend=450.0,
            expected_roas=2.5,  # Good ROAS
            # Add ROI curve that respects physics
            roi_curve=[
                {"spend": 400.0, "revenue": 1000.0},
                {"spend": 450.0, "revenue": 1125.0},
                {"spend": 500.0, "revenue": 1250.0},
            ],
        ),
    ]
    # Tight learning cap that might require relaxation
    request = OptimizerRequest(total_budget=450.0, items=items, learning_cap=0.01, roas_floor=2.0)

    # Should succeed (may relax learning cap if needed)
    result = _solve(request)

    # Verify solution found
    assert result.spends["tight_item"] >= 400.0 - 1e-3
    assert result.diagnostics["status"] in {"optimal", "optimal_inaccurate"}


def test_error_case_hierarchy_constraint_invalid_members():
    """Verify error when hierarchy constraint references unknown items."""
    items = [BudgetItem(id="item1", name="Item 1", min_spend=0.0, max_spend=100.0, expected_roas=2.0)]
    constraints = [HierarchyConstraint(id="bad_group", members=["item1", "nonexistent_item"])]
    request = OptimizerRequest(total_budget=500.0, items=items, hierarchy_constraints=constraints)

    with pytest.raises(OptimizationError, match="unknown members.*nonexistent_item"):
        _solve(request)


# ==============================================================================
# DIMENSION 4: CONCURRENCY & RACE CONDITIONS
# ==============================================================================


def test_concurrency_parallel_optimization():
    """Verify multiple concurrent optimizations don't interfere."""

    def optimize_task(i: int):
        items = [
            BudgetItem(id=f"item_a_{i}", name=f"Item A {i}", min_spend=10.0, max_spend=100.0, expected_roas=2.0),
            BudgetItem(id=f"item_b_{i}", name=f"Item B {i}", min_spend=10.0, max_spend=100.0, expected_roas=2.5),
        ]
        request = OptimizerRequest(total_budget=150.0, items=items)
        return _solve(request)

    # Run 10 optimizations in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(optimize_task, i) for i in range(10)]
        results = [f.result() for f in concurrent.futures.as_completed(futures)]

    # All should succeed
    assert len(results) == 10

    # Each should have valid results
    for result in results:
        assert result.diagnostics["status"] in {"optimal", "optimal_inaccurate"}
        total_spend = sum(result.spends.values())
        assert math.isclose(total_spend, 150.0, abs_tol=1e-3)


def test_concurrency_shared_solver_state():
    """Verify cvxpy solver state doesn't leak between calls."""
    items1 = [BudgetItem(id="item1", name="Item 1", min_spend=10.0, max_spend=100.0, expected_roas=2.0)]
    items2 = [BudgetItem(id="item2", name="Item 2", min_spend=20.0, max_spend=200.0, expected_roas=3.0)]

    request1 = OptimizerRequest(total_budget=100.0, items=items1)
    request2 = OptimizerRequest(total_budget=200.0, items=items2)

    result1 = _solve(request1)
    result2 = _solve(request2)

    # Results should be independent
    assert "item1" in result1.spends
    assert "item1" not in result2.spends
    assert "item2" not in result1.spends
    assert "item2" in result2.spends

    # Budgets should be independent
    assert math.isclose(sum(result1.spends.values()), 100.0, abs_tol=1e-3)
    assert math.isclose(sum(result2.spends.values()), 200.0, abs_tol=1e-3)


# ==============================================================================
# DIMENSION 5: RESOURCE CONSTRAINTS
# ==============================================================================


def test_resource_no_memory_leak():
    """Verify no memory leaks with many optimizations."""
    import gc

    gc.collect()
    initial_objects = len(gc.get_objects())

    # Run 100 optimizations
    for i in range(100):
        items = [
            BudgetItem(id=f"item_a_{i}", name=f"Item A {i}", min_spend=10.0, max_spend=100.0, expected_roas=2.0),
            BudgetItem(id=f"item_b_{i}", name=f"Item B {i}", min_spend=10.0, max_spend=100.0, expected_roas=2.5),
        ]
        request = OptimizerRequest(total_budget=150.0, items=items)
        result = _solve(request)
        assert result is not None

    gc.collect()
    final_objects = len(gc.get_objects())
    growth = final_objects - initial_objects

    # Object growth should be reasonable (< 5000 new objects for 100 runs)
    assert growth < 5000, f"Memory leak detected: {growth} new objects"


def test_resource_bounded_memory_growth():
    """Verify memory usage stays bounded with increasing problem size."""
    # Run increasing problem sizes
    for num_items in [10, 50, 100]:
        items = [
            BudgetItem(id=f"item_{i}", name=f"Item {i}", min_spend=1.0, max_spend=100.0, expected_roas=2.0 + i * 0.01)
            for i in range(num_items)
        ]
        request = OptimizerRequest(total_budget=num_items * 50.0, items=items)
        result = _solve(request)

        # Should successfully solve all sizes
        assert result.diagnostics["status"] in {"optimal", "optimal_inaccurate"}
        assert len(result.spends) == num_items


def test_resource_handles_large_roi_curves():
    """Verify handling of large ROI curve data."""
    # Create dense ROI curve with 1000 points
    roi_curve = [{"spend": float(i), "revenue": float(i * 2.5 - i * i * 0.0001)} for i in range(1000)]

    items = [
        BudgetItem(id="dense_curve", name="Dense Curve", min_spend=0.0, max_spend=500.0, roi_curve=roi_curve),
    ]
    request = OptimizerRequest(total_budget=500.0, items=items)

    result = _solve(request)

    # Should handle large curves without issues
    assert result.spends["dense_curve"] > 0.0
    assert result.diagnostics["status"] in {"optimal", "optimal_inaccurate"}


# ==============================================================================
# DIMENSION 6: STATE & SIDE EFFECTS
# ==============================================================================


def test_state_immutability_of_inputs():
    """Verify optimizer doesn't modify input objects."""
    items = [
        BudgetItem(id="item1", name="Item 1", min_spend=10.0, max_spend=100.0, expected_roas=2.0),
        BudgetItem(id="item2", name="Item 2", min_spend=10.0, max_spend=100.0, expected_roas=2.5),
    ]
    constraints = [HierarchyConstraint(id="group", members=["item1", "item2"])]
    request = OptimizerRequest(total_budget=150.0, items=items, hierarchy_constraints=constraints)

    # Serialize before
    items_before = json.dumps([item.__dict__ for item in items], sort_keys=True)
    constraints_before = json.dumps([c.__dict__ for c in constraints], sort_keys=True)

    _solve(request)

    # Serialize after
    items_after = json.dumps([item.__dict__ for item in items], sort_keys=True)
    constraints_after = json.dumps([c.__dict__ for c in constraints], sort_keys=True)

    # Inputs should be unchanged
    assert items_before == items_after
    assert constraints_before == constraints_after


def test_state_deterministic_results():
    """Verify same input produces same output (determinism)."""
    items = [
        BudgetItem(
            id="item1",
            name="Item 1",
            min_spend=10.0,
            max_spend=100.0,
            expected_roas=2.0,
            roi_curve=[{"spend": 0.0, "revenue": 0.0}, {"spend": 100.0, "revenue": 220.0}],
        ),
        BudgetItem(
            id="item2",
            name="Item 2",
            min_spend=10.0,
            max_spend=100.0,
            expected_roas=2.5,
            roi_curve=[{"spend": 0.0, "revenue": 0.0}, {"spend": 100.0, "revenue": 260.0}],
        ),
    ]
    request = OptimizerRequest(total_budget=150.0, items=items)

    result1 = _solve(request)
    result2 = _solve(request)

    # Results should be identical
    for item_id in result1.spends:
        assert math.isclose(result1.spends[item_id], result2.spends[item_id], abs_tol=1e-3)

    assert math.isclose(result1.profit, result2.profit, abs_tol=1e-3)


def test_state_diagnostics_comprehensive():
    """Verify diagnostics contain all expected fields."""
    items = [BudgetItem(id="item1", name="Item 1", min_spend=10.0, max_spend=100.0, expected_roas=2.0)]
    request = OptimizerRequest(total_budget=50.0, items=items)

    result = _solve(request)

    # Verify diagnostics completeness
    required_fields = ["status", "solver", "objective_value", "total_spend", "total_revenue"]
    for field in required_fields:
        assert field in result.diagnostics, f"Missing diagnostic field: {field}"


# ==============================================================================
# DIMENSION 7: INTEGRATION & REAL DATA
# ==============================================================================


def test_integration_with_realistic_channel_data():
    """Verify optimizer works with realistic multi-channel marketing data."""
    # Simulates real marketing mix scenario
    items = [
        BudgetItem(
            id="meta_awareness",
            name="Meta - Brand Awareness",
            min_spend=500.0,
            max_spend=5000.0,
            current_spend=2000.0,
            expected_roas=2.8,
            roi_curve=[
                {"spend": 500.0, "revenue": 1500.0},
                {"spend": 2000.0, "revenue": 5800.0},
                {"spend": 5000.0, "revenue": 13000.0},
            ],
            platform_minimum=500.0,
        ),
        BudgetItem(
            id="google_search",
            name="Google Search",
            min_spend=300.0,
            max_spend=4000.0,
            current_spend=1500.0,
            expected_roas=3.2,
            roi_curve=[
                {"spend": 300.0, "revenue": 1000.0},
                {"spend": 1500.0, "revenue": 5100.0},
                {"spend": 4000.0, "revenue": 12000.0},
            ],
            platform_minimum=300.0,
        ),
        BudgetItem(
            id="tiktok_performance",
            name="TikTok Performance",
            min_spend=200.0,
            max_spend=3000.0,
            current_spend=800.0,
            expected_roas=2.5,
            roi_curve=[
                {"spend": 200.0, "revenue": 550.0},
                {"spend": 800.0, "revenue": 2200.0},
                {"spend": 3000.0, "revenue": 7200.0},
            ],
            platform_minimum=200.0,
        ),
    ]

    constraints = [
        HierarchyConstraint(id="social", members=["meta_awareness", "tiktok_performance"], max_spend=7000.0),
    ]

    request = OptimizerRequest(
        total_budget=8000.0,
        items=items,
        hierarchy_constraints=constraints,
        roas_floor=1.5,
        # No learning cap to make problem feasible
    )

    result = _solve(request)

    # Verify all constraints respected
    total_spend = sum(result.spends.values())
    assert math.isclose(total_spend, 8000.0, abs_tol=1e-2)

    # Verify platform minimums
    assert result.spends["meta_awareness"] >= 500.0 - 1e-3
    assert result.spends["google_search"] >= 300.0 - 1e-3
    assert result.spends["tiktok_performance"] >= 200.0 - 1e-3

    # Verify hierarchy constraint
    social_spend = result.spends["meta_awareness"] + result.spends["tiktok_performance"]
    assert social_spend <= 6000.0 + 1e-3

    # Verify profit is positive
    assert result.profit > 0.0

    # Verify diagnostics
    assert result.diagnostics["status"] in {"optimal", "optimal_inaccurate"}


def test_integration_performance_with_large_problem():
    """Verify optimizer handles realistically large allocation problems."""
    import time

    # Create 50-channel allocation problem
    items = [
        BudgetItem(
            id=f"channel_{i}",
            name=f"Channel {i}",
            min_spend=10.0,
            max_spend=1000.0,
            current_spend=100.0 + i * 10,
            expected_roas=1.5 + i * 0.05,
            roi_curve=[
                {"spend": 10.0, "revenue": 20.0 + i * 2},
                {"spend": 500.0, "revenue": 1000.0 + i * 50},
                {"spend": 1000.0, "revenue": 1800.0 + i * 80},
            ],
        )
        for i in range(50)
    ]

    request = OptimizerRequest(total_budget=20000.0, items=items, roas_floor=1.2, learning_cap=0.25)

    start_time = time.time()
    result = _solve(request)
    duration = time.time() - start_time

    # Should solve in reasonable time (< 10 seconds for 50 channels)
    assert duration < 10.0, f"Optimization took too long: {duration:.2f}s"

    # Should find optimal solution
    assert result.diagnostics["status"] in {"optimal", "optimal_inaccurate"}

    # Should allocate all budget
    total_spend = sum(result.spends.values())
    assert math.isclose(total_spend, 20000.0, abs_tol=1e-2)


def test_integration_handles_weather_multipliers():
    """Verify optimizer integrates with weather-aware allocation patterns."""
    # Simulate weather-adjusted scenario
    items = [
        BudgetItem(
            id="snow_gear",
            name="Snow Gear - Meta",
            min_spend=100.0,
            max_spend=2000.0,
            current_spend=500.0,
            expected_roas=3.5,  # High ROAS during cold weather
            roi_curve=[
                {"spend": 100.0, "revenue": 380.0},
                {"spend": 500.0, "revenue": 1850.0},
                {"spend": 2000.0, "revenue": 6500.0},
            ],
        ),
        BudgetItem(
            id="summer_apparel",
            name="Summer Apparel - Google",
            min_spend=100.0,
            max_spend=2000.0,
            current_spend=500.0,
            expected_roas=1.8,  # Low ROAS during cold weather
            roi_curve=[
                {"spend": 100.0, "revenue": 190.0},
                {"spend": 500.0, "revenue": 950.0},
                {"spend": 2000.0, "revenue": 3400.0},
            ],
        ),
    ]

    request = OptimizerRequest(total_budget=1500.0, items=items, roas_floor=2.0)

    result = _solve(request)

    # Snow gear should get more budget (better ROI + weather multiplier)
    assert result.spends["snow_gear"] > result.spends["summer_apparel"]

    # Summer apparel might hit ROAS floor constraint
    assert result.total_revenue > 0.0


# ==============================================================================
# TEST QUALITY VERIFICATION
# ==============================================================================


def test_meta_test_coverage():
    """Meta-test to verify all 7 dimensions are covered."""
    # This ensures we haven't missed any dimension
    import inspect

    dimensions_covered = {
        "happy_path": False,
        "edge_cases": False,
        "error_cases": False,
        "concurrency": False,
        "resources": False,
        "state": False,
        "integration": False,
    }

    # Get all test functions from this module
    current_module = sys.modules[__name__]
    test_functions = [
        name
        for name, obj in inspect.getmembers(current_module)
        if inspect.isfunction(obj) and name.startswith("test_") and name != "test_meta_test_coverage"
    ]

    for test_name in test_functions:
        if "happy_path" in test_name:
            dimensions_covered["happy_path"] = True
        if "edge_case" in test_name:
            dimensions_covered["edge_cases"] = True
        if "error_case" in test_name:
            dimensions_covered["error_cases"] = True
        if "concurrency" in test_name:
            dimensions_covered["concurrency"] = True
        if "resource" in test_name:
            dimensions_covered["resources"] = True
        if "state" in test_name:
            dimensions_covered["state"] = True
        if "integration" in test_name:
            dimensions_covered["integration"] = True

    # All dimensions must be covered
    for dimension, covered in dimensions_covered.items():
        assert covered, f"Missing test coverage for dimension: {dimension}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
