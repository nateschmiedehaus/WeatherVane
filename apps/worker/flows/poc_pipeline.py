from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from prefect import flow, get_run_logger, task

import polars as pl

import geohash2  # type: ignore
import numpy as np

from apps.allocator.heuristics import AllocationInput, Guardrails, allocate
from apps.worker.ingestion import ShopifyIngestor, IngestionSummary
from apps.worker.ingestion.ads import build_ads_ingestor_from_env
from apps.worker.ingestion.promo import build_promo_ingestor_from_env
from shared.feature_store.weather_cache import WeatherCache, make_geocell
from shared.feature_store.feature_builder import FeatureBuilder, FeatureLeakageError
from apps.model.ensemble import (
    run_multi_horizon_ensemble,
    save_ensemble_metrics_as_json,
)
from apps.model.pipelines.poc_models import train_poc_models
from shared.libs.connectors import ShopifyConfig, ShopifyConnector
from shared.libs.storage.lake import LakeWriter, read_parquet
from apps.worker.validation.geocoding import evaluate_geocoding_coverage
from shared.validation.schemas import validate_plan_slices
from shared.schemas.base import ConfidenceLevel
from shared.data_context import default_context_service
from apps.validation.incrementality import GeoHoldoutConfig, design_holdout_from_orders

DEFAULT_LOOKBACK_DAYS = 365
FALLBACK_COORDINATES = [(37.7749, -122.4194)]
COORDINATE_LIMIT = 8
FORECAST_HORIZON_DAYS = 7


def _derive_weather_source(weather_payload: Dict[str, Any]) -> str:
    sources = weather_payload.get("sources", {}) if isinstance(weather_payload, dict) else {}
    if sources and all(source == "stub" for source in sources.values()):
        return "stub"
    if sources and any(source == "stub" for source in sources.values()):
        return "mixed"
    if sources:
        return "live"
    return "unknown"


@dataclass
class TenantContext:
    tenant_id: str
    start_date: datetime
    end_date: datetime


def _decode_geohash(cell: str) -> tuple[float, float] | None:
    if not cell:
        return None
    try:
        lat, lon, *_ = geohash2.decode_exactly(cell)
        return float(lat), float(lon)
    except Exception:
        return None


def _coordinates_from_orders(shopify_payload: Dict[str, Any] | None) -> list[tuple[float, float]]:
    if not shopify_payload:
        return []

    orders_path = shopify_payload.get("orders_path")
    if not orders_path:
        return []

    path = Path(orders_path)
    if not path.exists():
        return []

    frame = read_parquet(path)
    if frame.is_empty():
        return []

    coords: list[tuple[float, float]] = []
    if {"ship_latitude", "ship_longitude"}.issubset(frame.columns):
        coord_frame = (
            frame.select(["ship_latitude", "ship_longitude"])
            .drop_nulls()
            .unique()
            .head(COORDINATE_LIMIT)
        )
        coords.extend((float(lat), float(lon)) for lat, lon in coord_frame.iter_rows())

    if len(coords) < COORDINATE_LIMIT and "ship_geohash" in frame.columns:
        geos_needed = COORDINATE_LIMIT - len(coords)
        geos = (
            frame.select("ship_geohash")
            .drop_nulls()
            .unique()
            .head(geos_needed)
            .get_column("ship_geohash")
            .to_list()
        )
        for cell in geos:
            decoded = _decode_geohash(cell)
            if decoded:
                coords.append(decoded)
                if len(coords) >= COORDINATE_LIMIT:
                    break

    unique_coords: list[tuple[float, float]] = []
    seen: set[tuple[float, float]] = set()
    for lat, lon in coords:
        key = (round(lat, 4), round(lon, 4))
        if key in seen:
            continue
        seen.add(key)
        unique_coords.append((lat, lon))

    return unique_coords


