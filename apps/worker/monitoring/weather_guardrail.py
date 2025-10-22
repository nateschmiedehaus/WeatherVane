from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping

from apps.worker.validation.weather import (
    BaselineThresholds,
    WeatherCoverageResult,
    compare_weather_baseline,
    evaluate_weather_coverage,
)


@dataclass(frozen=True)
class WeatherGuardrailThresholds:
    """Absolute thresholds for weather coverage health checks."""

    minimum_geocoded_ratio: float = 0.82
    maximum_missing_rows: int = 0
    allow_date_only_join: bool = False


class WeatherGuardrailError(RuntimeError):
    """Raised when weather coverage guardrail validation fails."""


def _resolve_paths(
    report_path: str | Path,
    summary_path: str | Path,
    baseline_path: str | Path,
) -> tuple[Path, Path, Path]:
    report = Path(report_path)
    summary = Path(summary_path)
    baseline = Path(baseline_path)
    summary.parent.mkdir(parents=True, exist_ok=True)
    baseline.parent.mkdir(parents=True, exist_ok=True)
    report.parent.mkdir(parents=True, exist_ok=True)
    return report, summary, baseline


def _baseline_summary(
    result: WeatherCoverageResult,
    baseline: WeatherCoverageResult | None,
    *,
    thresholds: BaselineThresholds,
) -> tuple[dict[str, Any], list[str], list[str]]:
    if baseline is None:
        return {"status": "missing"}, [], []

    comparison = compare_weather_baseline(result, baseline, thresholds=thresholds)
    summary: dict[str, Any] = {
        "status": comparison.status,
        "regressions": comparison.regressions,
        "warnings": comparison.warnings,
        "metrics": comparison.metrics,
    }
    return summary, comparison.regressions, comparison.warnings


