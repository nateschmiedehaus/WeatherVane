"""Heuristic allocator for WeatherVane."""
from __future__ import annotations

from bisect import bisect_left
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Mapping, Sequence, Tuple

import math
import os
import random

CACHE_PRECISION = 4

_SCIPY_ENABLED = os.environ.get("WEATHERVANE_ENABLE_SCIPY", "").lower() in {"1", "true", "yes"}

if _SCIPY_ENABLED:
    import numpy as np  # type: ignore  # pragma: no cover
    try:  # pragma: no cover - optional heavy dependency
        from scipy.optimize import (
            Bounds,
            LinearConstraint,
            NonlinearConstraint,
            SR1,
            differential_evolution,
            minimize,
        )
    except Exception:  # pragma: no cover - environment without SciPy
        differential_evolution = None
        LinearConstraint = None
        NonlinearConstraint = None
        Bounds = None
        minimize = None
        SR1 = None
else:  # pragma: no cover - explicit disable
    differential_evolution = None
    LinearConstraint = None
    NonlinearConstraint = None
    Bounds = None
    minimize = None
    SR1 = None
    np = None  # type: ignore


@dataclass
class Guardrails:
    min_spend: float
    max_spend: float
    roas_floor: float = 0.0
    learning_cap: float = 0.2
    inventory_available: float | None = None
    cpm_alpha: float = 0.0
    avg_order_value: float = 1.0
    min_spend_by_cell: Dict[str, float] = field(default_factory=dict)
    max_spend_by_cell: Dict[str, float] = field(default_factory=dict)


@dataclass
class AllocationInput:
    cells: List[str]
    total_budget: float
    current_spend: Dict[str, float]
    expected_roas: Dict[str, float]
    roi_curves: Dict[str, List[Dict[str, float]]] = field(default_factory=dict)
    precomputed_roi_lookup: Dict[str, Tuple[Tuple[float, ...], Tuple[float, ...]]] | None = None
    guardrails: Guardrails = field(default_factory=lambda: Guardrails(min_spend=0.0, max_spend=0.0))
    context_tags: List[str] = field(default_factory=list)
    quantile_factors: Dict[str, float] = field(default_factory=dict)
    risk_aversion: float = 0.3


@dataclass
class AllocationResult:
    spends: Dict[str, float]
    profit: float
    diagnostics: Dict[str, Any]


def compute_bounds(
    cells: Sequence[str],
    guardrails: Guardrails,
    total_budget: float,
) -> tuple[Dict[str, float], Dict[str, float], bool]:
    """Resolve per-cell min/max bounds, softening mins if they exceed the budget."""
    min_bounds: Dict[str, float] = {}
    max_bounds: Dict[str, float] = {}

    for cell in cells:
        base_min = float(max(guardrails.min_spend_by_cell.get(cell, guardrails.min_spend), 0.0))
        base_max = float(guardrails.max_spend_by_cell.get(cell, guardrails.max_spend))
        if base_max < base_min:
            base_max = base_min
        min_bounds[cell] = base_min
        max_bounds[cell] = max(base_max, base_min)

    total_min = sum(min_bounds.values())
    softened = False

    if total_budget <= 0.0:
        softened = total_min > 0.0
        for cell in cells:
            min_bounds[cell] = 0.0
            if max_bounds[cell] < 0.0:
                max_bounds[cell] = 0.0
        return min_bounds, max_bounds, softened

    if total_min > total_budget + 1e-9 and total_min > 0.0:
        softened = True
        scale = total_budget / total_min
        for cell in cells:
            scaled_min = min_bounds[cell] * scale
            min_bounds[cell] = scaled_min
            if scaled_min > max_bounds[cell]:
                max_bounds[cell] = scaled_min

    return min_bounds, max_bounds, softened


def _apply_roas_floor_limits(
    *,
    cells: Sequence[str],
    min_bounds: Dict[str, float],
    max_bounds: Dict[str, float],
    roas_floor: float,
    roas_for: Callable[[str, float], float],
) -> tuple[Dict[str, float], Dict[str, float]]:
    """Tighten max bounds so any feasible spend respects the ROAS floor."""
    adjusted = {cell: float(max_bounds[cell]) for cell in cells}
    roas_caps: Dict[str, float] = {}

    if roas_floor <= 0.0:
        return adjusted, roas_caps

    tol = 1e-4

    for cell in cells:
        upper = adjusted[cell]
        lower = float(min_bounds.get(cell, 0.0))
        if upper <= lower + tol:
            continue

        roas_at_upper = roas_for(cell, upper)
        if roas_at_upper >= roas_floor - tol:
            continue

        # If even the minimum spend fails the ROAS floor, clamp to the minimum.
        benchmark_spend = max(lower, 1e-6)
        if roas_for(cell, benchmark_spend) < roas_floor - tol:
            adjusted[cell] = lower
            roas_caps[cell] = lower
            continue

        lo = lower
        hi = upper
        feasible = lower

        for _ in range(80):
            mid = 0.5 * (lo + hi)
            if mid <= lo + 1e-6:
                break
            roas_mid = roas_for(cell, max(mid, 1e-6))
            if roas_mid >= roas_floor - tol:
                feasible = mid
                lo = mid
            else:
                hi = mid
            if hi - lo <= max(1e-3, 1e-3 * hi):
                break

        adjusted[cell] = max(lower, min(feasible, upper))
        roas_caps[cell] = adjusted[cell]

    return adjusted, roas_caps


