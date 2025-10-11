from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping, Sequence

import polars as pl


@dataclass
class LakeWriter:
    root: Path | str = Path("storage/lake/raw")

    def __post_init__(self) -> None:
        self.root = Path(self.root)
        self.root.mkdir(parents=True, exist_ok=True)

    def write_records(self, dataset: str, records: Sequence[Mapping[str, Any]]) -> Path:
        """Persist records to Parquet under storage/lake/raw/<dataset>/timestamp.parquet.

        This is a convenience shim for the prototype: downstream consumers can read
        the latest Parquet file for a dataset. In production we may evolve to Delta Lake
        or Iceberg—but the API stays similar.
        """

        if not records:
            # Create an empty frame with no rows to keep pipeline consistent.
            frame = pl.DataFrame([])
        else:
            frame = pl.DataFrame(records)

        dataset_dir = self.root / dataset
        dataset_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.utcnow().isoformat().replace(":", "-")
        path = dataset_dir / f"{timestamp}.parquet"
        frame.write_parquet(path, compression="zstd")
        return path

    def latest(self, dataset: str) -> Path | None:
        dataset_dir = self.root / dataset
        if not dataset_dir.exists():
            return None
        newest_path: Path | None = None
        newest_mtime = float("-inf")
        for candidate in dataset_dir.glob("*.parquet"):
            try:
                mtime = candidate.stat().st_mtime
            except FileNotFoundError:
                continue
            if mtime > newest_mtime:
                newest_mtime = mtime
                newest_path = candidate
        return newest_path


def read_parquet(path: Path) -> pl.DataFrame:
    return pl.read_parquet(path)
