"""Generate geo holdout experiments and persist results."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict

from prefect import flow, get_run_logger, task
import polars as pl

from apps.worker.flows.poc_pipeline import TenantContext, fetch_shopify_data
from apps.validation.incrementality import GeoHoldoutConfig, summarise_experiment
from apps.worker.validation.incrementality import (
    design_experiment_from_orders,
    summarise_experiment_from_orders,
    write_experiment_results,
)


@task(name="Load incrementality design")
def load_design(shopify_payload: Dict[str, object], context: TenantContext) -> Dict[str, object]:
    return design_experiment_from_orders(shopify_payload, context)


@task(name="Compute experiment summary")
def compute_summary(assigned: Dict[str, object], observations: pl.DataFrame) -> Dict[str, object]:
    estimate = summarise_experiment(observations, value_column="revenue")
    return {
        "lift": estimate.lift,
        "absolute_lift": estimate.absolute_lift,
        "p_value": estimate.p_value,
        "conf_low": estimate.conf_low,
        "conf_high": estimate.conf_high,
        "treatment_mean": estimate.treatment_mean,
        "control_mean": estimate.control_mean,
        "sample_size_treatment": estimate.sample_size_treatment,
        "sample_size_control": estimate.sample_size_control,
    }


@flow(name="weathervane-incrementality")
async def orchestrate_incrementality_flow(tenant_id: str, start_date: datetime | None = None, end_date: datetime | None = None) -> Dict[str, object]:
    logger = get_run_logger()
    if end_date is None:
        end_date = datetime.utcnow()
    if start_date is None:
        start_date = end_date - timedelta(days=365)

    context = TenantContext(tenant_id=tenant_id, start_date=start_date, end_date=end_date)
    shopify_payload = await fetch_shopify_data(context)
    design = design_experiment_from_orders(shopify_payload, context)
    payload = {
        "design": design,
        "generated_at": datetime.utcnow().isoformat(),
    }
    summary = summarise_experiment_from_orders(shopify_payload, design)
    if summary is not None:
        payload["summary"] = summary

    write_experiment_results(tenant_id, payload)
    logger.info("Stored incrementality design for %s", tenant_id)
    return {"design": design, "summary": summary}
