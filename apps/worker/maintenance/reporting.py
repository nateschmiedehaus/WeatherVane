"""Reporting helpers for retention and geocoding telemetry."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

import json

from shared.libs.storage.state import JsonStateStore


@dataclass
class RetentionReport:
    summaries: List[Dict[str, Any]]
    total_removed: int
    tenant_count: int
    warning_counts: Dict[str, int]
    tag_counts: Dict[str, int]

    @classmethod
    def from_summary(cls, payload: Dict[str, Any]) -> "RetentionReport":
        return cls(
            summaries=list(payload.get("summaries", [])),
            total_removed=int(payload.get("total_removed", 0) or 0),
            tenant_count=int(payload.get("tenant_count", 0) or 0),
            warning_counts=dict(payload.get("warning_counts", {})),
            tag_counts=dict(payload.get("tag_counts", {})),
        )


@dataclass
class GeocodingReport:
    tenant_id: str
    ratio: float
    status: str

    @classmethod
    def from_payload(cls, tenant_id: str, payload: Dict[str, Any]) -> "GeocodingReport":
        return cls(
            tenant_id=tenant_id,
            ratio=float(payload.get("ratio", 0.0) or 0.0),
            status=str(payload.get("status", "unknown")),
        )


def load_retention_report(summary_root: str) -> RetentionReport:
    store = JsonStateStore(root=summary_root)
    payload = store.load("retention", "latest")
    if not payload:
        raise FileNotFoundError("No retention summary found; run the sweep first")
    return RetentionReport.from_summary(payload)


def load_geocoding_reports(summary_root: str) -> List[GeocodingReport]:
    store = JsonStateStore(root=summary_root)
    tenants = store.list("geocoding")
    reports: List[GeocodingReport] = []
    for tenant in tenants:
        payload = store.load("geocoding", tenant)
        if payload:
            reports.append(GeocodingReport.from_payload(tenant, payload))
    return reports


def export_retention_report(report: RetentionReport, path: str | Path) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report.__dict__, indent=2, sort_keys=True))
    return target


def export_geocoding_reports(reports: List[GeocodingReport], path: str | Path) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = [report.__dict__ for report in reports]
    target.write_text(json.dumps(payload, indent=2, sort_keys=True))
    return target
