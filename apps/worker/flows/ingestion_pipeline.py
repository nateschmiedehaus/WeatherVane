from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional

import geohash2  # type: ignore
from prefect import flow, get_run_logger

from apps.worker.flows.incrementality_step import run_incrementality_step
from apps.worker.ingestion import BaseIngestor, IngestionSummary
from apps.worker.ingestion.ads import build_ads_ingestor_from_env
from apps.worker.ingestion.promo import build_promo_ingestor_from_env
from apps.worker.ingestion.shopify import build_shopify_ingestor_from_env
from apps.worker.monitoring import update_dq_monitoring
from shared.libs.storage.lake import LakeWriter
from shared.libs.storage.state import JsonStateStore
from shared.validation.schemas import (
    validate_google_ads,
    validate_meta_ads,
    validate_promos,
    validate_shopify_orders,
    validate_shopify_products,
)

DEFAULT_LOOKBACK_DAYS = 30
FALLBACK_COORDINATES = (37.7749, -122.4194)
GEOCODE_RATIO_FLOOR = 0.7


@dataclass
class IngestionContext:
    tenant_id: str
    start_date: datetime
    end_date: datetime


def _resolve_window(
    store: JsonStateStore,
    tenant_id: str,
    start_date: Optional[datetime],
    end_date: Optional[datetime],
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
) -> IngestionContext:
    resolved_end = end_date or datetime.utcnow()
    window_state = store.load("ingestion", f"{tenant_id}_window")
    if start_date:
        resolved_start = start_date
    elif window_state.get("last_end"):
        resolved_start = datetime.fromisoformat(window_state["last_end"])
    else:
        resolved_start = resolved_end - timedelta(days=lookback_days)
    return IngestionContext(tenant_id=tenant_id, start_date=resolved_start, end_date=resolved_end)


def _write_report(report_path: Path, payload: Dict[str, Any]) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(payload, indent=2, sort_keys=True))


def _summary_to_dict(summary: IngestionSummary | None) -> Dict[str, Any]:
    return asdict(summary) if summary else {}


def _evaluate_dataset(name: str, summary: IngestionSummary | None) -> Dict[str, Any]:
    issues: list[str] = []
    status = "ok"
    row_count = 0
    metadata: Dict[str, Any] = {}
    path = None
    source = None

    if summary is None:
        status = "missing"
        issues.append("ingestor_not_configured")
    else:
        row_count = summary.row_count
        metadata = dict(summary.metadata)
        path = summary.path
        source = summary.source
        total_rows = metadata.get("total_rows")
        new_rows = metadata.get("new_rows")
        updated_rows = metadata.get("updated_rows")
        if row_count <= 0:
            if isinstance(total_rows, (int, float)) and total_rows > 0:
                status = "stale"
                issues.append("no_new_rows")
            else:
                status = "empty"
                issues.append("no_rows_persisted")
        if name == "shopify_orders":
            ratio = metadata.get("geocoded_ratio")
            if ratio is None:
                issues.append("missing_geocoded_ratio")
            elif isinstance(ratio, (int, float)) and ratio < GEOCODE_RATIO_FLOOR:
                status = "needs_attention"
                issues.append("low_geocoded_ratio")

        # Normalise numeric metadata for downstream reporting.
        if isinstance(total_rows, (int, float)):
            metadata["total_rows"] = int(total_rows)
        if isinstance(new_rows, (int, float)):
            metadata["new_rows"] = int(new_rows)
        if isinstance(updated_rows, (int, float)):
            metadata["updated_rows"] = int(updated_rows)

    return {
        "dataset": name,
        "status": status,
        "row_count": row_count,
        "issues": issues,
        "metadata": metadata,
        "path": path,
        "source": source,
    }