def _confidence_from_metrics(metrics: Dict[str, Any]) -> ConfidenceLevel:
    holdout_r2 = float(metrics.get("holdout_r2") or 0.0)
    cv_score = float(metrics.get("cv_mean") or 0.0)
    row_count = float(metrics.get("row_count") or 0.0)
    mae = float(metrics.get("mae") or 0.0)
    rmse = float(metrics.get("rmse") or 0.0)

    if row_count >= 365 and holdout_r2 >= 0.6 and cv_score >= 0.2 and rmse <= max(0.4 * mae, mae + 1e-6):
        return ConfidenceLevel.HIGH
    if row_count >= 120 and holdout_r2 >= 0.25 and cv_score >= 0.05:
        return ConfidenceLevel.MEDIUM
    return ConfidenceLevel.LOW


def _risk_from_metrics(metrics: Dict[str, Any]) -> float:
    """Approximate risk-aversion weight from model diagnostics."""

    holdout_r2 = float(metrics.get("holdout_r2") or 0.0)
    if holdout_r2 >= 0.6:
        return 0.15
    if holdout_r2 >= 0.3:
        return 0.25
    if holdout_r2 <= 0.05:
        return 0.5
    return 0.35


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
            "orders_path": orders_result.path,
            "products_path": products_result.path,
            "summary": {
                "orders": orders_result.row_count,
                "products": products_result.row_count,
                "orders_geocoded_ratio": orders_result.metadata.get("geocoded_ratio"),
            },
            "source": "shopify_api",
        }

    # Synthetic fallback for dev environments
    sample_orders = [
        {
            "tenant_id": context.tenant_id,
            "order_id": "sample-order",
            "created_at": f"{context.start_date.isoformat()}T00:00:00Z",
            "ship_geohash": geohash2.encode(FALLBACK_COORDINATES[0][0], FALLBACK_COORDINATES[0][1], 5),
            "ship_latitude": FALLBACK_COORDINATES[0][0],
            "ship_longitude": FALLBACK_COORDINATES[0][1],
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
        "summary": {
            "orders": orders_summary.row_count,
            "products": products_summary.row_count,
            "orders_geocoded_ratio": orders_summary.metadata.get("geocoded_ratio"),
        },
        "source": "stub",
    }


@task(name="Design geo incrementality experiment")
async def design_geo_incrementality_experiment(
    shopify_payload: Dict[str, Any],
    context: TenantContext,
    holdout_ratio: float = 0.25,
) -> Dict[str, Any]:
    logger = get_run_logger()
    orders_path = (shopify_payload or {}).get("orders_path")
    if not orders_path:
        logger.info("Skipping incrementality design for %s: no orders data", context.tenant_id)
        return {"status": "missing_orders"}

    path = Path(orders_path)
    if not path.exists():
        logger.info("Skipping incrementality design for %s: path %s not found", context.tenant_id, path)
        return {"status": "missing_orders"}

    orders = read_parquet(path)
    config = GeoHoldoutConfig(
        holdout_ratio=holdout_ratio,
        min_holdout_units=4,
        seed=int(context.end_date.strftime("%Y%m%d")),
    )
    design = design_holdout_from_orders(orders, config)
    design["tenant_id"] = context.tenant_id
    design["lookback_days"] = (context.end_date - context.start_date).days
    return design


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
    shopify_payload: Dict[str, Any] | None = None,
    cache_root: str = "storage/lake/weather",
    lake_root: str = "storage/lake/raw",
) -> Dict[str, Any]:
    logger = get_run_logger()
    logger.info("Fetching weather anomalies for tenant %s", context.tenant_id)

    coordinates = _coordinates_from_orders(shopify_payload)
    if not coordinates:
        logger.warning(
            "No geocoded orders found for tenant %s; falling back to defaults",
            context.tenant_id,
        )
        coordinates = FALLBACK_COORDINATES
    else:
        logger.info("Derived %d geocells from orders", len(coordinates))

    cache = WeatherCache(root=cache_root)
    start_date = context.start_date.date()
    end_date = context.end_date.date()
    target_end_date = end_date + timedelta(days=FORECAST_HORIZON_DAYS)

    rows: list[dict[str, Any]] = []
    sources: dict[str, Any] = {}
    for lat, lon in coordinates:
        try:
            result = await cache.ensure_range(
                lat=lat,
                lon=lon,
                start=start_date,
                end=target_end_date,
            )
            observed_rows = int(
                result.frame.filter(pl.col("observation_type") == "observed").height
            )
            forecast_rows = int(result.frame.height - observed_rows)
            sources[result.cell] = {
                "source": result.source,
                "observed_rows": observed_rows,
                "forecast_rows": forecast_rows,
                "timezone": result.timezone,
            }
            rows.extend(result.frame.to_dicts())
        except Exception as exc:  # pragma: no cover - network or connector failures
            logger.warning(
                "Weather fetch failed for (%s, %s): %s; using synthetic fallback",
                lat,
                lon,
                exc,
            )
            cell = make_geocell(lat, lon)
            sources[cell] = {
                "source": "stub",
                "observed_rows": 0,
                "forecast_rows": 0,
                "timezone": "UTC",
            }
            days = (target_end_date - start_date).days + 1
            for offset in range(max(days, 1)):
                current = start_date + timedelta(days=offset)
                rows.append(
                    {
                        "date": current.isoformat(),
                        "local_date": current.isoformat(),
                        "local_datetime": f"{current.isoformat()}T00:00:00+00:00",
                        "utc_datetime": f"{current.isoformat()}T00:00:00+00:00",
                        "timezone": "UTC",
                        "geohash": cell,
                        "day_of_year": current.timetuple().tm_yday,
                        "temp_c": 15.0,
                        "temp_max_c": 16.0,
                        "temp_min_c": 14.0,
                        "apparent_temp_c": 15.0,
                        "precip_mm": 0.5,
                        "precip_probability": 0.2,
                        "humidity_mean": 0.5,
                        "windspeed_max": 10.0,
                        "uv_index_max": 3.0,
                        "snowfall_mm": 0.0,
                        "temp_anomaly": 0.0,
                        "precip_anomaly": 0.0,
                        "temp_roll7": 15.0,
                        "precip_roll7": 0.5,
                        "temp_c_lag1": None,
                        "precip_mm_lag1": None,
                        "uv_index_lag1": None,
                        "precip_probability_lag1": None,
                        "humidity_lag1": None,
                        "freeze_flag": 0,
                        "heatwave_flag": 0,
                        "snow_event_flag": 0,
                        "high_wind_flag": 0,
                        "uv_alert_flag": 0,
                        "high_precip_prob_flag": 0,
                        "observation_type": "observed" if current <= end_date else "forecast",
                        "as_of_utc": datetime.utcnow().replace(tzinfo=timezone.utc).isoformat(),
                    }
                )

    if rows:
        df = pl.DataFrame(rows).unique(subset=["date", "geohash", "observation_type"])
        df = df.sort(["date", "geohash", "observation_type"])
        rows = df.to_dicts()

    writer = LakeWriter(root=lake_root)
    path = writer.write_records(f"{context.tenant_id}_weather_daily", rows)
    return {
        "weather_path": str(path),
        "rows": rows,
        "cells": list(sources.keys()),
        "sources": sources,
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
    guardrail_status = "clean"
    guardrail_notes: Dict[str, Any] = {}
    try:
        matrix = builder.build(context.tenant_id, context.start_date, context.end_date)
    except FeatureLeakageError as exc:
        guardrail_status = "sanitized"
        guardrail_notes = {
            "message": str(exc),
            "removed_rows": exc.leakage_rows,
            "remediation": "dropped_leakage_rows",
            "forward_trigger_dates": exc.forward_dates,
            "forecast_trigger_dates": exc.forecast_dates,
        }
        matrix = exc.matrix
        if matrix is None:
            raise
        logger.warning(
            "Feature leakage guardrail triggered for tenant %s; sanitized %d rows",
            context.tenant_id,
            exc.leakage_rows,
        )

    # Record dataset profiles for downstream context tagging.
    default_context_service.reset(context.tenant_id)
    for profile in matrix.profiles.values():
        default_context_service.record_profile(context.tenant_id, profile)

    return {
        "design_matrix": matrix.frame.to_dict(as_series=False),
        "observed_design_matrix": matrix.observed_frame.to_dict(as_series=False),
        "metadata": {
            "start": context.start_date.isoformat(),
            "end": context.end_date.isoformat(),
            "orders_rows": matrix.orders_rows,
            "ads_rows": matrix.ads_rows,
            "promo_rows": matrix.promo_rows,
            "weather_rows": matrix.weather_rows,
            "observed_rows": matrix.observed_rows,
            "latest_observed_target_date": matrix.latest_observed_date,
            "leakage_guardrail": {
                "target_available_column": "target_available",
                "observed_rows": matrix.observed_rows,
                "total_rows": int(matrix.frame.height),
                "leakage_risk_rows": matrix.leakage_risk_rows,
                "leakage_risk_dates": matrix.leakage_risk_dates,
                "forward_leakage_rows": matrix.forward_leakage_rows,
                "forward_leakage_dates": matrix.forward_leakage_dates,
                "forecast_leakage_rows": matrix.forecast_leakage_rows,
                "forecast_leakage_dates": matrix.forecast_leakage_dates,
                "passes": matrix.leakage_risk_rows == 0,
                "status": guardrail_status,
                **guardrail_notes,
            },
            "shopify_summary": shopify_payload.get("summary", {}),
            "ads_summary": ads_payload.get("summary", {}),
            "promo_summary": promo_payload.get("summary", {}),
            "weather_row_count": len(weather_payload.get("rows", [])),
        },
    }


@task(name="Fit models")
async def fit_models(feature_payload: Dict[str, Any], context: TenantContext) -> Dict[str, Any]:
    logger = get_run_logger()
    logger.info("Fitting baseline + MMM models for tenant %s", context.tenant_id)

    observed_matrix_dict = feature_payload.get("observed_design_matrix")
    matrix_dict = observed_matrix_dict if observed_matrix_dict is not None else (feature_payload.get("design_matrix") or {})
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
                "mean_roas": bundle.mmm.mean_roas,
                "mean_spend": bundle.mmm.mean_spend,
                "features": bundle.mmm.features,
            },
            "timeseries": {
                "features": bundle.timeseries.features if bundle.timeseries else [],
                "target": bundle.timeseries.target if bundle.timeseries else "net_revenue",
                "holdout_r2": bundle.timeseries.holdout_r2 if bundle.timeseries else 0.0,
                "cv_scores": bundle.timeseries.cv_scores if bundle.timeseries else [],
            },
        },
        "metrics": bundle.diagnostics,
        "quantiles": bundle.quantiles,
    }