def _prepare_roi_lookup(
    roi_curves: Mapping[str, Sequence[Mapping[str, float]]],
) -> Dict[str, Tuple[Tuple[float, ...], Tuple[float, ...]]]:
    """Deduplicate and pre-compute ROI curves for efficient interpolation."""
    lookup: Dict[str, Tuple[Tuple[float, ...], Tuple[float, ...]]] = {}
    for cell, points in roi_curves.items():
        spend_to_revenue: Dict[float, float] = {}
        for entry in points:
            spend = float(entry.get("spend", 0.0) or 0.0)
            if spend < 0:
                continue
            revenue_value = entry.get("revenue")
            if revenue_value is None and entry.get("roas") is not None:
                revenue_value = float(entry["roas"]) * spend
            revenue = float(revenue_value or 0.0)
            current = spend_to_revenue.get(spend)
            if current is None or revenue > current:
                spend_to_revenue[spend] = revenue

        if not spend_to_revenue:
            continue
        if 0.0 not in spend_to_revenue:
            spend_to_revenue[0.0] = 0.0

        ordered = sorted(spend_to_revenue.items(), key=lambda pair: pair[0])
        spends = tuple(spend for spend, _ in ordered)
        revenues = tuple(revenue for _, revenue in ordered)
        lookup[cell] = (spends, revenues)

    return lookup


def _interpolate_revenue(spends: Sequence[float], revenues: Sequence[float], spend: float) -> float:
    if not spends:
        return 0.0

    idx = bisect_left(spends, spend)
    first_spend = spends[0]
    first_rev = revenues[0]
    if idx == 0:
        if first_spend <= 0:
            return first_rev
        return (first_rev / first_spend) * spend

    if idx < len(spends) and abs(spend - spends[idx]) <= 1e-9:
        return revenues[idx]

    prev_spend = spends[idx - 1]
    prev_rev = revenues[idx - 1]

    if idx >= len(spends):
        last_spend = spends[-1]
        last_rev = revenues[-1]
        if len(spends) == 1:
            return last_rev
        prev_tail_spend = spends[-2]
        prev_tail_rev = revenues[-2]
        slope = (last_rev - prev_tail_rev) / (last_spend - prev_tail_spend) if last_spend != prev_tail_spend else (last_rev / last_spend if last_spend else 0.0)
        return last_rev + slope * (spend - last_spend)

    curr_spend = spends[idx]
    curr_rev = revenues[idx]
    span = curr_spend - prev_spend
    if span <= 1e-9:
        return curr_rev
    weight = (spend - prev_spend) / span
    return prev_rev + weight * (curr_rev - prev_rev)


