"""Schema validation helpers using jsonschema."""
from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping

from enum import Enum

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
_catalog_response_schema = json.loads((SCHEMA_DIR / "catalog_response.schema.json").read_text())
_stories_response_schema = json.loads((SCHEMA_DIR / "stories_response.schema.json").read_text())
_automation_settings_response_schema = json.loads(
    (SCHEMA_DIR / "automation_settings_response.schema.json").read_text()
)
_data_request_response_schema = json.loads(
    (SCHEMA_DIR / "data_request_response.schema.json").read_text()
)
_onboarding_progress_response_schema = json.loads(
    (SCHEMA_DIR / "onboarding_progress_response.schema.json").read_text()
)

_feature_validator = jsonschema.Draft202012Validator(_feature_schema)
_plan_slice_validator = jsonschema.Draft202012Validator(_plan_slice_schema)
_plan_status_validator = jsonschema.Draft202012Validator(_plan_status_schema)
_shopify_orders_validator = jsonschema.Draft202012Validator(_shopify_orders_schema)
_shopify_products_validator = jsonschema.Draft202012Validator(_shopify_products_schema)
_weather_daily_validator = jsonschema.Draft202012Validator(_weather_daily_schema)
_meta_ads_validator = jsonschema.Draft202012Validator(_meta_ads_schema)
_google_ads_validator = jsonschema.Draft202012Validator(_google_ads_schema)
_promos_validator = jsonschema.Draft202012Validator(_promos_schema)
_catalog_response_validator = jsonschema.Draft202012Validator(_catalog_response_schema)
_stories_response_validator = jsonschema.Draft202012Validator(_stories_response_schema)
_automation_settings_response_validator = jsonschema.Draft202012Validator(
    _automation_settings_response_schema
)
_data_request_response_validator = jsonschema.Draft202012Validator(
    _data_request_response_schema
)
_onboarding_progress_response_validator = jsonschema.Draft202012Validator(
    _onboarding_progress_response_schema
)


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


