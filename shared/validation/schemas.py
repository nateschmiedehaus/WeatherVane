"""Schema validation helpers using jsonschema."""
from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any, Iterable

import jsonschema
import polars as pl

SCHEMA_DIR = Path(__file__).resolve().parent.parent / "contracts"

_feature_schema = json.loads((SCHEMA_DIR / "feature_matrix.schema.json").read_text())
_plan_slice_schema = json.loads((SCHEMA_DIR / "plan_slice.schema.json").read_text())
_plan_status_schema = json.loads((SCHEMA_DIR / "plan_status.schema.json").read_text())

_feature_validator = jsonschema.Draft202012Validator(_feature_schema)
_plan_slice_validator = jsonschema.Draft202012Validator(_plan_slice_schema)
_plan_status_validator = jsonschema.Draft202012Validator(_plan_status_schema)


def validate_feature_matrix(frame: pl.DataFrame) -> None:
    if frame.is_empty():
        return
    for record in frame.head(100).to_dicts():
        _feature_validator.validate(record)


def _coerce_mapping(payload: Any) -> dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump()  # type: ignore[attr-defined]
    if isinstance(payload, dict):
        return payload
    if is_dataclass(payload):
        return asdict(payload)
    if hasattr(payload, "_asdict"):
        return dict(payload._asdict())  # type: ignore[attr-defined]
    if isinstance(payload, Iterable):
        try:
            return dict(payload)
        except Exception as exc:  # pragma: no cover - defensive
            raise TypeError("Plan slice payload must be mapping-compatible") from exc
    raise TypeError("Plan slice payload must be mapping-compatible")


def validate_plan_slices(slices: Iterable[Any]) -> None:
    for slice_ in slices:
        mapping = _coerce_mapping(slice_)
        _plan_slice_validator.validate(mapping)
        status = mapping.get("status")
        if status is not None:
            _plan_status_validator.validate(status)
