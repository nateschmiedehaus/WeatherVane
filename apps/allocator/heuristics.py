"""Heuristic allocator for WeatherVane."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import numpy as np

try:  # pragma: no cover - optional heavy dependency
    from scipy.optimize import differential_evolution, LinearConstraint
except Exception:  # pragma: no cover - environment without SciPy
    differential_evolution = None


@dataclass
class Guardrails:
    min_spend: float
    max_spend: float
    roas_floor: float = 0.0
    learning_cap: float = 0.2
    inventory_available: float | None = None
    cpm_alpha: float = 0.0
    avg_order_value: float = 1.0


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


def allocate(input_data: AllocationInput, seed: int = 42) -> AllocationResult:
    cells = input_data.cells
    guardrails = input_data.guardrails

    bounds = [(guardrails.min_spend, guardrails.max_spend) for _ in cells]

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

    def evaluate(x: np.ndarray) -> tuple[float, Dict[str, float], Dict[str, float]]:
        total_spend = float(np.sum(x))
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
            base = max(input_data.current_spend.get(cell, guardrails.min_spend), guardrails.min_spend, 1e-6)
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

    def objective(x: np.ndarray) -> float:
        adjusted_profit, _, _ = evaluate(x)
        return -float(adjusted_profit)

    if differential_evolution is None or "history.short" in input_data.context_tags:
        return _fallback_allocate(input_data, revenue_for, roas_for)

    constraint = LinearConstraint(np.ones(len(cells)), input_data.total_budget, input_data.total_budget)

    result = differential_evolution(
        objective,
        bounds=bounds,
        seed=seed,
        maxiter=300,
        polish=True,
        constraints=(constraint,),
    )

    spends = {cell: float(result.x[idx]) for idx, cell in enumerate(cells)}
    final_vector = np.array([spends[cell] for cell in cells])
    adjusted_profit, scenario_profits, penalty_info = evaluate(final_vector)
    objective_value = -adjusted_profit

    binding_min: List[str] = []
    binding_max: List[str] = []
    binding_roas: List[str] = []
    binding_learning: List[str] = []
    tol = 1e-3

    for cell, spend in spends.items():
        if abs(spend - guardrails.min_spend) <= tol:
            binding_min.append(cell)
        if abs(spend - guardrails.max_spend) <= tol:
            binding_max.append(cell)
        roas = roas_for(cell, spend)
        if guardrails.roas_floor and abs(roas - guardrails.roas_floor) <= tol:
            binding_roas.append(cell)
        base = max(input_data.current_spend.get(cell, guardrails.min_spend), guardrails.min_spend, tol)
        delta = abs(spend - base) / base
        if delta >= max(guardrails.learning_cap - tol, 0.0):
            binding_learning.append(cell)

    conversions = None
    inventory_utilization = None
    if guardrails.inventory_available:
        conversions = sum(
            (roas_for(cell, spends[cell]) * spends[cell]) / guardrails.avg_order_value if guardrails.avg_order_value else 0.0
            for cell in cells
        )
        inventory_utilization = conversions / guardrails.inventory_available if guardrails.inventory_available else None

    diagnostics: Dict[str, Any] = {
        "success": float(result.success),
        "nfev": float(result.nfev),
        "objective_value": float(objective_value),
        "binding_min_spend": binding_min,
        "binding_max_spend": binding_max,
        "binding_roas_floor": binding_roas,
        "binding_learning_cap": binding_learning,
    }
    diagnostics.update({f"scenario_profit_{label}": float(value) for label, value in scenario_profits.items()})
    diagnostics.update(penalty_info)
    if conversions is not None:
        diagnostics["conversions_estimate"] = float(conversions)
    if inventory_utilization is not None:
        diagnostics["inventory_utilization"] = float(inventory_utilization)

    return AllocationResult(spends=spends, profit=float(adjusted_profit), diagnostics=diagnostics)


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

    return AllocationResult(spends=spends, profit=float(profit), diagnostics=diagnostics)
