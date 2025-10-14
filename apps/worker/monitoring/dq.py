from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, MutableMapping

import statistics


Severity = str
_SEVERITY_ORDER = {"ok": 0, "warning": 1, "critical": 2}


@dataclass(frozen=True)
class MonitoringThresholds:
    """Thresholds controlling anomaly detection for ingestion data quality."""

    warning_row_drop: float = 0.5
    critical_row_drop: float = 0.2
    new_rows_warning_drop: float = 0.5
    new_rows_critical_drop: float = 0.1
    new_rows_baseline: int = 20
    zero_new_rows_warning_streak: int = 2
    zero_new_rows_critical_streak: int = 4
    geocoded_ratio_warning: float = 0.7
    geocoded_ratio_critical: float = 0.5
    history_length: int = 5


def update_dq_monitoring(
    dq_report: Mapping[str, Any],
    monitoring_path: Path | str,
    *,
    thresholds: MonitoringThresholds | None = None,
    max_history: int = 90,
) -> dict[str, Any]:
    """
    Persist a data-quality monitoring snapshot and return the most recent run.

    The monitoring file keeps a bounded history of recent runs, surfaces dataset-level
    anomalies (row-count drops, geocoding degradation, or missing payloads), and
    records overall severity so operators can detect regressions quickly.
    """

    thresholds = thresholds or MonitoringThresholds()
    path = Path(monitoring_path)
    state = _load_state(path)
    history: list[dict[str, Any]] = state.get("runs", [])

    datasets_summary: dict[str, Any] = {}
    run_alerts: list[str] = []
    overall_severity: Severity = "ok"

    for dataset_name, dataset_payload in dq_report.get("datasets", {}).items():
        summary = _summarise_dataset(
            dataset_name,
            dataset_payload,
            history,
            thresholds,
        )
        datasets_summary[dataset_name] = summary
        overall_severity = _max_severity(overall_severity, summary["severity"])
        run_alerts.extend(summary["alerts"])

    timestamp = datetime.now(timezone.utc).isoformat()
    run_entry = {
        "timestamp": timestamp,
        "tenant_id": dq_report.get("tenant_id"),
        "window": dq_report.get("window"),
        "overall_severity": overall_severity,
        "alerts": sorted(set(run_alerts)),
        "datasets": datasets_summary,
    }

    history.append(run_entry)
    if max_history and len(history) > max_history:
        del history[: len(history) - max_history]

    state["runs"] = history
    state["version"] = 1
    state["generated_at"] = timestamp

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2, sort_keys=True))
    return run_entry