def allocate(input_data: AllocationInput, seed: int = 42) -> AllocationResult:
    cells = input_data.cells
    guardrails = input_data.guardrails

    min_bounds, max_bounds, min_softened = compute_bounds(cells, guardrails, input_data.total_budget)

    if input_data.precomputed_roi_lookup is not None:
        curve_lookup = dict(input_data.precomputed_roi_lookup)
        if input_data.roi_curves:
            missing_curves = {
                cell: input_data.roi_curves[cell]
                for cell in input_data.roi_curves
                if cell not in curve_lookup
            }
            if missing_curves:
                curve_lookup.update(_prepare_roi_lookup(missing_curves))
    else:
        curve_lookup = _prepare_roi_lookup(input_data.roi_curves)

    # Cache ROI lookups per cell so repeated solver evaluations avoid redundant interpolation.
    revenue_cache: Dict[str, Dict[float, float]] = {cell: {} for cell in cells}
    cache_stats = {"hits": 0, "misses": 0}
    evaluation_cache: Dict[
        Tuple[float, ...],
        Tuple[float, Tuple[Tuple[str, float], ...], Tuple[Tuple[str, float], ...]],
    ] = {}
    evaluation_cache_stats = {"hits": 0, "misses": 0}

    cell_index = {cell: idx for idx, cell in enumerate(cells)}
    revenue_cache_by_index = [revenue_cache[cell] for cell in cells]
    curve_lookup_by_index: List[Tuple[Tuple[float, ...], Tuple[float, ...]] | None] = [
        curve_lookup.get(cell) for cell in cells
    ]
    expected_roas_by_index = [input_data.expected_roas.get(cell, 1.0) for cell in cells]

    cache_hits = 0
    cache_misses = 0
    evaluation_hits = 0
    evaluation_misses = 0

    def _rehydrate_snapshot(snapshot: Tuple[Tuple[str, float], ...]) -> Dict[str, float]:
        return {label: float(value) for label, value in snapshot}

    def _normalise_spend(spend: float) -> float:
        if spend <= 0.0:
            return 0.0
        return round(spend, CACHE_PRECISION)

    def revenue_for_index(idx: int, spend: float) -> float:
        nonlocal cache_hits, cache_misses
        normalised = _normalise_spend(spend)
        cell_cache = revenue_cache_by_index[idx]
        cached = cell_cache.get(normalised)
        if cached is not None:
            cache_hits += 1
            cache_stats["hits"] = cache_hits
            return cached

        if spend <= 0.0:
            revenue = 0.0
        else:
            curve = curve_lookup_by_index[idx]
            if not curve:
                revenue = expected_roas_by_index[idx] * spend
            else:
                spends, revenues = curve
                revenue = _interpolate_revenue(spends, revenues, spend)

        cache_misses += 1
        cache_stats["misses"] = cache_misses
        cell_cache[normalised] = revenue
        return revenue

    def revenue_for(cell: str, spend: float) -> float:
        idx = cell_index.get(cell)
        if idx is None:
            return 0.0
        return revenue_for_index(idx, spend)

    learning_cap_limit = max(guardrails.learning_cap, 0.0)
    roas_floor_value = guardrails.roas_floor
    inventory_limit = guardrails.inventory_available
    avg_order_value = guardrails.avg_order_value

    base_spend_lookup: Dict[str, float] = {}
    base_spend_inverse: Dict[str, float] = {}
    for cell in cells:
        baseline = max(
            input_data.current_spend.get(cell, min_bounds[cell]),
            min_bounds[cell],
            1e-6,
        )
        base_spend_lookup[cell] = baseline
        base_spend_inverse[cell] = 1.0 / baseline if baseline > 0 else 0.0

    base_spend_array = [base_spend_lookup[cell] for cell in cells]
    base_inverse_array = [base_spend_inverse[cell] for cell in cells]

    quantile_factors = dict(input_data.quantile_factors) if input_data.quantile_factors else {}
    if quantile_factors:
        base_factor = float(quantile_factors.get("p50", 1.0) or 1.0)
        scenario_defs: tuple[tuple[str, float, float], ...] = (
            ("p10", float(max(quantile_factors.get("p10", base_factor), 0.0)), 0.2),
            ("p50", float(base_factor), 0.6),
            ("p90", float(max(quantile_factors.get("p90", base_factor), 0.0)), 0.2),
        )
    else:
        scenario_defs = (("p50", 1.0, 1.0),)

    scenario_weight_sum = sum(weight for _, _, weight in scenario_defs)
    if scenario_weight_sum <= 0.0:
        scenario_weight_sum = 1.0

    scenario_labels = tuple(label for label, _, _ in scenario_defs)
    scenario_factors = tuple(factor for _, factor, _ in scenario_defs)
    scenario_weights = tuple(weight for _, _, weight in scenario_defs)

    def roas_for(cell: str, spend: float) -> float:
        if spend <= 0.0:
            return 0.0
        revenue = revenue_for(cell, spend)
        return revenue / spend if spend > 0.0 else 0.0

    max_bounds, roas_caps = _apply_roas_floor_limits(
        cells=cells,
        min_bounds=min_bounds,
        max_bounds=max_bounds,
        roas_floor=guardrails.roas_floor,
        roas_for=roas_for,
    )
    bounds = [(min_bounds[cell], max_bounds[cell]) for cell in cells]

    roas_penalty_scale = 1e5
    learning_penalty_scale = 1e4
    inventory_penalty_scale = 1e6
    inventory_tracking = inventory_limit is not None and avg_order_value > 0.0
    inventory_scale = (1.0 / avg_order_value) if inventory_tracking else 0.0

    def evaluate(x: Sequence[float]) -> tuple[float, Dict[str, float], Dict[str, float]]:
        nonlocal evaluation_hits, evaluation_misses
        normalized_vector = tuple(round(float(value), CACHE_PRECISION) for value in x)
        cached = evaluation_cache.get(normalized_vector)
        if cached is not None:
            evaluation_hits += 1
            evaluation_cache_stats["hits"] = evaluation_hits
            cached_profit, cached_scenarios, cached_penalties = cached
            return (
                float(cached_profit),
                _rehydrate_snapshot(cached_scenarios),
                _rehydrate_snapshot(cached_penalties),
            )

        evaluation_misses += 1
        evaluation_cache_stats["misses"] = evaluation_misses
        total_spend = float(sum(x))
        cpm_penalty = guardrails.cpm_alpha * total_spend
        roas_pen = 0.0
        learning_pen = 0.0
        total_revenue = 0.0
        conversion_estimate = 0.0

        for idx, raw_spend in enumerate(x):
            spend = float(raw_spend)
            revenue = revenue_for_index(idx, spend)
            total_revenue += revenue

            if spend > 0.0:
                roas = revenue / spend
                if roas < roas_floor_value:
                    roas_pen += roas_penalty_scale * (roas_floor_value - roas)
            if base_inverse_array[idx] > 0.0:
                delta = abs(spend - base_spend_array[idx]) * base_inverse_array[idx]
                if delta > learning_cap_limit:
                    learning_pen += learning_penalty_scale * (delta - learning_cap_limit)
            if inventory_tracking:
                conversion_estimate += revenue * inventory_scale

        inventory_pen = 0.0
        if inventory_tracking and inventory_limit is not None and conversion_estimate > inventory_limit:
            inventory_pen = inventory_penalty_scale * (conversion_estimate - inventory_limit)

        scenario_profit_items: List[Tuple[str, float]] = []
        weighted_profit_accum = 0.0
        for s_idx, label in enumerate(scenario_labels):
            scenario_revenue = total_revenue * scenario_factors[s_idx]
            scenario_profit = scenario_revenue - total_spend - cpm_penalty
            scenario_profit_items.append((label, scenario_profit))
            weighted_profit_accum += scenario_weights[s_idx] * scenario_profit

        if scenario_profit_items:
            weighted_profit = weighted_profit_accum / scenario_weight_sum
            worst_profit = min(value for _, value in scenario_profit_items)
        else:
            weighted_profit = total_revenue - total_spend - cpm_penalty
            worst_profit = weighted_profit

        risk_penalty = input_data.risk_aversion * max(weighted_profit - worst_profit, 0.0)
        adjusted_profit = weighted_profit - roas_pen - learning_pen - inventory_pen - risk_penalty

        scenario_snapshot = tuple((label, float(value)) for label, value in scenario_profit_items)
        penalty_snapshot = (
            ("risk_penalty", float(risk_penalty)),
            ("roas_penalty", float(roas_pen)),
            ("learning_penalty", float(learning_pen)),
            ("inventory_penalty", float(inventory_pen)),
            ("inventory_conversions", float(conversion_estimate)),
            ("expected_profit_raw", float(weighted_profit)),
            ("worst_case_profit", float(worst_profit)),
        )
        evaluation_cache[normalized_vector] = (float(adjusted_profit), scenario_snapshot, penalty_snapshot)
        return float(adjusted_profit), dict(scenario_snapshot), dict(penalty_snapshot)

    def objective(x: Sequence[float]) -> float:
        adjusted_profit, _, _ = evaluate(x)
        return -float(adjusted_profit)

    def _solve_with_coordinate() -> AllocationResult:
        return _coordinate_allocate(
            input_data=input_data,
            evaluate_fn=evaluate,
            roas_for=roas_for,
            seed=seed,
            min_bounds=min_bounds,
            max_bounds=max_bounds,
            min_softened=min_softened,
            roas_caps=roas_caps,
            evaluation_stats=evaluation_cache_stats,
        )

    def _solve_with_trust_constr() -> AllocationResult | None:
        if (
            minimize is None
            or Bounds is None
            or LinearConstraint is None
            or NonlinearConstraint is None
            or np is None
        ):
            return None
        if not cells:
            return AllocationResult(
                spends={}, profit=0.0, diagnostics={"success": 1.0, "optimizer": "trust_constr"}
            )

        lower_array = np.array([min_bounds[cell] for cell in cells], dtype=float)
        upper_array = np.array([max_bounds[cell] for cell in cells], dtype=float)

        initial_vector = []
        for idx, cell in enumerate(cells):
            lower = lower_array[idx]
            upper = upper_array[idx]
            base = input_data.current_spend.get(cell, lower)
            initial_vector.append(max(lower, min(upper, base)))

        projected_initial, projection_info = _project_to_feasible(
            initial_vector, lower_array.tolist(), upper_array.tolist(), input_data.total_budget
        )
        x0 = np.array(projected_initial, dtype=float)

        linear_constraint = LinearConstraint(
            np.ones(len(cells)),
            input_data.total_budget,
            input_data.total_budget,
        )
        constraints: List[Any] = [linear_constraint]

        if guardrails.roas_floor > 0.0:
            def _roas_constraint(values: np.ndarray) -> np.ndarray:
                outputs = []
                for idx, cell in enumerate(cells):
                    spend = float(max(values[idx], 0.0))
                    if spend <= 1e-6:
                        outputs.append(0.0)
                        continue
                    revenue = revenue_for(cell, spend)
                    outputs.append(guardrails.roas_floor * spend - revenue)
                return np.array(outputs, dtype=float)

            constraints.append(
                NonlinearConstraint(
                    fun=_roas_constraint,
                    lb=-np.inf,
                    ub=0.0,
                    jac="2-point",
                )
            )

        try:
            result = minimize(
                objective,
                x0,
                method="trust-constr",
                bounds=Bounds(lower_array, upper_array),
                constraints=constraints,
                options={"maxiter": 600, "gtol": 1e-6, "xtol": 1e-6},
                jac="2-point",
                hess=SR1() if SR1 is not None else None,
            )
        except Exception:
            return None

        if not getattr(result, "success", False):
            return None

        candidate = result.x.tolist()
        projected_candidate, _ = _project_to_feasible(
            candidate,
            lower_array.tolist(),
            upper_array.tolist(),
            input_data.total_budget,
        )

        spends = {cell: float(projected_candidate[idx]) for idx, cell in enumerate(cells)}

        if guardrails.roas_floor > 0.0:
            for cell in cells:
                spend = spends[cell]
                if spend <= 1e-6:
                    continue
                if roas_for(cell, spend) < guardrails.roas_floor - 1e-3:
                    return None

        constr_violation = getattr(result, "constr_violation", None)
        if np is not None and isinstance(constr_violation, np.ndarray):
            max_violation = float(np.max(np.abs(constr_violation)))
        else:
            max_violation = float(constr_violation or 0.0)

        base_diag = {
            "success": 1.0,
            "nfev": float(getattr(result, "nfev", 0.0) or 0.0),
            "evaluations": float(getattr(result, "nfev", 0.0) or 0.0),
            "njev": float(getattr(result, "njev", 0.0) or 0.0),
            "nit": float(getattr(result, "nit", 0.0) or 0.0),
            "optimizer": "trust_constr",
            "max_constraint_violation": max_violation,
            "projection_target": float(projection_info["target_sum"]),
            "projection_residual_lower": float(projection_info["residual_lower"]),
            "projection_residual_upper": float(projection_info["residual_upper"]),
            "min_softened": 1.0 if min_softened else 0.0,
        }

        return _build_allocation_result(
            cells=cells,
            spends=spends,
            guardrails=guardrails,
            evaluate_fn=evaluate,
            roas_for=roas_for,
            input_data=input_data,
            base_diagnostics=base_diag,
            min_bounds=min_bounds,
            max_bounds=max_bounds,
            roas_caps=roas_caps,
        )

    def _solve_with_projected_gradient() -> AllocationResult | None:
        if not cells:
            return AllocationResult(
                spends={}, profit=0.0, diagnostics={"success": 1.0, "optimizer": "projected_gradient"}
            )

        lower_bounds = [float(min_bounds[cell]) for cell in cells]
        upper_bounds = [float(max_bounds[cell]) for cell in cells]

        seed_vector: List[float] = []
        for idx, cell in enumerate(cells):
            lower = lower_bounds[idx]
            upper = upper_bounds[idx]
            base = input_data.current_spend.get(cell, lower)
            seed_vector.append(max(lower, min(upper, base)))

        best_vector, projection_info = _project_to_feasible(
            seed_vector, lower_bounds, upper_bounds, input_data.total_budget
        )
        target_sum = float(projection_info["target_sum"])
        if target_sum <= 1e-9:
            return None

        evaluations = 0

        def _evaluate(vector: Sequence[float]) -> tuple[float, Dict[str, float], Dict[str, float]]:
            nonlocal evaluations
            vector_tuple = tuple(float(value) for value in vector)
            miss_before = evaluation_cache_stats["misses"]
            result = evaluate(vector_tuple)
            if evaluation_cache_stats["misses"] > miss_before:
                evaluations += 1
            return result

        best_profit, _, _ = _evaluate(best_vector)

        max_span = max((ub - lb) for lb, ub in zip(lower_bounds, upper_bounds)) if cells else 0.0
        step_scale = max(target_sum, max_span * max(len(cells), 1), 1.0)
        epsilons = [
            max(1e-3, 0.05 * max(upper_bounds[idx] - lower_bounds[idx], target_sum / max(len(cells), 1)))
            for idx in range(len(cells))
        ]

        improvements = 0
        iteration = 0
        stagnation_rounds = 0
        stagnation_limit = 4

        while iteration < 200 and step_scale > 1e-4:
            iteration += 1
            gradient = [0.0 for _ in cells]
            grad_norm_sq = 0.0

            for idx in range(len(cells)):
                epsilon = epsilons[idx]
                forward = list(best_vector)
                forward[idx] = min(upper_bounds[idx], best_vector[idx] + epsilon)
                forward, _ = _project_to_feasible(forward, lower_bounds, upper_bounds, target_sum)
                forward_profit, _, _ = _evaluate(forward)

                backward = list(best_vector)
                backward[idx] = max(lower_bounds[idx], best_vector[idx] - epsilon)
                backward, _ = _project_to_feasible(backward, lower_bounds, upper_bounds, target_sum)
                backward_profit, _, _ = _evaluate(backward)

                denom = max(forward[idx] - backward[idx], 1e-3)
                slope = (forward_profit - backward_profit) / denom
                gradient[idx] = slope
                grad_norm_sq += slope * slope

            grad_norm = math.sqrt(grad_norm_sq)
            if grad_norm <= 1e-6:
                break

            direction = [value / grad_norm for value in gradient]
            improved = False

            for scale in (1.0, 0.5, 0.25, 0.1, 0.05):
                candidate = [
                    best_vector[idx] + scale * step_scale * direction[idx] for idx in range(len(cells))
                ]
                candidate, _ = _project_to_feasible(candidate, lower_bounds, upper_bounds, target_sum)
                for idx, cell in enumerate(cells):
                    cap = roas_caps.get(cell)
                    if cap is not None:
                        candidate[idx] = min(candidate[idx], cap)
                candidate, _ = _project_to_feasible(candidate, lower_bounds, upper_bounds, target_sum)
                candidate_profit, _, _ = _evaluate(candidate)

                if candidate_profit > best_profit + 1e-5:
                    best_vector = candidate
                    best_profit = candidate_profit
                    improvements += 1
                    improved = True
                    break

            if not improved:
                step_scale *= 0.6
                stagnation_rounds += 1
                if stagnation_rounds >= stagnation_limit:
                    break
            else:
                step_scale *= 0.95
                stagnation_rounds = 0

        final_vector, final_projection = _project_to_feasible(best_vector, lower_bounds, upper_bounds, target_sum)

        base_diag = {
            "success": 1.0 if improvements > 0 else 0.5,
            "nfev": float(evaluations),
            "evaluations": float(evaluations),
            "optimizer": "projected_gradient",
            "iterations": float(iteration),
            "improvements": float(improvements),
            "projection_target": float(final_projection["target_sum"]),
            "projection_residual_lower": float(final_projection["residual_lower"]),
            "projection_residual_upper": float(final_projection["residual_upper"]),
            "min_softened": 1.0 if min_softened else 0.0,
        }

        return _build_allocation_result(
            cells=cells,
            spends={cell: float(final_vector[idx]) for idx, cell in enumerate(cells)},
            guardrails=guardrails,
            evaluate_fn=_evaluate,
            roas_for=roas_for,
            input_data=input_data,
            base_diagnostics=base_diag,
            min_bounds=min_bounds,
            max_bounds=max_bounds,
            roas_caps=roas_caps,
        )

    def _solve_with_differential() -> AllocationResult | None:
        if (
            differential_evolution is None
            or LinearConstraint is None
            or np is None
            or not cells
        ):
            return None
        try:
            constraint = LinearConstraint(
                np.ones(len(cells)),
                input_data.total_budget,
                input_data.total_budget,
            )
            result = differential_evolution(
                objective,
                bounds=bounds,
                seed=seed,
                maxiter=300,
                polish=True,
                constraints=(constraint,),
            )
        except Exception:
            return None

        if not getattr(result, "success", False):
            return None

        spends = {cell: float(result.x[idx]) for idx, cell in enumerate(cells)}
        return _build_allocation_result(
            cells=cells,
            spends=spends,
            guardrails=guardrails,
            evaluate_fn=evaluate,
            roas_for=roas_for,
            input_data=input_data,
            base_diagnostics={
                "success": float(result.success),
                "nfev": float(result.nfev),
                "evaluations": float(result.nfev),
                "optimizer": "differential_evolution",
            },
            min_bounds=min_bounds,
            max_bounds=max_bounds,
            roas_caps=roas_caps,
        )

    def _summaries(candidates: Sequence[AllocationResult]) -> List[Dict[str, float | str]]:
        summary: List[Dict[str, float | str]] = []
        for candidate in candidates:
            optimizer_name = str(candidate.diagnostics.get("optimizer", "unknown"))
            success_val = candidate.diagnostics.get("success")
            try:
                success_float = float(success_val) if success_val is not None else 0.0
            except (TypeError, ValueError):
                success_float = 0.0
            summary.append(
                {
                    "optimizer": optimizer_name,
                    "profit": float(candidate.profit),
                    "success": success_float,
                }
            )
        return summary

    def _select_best(candidates: Sequence[AllocationResult]) -> AllocationResult | None:
        best: AllocationResult | None = None
        best_profit = float("-inf")
        for candidate in candidates:
            if candidate.profit > best_profit + 1e-6:
                best = candidate
                best_profit = candidate.profit
        return best

    def _attach_cache_stats(result: AllocationResult | None) -> None:
        if result is None:
            return
        if cells:
            vector = tuple(float(result.spends.get(cell, 0.0) or 0.0) for cell in cells)
            normalized_vector = tuple(round(value, CACHE_PRECISION) for value in vector)
            if normalized_vector in evaluation_cache:
                evaluate(vector)
        cache_entries = sum(len(bucket) for bucket in revenue_cache.values())
        result.diagnostics["revenue_cache_hits"] = float(cache_stats["hits"])
        result.diagnostics["revenue_cache_misses"] = float(cache_stats["misses"])
        result.diagnostics["revenue_cache_entries"] = float(cache_entries)
        result.diagnostics["evaluation_cache_hits"] = float(evaluation_cache_stats["hits"])
        result.diagnostics["evaluation_cache_misses"] = float(evaluation_cache_stats["misses"])
        result.diagnostics["evaluation_cache_entries"] = float(len(evaluation_cache))

    allow_heavy = "history.short" not in input_data.context_tags

    candidates: List[AllocationResult] = []

    if allow_heavy:
        nonlinear_allocation = _solve_with_trust_constr()
        if nonlinear_allocation is not None:
            candidates.append(nonlinear_allocation)

    projected_gradient_allocation = _solve_with_projected_gradient()
    if projected_gradient_allocation is not None:
        candidates.append(projected_gradient_allocation)

    coordinate_allocation = _solve_with_coordinate()
    candidates.append(coordinate_allocation)

    if allow_heavy:
        differential_allocation = _solve_with_differential()
        if differential_allocation is not None:
            candidates.append(differential_allocation)

    best_candidate = _select_best(candidates) if candidates else None

    if best_candidate is not None:
        _attach_cache_stats(best_candidate)
        best_candidate.diagnostics["optimizer_candidates"] = _summaries(candidates)
        best_candidate.diagnostics.setdefault("optimizer_winner", best_candidate.diagnostics.get("optimizer", "unknown"))
        return best_candidate

    fallback = _fallback_allocate(
        input_data=input_data,
        revenue_for=revenue_for,
        roas_for=roas_for,
    )
    _attach_cache_stats(fallback)
    fallback_candidates = _summaries(candidates) if candidates else []
    if fallback_candidates:
        fallback.diagnostics["optimizer_candidates"] = fallback_candidates
    fallback.diagnostics.setdefault("optimizer", "fallback")
    fallback.diagnostics.setdefault("optimizer_winner", fallback.diagnostics.get("optimizer"))
    return fallback