def _emit_shopify_stub(
    context: IngestionContext,
    lake_root: str,
) -> tuple[IngestionSummary, IngestionSummary, str]:
    writer = LakeWriter(root=lake_root)
    base = BaseIngestor(writer=writer)
    geohash = geohash2.encode(FALLBACK_COORDINATES[0], FALLBACK_COORDINATES[1], 5)
    created_at = context.start_date.isoformat()
    orders_payload = [
        {
            "tenant_id": context.tenant_id,
            "order_id": "sample-order",
            "name": "Sample Order",
            "created_at": created_at,
            "currency": "USD",
            "total_price": 0.0,
            "subtotal_price": 0.0,
            "total_tax": 0.0,
            "total_discounts": 0.0,
            "shipping_postal_code": "00000",
            "shipping_country": "US",
            "ship_latitude": FALLBACK_COORDINATES[0],
            "ship_longitude": FALLBACK_COORDINATES[1],
            "ship_geohash": geohash,
        }
    ]
    validate_shopify_orders(orders_payload)
    orders_summary = base._write_incremental(
        dataset=f"{context.tenant_id}_shopify_orders",
        rows=orders_payload,
        unique_keys=("tenant_id", "order_id"),
        source="stub",
        metadata={"geocoded_ratio": 1.0, "geocoded_count": len(orders_payload)},
    )

    products_payload = [
        {
            "tenant_id": context.tenant_id,
            "product_id": "sample-product",
            "title": "Rain Jacket",
            "product_type": "Outerwear",
            "vendor": "WeatherVane",
            "created_at": created_at,
            "updated_at": created_at,
        }
    ]
    validate_shopify_products(products_payload)
    products_summary = base._write_incremental(
        dataset=f"{context.tenant_id}_shopify_products",
        rows=products_payload,
        unique_keys=("tenant_id", "product_id"),
        source="stub",
    )
    return orders_summary, products_summary, "stub"


def _emit_ads_stub(
    context: IngestionContext,
    lake_root: str,
) -> tuple[IngestionSummary, IngestionSummary, str]:
    writer = LakeWriter(root=lake_root)
    base = BaseIngestor(writer=writer)
    stub_date = context.start_date.date().isoformat()
    meta_payload = [
        {
            "tenant_id": context.tenant_id,
            "date": stub_date,
            "campaign_id": "meta-sample",
            "adset_id": "meta-adset",
            "spend": 0.0,
            "impressions": 0,
            "clicks": 0,
            "conversions": 0.0,
        }
    ]
    validate_meta_ads(meta_payload)
    meta_summary = base._write_incremental(
        dataset=f"{context.tenant_id}_meta_ads",
        rows=meta_payload,
        unique_keys=("tenant_id", "date", "campaign_id", "adset_id"),
        source="stub",
    )

    google_payload = [
        {
            "tenant_id": context.tenant_id,
            "date": stub_date,
            "campaign_id": "google-sample",
            "spend": 0.0,
            "impressions": 0,
            "clicks": 0,
            "conversions": 0.0,
        }
    ]
    validate_google_ads(google_payload)
    google_summary = base._write_incremental(
        dataset=f"{context.tenant_id}_google_ads",
        rows=google_payload,
        unique_keys=("tenant_id", "date", "campaign_id"),
        source="stub",
    )
    return meta_summary, google_summary, "stub"


def _emit_promo_stub(
    context: IngestionContext,
    lake_root: str,
) -> tuple[IngestionSummary, str]:
    writer = LakeWriter(root=lake_root)
    base = BaseIngestor(writer=writer)
    scheduled_at = context.start_date.isoformat()
    promo_payload = [
        {
            "tenant_id": context.tenant_id,
            "campaign_id": "promo-sample",
            "name": "Launch Campaign",
            "channel": "email",
            "scheduled_at": scheduled_at,
            "status": "draft",
        }
    ]
    validate_promos(promo_payload)
    promo_summary = base._write_incremental(
        dataset=f"{context.tenant_id}_promos",
        rows=promo_payload,
        unique_keys=("tenant_id", "campaign_id"),
        source="stub",
    )
    return promo_summary, "stub"


async def ingest_shopify(
    context: IngestionContext,
    lake_root: str,
    state_root: str,
) -> Dict[str, Any]:
    logger = get_run_logger()
    store = JsonStateStore(root=state_root)
    ingestor = build_shopify_ingestor_from_env(lake_root, state_root=state_root)

    if ingestor:
        orders_summary = await ingestor.ingest_orders(context.tenant_id, context.start_date, context.end_date)
        products_summary = await ingestor.ingest_products(context.tenant_id)
        source = "shopify_api"
    else:
        logger.warning(
            "Shopify credentials missing; emitting stub payload for tenant %s",
            context.tenant_id,
        )
        orders_summary, products_summary, source = _emit_shopify_stub(context, lake_root)

    store.save(
        "ingestion",
        f"{context.tenant_id}_shopify",
        {
            "last_start": context.start_date.isoformat(),
            "last_end": context.end_date.isoformat(),
            "orders_path": orders_summary.path,
            "orders_row_count": orders_summary.row_count,
            "orders_total_rows": orders_summary.metadata.get("total_rows"),
            "orders_new_rows": orders_summary.metadata.get("new_rows"),
            "orders_updated_rows": orders_summary.metadata.get("updated_rows"),
            "products_path": products_summary.path,
            "products_row_count": products_summary.row_count,
            "products_total_rows": products_summary.metadata.get("total_rows"),
            "products_new_rows": products_summary.metadata.get("new_rows"),
            "products_updated_rows": products_summary.metadata.get("updated_rows"),
            "orders_geocoded_ratio": orders_summary.metadata.get("geocoded_ratio"),
            "source": source,
            "updated_at": datetime.utcnow().isoformat(),
        },
    )

    return {
        "orders": orders_summary,
        "products": products_summary,
        "source": source,
    }


