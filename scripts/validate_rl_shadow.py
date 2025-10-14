#!/usr/bin/env python3
"""Deterministic validation harness for the RL shadow-mode pipeline.

This script runs the shadow-mode simulation with the same defaults used by
`orchestrate_rl_shadow_flow` and enforces the safety guarantees that the
allocator critic normally verifies. It exists as a sandbox-friendly fallback
when pytest or allocator critics are unavailable.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from apps.worker.flows.rl_shadow_pipeline import DEFAULT_OUTPUT, run_shadow_simulation  # noqa: E402


def _validate_payload(payload: dict[str, Any]) -> list[str]:
    """Return a list of validation errors derived from the simulation payload."""

    errors: list[str] = []
    config = payload.get("config", {})
    guardrail_limit = config.get("max_guardrail_breaches")
    if guardrail_limit is not None and payload.get("guardrail_violations", 0) > guardrail_limit:
        errors.append(
            f"guardrail violations {payload['guardrail_violations']} exceeded limit {guardrail_limit}"
        )

    validation = payload.get("validation", {})
    for check in validation.get("checks", []):
        if not check.get("status", False):
            name = check.get("name", "unknown")
            value = check.get("value")
            threshold = check.get("threshold")
            errors.append(f"validation check '{name}' failed (value={value}, threshold={threshold})")

    stress = validation.get("stress_test", {})
    for name, status in stress.get("assertions", {}).items():
        if not status:
            errors.append(f"stress-test assertion '{name}' failed")

    disabled = payload.get("disabled_variants", [])
    diagnostics = payload.get("diagnostics", {})
    baseline_fraction = diagnostics.get("baseline_fraction")
    max_variant_fraction = diagnostics.get("max_variant_fraction")
    if baseline_fraction is not None and config.get("min_baseline_fraction") is not None:
        if baseline_fraction + 1e-9 < config["min_baseline_fraction"]:
            errors.append(
                f"baseline fraction {baseline_fraction:.4f} fell below required {config['min_baseline_fraction']}"
            )
    if max_variant_fraction is not None and config.get("max_variant_fraction") is not None:
        if max_variant_fraction - 1e-9 > config["max_variant_fraction"]:
            errors.append(
                f"max variant fraction {max_variant_fraction:.4f} exceeded {config['max_variant_fraction']}"
            )

    if "baseline" in disabled:
        errors.append("baseline variant should never be disabled")

    return errors


def _format_summary(payload: dict[str, Any]) -> str:
    config = payload["config"]
    diagnostics = payload["diagnostics"]
    selection_counts = payload["selection_counts"]
    return json.dumps(
        {
            "episodes": config["episodes"],
            "baseline_fraction": diagnostics.get("baseline_fraction"),
            "max_variant_fraction": diagnostics.get("max_variant_fraction"),
            "guardrail_violations": payload.get("guardrail_violations"),
            "disabled_variants": payload.get("disabled_variants"),
            "selection_counts": selection_counts,
            "stress_test": payload.get("validation", {}).get("stress_test", {}),
        },
        indent=2,
        sort_keys=True,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate RL shadow-mode safety guarantees.")
    parser.add_argument("--episodes", type=int, default=30)
    parser.add_argument("--epsilon", type=float, default=0.25)
    parser.add_argument("--reward-noise", type=float, default=0.06)
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--max-guardrail-breaches", type=int, default=2)
    parser.add_argument("--min-baseline-fraction", type=float, default=0.2)
    parser.add_argument("--max-variant-fraction", type=float, default=0.5)
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Where to persist the simulation report (defaults to experiments/rl/shadow_mode.json).",
    )
    parser.add_argument(
        "--print-summary",
        action="store_true",
        help="Emit a JSON summary of the safety metrics to stdout.",
    )
    args = parser.parse_args(argv)

    payload = run_shadow_simulation(
        episodes=args.episodes,
        epsilon=args.epsilon,
        reward_noise=args.reward_noise,
        seed=args.seed,
        max_guardrail_breaches=args.max_guardrail_breaches,
        min_baseline_fraction=args.min_baseline_fraction,
        max_variant_fraction=args.max_variant_fraction,
        output_path=str(args.output) if args.output else None,
    )

    errors = _validate_payload(payload)
    if errors:
        for error in errors:
            print(f"[FAIL] {error}", file=sys.stderr)
        return 1

    destination = Path(args.output) if args.output else DEFAULT_OUTPUT
    message = f"RL shadow validation passed; report saved to {destination}"
    print(message, file=sys.stderr)

    if args.print_summary:
        print(_format_summary(payload))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
