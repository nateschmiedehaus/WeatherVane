from __future__ import annotations

from typing import Dict, Sequence

from apps.allocator.heuristics import AllocationInput, Guardrails, allocate


def _revenue_from_curve(curve: Sequence[Dict[str, float]], spend: float) -> float:
    """Helper replicating allocator interpolation for assertions."""
    cleaned = sorted(((float(point["spend"]), float(point.get("revenue", 0.0))) for point in curve), key=lambda x: x[0])
    if not cleaned:
        return 0.0
    if spend <= cleaned[0][0]:
        base_spend, base_rev = cleaned[0]
        if base_spend <= 0:
            return base_rev
        return (base_rev / base_spend) * spend
    for idx in range(1, len(cleaned)):
        prev_spend, prev_rev = cleaned[idx - 1]
        curr_spend, curr_rev = cleaned[idx]
        if spend <= curr_spend:
            span = curr_spend - prev_spend
            if span <= 0:
                return curr_rev
            weight = (spend - prev_spend) / span
            return prev_rev + weight * (curr_rev - prev_rev)
    last_spend, last_rev = cleaned[-1]
    if len(cleaned) == 1 or spend <= last_spend:
        return last_rev
    prev_spend, prev_rev = cleaned[-2]
    if last_spend != prev_spend:
        slope = (last_rev - prev_rev) / (last_spend - prev_spend)
    elif last_spend:
        slope = last_rev / last_spend
    else:
        slope = 0.0
    return last_rev + slope * (spend - last_spend)


def _roas_from_curve(curve: Sequence[Dict[str, float]], spend: float) -> float:
    if spend <= 0:
        return 0.0
    revenue = _revenue_from_curve(curve, spend)
    return revenue / spend if spend > 0 else 0.0


def test_allocator_respects_budget_and_cell_caps():
    cells = ["meta", "google"]
    total_budget = 210.0
    current_spend = {"meta": 95.0, "google": 95.0}
    expected_roas = {"meta": 3.1, "google": 2.4}

    guardrails = Guardrails(
        min_spend=40.0,
        max_spend=180.0,
        roas_floor=1.1,
        learning_cap=0.35,
        max_spend_by_cell={"meta": 130.0, "google": 90.0},
        min_spend_by_cell={"meta": 50.0, "google": 45.0},
    )

    result = allocate(
        AllocationInput(
            cells=cells,
            total_budget=total_budget,
            current_spend=current_spend,
            expected_roas=expected_roas,
            guardrails=guardrails,
        ),
        seed=7,
    )

    assert abs(sum(result.spends.values()) - total_budget) < 1e-3
    assert result.spends["meta"] <= 130.0 + 1e-3
    assert result.spends["google"] <= 90.0 + 1e-3
    assert result.diagnostics["optimizer"] in {"trust_constr", "coordinate_ascent", "differential_evolution"}
    assert set(result.diagnostics.get("binding_min_spend_by_cell", [])) <= set(cells)
    assert result.profit > 0


def test_allocator_enforces_roas_floor_with_roi_curve():
    cells = ["meta", "google"]
    total_budget = 160.0
    current_spend = {"meta": 70.0, "google": 70.0}
    expected_roas = {"meta": 2.1, "google": 2.0}
    roi_curves = {
        "meta": [
            {"spend": 40.0, "revenue": 96.0},   # ROAS 2.4
            {"spend": 60.0, "revenue": 126.0},  # ROAS 2.1
            {"spend": 90.0, "revenue": 162.0},  # ROAS 1.8
            {"spend": 110.0, "revenue": 181.0},  # ROAS ~1.645
        ],
        "google": [
            {"spend": 40.0, "revenue": 84.0},
            {"spend": 70.0, "revenue": 133.0},
            {"spend": 90.0, "revenue": 162.0},
        ],
    }

    guardrails = Guardrails(
        min_spend=40.0,
        max_spend=120.0,
        roas_floor=1.85,
        learning_cap=0.25,
    )

    result = allocate(
        AllocationInput(
            cells=cells,
            total_budget=total_budget,
            current_spend=current_spend,
            expected_roas=expected_roas,
            roi_curves=roi_curves,
            guardrails=guardrails,
        ),
        seed=11,
    )

    meta_spend = result.spends["meta"]
    assert _roas_from_curve(roi_curves["meta"], meta_spend) >= guardrails.roas_floor - 1e-3
    roas_caps = result.diagnostics.get("roas_caps", {})
    assert "meta" in roas_caps
    assert roas_caps["meta"] <= guardrails.max_spend + 1e-3
    assert abs(sum(result.spends.values()) - result.diagnostics.get("projection_target", total_budget)) < 1e-3


def test_allocator_projected_gradient_candidate_respects_constraints():
    cells = ["meta", "google", "display"]
    total_budget = 240.0
    current_spend = {"meta": 80.0, "google": 80.0, "display": 55.0}
    expected_roas = {"meta": 2.2, "google": 1.9, "display": 1.8}
    roi_curves = {
        "meta": [
            {"spend": 35.0, "revenue": 77.0},
            {"spend": 80.0, "revenue": 152.0},
            {"spend": 120.0, "revenue": 204.0},
        ],
        "google": [
            {"spend": 30.0, "revenue": 60.0},
            {"spend": 70.0, "revenue": 126.0},
            {"spend": 110.0, "revenue": 187.0},
        ],
        "display": [
            {"spend": 25.0, "revenue": 48.0},
            {"spend": 60.0, "revenue": 108.0},
            {"spend": 100.0, "revenue": 168.0},
        ],
    }

    guardrails = Guardrails(
        min_spend=30.0,
        max_spend=150.0,
        roas_floor=1.6,
        learning_cap=0.25,
        min_spend_by_cell={"display": 40.0},
        max_spend_by_cell={"meta": 120.0, "google": 110.0, "display": 110.0},
    )

    result = allocate(
        AllocationInput(
            cells=cells,
            total_budget=total_budget,
            current_spend=current_spend,
            expected_roas=expected_roas,
            roi_curves=roi_curves,
            guardrails=guardrails,
            quantile_factors={"p10": 0.85, "p50": 1.0, "p90": 1.1},
        ),
        seed=19,
    )

    assert abs(sum(result.spends.values()) - total_budget) < 1e-3

    for cell, spend in result.spends.items():
        if spend <= 1e-6:
            continue
        assert _roas_from_curve(roi_curves[cell], spend) >= guardrails.roas_floor - 1e-3

    candidate_summaries = result.diagnostics.get("optimizer_candidates", [])
    assert any(summary.get("optimizer") == "projected_gradient" for summary in candidate_summaries)
    assert result.diagnostics.get("optimizer_winner") in {"projected_gradient", "trust_constr", "coordinate_ascent"}
