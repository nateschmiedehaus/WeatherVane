"""Heuristic allocator for WeatherVane."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, List

import numpy as np
from scipy.optimize import differential_evolution


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
    revenue_fn: Callable[[str, float], float]
    guardrails: Guardrails


@dataclass
class AllocationResult:
    spends: Dict[str, float]
    profit: float
    diagnostics: Dict[str, float]


def allocate(input_data: AllocationInput, seed: int = 42) -> AllocationResult:
    cells = input_data.cells
    guardrails = input_data.guardrails

    bounds = [(guardrails.min_spend, guardrails.max_spend) for _ in cells]

    def objective(x: np.ndarray) -> float:
        cpm_penalty = guardrails.cpm_alpha * np.sum(x)
        profit = 0.0
        roas_pen = 0.0
        learning_pen = 0.0
        for idx, cell in enumerate(cells):
            spend = float(x[idx])
            revenue = input_data.revenue_fn(cell, spend)
            profit += revenue - spend - cpm_penalty
            roas = revenue / spend if spend > 0 else 0.0
            if roas < guardrails.roas_floor:
                roas_pen += 1e5 * (guardrails.roas_floor - roas)
            base = max(input_data.current_spend.get(cell, guardrails.min_spend), guardrails.min_spend)
            delta = abs(spend - base) / base
            if delta > guardrails.learning_cap:
                learning_pen += 1e4 * (delta - guardrails.learning_cap)
        inventory_pen = 0.0
        if guardrails.inventory_available is not None:
            conversions = sum(
                input_data.expected_roas[cell] * x[idx] / guardrails.avg_order_value for idx, cell in enumerate(cells)
            )
            if conversions > guardrails.inventory_available:
                inventory_pen = 1e6 * (conversions - guardrails.inventory_available)
        return -(profit - roas_pen - learning_pen - inventory_pen)

    result = differential_evolution(
        objective,
        bounds=bounds,
        seed=seed,
        maxiter=300,
        polish=True,
        constraints=({"type": "eq", "fun": lambda x: np.sum(x) - input_data.total_budget},),
    )

    spends = {cell: float(result.x[idx]) for idx, cell in enumerate(cells)}
    diagnostics = {
        "success": float(result.success),
        "nfev": float(result.nfev),
        "fun": float(result.fun),
    }
    return AllocationResult(spends=spends, profit=float(-result.fun), diagnostics=diagnostics)
