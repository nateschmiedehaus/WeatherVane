"""
Generate a deterministic uplift modelling report for local experimentation.

Usage:
    PYTHONPATH=.deps:. python tools/generate_sample_uplift_report.py
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import polars as pl

from apps.model.uplift import UpliftModelConfig, train_uplift_model, write_uplift_report


def build_synthetic_frame(rows: int = 640, seed: int = 2024) -> pl.DataFrame:
    rng = np.random.default_rng(seed)
    feature_one = rng.normal(0, 1, size=rows)
    feature_two = rng.normal(0, 1, size=rows)
    geo_effect = rng.normal(0, 0.2, size=rows)
    weekday = rng.integers(0, 7, size=rows)
    treatment = rng.binomial(1, 0.5, size=rows)

    base = 95 + feature_one * 4 + feature_two * 2 + weekday * 1.5
    uplift_component = 10 * treatment * (0.5 + 0.4 * feature_one + 0.2 * geo_effect)
    noise = rng.normal(0, 5, size=rows)
    outcome = base + uplift_component + noise

    return pl.DataFrame(
        {
            "feature_one": feature_one,
            "feature_two": feature_two,
            "geo_effect": geo_effect,
            "weekday": weekday,
            "treatment": treatment,
            "net_revenue": outcome,
        }
    )


def main() -> Path:
    frame = build_synthetic_frame()
    config = UpliftModelConfig(test_size=0.3, top_k_percentiles=(0.1, 0.25))
    result = train_uplift_model(frame, config=config)
    output = Path("experiments/causal/uplift_report.json")
    write_uplift_report(result, output)
    return output


if __name__ == "__main__":
    output_path = main()
    print(f"[weathervane] wrote uplift report to {output_path}")

