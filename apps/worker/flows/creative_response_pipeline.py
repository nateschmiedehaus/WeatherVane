"""Prefect flow producing creative response reports with brand safety guardrails."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import polars as pl
from prefect import flow, get_run_logger

from apps.model.creative_response import (
    BrandSafetyPolicy,
    generate_response_report,
    generate_synthetic_creative_dataset,
)

DEFAULT_OUTPUT = Path("experiments/creative/response_scores.json")


def _load_dataset(dataset_path: Optional[str]) -> pl.DataFrame:
    if not dataset_path:
        return generate_synthetic_creative_dataset()

    path = Path(dataset_path)
    if not path.exists():
        raise FileNotFoundError(f"Dataset path {dataset_path!r} does not exist")

    if path.suffix == ".parquet":
        return pl.read_parquet(path)
    if path.suffix == ".csv":
        return pl.read_csv(path)
    if path.suffix == ".json":
        return pl.read_json(path)

    raise ValueError(f"Unsupported dataset format: {path.suffix}")


@flow(name="weathervane-creative-response")
def orchestrate_creative_response_flow(
    dataset_path: str | None = None,
    output_path: str | None = None,
    roas_floor: float = 1.25,
    warn_threshold: float = 0.6,
    block_threshold: float = 0.3,
    min_impressions: int = 250,
) -> dict[str, object]:
    """Score creatives and persist response report JSON."""

    logger = get_run_logger()
    policy = BrandSafetyPolicy(
        roas_floor=roas_floor,
        warn_threshold=warn_threshold,
        block_threshold=block_threshold,
        min_impressions=min_impressions,
    )
    frame = _load_dataset(dataset_path)
    destination = Path(output_path) if output_path else DEFAULT_OUTPUT
    report = generate_response_report(frame, policy, output_path=destination)
    logger.info("Saved creative response report to %s", destination)
    return report


def run_synthetic_creative_report() -> dict[str, object]:
    """Convenience helper for CLI usage."""

    return orchestrate_creative_response_flow()


__all__ = ["orchestrate_creative_response_flow", "run_synthetic_creative_report"]
