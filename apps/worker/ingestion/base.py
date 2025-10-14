"""Common ingestion interfaces.

This module keeps the ingestion surface area small and predictable so any engineer can
swap connectors or add new data sources without touching the rest of the pipeline.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Iterable, Mapping, Protocol, Sequence, Tuple

from shared.libs.storage.lake import LakeWriter, read_parquet


@dataclass
class IngestionSummary:
    """Simple summary returned by all ingestors."""

    path: str
    row_count: int
    source: str
    metadata: dict[str, Any] = field(default_factory=dict)


class PaginatableConnector(Protocol):
    """Minimal protocol required for REST pagination."""

    async def fetch(self, resource: str, **params: Any) -> Mapping[str, Any]:
        ...


@dataclass
class BaseIngestor:
    """Parent class providing helpers shared across ingestors."""

    writer: LakeWriter

    def _write_records(
        self,
        dataset: str,
        rows: Iterable[Mapping[str, Any]],
        source: str = "stub",
        metadata: Mapping[str, Any] | None = None,
    ) -> IngestionSummary:
        materialised = list(rows)
        path = self.writer.write_records(dataset, materialised)
        return IngestionSummary(
            path=str(path),
            row_count=len(materialised),
            source=source,
            metadata=dict(metadata or {}),
        )

    def _write_incremental(
        self,
        dataset: str,
        rows: Iterable[Mapping[str, Any]],
        unique_keys: Sequence[str] | None,
        *,
        source: str = "stub",
        metadata: Mapping[str, Any] | None = None,
    ) -> IngestionSummary:
        materialised = [dict(row) for row in rows]
        combined_rows, new_rows, updated_rows = self._merge_incremental(
            dataset, materialised, unique_keys or ()
        )
        final_metadata = dict(metadata or {})
        final_metadata.update(
            {
                "new_rows": new_rows,
                "updated_rows": updated_rows,
                "total_rows": len(combined_rows),
            }
        )
        path = self.writer.write_records(dataset, combined_rows)
        return IngestionSummary(
            path=str(path),
            row_count=new_rows + updated_rows,
            source=source,
            metadata=final_metadata,
        )

    def _merge_incremental(
        self,
        dataset: str,
        rows: Iterable[Mapping[str, Any]],
        unique_keys: Sequence[str],
    ) -> Tuple[list[dict[str, Any]], int, int]:
        latest = self.writer.latest(dataset)
        existing: dict[Tuple[Any, ...], dict[str, Any]] = {}
        if latest:
            frame = read_parquet(latest)
            for record in frame.to_dicts():
                key = self._build_key(record, unique_keys)
                existing[key] = record

        new_map: dict[Tuple[Any, ...], dict[str, Any]] = {}
        for row in rows:
            key = self._build_key(row, unique_keys)
            new_map[key] = dict(row)

        new_rows = 0
        updated_rows = 0
        for key, record in new_map.items():
            if key in existing:
                if existing[key] != record:
                    updated_rows += 1
                    existing[key] = record
            else:
                new_rows += 1
                existing[key] = record

        combined_rows = list(existing.values())
        return combined_rows, new_rows, updated_rows

    @staticmethod
    def _build_key(row: Mapping[str, Any], unique_keys: Sequence[str]) -> Tuple[Any, ...]:
        if not unique_keys:
            return tuple(sorted(row.items()))
        return tuple(row.get(key) for key in unique_keys)


def iso(dt: datetime) -> str:
    return dt.isoformat()