@task(name="Simulate counterfactuals")
async def simulate_counterfactuals(
    model_payload: Dict[str, Any], feature_payload: Dict[str, Any], context: TenantContext
) -> Dict[str, Any]:
    logger = get_run_logger()
    logger.info("Simulating counterfactual allocations for tenant %s", context.tenant_id)

    frame_dict = feature_payload.get("design_matrix") or {}
    frame = pl.DataFrame(frame_dict)
    if frame.is_empty():
        return {"cells": [], "total_budget": 0.0, "status": "DEGRADED"}

    latest = frame.tail(1)
    spend_cols = [col for col in frame.columns if col.endswith("_spend")]
    current_spend = {col.replace("_spend", ""): float(latest[0, col]) for col in spend_cols}
    total_budget = sum(current_spend.values())

    mmm_payload = model_payload.get("models", {}).get("mmm", {})
    mean_roas_lookup = mmm_payload.get("mean_roas", {}) or {}
    mean_spend_lookup = mmm_payload.get("mean_spend", {}) or {}
    elasticity_lookup = mmm_payload.get("elasticity", {}) or {}
    base_roas = float(mmm_payload.get("base_roas", 1.0))

    guardrails = Guardrails(
        min_spend=0.0,
        max_spend=max(current_spend.values() or [0.0]) * 1.5 + 1e-6,
        roas_floor=0.5,
        learning_cap=0.25,
    )

    if guardrails.max_spend < guardrails.min_spend:
        guardrails.max_spend = guardrails.min_spend

    def _roas_for(cell: str, spend: float) -> float:
        feature = f"{cell}_spend"
        base = float(mean_roas_lookup.get(feature, base_roas))
        mean_spend_val = float(mean_spend_lookup.get(feature, current_spend.get(cell, 0.0) or guardrails.min_spend or 1.0))
        elasticity = float(elasticity_lookup.get(feature, 0.0))
        if mean_spend_val <= 0:
            return max(base, 0.0)
        ratio = (spend - mean_spend_val) / max(mean_spend_val, 1e-6)
        roas = base + elasticity * ratio
        if not np.isfinite(roas):  # type: ignore[attr-defined]
            roas = base
        return max(roas, 0.0)

    roi_curves: Dict[str, List[Dict[str, float]]] = {}
    expected_roas: Dict[str, float] = {}

    for cell, spend in current_spend.items():
        candidates = {
            0.0,
            guardrails.min_spend,
            guardrails.max_spend,
            spend,
            spend * 0.5,
            spend * 0.75,
            spend * 1.25,
            spend * 1.5,
        }
        sanitized: List[float] = []
        for value in candidates:
            if value < 0:
                continue
            capped = min(max(value, guardrails.min_spend), guardrails.max_spend)
            sanitized.append(round(capped, 6))
        sanitized = sorted(set(sanitized))
        if not sanitized or sanitized[0] > 0.0:
            sanitized.insert(0, 0.0)

        curve_points: List[Dict[str, float]] = []
        for candidate in sanitized:
            roas = _roas_for(cell, candidate)
            curve_points.append({
                "spend": candidate,
                "roas": roas,
                "revenue": roas * candidate,
            })
        roi_curves[cell] = curve_points

        baseline_spend = spend if spend > 0 else max(guardrails.min_spend, 1.0)
        expected_roas[cell] = max(_roas_for(cell, baseline_spend), 0.1)

    return {
        "cells": list(current_spend.keys()),
        "total_budget": total_budget,
        "current_spend": current_spend,
        "expected_roas": expected_roas,
        "guardrails": guardrails,
        "metrics": model_payload.get("metrics", {}),
        "roi_curves": roi_curves,
    }


