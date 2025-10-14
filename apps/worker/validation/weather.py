"""Weather coverage validation helpers and CLI."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from shared.feature_store.feature_builder import FeatureBuilder, FeatureLeakageError, FeatureMatrix
from shared.feature_store.reports import generate_weather_join_report
from shared.libs.storage.state import JsonStateStore

DEFAULT_LOOKBACK_DAYS = 30


@dataclass
class WeatherCoverageResult:
    tenant_id: str
    window_start: str
    window_end: str
    status: str
    join_mode: str
    weather_rows: int
    feature_rows: int
    observed_rows: int
    weather_missing_rows: int
    weather_missing_dates: List[str]
    leakage_rows: int
    forward_leakage_rows: int
    forecast_leakage_rows: int
    geocoded_order_ratio: Optional[float]
    unique_geohash_count: int
    guardrail_triggered: bool
    issues: List[str]
    report_path: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tenant_id": self.tenant_id,
            "window_start": self.window_start,
            "window_end": self.window_end,
            "status": self.status,
            "join_mode": self.join_mode,
            "weather_rows": self.weather_rows,
            "feature_rows": self.feature_rows,
            "observed_rows": self.observed_rows,
            "weather_missing_rows": self.weather_missing_rows,
            "weather_missing_dates": list(self.weather_missing_dates),
            "leakage_rows": self.leakage_rows,
            "forward_leakage_rows": self.forward_leakage_rows,
            "forecast_leakage_rows": self.forecast_leakage_rows,
            "geocoded_order_ratio": self.geocoded_order_ratio,
            "unique_geohash_count": self.unique_geohash_count,
            "guardrail_triggered": self.guardrail_triggered,
            "issues": list(self.issues),
            "report_path": self.report_path,
        }


def evaluate_weather_coverage(
    tenant_id: str,
    *,
    start: datetime,
    end: datetime,
    lake_root: str | Path = "storage/lake/raw",
    report_path: str | Path = Path("experiments/features/weather_join_validation.json"),
    summary_root: str | Path | None = "storage/metadata/state",
) -> Tuple[WeatherCoverageResult, Dict[str, Any]]:
    builder = FeatureBuilder(lake_root=lake_root)
    report_target = Path(report_path)

    guardrail_triggered = False
    try:
        matrix = builder.build(tenant_id, start=start, end=end)
    except FeatureLeakageError as exc:
        guardrail_triggered = True
        matrix = exc.matrix
        if matrix is None:
            raise

    report = generate_weather_join_report(
        matrix,
        tenant_id=tenant_id,
        window_start=start,
        window_end=end,
        geocoded_ratio=matrix.geocoded_order_ratio,
        output_path=report_target,
    )

    status = _classify_status(matrix, guardrail_triggered, report["issues"])
    rounded_ratio = _round_ratio(matrix.geocoded_order_ratio)
    coverage = report.get("coverage", {})
    weather_gaps = report.get("weather_gaps", {})

    result = WeatherCoverageResult(
        tenant_id=tenant_id,
        window_start=start.isoformat(),
        window_end=end.isoformat(),
        status=status,
        join_mode=matrix.join_mode,
        weather_rows=matrix.weather_rows,
        feature_rows=int(matrix.frame.height),
        observed_rows=matrix.observed_rows,
        weather_missing_rows=matrix.weather_missing_rows,
        weather_missing_dates=list(weather_gaps.get("dates", [])),
        leakage_rows=matrix.leakage_risk_rows,
        forward_leakage_rows=matrix.forward_leakage_rows,
        forecast_leakage_rows=matrix.forecast_leakage_rows,
        geocoded_order_ratio=rounded_ratio,
        unique_geohash_count=int(coverage.get("unique_geohash_count", 0)),
        guardrail_triggered=guardrail_triggered or matrix.leakage_risk_rows > 0,
        issues=list(report.get("issues", [])),
        report_path=str(report_target),
    )

    if summary_root:
        JsonStateStore(root=summary_root).save("weather", tenant_id, result.to_dict())

    return result, report


def _classify_status(matrix: FeatureMatrix, guardrail_triggered: bool, issues: Iterable[str]) -> str:
    if matrix.weather_rows == 0:
        return "missing"
    if guardrail_triggered or matrix.leakage_risk_rows > 0:
        return "error"

    warning_flags: List[str] = []
    if matrix.weather_missing_rows > 0:
        warning_flags.append("weather_missing_rows")
    if matrix.join_mode == "date_only":
        warning_flags.append("date_only_join")
    ratio = matrix.geocoded_order_ratio
    if ratio is None or (isinstance(ratio, (int, float)) and float(ratio) < 0.8):
        warning_flags.append("geocoding_ratio")

    leakage_issue = any("Leakage guardrail" in issue for issue in issues)
    if leakage_issue:
        return "error"
    if warning_flags or any(issues):
        return "warning"
    return "ok"


def _round_ratio(ratio: Optional[float]) -> Optional[float]:
    if ratio is None:
        return None
    try:
        return round(float(ratio), 4)
    except (TypeError, ValueError):
        return None


def _parse_datetime(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"Invalid datetime value: {value}") from exc


def _default_start_end(
    start: Optional[str],
    end: Optional[str],
    lookback_days: int,
) -> Tuple[datetime, datetime]:
    resolved_end = _parse_datetime(end) if end else datetime.now(timezone.utc)
    resolved_start = _parse_datetime(start) if start else resolved_end - timedelta(days=lookback_days)
    if resolved_start > resolved_end:
        raise argparse.ArgumentTypeError("start must be before end")
    return resolved_start, resolved_end


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Evaluate weather coverage for a tenant.")
    parser.add_argument("--tenant-id", required=True, help="Tenant identifier to evaluate.")
    parser.add_argument("--start", help="Inclusive window start (ISO format).")
    parser.add_argument("--end", help="Inclusive window end (ISO format).")
    parser.add_argument(
        "--lookback-days",
        type=int,
        default=DEFAULT_LOOKBACK_DAYS,
        help=f"Lookback window when start not provided (default: {DEFAULT_LOOKBACK_DAYS}).",
    )
    parser.add_argument(
        "--lake-root",
        default="storage/lake/raw",
        help="Lake root containing tenant Parquet datasets.",
    )
    parser.add_argument(
        "--report-path",
        default="experiments/features/weather_join_validation.json",
        help="Path to persist the weather join report JSON.",
    )
    parser.add_argument(
        "--summary-root",
        default="storage/metadata/state",
        help="Directory for cached coverage summaries; set to empty string to skip persistence.",
    )
    args = parser.parse_args(argv)

    start_dt, end_dt = _default_start_end(args.start, args.end, args.lookback_days)
    summary_root: Optional[str | Path]
    summary_root = args.summary_root if args.summary_root else None

    result, _ = evaluate_weather_coverage(
        args.tenant_id,
        start=start_dt,
        end=end_dt,
        lake_root=args.lake_root,
        report_path=args.report_path,
        summary_root=summary_root,
    )

    json.dump(result.to_dict(), sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
