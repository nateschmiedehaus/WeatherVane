"""Geo holdout experiment integration step for the ingestion pipeline.

This module handles the design and management of geo-based holdout experiments
for measuring incrementality. It integrates with the main ingestion flow to:

1. Analyze order data by geo
2. Design holdout assignments (treatment/control groups)
3. Persist assignments for later analysis
4. Track experiment execution telemetry
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

import polars as pl
from prefect import get_run_logger

from apps.validation.incrementality import (
    GeoHoldoutConfig,
    design_holdout_from_orders,
)
from shared.libs.storage.lake import LakeWriter, read_parquet


def _ensure_output_dirs(base_dir: Path) -> None:
    """Create required output directories."""
    dirs = [
        base_dir / "state/analytics/experiments/geo_holdouts",
        base_dir / "state/telemetry/experiments",
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)


def _read_orders_from_lake(
    lake_root: str,
    tenant_id: str,
    dataset_name: str = "shopify_orders",
) -> Optional[pl.DataFrame]:
    """Read ingested order data from the lake.

    The lake stores data under root/dataset_name/timestamp.parquet,
    so we look for the latest file matching the dataset pattern.
    """
    writer = LakeWriter(root=lake_root)
    dataset_key = f"{tenant_id}_{dataset_name}"
    latest_path = writer.latest(dataset_key)
    if latest_path is None:
        return None
    try:
        return read_parquet(latest_path)
    except Exception as e:
        # If the file can't be read, log and return None
        import sys
        print(f"Failed to read {latest_path}: {e}", file=sys.stderr)
        return None


def compute_geo_holdout(
    orders: pl.DataFrame,
    tenant_id: str,
    holdout_ratio: float = 0.2,
    min_holdout_units: int = 4,
    seed: Optional[int] = None,
) -> Dict[str, Any]:
    """Design a geo holdout experiment from order data.

    Returns a dictionary with:
    - status: "ready" or "insufficient_geo"
    - geo_count: Number of unique geos
    - holdout_count: Number assigned to control
    - control_share: Revenue share of control group
    - assignment: List of {geo, group, weight} dicts
    - geo_column: Name of the column used for geo (e.g., 'ship_geohash')
    """
    config = GeoHoldoutConfig(
        holdout_ratio=holdout_ratio,
        min_holdout_units=min_holdout_units,
        seed=seed,
    )
    return design_holdout_from_orders(orders, config)


def persist_holdout_assignment(
    design: Dict[str, Any],
    tenant_id: str,
    base_dir: str | Path,
    timestamp: Optional[datetime] = None,
) -> Path:
    """Persist holdout assignment to state directory.

    Returns the path where the assignment was saved.
    """
    base_dir = Path(base_dir)
    _ensure_output_dirs(base_dir)

    ts = timestamp or datetime.utcnow()
    filename = f"{tenant_id}_{ts.strftime('%Y%m%d_%H%M%S')}.json"
    output_path = base_dir / "state/analytics/experiments/geo_holdouts" / filename

    payload = {
        "tenant_id": tenant_id,
        "generated_at": ts.isoformat(),
        **design,
    }
    output_path.write_text(json.dumps(payload, indent=2))
    return output_path


def log_experiment_event(
    event: Dict[str, Any],
    tenant_id: str,
    base_dir: str | Path,
) -> None:
    """Log experiment event to telemetry stream."""
    base_dir = Path(base_dir)
    _ensure_output_dirs(base_dir)

    telemetry_path = base_dir / "state/telemetry/experiments/geo_holdout_runs.jsonl"
    event_record = {
        "tenant_id": tenant_id,
        "timestamp": datetime.utcnow().isoformat(),
        **event,
    }
    with open(telemetry_path, "a") as f:
        f.write(json.dumps(event_record) + "\n")


async def run_incrementality_step(
    tenant_id: str,
    lake_root: str,
    base_dir: str | Path,
    holdout_ratio: float = 0.2,
    min_holdout_units: int = 4,
) -> Dict[str, Any]:
    """Execute the geo holdout design step for a tenant.

    This function is designed to be called from the main ingestion flow
    after orders have been ingested.

    Parameters
    ----------
    tenant_id:
        Tenant identifier
    lake_root:
        Root path to the data lake where ingested orders are stored
    base_dir:
        Base directory for persisting outputs (state/telemetry)
    holdout_ratio:
        Proportion of geos to assign to control group
    min_holdout_units:
        Minimum number of geos to assign to control

    Returns
    -------
    A dictionary with:
    - status: success/skip/error
    - design: holdout design (if successful)
    - assignment_path: path to persisted assignment (if successful)
    - reason: explanation if skipped/errored
    """
    logger = get_run_logger()
    base_dir = Path(base_dir)

    try:
        # Read orders from the lake
        orders = _read_orders_from_lake(lake_root, tenant_id)
        if orders is None or orders.is_empty():
            msg = f"No orders found for tenant {tenant_id}; skipping holdout design"
            logger.warning(msg)
            log_experiment_event(
                {"event": "holdout_skipped", "reason": "no_orders"},
                tenant_id,
                base_dir,
            )
            return {
                "status": "skip",
                "reason": "no_orders",
                "tenant_id": tenant_id,
            }

        # Compute holdout design
        design = compute_geo_holdout(
            orders,
            tenant_id,
            holdout_ratio=holdout_ratio,
            min_holdout_units=min_holdout_units,
            seed=42,  # Fixed seed for reproducibility
        )

        if design["status"] == "insufficient_geo":
            msg = f"Tenant {tenant_id} has only {design['geo_count']} geos; skipping holdout"
            logger.warning(msg)
            log_experiment_event(
                {
                    "event": "holdout_insufficient_geo",
                    "geo_count": design["geo_count"],
                },
                tenant_id,
                base_dir,
            )
            return {
                "status": "skip",
                "reason": "insufficient_geo",
                "geo_count": design["geo_count"],
                "tenant_id": tenant_id,
            }

        # Persist assignment
        assignment_path = persist_holdout_assignment(design, tenant_id, base_dir)

        # Log success
        log_experiment_event(
            {
                "event": "holdout_assigned",
                "geo_count": design["geo_count"],
                "holdout_count": design["holdout_count"],
                "control_share": design["control_share"],
                "assignment_path": str(assignment_path),
            },
            tenant_id,
            base_dir,
        )

        logger.info(
            "Geo holdout designed for tenant %s: %d geos, %d in control (%.1f%% revenue)",
            tenant_id,
            design["geo_count"],
            design["holdout_count"],
            design["control_share"] * 100,
        )

        return {
            "status": "success",
            "design": design,
            "assignment_path": str(assignment_path),
            "tenant_id": tenant_id,
        }

    except Exception as exc:
        msg = f"Error computing holdout for tenant {tenant_id}: {exc}"
        logger.exception(msg)
        log_experiment_event(
            {"event": "holdout_error", "error": str(exc)},
            tenant_id,
            base_dir,
        )
        return {
            "status": "error",
            "reason": str(exc),
            "tenant_id": tenant_id,
        }
