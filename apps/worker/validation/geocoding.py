from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

import polars as pl

from shared.libs.storage.lake import LakeWriter, read_parquet
from shared.libs.storage.state import JsonStateStore


@dataclass
class GeocodingCoverageResult:
    tenant_id: str
    row_count: int
    geocoded_count: int
    ratio: float
    status: str
    details: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tenant_id": self.tenant_id,
            "row_count": self.row_count,
            "geocoded_count": self.geocoded_count,
            "ratio": self.ratio,
            "status": self.status,
            "details": self.details,
        }


GEOCODING_DATASET_SUFFIX = "_shopify_orders"


def evaluate_geocoding_coverage(
    tenant_id: str,
    lake_root: str = "storage/lake/raw",
    min_ratio: float = 0.8,
    summary_root: str | None = "storage/metadata/state",
) -> GeocodingCoverageResult:
    writer = LakeWriter(root=lake_root)
    dataset = f"{tenant_id}{GEOCODING_DATASET_SUFFIX}"
    latest = writer.latest(dataset)
    if latest is None:
        result = GeocodingCoverageResult(
            tenant_id=tenant_id,
            row_count=0,
            geocoded_count=0,
            ratio=0.0,
            status="missing",
            details={"message": "No orders dataset found"},
        )
        _persist(summary_root, result)
        return result

    frame = read_parquet(latest)
    if "ship_geohash" not in frame.columns:
        result = GeocodingCoverageResult(
            tenant_id=tenant_id,
            row_count=frame.height,
            geocoded_count=0,
            ratio=0.0,
            status="error",
            details={"message": "ship_geohash column missing", "path": str(latest)},
        )
        _persist(summary_root, result)
        return result

    if frame.is_empty():
        result = GeocodingCoverageResult(
            tenant_id=tenant_id,
            row_count=0,
            geocoded_count=0,
            ratio=0.0,
            status="empty",
            details={"message": "orders dataset empty", "path": str(latest)},
        )
        _persist(summary_root, result)
        return result

    geohash_col = frame.get_column("ship_geohash").cast(pl.Utf8).fill_null("")
    geocoded_mask = geohash_col.str.len_bytes() > 0
    geocoded_count = int(geocoded_mask.sum())
    ratio = geocoded_count / frame.height
    status = "ok"
    if ratio < 0.2:
        status = "critical"
    elif ratio < min_ratio:
        status = "warning"

    result = GeocodingCoverageResult(
        tenant_id=tenant_id,
        row_count=frame.height,
        geocoded_count=geocoded_count,
        ratio=ratio,
        status=status,
        details={
            "path": str(latest),
            "threshold": min_ratio,
        },
    )
    _persist(summary_root, result)
    return result


def _persist(summary_root: str | None, result: GeocodingCoverageResult) -> None:
    if not summary_root:
        return
    store = JsonStateStore(root=summary_root)
    store.save("geocoding", result.tenant_id, result.to_dict())
