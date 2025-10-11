"""Performance tracking utilities."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

from shared.observability import metrics as obs_metrics

from apps.model.feedback.calibration import CoverageResult, quantile_coverage


@dataclass(frozen=True)
class PerformanceRecord:
    actual: float
    predicted_p10: float
    predicted_p50: float
    predicted_p90: float
    horizon_days: int | None = None
    timestamp: str | None = None


@dataclass(frozen=True)
class PerformanceSummary:
    mae: float
    mape: float
    mean_error: float
    coverage: CoverageResult
    coverage_by_horizon: Dict[str, CoverageResult]
    count: int

    def to_dict(self) -> Dict[str, object]:
        return {
            "mae": self.mae,
            "mape": self.mape,
            "mean_error": self.mean_error,
            "count": self.count,
            "coverage": self.coverage.to_dict(),
            "coverage_by_horizon": {
                str(h): cov.to_dict() for h, cov in self.coverage_by_horizon.items()
            },
        }


def load_performance_records(tenant_id: str, root: str | Path = "storage/metadata/performance") -> List[PerformanceRecord]:
    path = Path(root) / f"{tenant_id}.json"
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except json.JSONDecodeError:
        return []
    records: List[PerformanceRecord] = []
    for entry in data.get("records", []):
        predicted = entry.get("predicted", {})
        try:
            record = PerformanceRecord(
                actual=float(entry.get("actual")),
                predicted_p10=float(predicted.get("p10")),
                predicted_p50=float(predicted.get("p50")),
                predicted_p90=float(predicted.get("p90")),
                horizon_days=(
                    int(entry.get("horizon_days"))
                    if entry.get("horizon_days") is not None
                    else None
                ),
                timestamp=str(entry.get("timestamp")) if entry.get("timestamp") else None,
            )
        except (TypeError, ValueError):
            continue
        records.append(record)
    return records


def calculate_summary(records: Iterable[PerformanceRecord]) -> PerformanceSummary:
    actuals: List[float] = []
    predictions: List[Tuple[float, float, float]] = []
    horizons: List[int | None] = []
    for record in records:
        actuals.append(float(record.actual))
        predictions.append((float(record.predicted_p10), float(record.predicted_p50), float(record.predicted_p90)))
        horizons.append(record.horizon_days)

    if not actuals:
        raise ValueError("No performance records to summarise")

    mae = _mean([abs(actual - predicted[1]) for actual, predicted in zip(actuals, predictions)])
    mape = _mean([
        abs(actual - predicted[1]) / max(abs(actual), 1e-6) * 100
        for actual, predicted in zip(actuals, predictions)
    ])
    mean_error = _mean([actual - predicted[1] for actual, predicted in zip(actuals, predictions)])

    lower_bounds = [pred[0] for pred in predictions]
    upper_bounds = [pred[2] for pred in predictions]
    coverage = quantile_coverage(actuals, lower_bounds, upper_bounds)

    coverage_by_horizon: Dict[str, CoverageResult] = {}
    horizon_groups: Dict[int, List[int]] = {}
    for idx, horizon in enumerate(horizons):
        if horizon is None:
            continue
        horizon_groups.setdefault(int(horizon), []).append(idx)

    for horizon, indices in horizon_groups.items():
        actual_subset = [actuals[i] for i in indices]
        lower_subset = [lower_bounds[i] for i in indices]
        upper_subset = [upper_bounds[i] for i in indices]
        coverage_by_horizon[str(horizon)] = quantile_coverage(actual_subset, lower_subset, upper_subset)

    return PerformanceSummary(
        mae=mae,
        mape=mape,
        mean_error=mean_error,
        coverage=coverage,
        coverage_by_horizon=coverage_by_horizon,
        count=len(actuals),
    )


def prepare_backtest(records: Iterable[PerformanceRecord]) -> List[Dict[str, object]]:
    """Prepare a chronological backtest timeline for UI consumption."""

    timeline: List[Dict[str, object]] = []
    cumulative_actual = 0.0
    cumulative_predicted = 0.0

    sortable_records = sorted(
        records,
        key=lambda record: (record.timestamp or "", record.horizon_days or 0),
    )

    for record in sortable_records:
        actual = float(record.actual)
        predicted = float(record.predicted_p50)
        cumulative_actual += actual
        cumulative_predicted += predicted

        point: Dict[str, object] = {
            "timestamp": record.timestamp,
            "horizon_days": record.horizon_days,
            "actual": actual,
            "predicted": predicted,
            "error": predicted - actual,
            "absolute_error": abs(predicted - actual),
            "cumulative_actual": cumulative_actual,
            "cumulative_predicted": cumulative_predicted,
        }

        if cumulative_actual != 0:
            point["cumulative_lift"] = cumulative_predicted - cumulative_actual
            point["cumulative_lift_pct"] = (cumulative_predicted / cumulative_actual) - 1
        else:
            point["cumulative_lift"] = None
            point["cumulative_lift_pct"] = None

        timeline.append(point)

    return timeline


def _mean(values: Iterable[float]) -> float:
    values = list(values)
    if not values:
        return 0.0
    return sum(values) / len(values)


def run_performance_check(
    tenant_id: str,
    *,
    root: str | Path = "storage/metadata/performance",
    coverage_threshold: float = 0.8,
    emit_metrics: bool = True,
) -> Dict[str, object]:
    records = load_performance_records(tenant_id, root=root)
    if not records:
        return {"status": "missing_data", "tenant_id": tenant_id}
    summary = calculate_summary(records)
    failing_horizons = [
        horizon
        for horizon, cov in summary.coverage_by_horizon.items()
        if cov.coverage < coverage_threshold
    ]
    status = "ok"
    if summary.coverage.coverage < coverage_threshold or failing_horizons:
        status = "coverage_below_threshold"
    payload = {
        "status": status,
        "tenant_id": tenant_id,
        "summary": summary.to_dict(),
        "coverage_threshold": coverage_threshold,
        "failing_horizons": failing_horizons,
    }
    if emit_metrics:
        obs_metrics.emit(
            "performance.check",
            {
                "coverage": summary.coverage.coverage,
                "mae": summary.mae,
                "mape": summary.mape,
                "mean_error": summary.mean_error,
                "count": summary.count,
                "failing_horizons": failing_horizons,
            },
            tags={
                "tenant_id": tenant_id,
                "status": status,
            },
        )
    return payload
