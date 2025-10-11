"""Model training package exports with lazy imports to avoid heavy dependencies at import time."""

from . import causal_uplift as _causal_uplift

__all__ = [
    "MMMModel",
    "fit_mmm_model",
    "lightweightmmm_available",
    "CausalUpliftModel",
    "IncrementalLiftReport",
    "fit_causal_uplift",
    "validate_incremental_lift",
    "generate_synthetic_dataset",
    "compute_synthetic_report",
    "save_report_as_json",
    "EnsembleResult",
    "ForecastPoint",
    "run_multi_horizon_ensemble",
    "save_ensemble_metrics_as_json",
]


def __getattr__(name):
    if name in {"MMMModel", "fit_mmm_model"}:
        from .mmm import MMMModel, fit_mmm_model

        globals().update({
            "MMMModel": MMMModel,
            "fit_mmm_model": fit_mmm_model,
        })
        return globals()[name]
    if name == "lightweightmmm_available":
        from .mmm_lightweight import available

        globals()["lightweightmmm_available"] = available
        return available
    uplift_exports = {
        "CausalUpliftModel",
        "IncrementalLiftReport",
        "fit_causal_uplift",
        "validate_incremental_lift",
        "generate_synthetic_dataset",
        "compute_synthetic_report",
        "save_report_as_json",
    }
    if name in uplift_exports:
        from .causal_uplift import (
            CausalUpliftModel,
            IncrementalLiftReport,
            compute_synthetic_report,
            fit_causal_uplift,
            generate_synthetic_dataset,
            save_report_as_json,
            validate_incremental_lift,
        )

        globals().update(
            {
                "CausalUpliftModel": CausalUpliftModel,
                "IncrementalLiftReport": IncrementalLiftReport,
                "fit_causal_uplift": fit_causal_uplift,
                "validate_incremental_lift": validate_incremental_lift,
                "generate_synthetic_dataset": generate_synthetic_dataset,
                "compute_synthetic_report": compute_synthetic_report,
                "save_report_as_json": save_report_as_json,
            }
        )
        return globals()[name]
    if name in {
        "EnsembleResult",
        "ForecastPoint",
        "run_multi_horizon_ensemble",
        "save_ensemble_metrics_as_json",
    }:
        from .ensemble import (
            EnsembleResult,
            ForecastPoint,
            run_multi_horizon_ensemble,
            save_ensemble_metrics_as_json,
        )

        globals().update(
            {
                "EnsembleResult": EnsembleResult,
                "ForecastPoint": ForecastPoint,
                "run_multi_horizon_ensemble": run_multi_horizon_ensemble,
                "save_ensemble_metrics_as_json": save_ensemble_metrics_as_json,
            }
        )
        return globals()[name]
    raise AttributeError(f"module 'apps.model' has no attribute {name!r}")


globals().update(
    {
        "CausalUpliftModel": _causal_uplift.CausalUpliftModel,
        "IncrementalLiftReport": _causal_uplift.IncrementalLiftReport,
        "fit_causal_uplift": _causal_uplift.fit_causal_uplift,
        "validate_incremental_lift": _causal_uplift.validate_incremental_lift,
        "generate_synthetic_dataset": _causal_uplift.generate_synthetic_dataset,
        "compute_synthetic_report": _causal_uplift.compute_synthetic_report,
        "save_report_as_json": _causal_uplift.save_report_as_json,
    }
)
