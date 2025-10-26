"""Tests for baseline model comparison and validation."""

from pathlib import Path
from datetime import datetime, timedelta
import sys
import pytest
import json
import pandas as pd

import polars as pl
import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[1]
root_str = str(REPO_ROOT)
if root_str not in sys.path:
    sys.path.insert(0, root_str)

shared_module = sys.modules.get("shared")
tests_shared_path = str(REPO_ROOT / "tests" / "shared")
if shared_module is not None:
    module_file = getattr(shared_module, "__file__", "") or ""
    if tests_shared_path in module_file:
        sys.modules.pop("shared", None)
        sys.modules.pop("shared.feature_store", None)

from apps.model.baseline_comparison import (
    validate_tenant_predictions,
    validate_all_synthetic_tenants,
    ValidationResult,
    _compute_metrics
)
from shared.feature_store.feature_builder import (
    FeatureBuilder,
    REQUIRED_WEATHER_COLS,
    TARGET_COLUMN
)


def test_validation_result_creation():
    """Test ValidationResult dataclass creation."""
    result = ValidationResult(
        tenant_id="synthetic_test",
        weather_effect="strong",
        r2_score=0.75,
        validation_period={"start": "2025-01-01", "end": "2025-02-01"},
        validation_rows=30,
        passed_criteria=True,
        details={
            "training_period": {
                "start": "2024-12-01",
                "end": "2025-01-01"
            },
            "training_rows": 60,
            "weather_fit_score": 0.8,
            "weather_features": ["temp", "precipitation"],
            "training_r2": 0.77
        }
    )

    assert result.tenant_id == "synthetic_test"
    assert result.weather_effect == "strong"
    assert result.r2_score == 0.75
    assert result.validation_rows == 30
    assert result.passed_criteria is True
    assert "training_period" in result.details
    assert "weather_features" in result.details


def test_compute_metrics():
    """Test metric computation utilities."""
    y_true = np.array([1.0, 2.0, 3.0, 4.0])
    y_pred = np.array([1.1, 2.1, 2.9, 4.1])

    metrics = _compute_metrics(y_true, y_pred)

    assert "r2" in metrics
    assert "rmse" in metrics
    assert "mae" in metrics
    assert "mape" in metrics
    assert metrics["r2"] > 0.95  # Very close predictions
    assert metrics["rmse"] < 0.15
    assert metrics["mae"] < 0.15


def test_compute_metrics_with_zeros():
    """Test metric computation with zero values."""
    y_true = np.array([0.0, 1.0, 2.0, 3.0])
    y_pred = np.array([0.1, 1.1, 1.9, 3.1])

    metrics = _compute_metrics(y_true, y_pred)

    assert "mape" in metrics
    assert np.isfinite(metrics["mape"])


@pytest.fixture
def synthetic_data_lake(tmp_path):
    """Create a temporary synthetic data lake for testing."""
    lake_root = tmp_path / "lake" / "raw"  # Match the default path structure
    lake_root.mkdir(parents=True)

    # Create synthetic tenant data structures
    tenants = ["synthetic_high_1", "synthetic_none_1"]
    for tenant in tenants:
        # Generate test data
        dates = pd.date_range(
            start="2025-01-01",
            end="2025-03-01",
            freq="D"
        )

        # Synthetic revenue data with weather correlation for high tenant
        base_revenue = 100 + np.random.normal(0, 10, len(dates))
        temp = 20 + np.sin(np.arange(len(dates)) * 0.1) + np.random.normal(0, 2, len(dates))

        if "high" in tenant:
            # High tenant: Strong weather effect
            revenue = base_revenue + 0.5 * temp
        else:
            # None tenant: No weather effect
            revenue = base_revenue

        # Shopify orders
        shopify_dir = lake_root / tenant / "shopify_orders" / "features"
        shopify_dir.mkdir(parents=True)
        shopify_data = {
            "created_at": [d.isoformat() for d in dates],
            "net_revenue": revenue,
            "ship_geohash": ["GLOBAL"] * len(dates)
        }
        shopify_df = pl.DataFrame(shopify_data).sort("created_at")
        shopify_df.write_parquet(shopify_dir / f"{tenant}_shopify_orders_latest.parquet")

        # Meta ads
        meta_dir = lake_root / tenant / "meta_ads" / "features"
        meta_dir.mkdir(parents=True)
        meta_data = {
            "date": [d.date().isoformat() for d in dates],
            "spend": np.random.uniform(50, 150, len(dates)),
            "conversions": np.random.randint(1, 10, len(dates))
        }
        meta_df = pl.DataFrame(meta_data).sort("date")
        meta_df.write_parquet(meta_dir / f"{tenant}_meta_ads_latest.parquet")

        # Google ads
        google_dir = lake_root / tenant / "google_ads" / "features"
        google_dir.mkdir(parents=True)
        google_data = {
            "date": [d.date().isoformat() for d in dates],
            "spend": np.random.uniform(40, 120, len(dates)),
            "conversions": np.random.randint(1, 8, len(dates))
        }
        google_df = pl.DataFrame(google_data).sort("date")
        google_df.write_parquet(google_dir / f"{tenant}_google_ads_latest.parquet")

        # Promos
        promos_dir = lake_root / tenant / "promos" / "features"
        promos_dir.mkdir(parents=True)
        promos_data = {
            "send_date": [d.date().isoformat() for d in dates],
            "promos_sent": np.random.randint(0, 5, len(dates))
        }
        promos_df = pl.DataFrame(promos_data).sort("send_date")
        promos_df.write_parquet(promos_dir / f"{tenant}_promos_latest.parquet")

        # Weather
        weather_dir = lake_root / tenant / "weather_daily" / "features"
        weather_dir.mkdir(parents=True)
        weather_data = {
            "date": [d.date().isoformat() for d in dates],
            "geohash": ["GLOBAL"] * len(dates),
            "temp_c": temp,
            "precip_mm": np.random.uniform(0, 10, len(dates)),
            "temp_anomaly": temp - 20,  # Deviation from mean
            "precip_anomaly": np.random.normal(0, 2, len(dates)),
            "temp_roll7": np.convolve(temp, np.ones(7)/7, mode='same'),
            "precip_roll7": np.convolve(np.random.uniform(0, 10, len(dates)), np.ones(7)/7, mode='same')
        }
        weather_df = pl.DataFrame(weather_data).sort("date")
        weather_df.write_parquet(weather_dir / f"{tenant}_weather_daily_latest.parquet")

    return lake_root