def _ensure_primitive(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _ensure_primitive_mapping(payload: Mapping[str, Any]) -> dict[str, Any]:
    return {key: _ensure_primitive(value) for key, value in payload.items()}


def validate_catalog_response(payload: Any) -> None:
    mapping = _coerce_mapping(payload)
    normalised = dict(mapping)
    categories = mapping.get("categories") or []
    normalised["categories"] = [_coerce_mapping(item) for item in categories]
    warnings = mapping.get("context_warnings") or []
    normalised["context_warnings"] = [_coerce_mapping(item) for item in warnings]
    normalised["generated_at"] = _ensure_primitive(mapping.get("generated_at"))
    _catalog_response_validator.validate(normalised)


def validate_stories_response(payload: Any) -> None:
    mapping = _coerce_mapping(payload)
    normalised = dict(mapping)
    stories = mapping.get("stories") or []
    normalised["stories"] = [
        {
            **_coerce_mapping(item),
            "plan_date": _ensure_primitive(getattr(item, "plan_date", None))
            if not isinstance(item, Mapping)
            else _ensure_primitive(_coerce_mapping(item).get("plan_date")),
            "confidence": _ensure_primitive(
                getattr(item, "confidence", None)
                if not isinstance(item, Mapping)
                else _coerce_mapping(item).get("confidence")
            ),
        }
        for item in stories
    ]
    warnings = mapping.get("context_warnings") or []
    normalised["context_warnings"] = [_coerce_mapping(item) for item in warnings]
    normalised["generated_at"] = _ensure_primitive(mapping.get("generated_at"))
    _stories_response_validator.validate(normalised)


def _normalize_guardrails(payload: Any) -> dict[str, Any]:
    guardrails = _coerce_mapping(payload or {})
    guardrails = dict(guardrails)
    windows = guardrails.get("change_windows") or []
    guardrails["change_windows"] = [str(item) for item in windows]
    guardrails["max_daily_budget_delta_pct"] = _ensure_primitive(
        guardrails.get("max_daily_budget_delta_pct")
    )
    guardrails["min_daily_spend"] = _ensure_primitive(guardrails.get("min_daily_spend"))
    guardrails["roas_floor"] = _ensure_primitive(guardrails.get("roas_floor"))
    guardrails["cpa_ceiling"] = _ensure_primitive(guardrails.get("cpa_ceiling"))
    return guardrails


def _normalize_consent(payload: Any) -> dict[str, Any]:
    consent = _coerce_mapping(payload or {})
    normalised = dict(consent)
    normalised["status"] = _ensure_primitive(consent.get("status"))
    normalised["granted_at"] = _ensure_primitive(consent.get("granted_at"))
    normalised["revoked_at"] = _ensure_primitive(consent.get("revoked_at"))
    normalised["actor"] = _ensure_primitive(consent.get("actor"))
    if "channel" in consent:
        normalised["channel"] = _ensure_primitive(consent.get("channel"))
    return normalised


def _normalize_automation_settings(payload: Any) -> dict[str, Any]:
    settings = _coerce_mapping(payload or {})
    normalised = dict(settings)
    normalised["guardrails"] = _normalize_guardrails(settings.get("guardrails"))
    normalised["consent"] = _normalize_consent(settings.get("consent"))
    tags = normalised.get("data_context_tags") or []
    normalised["data_context_tags"] = [str(item) for item in tags]
    normalised["mode"] = _ensure_primitive(settings.get("mode"))
    normalised["last_export_at"] = _ensure_primitive(settings.get("last_export_at"))
    normalised["last_delete_at"] = _ensure_primitive(settings.get("last_delete_at"))
    normalised["last_updated_at"] = _ensure_primitive(settings.get("last_updated_at"))
    normalised["updated_by"] = _ensure_primitive(settings.get("updated_by"))
    normalised["push_window_start_utc"] = _ensure_primitive(
        settings.get("push_window_start_utc")
    )
    normalised["push_window_end_utc"] = _ensure_primitive(
        settings.get("push_window_end_utc")
    )
    normalised["retention_days"] = _ensure_primitive(settings.get("retention_days"))
    normalised["notes"] = _ensure_primitive(settings.get("notes"))
    return normalised


def validate_automation_settings_response(payload: Any) -> None:
    mapping = _coerce_mapping(payload)
    normalised = dict(mapping)
    normalised["settings"] = _normalize_automation_settings(mapping.get("settings"))
    warnings = mapping.get("context_warnings") or []
    normalised["context_warnings"] = [
        _ensure_primitive_mapping(_coerce_mapping(item)) for item in warnings
    ]
    normalised["updated_at"] = _ensure_primitive(mapping.get("updated_at"))
    normalised["context_tags"] = [str(item) for item in mapping.get("context_tags") or []]
    _automation_settings_response_validator.validate(normalised)


def validate_data_request_response(payload: Any) -> None:
    mapping = _coerce_mapping(payload)
    normalised = dict(mapping)
    normalised["request_type"] = _ensure_primitive(mapping.get("request_type"))
    normalised["requested_at"] = _ensure_primitive(mapping.get("requested_at"))
    normalised["processed_at"] = _ensure_primitive(mapping.get("processed_at"))
    normalised["status"] = _ensure_primitive(mapping.get("status"))
    _data_request_response_validator.validate(normalised)


def validate_onboarding_progress_response(payload: Any) -> None:
    mapping = _coerce_mapping(payload)
    normalised = dict(mapping)
    connectors = mapping.get("connectors") or []
    audits = mapping.get("audits") or []
    normalised["connectors"] = [
        {
            **_coerce_mapping(item),
            "updated_at": _ensure_primitive(
                _coerce_mapping(item).get("updated_at")
                if isinstance(item, Mapping)
                else getattr(item, "updated_at", None)
            ),
            "status": _ensure_primitive(
                _coerce_mapping(item).get("status")
                if isinstance(item, Mapping)
                else getattr(item, "status", None)
            ),
            "label": _ensure_primitive(
                _coerce_mapping(item).get("label")
                if isinstance(item, Mapping)
                else getattr(item, "label", None)
            ),
            "slug": _ensure_primitive(
                _coerce_mapping(item).get("slug")
                if isinstance(item, Mapping)
                else getattr(item, "slug", None)
            ),
            "summary": _ensure_primitive(
                _coerce_mapping(item).get("summary")
                if isinstance(item, Mapping)
                else getattr(item, "summary", None)
            ),
            "action": _ensure_primitive(
                _coerce_mapping(item).get("action")
                if isinstance(item, Mapping)
                else getattr(item, "action", None)
            ),
        }
        for item in connectors
    ]
    normalised["audits"] = [
        {
            **_coerce_mapping(item),
            "occurred_at": _ensure_primitive(
                _coerce_mapping(item).get("occurred_at")
                if isinstance(item, Mapping)
                else getattr(item, "occurred_at", None)
            ),
            "status": _ensure_primitive(
                _coerce_mapping(item).get("status")
                if isinstance(item, Mapping)
                else getattr(item, "status", None)
            ),
            "headline": _ensure_primitive(
                _coerce_mapping(item).get("headline")
                if isinstance(item, Mapping)
                else getattr(item, "headline", None)
            ),
            "detail": _ensure_primitive(
                _coerce_mapping(item).get("detail")
                if isinstance(item, Mapping)
                else getattr(item, "detail", None)
            ),
            "actor": _ensure_primitive(
                _coerce_mapping(item).get("actor")
                if isinstance(item, Mapping)
                else getattr(item, "actor", None)
            ),
        }
        for item in audits
    ]
    normalised["generated_at"] = _ensure_primitive(mapping.get("generated_at"))
    _onboarding_progress_response_validator.validate(normalised)


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


ValidatorFn = Callable[[Iterable[Any] | Mapping[str, Any] | pl.DataFrame], None]

_DATASET_VALIDATORS: dict[str, ValidatorFn] = {
    "_shopify_orders": validate_shopify_orders,
    "_shopify_products": validate_shopify_products,
    "_meta_ads": validate_meta_ads,
    "_google_ads": validate_google_ads,
    "_promos": validate_promos,
    "_weather_daily": validate_weather_daily,
}


def validate_dataset_records(
    dataset: str,
    records: Iterable[Any] | Mapping[str, Any] | pl.DataFrame,
) -> None:
    """Validate records against known dataset schemas based on dataset suffix."""
    if not dataset:
        return
    matched_validator: ValidatorFn | None = None
    for suffix, validator in _DATASET_VALIDATORS.items():
        if dataset.endswith(suffix):
            matched_validator = validator
            break
    if matched_validator is None:
        raise ValueError(
            f"No schema validator registered for dataset '{dataset}'. "
            "Add a schema under shared/contracts or update _DATASET_VALIDATORS."
        )
    matched_validator(records)
