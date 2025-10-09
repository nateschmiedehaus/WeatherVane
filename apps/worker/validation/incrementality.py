"""Persist incrementality experiment designs and observations."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, Sequence

import polars as pl

from apps.validation.incrementality import (
    GeoHoldoutConfig,
    compute_holdout_summary,
    design_holdout_from_orders,
    estimate_to_payload,
    aggregate_metric,
    summarise_experiment,
)
from shared.libs.storage.state import JsonStateStore

STORE = JsonStateStore(root=Path("storage/metadata/incrementality"))


def design_experiment_from_orders(shopify_payload: Dict[str, object], context) -> Dict[str, object]:
    orders_path = (shopify_payload or {}).get("orders_path")
    if not orders_path:
        return {"status": "missing_orders"}
    path = Path(orders_path)
    if not path.exists():
        return {"status": "missing_orders"}
    orders = pl.read_parquet(path)
    config = GeoHoldoutConfig(
        holdout_ratio=0.25,
        min_holdout_units=4,
        seed=int(context.end_date.strftime("%Y%m%d")),
    )
    design = design_holdout_from_orders(orders, config)
    design["tenant_id"] = context.tenant_id
    design["lookback_days"] = (context.end_date - context.start_date).days
    design["generated_at"] = datetime.utcnow().isoformat()
    return design


def write_experiment_results(tenant_id: str, payload: Dict[str, object]) -> None:
    existing = STORE.load("designs", tenant_id)
    merged = {**existing, **payload}
    STORE.save("designs", tenant_id, merged)


def load_experiment_results(tenant_id: str) -> Dict[str, object]:
    return STORE.load("designs", tenant_id)


def summarise_experiment_from_orders(
    shopify_payload: Dict[str, object],
    design: Dict[str, object],
) -> Optional[Dict[str, object]]:
    if not design or design.get("status") != "ready":
        return None
    orders_path = (shopify_payload or {}).get("orders_path")
    if not orders_path:
        return None
    path = Path(orders_path)
    if not path.exists():
        return None

    orders = pl.read_parquet(path)
    assignment = design.get("assignment") or []
    geo_column = design.get("geo_column")
    if not geo_column:
        return None

    try:
        estimate = compute_holdout_summary(orders, assignment, geo_column=geo_column)
    except ValueError:
        return None

    payload = estimate_to_payload(estimate)
    payload["generated_at"] = datetime.utcnow().isoformat()
    return payload


def record_experiment_observations(
    tenant_id: str,
    observations: Sequence[dict[str, object]] | pl.DataFrame,
    *,
    value_column: str = "revenue",
) -> Dict[str, object]:
    """Persist experiment outcomes and update summary for a tenant."""

    frame = observations if isinstance(observations, pl.DataFrame) else pl.DataFrame(observations)
    if frame.is_empty():
        raise ValueError("Experiment observations are empty")
    if {"geo", "group", value_column} - set(frame.columns):
        missing = {"geo", "group", value_column} - set(frame.columns)
        raise ValueError(f"Observations missing required columns: {sorted(missing)}")

    aggregated = aggregate_metric(frame, value_column=value_column, group_columns=["geo", "group"], agg="sum")
    estimate = summarise_experiment(aggregated, value_column=value_column)

    summary = estimate_to_payload(estimate)
    summary_generated_at = datetime.utcnow().isoformat()
    summary["generated_at"] = summary_generated_at

    aggregated_records = aggregated.to_dicts()

    write_experiment_results(
        tenant_id,
        {
            "summary": summary,
            "aggregated_observations": aggregated_records,
        },
    )

    return {
        "summary": summary,
        "aggregated_observations": aggregated_records,
    }