async def ingest_ads(
    context: IngestionContext,
    lake_root: str,
    state_root: str,
) -> Dict[str, Any]:
    logger = get_run_logger()
    store = JsonStateStore(root=state_root)
    ingestor = build_ads_ingestor_from_env(lake_root)

    meta_summary = await ingestor.ingest_meta(context.tenant_id, context.start_date, context.end_date) if ingestor.meta_connector else None
    google_summary = await ingestor.ingest_google(context.tenant_id, context.start_date, context.end_date) if ingestor.google_connector else None

    if not meta_summary and not google_summary:
        logger.warning(
            "Ads connectors not configured; emitting stub payload for tenant %s",
            context.tenant_id,
        )
        meta_summary, google_summary, source = _emit_ads_stub(context, lake_root)
    else:
        source = "ads_api"

    store.save(
        "ingestion",
        f"{context.tenant_id}_ads",
        {
            "last_start": context.start_date.isoformat(),
            "last_end": context.end_date.isoformat(),
            "meta_path": meta_summary.path if meta_summary else None,
            "meta_rows": meta_summary.row_count if meta_summary else 0,
            "meta_total_rows": meta_summary.metadata.get("total_rows") if meta_summary else None,
            "meta_new_rows": meta_summary.metadata.get("new_rows") if meta_summary else None,
            "meta_updated_rows": meta_summary.metadata.get("updated_rows") if meta_summary else None,
            "google_path": google_summary.path if google_summary else None,
            "google_rows": google_summary.row_count if google_summary else 0,
            "google_total_rows": google_summary.metadata.get("total_rows") if google_summary else None,
            "google_new_rows": google_summary.metadata.get("new_rows") if google_summary else None,
            "google_updated_rows": google_summary.metadata.get("updated_rows") if google_summary else None,
            "source": source,
            "updated_at": datetime.utcnow().isoformat(),
        },
    )

    return {
        "meta": meta_summary,
        "google": google_summary,
        "source": source,
    }


async def ingest_promo(
    context: IngestionContext,
    lake_root: str,
    state_root: str,
) -> Dict[str, Any]:
    logger = get_run_logger()
    store = JsonStateStore(root=state_root)
    ingestor = build_promo_ingestor_from_env(lake_root, state_root=state_root)
    summary = await ingestor.ingest_campaigns(context.tenant_id, context.start_date, context.end_date) if ingestor.connector else None

    if summary is None:
        logger.warning(
            "Promo connector not configured; emitting stub payload for tenant %s",
            context.tenant_id,
        )
        summary, source = _emit_promo_stub(context, lake_root)
    else:
        source = "klaviyo_api"

    store.save(
        "ingestion",
        f"{context.tenant_id}_promo",
        {
            "last_start": context.start_date.isoformat(),
            "last_end": context.end_date.isoformat(),
            "promo_path": summary.path,
            "promo_rows": summary.row_count,
            "promo_total_rows": summary.metadata.get("total_rows"),
            "promo_new_rows": summary.metadata.get("new_rows"),
            "promo_updated_rows": summary.metadata.get("updated_rows"),
            "source": source,
            "updated_at": datetime.utcnow().isoformat(),
        },
    )

    return {
        "promo": summary,
        "source": source,
    }


