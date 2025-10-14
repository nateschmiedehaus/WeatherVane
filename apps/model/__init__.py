"""Model training package exports with lazy imports to avoid heavy dependencies."""

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
    "BrandSafetyPolicy",
    "generate_response_report",
    "generate_synthetic_creative_dataset",
    "score_creatives",
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
    creative_exports = {
        "BrandSafetyPolicy",
        "generate_response_report",
        "generate_synthetic_creative_dataset",
        "score_creatives",
    }
    if name in creative_exports:
        from .creative_response import (
            BrandSafetyPolicy,
            generate_response_report,
            generate_synthetic_creative_dataset,
            score_creatives,
        )

        globals().update(
            {
                "BrandSafetyPolicy": BrandSafetyPolicy,
                "generate_response_report": generate_response_report,
                "generate_synthetic_creative_dataset": generate_synthetic_creative_dataset,
                "score_creatives": score_creatives,
            }
        )
        return globals()[name]
    raise AttributeError(f"module 'apps.model' has no attribute {name!r}")
