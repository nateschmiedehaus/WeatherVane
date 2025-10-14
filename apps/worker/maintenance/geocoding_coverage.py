"""CLI utility to evaluate geocoding coverage across Shopify orders datasets."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable, Sequence

from apps.worker.validation.geocoding import (
    GEOCODING_DATASET_SUFFIX,
    GeocodingCoverageResult,
    evaluate_geocoding_coverage,
)


def discover_tenants(lake_root: Path) -> list[str]:
    """Return tenant identifiers that have Shopify orders snapshots."""

    if not lake_root.exists():
        return []

    tenants: set[str] = set()
    suffix = GEOCODING_DATASET_SUFFIX
    for entry in lake_root.iterdir():
        if entry.is_dir() and entry.name.endswith(suffix):
            tenants.add(entry.name[: -len(suffix)])
    return sorted(tenants)


def run_geocoding_checks(
    tenants: Sequence[str],
    *,
    lake_root: Path,
    summary_root: Path,
    min_ratio: float = 0.8,
    fail_on_warning: bool = False,
) -> list[GeocodingCoverageResult]:
    """Evaluate geocoding coverage for the provided tenants."""

    results: list[GeocodingCoverageResult] = []
    for tenant_id in tenants:
        result = evaluate_geocoding_coverage(
            tenant_id,
            lake_root=str(lake_root),
            min_ratio=min_ratio,
            summary_root=str(summary_root),
        )
        print(
            f"[geocoding] tenant={tenant_id} ratio={result.ratio:.3f} "
            f"rows={result.row_count} geocoded={result.geocoded_count} status={result.status}"
        )
        results.append(result)

    if fail_on_warning:
        failing_statuses = {"warning", "critical", "error"}
        failures = [result for result in results if result.status in failing_statuses]
        if failures:
            summary = ", ".join(f"{item.tenant_id} ({item.status})" for item in failures)
            raise SystemExit(f"Geocoding coverage below threshold for: {summary}")

    return results


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate geocoding coverage for Shopify orders")
    parser.add_argument(
        "--tenant",
        action="append",
        dest="tenants",
        help="Tenant identifier to evaluate (repeatable)",
    )
    parser.add_argument(
        "--lake-root",
        default="storage/lake/raw",
        help="Root directory containing raw lake datasets",
    )
    parser.add_argument(
        "--summary-root",
        default="storage/metadata/state",
        help="Directory for persisting geocoding summaries",
    )
    parser.add_argument(
        "--min-ratio",
        type=float,
        default=0.8,
        help="Minimum acceptable geocoding coverage ratio",
    )
    parser.add_argument(
        "--fail-on-warning",
        action="store_true",
        help="Exit with non-zero status when any tenant falls below the threshold",
    )
    return parser.parse_args(list(argv) if argv is not None else None)


def main(argv: Iterable[str] | None = None) -> None:
    args = parse_args(argv)
    lake_root = Path(args.lake_root)
    summary_root = Path(args.summary_root)

    tenants = args.tenants or discover_tenants(lake_root)
    if not tenants:
        raise SystemExit("No tenants found to evaluate geocoding coverage.")

    run_geocoding_checks(
        tenants,
        lake_root=lake_root,
        summary_root=summary_root,
        min_ratio=float(args.min_ratio),
        fail_on_warning=bool(args.fail_on_warning),
    )


if __name__ == "__main__":
    main()
