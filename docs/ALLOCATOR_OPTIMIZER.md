# Allocation Optimizer

WeatherVane now evaluates multiple optimisers per allocation request and promotes the
highest‑profit solution while still honouring guardrails.

## Optimiser lineup
- **Trust-constr (SciPy)** – activated when `WEATHERVANE_ENABLE_SCIPY` is truthy and the
  context does not include `history.short`. Enforces the ROAS floor through
  `NonlinearConstraint` and keeps spends inside guardrails.
- **Differential evolution (SciPy)** – global search pass that respects the simplex
  constraint. Runs after trust-constr when available to escape poor local optima.
- **Projected gradient (Pure Python)** – new deterministic non-linear solver that works
  in every environment. It approximates the gradient of the profit surface, performs
  projected steps inside the bounded simplex, and honours ROAS floors, learning caps,
  and inventory limits without SciPy.
- **Coordinate ascent (Pure Python)** – deterministic fallback that projects each step
  back into the feasible region. Always executes so we have a baseline solution even
  in constrained sandboxes without SciPy.

Every candidate uses the shared evaluation function, so penalties for ROAS floors,
learning caps, inventory, and risk aversion stay consistent.

## Diagnostics
`AllocationResult.diagnostics` now includes:

```json
{
  "optimizer": "coordinate_ascent",
  "optimizer_winner": "coordinate_ascent",
  "optimizer_candidates": [
    {"optimizer": "projected_gradient", "profit": 184.7, "success": 1.0},
    {"optimizer": "trust_constr", "profit": 182.4, "success": 1.0},
    {"optimizer": "coordinate_ascent", "profit": 185.9, "success": 1.0}
  ]
}
```

This makes it easy to spot when the heuristic beats the non-linear solver (common with
short histories) and to debug SciPy failures without guessing what ran.

## Tips
- Keep `WEATHERVANE_ENABLE_SCIPY` unset on fragile environments; the system will still
  fall back to the projected-gradient and coordinate solvers.
- When experimenting locally, export `WEATHERVANE_ENABLE_SCIPY=1` before running
  `python -m pytest tests/test_allocator.py` to confirm SciPy paths are exercised. Use
  `PYTHONPATH=.deps:.` if SciPy lives in a per-repo directory.

## RL Shadow-Mode Validation
The reinforcement-learning shadow loop provides safety evidence before we promote
new policies. When the allocator critic or pytest suite is unavailable, run the
fallback harness to regenerate deterministic evidence and enforce guardrails:

```bash
python scripts/validate_rl_shadow.py --print-summary
```

The script executes the Prefect flow (`orchestrate_rl_shadow_flow`) with the
production defaults, persists `experiments/rl/shadow_mode.json`, and verifies:
- Baseline coverage respects `min_baseline_fraction`
- Variant exploration stays within `max_variant_fraction`
- Guardrail breaches never exceed `max_guardrail_breaches`
- The embedded stress test disables risky variants (`risk_off`) after a forced
  violation

The command exits non-zero if any check fails so it can gate CI, and the JSON
summary on stdout can be attached to review notes when critics stay gated.
