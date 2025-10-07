"""Common ingestion interfaces.

This module keeps the ingestion surface area small and predictable so any engineer can
swap connectors or add new data sources without touching the rest of the pipeline.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable, Mapping, Protocol

from shared.libs.storage.lake import LakeWriter


@dataclass
class IngestionSummary:
    """Simple summary returned by all ingestors."""

    path: str
    row_count: int
    source: str


class PaginatableConnector(Protocol):
    """Minimal protocol required for REST pagination."""

    async def fetch(self, resource: str, **params: Any) -> Mapping[str, Any]:
        ...


@dataclass
class BaseIngestor:
    """Parent class providing helpers shared across ingestors."""

    writer: LakeWriter

    def _write_records(self, dataset: str, rows: Iterable[Mapping[str, Any]], source: str = "stub") -> IngestionSummary:
        materialised = list(rows)
        path = self.writer.write_records(dataset, materialised)
        return IngestionSummary(path=str(path), row_count=len(materialised), source=source)


def iso(dt: datetime) -> str:
    return dt.isoformat()