@task(name="Allocate budgets")
async def allocate_budget(
    model_payload: Dict[str, Any],
    simulation_payload: Dict[str, Any],
    context: TenantContext,
    context_tags: Optional[List[str]] = None,
) -> Dict[str, Any]:
    logger = get_run_logger()
    logger.info("Optimising budget allocation for tenant %s", context.tenant_id)

    cells = simulation_payload.get("cells", [])
    if not cells:
        return {"plan": [], "guardrails": {}, "status": "DEGRADED"}

    quantiles = model_payload.get("quantiles", {}).get("expected_revenue", {}) or {}
    metrics = model_payload.get("metrics", {})
    allocation = allocate(
        AllocationInput(
            cells=cells,
            total_budget=float(simulation_payload.get("total_budget", 0.0)),
            current_spend=simulation_payload.get("current_spend", {}),
            expected_roas=simulation_payload.get("expected_roas", {}),
            roi_curves=simulation_payload.get("roi_curves", {}),
            guardrails=simulation_payload.get("guardrails"),
            context_tags=context_tags or [],
            quantile_factors=quantiles,
            risk_aversion=_risk_from_metrics(metrics),
        )
    )
    confidence = _confidence_from_metrics(metrics)
    confidence_value = confidence.value

    roi_curves = simulation_payload.get("roi_curves", {})
    expected_roas_lookup = simulation_payload.get("expected_roas", {})

    def _interp(points: List[Dict[str, float]], spend: float, key: str) -> float:
        sorted_points = sorted(points, key=lambda entry: entry.get("spend", 0.0))
        if not sorted_points:
            return 0.0
        if spend <= sorted_points[0]["spend"]:
            first = sorted_points[0]
            if len(sorted_points) == 1:
                return float(first.get(key, 0.0))
            second = sorted_points[1]
            span = second["spend"] - first["spend"]
            if span == 0:
                return float(first.get(key, 0.0))
            weight = (spend - first["spend"]) / span
            return float(first.get(key, 0.0) + weight * (second.get(key, 0.0) - first.get(key, 0.0)))

        for idx in range(1, len(sorted_points)):
            prev = sorted_points[idx - 1]
            curr = sorted_points[idx]
            if spend <= curr["spend"]:
                span = curr["spend"] - prev["spend"]
                if span == 0:
                    return float(curr.get(key, prev.get(key, 0.0)))
                weight = (spend - prev["spend"]) / span
                return float(prev.get(key, 0.0) + weight * (curr.get(key, 0.0) - prev.get(key, 0.0)))

        last = sorted_points[-1]
        if len(sorted_points) == 1:
            return float(last.get(key, 0.0))
        prev = sorted_points[-2]
        span = last["spend"] - prev["spend"]
        slope = (last.get(key, 0.0) - prev.get(key, 0.0)) / span if span else 0.0
        return float(last.get(key, 0.0) + slope * (spend - last["spend"]))

    def _revenue_from_curve(cell: str, spend: float) -> float:
        points = roi_curves.get(cell)
        if not points:
            return expected_roas_lookup.get(cell, 1.0) * spend
        return _interp(points, spend, "revenue")

    def _roas_from_curve(cell: str, spend: float) -> float:
        points = roi_curves.get(cell)
        if not points:
            return expected_roas_lookup.get(cell, 1.0)
        roas = _interp(points, spend, "roas")
        if spend > 0:
            return max(roas, 0.0)
        return expected_roas_lookup.get(cell, 1.0)

    slices = []
    for cell, spend in allocation.spends.items():
        revenue_mid = _revenue_from_curve(cell, spend)
        p50_factor = quantiles.get("p50") or 1.0
        if p50_factor <= 0:
            p50_factor = 1.0
        scale = revenue_mid / p50_factor if p50_factor else revenue_mid
        revenue_p10 = max(0.0, (quantiles.get("p10") or p50_factor) * scale)
        revenue_p50 = max(0.0, p50_factor * scale)
        revenue_p90 = max(0.0, (quantiles.get("p90") or p50_factor) * scale)
        roas_quantiles = {
            "p10": revenue_p10 / spend if spend else 0.0,
            "p50": revenue_p50 / spend if spend else 0.0,
            "p90": revenue_p90 / spend if spend else 0.0,
        }
        slices.append(
            {
                "cell": cell,
                "recommended_spend": spend,
                "expected_revenue": {
                    "p10": revenue_p10,
                    "p50": revenue_p50,
                    "p90": revenue_p90,
                },
                "expected_roas": roas_quantiles,
                "confidence": confidence_value,
                "assumptions": ["Spend change <=25%", "ROAS floor 0.5"],
                "rationale": {
                    "primary_driver": "Weather & elasticity uplift",
                    "supporting_factors": [f"Holdout R²: {metrics.get('holdout_r2', 0.0):.2f}"],
                    "confidence_level": confidence_value,
                    "data_quality": "FULL" if metrics.get('row_count', 0) > 0 else "DEGRADED",
                    "assumptions": ["Quantile scaling"],
                    "risks": ["Forecast error", "Inventory limits"],
                },
                "status": "FULL" if allocation.diagnostics.get("success") else "DEGRADED",
            }
        )

    validate_plan_slices(slices)
    allocation.diagnostics["confidence"] = confidence_value
    allocation.diagnostics["mae"] = float(metrics.get("mae", 0.0) or 0.0)
    allocation.diagnostics["rmse"] = float(metrics.get("rmse", 0.0) or 0.0)
    allocation.diagnostics["bias"] = float(metrics.get("bias", 0.0) or 0.0)
    allocation.diagnostics["prediction_std"] = float(metrics.get("prediction_std", 0.0) or 0.0)
    allocation.diagnostics["quantile_width"] = float(metrics.get("quantile_width", 0.0) or 0.0)
    return {
        "plan": slices,
        "guardrails": allocation.diagnostics,
        "status": "FULL" if allocation.diagnostics.get("success") else "DEGRADED",
    }