def _build_allocation_result(
    *,
    cells: Sequence[str],
    spends: Dict[str, float],
    guardrails: Guardrails,
    evaluate_fn,
    roas_for,
    input_data: AllocationInput,
    base_diagnostics: Dict[str, Any] | None = None,
    min_bounds: Dict[str, float] | None = None,
    max_bounds: Dict[str, float] | None = None,
    roas_caps: Dict[str, float] | None = None,
) -> AllocationResult:
    final_vector = tuple(spends[cell] for cell in cells)
    adjusted_profit, scenario_profits, penalty_info = evaluate_fn(final_vector)
    objective_value = -adjusted_profit

    baseline_total_spend = 0.0
    baseline_total_revenue = 0.0
    for cell in cells:
        baseline_spend = float(input_data.current_spend.get(cell, 0.0) or 0.0)
        if baseline_spend < 0.0:
            baseline_spend = 0.0
        baseline_total_spend += baseline_spend
        if baseline_spend > 0.0:
            baseline_total_revenue += roas_for(cell, baseline_spend) * baseline_spend
    baseline_profit = baseline_total_revenue - baseline_total_spend
    total_spend = sum(spends.values())
    profit_delta = adjusted_profit - baseline_profit
    spend_shift = total_spend - baseline_total_spend
    profit_delta_pct = (
        profit_delta / abs(baseline_profit) if abs(baseline_profit) > 1e-6 else None
    )

    binding_min: List[str] = []
    binding_max: List[str] = []
    binding_roas: List[str] = []
    binding_learning: List[str] = []
    binding_min_by_cell: List[str] = []
    binding_max_by_cell: List[str] = []
    tol = 1e-3

    max_spend = max(guardrails.max_spend, guardrails.min_spend)

    for cell in cells:
        spend = spends[cell]
        if abs(spend - guardrails.min_spend) <= tol:
            binding_min.append(cell)
        if max_spend and abs(spend - max_spend) <= tol:
            binding_max.append(cell)
        roas = roas_for(cell, spend)
        if guardrails.roas_floor and abs(roas - guardrails.roas_floor) <= tol:
            binding_roas.append(cell)
        if min_bounds is not None and abs(spend - min_bounds.get(cell, guardrails.min_spend)) <= tol:
            binding_min_by_cell.append(cell)
        if max_bounds is not None and abs(spend - max_bounds.get(cell, guardrails.max_spend)) <= tol:
            binding_max_by_cell.append(cell)
        base = max(input_data.current_spend.get(cell, guardrails.min_spend), guardrails.min_spend, tol)
        delta = abs(spend - base) / base if base > 0 else 0.0
        if delta >= max(guardrails.learning_cap - tol, 0.0):
            binding_learning.append(cell)

    conversions = None
    inventory_utilization = None
    if guardrails.inventory_available:
        conversions = sum(
            (roas_for(cell, spends[cell]) * spends[cell]) / guardrails.avg_order_value if guardrails.avg_order_value else 0.0
            for cell in cells
        )
        inventory_utilization = (
            conversions / guardrails.inventory_available if guardrails.inventory_available else None
        )

    diagnostics: Dict[str, Any] = {
        "objective_value": float(objective_value),
        "binding_min_spend": binding_min,
        "binding_max_spend": binding_max,
        "binding_roas_floor": binding_roas,
        "binding_learning_cap": binding_learning,
    }
    if base_diagnostics:
        diagnostics.update(base_diagnostics)
    if binding_min_by_cell:
        diagnostics["binding_min_spend_by_cell"] = binding_min_by_cell
    if binding_max_by_cell:
        diagnostics["binding_max_spend_by_cell"] = binding_max_by_cell
    diagnostics.update({f"scenario_profit_{label}": float(value) for label, value in scenario_profits.items()})
    diagnostics.update(penalty_info)
    diagnostics["baseline_total_spend"] = float(baseline_total_spend)
    diagnostics["baseline_total_revenue"] = float(baseline_total_revenue)
    diagnostics["baseline_profit"] = float(baseline_profit)
    diagnostics["profit_delta_vs_current"] = float(profit_delta)
    diagnostics["spend_shift_vs_current"] = float(spend_shift)
    if profit_delta_pct is not None:
        diagnostics["profit_delta_pct_vs_current"] = float(profit_delta_pct)
    if conversions is not None:
        diagnostics["conversions_estimate"] = float(conversions)
    if inventory_utilization is not None:
        diagnostics["inventory_utilization"] = float(inventory_utilization)
    if roas_caps:
        diagnostics["roas_caps"] = {cell: float(value) for cell, value in roas_caps.items()}

    return AllocationResult(spends=spends, profit=float(adjusted_profit), diagnostics=diagnostics)


