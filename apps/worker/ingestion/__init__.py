"""Ingestion package exports and conventions.

Every ingestor returns an :class:`IngestionSummary` so downstream flows have a consistent
contract (path + row count + data source). Modules should inherit from
:class:`BaseIngestor` when possible.
"""
from .base import BaseIngestor, IngestionSummary
from .shopify import ShopifyIngestor

__all__ = ["BaseIngestor", "IngestionSummary", "ShopifyIngestor"]
