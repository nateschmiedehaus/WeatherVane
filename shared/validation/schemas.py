"""Schema validation helpers using jsonschema."""
from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from datetime import datetime
from pathlib import Path
import inspect
from functools import wraps
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
_reports_response_schema = json.loads(
    (SCHEMA_DIR / "reports_response.schema.json").read_text()
)
_data_request_response_schema = json.loads(
    (SCHEMA_DIR / "data_request_response.schema.json").read_text()
)
_onboarding_progress_response_schema = json.loads(
    (SCHEMA_DIR / "onboarding_progress_response.schema.json").read_text()
)
_dashboard_response_schema = json.loads(
    (SCHEMA_DIR / "dashboard_response.schema.json").read_text()
)
_alert_acknowledge_request_schema = json.loads(
    (SCHEMA_DIR / "alert_acknowledge_request.schema.json").read_text()
)
_alert_escalate_request_schema = json.loads(
    (SCHEMA_DIR / "alert_escalate_request.schema.json").read_text()
)
_allocator_response_schema = json.loads(
    (SCHEMA_DIR / "allocator_response.schema.json").read_text()
)
_analytics_event_request_schema = json.loads(
    (SCHEMA_DIR / "analytics_event_request.schema.json").read_text()
)
_creative_response_schema = json.loads(
    (SCHEMA_DIR / "creative_response.schema.json").read_text()
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
_reports_response_validator = jsonschema.Draft202012Validator(_reports_response_schema)
_data_request_response_validator = jsonschema.Draft202012Validator(
    _data_request_response_schema
)
_onboarding_progress_response_validator = jsonschema.Draft202012Validator(
    _onboarding_progress_response_schema
)
_dashboard_response_validator = jsonschema.Draft202012Validator(_dashboard_response_schema)
_alert_acknowledge_request_validator = jsonschema.Draft202012Validator(
    _alert_acknowledge_request_schema
)
_alert_escalate_request_validator = jsonschema.Draft202012Validator(
    _alert_escalate_request_schema
)
_allocator_response_validator = jsonschema.Draft202012Validator(_allocator_response_schema)
_analytics_event_request_validator = jsonschema.Draft202012Validator(
    _analytics_event_request_schema
)
_creative_response_validator = jsonschema.Draft202012Validator(_creative_response_schema)


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


def _normalize_report_hero_tiles(items: Iterable[Any]) -> list[dict[str, Any]]:
    normalised: list[dict[str, Any]] = []
    for item in items:
        mapping = _coerce_mapping(item)
        payload = dict(mapping)
        payload["delta_pct"] = _ensure_primitive(mapping.get("delta_pct"))
        payload["delta_value"] = _ensure_primitive(mapping.get("delta_value"))
        payload["value"] = _ensure_primitive(mapping.get("value"))
        normalised.append(payload)
    return normalised


def _normalize_report_narratives(items: Iterable[Any]) -> list[dict[str, Any]]:
    normalised: list[dict[str, Any]] = []
    for item in items:
        mapping = _coerce_mapping(item)
        payload = dict(mapping)
        payload["plan_date"] = _ensure_primitive(mapping.get("plan_date"))
        payload["confidence"] = _ensure_primitive(mapping.get("confidence"))
        payload["spend"] = _ensure_primitive(mapping.get("spend"))
        payload["expected_revenue"] = _ensure_primitive(mapping.get("expected_revenue"))
        normalised.append(payload)
    return normalised


def _normalize_report_trend(payload: Any) -> dict[str, Any]:
    mapping = _coerce_mapping(payload or {})
    normalised = dict(mapping)
    points = mapping.get("points") or []
    normalised["points"] = [
        {
            **_coerce_mapping(point),
            "date": _ensure_primitive(_coerce_mapping(point).get("date")),
            "recommended_spend": _ensure_primitive(_coerce_mapping(point).get("recommended_spend")),
            "weather_index": _ensure_primitive(_coerce_mapping(point).get("weather_index")),
            "guardrail_score": _ensure_primitive(_coerce_mapping(point).get("guardrail_score")),
        }
        for point in points
    ]
    return normalised


def _normalize_report_schedule(payload: Any) -> dict[str, Any]:
    mapping = _coerce_mapping(payload or {})
    normalised = dict(mapping)
    normalised["next_delivery_at"] = _ensure_primitive(mapping.get("next_delivery_at"))
    normalised["last_sent_at"] = _ensure_primitive(mapping.get("last_sent_at"))
    return normalised


def _normalize_report_success(payload: Any) -> dict[str, Any]:
    mapping = _coerce_mapping(payload or {})
    normalised = dict(mapping)
    normalised["metric_value"] = _ensure_primitive(mapping.get("metric_value"))
    return normalised


def validate_reports_response(payload: Any) -> None:
    mapping = _coerce_mapping(payload)
    normalised = dict(mapping)
    hero_tiles = mapping.get("hero_tiles") or []
    narratives = mapping.get("narratives") or []
    normalised["hero_tiles"] = _normalize_report_hero_tiles(hero_tiles)
    normalised["narratives"] = _normalize_report_narratives(narratives)
    normalised["trend"] = _normalize_report_trend(mapping.get("trend"))
    normalised["schedule"] = _normalize_report_schedule(mapping.get("schedule"))
    normalised["success"] = _normalize_report_success(mapping.get("success"))
    warnings = mapping.get("context_warnings") or []
    normalised["context_warnings"] = [_coerce_mapping(item) for item in warnings]
    normalised["generated_at"] = _ensure_primitive(mapping.get("generated_at"))
    _reports_response_validator.validate(normalised)


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


def validate_dashboard_response(payload: Any) -> None:
    """Validate dashboard response payload against contract."""
    mapping = _coerce_mapping(payload)
    normalised = dict(mapping)

    # Normalize nested objects with datetime conversions
    normalised["generated_at"] = _ensure_primitive(mapping.get("generated_at"))

    # Normalize collections
    if "guardrails" in mapping:
        normalised["guardrails"] = [
            {**_coerce_mapping(item)} for item in (mapping.get("guardrails") or [])
        ]
    if "spend_trackers" in mapping:
        normalised["spend_trackers"] = [
            {**_coerce_mapping(item)} for item in (mapping.get("spend_trackers") or [])
        ]
    if "weather_events" in mapping:
        normalised["weather_events"] = [
            {
                **_coerce_mapping(item),
                "starts_at": _ensure_primitive(_coerce_mapping(item).get("starts_at")),
                "ends_at": _ensure_primitive(_coerce_mapping(item).get("ends_at")),
            }
            for item in (mapping.get("weather_events") or [])
        ]
    if "automation" in mapping:
        normalised["automation"] = [
            {
                **_coerce_mapping(item),
                "last_incident_at": _ensure_primitive(_coerce_mapping(item).get("last_incident_at")),
            }
            for item in (mapping.get("automation") or [])
        ]
    if "ingestion" in mapping:
        normalised["ingestion"] = [
            {
                **_coerce_mapping(item),
                "last_synced_at": _ensure_primitive(_coerce_mapping(item).get("last_synced_at")),
            }
            for item in (mapping.get("ingestion") or [])
        ]
    if "alerts" in mapping:
        normalised["alerts"] = [
            {
                **_coerce_mapping(item),
                "occurred_at": _ensure_primitive(_coerce_mapping(item).get("occurred_at")),
            }
            for item in (mapping.get("alerts") or [])
        ]
    if "weather_kpis" in mapping:
        normalised["weather_kpis"] = [
            {**_coerce_mapping(item)} for item in (mapping.get("weather_kpis") or [])
        ]

    warnings = mapping.get("context_warnings") or []
    normalised["context_warnings"] = [_coerce_mapping(item) for item in warnings]
    normalised["context_tags"] = [str(item) for item in mapping.get("context_tags") or []]

    _dashboard_response_validator.validate(normalised)


def validate_alert_acknowledge_request(payload: Any) -> None:
    """Validate alert acknowledge request."""
    mapping = _coerce_mapping(payload)
    _alert_acknowledge_request_validator.validate(mapping)


def validate_alert_escalate_request(payload: Any) -> None:
    """Validate alert escalate request."""
    mapping = _coerce_mapping(payload)
    _alert_escalate_request_validator.validate(mapping)


def validate_allocator_response(payload: Any) -> None:
    """Validate allocator response payload."""
    mapping = _coerce_mapping(payload)
    normalised = dict(mapping)
    normalised["generated_at"] = _ensure_primitive(mapping.get("generated_at"))
    _allocator_response_validator.validate(normalised)


def validate_analytics_event_request(payload: Any) -> None:
    """Validate analytics event request."""
    mapping = _coerce_mapping(payload)
    normalised = dict(mapping)
    normalised["occurred_at"] = _ensure_primitive(mapping.get("occurred_at"))

    # Validate nested payload
    if "payload" in mapping:
        payload_mapping = _coerce_mapping(mapping.get("payload"))
        payload_normalised = dict(payload_mapping)
        payload_normalised["next_event_starts_at"] = _ensure_primitive(
            payload_mapping.get("next_event_starts_at")
        )
        normalised["payload"] = payload_normalised

    _analytics_event_request_validator.validate(normalised)


def validate_creative_response(payload: Any) -> None:
    """Validate creative response payload."""
    mapping = _coerce_mapping(payload)
    normalised = dict(mapping)
    normalised["generated_at"] = _ensure_primitive(mapping.get("generated_at"))

    # Normalize collections
    if "highlights" in mapping:
        normalised["highlights"] = [
            {**_coerce_mapping(item)} for item in (mapping.get("highlights") or [])
        ]
    if "rows" in mapping:
        normalised["rows"] = [
            {**_coerce_mapping(item)} for item in (mapping.get("rows") or [])
        ]
    if "by_channel" in mapping:
        normalised["by_channel"] = [
            {**_coerce_mapping(item)} for item in (mapping.get("by_channel") or [])
        ]

    warnings = mapping.get("context_warnings") or []
    normalised["context_warnings"] = [_coerce_mapping(item) for item in warnings]

    _creative_response_validator.validate(normalised)


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


def validate_plan_response(payload: Any) -> None:
    """Validate plan response payload against contract."""
    mapping = _coerce_mapping(payload)
    normalised = dict(mapping)

    # Validate slices
    slices = mapping.get("slices") or []
    normalised["slices"] = []
    for slice_ in slices:
        slice_mapping = _coerce_mapping(slice_)
        slice_normalised = dict(slice_mapping)
        slice_normalised["plan_date"] = _ensure_primitive(slice_mapping.get("plan_date"))
        slice_normalised["recommended_spend"] = _ensure_primitive(slice_mapping.get("recommended_spend"))
        slice_normalised["confidence"] = _ensure_primitive(slice_mapping.get("confidence"))

        # Validate nested quantiles
        expected_revenue = slice_mapping.get("expected_revenue")
        if expected_revenue:
            exp_rev_mapping = _coerce_mapping(expected_revenue)
            slice_normalised["expected_revenue"] = {
                "p10": _ensure_primitive(exp_rev_mapping.get("p10")),
                "p50": _ensure_primitive(exp_rev_mapping.get("p50")),
                "p90": _ensure_primitive(exp_rev_mapping.get("p90")),
            }

        expected_roas = slice_mapping.get("expected_roas")
        if expected_roas:
            exp_roas_mapping = _coerce_mapping(expected_roas)
            slice_normalised["expected_roas"] = {
                "p10": _ensure_primitive(exp_roas_mapping.get("p10")),
                "p50": _ensure_primitive(exp_roas_mapping.get("p50")),
                "p90": _ensure_primitive(exp_roas_mapping.get("p90")),
            }

        # Validate rationale
        rationale = slice_mapping.get("rationale")
        if rationale:
            rationale_mapping = _coerce_mapping(rationale)
            slice_normalised["rationale"] = {
                **rationale_mapping,
                "confidence_level": _ensure_primitive(rationale_mapping.get("confidence_level")),
            }

        normalised["slices"].append(slice_normalised)

    # Validate warnings
    warnings = mapping.get("context_warnings") or []
    normalised["context_warnings"] = [_coerce_mapping(item) for item in warnings]
    normalised["generated_at"] = _ensure_primitive(mapping.get("generated_at"))

    # Basic structure validation
    if "tenant_id" not in normalised:
        raise jsonschema.ValidationError("Missing required field: tenant_id")
    if "slices" not in normalised:
        raise jsonschema.ValidationError("Missing required field: slices")


class SchemaRegistry:
    """Central registry for schema validators with enforcement capabilities."""

    _validators: dict[str, ValidatorFn] = {}
    _response_validators: dict[str, Callable[[Any], None]] = {}

    @classmethod
    def register_validator(cls, name: str, validator: ValidatorFn) -> None:
        """Register a dataset validator."""
        cls._validators[name] = validator

    @classmethod
    def register_response_validator(cls, name: str, validator: Callable[[Any], None]) -> None:
        """Register a response payload validator."""
        cls._response_validators[name] = validator

    @classmethod
    def get_validator(cls, name: str) -> ValidatorFn | None:
        """Retrieve a dataset validator."""
        return cls._validators.get(name)

    @classmethod
    def get_response_validator(cls, name: str) -> Callable[[Any], None] | None:
        """Retrieve a response payload validator."""
        return cls._response_validators.get(name)

    @classmethod
    def validate(cls, validator_name: str, records: Iterable[Any] | Mapping[str, Any] | pl.DataFrame) -> None:
        """Validate records using a registered validator."""
        validator = cls.get_validator(validator_name)
        if validator is None:
            raise ValueError(f"No validator registered for '{validator_name}'")
        validator(records)

    @classmethod
    def validate_response(cls, validator_name: str, payload: Any) -> None:
        """Validate response payload using a registered validator."""
        validator = cls.get_response_validator(validator_name)
        if validator is None:
            raise ValueError(f"No response validator registered for '{validator_name}'")
        validator(payload)


# Register all dataset validators
SchemaRegistry.register_validator("shopify_orders", validate_shopify_orders)
SchemaRegistry.register_validator("shopify_products", validate_shopify_products)
SchemaRegistry.register_validator("meta_ads", validate_meta_ads)
SchemaRegistry.register_validator("google_ads", validate_google_ads)
SchemaRegistry.register_validator("promos", validate_promos)
SchemaRegistry.register_validator("weather_daily", validate_weather_daily)
SchemaRegistry.register_validator("plan_slices", validate_plan_slices)

# Register all response validators
SchemaRegistry.register_response_validator("plan_response", validate_plan_response)
SchemaRegistry.register_response_validator("catalog_response", validate_catalog_response)
SchemaRegistry.register_response_validator("stories_response", validate_stories_response)
SchemaRegistry.register_response_validator("reports_response", validate_reports_response)
SchemaRegistry.register_response_validator("automation_settings_response", validate_automation_settings_response)
SchemaRegistry.register_response_validator("data_request_response", validate_data_request_response)
SchemaRegistry.register_response_validator("onboarding_progress_response", validate_onboarding_progress_response)
SchemaRegistry.register_response_validator("dashboard_response", validate_dashboard_response)
SchemaRegistry.register_response_validator("creative_response", validate_creative_response)
SchemaRegistry.register_response_validator("allocator_response", validate_allocator_response)

# Register request validators
SchemaRegistry.register_response_validator("alert_acknowledge_request", validate_alert_acknowledge_request)
SchemaRegistry.register_response_validator("alert_escalate_request", validate_alert_escalate_request)
SchemaRegistry.register_response_validator("analytics_event_request", validate_analytics_event_request)


def load_schema(schema_name: str) -> dict[str, Any]:
    """Load a schema from the contracts directory.

    Args:
        schema_name: Name of the schema (without .schema.json extension)

    Returns:
        Dictionary containing the JSON schema

    Raises:
        FileNotFoundError: If the schema file doesn't exist
    """
    schema_path = SCHEMA_DIR / f"{schema_name}.schema.json"
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema not found: {schema_path}")
    return json.loads(schema_path.read_text())


def enforce_schema(validator_name: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator to enforce schema validation on function results.

    Works with both synchronous and asynchronous callables while preserving the
    wrapped function's FastAPI signature so dependency injection continues to work.
    """

    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        if inspect.iscoroutinefunction(func):

            @wraps(func)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                result = await func(*args, **kwargs)
                SchemaRegistry.validate_response(validator_name, result)
                return result

            return async_wrapper

        @wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            result = func(*args, **kwargs)
            SchemaRegistry.validate_response(validator_name, result)
            return result

        return sync_wrapper

    return decorator
