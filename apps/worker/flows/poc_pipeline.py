from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from prefect import flow, get_run_logger, task

from apps.worker.ingestion import ShopifyIngestor, IngestionSummary
from apps.worker.ingestion.ads import build_ads_ingestor_from_env
from apps.worker.ingestion.promo import build_promo_ingestor_from_env
from shared.feature_store.weather_cache import WeatherCache, WeatherFetchResult
from shared.feature_store.feature_builder import FeatureBuilder
from apps.model.pipelines.poc_models import train_poc_models
from shared.libs.connectors import ShopifyConfig, ShopifyConnector
from shared.libs.storage.lake import LakeWriter

DEFAULT_LOOKBACK_DAYS = 365
DEFAULT_COORDINATES = [(37.7749, -122.4194)]  # TODO: derive from tenant shipping history


@dataclass
class TenantContext:
    tenant_id: str
    start_date: datetime
    end_date: datetime


@task(name="Fetch Shopify data")
async def fetch_shopify_data(context: TenantContext, lake_root: str = "storage/lake/raw") -> Dict[str, Any]:
    """Fetch Shopify orders/products when credentials exist, fallback to synthetic snapshot otherwise."""

    logger = get_run_logger()
    logger.info(
        "Fetching Shopify data for tenant %s between %s and %s",
        context.tenant_id,
        context.start_date.isoformat(),
        context.end_date.isoformat(),
    )

    shop_domain = os.getenv("SHOPIFY_SHOP_DOMAIN")
    access_token = os.getenv("SHOPIFY_ACCESS_TOKEN")
    api_version = os.getenv("SHOPIFY_API_VERSION", "2024-04")

    writer = LakeWriter(root=lake_root)

    if shop_domain and access_token:
        config = ShopifyConfig(shop_domain=shop_domain, access_token=access_token, api_version=api_version)
        ingestor = ShopifyIngestor(connector=ShopifyConnector(config), writer=writer)
        orders_result = await ingestor.ingest_orders(context.tenant_id, context.start_date, context.end_date)
        products_result = await ingestor.ingest_products(context.tenant_id)
        return {
            "orders_path": orders_result["path"],
            "products_path": products_result["path"],
            "summary": {"orders": orders_result["count"], "products": products_result["count"]},
            "source": "shopify_api",
        }

    # Synthetic fallback for dev environments
    sample_orders = [
        {
            "tenant_id": context.tenant_id,
            "order_id": "sample-order",
            "order_date": context.start_date.isoformat(),
            "net_revenue": 0.0,
        }
    ]
    orders_summary = IngestionSummary(
        path=str(writer.write_records(f"{context.tenant_id}_shopify_orders", sample_orders)),
        row_count=len(sample_orders),
        source="stub",
    )

    sample_products = [
        {
            "tenant_id": context.tenant_id,
            "product_id": "sample-product",
            "title": "Rain Jacket",
            "category": "Outerwear",
        }
    ]
    products_summary = IngestionSummary(
        path=str(writer.write_records(f"{context.tenant_id}_shopify_products", sample_products)),
        row_count=len(sample_products),
        source="stub",
    )

    return {
        "orders_path": orders_summary.path,
        "products_path": products_summary.path,
        "summary": {"orders": orders_summary.row_count, "products": products_summary.row_count},
        "source": "stub",
    }


