from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Path

from shared.schemas.incrementality import BacktestPoint, IncrementalityDesign, IncrementalityReport, IncrementalitySummary
from apps.worker.validation import load_experiment_results
from apps.model.feedback.tracker import (
    load_performance_records,
    prepare_backtest,
    run_performance_check,
)

router = APIRouter()


@router.get("/{tenant_id}", response_model=IncrementalityReport)
def get_experiment_report(
    tenant_id: str = Path(..., description="Tenant identifier"),
) -> IncrementalityReport:
    payload = load_experiment_results(tenant_id)
    design_payload = payload.get("design") if isinstance(payload, dict) else None
    summary_payload = payload.get("summary") if isinstance(payload, dict) else None
    generated_at = payload.get("generated_at") if isinstance(payload, dict) else None

    design = IncrementalityDesign.from_payload(design_payload or {"status": "missing"})
    summary = IncrementalitySummary(**summary_payload) if isinstance(summary_payload, dict) else None

    performance_summary = None
    backtest = None
    try:
        performance_summary = run_performance_check(tenant_id, emit_metrics=False)
    except Exception:  # pragma: no cover - best-effort
        performance_summary = None

    try:
        records = load_performance_records(tenant_id)
        if records:
            timeline = prepare_backtest(records)
            backtest = []
            for point in timeline:
                timestamp_raw = point.get("timestamp")
                timestamp = None
                if isinstance(timestamp_raw, str):
                    try:
                        timestamp = datetime.fromisoformat(timestamp_raw.replace("Z", "+00:00"))
                    except ValueError:
                        timestamp = None
                backtest.append(
                    BacktestPoint(
                        timestamp=timestamp,
                        horizon_days=point.get("horizon_days"),
                        actual=float(point.get("actual", 0.0)),
                        predicted=float(point.get("predicted", 0.0)),
                        error=float(point.get("error", 0.0)),
                        absolute_error=float(point.get("absolute_error", 0.0)),
                        cumulative_actual=float(point.get("cumulative_actual", 0.0)),
                        cumulative_predicted=float(point.get("cumulative_predicted", 0.0)),
                        cumulative_lift=point.get("cumulative_lift"),
                        cumulative_lift_pct=point.get("cumulative_lift_pct"),
                    )
                )
    except Exception:  # pragma: no cover - best-effort
        backtest = None

    return IncrementalityReport(
        tenant_id=tenant_id,
        generated_at=generated_at or design.generated_at,
        design=design,
        summary=summary,
        performance_summary=performance_summary,
        backtest=backtest,
    )
