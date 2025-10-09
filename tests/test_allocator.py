from apps.allocator.heuristics import AllocationInput, Guardrails, allocate


def test_allocator_respects_budget():
    cells = ["meta", "google"]
    total_budget = 200.0
    current_spend = {"meta": 90.0, "google": 90.0}
    expected_roas = {"meta": 3.0, "google": 2.5}

    guardrails = Guardrails(min_spend=50.0, max_spend=150.0, roas_floor=1.0, learning_cap=0.3)
    result = allocate(
        AllocationInput(
            cells=cells,
            total_budget=total_budget,
            current_spend=current_spend,
            expected_roas=expected_roas,
            guardrails=guardrails,
        )
    )

    assert abs(sum(result.spends.values()) - total_budget) < 1e-3
    assert result.profit > 0


def test_allocator_reports_binding_constraints_with_roi_curve():
    cells = ["meta"]
    total_budget = 80.0
    current_spend = {"meta": 70.0}
    expected_roas = {"meta": 1.6}
    guardrails = Guardrails(
        min_spend=60.0,
        max_spend=80.0,
        roas_floor=1.7,
        learning_cap=0.15,
        inventory_available=500.0,
        avg_order_value=50.0,
    )
    roi_curves = {
        "meta": [
            {"spend": 60.0, "roas": 1.5, "revenue": 90.0},
            {"spend": 80.0, "roas": 1.7, "revenue": 136.0},
        ]
    }

    result = allocate(
        AllocationInput(
            cells=cells,
            total_budget=total_budget,
            current_spend=current_spend,
            expected_roas=expected_roas,
            roi_curves=roi_curves,
            guardrails=guardrails,
        )
    )

    assert result.spends["meta"] <= guardrails.max_spend
    assert "meta" in result.diagnostics.get("binding_max_spend", [])
    assert "meta" in result.diagnostics.get("binding_roas_floor", [])
    assert result.diagnostics.get("inventory_utilization") is not None
