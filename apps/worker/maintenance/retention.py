from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Optional

from prefect import flow, get_run_logger, task

import httpx

from shared.data_context.service import ContextService, DEFAULT_ROOT
from shared.data_context.warnings import default_warning_engine
from shared.libs.storage.state import JsonStateStore
from shared.observability import metrics


@task(name="purge lake data")
def purge_lake_data(
    tenant_id: str,
    retention_days: int,
    lake_root: str = "storage/lake/raw",
) -> List[str]:
    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    removed: List[str] = []
    base_path = Path(lake_root)
    if not base_path.exists():
        return removed

    for dataset_dir in base_path.glob(f"{tenant_id}_*"):
        if not dataset_dir.is_dir():
            continue
        for artifact in dataset_dir.glob("*.parquet"):
            modified_at = datetime.utcfromtimestamp(artifact.stat().st_mtime)
            if modified_at < cutoff:
                artifact.unlink(missing_ok=True)
                removed.append(str(artifact))
    return removed


@task(name="discover tenants")
def discover_tenants(lake_root: str = "storage/lake/raw") -> List[str]:
    root = Path(lake_root)
    if not root.exists():
        return []
    tenants: set[str] = set()
    for dataset_dir in root.glob("*_*"):
        if not dataset_dir.is_dir():
            continue
        name = dataset_dir.name
        if "_" not in name:
            continue
        tenant = name.split("_", 1)[0]
        if tenant:
            tenants.add(tenant)
    return sorted(tenants)


def _post_webhook(url: str, payload: Dict[str, object]) -> None:
    try:  # pragma: no cover - external call best-effort
        httpx.post(url, json=payload, timeout=5.0)
    except httpx.HTTPError:
        pass


@flow(name="tenant-data-retention")
def run_retention_sweep(
    retention_days: int,
    tenant_id: Optional[str] = None,
    tenant_ids: Optional[Iterable[str]] = None,
    lake_root: str = "storage/lake/raw",
    webhook_url: str | None = None,
    summary_root: str | None = None,
    context_root: str | None = None,
) -> Dict[str, object]:
    """Remove expired parquet snapshots for a tenant."""

    # TODO(automation): replace ad-hoc scheduling once the worker scheduler hook lands.
    logger = get_run_logger()
    store = JsonStateStore(root=summary_root) if summary_root else None
    context_service = ContextService(root=Path(context_root)) if context_root else ContextService(root=DEFAULT_ROOT)
    if tenant_ids is None:
        if tenant_id:
            tenant_ids = [tenant_id]
        else:
            tenant_ids = discover_tenants(lake_root)

    summaries: List[Dict[str, object]] = []
    total_removed = 0
    tag_counter: Counter[str] = Counter()
    warning_severity_counter: Counter[str] = Counter()
    warning_code_counter: Counter[str] = Counter()
    for tid in tenant_ids:
        removed = purge_lake_data(tid, retention_days, lake_root)
        removed_count = len(removed)
        context_tags: List[str] = []
        context_warnings: List[Dict[str, object]] = []
        if context_service:
            snapshot = context_service.latest_snapshot(tid)
            if snapshot:
                context_tags = snapshot.tags
                tag_counter.update(context_tags)
                warning_payloads = default_warning_engine.evaluate(
                    context_tags,
                    autopilot_enabled=False,
                    pushes_enabled=False,
                )
                for payload in warning_payloads:
                    warning_severity_counter.update([payload.severity])
                    warning_code_counter.update([payload.code])
                    context_warnings.append(
                        {
                            "code": payload.code,
                            "message": payload.message,
                            "severity": payload.severity,
                            "tags": list(payload.tags),
                        }
                    )
        summary = {
            "tenant_id": tid,
            "removed": removed,
            "removed_count": removed_count,
            "retention_days": retention_days,
            "context_tags": context_tags,
            "context_warnings": context_warnings,
        }
        summaries.append(summary)
        total_removed += removed_count
        logger.info("Retention sweep removed %d files for %s", len(removed), tid)
        if webhook_url and removed:
            _post_webhook(
                webhook_url,
                {
                    "event": "retention.sweep.completed",
                    "tenant_id": tid,
                    "removed": removed,
                    "removed_count": removed_count,
                    "retention_days": retention_days,
                },
            )

        metrics.emit(
            "retention.tenant_sweep",
            {
                "tenant_id": tid,
                "removed_count": removed_count,
                "retention_days": retention_days,
                "context_tag_count": len(context_tags),
                "context_warning_count": len(context_warnings),
            },
            tags={
                "removed": "yes" if removed_count else "no",
                "warnings": "yes" if context_warnings else "no",
            },
        )

    timestamp = datetime.utcnow().isoformat()
    tag_counts = dict(sorted(tag_counter.items())) if tag_counter else {}
    warning_counts = dict(sorted(warning_severity_counter.items())) if warning_severity_counter else {}
    warning_codes = dict(sorted(warning_code_counter.items())) if warning_code_counter else {}
    result: Dict[str, object] = {
        "retention_days": retention_days,
        "lake_root": lake_root,
        "summaries": summaries,
        "total_removed": total_removed,
        "tenant_count": len(summaries),
        "timestamp": timestamp,
        "tag_counts": tag_counts,
        "warning_counts": warning_counts,
        "warning_codes": warning_codes,
    }

    if webhook_url:
        _post_webhook(
            webhook_url,
            {
                "event": "retention.sweep.summary",
                "retention_days": retention_days,
                "lake_root": lake_root,
                "tenant_count": len(summaries),
                "total_removed": total_removed,
                "warning_counts": warning_counts,
                "warning_codes": warning_codes,
                "timestamp": timestamp,
            },
        )

    if store:
        day_key = timestamp.split("T", 1)[0]
        store_payload: Dict[str, object] = {**result, "webhook_url": webhook_url}
        store.save("retention", "latest", store_payload)
        store.save("retention-history", day_key, store_payload)

    metrics.emit(
        "retention.sweep_summary",
        {
            "retention_days": retention_days,
            "tenant_count": len(summaries),
            "total_removed": total_removed,
            "warning_counts": warning_counts,
            "warning_codes": warning_codes,
            "timestamp": timestamp,
        },
        tags={
            "webhook": "enabled" if webhook_url else "disabled",
        },
    )

    return result


def load_retention_summary(
    summary_root: str,
    day: str | None = None,
) -> Dict[str, object]:
    """Load the latest or specific-day retention summary from the state store."""

    store = JsonStateStore(root=summary_root)
    if day:
        payload = store.load("retention-history", day)
    else:
        payload = store.load("retention", "latest")
    if not payload:
        raise FileNotFoundError(
            f"No retention summary found in {summary_root} for key '{day or 'latest'}'"
        )
    return payload
