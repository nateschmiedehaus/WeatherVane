"""Fairness-aware cross-market saturation optimisation helpers."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Sequence

from apps.allocator.heuristics import AllocationInput, Guardrails, allocate

DEFAULT_OUTPUT = Path("experiments/allocator/saturation_report.json")


@dataclass(frozen=True)
class Market:
    """Parameters describing a geographic market's saturation curve."""

    name: str
    base_roas: float
    saturation_spend: float
    fairness_weight: float
    current_spend: float
    max_spend: float
    min_spend: float = 0.0
    curvature: float = 1.35
    weather_multiplier: float = 1.0

    def validate(self) -> None:
        if not self.name:
            raise ValueError("market name must be provided")
        if self.base_roas <= 0:
            raise ValueError("base_roas must be positive")
        if self.saturation_spend <= 0:
            raise ValueError("saturation_spend must be positive")
        if self.fairness_weight <= 0:
            raise ValueError("fairness_weight must be positive")
        if self.max_spend <= 0:
            raise ValueError("max_spend must be positive")
        if self.max_spend < self.min_spend:
            raise ValueError("max_spend must be >= min_spend")
        if self.curvature <= 0:
            raise ValueError("curvature must be positive")


def _hill_roas(market: Market, spend: float) -> float:
    """Return market ROAS using a Hill saturation curve."""

    if spend <= 0:
        return 0.0
    multiplier = max(market.weather_multiplier, 0.0)
    ratio = max(spend, 0.0) / market.saturation_spend
    return max((market.base_roas * multiplier) / (1.0 + ratio ** market.curvature), 0.0)


def _grid(market: Market) -> List[float]:
    baseline = max(market.min_spend, 0.0)
    maximum = max(market.max_spend, baseline)
    pivots = {
        0.0,
        baseline,
        maximum,
        market.saturation_spend,
        max((baseline + maximum) / 2.0, baseline),
        max(market.saturation_spend * 0.5, baseline),
        max(market.saturation_spend * 1.5, baseline),
    }
    cleaned = sorted(value for value in pivots if value >= 0.0)
    deduped: List[float] = []
    for value in cleaned:
        if not deduped or abs(deduped[-1] - value) > 1e-6:
            deduped.append(value)
    return deduped


def _roi_curve(market: Market) -> List[Dict[str, float]]:
    curve: List[Dict[str, float]] = []
    for spend in _grid(market):
        roas = _hill_roas(market, spend)
        curve.append({"spend": float(round(spend, 4)), "revenue": float(round(roas * spend, 4))})
    return curve


def _build_allocation_input(
    markets: Sequence[Market],
    total_budget: float,
    fairness_floor: float,
    roas_floor: float,
) -> tuple[AllocationInput, Dict[str, float], Dict[str, float]]:
    if not markets:
        raise ValueError("at least one market is required")
    if total_budget <= 0:
        raise ValueError("total_budget must be positive")
    if not (0.0 <= fairness_floor <= 1.0):
        raise ValueError("fairness_floor must be within [0, 1]")

    weights = sum(market.fairness_weight for market in markets)
    if weights <= 0:
        raise ValueError("sum of fairness weights must be positive")

    cells: List[str] = []
    expected_roas: Dict[str, float] = {}
    roi_curves: Dict[str, List[Dict[str, float]]] = {}
    current_spend: Dict[str, float] = {}
    min_by_cell: Dict[str, float] = {}
    max_by_cell: Dict[str, float] = {}
    fair_share: Dict[str, float] = {}

    for market in markets:
        market.validate()
        cell = market.name
        cells.append(cell)
        expected_roas[cell] = _hill_roas(market, max(market.current_spend, market.min_spend, 1e-3))
        roi_curves[cell] = _roi_curve(market)
        current_spend[cell] = float(market.current_spend)
        max_by_cell[cell] = float(max(market.max_spend, market.min_spend))
        target_share = market.fairness_weight / weights
        fair_share[cell] = target_share
        min_share = fairness_floor * target_share if fairness_floor > 0 else 0.0
        min_by_cell[cell] = max(market.min_spend, min_share * total_budget)

    guardrails = Guardrails(
        min_spend=0.0,
        max_spend=total_budget,
        roas_floor=roas_floor,
        learning_cap=0.4,
        min_spend_by_cell=min_by_cell,
        max_spend_by_cell=max_by_cell,
    )

    allocation_input = AllocationInput(
        cells=cells,
        total_budget=total_budget,
        current_spend=current_spend,
        expected_roas=expected_roas,
        roi_curves=roi_curves,
        guardrails=guardrails,
        context_tags=["cross_market", f"fairness_floor.{fairness_floor}"],
        quantile_factors={"p10": 0.8, "p50": 1.0, "p90": 1.15},
        risk_aversion=0.2,
    )
    return allocation_input, fair_share, min_by_cell


