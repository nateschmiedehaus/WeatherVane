"""Heuristic allocator for WeatherVane."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Sequence

import os
import random

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


def allocate(input_data: AllocationInput, seed: int = 42) -> AllocationResult:
    cells = input_data.cells
    guardrails = input_data.guardrails

    min_bounds, max_bounds, min_softened = compute_bounds(cells, guardrails, input_data.total_budget)

    curve_lookup: Dict[str, List[tuple[float, float]]] = {}
    for cell, points in input_data.roi_curves.items():
        cleaned: List[tuple[float, float]] = []
        for entry in points:
            spend = float(entry.get("spend", 0.0) or 0.0)
            revenue = float(entry.get("revenue", entry.get("roas", 0.0) * spend if entry.get("roas") is not None else 0.0))
            if spend < 0:
                continue
            cleaned.append((spend, revenue))
        cleaned.sort(key=lambda pair: pair[0])
        if cleaned and cleaned[0][0] > 0:
            cleaned.insert(0, (0.0, 0.0))
        if cleaned:
            curve_lookup[cell] = cleaned

    def revenue_for(cell: str, spend: float) -> float:
        curve = curve_lookup.get(cell)
        if not curve:
            return input_data.expected_roas.get(cell, 1.0) * spend
        if spend <= curve[0][0]:
            base_spend, base_rev = curve[0]
            if base_spend <= 0:
                return base_rev
            return (base_rev / base_spend) * spend
        for idx in range(1, len(curve)):
            prev_spend, prev_rev = curve[idx - 1]
            curr_spend, curr_rev = curve[idx]
            if spend <= curr_spend:
                span = curr_spend - prev_spend
                weight = 0.0 if span == 0 else (spend - prev_spend) / span
                return prev_rev + weight * (curr_rev - prev_rev)
        last_spend, last_rev = curve[-1]
        if len(curve) == 1 or spend <= last_spend:
            return last_rev
        prev_spend, prev_rev = curve[-2]
        slope = (last_rev - prev_rev) / (last_spend - prev_spend) if last_spend != prev_spend else (last_rev / last_spend if last_spend else 0.0)
        return last_rev + slope * (spend - last_spend)

    def roas_for(cell: str, spend: float) -> float:
        if spend <= 0:
            return 0.0
        revenue = revenue_for(cell, spend)
        return revenue / spend if spend > 0 else 0.0

    max_bounds, roas_caps = _apply_roas_floor_limits(
        cells=cells,
        min_bounds=min_bounds,
        max_bounds=max_bounds,
        roas_floor=guardrails.roas_floor,
        roas_for=roas_for,
    )
    bounds = [(min_bounds[cell], max_bounds[cell]) for cell in cells]

    def evaluate(x: Sequence[float]) -> tuple[float, Dict[str, float], Dict[str, float]]:
        total_spend = float(sum(x))
        cpm_penalty = guardrails.cpm_alpha * total_spend
        revenues: List[float] = []
        roas_pen = 0.0
        learning_pen = 0.0
        for idx, cell in enumerate(cells):
            spend = float(x[idx])
            revenue = revenue_for(cell, spend)
            revenues.append(revenue)
            roas = revenue / spend if spend > 0 else 0.0
            if roas < guardrails.roas_floor:
                roas_pen += 1e5 * (guardrails.roas_floor - roas)
            base = max(input_data.current_spend.get(cell, min_bounds[cell]), min_bounds[cell], 1e-6)
            delta = abs(spend - base) / base
            if delta > guardrails.learning_cap:
                learning_pen += 1e4 * (delta - guardrails.learning_cap)

        inventory_pen = 0.0
        if guardrails.inventory_available is not None:
            conversions = sum(
                (roas_for(cell, float(x[idx])) * float(x[idx])) / guardrails.avg_order_value if guardrails.avg_order_value else 0.0
                for idx, cell in enumerate(cells)
            )
            if conversions > guardrails.inventory_available:
                inventory_pen = 1e6 * (conversions - guardrails.inventory_available)

        factors = input_data.quantile_factors or {}
        base_factor = factors.get("p50", 1.0) or 1.0
        scenario_defs: List[tuple[str, float, float]]
        if factors:
            scenario_defs = [
                ("p10", max(factors.get("p10", base_factor), 0.0), 0.2),
                ("p50", base_factor, 0.6),
                ("p90", max(factors.get("p90", base_factor), 0.0), 0.2),
            ]
        else:
            scenario_defs = [("p50", 1.0, 1.0)]

        scenario_profits: Dict[str, float] = {}
        weight_sum = 0.0
        for label, factor, weight in scenario_defs:
            scenario_revenue = sum(factor * rev for rev in revenues)
            scenario_profit = scenario_revenue - total_spend - cpm_penalty
            scenario_profits[label] = scenario_profit
            weight_sum += weight

        if weight_sum <= 0:
            weight_sum = 1.0
        weighted_profit = sum(weight * scenario_profits[label] for label, _, weight in scenario_defs) / weight_sum
        worst_profit = min(scenario_profits.values()) if scenario_profits else weighted_profit
        risk_penalty = input_data.risk_aversion * max(weighted_profit - worst_profit, 0.0)

        adjusted_profit = weighted_profit - roas_pen - learning_pen - inventory_pen - risk_penalty
        penalty_diagnostics = {
            "risk_penalty": float(risk_penalty),
            "roas_penalty": float(roas_pen),
            "learning_penalty": float(learning_pen),
            "inventory_penalty": float(inventory_pen),
            "expected_profit_raw": float(weighted_profit),
            "worst_case_profit": float(worst_profit),
        }
        return adjusted_profit, scenario_profits, penalty_diagnostics

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

    if "history.short" not in input_data.context_tags:
        nonlinear_allocation = _solve_with_trust_constr()
        if nonlinear_allocation is not None:
            return nonlinear_allocation

    if differential_evolution is None or "history.short" in input_data.context_tags:
        return _solve_with_coordinate()

    try:
        constraint = LinearConstraint(np.ones(len(cells)), input_data.total_budget, input_data.total_budget)
        result = differential_evolution(
            objective,
            bounds=bounds,
            seed=seed,
            maxiter=300,
            polish=True,
            constraints=(constraint,),
        )
    except Exception:
        return _solve_with_coordinate()

    if not getattr(result, "success", False):
        return _solve_with_coordinate()

    spends = {cell: float(result.x[idx]) for idx, cell in enumerate(cells)}
    allocation = _build_allocation_result(
        cells=cells,
        spends=spends,
        guardrails=guardrails,
        evaluate_fn=evaluate,
        roas_for=roas_for,
        input_data=input_data,
        base_diagnostics={
            "success": float(result.success),
            "nfev": float(result.nfev),
            "optimizer": "differential_evolution",
        },
        min_bounds=min_bounds,
        max_bounds=max_bounds,
        roas_caps=roas_caps,
    )
    return allocation


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
    best_profit, _, _ = evaluate_fn(tuple(best_vector))
    evaluations = 1
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
        while step >= min_delta and evaluations < 4000:
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
                    profit, _, _ = evaluate_fn(tuple(projected))
                    evaluations += 1
                    if profit > best_profit + 1e-6:
                        best_vector = projected
                        best_profit = profit
                        improvements += 1
                        improved = True
                        break
                if improved or evaluations >= 4000:
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
        "nfev": float(evaluations),
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
        evaluate_fn=evaluate_fn,
        roas_for=roas_for,
        input_data=input_data,
        base_diagnostics=base_diag,
        min_bounds=min_bounds,
        max_bounds=max_bounds,
        roas_caps=roas_caps,
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
    remaining = amount
    tol = 1e-9
    n = len(values)
    for _ in range(50):
        if remaining <= tol:
            break
        capacities = [max(0.0, values[i] - lower[i]) for i in range(n)]
        total_capacity = sum(capacities)
        if total_capacity <= tol:
            break
        for i in range(n):
            capacity = capacities[i]
            if capacity <= tol:
                continue
            share = min(capacity, remaining * (capacity / total_capacity))
            if share <= tol:
                continue
            values[i] -= share
            remaining -= share
            if remaining <= tol:
                break
    return values, remaining


def _adjust_up(values: List[float], upper: Sequence[float], amount: float) -> tuple[List[float], float]:
    """Increase total spend while respecting upper bounds."""
    remaining = amount
    tol = 1e-9
    n = len(values)
    for _ in range(50):
        if remaining <= tol:
            break
        capacities = [max(0.0, upper[i] - values[i]) for i in range(n)]
        total_capacity = sum(capacities)
        if total_capacity <= tol:
            break
        for i in range(n):
            capacity = capacities[i]
            if capacity <= tol:
                continue
            share = min(capacity, remaining * (capacity / total_capacity))
            if share <= tol:
                continue
            values[i] += share
            remaining -= share
            if remaining <= tol:
                break
    return values, remaining


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