@task(name="Fetch ads data")
async def fetch_ads_data(context: TenantContext, lake_root: str = "storage/lake/raw") -> Dict[str, Any]:
    logger = get_run_logger()
    logger.info("Fetching Meta/Google ads data for tenant %s", context.tenant_id)

    ingestor = build_ads_ingestor_from_env(lake_root)
    meta_summary = await ingestor.ingest_meta(context.tenant_id, context.start_date, context.end_date) if ingestor.meta_connector else None
    google_summary = await ingestor.ingest_google(context.tenant_id, context.start_date, context.end_date) if ingestor.google_connector else None

    if meta_summary or google_summary:
        return {
            "meta_path": meta_summary.path if meta_summary else None,
            "google_path": google_summary.path if google_summary else None,
            "summary": {
                "meta_rows": meta_summary.row_count if meta_summary else 0,
                "google_rows": google_summary.row_count if google_summary else 0,
            },
            "source": "ads_api",
        }

    writer = LakeWriter(root=lake_root)
    sample_meta = [
        {
            "tenant_id": context.tenant_id,
            "date": context.start_date.isoformat(),
            "channel": "meta",
            "spend": 0.0,
            "conversions": 0,
        }
    ]
    meta_path = writer.write_records(f"{context.tenant_id}_meta_ads", sample_meta)

    sample_google = [
        {
            "tenant_id": context.tenant_id,
            "date": context.start_date.isoformat(),
            "channel": "google",
            "spend": 0.0,
            "conversions": 0,
        }
    ]
    google_path = writer.write_records(f"{context.tenant_id}_google_ads", sample_google)

    return {
        "meta_path": str(meta_path),
        "google_path": str(google_path),
        "summary": {"meta_rows": len(sample_meta), "google_rows": len(sample_google)},
        "source": "stub",
    }


@task(name="Fetch promo data")
async def fetch_promo_data(context: TenantContext, lake_root: str = "storage/lake/raw") -> Dict[str, Any]:
    logger = get_run_logger()
    logger.info("Fetching Klaviyo promo data for tenant %s", context.tenant_id)

    ingestor = build_promo_ingestor_from_env(lake_root)
    summary = await ingestor.ingest_campaigns(context.tenant_id, context.start_date, context.end_date) if ingestor.connector else None

    if summary:
        return {
            "promo_path": summary.path,
            "summary": {"campaigns": summary.row_count},
            "source": "klaviyo_api",
        }

    writer = LakeWriter(root=lake_root)
    sample_promos = [
        {
            "tenant_id": context.tenant_id,
            "campaign_id": "sample-campaign",
            "send_date": context.start_date.isoformat(),
            "discount_pct": 0.0,
        }
    ]
    promo_path = writer.write_records(f"{context.tenant_id}_promos", sample_promos)

    return {
        "promo_path": str(promo_path),
        "summary": {"campaigns": len(sample_promos)},
        "source": "stub",
    }


@task(name="Fetch weather data")
async def fetch_weather_data(
    context: TenantContext,
    cache_root: str = "storage/lake/weather",
    lake_root: str = "storage/lake/raw",
) -> Dict[str, Any]:
    logger = get_run_logger()
    logger.info("Fetching weather anomalies for tenant %s", context.tenant_id)

    cache = WeatherCache(root=cache_root)
    results: list[WeatherFetchResult] = []
    start_date = context.start_date.date()
    end_date = context.end_date.date()

    for lat, lon in DEFAULT_COORDINATES:
        result = await cache.ensure_range(lat=lat, lon=lon, start=start_date, end=end_date)
        results.append(result)

    writer = LakeWriter(root=lake_root)
    rows = [
        {
            "tenant_id": context.tenant_id,
            "cell": result.cell,
            "start": result.start.isoformat(),
            "end": result.end.isoformat(),
            "source": result.source,
        }
        for result in results
    ]
    path = writer.write_records(f"{context.tenant_id}_weather_cells", rows)

    return {
        "weather_path": str(path),
        "cells": rows,
    }