def optimise_cross_market_allocation(
    markets: Sequence[Market],
    *,
    total_budget: float,
    fairness_floor: float = 0.8,
    roas_floor: float = 1.1,
    seed: int = 19,
) -> dict[str, object]:
    """Return a fairness-aware allocation summary for the provided markets."""

    allocation_input, fair_share, min_by_cell = _build_allocation_input(
        markets, total_budget=total_budget, fairness_floor=fairness_floor, roas_floor=roas_floor
    )
    result = allocate(allocation_input, seed=seed)
    total_spend = sum(result.spends.values())
    if total_spend <= 0:
        total_spend = total_budget

    markets_report: List[Dict[str, object]] = []
    weighted_gap = 0.0
    max_gap = 0.0
    total_revenue = 0.0
    total_current_spend = 0.0
    baseline_revenue = 0.0
    total_floor_shortfall = 0.0
    max_floor_shortfall = 0.0
    under_allocated = 0
    total_weights = sum(market.fairness_weight for market in markets)

    for market in markets:
        cell = market.name
        spend = float(result.spends.get(cell, 0.0))
        roas = _hill_roas(market, spend)
        revenue = roas * spend
        share = spend / total_spend if total_spend > 0 else 0.0
        target_share = fair_share[cell]
        gap = share - target_share
        weighted_gap += abs(gap) * market.fairness_weight
        max_gap = max(max_gap, abs(gap))
        total_revenue += revenue

        current = float(market.current_spend)
        total_current_spend += current
        baseline_revenue += _hill_roas(market, current) * current

        lift_vs_current = 0.0
        if current > 0:
            lift_vs_current = (spend - current) / current

        target_spend = target_share * total_spend
        spend_delta_vs_target = spend - target_spend
        floor_required = min_by_cell[cell]
        floor_shortfall = max(0.0, floor_required - spend)
        total_floor_shortfall += floor_shortfall
        max_floor_shortfall = max(max_floor_shortfall, floor_shortfall)
        if gap < -1e-6:
            under_allocated += 1
        fairness_ratio = None
        if target_share > 0:
            fairness_ratio = share / target_share

        markets_report.append(
            {
                "name": market.name,
                "allocated_spend": spend,
                "share": share,
                "fair_share": target_share,
                "min_share": min_by_cell[cell] / total_budget if total_budget > 0 else 0.0,
                "revenue": revenue,
                "roas": roas,
                "saturation_ratio": spend / market.saturation_spend if market.saturation_spend > 0 else 0.0,
                "lift_vs_current": lift_vs_current,
                "current_spend": current,
                "weather_multiplier": market.weather_multiplier,
                "guardrail_binding": spend <= min_by_cell[cell] + 1e-6,
                "fairness_gap": gap,
                "fairness_ratio": fairness_ratio,
                "target_spend": target_spend,
                "spend_delta_vs_target": spend_delta_vs_target,
                "floor_shortfall": floor_shortfall,
            }
        )

    total_profit = total_revenue - total_spend
    baseline_profit = baseline_revenue - total_current_spend
    normalized_gap = weighted_gap / total_weights if total_weights > 0 else 0.0

    summary = {
        "profit": total_profit,
        "baseline_profit": baseline_profit,
        "profit_lift": total_profit - baseline_profit,
        "weighted_fairness_gap": weighted_gap,
        "max_fairness_gap": max_gap,
        "total_revenue": total_revenue,
        "total_spend": total_spend,
        "normalized_fairness_gap": normalized_gap,
        "under_allocated_markets": under_allocated,
        "total_floor_shortfall": total_floor_shortfall,
        "max_floor_shortfall": max_floor_shortfall,
    }

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "total_budget": total_budget,
        "fairness_floor": fairness_floor,
        "roas_floor": roas_floor,
        "summary": summary,
        "markets": markets_report,
        "allocator": {
            "profit": result.profit,
            "diagnostics": result.diagnostics,
        },
    }


def _default_markets() -> Sequence[Market]:
    return [
        Market(
            name="north_america",
            base_roas=2.45,
            saturation_spend=420.0,
            fairness_weight=1.0,
            current_spend=320.0,
            min_spend=210.0,
            max_spend=480.0,
            curvature=1.5,
            weather_multiplier=1.08,
        ),
        Market(
            name="europe",
            base_roas=2.1,
            saturation_spend=360.0,
            fairness_weight=0.9,
            current_spend=260.0,
            min_spend=180.0,
            max_spend=420.0,
            curvature=1.4,
            weather_multiplier=1.02,
        ),
        Market(
            name="apac",
            base_roas=2.7,
            saturation_spend=280.0,
            fairness_weight=0.8,
            current_spend=180.0,
            min_spend=120.0,
            max_spend=360.0,
            curvature=1.3,
            weather_multiplier=1.12,
        ),
    ]


def generate_saturation_report(
    *,
    total_budget: float | None = None,
    fairness_floor: float = 0.8,
    roas_floor: float = 1.15,
    output_path: str | Path | None = None,
    seed: int = 19,
) -> dict[str, object]:
    """Generate and persist the saturation optimisation report."""

    markets = list(_default_markets())
    if total_budget is None:
        total_budget = sum(market.current_spend for market in markets) * 1.08
    report = optimise_cross_market_allocation(
        markets,
        total_budget=total_budget,
        fairness_floor=fairness_floor,
        roas_floor=roas_floor,
        seed=seed,
    )
    destination = Path(output_path) if output_path else DEFAULT_OUTPUT
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


__all__ = [
    "Market",
    "generate_saturation_report",
    "optimise_cross_market_allocation",
    "DEFAULT_OUTPUT",
]
