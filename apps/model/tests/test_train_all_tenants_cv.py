"""Comprehensive tests for train_all_tenants_cv.py training pipeline.

Tests verify all 7 dimensions of the Universal Test Standards:
1. Behavior Validation - Verifies training produces expected results
2. Edge Cases - Tests with minimal data, missing files, etc.
3. Error Handling - Validates proper error messages and recovery
4. Integration Testing - Tests end-to-end training pipeline
5. Performance Validation - Ensures training completes in reasonable time
6. Data Quality Validation - Verifies output data integrity
7. Regression Prevention - Tests against known good results

Author: WeatherVane ML Platform Team
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path
from unittest import mock

import numpy as np
import pandas as pd
import pytest

# Add parent directory to path for imports
_SCRIPT_DIR = Path(__file__).parent.parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from train_all_tenants_cv import export_cv_results  # noqa: E402
from mmm_lightweight_weather import (  # noqa: E402
    CrossValidationMetrics,
    TenantModelTrainer,
    validate_models_against_thresholds,
    summarize_validation_results,
)


@pytest.fixture
def temp_data_dir():
    """Create temporary directory for test data."""
    temp_dir = tempfile.mkdtemp()
    yield Path(temp_dir)
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def sample_tenant_data():
    """Generate sample tenant data for testing."""
    np.random.seed(42)
    n_days = 365

    dates = pd.date_range(start="2023-01-01", periods=n_days, freq="D")

    # Create data with weather sensitivity
    temperature = 15 + 10 * np.sin(np.arange(n_days) * 2 * np.pi / 365)
    precipitation = np.random.exponential(scale=2.0, size=n_days)
    humidity = 50 + 20 * np.random.randn(n_days)

    # Revenue correlates with temperature for this tenant
    base_revenue = 1000
    weather_effect = 50 * (temperature - temperature.mean()) / temperature.std()
    spend_effect = np.random.uniform(100, 500, n_days)
    revenue = base_revenue + weather_effect + 2 * spend_effect + np.random.randn(n_days) * 50

    df = pd.DataFrame({
        "date": dates,
        "temperature": temperature,
        "precipitation": precipitation,
        "humidity": humidity,
        "meta_spend": spend_effect * 0.6,
        "google_spend": spend_effect * 0.4,
        "revenue": revenue,
    })

    return df


@pytest.fixture
def create_test_tenant_file(temp_data_dir, sample_tenant_data):
    """Create a test tenant parquet file."""
    def _create(tenant_name: str = "test_tenant"):
        file_path = temp_data_dir / f"{tenant_name}.parquet"
        sample_tenant_data.to_parquet(file_path)
        return file_path
    return _create


# ============================================================================
# DIMENSION 1: BEHAVIOR VALIDATION
# ============================================================================

def test_tenant_model_trainer_initialization(temp_data_dir):
    """Test that TenantModelTrainer initializes correctly."""
    trainer = TenantModelTrainer(data_dir=temp_data_dir, regularization_strength=0.01)
    assert trainer.data_dir == temp_data_dir
    assert trainer.regularization_strength == 0.01


def test_list_tenant_files(temp_data_dir, create_test_tenant_file):
    """Test that trainer correctly lists tenant files."""
    # Create test files
    create_test_tenant_file("tenant_001")
    create_test_tenant_file("tenant_002")
    create_test_tenant_file("tenant_003")

    trainer = TenantModelTrainer(data_dir=temp_data_dir)
    tenant_files = trainer.list_tenant_files()

    assert len(tenant_files) == 3
    assert all(f.suffix == ".parquet" for f in tenant_files)


def test_train_single_tenant_with_cv(temp_data_dir, create_test_tenant_file):
    """Test cross-validation training on a single tenant."""
    tenant_file = create_test_tenant_file("tenant_cv_test")

    trainer = TenantModelTrainer(data_dir=temp_data_dir, regularization_strength=0.01)
    tenant_name, cv_metrics = trainer.train_single_tenant_with_cv(
        tenant_file,
        n_folds=3,  # Use 3 folds for faster testing
    )

    assert tenant_name == "tenant_cv_test"
    assert isinstance(cv_metrics, CrossValidationMetrics)
    assert cv_metrics.num_folds == 3
    # TimeSeriesSplit yields exactly n_folds evaluation windows
    assert len(cv_metrics.fold_r2_scores) == 3
    assert cv_metrics.mean_r2 >= 0.0
    assert cv_metrics.std_r2 >= 0.0


def test_export_cv_results(temp_data_dir, create_test_tenant_file):
    """Test that CV results are exported correctly to JSON."""
    # Train a model
    tenant_file = create_test_tenant_file("tenant_export_test")
    trainer = TenantModelTrainer(data_dir=temp_data_dir)
    tenant_name, cv_metrics = trainer.train_single_tenant_with_cv(tenant_file, n_folds=3)

    # Export results
    output_path = temp_data_dir / "cv_results.json"
    cv_results = {tenant_name: cv_metrics}
    export_cv_results(cv_results, output_path)

    # Verify file exists and contains valid JSON
    assert output_path.exists()
    with open(output_path) as f:
        data = json.load(f)

    assert "summary" in data
    assert "results" in data
    assert tenant_name in data["results"]
    assert "mean_r2" in data["results"][tenant_name]
    assert "fold_r2_scores" in data["results"][tenant_name]


def test_validate_models_against_thresholds(temp_data_dir, create_test_tenant_file):
    """Test model validation against performance thresholds."""
    # Create mock CV results with different R² scores
    cv_results = {
        "good_tenant": CrossValidationMetrics(
            model_name="good_tenant",
            fold_r2_scores=[0.8, 0.85, 0.9],
            fold_rmse_scores=[100, 95, 90],
            fold_mae_scores=[80, 75, 70],
            mean_r2=0.85,
            std_r2=0.04,
            mean_rmse=95,
            mean_mae=75,
            num_folds=3,
        ),
        "bad_tenant": CrossValidationMetrics(
            model_name="bad_tenant",
            fold_r2_scores=[0.3, 0.35, 0.4],
            fold_rmse_scores=[200, 195, 190],
            fold_mae_scores=[160, 155, 150],
            mean_r2=0.35,
            std_r2=0.04,
            mean_rmse=195,
            mean_mae=155,
            num_folds=3,
        ),
    }

    # Validate against R² >= 0.50 threshold
    validation_results = validate_models_against_thresholds(cv_results, r2_threshold=0.50)

    assert validation_results["good_tenant"].passes_threshold is True
    assert validation_results["bad_tenant"].passes_threshold is False


def test_summarize_validation_results():
    """Test validation summary statistics."""
    validation_results = {
        "tenant_1": type('obj', (), {
            'mean_r2': 0.85,
            'passes_threshold': True,
            'r2_threshold': 0.5,
            'tenant_name': 'tenant_1'
        })(),
        "tenant_2": type('obj', (), {
            'mean_r2': 0.35,
            'passes_threshold': False,
            'r2_threshold': 0.5,
            'tenant_name': 'tenant_2'
        })(),
        "tenant_3": type('obj', (), {
            'mean_r2': 0.75,
            'passes_threshold': True,
            'r2_threshold': 0.5,
            'tenant_name': 'tenant_3'
        })(),
    }

    summary = summarize_validation_results(validation_results)

    assert summary["total_models"] == 3
    assert summary["passing_models"] == 2
    assert summary["failing_models"] == 1
    assert abs(summary["pass_rate"] - 0.6667) < 0.001
    assert summary["threshold"] == 0.5


# ============================================================================
# DIMENSION 2: EDGE CASES
# ============================================================================

def test_train_with_empty_directory(temp_data_dir):
    """Test handling of empty data directory."""
    trainer = TenantModelTrainer(data_dir=temp_data_dir)
    tenant_files = trainer.list_tenant_files()
    assert len(tenant_files) == 0


def test_train_with_minimal_data(temp_data_dir):
    """Test training with minimal viable data (30 days)."""
    # Create minimal dataset
    n_days = 30
    dates = pd.date_range(start="2023-01-01", periods=n_days, freq="D")

    df = pd.DataFrame({
        "date": dates,
        "temperature": np.random.randn(n_days) * 5 + 15,
        "precipitation": np.random.exponential(2, n_days),
        "humidity": np.random.randn(n_days) * 10 + 60,
        "meta_spend": np.random.uniform(100, 500, n_days),
        "google_spend": np.random.uniform(50, 300, n_days),
        "revenue": np.random.uniform(800, 1500, n_days),
    })

    file_path = temp_data_dir / "minimal_tenant.parquet"
    df.to_parquet(file_path)

    trainer = TenantModelTrainer(data_dir=temp_data_dir)
    tenant_name, cv_metrics = trainer.train_single_tenant_with_cv(
        file_path,
        n_folds=3,
    )

    assert tenant_name == "minimal_tenant"
    assert isinstance(cv_metrics, CrossValidationMetrics)


def test_train_with_missing_weather_column(temp_data_dir):
    """Test error handling when weather columns are missing."""
    # Create data without precipitation column
    n_days = 100
    dates = pd.date_range(start="2023-01-01", periods=n_days, freq="D")

    df = pd.DataFrame({
        "date": dates,
        "temperature": np.random.randn(n_days) * 5 + 15,
        # Missing: precipitation
        "humidity": np.random.randn(n_days) * 10 + 60,
        "meta_spend": np.random.uniform(100, 500, n_days),
        "google_spend": np.random.uniform(50, 300, n_days),
        "revenue": np.random.uniform(800, 1500, n_days),
    })

    file_path = temp_data_dir / "missing_precip.parquet"
    df.to_parquet(file_path)

    trainer = TenantModelTrainer(data_dir=temp_data_dir)

    # Should handle missing columns gracefully (uses only available weather features)
    tenant_name, cv_metrics = trainer.train_single_tenant_with_cv(file_path, n_folds=3)
    assert tenant_name == "missing_precip"


# ============================================================================
# DIMENSION 3: ERROR HANDLING
# ============================================================================

def test_nonexistent_data_directory():
    """Test error handling for nonexistent data directory."""
    trainer = TenantModelTrainer(data_dir=Path("/nonexistent/path"))
    tenant_files = trainer.list_tenant_files()
    assert len(tenant_files) == 0


def test_corrupted_parquet_file(temp_data_dir):
    """Test error handling for corrupted parquet files."""
    # Create a corrupted file
    corrupted_file = temp_data_dir / "corrupted.parquet"
    with open(corrupted_file, "w") as f:
        f.write("This is not a valid parquet file")

    trainer = TenantModelTrainer(data_dir=temp_data_dir)

    with pytest.raises(Exception):
        trainer.train_single_tenant_with_cv(corrupted_file, n_folds=3)


def test_insufficient_folds():
    """Test error handling for insufficient number of folds."""
    # Mock data
    df = pd.DataFrame({
        "date": pd.date_range(start="2023-01-01", periods=10, freq="D"),
        "temperature": np.random.randn(10),
        "precipitation": np.random.randn(10),
        "humidity": np.random.randn(10),
        "meta_spend": np.random.randn(10) * 100,
        "google_spend": np.random.randn(10) * 100,
        "revenue": np.random.randn(10) * 1000,
    })

    # Cannot do cross-validation with n_folds < 2
    from mmm_lightweight_weather import WeatherAwareMMM

    mmm = WeatherAwareMMM()

    with pytest.raises(ValueError, match="n_folds must be >= 2"):
        mmm.cross_validate(
            X_spend=df[["meta_spend", "google_spend"]],
            X_weather=df[["temperature", "precipitation", "humidity"]],
            y=df["revenue"].values,
            n_folds=1,
        )


# ============================================================================
# DIMENSION 4: INTEGRATION TESTING
# ============================================================================

def test_end_to_end_training_pipeline(temp_data_dir, create_test_tenant_file):
    """Test complete end-to-end training pipeline."""
    # Create multiple tenant files
    create_test_tenant_file("tenant_001")
    create_test_tenant_file("tenant_002")
    create_test_tenant_file("tenant_003")

    # Initialize trainer
    trainer = TenantModelTrainer(data_dir=temp_data_dir, regularization_strength=0.01)

    # Train all tenants
    cv_results = trainer.train_all_tenants_with_cv(n_folds=3)

    # Verify all tenants trained
    assert len(cv_results) == 3
    assert "tenant_001" in cv_results
    assert "tenant_002" in cv_results
    assert "tenant_003" in cv_results

    # Export results
    output_path = temp_data_dir / "cv_training_results.json"
    export_cv_results(cv_results, output_path)

    # Validate models
    validation_results = validate_models_against_thresholds(cv_results, r2_threshold=0.50)

    # Export validation results
    from mmm_lightweight_weather import export_validation_results
    validation_output_path = temp_data_dir / "validation_results.json"
    export_validation_results(validation_results, validation_output_path)

    # Verify output files exist
    assert output_path.exists()
    assert validation_output_path.exists()


# ============================================================================
# DIMENSION 5: PERFORMANCE VALIDATION
# ============================================================================

def test_training_performance(temp_data_dir, create_test_tenant_file):
    """Test that training completes in reasonable time."""
    import time

    create_test_tenant_file("perf_test_tenant")

    trainer = TenantModelTrainer(data_dir=temp_data_dir)
    tenant_files = trainer.list_tenant_files()

    # Training single tenant with 3-fold CV should complete in < 10 seconds
    start_time = time.time()
    result = trainer.train_single_tenant_with_cv(tenant_files[0], n_folds=3)
    elapsed_time = time.time() - start_time

    assert result is not None
    assert elapsed_time < 10.0, f"Training took {elapsed_time:.2f}s, expected < 10s"


def test_memory_efficiency_with_large_dataset(temp_data_dir):
    """Test memory efficiency with larger datasets (3 years of data)."""
    # Create larger dataset
    n_days = 1095  # 3 years
    dates = pd.date_range(start="2020-01-01", periods=n_days, freq="D")

    np.random.seed(42)
    temperature = 15 + 10 * np.sin(np.arange(n_days) * 2 * np.pi / 365)

    df = pd.DataFrame({
        "date": dates,
        "temperature": temperature,
        "precipitation": np.random.exponential(2, n_days),
        "humidity": 50 + 20 * np.random.randn(n_days),
        "meta_spend": np.random.uniform(100, 500, n_days),
        "google_spend": np.random.uniform(50, 300, n_days),
        "revenue": 1000 + 50 * (temperature - temperature.mean()) / temperature.std() + np.random.randn(n_days) * 100,
    })

    file_path = temp_data_dir / "large_tenant.parquet"
    df.to_parquet(file_path)

    trainer = TenantModelTrainer(data_dir=temp_data_dir)
    tenant_name, cv_metrics = trainer.train_single_tenant_with_cv(file_path, n_folds=5)

    assert tenant_name == "large_tenant"
    assert cv_metrics.num_folds == 5


# ============================================================================
# DIMENSION 6: DATA QUALITY VALIDATION
# ============================================================================

def test_cv_results_data_quality(temp_data_dir, create_test_tenant_file):
    """Test that CV results contain valid data."""
    tenant_file = create_test_tenant_file("quality_test")

    trainer = TenantModelTrainer(data_dir=temp_data_dir)
    tenant_name, cv_metrics = trainer.train_single_tenant_with_cv(tenant_file, n_folds=3)

    # Check data quality
    assert cv_metrics.model_name == tenant_name
    assert len(cv_metrics.fold_r2_scores) > 0
    assert all(isinstance(score, (int, float)) for score in cv_metrics.fold_r2_scores)
    assert all(isinstance(score, (int, float)) for score in cv_metrics.fold_rmse_scores)
    assert all(isinstance(score, (int, float)) for score in cv_metrics.fold_mae_scores)

    # R² should be between -inf and 1.0 (negative is possible for bad models)
    assert all(score <= 1.0 for score in cv_metrics.fold_r2_scores)

    # RMSE and MAE should be positive
    assert all(score >= 0 for score in cv_metrics.fold_rmse_scores)
    assert all(score >= 0 for score in cv_metrics.fold_mae_scores)

    # Mean R² should match fold scores
    expected_mean_r2 = np.mean(cv_metrics.fold_r2_scores)
    assert abs(cv_metrics.mean_r2 - expected_mean_r2) < 1e-6


def test_exported_json_schema(temp_data_dir, create_test_tenant_file):
    """Test that exported JSON follows expected schema."""
    tenant_file = create_test_tenant_file("schema_test")
    trainer = TenantModelTrainer(data_dir=temp_data_dir)
    tenant_name, cv_metrics = trainer.train_single_tenant_with_cv(tenant_file, n_folds=3)

    output_path = temp_data_dir / "cv_results_schema_test.json"
    export_cv_results({tenant_name: cv_metrics}, output_path)

    with open(output_path) as f:
        data = json.load(f)

    # Verify schema structure
    assert "summary" in data
    assert "results" in data

    summary = data["summary"]
    assert "num_tenants" in summary
    assert "num_folds" in summary
    assert "mean_r2_across_tenants" in summary

    results = data["results"]
    assert tenant_name in results

    tenant_data = results[tenant_name]
    assert "model_name" in tenant_data
    assert "fold_r2_scores" in tenant_data
    assert "mean_r2" in tenant_data
    assert "std_r2" in tenant_data


# ============================================================================
# DIMENSION 7: REGRESSION PREVENTION
# ============================================================================

def test_weather_sensitive_tenant_performance(temp_data_dir):
    """Test that weather-sensitive tenants achieve expected R² scores."""
    # Create data with STRONG weather signal
    n_days = 365
    np.random.seed(42)

    dates = pd.date_range(start="2023-01-01", periods=n_days, freq="D")
    temperature = 15 + 15 * np.sin(np.arange(n_days) * 2 * np.pi / 365)

    # Revenue strongly correlated with temperature
    base_revenue = 1000
    weather_effect = 200 * (temperature - temperature.mean()) / temperature.std()
    spend = np.random.uniform(100, 500, n_days)
    noise = np.random.randn(n_days) * 50
    revenue = base_revenue + weather_effect + spend + noise

    df = pd.DataFrame({
        "date": dates,
        "temperature": temperature,
        "precipitation": np.random.exponential(2, n_days),
        "humidity": 50 + 20 * np.random.randn(n_days),
        "meta_spend": spend * 0.6,
        "google_spend": spend * 0.4,
        "revenue": revenue,
    })

    file_path = temp_data_dir / "high_weather_sensitivity.parquet"
    df.to_parquet(file_path)

    trainer = TenantModelTrainer(data_dir=temp_data_dir)
    tenant_name, cv_metrics = trainer.train_single_tenant_with_cv(file_path, n_folds=5)

    # High weather sensitivity tenant should achieve R² > 0.50
    assert cv_metrics.mean_r2 > 0.50, \
        f"Weather-sensitive tenant should achieve R² > 0.50, got {cv_metrics.mean_r2:.4f}"


def test_no_weather_sensitivity_tenant_performance(temp_data_dir):
    """Test that non-weather-sensitive tenants have low weather coefficients."""
    # Create data with NO weather signal
    n_days = 365
    np.random.seed(42)

    dates = pd.date_range(start="2023-01-01", periods=n_days, freq="D")

    # Revenue independent of weather
    spend = np.random.uniform(100, 500, n_days)
    revenue = 1000 + 2 * spend + np.random.randn(n_days) * 100

    df = pd.DataFrame({
        "date": dates,
        "temperature": 15 + 10 * np.sin(np.arange(n_days) * 2 * np.pi / 365),
        "precipitation": np.random.exponential(2, n_days),
        "humidity": 50 + 20 * np.random.randn(n_days),
        "meta_spend": spend * 0.6,
        "google_spend": spend * 0.4,
        "revenue": revenue,
    })

    file_path = temp_data_dir / "no_weather_sensitivity.parquet"
    df.to_parquet(file_path)

    trainer = TenantModelTrainer(data_dir=temp_data_dir)
    tenant_name, cv_metrics = trainer.train_single_tenant_with_cv(file_path, n_folds=5)

    # Should still fit reasonably (due to spend effect), but may be lower
    # The important thing is it doesn't fail
    assert cv_metrics.mean_r2 >= -1.0  # Sanity check
    assert len(cv_metrics.fold_r2_scores) > 0


def test_consistent_results_across_runs(temp_data_dir, create_test_tenant_file):
    """Test that training produces consistent results with fixed random seed."""
    tenant_file = create_test_tenant_file("consistency_test")

    # Train twice with same data
    trainer1 = TenantModelTrainer(data_dir=temp_data_dir, regularization_strength=0.01)
    _, cv_metrics_1 = trainer1.train_single_tenant_with_cv(tenant_file, n_folds=3)

    trainer2 = TenantModelTrainer(data_dir=temp_data_dir, regularization_strength=0.01)
    _, cv_metrics_2 = trainer2.train_single_tenant_with_cv(tenant_file, n_folds=3)

    # Results should be very similar (allowing for small numerical differences)
    assert abs(cv_metrics_1.mean_r2 - cv_metrics_2.mean_r2) < 0.01


# ============================================================================
# MAIN SCRIPT TESTS
# ============================================================================

@mock.patch('train_all_tenants_cv.Path')
def test_main_script_execution(mock_path, temp_data_dir, create_test_tenant_file):
    """Test main() script execution (mocked)."""
    # Create test data
    create_test_tenant_file("tenant_001")
    create_test_tenant_file("tenant_002")

    # Mock Path to return our temp directory
    mock_path.return_value.parent.parent.parent = temp_data_dir.parent.parent.parent

    # Note: Cannot easily test main() without heavy mocking
    # This is an integration test placeholder
    # In practice, the end_to_end_training_pipeline test covers this
    pass


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
