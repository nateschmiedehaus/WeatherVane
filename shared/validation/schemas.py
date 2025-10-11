"""Schema validation helpers using jsonschema."""
from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping

import jsonschema
import polars as pl

SCHEMA_DIR = Path(__file__).resolve().parent.parent / "contracts"

_feature_schema = json.loads((SCHEMA_DIR / "feature_matrix.schema.json").read_text())
_plan_slice_schema = json.loads((SCHEMA_DIR / "plan_slice.schema.json").read_text())
_plan_status_schema = json.loads((SCHEMA_DIR / "plan_status.schema.json").read_text())
_shopify_orders_schema = json.loads((SCHEMA_DIR / "shopify_orders.schema.json").read_text())
_shopify_products_schema = json.loads((SCHEMA_DIR / "shopify_products.schema.json").read_text())
_weather_daily_schema = json.loads((SCHEMA_DIR / "weather_daily.schema.json").read_text())
_meta_ads_schema = json.loads((SCHEMA_DIR / "meta_ads.schema.json").read_text())
_google_ads_schema = json.loads((SCHEMA_DIR / "google_ads.schema.json").read_text())
_promos_schema = json.loads((SCHEMA_DIR / "promos.schema.json").read_text())

_feature_validator = jsonschema.Draft202012Validator(_feature_schema)
_plan_slice_validator = jsonschema.Draft202012Validator(_plan_slice_schema)
_plan_status_validator = jsonschema.Draft202012Validator(_plan_status_schema)
_shopify_orders_validator = jsonschema.Draft202012Validator(_shopify_orders_schema)
_shopify_products_validator = jsonschema.Draft202012Validator(_shopify_products_schema)
_weather_daily_validator = jsonschema.Draft202012Validator(_weather_daily_schema)
_meta_ads_validator = jsonschema.Draft202012Validator(_meta_ads_schema)
_google_ads_validator = jsonschema.Draft202012Validator(_google_ads_schema)
_promos_validator = jsonschema.Draft202012Validator(_promos_schema)


def validate_feature_matrix(frame: pl.DataFrame) -> None:
    if frame.is_empty():
        return
    for record in frame.head(100).to_dicts():
        _feature_validator.validate(record)


def validate_shopify_orders(records: Iterable[Mapping[str, Any]] | pl.DataFrame) -> None:
    for record in _iter_schema_records(records):
        _shopify_orders_validator.validate(record)


def validate_shopify_products(records: Iterable[Mapping[str, Any]] | pl.DataFrame) -> None:
    for record in _iter_schema_records(records):
        _shopify_products_validator.validate(record)


def validate_weather_daily(records: Iterable[Mapping[str, Any]] | pl.DataFrame) -> None:
    for record in _iter_schema_records(records):
        _weather_daily_validator.validate(record)


def validate_meta_ads(records: Iterable[Mapping[str, Any]] | pl.DataFrame) -> None:
    for record in _iter_schema_records(records):
        _meta_ads_validator.validate(record)


def validate_google_ads(records: Iterable[Mapping[str, Any]] | pl.DataFrame) -> None:
    for record in _iter_schema_records(records):
        _google_ads_validator.validate(record)


def validate_promos(records: Iterable[Mapping[str, Any]] | pl.DataFrame) -> None:
    for record in _iter_schema_records(records):
        _promos_validator.validate(record)


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


def _iter_schema_records(records: Iterable[Any] | Mapping[str, Any] | pl.DataFrame) -> Iterable[dict[str, Any]]:
    if isinstance(records, pl.DataFrame):
        yield from records.to_dicts()
        return
    if isinstance(records, Mapping):
        yield _coerce_mapping(records)
        return
    for record in records:
        if isinstance(record, pl.DataFrame):
            yield from record.to_dicts()
            continue
        yield _coerce_mapping(record)
