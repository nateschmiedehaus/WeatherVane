"""Weather coverage validation helpers and CLI."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple

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
    geography_level: str
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
    weather_coverage_ratio: float
    weather_coverage_threshold: float
    geography_fallback_reason: Optional[str]
    issues: List[str]
    report_path: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tenant_id": self.tenant_id,
            "window_start": self.window_start,
            "window_end": self.window_end,
            "status": self.status,
            "join_mode": self.join_mode,
            "geography_level": self.geography_level,
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
            "weather_coverage_ratio": self.weather_coverage_ratio,
            "weather_coverage_threshold": self.weather_coverage_threshold,
            "geography_fallback_reason": self.geography_fallback_reason,
            "issues": list(self.issues),
            "report_path": self.report_path,
        }

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "WeatherCoverageResult":
        """Rehydrate a result persisted via `to_dict` output."""
        return cls(
            tenant_id=str(payload.get("tenant_id", "")),
            window_start=str(payload.get("window_start", "")),
            window_end=str(payload.get("window_end", "")),
            status=str(payload.get("status", "")),
            join_mode=str(payload.get("join_mode", "")),
            geography_level=str(payload.get("geography_level", "")),
            weather_rows=int(payload.get("weather_rows", 0) or 0),
            feature_rows=int(payload.get("feature_rows", 0) or 0),
            observed_rows=int(payload.get("observed_rows", 0) or 0),
            weather_missing_rows=int(payload.get("weather_missing_rows", 0) or 0),
            weather_missing_dates=list(payload.get("weather_missing_dates", [])),
            leakage_rows=int(payload.get("leakage_rows", 0) or 0),
            forward_leakage_rows=int(payload.get("forward_leakage_rows", 0) or 0),
            forecast_leakage_rows=int(payload.get("forecast_leakage_rows", 0) or 0),
            geocoded_order_ratio=(
                float(payload["geocoded_order_ratio"])
                if payload.get("geocoded_order_ratio") is not None
                else None
            ),
            unique_geohash_count=int(payload.get("unique_geohash_count", 0) or 0),
            guardrail_triggered=bool(payload.get("guardrail_triggered", False)),
            weather_coverage_ratio=float(payload.get("weather_coverage_ratio", 0.0) or 0.0),
            weather_coverage_threshold=float(payload.get("weather_coverage_threshold", 0.0) or 0.0),
            geography_fallback_reason=(
                str(payload.get("geography_fallback_reason"))
                if payload.get("geography_fallback_reason") is not None
                else None
            ),
            issues=list(payload.get("issues", [])),
            report_path=str(payload.get("report_path", "")),
        )


@dataclass(frozen=True)
class BaselineThresholds:
    geocoded_ratio_drop: float = 0.02
    weather_missing_increase: int = 0
    leakage_row_increase: int = 0


@dataclass
class BaselineComparison:
    status: str
    regressions: List[str]
    warnings: List[str]
    metrics: Dict[str, Dict[str, Optional[float]]]


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
    rounded_weather_ratio = round(float(matrix.weather_coverage_ratio), 4)

    result = WeatherCoverageResult(
        tenant_id=tenant_id,
        window_start=start.isoformat(),
        window_end=end.isoformat(),
        status=status,
        join_mode=matrix.join_mode,
        geography_level=matrix.geography_level,
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
        weather_coverage_ratio=rounded_weather_ratio,
        weather_coverage_threshold=matrix.weather_coverage_threshold,
        geography_fallback_reason=matrix.geography_fallback_reason,
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
    if matrix.join_mode in {"date_global", "date_state"}:
        warning_flags.append("date_scope_fallback")
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


def _load_baseline(path: str | Path) -> Optional[Dict[str, Any]]:
    target = Path(path)
    if not target.exists():
        return None
    with target.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def compare_weather_baseline(
    current: WeatherCoverageResult,
    baseline: WeatherCoverageResult,
    *,
    thresholds: BaselineThresholds,
) -> BaselineComparison:
    regressions: List[str] = []
    warnings: List[str] = []
    metrics: Dict[str, Dict[str, Optional[float]]] = {}

    def capture_metric(key: str, current_value: Optional[float], baseline_value: Optional[float]) -> None:
        delta: Optional[float] = None
        if current_value is not None and baseline_value is not None:
            delta = round(current_value - baseline_value, 4)
        metrics[key] = {
            "current": current_value,
            "baseline": baseline_value,
            "delta": delta,
        }

    capture_metric("geocoded_order_ratio", current.geocoded_order_ratio, baseline.geocoded_order_ratio)
    capture_metric("weather_missing_rows", float(current.weather_missing_rows), float(baseline.weather_missing_rows))
    capture_metric("leakage_rows", float(current.leakage_rows), float(baseline.leakage_rows))
    capture_metric("unique_geohash_count", float(current.unique_geohash_count), float(baseline.unique_geohash_count))

    baseline_ratio = baseline.geocoded_order_ratio
    current_ratio = current.geocoded_order_ratio
    if baseline_ratio is not None:
        if current_ratio is None:
            regressions.append("Geocoded order ratio is missing while baseline reported coverage.")
        else:
            drop = baseline_ratio - current_ratio
            if drop > thresholds.geocoded_ratio_drop:
                regressions.append(
                    f"Geocoded order ratio dropped by {drop:.4f} "
                    f"(baseline {baseline_ratio:.4f} → current {current_ratio:.4f})."
                )

    missing_delta = current.weather_missing_rows - baseline.weather_missing_rows
    if missing_delta > thresholds.weather_missing_increase:
        regressions.append(
            f"Weather missing rows increased by {missing_delta} "
            f"(baseline {baseline.weather_missing_rows} → current {current.weather_missing_rows})."
        )

    leakage_delta = current.leakage_rows - baseline.leakage_rows
    if leakage_delta > thresholds.leakage_row_increase:
        regressions.append(
            f"Leakage rows increased by {leakage_delta} "
            f"(baseline {baseline.leakage_rows} → current {current.leakage_rows})."
        )

    if current.join_mode != baseline.join_mode:
        warnings.append(f"Join mode changed from '{baseline.join_mode}' to '{current.join_mode}'.")
    if current.status != baseline.status:
        warnings.append(f"Status shifted from '{baseline.status}' to '{current.status}'.")

    status = "ok"
    if regressions:
        status = "regression"
    elif warnings:
        status = "warning"

    return BaselineComparison(status=status, regressions=regressions, warnings=warnings, metrics=metrics)


def _format_metric_value(value: Optional[float]) -> str:
    if value is None:
        return "—"
    if float(value).is_integer():
        return f"{int(value)}"
    return f"{value:.4f}"


def render_baseline_markdown(
    current: WeatherCoverageResult,
    baseline: Optional[WeatherCoverageResult],
    comparison: Optional[BaselineComparison],
    *,
    baseline_notes: Optional[List[str]] = None,
) -> str:
    notes = baseline_notes or []
    lines = [
        "# Weather Feature Backfill Validation",
        "",
        f"- **Tenant:** `{current.tenant_id}`",
        f"- **Window:** {current.window_start} → {current.window_end}",
        f"- **Current Status:** `{current.status}`",
    ]

    if comparison:
        lines.append(f"- **Baseline Evaluation:** `{comparison.status}`")
    else:
        lines.append("- **Baseline Evaluation:** `not_available`")

    if notes:
        lines.append("")
        lines.append("## Baseline Notes")
        for entry in notes:
            lines.append(f"- {entry}")

    if comparison and comparison.metrics:
        lines.append("")
        lines.append("## Metric Comparison")
        lines.append("| Metric | Baseline | Current | Δ |")
        lines.append("| --- | --- | --- | --- |")
        for metric, values in comparison.metrics.items():
            baseline_value = _format_metric_value(values.get("baseline"))
            current_value = _format_metric_value(values.get("current"))
            delta_value = _format_metric_value(values.get("delta"))
            lines.append(f"| `{metric}` | {baseline_value} | {current_value} | {delta_value} |")

    findings: List[str] = []
    if comparison:
        if comparison.regressions:
            findings.append("### 🚨 Regressions")
            for item in comparison.regressions:
                findings.append(f"- {item}")
        if comparison.warnings:
            findings.append("### ⚠️ Warnings")
            for item in comparison.warnings:
                findings.append(f"- {item}")

    if findings:
        lines.append("")
        lines.extend(findings)

    lines.append("")
    lines.append("## Current Run Details")
    lines.append(f"- Report JSON: `{current.report_path}`")
    lines.append(f"- Guardrail triggered: `{current.guardrail_triggered}`")
    lines.append(f"- Issues: {current.issues if current.issues else 'none'}")

    if baseline:
        lines.append("")
        lines.append("## Baseline Snapshot")
        lines.append(f"- Window: {baseline.window_start} → {baseline.window_end}")
        lines.append(f"- Status: `{baseline.status}`")
        lines.append(f"- Guardrail triggered: `{baseline.guardrail_triggered}`")

    lines.append("")
    lines.append("_Generated by `python -m apps.worker.validation.weather` baseline mode._")
    return "\n".join(lines)


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
    parser.add_argument(
        "--baseline-path",
        help="Optional baseline JSON produced by a prior run to compare coverage metrics.",
    )
    parser.add_argument(
        "--baseline-geocoding-drop",
        type=float,
        default=BaselineThresholds().geocoded_ratio_drop,
        help="Allowed drop in geocoded order ratio before flagging a regression (default: 0.02).",
    )
    parser.add_argument(
        "--baseline-missing-increase",
        type=int,
        default=BaselineThresholds().weather_missing_increase,
        help="Allowed increase in weather_missing_rows before flagging a regression (default: 0).",
    )
    parser.add_argument(
        "--baseline-leakage-increase",
        type=int,
        default=BaselineThresholds().leakage_row_increase,
        help="Allowed increase in leakage_rows before flagging a regression (default: 0).",
    )
    parser.add_argument(
        "--markdown-report",
        help="Optional path to write a Markdown summary comparing current metrics to baseline.",
    )
    parser.add_argument(
        "--update-baseline",
        action="store_true",
        help="Persist the current run to the baseline path after evaluation.",
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

    comparison: Optional[BaselineComparison] = None
    baseline_result: Optional[WeatherCoverageResult] = None
    baseline_notes: List[str] = []
    if args.baseline_path:
        baseline_payload = _load_baseline(args.baseline_path)
        if baseline_payload is None:
            baseline_notes.append(f"Baseline not found at {args.baseline_path}.")
        else:
            baseline_result = WeatherCoverageResult.from_dict(baseline_payload)
            thresholds = BaselineThresholds(
                geocoded_ratio_drop=args.baseline_geocoding_drop,
                weather_missing_increase=args.baseline_missing_increase,
                leakage_row_increase=args.baseline_leakage_increase,
            )
            comparison = compare_weather_baseline(result, baseline_result, thresholds=thresholds)

    if args.markdown_report:
        report_path = Path(args.markdown_report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        markdown = render_baseline_markdown(
            result,
            baseline_result,
            comparison,
            baseline_notes=baseline_notes,
        )
        report_path.write_text(markdown, encoding="utf-8")

    if args.update_baseline and args.baseline_path:
        baseline_target = Path(args.baseline_path)
        baseline_target.parent.mkdir(parents=True, exist_ok=True)
        baseline_target.write_text(json.dumps(result.to_dict(), indent=2), encoding="utf-8")

    json.dump(result.to_dict(), sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
