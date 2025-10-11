"""Stress testing utilities for the allocator.

The module provides deterministic stress scenarios that probe guardrails,
quantile handling, and regret under mis-specified response curves.  All logic
is pure Python so the suite can run in CI without SciPy."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Sequence, Tuple

import math

from apps.allocator.heuristics import AllocationInput, AllocationResult, Guardrails, allocate


CurvePoint = Tuple[float, float]


def _build_curve(points: Sequence[Dict[str, float]]) -> List[CurvePoint]:
    """Normalise curve points to monotonically increasing (spend, revenue)."""
    cleaned: List[CurvePoint] = []
    for entry in points:
        spend = float(entry.get("spend", 0.0) or 0.0)
        if spend < 0:
            continue
        revenue = float(
            entry.get(
                "revenue",
                (entry.get("roas") or 0.0) * spend,
            )
        )
        cleaned.append((spend, revenue))
    cleaned.sort(key=lambda pair: pair[0])
    if cleaned and cleaned[0][0] > 0:
        cleaned.insert(0, (0.0, 0.0))
    if not cleaned:
        cleaned.append((0.0, 0.0))
    return cleaned


def _revenue_from_curve(curve: Sequence[CurvePoint], spend: float) -> float:
    """Piecewise linear interpolation over the curve."""
    if not curve:
        return 0.0
    if spend <= curve[0][0]:
        baseline_spend, baseline_rev = curve[0]
        if baseline_spend <= 0:
            return baseline_rev
        return (baseline_rev / baseline_spend) * spend
    for idx in range(1, len(curve)):
        prev_spend, prev_rev = curve[idx - 1]
        curr_spend, curr_rev = curve[idx]
        if spend <= curr_spend:
            span = curr_spend - prev_spend
            if span <= 0:
                return curr_rev
            weight = (spend - prev_spend) / span
            return prev_rev + weight * (curr_rev - prev_rev)
    last_spend, last_rev = curve[-1]
    if len(curve) == 1:
        return last_rev
    prev_spend, prev_rev = curve[-2]
    slope = 0.0
    if last_spend != prev_spend:
        slope = (last_rev - prev_rev) / (last_spend - prev_spend)
    elif last_spend:
        slope = last_rev / last_spend
    return last_rev + slope * (spend - last_spend)


def _compute_profit(spends: Dict[str, float], curves: Dict[str, Sequence[CurvePoint]]) -> Tuple[float, Dict[str, float]]:
    revenues: Dict[str, float] = {}
    for cell, spend in spends.items():
        curve = curves.get(cell, [(0.0, 0.0)])
        revenues[cell] = _revenue_from_curve(curve, spend)
    total_revenue = sum(revenues.values())
    profit = total_revenue - sum(spends.values())
    return profit, revenues


def _solve_oracle(
    cells: Sequence[str],
    total_budget: float,
    guardrails: Guardrails,
    curves: Dict[str, Sequence[CurvePoint]],
) -> Tuple[Dict[str, float], float]:
    """Greedy marginal allocation to approximate the optimal profit."""
    if not cells:
        return {}, 0.0

    tol = 1e-6
    min_spend = guardrails.min_spend
    max_spend = guardrails.max_spend

    spends: Dict[str, float] = {cell: min_spend for cell in cells}
    total_min = min_spend * len(cells)
    if total_min > total_budget + tol and total_min > 0:
        scale = total_budget / total_min
        for cell in cells:
            spends[cell] = min_spend * scale

    remaining = max(total_budget - sum(spends.values()), 0.0)

    def segment_slope(cell: str, spend: float) -> Tuple[float, float]:
        curve = curves[cell]
        if spend >= max_spend - tol:
            return 0.0, 0.0

        prev_spend, prev_rev = curve[0]
        for idx in range(1, len(curve)):
            curr_spend, curr_rev = curve[idx]
            if spend < curr_spend:
                start_spend = max(spend, prev_spend)
                span = curr_spend - prev_spend
                if span <= tol:
                    prev_spend, prev_rev = curr_spend, curr_rev
                    continue
                if start_spend <= prev_spend + tol:
                    start_rev = prev_rev
                else:
                    ratio = (start_spend - prev_spend) / span
                    start_rev = prev_rev + ratio * (curr_rev - prev_rev)
                available = max(0.0, min(curr_spend, max_spend) - spend)
                slope = 0.0
                denom = curr_spend - start_spend
                if denom > tol:
                    slope = (curr_rev - start_rev) / denom
                return slope, available
            prev_spend, prev_rev = curr_spend, curr_rev

        last_spend, last_rev = curve[-1]
        if len(curve) > 1:
            prev_spend, prev_rev = curve[-2]
        slope = 0.0
        if last_spend != prev_spend:
            slope = (last_rev - prev_rev) / (last_spend - prev_spend)
        elif last_spend > tol:
            slope = last_rev / last_spend
        return slope, max(0.0, max_spend - spend)

    while remaining > tol:
        best_cell = None
        best_slope = -math.inf
        best_capacity = 0.0
        for cell in cells:
            spend = spends[cell]
            if spend >= max_spend - tol:
                continue
            slope, capacity = segment_slope(cell, spend)
            if capacity <= tol:
                continue
            if slope > best_slope + 1e-9:
                best_cell = cell
                best_slope = slope
                best_capacity = capacity

        if best_cell is None or best_slope <= 0.0:
            break

        delta = min(remaining, best_capacity)
        spends[best_cell] += delta
        remaining -= delta

    if remaining > tol:
        # Distribute any flat, zero-slope remainder without violating caps.
        while remaining > tol:
            progress = False
            for cell in cells:
                capacity = max(0.0, max_spend - spends[cell])
                if capacity <= tol:
                    continue
                delta = min(capacity, remaining)
                if delta <= tol:
                    continue
                spends[cell] += delta
                remaining -= delta
                progress = True
                if remaining <= tol:
                    break
            if not progress:
                break

    profit, _ = _compute_profit(spends, curves)
    return spends, profit


@dataclass(frozen=True)
class StressTestConfig:
    name: str
    cells: Sequence[str]
    total_budget: float
    expected_roas: Dict[str, float]
    actual_roi_curves: Dict[str, Sequence[Dict[str, float]]]
    current_spend: Dict[str, float]
    guardrails: Guardrails
    quantile_factors: Dict[str, float] = field(default_factory=dict)
    context_tags: Sequence[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def cleaned_curves(self) -> Dict[str, List[CurvePoint]]:
        return {cell: _build_curve(self.actual_roi_curves.get(cell, [])) for cell in self.cells}


@dataclass
class StressTestResult:
    name: str
    allocation: AllocationResult
    actual_profit: float
    oracle_profit: float
    regret: float
    regret_pct: float
    revenues: Dict[str, float]
    metadata: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        payload = {
            "name": self.name,
            "actual_profit": self.actual_profit,
            "oracle_profit": self.oracle_profit,
            "regret": self.regret,
            "regret_pct": self.regret_pct,
            "revenues": self.revenues,
            "allocation": {
                "spends": self.allocation.spends,
                "profit": self.allocation.profit,
                "diagnostics": self.allocation.diagnostics,
            },
        }
        if self.metadata:
            payload["metadata"] = self.metadata
        return payload


@dataclass
class StressSuiteReport:
    results: List[StressTestResult]

    @property
    def worst_regret(self) -> float:
        return max((result.regret for result in self.results), default=0.0)

    @property
    def worst_regret_pct(self) -> float:
        return max((result.regret_pct for result in self.results), default=0.0)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "results": [result.to_dict() for result in self.results],
            "worst_regret": self.worst_regret,
            "worst_regret_pct": self.worst_regret_pct,
        }


def run_stress_test(config: StressTestConfig) -> StressTestResult:
    curves = config.cleaned_curves()
    context_tags = list(config.context_tags)
    if "history.short" not in context_tags:
        context_tags.append("history.short")

    allocation_input = AllocationInput(
        cells=list(config.cells),
        total_budget=config.total_budget,
        current_spend=dict(config.current_spend),
        expected_roas=dict(config.expected_roas),
        roi_curves={cell: [dict(point) for point in config.actual_roi_curves.get(cell, [])] for cell in config.cells},
        guardrails=config.guardrails,
        context_tags=context_tags,
        quantile_factors=dict(config.quantile_factors),
    )
    allocation = allocate(allocation_input)

    actual_profit, revenues = _compute_profit(allocation.spends, curves)

    oracle_spends, oracle_profit = _solve_oracle(
        cells=list(config.cells),
        total_budget=config.total_budget,
        guardrails=config.guardrails,
        curves=curves,
    )

    regret = max(oracle_profit - actual_profit, 0.0)
    regret_pct = 0.0
    if abs(oracle_profit) > 1e-6:
        regret_pct = regret / abs(oracle_profit)

    return StressTestResult(
        name=config.name,
        allocation=allocation,
        actual_profit=float(actual_profit),
        oracle_profit=float(oracle_profit),
        regret=float(regret),
        regret_pct=float(regret_pct),
        revenues=revenues,
        metadata=dict(config.metadata),
    )


def default_stress_suite() -> StressSuiteReport:
    base_guardrails = Guardrails(min_spend=50.0, max_spend=300.0, roas_floor=1.2, learning_cap=0.4)

    moderate_curve = [
        {"spend": 50.0, "revenue": 80.0},
        {"spend": 150.0, "revenue": 220.0},
        {"spend": 300.0, "revenue": 430.0},
    ]
    steep_curve = [
        {"spend": 50.0, "revenue": 120.0},
        {"spend": 150.0, "revenue": 280.0},
        {"spend": 300.0, "revenue": 500.0},
    ]
    saturating_curve = [
        {"spend": 50.0, "revenue": 100.0},
        {"spend": 150.0, "revenue": 210.0},
        {"spend": 300.0, "revenue": 360.0},
    ]

    scenarios = [
        StressTestConfig(
            name="balanced-curve",
            cells=("meta", "google"),
            total_budget=300.0,
            current_spend={"meta": 120.0, "google": 120.0},
            expected_roas={"meta": 2.4, "google": 2.0},
            actual_roi_curves={"meta": steep_curve, "google": moderate_curve},
            guardrails=base_guardrails,
            metadata={"focus": "baseline alignment"},
        ),
        StressTestConfig(
            name="underestimated-meta",
            cells=("meta", "google", "pinterest"),
            total_budget=450.0,
            current_spend={"meta": 150.0, "google": 150.0, "pinterest": 120.0},
            expected_roas={"meta": 1.6, "google": 2.1, "pinterest": 1.9},
            actual_roi_curves={"meta": steep_curve, "google": moderate_curve, "pinterest": saturating_curve},
            guardrails=base_guardrails,
            metadata={"focus": "response curve misspecification"},
        ),
        StressTestConfig(
            name="inventory-constrained",
            cells=("meta", "search"),
            total_budget=260.0,
            current_spend={"meta": 140.0, "search": 140.0},
            expected_roas={"meta": 2.0, "search": 1.8},
            actual_roi_curves={"meta": moderate_curve, "search": saturating_curve},
            guardrails=Guardrails(
                min_spend=80.0,
                max_spend=260.0,
                roas_floor=1.1,
                learning_cap=0.25,
                inventory_available=3200.0,
                avg_order_value=45.0,
            ),
            quantile_factors={"p10": 0.7, "p50": 1.0, "p90": 1.2},
            metadata={"focus": "inventory guardrail and quantiles"},
        ),
    ]

    results = [run_stress_test(config) for config in scenarios]
    return StressSuiteReport(results=results)


def suite_to_json(report: StressSuiteReport) -> Dict[str, Any]:
    return report.to_dict()
