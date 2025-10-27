"""Shared service layer for WeatherVane applications."""

from __future__ import annotations


def _ensure_typing_extensions_sentinel() -> None:
    try:
        import typing_extensions as te  # type: ignore
    except Exception:
        return

    if hasattr(te, "Sentinel"):
        return

    class _PatchedSentinel:
        __slots__ = ("__name__",)

        def __init__(self, name: str) -> None:
            self.__name__ = name

        def __repr__(self) -> str:  # pragma: no cover - simple data holder
            return self.__name__

    def Sentinel(name: str, *, module: str | None = None) -> _PatchedSentinel:
        qualified = f"{module}.{name}" if module else name
        return _PatchedSentinel(qualified)

    te.Sentinel = Sentinel  # type: ignore[attr-defined]


_ensure_typing_extensions_sentinel()

from shared.services.data_quality import DataQualityConfig, run_data_quality_validation  # noqa: E402
from shared.services.product_taxonomy import ProductTaxonomyClassifier, ProductTaxonomyLLMResult  # noqa: E402

__all__ = [
    "onboarding",
    "ProductTaxonomyClassifier",
    "ProductTaxonomyLLMResult",
    "DataQualityConfig",
    "run_data_quality_validation",
]