def assemble_dq_report(
    context: IngestionContext,
    shopify_payload: Dict[str, Any],
    ads_payload: Dict[str, Any],
    promo_payload: Dict[str, Any],
) -> Dict[str, Any]:
    datasets = {
        "shopify_orders": _evaluate_dataset("shopify_orders", shopify_payload.get("orders")),
        "shopify_products": _evaluate_dataset("shopify_products", shopify_payload.get("products")),
        "meta_ads": _evaluate_dataset("meta_ads", ads_payload.get("meta")),
        "google_ads": _evaluate_dataset("google_ads", ads_payload.get("google")),
        "promos": _evaluate_dataset("promos", promo_payload.get("promo")),
    }

    return {
        "tenant_id": context.tenant_id,
        "generated_at": datetime.utcnow().isoformat(),
        "window": {
            "start": context.start_date.isoformat(),
            "end": context.end_date.isoformat(),
        },
        "datasets": datasets,
        "sources": {
            "shopify": shopify_payload.get("source"),
            "ads": ads_payload.get("source"),
            "promo": promo_payload.get("source"),
        },
    }


@flow(name="weathervane-ingestion")
async def orchestrate_ingestion_flow(
    tenant_id: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    *,
    lake_root: str | Path | None = None,
    state_root: str | Path | None = None,
    dq_report_path: str | Path | None = None,
    dq_monitoring_path: str | Path | None = None,
) -> Dict[str, Any]:
    logger = get_run_logger()
    resolved_lake_root = str(lake_root or Path("storage/lake/raw"))
    resolved_state_root = str(state_root or Path("storage/metadata/state"))
    resolved_report_path = Path(dq_report_path or Path("experiments/ingest/dq_report.json"))
    resolved_monitor_path = Path(dq_monitoring_path) if dq_monitoring_path else Path("state/dq_monitoring.json")

    store = JsonStateStore(root=resolved_state_root)
    context = _resolve_window(store, tenant_id, start_date, end_date)

    logger.info(
        "Starting ingestion flow for tenant %s between %s and %s",
        tenant_id,
        context.start_date.isoformat(),
        context.end_date.isoformat(),
    )

    shopify_payload = await ingest_shopify(context, resolved_lake_root, resolved_state_root)
    ads_payload = await ingest_ads(context, resolved_lake_root, resolved_state_root)
    promo_payload = await ingest_promo(context, resolved_lake_root, resolved_state_root)

    # Run geo holdout design (incrementality measurement)
    incrementality_result = await run_incrementality_step(
        tenant_id,
        resolved_lake_root,
        base_dir=Path.cwd(),
    )
    if incrementality_result["status"] == "success":
        logger.info(
            "Geo holdout assignment persisted for tenant %s at %s",
            tenant_id,
            incrementality_result["assignment_path"],
        )
    elif incrementality_result["status"] == "skip":
        logger.warning(
            "Geo holdout skipped for tenant %s: %s",
            tenant_id,
            incrementality_result["reason"],
        )
    else:
        logger.error(
            "Geo holdout failed for tenant %s: %s",
            tenant_id,
            incrementality_result.get("reason"),
        )

    dq_report = assemble_dq_report(context, shopify_payload, ads_payload, promo_payload)
    _write_report(resolved_report_path, dq_report)
    monitoring_snapshot = update_dq_monitoring(
        dq_report,
        monitoring_path=resolved_monitor_path,
    )
    logger.info(
        "Data quality monitoring severity %s (alerts=%s)",
        monitoring_snapshot["overall_severity"],
        ", ".join(monitoring_snapshot["alerts"]) or "none",
    )

    store.save(
        "ingestion",
        f"{tenant_id}_window",
        {
            "last_start": context.start_date.isoformat(),
            "last_end": context.end_date.isoformat(),
            "report_path": str(resolved_report_path),
            "updated_at": datetime.utcnow().isoformat(),
        },
    )

    logger.info(
        "Ingestion flow complete for tenant %s; data quality report at %s",
        tenant_id,
        resolved_report_path,
    )

    return {
        "window": dq_report["window"],
        "datasets": dq_report["datasets"],
        "sources": dq_report["sources"],
        "report_path": str(resolved_report_path),
        "summaries": {
            "shopify_orders": _summary_to_dict(shopify_payload.get("orders")),
            "shopify_products": _summary_to_dict(shopify_payload.get("products")),
            "meta_ads": _summary_to_dict(ads_payload.get("meta")),
            "google_ads": _summary_to_dict(ads_payload.get("google")),
            "promos": _summary_to_dict(promo_payload.get("promo")),
        },
        "dq_monitoring": monitoring_snapshot,
        "incrementality": incrementality_result,
    }
