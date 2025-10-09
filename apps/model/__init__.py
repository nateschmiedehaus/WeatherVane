"""Model training package exports with lazy imports to avoid heavy dependencies at import time."""

__all__ = ["MMMModel", "fit_mmm_model", "lightweightmmm_available"]


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
    raise AttributeError(f"module 'apps.model' has no attribute {name!r}")