def _coordinate_allocate(
    *,
    input_data: AllocationInput,
    evaluate_fn,
    roas_for,
    seed: int,
    min_bounds: Dict[str, float],
    max_bounds: Dict[str, float],
    min_softened: bool,
    roas_caps: Dict[str, float],
    evaluation_stats: Dict[str, int],
) -> AllocationResult:
    cells = input_data.cells
    guardrails = input_data.guardrails
    if not cells:
        return AllocationResult(
            spends={}, profit=0.0, diagnostics={"success": 1.0, "optimizer": "coordinate_ascent"}
        )

    lower_bounds = [float(min_bounds[cell]) for cell in cells]
    upper_bounds = [float(max_bounds[cell]) for cell in cells]

    initial_vector = []
    for idx, cell in enumerate(cells):
        lower = lower_bounds[idx]
        upper = upper_bounds[idx]
        base = input_data.current_spend.get(cell, lower)
        base = max(lower, min(base, upper))
        initial_vector.append(base)

    feasible_vector, projection_info = _project_to_feasible(
        initial_vector, lower_bounds, upper_bounds, input_data.total_budget
    )
    target_sum = projection_info["target_sum"]
    rng = random.Random(seed)

    best_vector = feasible_vector
    eval_calls = 0

    def _evaluate(vector: Sequence[float]) -> tuple[float, Dict[str, float], Dict[str, float]]:
        nonlocal eval_calls
        vector_tuple = tuple(float(value) for value in vector)
        miss_before = evaluation_stats["misses"]
        result = evaluate_fn(vector_tuple)
        if evaluation_stats["misses"] > miss_before:
            eval_calls += 1
        return result

    best_profit, _, _ = _evaluate(best_vector)
    improvements = 0

    span = max((ub - lb) for lb, ub in zip(lower_bounds, upper_bounds)) if cells else 0.0
    base_scale = target_sum if target_sum > 0 else max(span * len(cells), 1.0)
    step_candidates: List[float] = []
    for factor in (0.3, 0.15, 0.05, 0.01):
        delta = max(base_scale * factor, 1e-2)
        if delta > 0 and (not step_candidates or abs(delta - step_candidates[-1]) > 1e-6):
            step_candidates.append(delta)
    min_delta = max(1e-3, base_scale * 1e-3)

    def _max_diff(a: Sequence[float], b: Sequence[float]) -> float:
        return max((abs(x - y) for x, y in zip(a, b)), default=0.0)

    for delta in step_candidates:
        step = delta
        stagnation = 0
        while step >= min_delta and eval_calls < 4000:
            indices = list(range(len(cells)))
            rng.shuffle(indices)
            improved = False

            for idx in indices:
                for direction in (1.0, -1.0):
                    trial = list(best_vector)
                    trial[idx] = min(
                        upper_bounds[idx],
                        max(lower_bounds[idx], trial[idx] + direction * step),
                    )
                    projected, _ = _project_to_feasible(trial, lower_bounds, upper_bounds, target_sum)
                    if _max_diff(projected, best_vector) <= 1e-4:
                        continue
                    profit, _, _ = _evaluate(projected)
                    if profit > best_profit + 1e-6:
                        best_vector = projected
                        best_profit = profit
                        improvements += 1
                        improved = True
                        break
                if improved or eval_calls >= 4000:
                    break

            if not improved:
                step *= 0.5
                stagnation += 1
                if stagnation > 6:
                    break
            else:
                stagnation = 0

    spends = {cell: float(best_vector[idx]) for idx, cell in enumerate(cells)}
    base_diag = {
        "success": 1.0 if projection_info["residual_lower"] <= 1e-3 and projection_info["residual_upper"] <= 1e-3 else 0.0,
        "nfev": float(eval_calls),
        "evaluations": float(eval_calls),
        "optimizer": "coordinate_ascent",
        "projection_target": float(projection_info["target_sum"]),
        "projection_residual_lower": float(projection_info["residual_lower"]),
        "projection_residual_upper": float(projection_info["residual_upper"]),
        "iterations_with_improvement": float(improvements),
        "min_softened": 1.0 if min_softened else 0.0,
    }
    return _build_allocation_result(
        cells=cells,
        spends=spends,
        guardrails=guardrails,
        roas_for=roas_for,
        input_data=input_data,
        base_diagnostics=base_diag,
        min_bounds=min_bounds,
        max_bounds=max_bounds,
        roas_caps=roas_caps,
        evaluate_fn=_evaluate,
    )