@task(name="Build feature matrix")
async def build_feature_matrix(
    shopify_payload: Dict[str, Any],
    ads_payload: Dict[str, Any],
    promo_payload: Dict[str, Any],
    weather_payload: Dict[str, Any],
    context: TenantContext,
    lake_root: str = "storage/lake/raw",
) -> Dict[str, Any]:
    logger = get_run_logger()
    logger.info("Building feature matrix for tenant %s", context.tenant_id)
    builder = FeatureBuilder(lake_root=lake_root)
    matrix = builder.build(context.tenant_id, context.start_date, context.end_date)

    return {
        "design_matrix": matrix.frame.to_dict(as_series=False),
        "metadata": {
            "start": context.start_date.isoformat(),
            "end": context.end_date.isoformat(),
            "orders_rows": matrix.orders_rows,
            "ads_rows": matrix.ads_rows,
            "promo_rows": matrix.promo_rows,
            "weather_rows": matrix.weather_rows,
            "shopify_summary": shopify_payload.get("summary", {}),
            "ads_summary": ads_payload.get("summary", {}),
            "promo_summary": promo_payload.get("summary", {}),
            "weather_cells": weather_payload.get("cells", []),
        },
    }


@task(name="Fit models")
async def fit_models(feature_payload: Dict[str, Any], context: TenantContext) -> Dict[str, Any]:
    logger = get_run_logger()
    logger.info("Fitting baseline + MMM models for tenant %s", context.tenant_id)

    matrix_dict = feature_payload.get("design_matrix") or {}
    bundle = train_poc_models(matrix_dict)

    return {
        "models": {
            "baseline": {
                "coefficients": bundle.baseline.coefficients,
                "intercept": bundle.baseline.intercept,
                "features": bundle.baseline.features,
            },
            "mmm": {
                "base_roas": bundle.mmm.base_roas,
                "elasticity": bundle.mmm.elasticity,
                "features": bundle.mmm.features,
            },
        },
        "metrics": bundle.diagnostics,
        "quantiles": bundle.quantiles,
    }


@task(name="Simulate counterfactuals")
async def simulate_counterfactuals(model_payload: Dict[str, Any], context: TenantContext) -> Dict[str, Any]:
    logger = get_run_logger()
    logger.info("Simulating counterfactual allocations for tenant %s", context.tenant_id)
    return {"simulations": []}


@task(name="Allocate budgets")
async def allocate_budget(simulation_payload: Dict[str, Any], context: TenantContext) -> Dict[str, Any]:
    logger = get_run_logger()
    logger.info("Optimising budget allocation for tenant %s", context.tenant_id)
    return {"plan": [], "guardrails": {}}


@task(name="Generate PoC report")
async def generate_poc_report(plan_payload: Dict[str, Any], context: TenantContext) -> Dict[str, Any]:
    logger = get_run_logger()
    logger.info("Rendering PoC report for tenant %s", context.tenant_id)
    return {"report_path": f"poc_reports/{context.tenant_id}/latest"}


@flow(name="weathervane-poc-pipeline")
async def orchestrate_poc_flow(
    tenant_id: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Run the end-to-end Plan & Proof pipeline for a tenant in read-only mode."""

    if end_date is None:
        end_date = datetime.utcnow()
    if start_date is None:
        start_date = end_date - timedelta(days=DEFAULT_LOOKBACK_DAYS)

    context = TenantContext(tenant_id=tenant_id, start_date=start_date, end_date=end_date)

    lake_root = os.getenv("STORAGE_LAKE_ROOT", "storage/lake/raw")
    weather_root = os.getenv("STORAGE_WEATHER_ROOT", "storage/lake/weather")

    shopify_payload = await fetch_shopify_data(context, lake_root=lake_root)
    ads_payload = await fetch_ads_data(context, lake_root=lake_root)
    promo_payload = await fetch_promo_data(context, lake_root=lake_root)
    weather_payload = await fetch_weather_data(context, cache_root=weather_root, lake_root=lake_root)
    features = await build_feature_matrix(shopify_payload, ads_payload, promo_payload, weather_payload, context, lake_root=lake_root)
    models = await fit_models(features, context)
    simulations = await simulate_counterfactuals(models, context)
    plan = await allocate_budget(simulations, context)
    report = await generate_poc_report(plan, context)

    return {
        "context": context,
        "plan": plan,
        "report": report,
    }
