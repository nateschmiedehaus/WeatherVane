"""Constraint-aware allocator built on cvxpy."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Mapping, Sequence, Tuple

try:  # pragma: no cover - exercised via tests when dependency missing
    import cvxpy as cp
except ImportError:  # pragma: no cover - captured by tests that require solver
    cp = None  # type: ignore[assignment]


@dataclass(frozen=True)
class BudgetItem:
    """Leaf-level spend target that participates in optimisation."""

    id: str
    name: str
    min_spend: float = 0.0
    max_spend: float = float("inf")
    current_spend: float = 0.0
    expected_roas: float = 1.0
    roi_curve: Sequence[Mapping[str, float]] = ()
    hierarchy_path: Mapping[str, str] = field(default_factory=dict)
    inventory_status: str = "in_stock"
    inventory_multiplier: float = 0.5
    platform_minimum: float = 0.0


@dataclass(frozen=True)
class HierarchyConstraint:
    """Hierarchical constraint covering one or more budget items."""

    id: str
    members: Sequence[str]
    min_spend: float = 0.0
    max_spend: float | None = None


@dataclass(frozen=True)
class OptimizerRequest:
    """Full optimisation request."""

    total_budget: float
    items: Sequence[BudgetItem]
    hierarchy_constraints: Sequence[HierarchyConstraint] = ()
    name: str | None = None
    learning_cap: float | None = None
    roas_floor: float = 0.0


@dataclass(frozen=True)
class OptimizerResult:
    spends: Dict[str, float]
    total_revenue: float
    profit: float
    diagnostics: Dict[str, Any]


class OptimizationError(RuntimeError):
    """Raised when the constrained optimisation fails."""


def _ensure_cvxpy_available() -> None:
    if cp is None:
        raise OptimizationError("cvxpy is required to run the constraint-aware allocator")


def _clean_roi_curve(curve: Sequence[Mapping[str, float]]) -> List[Tuple[float, float]]:
    """Normalise ROI curve definitions into sorted (spend, revenue) tuples."""
    cleaned: Dict[float, float] = {}
    for point in curve:
        spend = float(point.get("spend", 0.0) or 0.0)
        if spend < 0:
            continue
        revenue = point.get("revenue")
        if revenue is None and point.get("roas") is not None:
            revenue = float(point["roas"]) * spend
        revenue = float(revenue or 0.0)
        existing = cleaned.get(spend)
        if existing is None or revenue > existing:
            cleaned[spend] = revenue

    if 0.0 not in cleaned:
        cleaned[0.0] = 0.0

    ordered = sorted(cleaned.items(), key=lambda pair: pair[0])
    deduped: List[Tuple[float, float]] = []
    for spend, revenue in ordered:
        if not deduped:
            deduped.append((spend, revenue))
            continue
        prev_spend, prev_rev = deduped[-1]
        if spend <= prev_spend + 1e-9:
            continue
        deduped.append((spend, revenue))

    return deduped


def _roi_segments_from_cleaned(cleaned: Sequence[Tuple[float, float]]) -> List[Tuple[float, float]]:
    """Return (segment_length, slope) pairs for piecewise-linear ROI."""
    segments: List[Tuple[float, float]] = []
    for idx in range(1, len(cleaned)):
        prev_spend, prev_rev = cleaned[idx - 1]
        curr_spend, curr_rev = cleaned[idx]
        span = curr_spend - prev_spend
        if span <= 1e-9:
            continue
        slope = (curr_rev - prev_rev) / span
        segments.append((span, slope))
    return segments


def _roi_segments(curve: Sequence[Mapping[str, float]]) -> List[Tuple[float, float]]:
    """Return (segment_length, slope) pairs for piecewise-linear ROI."""
    cleaned = _clean_roi_curve(curve)
    return _roi_segments_from_cleaned(cleaned)


def _evaluate_roi_from_cleaned(
    cleaned: Sequence[Tuple[float, float]], spend: float, expected_roas: float
) -> float:
    """Evaluate ROI curve at spend using a pre-cleaned curve."""
    if spend <= 0:
        return 0.0
    if not cleaned:
        return max(expected_roas, 0.0) * spend
    count = len(cleaned)
    if count == 1:
        last_spend, last_rev = cleaned[0]
        if spend <= last_spend + 1e-9:
            return last_rev
        slope = last_rev / last_spend if last_spend > 0 else max(expected_roas, 0.0)
        return last_rev + slope * (spend - last_spend)

    # Binary search for the segment containing the spend.
    lo = 0
    hi = count
    while lo < hi:
        mid = (lo + hi) // 2
        mid_spend = cleaned[mid][0]
        if mid_spend < spend:
            lo = mid + 1
        else:
            hi = mid
    idx = lo

    if idx <= 0:
        prev_spend, prev_rev = cleaned[0]
        curr_spend, curr_rev = cleaned[1]
    elif idx >= count:
        last_spend, last_rev = cleaned[-1]
        if spend <= last_spend + 1e-9:
            return last_rev
        prev_spend, prev_rev = cleaned[-2]
        if last_spend != prev_spend:
            slope = (last_rev - prev_rev) / (last_spend - prev_spend)
        elif last_spend > 0:
            slope = last_rev / last_spend
        else:
            slope = max(expected_roas, 0.0)
        return last_rev + slope * (spend - last_spend)
    else:
        prev_spend, prev_rev = cleaned[idx - 1]
        curr_spend, curr_rev = cleaned[idx]

    span = curr_spend - prev_spend
    if span <= 1e-9:
        return curr_rev
    weight = (spend - prev_spend) / span
    return prev_rev + weight * (curr_rev - prev_rev)


def _evaluate_roi(curve: Sequence[Mapping[str, float]], spend: float, expected_roas: float) -> float:
    """Evaluate ROI curve at spend."""
    cleaned = _clean_roi_curve(curve)
    return _evaluate_roi_from_cleaned(cleaned, spend, expected_roas)


def _roas_at_spend(
    item: BudgetItem, spend: float, cleaned_curve: Sequence[Tuple[float, float]] | None = None
) -> float:
    if spend <= 0:
        return 0.0
    curve = cleaned_curve if cleaned_curve is not None else _clean_roi_curve(item.roi_curve)
    revenue = _evaluate_roi_from_cleaned(curve, spend, item.expected_roas)
    return revenue / spend if spend > 0 else 0.0


def _apply_inventory_caps(item: BudgetItem) -> Tuple[float, float]:
    """Return (min_spend, max_spend) after applying inventory status."""
    min_spend = max(item.min_spend, 0.0)
    max_spend = max(item.max_spend, min_spend)

    status = item.inventory_status.lower()
    if status == "out_of_stock":
        return 0.0, 0.0
    if status == "low_stock":
        multiplier = float(item.inventory_multiplier)
        capped = max_spend * max(min(multiplier, 1.0), 0.0)
        max_spend = min(max_spend, capped)
        max_spend = max(max_spend, min_spend)
    return min_spend, max_spend


def optimize_allocation(request: OptimizerRequest, *, solver: str | None = None) -> OptimizerResult:
    """Solve the constrained optimisation problem."""
    _ensure_cvxpy_available()
    if request.total_budget <= 0.0:
        raise OptimizationError("total_budget must be positive")
    if not request.items:
        raise OptimizationError("there must be at least one budget item")

    item_lookup: Dict[str, BudgetItem] = {}
    cleaned_curves: Dict[str, List[Tuple[float, float]]] = {}
    segments_cache: Dict[str, List[Tuple[float, float]]] = {}
    for item in request.items:
        if item.id in item_lookup:
            raise OptimizationError(f"duplicate budget item id '{item.id}'")
        item_lookup[item.id] = item
        cleaned = _clean_roi_curve(item.roi_curve)
        cleaned_curves[item.id] = cleaned
        segments_cache[item.id] = _roi_segments_from_cleaned(cleaned)

    spend_vars: Dict[str, cp.Expression] = {}
    revenue_terms: Dict[str, cp.Expression] = {}
    constraints: List[cp.Constraint] = []

    for item in request.items:
        cleaned_curve = cleaned_curves[item.id]
        segments = segments_cache[item.id]
        min_spend, max_spend = _apply_inventory_caps(item)
        if max_spend < min_spend - 1e-9:
            raise OptimizationError(f"invalid spend bounds for item '{item.id}'")

        if segments:
            seg_vars = cp.Variable(len(segments), nonneg=True, name=f"seg_{item.id}")
            spend_expr = cp.sum(seg_vars)
            seg_constraints = []
            for idx, (length, _) in enumerate(segments):
                seg_constraints.append(seg_vars[idx] <= float(length))
            constraints.extend(seg_constraints)
            revenue_expr = cp.sum(cp.multiply(seg_vars, [float(slope) for _, slope in segments]))
        else:
            seg_vars = cp.Variable(1, nonneg=True, name=f"spend_{item.id}")
            spend_expr = seg_vars[0]
            revenue_expr = float(max(item.expected_roas, 0.0)) * spend_expr

        effective_min = max(min_spend, 0.0)
        platform_minimum = max(item.platform_minimum, 0.0)
        effective_min = max(effective_min, platform_minimum)
        effective_max = max(max_spend, effective_min)

        if request.learning_cap is not None and item.current_spend > 0:
            cap = max(request.learning_cap, 0.0)
            lower_cap = max(0.0, float(item.current_spend) * (1.0 - cap))
            upper_cap = float(item.current_spend) * (1.0 + cap)
            effective_min = max(effective_min, lower_cap)
            effective_max = min(effective_max, upper_cap)

        roas_floor = max(request.roas_floor, 0.0)
        if roas_floor > 0 and effective_max > effective_min + 1e-6:
            roas_at_max = _roas_at_spend(item, effective_max, cleaned_curve)
            if roas_at_max < roas_floor - 1e-6:
                roas_at_min = _roas_at_spend(item, effective_min, cleaned_curve)
                if roas_at_min < roas_floor - 1e-6:
                    effective_max = effective_min
                else:
                    lo = effective_min
                    hi = effective_max
                    for _ in range(60):
                        mid = 0.5 * (lo + hi)
                        if mid <= lo + 1e-6:
                            break
                        roas_mid = _roas_at_spend(item, mid, cleaned_curve)
                        if roas_mid >= roas_floor - 1e-6:
                            lo = mid
                        else:
                            hi = mid
                    effective_max = max(effective_min, lo)
        if effective_max < effective_min - 1e-6:
            raise OptimizationError(
                f"infeasible spend bounds for '{item.id}' after applying guardrails and learning cap"
            )

        constraints.append(spend_expr >= effective_min)
        constraints.append(spend_expr <= effective_max)

        spend_vars[item.id] = spend_expr
        revenue_terms[item.id] = revenue_expr

    total_spend_expr = cp.sum(list(spend_vars.values()))
    constraints.append(total_spend_expr == float(request.total_budget))

    for constraint in request.hierarchy_constraints:
        if not constraint.members:
            continue
        missing = [member for member in constraint.members if member not in spend_vars]
        if missing:
            raise OptimizationError(
                f"hierarchy constraint '{constraint.id}' references unknown members: {missing}"
            )
        group_spend = cp.sum([spend_vars[member] for member in constraint.members])
        if constraint.min_spend is not None:
            constraints.append(group_spend >= float(max(constraint.min_spend, 0.0)))
        if constraint.max_spend is not None:
            constraints.append(group_spend <= float(max(constraint.max_spend, 0.0)))

    solver_candidates: Iterable[str] = (
        [solver] if solver else ("ECOS_BB", "GLPK_MI", "SCIP", "CBC", "ECOS", "CLARABEL", "SCS")
    )
    problem = cp.Problem(
        cp.Maximize(cp.sum(list(revenue_terms.values())) - total_spend_expr),
        constraints,
    )

    solve_status: str | None = None
    solve_duration: float | None = None
    chosen_solver: str | None = None
    for solver_name in solver_candidates:
        if solver_name is None:
            continue
        if solver_name not in cp.installed_solvers():  # pragma: no cover - depends on environment
            continue
        try:
            problem.solve(solver=solver_name, verbose=False)
        except (cp.SolverError, ValueError):  # pragma: no cover - logged via diagnostics
            continue
        solve_status = problem.status
        solve_duration = float(problem.solver_stats.solve_time)
        chosen_solver = solver_name
        break

    if solve_status not in {"optimal", "optimal_inaccurate"}:
        raise OptimizationError(f"optimizer failed: status={solve_status!r}")

    spends: Dict[str, float] = {}
    revenues: Dict[str, float] = {}
    for item_id, expr in spend_vars.items():
        spend_value = float(expr.value) if expr.value is not None else 0.0
        spends[item_id] = max(spend_value, 0.0)
        revenues[item_id] = _evaluate_roi_from_cleaned(
            cleaned_curves[item_id], spends[item_id], item_lookup[item_id].expected_roas
        )

    total_revenue = sum(revenues.values())
    total_spend = sum(spends.values())
    profit = total_revenue - total_spend

    hierarchy_actuals: Dict[str, float] = {}
    for constraint in request.hierarchy_constraints:
        actual = sum(spends[member] for member in constraint.members if member in spends)
        hierarchy_actuals[constraint.id] = actual

    diagnostics: Dict[str, Any] = {
        "status": solve_status,
        "solver": chosen_solver,
        "objective_value": float(problem.value if problem.value is not None else 0.0),
        "solve_time_seconds": solve_duration,
        "total_spend": float(total_spend),
        "total_revenue": float(total_revenue),
        "hierarchy_actuals": hierarchy_actuals,
    }
    return OptimizerResult(
        spends=spends,
        total_revenue=float(total_revenue),
        profit=float(profit),
        diagnostics=diagnostics,
    )


__all__ = [
    "BudgetItem",
    "HierarchyConstraint",
    "OptimizerRequest",
    "OptimizerResult",
    "OptimizationError",
    "optimize_allocation",
]
