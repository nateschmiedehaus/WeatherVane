import jsonschema
import polars as pl
import pytest

from shared.libs.storage.lake import LakeWriter
from shared.validation.schemas import (
    validate_google_ads,
    validate_meta_ads,
    validate_promos,
    validate_shopify_orders,
    validate_shopify_products,
    validate_weather_daily,
)


def test_shopify_orders_missing_required_field() -> None:
    record = {
        "tenant_id": "tenant-1",
        "created_at": "2024-01-01T00:00:00Z",
        "currency": "USD",
        "total_price": 100.0,
        "subtotal_price": 90.0,
        "total_tax": 5.0,
        "total_discounts": 10.0,
    }
    with pytest.raises(jsonschema.ValidationError):
        validate_shopify_orders([record])


def test_shopify_products_missing_required_field() -> None:
    record = {
        "tenant_id": "tenant-1",
        "title": "Umbrella",
    }
    with pytest.raises(jsonschema.ValidationError):
        validate_shopify_products([record])


def test_ads_records_missing_required_fields() -> None:
    meta_record = {
        "tenant_id": "tenant-1",
        "spend": 12.5,
        "impressions": 1200,
        "clicks": 45,
        "conversions": 4.2,
    }
    google_record = {
        "tenant_id": "tenant-1",
        "date": "2024-01-01",
        "spend": 18.3,
        "impressions": 800,
        "conversions": 2.1,
    }
    with pytest.raises(jsonschema.ValidationError):
        validate_meta_ads([meta_record])
    with pytest.raises(jsonschema.ValidationError):
        validate_google_ads([google_record])


def test_promos_records_forbid_extra_fields() -> None:
    record = {
        "tenant_id": "tenant-1",
        "campaign_id": "promo-123",
        "unexpected": "field",
    }
    with pytest.raises(jsonschema.ValidationError):
        validate_promos([record])


def test_weather_daily_invalid_types() -> None:
    frame = pl.DataFrame(
        {
            "date": ["2024-01-01"],
            "local_date": ["2024-01-01"],
            "local_datetime": ["2024-01-01T00:00:00-08:00"],
            "utc_datetime": ["2024-01-01T08:00:00+00:00"],
            "timezone": ["America/Los_Angeles"],
            "geohash": ["9q8yy"],
            "day_of_year": [1],
            "temp_c": ["hot"],
            "temp_max_c": [16.0],
            "temp_min_c": [8.0],
            "apparent_temp_c": [12.0],
            "precip_mm": [0.0],
            "precip_probability": [0.2],
            "humidity_mean": [0.5],
            "windspeed_max": [12.0],
            "uv_index_max": [3.0],
            "snowfall_mm": [0.0],
            "temp_anomaly": [0.1],
            "precip_anomaly": [0.0],
            "temp_roll7": [9.0],
            "precip_roll7": [0.5],
            "temp_c_lag1": [8.0],
            "precip_mm_lag1": [0.1],
            "uv_index_lag1": [2.0],
            "precip_probability_lag1": [0.1],
            "humidity_lag1": [0.4],
            "freeze_flag": [0],
            "heatwave_flag": [0],
            "snow_event_flag": [0],
            "high_wind_flag": [0],
            "uv_alert_flag": [0],
            "high_precip_prob_flag": [0],
            "observation_type": ["observed"],
            "as_of_utc": ["2024-01-01T08:00:00+00:00"],
        }
    )
    with pytest.raises(jsonschema.ValidationError):
        validate_weather_daily(frame)


def test_lake_writer_enforces_dataset_contracts(tmp_path) -> None:
    lake_root = tmp_path / "lake"
    writer = LakeWriter(root=lake_root)
    valid_record = {
        "tenant_id": "tenant-1",
        "order_id": "order-1",
        "name": "Sample Order",
        "created_at": "2024-01-01T00:00:00Z",
        "currency": "USD",
        "total_price": 100.0,
        "subtotal_price": 90.0,
        "total_tax": 5.0,
        "total_discounts": 10.0,
        "net_revenue": 80.0,
        "shipping_postal_code": "94103",
        "shipping_country": "US",
        "ship_latitude": 37.77,
        "ship_longitude": -122.42,
        "ship_geohash": "9q8yy",
    }
    writer.write_records("tenant_shopify_orders", [valid_record])

    invalid_record = {
        "tenant_id": "tenant-1",
        "name": "Invalid",
        "created_at": "2024-01-01T00:00:00Z",
        "currency": "USD",
        "total_price": 100.0,
        "subtotal_price": 90.0,
        "total_tax": 5.0,
        "total_discounts": 10.0,
    }
    with pytest.raises(jsonschema.ValidationError):
        writer.write_records("tenant_shopify_orders", [invalid_record])
