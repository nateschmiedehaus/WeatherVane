from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


DEFAULT_FAIL_ALERTS: tuple[str, ...] = (
    "dataset_missing",
    "dataset_status_missing",
    "dataset_status_empty",
    "no_rows_persisted",
    "geocoded_ratio_critical",
    "row_count_zero",
    "row_count_drop_critical",
    "new_rows_drop_critical",
    "new_rows_zero_streak_critical",
)
DEFAULT_WARNING_ALERTS: tuple[str, ...] = (
    "geocoded_ratio_warning",
    "row_count_drop_warning",
    "new_rows_drop_warning",
    "new_rows_zero_streak_warning",
    "dataset_status_stub",
)


@dataclass(frozen=True)
class ModelingWatchConfig:
    """Configuration for modeling data watch guardrail."""

    max_staleness_hours: int = 36
    fail_alerts: tuple[str, ...] = DEFAULT_FAIL_ALERTS
    warning_alerts: tuple[str, ...] = DEFAULT_WARNING_ALERTS
    min_runs: int = 1

    def fail_alert_set(self) -> set[str]:
        return set(self.fail_alerts)

    def warning_alert_set(self) -> set[str]:
        return set(self.warning_alerts)


class ModelingDataWatchError(RuntimeError):
    """Raised when modeling data watch detects a critical issue."""


def _load_monitoring_payload(path: Path) -> Mapping[str, Any]:
    if not path.exists():
        raise ModelingDataWatchError(f"Monitoring snapshot not found at {path}.")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive guard
        raise ModelingDataWatchError(f"Failed to parse monitoring snapshot at {path}: {exc}") from exc


def _latest_run(
    payload: Mapping[str, Any],
    *,
    min_runs: int,
) -> Mapping[str, Any]:
    runs = payload.get("runs")
    if not isinstance(runs, list) or len(runs) < min_runs:
        raise ModelingDataWatchError("Insufficient monitoring history to evaluate guardrail.")
    return runs[-1]


def _parse_timestamp(value: Any) -> datetime:
    if not isinstance(value, str):
        raise ModelingDataWatchError("Monitoring run missing timestamp.")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ModelingDataWatchError(f"Invalid monitoring timestamp: {value}") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def run_modeling_data_watch(
    monitoring_path: str | Path = "state/dq_monitoring.json",
    summary_path: str | Path = "state/analytics/modeling_data_watch.json",
    *,
    config: ModelingWatchConfig | None = None,
    now: datetime | None = None,
) -> Mapping[str, Any]:
    """
    Evaluate recent ingestion telemetry for modeling guardrails.

    Persists a summary JSON and raises ModelingDataWatchError when critical
    issues are identified.
    """

    config = config or ModelingWatchConfig()
    monitoring_file = Path(monitoring_path)
    summary_file = Path(summary_path)
    summary_file.parent.mkdir(parents=True, exist_ok=True)

    payload = _load_monitoring_payload(monitoring_file)
    run_payload = _latest_run(payload, min_runs=config.min_runs)

    run_timestamp = _parse_timestamp(run_payload.get("timestamp"))
    current_time = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    age_hours = (current_time - run_timestamp).total_seconds() / 3600.0

    issues: list[str] = []
    warnings: list[str] = []
    datasets_summary: dict[str, Any] = {}

    if age_hours > config.max_staleness_hours:
        issues.append(
            f"Latest monitoring snapshot is {age_hours:.1f}h old (max {config.max_staleness_hours}h)."
        )

    overall_severity = str(run_payload.get("overall_severity", "unknown"))
    overall_alerts = sorted(set(str(alert) for alert in run_payload.get("alerts", []) if isinstance(alert, str)))
    if overall_severity == "critical":
        issues.append("Overall data-quality severity is critical.")

    fail_alerts = config.fail_alert_set()
    warning_alerts = config.warning_alert_set()

    datasets = run_payload.get("datasets") or {}
    if not isinstance(datasets, Mapping):
        raise ModelingDataWatchError("Monitoring snapshot missing dataset breakdown.")

    for dataset_name, dataset_payload in sorted(datasets.items()):
        if not isinstance(dataset_payload, Mapping):
            continue

        dataset_issues: list[str] = []
        dataset_warnings: list[str] = []
        dataset_severity = str(dataset_payload.get("severity", "unknown"))
        dataset_alerts = sorted(
            set(str(alert) for alert in dataset_payload.get("alerts", []) if isinstance(alert, str))
        )

        alert_set = set(dataset_alerts)
        failing = sorted(alert_set & fail_alerts)
        cautionary = sorted(alert_set & warning_alerts)

        if dataset_severity == "critical":
            dataset_issues.append("Dataset severity marked critical.")
        if failing:
            dataset_issues.append(f"Failing alerts: {', '.join(failing)}.")
        if cautionary:
            dataset_warnings.append(f"Warning alerts: {', '.join(cautionary)}.")

        metrics = {
            "row_count": dataset_payload.get("row_count"),
            "metadata": dataset_payload.get("metadata"),
            "status": dataset_payload.get("status"),
            "source": dataset_payload.get("source"),
        }

        datasets_summary[dataset_name] = {
            "severity": dataset_severity,
            "alerts": dataset_alerts,
            "issues": dataset_issues,
            "warnings": dataset_warnings,
            "metrics": metrics,
        }

        issues.extend(f"For {dataset_name}: {issue}" for issue in dataset_issues)
        warnings.extend(f"For {dataset_name}: {warning}" for warning in dataset_warnings)

    status = "critical" if issues else ("warning" if warnings else "ok")
    summary = {
        "status": status,
        "evaluated_at": current_time.isoformat(),
        "run_timestamp": run_timestamp.isoformat(),
        "age_hours": age_hours,
        "overall_severity": overall_severity,
        "overall_alerts": overall_alerts,
        "issues": issues,
        "warnings": warnings,
        "datasets": datasets_summary,
        "monitoring_path": str(monitoring_file),
    }

    summary_file.write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")

    if issues:
        raise ModelingDataWatchError(json.dumps(summary, indent=2, sort_keys=True))

    return summary


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run modeling data watch guardrail.")
    parser.add_argument(
        "--monitoring-path",
        default="state/dq_monitoring.json",
        help="Path to the consolidated data-quality monitoring snapshot.",
    )
    parser.add_argument(
        "--summary-path",
        default="state/analytics/modeling_data_watch.json",
        help="Destination for guardrail summary JSON.",
    )
    parser.add_argument(
        "--max-staleness-hours",
        type=int,
        default=ModelingWatchConfig().max_staleness_hours,
        help="Maximum age (in hours) allowed for the latest monitoring snapshot.",
    )
    parser.add_argument(
        "--min-runs",
        type=int,
        default=ModelingWatchConfig().min_runs,
        help="Minimum number of runs required before evaluating guardrail.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    config = ModelingWatchConfig(
        max_staleness_hours=args.max_staleness_hours,
        min_runs=args.min_runs,
    )

    try:
        summary = run_modeling_data_watch(
            monitoring_path=args.monitoring_path,
            summary_path=args.summary_path,
            config=config,
        )
    except ModelingDataWatchError as exc:
        print(exc, file=sys.stderr)
        return 1

    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv[1:]))
