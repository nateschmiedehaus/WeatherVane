"""Prefect flow generating causal uplift reports."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import polars as pl
from prefect import flow, get_run_logger

from apps.model.causal_uplift import (
    compute_synthetic_report,
    fit_causal_uplift,
    generate_synthetic_dataset,
    save_report_as_json,
    validate_incremental_lift,
)

DEFAULT_OUTPUT = Path("experiments/causal/uplift_report.json")


def _load_dataset(dataset_path: Optional[str]) -> pl.DataFrame:
    if not dataset_path:
        return generate_synthetic_dataset()

    path = Path(dataset_path)
    if not path.exists():
        raise FileNotFoundError(f"Dataset path {dataset_path!r} does not exist")

    if path.suffix == ".parquet":
        return pl.read_parquet(path)
    if path.suffix == ".csv":
        return pl.read_csv(path)
    raise ValueError(f"Unsupported dataset format: {path.suffix}")


def _ensure_numeric_treatment(frame: pl.DataFrame, treatment_column: str) -> pl.DataFrame:
    if frame.get_column(treatment_column).dtype.is_numeric():
        return frame
    categories = frame.get_column(treatment_column).cast(pl.Utf8).unique().to_list()
    if len(categories) != 2:
        raise ValueError("Treatment column must be binary")
    mapping = {categories[0]: 0, categories[1]: 1}
    return frame.with_columns(
        pl.col(treatment_column).cast(pl.Utf8).replace(mapping).cast(pl.Int8).alias(treatment_column)
    )


@flow(name="weathervane-causal-uplift")
def orchestrate_causal_uplift_flow(
    dataset_path: str | None = None,
    treatment_column: str = "treatment",
    target_column: str = "net_revenue",
    output_path: str | None = None,
) -> dict[str, object]:
    """Train uplift model and persist validation report."""

    logger = get_run_logger()
    frame = _load_dataset(dataset_path)
    if treatment_column not in frame.columns or target_column not in frame.columns:
        raise ValueError("Dataset must contain treatment and target columns")

    frame = _ensure_numeric_treatment(frame, treatment_column)

    model = fit_causal_uplift(
        frame,
        treatment_column=treatment_column,
        target_column=target_column,
    )
    report = validate_incremental_lift(model, frame)

    destination = Path(output_path) if output_path else DEFAULT_OUTPUT
    save_report_as_json(report, str(destination))
    logger.info("Saved uplift report to %s", destination)
    return report.to_dict()


def run_synthetic_uplift() -> dict[str, object]:
    """Helper for CLI usage; generates the synthetic report and saves it."""

    report = compute_synthetic_report()
    save_report_as_json(report, str(DEFAULT_OUTPUT))
    return report.to_dict()