@task(name="Generate ensemble forecast")
async def generate_ensemble_forecast(
    feature_payload: Dict[str, Any],
    weather_payload: Dict[str, Any],
    context: TenantContext,
    *,
    output_path: str = "experiments/forecast/ensemble_metrics.json",
    horizon_days: int = FORECAST_HORIZON_DAYS,
) -> Dict[str, Any]:
    logger = get_run_logger()
    logger.info(
        "Running multi-horizon ensemble forecast for tenant %s with horizon=%d",
        context.tenant_id,
        horizon_days,
    )
    design_matrix = feature_payload.get("design_matrix") or {}
    weather_rows = weather_payload.get("rows") or []
    result = run_multi_horizon_ensemble(
        design_matrix,
        weather_rows,
        horizon_days=horizon_days,
    )
    save_ensemble_metrics_as_json(result, output_path)
    return result.to_dict()


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
    incrementality_design = await design_geo_incrementality_experiment(shopify_payload, context)
    weather_payload = await fetch_weather_data(
        context,
        shopify_payload,
        cache_root=weather_root,
        lake_root=lake_root,
    )
    weather_source = _derive_weather_source(weather_payload)
    features = await build_feature_matrix(shopify_payload, ads_payload, promo_payload, weather_payload, context, lake_root=lake_root)

    tag_metadata = {
        "weather_source": weather_source,
        "dataset_rows": {
            "orders": features.get("metadata", {}).get("orders_rows"),
            "ads": features.get("metadata", {}).get("ads_rows"),
            "promos": features.get("metadata", {}).get("promo_rows"),
            "weather": features.get("metadata", {}).get("weather_row_count"),
        },
        "orders_geocoded_ratio": shopify_payload.get("summary", {}).get("orders_geocoded_ratio"),
        "incrementality_design": incrementality_design,
    }

    context_tags = default_context_service.derive_tags(context.tenant_id, tag_metadata)

    models = await fit_models(features, context)
    simulations = await simulate_counterfactuals(models, features, context)
    plan = await allocate_budget(models, simulations, context, context_tags=context_tags)
    ensemble = await generate_ensemble_forecast(
        features,
        weather_payload,
        context,
        horizon_days=FORECAST_HORIZON_DAYS,
    )
    report = await generate_poc_report(plan, context)

    context_snapshot = default_context_service.snapshot(
        context.tenant_id,
        metadata={
            "window": {
                "start": context.start_date.isoformat(),
                "end": context.end_date.isoformat(),
            },
            **tag_metadata,
        },
    )

    geocoding_validation = evaluate_geocoding_coverage(
        context.tenant_id,
        lake_root=lake_root,
    )

    return {
        "context": context,
        "plan": plan,
        "report": report,
        "data_context": context_snapshot.to_dict(),
        "geocoding_validation": geocoding_validation.to_dict(),
        "shopify_summary": shopify_payload.get("summary", {}),
        "ads_summary": ads_payload.get("summary", {}),
        "promo_summary": promo_payload.get("summary", {}),
        "sources": {
            "shopify": shopify_payload.get("source"),
            "ads": ads_payload.get("source"),
            "promo": promo_payload.get("source"),
            "weather": weather_payload.get("source"),
        },
        "incrementality_design": incrementality_design,
        "forecast_ensemble": ensemble,
    }
