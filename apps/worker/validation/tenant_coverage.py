"""Tenant-level data coverage validation across sales, spend, and weather."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from shared.libs.storage.lake import LakeWriter, read_parquet

Status = str
_STATUS_ORDER: Mapping[Status, int] = {"ok": 0, "warning": 1, "critical": 2}


@dataclass(slots=True)
class CoverageBucket:
    """Coverage summary for a single data domain."""

    name: str
    status: Status
    observed_days: int
    window_days: int
    coverage_ratio: float
    latest_date: str | None
    sources: list[str]
    issues: list[str]
    extra_metrics: Mapping[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "status": self.status,
            "observed_days": self.observed_days,
            "window_days": self.window_days,
            "coverage_ratio": round(self.coverage_ratio, 4),
            "latest_date": self.latest_date,
            "sources": list(self.sources),
            "issues": list(self.issues),
            "extra_metrics": dict(self.extra_metrics),
        }


@dataclass(slots=True)
class TenantCoverageSummary:
    """Aggregated coverage view for a tenant."""

    tenant_id: str
    window_days: int
    end_date: str
    generated_at: str
    status: Status
    buckets: Mapping[str, CoverageBucket]

    def to_dict(self) -> dict[str, Any]:
        return {
            "tenant_id": self.tenant_id,
            "window_days": self.window_days,
            "end_date": self.end_date,
            "generated_at": self.generated_at,
            "status": self.status,
            "buckets": {name: bucket.to_dict() for name, bucket in self.buckets.items()},
        }


def evaluate_tenant_data_coverage(
    tenant_id: str,
    *,
    lake_root: str | Path = "storage/lake/raw",
    weather_report_path: str | Path = "experiments/features/weather_join_validation.json",
    window_days: int = 90,
    end_date: date | None = None,
    ok_ratio: float = 0.9,
    warning_ratio: float = 0.6,
    geocode_ok_ratio: float = 0.85,
    geocode_warning_ratio: float = 0.7,
) -> TenantCoverageSummary:
    """
    Evaluate coverage for Shopify sales, ads spend, and weather joins.

    The function inspects the latest Parquet exports under `lake_root` and the weather
    join validation report to ensure there is at least `window_days` worth of history.
    """

    if window_days <= 0:
        raise ValueError("window_days must be positive")

    evaluation_date = end_date or date.today()
    generated_at = datetime.utcnow().isoformat()
    normalized_lake_root = Path(lake_root)

    sales_bucket = _evaluate_sales_coverage(
        tenant_id,
        normalized_lake_root,
        window_days=window_days,
        end_date=evaluation_date,
        ok_ratio=ok_ratio,
        warning_ratio=warning_ratio,
    )
    spend_bucket = _evaluate_spend_coverage(
        tenant_id,
        normalized_lake_root,
        window_days=window_days,
        end_date=evaluation_date,
        ok_ratio=ok_ratio,
        warning_ratio=warning_ratio,
    )
    weather_bucket = _evaluate_weather_coverage(
        tenant_id,
        weather_report_path=Path(weather_report_path),
        window_days=window_days,
        end_date=evaluation_date,
        ok_ratio=ok_ratio,
        warning_ratio=warning_ratio,
        geocode_ok_ratio=geocode_ok_ratio,
        geocode_warning_ratio=geocode_warning_ratio,
    )

    buckets = {
        "sales": sales_bucket,
        "spend": spend_bucket,
        "weather": weather_bucket,
    }
    status = _max_status(bucket.status for bucket in buckets.values())
    summary = TenantCoverageSummary(
        tenant_id=tenant_id,
        window_days=window_days,
        end_date=evaluation_date.isoformat(),
        generated_at=generated_at,
        status=status,
        buckets=buckets,
    )
    return summary


def _evaluate_sales_coverage(
    tenant_id: str,
    lake_root: Path,
    *,
    window_days: int,
    end_date: date,
    ok_ratio: float,
    warning_ratio: float,
) -> CoverageBucket:
    dataset = f"{tenant_id}_shopify_orders"
    dates = _load_distinct_dates(lake_root, dataset, date_columns=("created_at",))
    coverage_ratio, observed_days, latest = _coverage_stats(dates, window_days, end_date)

    issues: list[str] = []
    latest_iso = latest.isoformat() if latest else None
    status = _status_from_ratio(coverage_ratio, ok_ratio, warning_ratio)
    if not dates:
        issues.append("Shopify orders dataset missing or empty.")
        status = "critical"
    elif status != "ok":
        issues.append(
            f"Observed {observed_days} of {window_days} days in window ending {end_date.isoformat()}."
        )

    metrics = {"latest_created_at": latest_iso}

    return CoverageBucket(
        name="sales",
        status=status,
        observed_days=observed_days,
        window_days=window_days,
        coverage_ratio=coverage_ratio,
        latest_date=latest_iso,
        sources=[dataset],
        issues=issues,
        extra_metrics=metrics,
    )


def _evaluate_spend_coverage(
    tenant_id: str,
    lake_root: Path,
    *,
    window_days: int,
    end_date: date,
    ok_ratio: float,
    warning_ratio: float,
) -> CoverageBucket:
    datasets = [
        f"{tenant_id}_meta_ads",
        f"{tenant_id}_google_ads",
    ]
    date_columns = ("date",)
    all_dates: set[date] = set()
    latest_dates: list[date] = []
    missing_sources: list[str] = []

    for dataset in datasets:
        dates = _load_distinct_dates(lake_root, dataset, date_columns=date_columns)
        if not dates:
            missing_sources.append(dataset)
            continue
        all_dates.update(dates)
        latest = max(dates)
        latest_dates.append(latest)

    coverage_ratio, observed_days, latest = _coverage_stats(all_dates, window_days, end_date)
    status = _status_from_ratio(coverage_ratio, ok_ratio, warning_ratio)
    issues: list[str] = []
    if not all_dates:
        status = "critical"
        issues.append("Ads datasets missing or empty.")
    else:
        if missing_sources:
            issues.append(f"Missing data sources: {', '.join(sorted(missing_sources))}.")
        if status != "ok":
            issues.append(
                f"Observed {observed_days} of {window_days} spend days in window ending {end_date.isoformat()}."
            )

    metrics = {
        "latest_observation": max(latest_dates).isoformat() if latest_dates else None,
        "source_count": len(datasets) - len(missing_sources),
    }

    return CoverageBucket(
        name="spend",
        status=status,
        observed_days=observed_days,
        window_days=window_days,
        coverage_ratio=coverage_ratio,
        latest_date=latest.isoformat() if latest else None,
        sources=datasets,
        issues=issues,
        extra_metrics=metrics,
    )


def _evaluate_weather_coverage(
    tenant_id: str,
    *,
    weather_report_path: Path,
    window_days: int,
    end_date: date,
    ok_ratio: float,
    warning_ratio: float,
    geocode_ok_ratio: float,
    geocode_warning_ratio: float,
) -> CoverageBucket:
    issues: list[str] = []
    metrics: dict[str, Any] = {}
    sources = [str(weather_report_path)]

    if not weather_report_path.exists():
        issues.append(f"Weather coverage report missing at {weather_report_path}.")
        return CoverageBucket(
            name="weather",
            status="critical",
            observed_days=0,
            window_days=window_days,
            coverage_ratio=0.0,
            latest_date=None,
            sources=sources,
            issues=issues,
            extra_metrics=metrics,
        )

    payload = json.loads(weather_report_path.read_text())
    join = payload.get("join") or {}
    weather_gaps = payload.get("weather_gaps") or {}
    coverage = payload.get("coverage") or {}
    issues.extend(str(item) for item in payload.get("issues", []) if item)

    missing_dates = _normalise_dates(weather_gaps.get("dates") or [])
    observed_days = max(0, window_days - len(missing_dates))
    coverage_ratio = observed_days / window_days if window_days else 0.0
    status = _status_from_ratio(coverage_ratio, ok_ratio, warning_ratio)

    raw_ratio = join.get("geocoded_order_ratio")
    geocoded_ratio: float | None
    try:
        geocoded_ratio = float(raw_ratio) if raw_ratio is not None else None
    except (TypeError, ValueError):
        geocoded_ratio = None
        if raw_ratio is not None:
            issues.append(f"Invalid geocoded order ratio value: {raw_ratio!r}.")

    metrics["geocoded_order_ratio"] = geocoded_ratio
    metrics["unique_geohash_count"] = coverage.get("unique_geohash_count")
    metrics["missing_dates"] = [value.isoformat() for value in missing_dates]
    metrics["weather_missing_rows"] = weather_gaps.get("rows")

    if geocoded_ratio is not None:
        geo_status = _status_from_ratio(geocoded_ratio, geocode_ok_ratio, geocode_warning_ratio)
        status = _max_status((status, geo_status))
        if geo_status != "ok":
            issues.append(
                f"Geocoded order ratio at {geocoded_ratio:.3f}; expected ≥{geocode_ok_ratio:.2f}."
            )
    latest_date = _resolve_weather_latest(join, end_date)

    if status != "ok" and observed_days < window_days:
        issues.append(
            f"Weather coverage missing {window_days - observed_days} days in window ending {end_date.isoformat()}."
        )

    return CoverageBucket(
        name="weather",
        status=status,
        observed_days=observed_days,
        window_days=window_days,
        coverage_ratio=coverage_ratio,
        latest_date=latest_date.isoformat() if latest_date else None,
        sources=sources,
        issues=issues,
        extra_metrics=metrics,
    )


def _load_distinct_dates(
    lake_root: Path,
    dataset: str,
    *,
    date_columns: Sequence[str],
) -> set[date]:
    writer = LakeWriter(root=lake_root)
    path = writer.latest(dataset)
    if not path:
        return set()
    frame = read_parquet(path)
    if frame.is_empty():
        return set()

    dates: set[date] = set()
    for column in date_columns:
        if column not in frame.columns:
            continue
        series = frame.get_column(column)
        for value in series.unique():
            parsed = _parse_date(value)
            if parsed:
                dates.add(parsed)
    return dates


def _parse_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    text = str(value).strip()
    if not text:
        return None
    if len(text) >= 10:
        candidate = text[:10]
    else:
        candidate = text
    if candidate.endswith("Z"):
        candidate = candidate[:-1]
    try:
        return datetime.fromisoformat(candidate).date()
    except ValueError:
        return None


def _coverage_stats(
    dates: Iterable[date],
    window_days: int,
    end_date: date,
) -> tuple[float, int, date | None]:
    if window_days <= 0:
        return 0.0, 0, None
    unique_dates = {value for value in dates if value is not None}
    if not unique_dates:
        return 0.0, 0, None

    window_start = end_date - timedelta(days=window_days - 1)
    window_dates = {value for value in unique_dates if window_start <= value <= end_date}
    observed_days = len(window_dates)
    coverage_ratio = observed_days / window_days
    latest = max(window_dates) if window_dates else max(unique_dates)
    return coverage_ratio, observed_days, latest


def _status_from_ratio(ratio: float, ok_ratio: float, warning_ratio: float) -> Status:
    if ratio >= ok_ratio:
        return "ok"
    if ratio >= warning_ratio:
        return "warning"
    return "critical"


def _max_status(statuses: Iterable[Status]) -> Status:
    resolved = "ok"
    for status in statuses:
        if _STATUS_ORDER.get(status, 0) > _STATUS_ORDER[resolved]:
            resolved = status
    return resolved


def _normalise_dates(values: Iterable[Any]) -> list[date]:
    normalised: list[date] = []
    for value in values:
        parsed = _parse_date(value)
        if parsed:
            normalised.append(parsed)
    return sorted(set(normalised))


def _resolve_weather_latest(join: Mapping[str, Any], default_end: date) -> date | None:
    feature_rows = join.get("feature_rows")
    observed_rows = join.get("observed_target_rows")
    if feature_rows is None and observed_rows is None:
        return default_end
    return default_end


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate tenant data coverage across sales, spend, weather")
    parser.add_argument("--tenant-id", required=True, help="Tenant identifier to evaluate")
    parser.add_argument(
        "--lake-root",
        type=Path,
        default=Path("storage/lake/raw"),
        help="Root directory containing raw lake exports (default: storage/lake/raw)",
    )
    parser.add_argument(
        "--weather-report",
        type=Path,
        default=Path("experiments/features/weather_join_validation.json"),
        help="Path to weather join validation report JSON",
    )
    parser.add_argument(
        "--window-days",
        type=int,
        default=90,
        help="Number of trailing days to evaluate (default: 90)",
    )
    parser.add_argument(
        "--end-date",
        type=str,
        default=None,
        help="ISO date for coverage window end (default: today)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional path to persist JSON summary",
    )
    return parser.parse_args(argv if argv is not None else None)


def _run_cli(args: argparse.Namespace) -> TenantCoverageSummary:
    end_date_value: date | None = None
    if args.end_date:
        try:
            end_date_value = datetime.fromisoformat(str(args.end_date)).date()
        except ValueError as exc:
            raise SystemExit(f"Invalid --end-date value: {args.end_date}") from exc

    summary = evaluate_tenant_data_coverage(
        args.tenant_id,
        lake_root=args.lake_root,
        weather_report_path=args.weather_report,
        window_days=args.window_days,
        end_date=end_date_value,
    )
    payload = summary.to_dict()
    print(json.dumps(payload, indent=2, sort_keys=True))
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return summary


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    _run_cli(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
