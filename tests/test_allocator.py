from apps.allocator.heuristics import AllocationInput, Guardrails, allocate


def test_allocator_respects_budget():
    cells = ["meta", "google"]
    total_budget = 200.0
    current_spend = {"meta": 90.0, "google": 90.0}
    expected_roas = {"meta": 3.0, "google": 2.5}

    def revenue_fn(cell: str, spend: float) -> float:
        return expected_roas[cell] * spend

    guardrails = Guardrails(min_spend=50.0, max_spend=150.0, roas_floor=1.0, learning_cap=0.3)
    result = allocate(AllocationInput(cells, total_budget, current_spend, expected_roas, revenue_fn, guardrails))

    assert abs(sum(result.spends.values()) - total_budget) < 1e-3
    assert result.profit > 0
