import polars as pl
import pytest

from shared.validation.schemas import validate_feature_matrix, validate_plan_slices


def test_feature_matrix_validation_passes():
    df = pl.DataFrame({
        "date": ["2024-01-01"],
        "geohash": ["9q8yy"],
        "temp_c": [10.0],
        "precip_mm": [1.0],
        "temp_anomaly": [0.1],
        "precip_anomaly": [0.0],
        "temp_roll7": [9.5],
        "precip_roll7": [0.8],
    })
    validate_feature_matrix(df)


def test_feature_matrix_missing_weather_column():
    df = pl.DataFrame({"date": ["2024-01-01"]})
    with pytest.raises(Exception):
        validate_feature_matrix(df)


def test_plan_slice_validation_passes():
    slice_payload = {
        "cell": "meta",
        "recommended_spend": 100.0,
        "expected_revenue": {"p10": 80.0, "p50": 100.0, "p90": 120.0},
        "expected_roas": {"p10": 0.8, "p50": 1.0, "p90": 1.2},
        "confidence": "MEDIUM",
        "assumptions": ["Spend change <=25%"],
        "rationale": {
            "primary_driver": "Weather uplift",
            "supporting_factors": ["Holdout R²: 0.85"],
            "confidence_level": "MEDIUM",
            "data_quality": "FULL",
            "assumptions": ["Quantile scaling"],
            "risks": ["Forecast error"],
        },
        "status": "FULL",
    }

    validate_plan_slices([slice_payload])


def test_plan_slice_validation_invalid_confidence():
    slice_payload = {
        "cell": "meta",
        "recommended_spend": 100.0,
        "expected_revenue": {"p10": 80.0, "p50": 100.0, "p90": 120.0},
        "confidence": "UNKNOWN",
        "assumptions": [],
        "rationale": {
            "primary_driver": "Weather uplift",
            "supporting_factors": [],
            "confidence_level": "MEDIUM",
            "data_quality": "FULL",
            "assumptions": [],
            "risks": [],
        },
    }

    with pytest.raises(Exception):
        validate_plan_slices([slice_payload])
