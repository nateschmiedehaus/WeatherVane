"""Data context data structures."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping


@dataclass
class ProfileFinding:
    """Single data-quality finding with severity and remediation hint."""

    code: str
    severity: str
    message: str
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DatasetProfile:
    """Captured stats for a dataset within a tenant context."""

    name: str
    row_count: int
    null_ratios: Dict[str, float]
    latest_timestamp: datetime | None
    coverage: Dict[str, float]
    findings: List[ProfileFinding] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "row_count": self.row_count,
            "null_ratios": self.null_ratios,
            "latest_timestamp": self.latest_timestamp.isoformat() if self.latest_timestamp else None,
            "coverage": self.coverage,
            "findings": [finding.__dict__ for finding in self.findings],
        }


@dataclass
class ContextSnapshot:
    """Summary of data context for a tenant/run with derived tags."""

    tenant_id: str
    created_at: datetime
    dataset_profiles: List[DatasetProfile]
    tags: List[str]
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tenant_id": self.tenant_id,
            "created_at": self.created_at.isoformat(),
            "dataset_profiles": [profile.to_dict() for profile in self.dataset_profiles],
            "tags": self.tags,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> ContextSnapshot:
        tenant_id = str(payload.get("tenant_id"))
        created_at = datetime.fromisoformat(payload.get("created_at")) if payload.get("created_at") else datetime.utcnow()
        profiles_payload = payload.get("dataset_profiles", [])
        profiles: List[DatasetProfile] = []
        for item in profiles_payload:
            if not isinstance(item, Mapping):
                continue
            findings = [
                ProfileFinding(**finding)
                for finding in item.get("findings", [])
                if isinstance(finding, Mapping)
            ]
            profile = DatasetProfile(
                name=str(item.get("name")),
                row_count=int(item.get("row_count", 0)),
                null_ratios=dict(item.get("null_ratios", {})),
                latest_timestamp=datetime.fromisoformat(item["latest_timestamp"]) if item.get("latest_timestamp") else None,
                coverage=dict(item.get("coverage", {})),
                findings=findings,
            )
            profiles.append(profile)
        tags = [str(tag) for tag in payload.get("tags", [])]
        metadata = dict(payload.get("metadata", {}))
        return cls(tenant_id=tenant_id, created_at=created_at, dataset_profiles=profiles, tags=tags, metadata=metadata)


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def compute_null_ratios(frame: Mapping[str, Iterable[Any]]) -> Dict[str, float]:
    ratios: Dict[str, float] = {}
    for key, series in frame.items():
        if not isinstance(series, Iterable):  # pragma: no cover - safety
            continue
        total = 0
        nulls = 0
        for value in series:
            total += 1
            if value is None or value == "":
                nulls += 1
        ratios[key] = nulls / total if total else 0.0
    return ratios


def build_profile_from_polars(name: str, frame: Any) -> DatasetProfile:
    """Create a DatasetProfile from a Polars DataFrame."""

    try:
        import polars as pl  # local import to avoid mandatory dependency at module load
    except Exception:  # pragma: no cover - no polars installed
        raise RuntimeError("Polars is required to profile frames")

    if not isinstance(frame, pl.DataFrame):  # pragma: no cover - developer misuse
        raise TypeError("frame must be a polars.DataFrame")

    row_count = int(frame.height)

    null_ratios: Dict[str, float] = {}
    coverage: Dict[str, float] = {}
    latest_ts: datetime | None = None

    if row_count:
        for column in frame.columns:
            series = frame.get_column(column)
            null_ratio = float(series.null_count() / row_count)
            null_ratios[column] = null_ratio

        for column in frame.columns:
            series = frame.get_column(column)
            unique = series.n_unique()
            coverage[column] = float(unique) / row_count if row_count else 0.0

        ts_candidates = [col for col in frame.columns if "date" in col or col.endswith("_at")]
        for col in ts_candidates:
            series = frame.get_column(col)
            try:
                maybe = series.drop_nulls()
                if maybe.is_empty():
                    continue
                value = maybe.max()
                if isinstance(value, datetime):
                    latest_ts = max(latest_ts or value, value)
            except Exception:  # pragma: no cover - safe guard
                continue

    coverage = {k: min(max(v, 0.0), 1.0) for k, v in coverage.items()}

    return DatasetProfile(
        name=name,
        row_count=row_count,
        null_ratios=null_ratios,
        latest_timestamp=latest_ts,
        coverage=coverage,
    )