def _project_to_feasible(
    values: Sequence[float],
    lower: Sequence[float],
    upper: Sequence[float],
    target_sum: float,
) -> tuple[List[float], Dict[str, float]]:
    """Project a vector into the bounded simplex defined by lower/upper and target sum."""
    n = len(values)
    if n == 0:
        return [], {"target_sum": float(max(target_sum, 0.0)), "residual_lower": 0.0, "residual_upper": 0.0}

    clamped = [min(max(val, lower[idx]), upper[idx]) for idx, val in enumerate(values)]
    lower_total = sum(lower)
    upper_total = sum(upper)

    if upper_total <= 0.0:
        target = 0.0
    else:
        target = min(max(target_sum, lower_total), upper_total)

    tol = 1e-6
    total = sum(clamped)
    residual_lower = 0.0
    residual_upper = 0.0

    if total > target + tol:
        clamped, residual_lower = _adjust_down(clamped, lower, total - target)
        total = sum(clamped)
    if total < target - tol:
        clamped, residual_upper = _adjust_up(clamped, upper, target - total)

    return clamped, {
        "target_sum": float(target),
        "residual_lower": float(max(residual_lower, 0.0)),
        "residual_upper": float(max(residual_upper, 0.0)),
    }


def _adjust_down(values: List[float], lower: Sequence[float], amount: float) -> tuple[List[float], float]:
    """Reduce total spend while respecting lower bounds."""
    tol = 1e-9
    n = len(values)
    if n == 0 or amount <= tol:
        return values, 0.0

    current_total = sum(values)
    original = list(values)
    target = current_total - amount
    lower_total = sum(lower)

    if target <= lower_total + tol:
        for idx in range(n):
            values[idx] = float(lower[idx])
        residual = max(0.0, lower_total - target)
        return values, residual

    max_slack = max((values[i] - lower[i]) for i in range(n))
    if max_slack <= tol:
        return values, max(0.0, current_total - target)

    lo, hi = 0.0, max_slack
    for _ in range(64):
        mid = 0.5 * (lo + hi)
        projected = 0.0
        for i in range(n):
            projected += max(lower[i], values[i] - mid)
        if projected > target:
            lo = mid
        else:
            hi = mid

    lambda_star = hi
    active_indices: List[int] = []
    total = 0.0

    for i in range(n):
        candidate = max(lower[i], original[i] - lambda_star)
        values[i] = candidate
        total += candidate
        if candidate > lower[i] + 1e-9 and original[i] > candidate + 1e-9:
            active_indices.append(i)

    gap = target - total
    if gap > tol and active_indices:
        share = gap / len(active_indices)
        for idx in active_indices:
            available = original[idx] - values[idx]
            addition = min(available, share, gap)
            if addition > 0:
                values[idx] += addition
                gap -= addition
        idx = 0
        while gap > tol and idx < len(active_indices):
            cell = active_indices[idx]
            available = original[cell] - values[cell]
            extra = min(available, gap)
            if extra > 0:
                values[cell] += extra
                gap -= extra
            idx += 1

    return values, max(0.0, gap)