def run_weather_guardrail(
    tenant_id: str,
    *,
    lookback_days: int = 30,
    lake_root: str | Path = "storage/lake/raw",
    report_path: str | Path = "experiments/features/weather_guardrail_report.json",
    summary_path: str | Path = "state/analytics/weather_coverage_watch.json",
    baseline_path: str | Path = "state/analytics/weather_coverage_baseline.json",
    coverage_summary_root: str | Path | None = "storage/metadata/state",
    thresholds: WeatherGuardrailThresholds | None = None,
    baseline_thresholds: BaselineThresholds | None = None,
    now: datetime | None = None,
) -> Mapping[str, Any]:
    """
    Evaluate weather coverage for a tenant and persist guardrail status.

    Returns a summary payload; raises WeatherGuardrailError when critical issues
    are detected.
    """

    thresholds = thresholds or WeatherGuardrailThresholds()
    baseline_thresholds = baseline_thresholds or BaselineThresholds()
    report, summary_target, baseline_target = _resolve_paths(report_path, summary_path, baseline_path)

    resolved_now = now or datetime.now(timezone.utc)
    window_end = resolved_now
    window_start = window_end - timedelta(days=lookback_days)

    result, _report = evaluate_weather_coverage(
        tenant_id,
        start=window_start,
        end=window_end,
        lake_root=lake_root,
        report_path=report,
        summary_root=coverage_summary_root,
    )

    issues: list[str] = []
    warnings: list[str] = []

    if result.guardrail_triggered:
        issues.append("Weather coverage guardrail triggered due to leakage or missing joins.")
    if result.status == "missing":
        issues.append("Weather coverage missing for evaluation window.")
    elif result.status == "error":
        issues.append("Weather coverage validation returned an error status.")
    elif result.status == "warning":
        warnings.append("Weather coverage returned warnings; inspect weather gaps or join mode.")

    ratio = result.geocoded_order_ratio
    if ratio is None:
        warnings.append("Geocoded order ratio missing from coverage result.")
    elif ratio < thresholds.minimum_geocoded_ratio:
        issues.append(
            f"Geocoded order ratio {ratio:.4f} fell below threshold {thresholds.minimum_geocoded_ratio:.2f}."
        )

    if result.weather_missing_rows > thresholds.maximum_missing_rows:
        issues.append(
            f"Weather missing rows {result.weather_missing_rows} exceeded threshold {thresholds.maximum_missing_rows}."
        )

    fallback_reason = result.geography_fallback_reason or ""
    if not thresholds.allow_date_only_join and result.join_mode in {"date_global", "date_state"}:
        if "weather_coverage" in fallback_reason:
            warnings.append(
                "Join mode downgraded because DMA weather coverage fell below threshold; inspect upstream weather feeds."
            )
        elif fallback_reason in {"dma_level_unavailable", "state_level_unavailable"}:
            warnings.append(
                "Join mode downgraded because DMA/state geography metadata was unavailable on orders."
            )
        elif fallback_reason.startswith("dma_geocoded_ratio") or fallback_reason.startswith("state_geocoded_ratio"):
            warnings.append(
                "Join mode downgraded from DMA coverage; geocoded order ratio fell below the required threshold."
            )
        else:
            warnings.append("Join mode downgraded from DMA coverage; investigate geocoding coverage.")

    baseline_payload = None
    if baseline_target.exists():
        baseline_payload = json.loads(baseline_target.read_text(encoding="utf-8"))
    baseline_result = (
        WeatherCoverageResult.from_dict(baseline_payload) if isinstance(baseline_payload, Mapping) else None
    )

    baseline_summary, baseline_regressions, baseline_warnings = _baseline_summary(
        result,
        baseline_result,
        thresholds=baseline_thresholds,
    )
    issues.extend(baseline_regressions)
    warnings.extend(baseline_warnings)

    if baseline_result is None and not issues:
        baseline_target.write_text(json.dumps(result.to_dict(), indent=2, sort_keys=True), encoding="utf-8")
        baseline_summary["seeded"] = True

    summary: MutableMapping[str, Any] = {
        "tenant_id": tenant_id,
        "evaluated_at": resolved_now.isoformat(),
        "window": {"start": result.window_start, "end": result.window_end},
        "lookback_days": lookback_days,
        "status": "critical" if issues else ("warning" if warnings else "ok"),
        "issues": issues,
        "warnings": warnings,
        "metrics": {
            "weather_rows": result.weather_rows,
            "feature_rows": result.feature_rows,
            "observed_rows": result.observed_rows,
            "weather_missing_rows": result.weather_missing_rows,
            "leakage_rows": result.leakage_rows,
            "forward_leakage_rows": result.forward_leakage_rows,
            "forecast_leakage_rows": result.forecast_leakage_rows,
            "geocoded_order_ratio": ratio,
            "unique_geohash_count": result.unique_geohash_count,
            "join_mode": result.join_mode,
            "geography_level": result.geography_level,
            "weather_coverage_ratio": result.weather_coverage_ratio,
            "weather_coverage_threshold": result.weather_coverage_threshold,
            "geography_fallback_reason": result.geography_fallback_reason,
            "guardrail_triggered": result.guardrail_triggered,
        },
        "report_path": result.report_path,
        "baseline": baseline_summary,
    }

    summary_target.write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")

    if issues:
        raise WeatherGuardrailError(json.dumps(summary, indent=2, sort_keys=True))

    return summary


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run weather coverage guardrail validation.")
    parser.add_argument("--tenant-id", required=True, help="Tenant identifier to evaluate.")
    parser.add_argument(
        "--lookback-days",
        type=int,
        default=30,
        help="Number of trailing days to evaluate when deriving the coverage window.",
    )
    parser.add_argument(
        "--lake-root",
        default="storage/lake/raw",
        help="Root directory for lake parquet partitions.",
    )
    parser.add_argument(
        "--report-path",
        default="experiments/features/weather_guardrail_report.json",
        help="Path to persist the detailed weather coverage report JSON.",
    )
    parser.add_argument(
        "--summary-path",
        default="state/analytics/weather_coverage_watch.json",
        help="Path to persist the guardrail summary JSON.",
    )
    parser.add_argument(
        "--baseline-path",
        default="state/analytics/weather_coverage_baseline.json",
        help="Baseline JSON for historical comparison; seeded on first successful run.",
    )
    parser.add_argument(
        "--coverage-summary-root",
        default="storage/metadata/state",
        help="Optional path to persist evaluate_weather_coverage summaries; set to empty string to skip persistence.",
    )
    parser.add_argument(
        "--min-geocoded-ratio",
        type=float,
        default=WeatherGuardrailThresholds().minimum_geocoded_ratio,
        help="Minimum acceptable geocoded order ratio before failing the guardrail.",
    )
    parser.add_argument(
        "--max-missing-rows",
        type=int,
        default=WeatherGuardrailThresholds().maximum_missing_rows,
        help="Maximum allowable weather_missing_rows before failing the guardrail.",
    )
    parser.add_argument(
        "--allow-date-only-join",
        action="store_true",
        help="Permit date_only joins without emitting a warning.",
    )
    parser.add_argument(
        "--baseline-geocoding-drop",
        type=float,
        default=BaselineThresholds().geocoded_ratio_drop,
        help="Allowed drop in geocoded ratio versus baseline before flagging regressions.",
    )
    parser.add_argument(
        "--baseline-missing-increase",
        type=int,
        default=BaselineThresholds().weather_missing_increase,
        help="Allowed increase in missing weather rows versus baseline before regression.",
    )
    parser.add_argument(
        "--baseline-leakage-increase",
        type=int,
        default=BaselineThresholds().leakage_row_increase,
        help="Allowed increase in leakage rows versus baseline before regression.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)

    thresholds = WeatherGuardrailThresholds(
        minimum_geocoded_ratio=args.min_geocoded_ratio,
        maximum_missing_rows=args.max_missing_rows,
        allow_date_only_join=args.allow_date_only_join,
    )
    baseline_thresholds = BaselineThresholds(
        geocoded_ratio_drop=args.baseline_geocoding_drop,
        weather_missing_increase=args.baseline_missing_increase,
        leakage_row_increase=args.baseline_leakage_increase,
    )

    try:
        summary = run_weather_guardrail(
            args.tenant_id,
            lookback_days=args.lookback_days,
            lake_root=args.lake_root,
            report_path=args.report_path,
            summary_path=args.summary_path,
            baseline_path=args.baseline_path,
            coverage_summary_root=args.coverage_summary_root or None,
            thresholds=thresholds,
            baseline_thresholds=baseline_thresholds,
        )
    except WeatherGuardrailError as exc:
        print(exc, file=sys.stderr)
        return 1

    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv[1:]))