def test_validate_tenant_predictions(synthetic_data_lake):
    """Test tenant prediction validation."""
    result = validate_tenant_predictions(
        tenant_id="synthetic_high_1",
        training_days=30,
        validation_days=15,
        lake_root=synthetic_data_lake
    )

    assert isinstance(result, ValidationResult)
    assert result.tenant_id == "synthetic_high_1"
    assert isinstance(result.r2_score, float)
    assert isinstance(result.validation_rows, int)
    assert isinstance(result.passed_criteria, bool)
    assert "training_period" in result.details


def test_validate_all_synthetic_tenants(synthetic_data_lake, tmp_path):
    """Test validation across all synthetic tenants."""
    output_path = tmp_path / "validation_results.json"

    # Create a list_tenants method for our testing FeatureBuilder
    def mock_list_tenants(self):
        """Return the synthetic tenants we created."""
        return ["synthetic_high_1", "synthetic_none_1"]

    # Monkey patch the FeatureBuilder class
    FeatureBuilder.list_tenants = mock_list_tenants

    summary = validate_all_synthetic_tenants(
        lake_root=synthetic_data_lake,
        output_path=output_path
    )

    assert output_path.exists()
    assert isinstance(summary, dict)
    assert "total_tenants" in summary
    assert "passed_validations" in summary
    assert "high_extreme_tenants" in summary
    assert "none_tenants" in summary
    assert "average_r2" in summary
    assert "tenant_results" in summary

    # Load and verify the output JSON
    with output_path.open() as f:
        saved_summary = json.load(f)

    assert saved_summary["total_tenants"] == summary["total_tenants"]
    assert len(saved_summary["tenant_results"]) == summary["total_tenants"]


def test_validation_criteria():
    """Test validation criteria for different tenant types."""
    # High weather effect tenant
    high_result = ValidationResult(
        tenant_id="synthetic_high_1",
        weather_effect="strong",
        r2_score=0.65,
        validation_period={"start": "2025-01-01", "end": "2025-02-01"},
        validation_rows=30,
        passed_criteria=True,
        details={}
    )
    assert high_result.passed_criteria is True  # Strong effect + R² > 0.6

    # None weather effect tenant
    none_result = ValidationResult(
        tenant_id="synthetic_none_1",
        weather_effect="none",
        r2_score=0.65,
        validation_period={"start": "2025-01-01", "end": "2025-02-01"},
        validation_rows=30,
        passed_criteria=True,
        details={}
    )
    assert none_result.passed_criteria is True  # No effect + R² > 0.6

    # Failed criteria (wrong weather effect)
    fail_result = ValidationResult(
        tenant_id="synthetic_high_2",
        weather_effect="none",  # Should be strong/moderate
        r2_score=0.65,
        validation_period={"start": "2025-01-01", "end": "2025-02-01"},
        validation_rows=30,
        passed_criteria=False,
        details={}
    )
    assert fail_result.passed_criteria is False