def _adjust_up(values: List[float], upper: Sequence[float], amount: float) -> tuple[List[float], float]:
    """Increase total spend while respecting upper bounds."""
    tol = 1e-9
    n = len(values)
    if n == 0 or amount <= tol:
        return values, 0.0

    current_total = sum(values)
    original = list(values)
    target = current_total + amount
    upper_total = sum(upper)

    if target >= upper_total - tol:
        for idx in range(n):
            values[idx] = float(upper[idx])
        residual = max(0.0, target - upper_total)
        return values, residual

    max_slack = max((upper[i] - values[i]) for i in range(n))
    if max_slack <= tol:
        return values, max(0.0, target - current_total)

    lo, hi = 0.0, max_slack
    for _ in range(64):
        mid = 0.5 * (lo + hi)
        projected = 0.0
        for i in range(n):
            projected += min(upper[i], values[i] + mid)
        if projected < target:
            lo = mid
        else:
            hi = mid

    lambda_star = hi
    active_indices: List[int] = []
    total = 0.0

    for i in range(n):
        candidate = min(upper[i], original[i] + lambda_star)
        values[i] = candidate
        total += candidate
        if candidate < upper[i] - 1e-9 and candidate > original[i] + 1e-9:
            active_indices.append(i)

    gap = target - total
    if gap > tol and active_indices:
        share = gap / len(active_indices)
        for idx in active_indices:
            available = upper[idx] - values[idx]
            addition = min(available, share, gap)
            if addition > 0:
                values[idx] += addition
                gap -= addition
        idx = 0
        while gap > tol and idx < len(active_indices):
            cell = active_indices[idx]
            available = upper[cell] - values[cell]
            extra = min(available, gap)
            if extra > 0:
                values[cell] += extra
                gap -= extra
            idx += 1

    return values, max(0.0, gap)


