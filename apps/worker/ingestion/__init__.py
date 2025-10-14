"""Ingestion package exports and conventions.

Every ingestor returns an :class:`IngestionSummary` so downstream flows have a consistent
contract (path + row count + data source). Modules should inherit from
:class:`BaseIngestor` when possible.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from .base import BaseIngestor, IngestionSummary

if TYPE_CHECKING:
    from .shopify import ShopifyIngestor  # pragma: no cover

__all__ = ["BaseIngestor", "IngestionSummary", "ShopifyIngestor"]


def __getattr__(name: str) -> Any:
    if name == "ShopifyIngestor":
        # Delay importing Shopify dependencies (numpy/pgeocode) until explicitly requested.
        from .shopify import ShopifyIngestor

        return ShopifyIngestor
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