def _summarise_dataset(
    name: str,
    payload: Mapping[str, Any],
    history: Iterable[Mapping[str, Any]],
    thresholds: MonitoringThresholds,
) -> MutableMapping[str, Any]:
    status = str(payload.get("status", "unknown"))
    row_count = _coerce_int(payload.get("row_count"))
    issues = list(payload.get("issues", []))
    metadata = dict(payload.get("metadata") or {})
    source = payload.get("source")
    dataset_path = payload.get("path")
    new_rows = _coerce_optional_int(metadata.get("new_rows"))
    updated_rows = _coerce_optional_int(metadata.get("updated_rows"))

    severity: Severity = "ok"
    alerts: list[str] = []

    def escalate(target: Severity) -> None:
        nonlocal severity
        severity = _max_severity(severity, target)

    def add_alert(code: str, level: Severity | None = None) -> None:
        if code not in alerts:
            alerts.append(code)
        if level:
            escalate(level)

    if status in {"missing", "empty"}:
        add_alert(f"dataset_{status}", "critical")
    elif status not in {"ok"}:
        add_alert(f"dataset_status_{status}", "warning")

    for issue in issues:
        if issue == "low_geocoded_ratio":
            add_alert("geocoded_ratio_low", "warning")
        elif issue == "no_rows_persisted":
            add_alert("no_rows_persisted", "critical")
        elif issue == "missing_geocoded_ratio":
            add_alert("missing_geocoded_ratio", "warning")
        else:
            add_alert(f"issue:{issue}", "warning")

    geocoded_ratio = _coerce_float(metadata.get("geocoded_ratio"))
    if geocoded_ratio is not None:
        if geocoded_ratio < thresholds.geocoded_ratio_critical:
            add_alert("geocoded_ratio_critical", "critical")
        elif geocoded_ratio < thresholds.geocoded_ratio_warning:
            add_alert("geocoded_ratio_warning", "warning")

    previous_row_count = _latest_metric(history, name, "row_count")
    change_pct = None
    if previous_row_count is not None and previous_row_count > 0:
        change_pct = (row_count - previous_row_count) / previous_row_count
        if row_count == 0:
            add_alert("row_count_zero", "critical")
        else:
            drop_ratio = row_count / previous_row_count
            if drop_ratio < thresholds.critical_row_drop:
                add_alert("row_count_drop_critical", "critical")
            elif drop_ratio < thresholds.warning_row_drop:
                add_alert("row_count_drop_warning", "warning")
    elif row_count == 0:
        add_alert("row_count_zero", "warning")

    row_history = _collect_history(history, name, "row_count", thresholds.history_length)
    ratio_history = _collect_history(
        history,
        name,
        ("metadata", "geocoded_ratio"),
        thresholds.history_length,
    )

    previous_new_rows = _latest_metric(
        history,
        name,
        ("metadata", "new_rows"),
    )
    new_rows_change_pct = None
    new_rows_history = _collect_history(
        history,
        name,
        ("metadata", "new_rows"),
        thresholds.history_length,
    )
    baseline_window = (
        new_rows_history[-(thresholds.history_length - 1) :]
        if thresholds.history_length > 1
        else list(new_rows_history)
    )

    if new_rows is not None:
        if previous_new_rows is not None and previous_new_rows > 0:
            new_rows_change_pct = (new_rows - previous_new_rows) / previous_new_rows
        non_zero_baseline = [value for value in baseline_window if value > 0]
        if non_zero_baseline:
            baseline = statistics.median(non_zero_baseline)
            if baseline >= thresholds.new_rows_baseline and baseline > 0:
                ratio = new_rows / baseline if baseline else 0.0
                if ratio < thresholds.new_rows_critical_drop:
                    add_alert("new_rows_drop_critical", "critical")
                elif ratio < thresholds.new_rows_warning_drop:
                    add_alert("new_rows_drop_warning", "warning")
        new_rows_history.append(new_rows)
        zero_streak = _trailing_zero_streak(new_rows_history)
        if zero_streak >= thresholds.zero_new_rows_critical_streak:
            add_alert("new_rows_zero_streak_critical", "critical")
        elif zero_streak >= thresholds.zero_new_rows_warning_streak:
            add_alert("new_rows_zero_streak_warning", "warning")

    row_history.append(row_count)
    if geocoded_ratio is not None:
        ratio_history.append(geocoded_ratio)

    metrics: dict[str, Any] = {}
    if change_pct is not None:
        metrics["row_count_change_pct"] = change_pct
    if geocoded_ratio is not None:
        metrics["geocoded_ratio"] = geocoded_ratio
    if new_rows is not None:
        metrics["new_rows"] = new_rows
        if new_rows_change_pct is not None:
            metrics["new_rows_change_pct"] = new_rows_change_pct
    if updated_rows is not None:
        metrics["updated_rows"] = updated_rows

    history_payload: dict[str, Any] = {
        "row_count": row_history,
        "geocoded_ratio": ratio_history,
    }
    if new_rows_history:
        history_payload["new_rows"] = new_rows_history

    return {
        "status": status,
        "severity": severity,
        "alerts": alerts,
        "issues": issues,
        "row_count": row_count,
        "previous_row_count": previous_row_count,
        "source": source,
        "path": dataset_path,
        "metadata": metadata,
        "metrics": metrics,
        "history": history_payload,
    }


def _collect_history(
    history: Iterable[Mapping[str, Any]],
    dataset_name: str,
    key: str | tuple[str, ...],
    history_length: int,
) -> list[Any]:
    trail: list[Any] = []
    key_path = (key,) if isinstance(key, str) else key
    for run in list(history)[-max(history_length - 1, 0) :]:
        dataset = run.get("datasets", {}).get(dataset_name)
        if not isinstance(dataset, Mapping):
            continue
        value: Any = dataset
        for segment in key_path:
            if not isinstance(value, Mapping):
                value = None
                break
            value = value.get(segment)
        if value is None:
            continue
        if isinstance(value, (int, float)):
            trail.append(value)
    return trail


def _latest_metric(
    history: Iterable[Mapping[str, Any]],
    dataset_name: str,
    metric: str | tuple[str, ...],
) -> int | None:
    metric_path = (metric,) if isinstance(metric, str) else metric
    for run in reversed(list(history)):
        dataset = run.get("datasets", {}).get(dataset_name)
        if not isinstance(dataset, Mapping):
            continue
        value: Any = dataset
        for segment in metric_path:
            if not isinstance(value, Mapping):
                value = None
                break
            value = value.get(segment)
        if isinstance(value, (int, float)):
            return int(value)
    return None


def _load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, "runs": []}
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return {"version": 1, "runs": []}


def _coerce_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _coerce_optional_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _coerce_float(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    if result != result:  # NaN guard
        return None
    return result


def _trailing_zero_streak(values: Iterable[int]) -> int:
    streak = 0
    for value in reversed(list(values)):
        if int(value) == 0:
            streak += 1
        else:
            break
    return streak


def _max_severity(first: Severity, second: Severity) -> Severity:
    return first if _SEVERITY_ORDER[first] >= _SEVERITY_ORDER[second] else second