def _fallback_allocate(
    input_data: AllocationInput,
    revenue_for,
    roas_for,
) -> AllocationResult:
    cells = input_data.cells
    guardrails = input_data.guardrails

    spends: Dict[str, float] = {}
    for cell in cells:
        base = max(input_data.current_spend.get(cell, guardrails.min_spend), guardrails.min_spend, 1e-6)
        spends[cell] = min(base, guardrails.max_spend)

    current_total = sum(spends.values())
    total_budget = input_data.total_budget

    if current_total > total_budget and current_total > 0:
        scale = total_budget / current_total
        for cell in cells:
            spends[cell] = max(guardrails.min_spend, min(guardrails.max_spend, spends[cell] * scale))
        current_total = sum(spends.values())

    remaining = max(total_budget - current_total, 0.0)
    weights = []
    for cell in cells:
        weight = float(input_data.expected_roas.get(cell, 0.0))
        if weight <= 0:
            weight = 1e-6
        weights.append(weight)
    weight_sum = sum(weights) or len(cells)

    for cell, weight in zip(cells, weights):
        if remaining <= 0:
            break
        capacity = max(guardrails.max_spend - spends[cell], 0.0)
        if capacity <= 0:
            continue
        share = remaining * (weight / weight_sum)
        allocation = min(capacity, share)
        spends[cell] += allocation
        remaining -= allocation

    if remaining > 1e-6:
        for cell in cells:
            if remaining <= 0:
                break
            capacity = max(guardrails.max_spend - spends[cell], 0.0)
            take = min(capacity, remaining)
            spends[cell] += take
            remaining -= take

    revenues = {cell: revenue_for(cell, spend) for cell, spend in spends.items()}
    profit = sum(revenues.values()) - sum(spends.values())

    diagnostics: Dict[str, Any] = {
        "success": 0.0,
        "nfev": 0.0,
        "evaluations": 0.0,
        "objective_value": float(-profit),
        "binding_min_spend": [cell for cell, spend in spends.items() if abs(spend - guardrails.min_spend) <= 1e-3],
        "binding_max_spend": [cell for cell, spend in spends.items() if abs(spend - guardrails.max_spend) <= 1e-3],
        "binding_roas_floor": [
            cell
            for cell, spend in spends.items()
            if guardrails.roas_floor and abs(roas_for(cell, spend) - guardrails.roas_floor) <= 1e-3
        ],
        "binding_learning_cap": [],
        "fallback_alloc": True,
        "optimizer": "fallback",
        "scenario_profit_p50": float(profit),
        "risk_penalty": 0.0,
        "roas_penalty": 0.0,
        "learning_penalty": 0.0,
        "inventory_penalty": 0.0,
        "expected_profit_raw": float(profit),
        "worst_case_profit": float(profit),
    }

    if guardrails.inventory_available:
        conversions = sum(
            (roas_for(cell, spends[cell]) * spends[cell]) / guardrails.avg_order_value if guardrails.avg_order_value else 0.0
            for cell in cells
        )
        diagnostics["conversions_estimate"] = float(conversions)
        if guardrails.inventory_available:
            diagnostics["inventory_utilization"] = float(
                conversions / guardrails.inventory_available if guardrails.inventory_available else 0.0
            )

    return AllocationResult(spends=spends, profit=float(profit), diagnostics=diagnostics)
