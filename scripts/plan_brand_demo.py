from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import polars as pl

from shared.libs.storage.lake import LakeWriter, read_parquet


DATASETS = {
    "shopify_orders": "{tenant}_shopify_orders",
    "shopify_products": "{tenant}_shopify_products",
    "meta_ads": "{tenant}_meta_ads",
    "google_ads": "{tenant}_google_ads",
    "promos": "{tenant}_promos",
    "weather_daily": "{tenant}_weather_daily",
}


def _read_latest(writer: LakeWriter, dataset: str) -> Optional[pl.DataFrame]:
    path = writer.latest(dataset)
    if not path:
        return None
    return read_parquet(path)


def _summarise_orders(frame: pl.DataFrame) -> Dict[str, Any]:
    created_col = "created_at" if "created_at" in frame.columns else "processed_at"
    if created_col not in frame.columns:
        return {}
    parsed = frame.with_columns(
        pl.col(created_col).str.strip_chars().strptime(pl.Datetime, strict=False, utc=True).alias("_created_dt")
    ).drop_nulls("_created_dt")
    if parsed.is_empty():
        return {}

    start = parsed["_created_dt"].min()
    end = parsed["_created_dt"].max()
    history_days = int((end - start).total_seconds() // 86400) + 1

    top_geo_row = None
    if "ship_geohash" in parsed.columns:
        revenue_col = "net_revenue" if "net_revenue" in parsed.columns else "total_price"
        revenue_col = revenue_col if revenue_col in parsed.columns else None
        if revenue_col:
            geo_group = (
                parsed.group_by("ship_geohash")
                .agg(primary_revenue=pl.col(revenue_col).sum(), lat=pl.col("ship_latitude").mean(), lon=pl.col("ship_longitude").mean())
                .sort("primary_revenue", descending=True)
            )
            if not geo_group.is_empty():
                top_geo_row = geo_group.row(0, named=True)

    return {
        "start_date": start.date().isoformat(),
        "end_date": end.date().isoformat(),
        "history_days": history_days,
        "row_count": int(parsed.height),
        "top_geo": {
            "geohash": top_geo_row["ship_geohash"],
            "latitude": float(top_geo_row["lat"]) if top_geo_row and top_geo_row["lat"] is not None else None,
            "longitude": float(top_geo_row["lon"]) if top_geo_row and top_geo_row["lon"] is not None else None,
            "revenue": float(top_geo_row["primary_revenue"]) if top_geo_row else None,
        }
        if top_geo_row
        else None,
    }


def _summarise_products(frame: pl.DataFrame) -> Dict[str, Any]:
    available = frame.select(
        [
            pl.count().alias("total_products"),
            pl.n_unique("product_type").alias("product_type_count") if "product_type" in frame.columns else pl.lit(0),
            pl.n_unique("vendor").alias("vendor_count") if "vendor" in frame.columns else pl.lit(0),
        ]
    )
    summary = available.row(0, named=True)
    top_product = None
    top_category = None
    if "title" in frame.columns:
        ordered = frame.drop_nulls("title").select("title").group_by("title").len().sort("len", descending=True)
        if not ordered.is_empty():
            top_product = ordered.row(0, named=True)["title"]
    if "product_type" in frame.columns:
        type_counts = (
            frame.drop_nulls("product_type")
            .select("product_type")
            .group_by("product_type")
            .len()
            .sort("len", descending=True)
        )
        if not type_counts.is_empty():
            top_category = type_counts.row(0, named=True)["product_type"]
    return {
        "total_products": int(summary.get("total_products", 0)),
        "product_type_count": int(summary.get("product_type_count", 0)),
        "vendor_count": int(summary.get("vendor_count", 0)),
        "top_product_title": top_product,
        "top_product_type": top_category,
    }


def _assess_signals(writer: LakeWriter, tenant: str) -> Dict[str, Any]:
    signals: Dict[str, Any] = {}
    for key, pattern in DATASETS.items():
        dataset_name = pattern.format(tenant=tenant)
        path = writer.latest(dataset_name)
        signals[key] = {"available": bool(path), "dataset": dataset_name, "path": str(path) if path else None}
    return signals


def _derive_tasks(signals: Dict[str, Any], orders_summary: Dict[str, Any]) -> List[str]:
    tasks: List[str] = []
    if not signals["shopify_orders"]["available"]:
        tasks.append("Connect Shopify orders to capture revenue baseline.")
    if signals["shopify_orders"]["available"] and not signals["weather_daily"]["available"]:
        tasks.append("Fetch weather daily data for the demo geo to explain weather impact.")
    if signals["shopify_orders"]["available"] and not signals["meta_ads"]["available"]:
        tasks.append("Connect Meta Ads to showcase paid channel adjustments.")
    if signals["shopify_orders"]["available"] and not signals["google_ads"]["available"]:
        tasks.append("Connect Google Ads to cover search marketing impact.")
    if signals["promos"]["available"] is False:
        tasks.append("Import promotion calendar to control for discount-driven lift.")
    if orders_summary.get("history_days", 0) < 30 and signals["shopify_orders"]["available"]:
        tasks.append("Extend order history to at least 30 days for a stable baseline.")
    return tasks


def _recommended_history_days(orders_summary: Dict[str, Any]) -> int:
    days = orders_summary.get("history_days")
    if not days:
        return 14
    return min(max(days, 14), 180)


def plan_demo(tenant: str, lake_root: Path) -> Dict[str, Any]:
    writer = LakeWriter(root=lake_root)
    signals = _assess_signals(writer, tenant)

    plan: Dict[str, Any] = {
        "tenant": tenant,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "lake_root": str(lake_root),
        "signals": signals,
        "notes": [],
    }

    orders_dataset = DATASETS["shopify_orders"].format(tenant=tenant)
    orders_frame = _read_latest(writer, orders_dataset)
    if orders_frame is None or orders_frame.is_empty():
        plan["status"] = "missing_orders"
        plan["notes"].append("No Shopify orders data detected; connect Shopify before running the demo.")
        plan["labor_tasks"] = _derive_tasks(signals, {})
        plan["recommended_history_days"] = 14
        return plan

    orders_summary = _summarise_orders(orders_frame)
    plan["orders_summary"] = orders_summary
    plan["recommended_history_days"] = _recommended_history_days(orders_summary)

    top_geo = orders_summary.get("top_geo")
    if top_geo:
        plan["top_geo"] = top_geo
        plan["notes"].append(
            f"Focus demo on geohash {top_geo['geohash']} "
            f"(lat={top_geo.get('latitude')}, lon={top_geo.get('longitude')}) "
            f"with approx revenue {top_geo.get('revenue')}."
        )

    products_dataset = DATASETS["shopify_products"].format(tenant=tenant)
    products_frame = _read_latest(writer, products_dataset)
    if products_frame is not None and not products_frame.is_empty():
        product_summary = _summarise_products(products_frame)
        plan["products_summary"] = product_summary
        if product_summary.get("top_product_title"):
            plan["recommended_product"] = product_summary["top_product_title"]
            plan["notes"].append(f"Use top product '{product_summary['top_product_title']}' as the hero SKU in the demo.")
        if product_summary.get("top_product_type"):
            plan["recommended_category"] = product_summary["top_product_type"]

    plan["labor_tasks"] = _derive_tasks(signals, orders_summary)
    if signals["meta_ads"]["available"] is False and signals["google_ads"]["available"] is False:
        plan["notes"].append("Ads connectors missing; highlight baseline-only demo or ingest minimal ad history.")
    plan["status"] = "ready" if not plan["labor_tasks"] else "needs_setup"
    return plan


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a minimal-labor demo plan for a tenant/brand.")
    parser.add_argument("--tenant", required=True, help="Tenant/brand identifier (prefix for datasets).")
    parser.add_argument(
        "--lake-root",
        default="storage/lake/raw",
        help="Path to lake root containing connector parquet datasets.",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Optional path to write JSON plan.",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print JSON output.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    lake_root = Path(args.lake_root).resolve()
    if not lake_root.exists():
        raise FileNotFoundError(f"Lake root not found: {lake_root}")
    plan = plan_demo(args.tenant, lake_root)
    json_payload = json.dumps(plan, indent=2 if args.pretty else None, sort_keys=args.pretty)
    print(json_payload)
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json_payload, encoding="utf-8")


if __name__ == "__main__":
    main()
