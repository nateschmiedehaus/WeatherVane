"""Tests for weather-aware lightweight MMM."""

import json
import pytest
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta

from apps.model.mmm_lightweight_weather import (
    WeatherAwareMMM,
    WeatherAwareMMResult,
    CrossValidationMetrics,
    TenantModelTrainer,
    ModelValidationResult,
    load_synthetic_tenant_data,
    get_weather_columns,
    get_spend_columns,
    validate_models_against_thresholds,
    summarize_validation_results,
    export_validation_results,
    load_cv_results_from_json,
)


class TestGeometricAdstock:
    """Tests for adstock transformation."""

    def test_adstock_zero_lag(self):
        """Test that zero lag returns unchanged data."""
        mmm = WeatherAwareMMM()
        spend = np.array([100.0, 200.0, 300.0])
        result = mmm._geometric_adstock(spend, lag=0)
        np.testing.assert_array_almost_equal(result, spend)

    def test_adstock_applies_decay(self):
        """Test that adstock applies decay correctly."""
        mmm = WeatherAwareMMM()
        spend = np.array([1.0, 0.0, 0.0])
        result = mmm._geometric_adstock(spend, lag=2, decay=0.5)

        # Should have weight 1.0, 0.5, 0.25 normalized
        assert result[0] > 0
        assert result[1] > 0  # Decay from previous period

    def test_adstock_long_lag(self):
        """Test adstock with longer lag window."""
        mmm = WeatherAwareMMM()
        spend = np.array([100.0] * 10)
        result = mmm._geometric_adstock(spend, lag=4, decay=0.6)

        assert len(result) == 10
        assert np.all(np.isfinite(result))


class TestHillSaturation:
    """Tests for Hill saturation curve."""

    def test_saturation_zero_input(self):
        """Test that saturation of zero is zero."""
        mmm = WeatherAwareMMM()
        result = mmm._hill_saturation(np.array([0.0]))
        assert result[0] == 0.0

    def test_saturation_at_k(self):
        """Test that saturation at k point is 0.5."""
        mmm = WeatherAwareMMM()
        k = 100.0
        s = 1.0
        result = mmm._hill_saturation(np.array([k]), k=k, s=s)
        assert result[0] == pytest.approx(0.5, abs=0.01)

    def test_saturation_diminishing_returns(self):
        """Test that saturation shows diminishing returns."""
        mmm = WeatherAwareMMM()
        x_values = np.array([10.0, 50.0, 100.0, 200.0])
        result = mmm._hill_saturation(x_values, k=100.0, s=1.0)

        # Increments should decrease
        diff1 = result[1] - result[0]
        diff2 = result[2] - result[1]
        diff3 = result[3] - result[2]
        assert diff1 > diff2 > diff3


class TestWeatherAwareMMM:
    """Tests for WeatherAwareMMM class."""

    def test_initialization(self):
        """Test MMM initialization."""
        mmm = WeatherAwareMMM(
            adstock_lags={"tv": 14, "online": 0},
            weather_features=["temperature", "precipitation"],
        )
        assert len(mmm.adstock_lags) == 2
        assert len(mmm.weather_features) == 2

    def test_init_default_parameters(self):
        """Test initialization with defaults."""
        mmm = WeatherAwareMMM()
        assert len(mmm.adstock_lags) > 0
        assert len(mmm.weather_features) > 0

    def test_build_feature_matrix_shape(self):
        """Test feature matrix construction."""
        n_periods = 100
        spend_df = pd.DataFrame({
            "tv": np.random.rand(n_periods) * 1000,
            "online": np.random.rand(n_periods) * 500,
        })
        weather_df = pd.DataFrame({
            "temperature": np.random.rand(n_periods) * 30 + 10,
            "humidity": np.random.rand(n_periods) * 100,
            "precipitation": np.random.rand(n_periods) * 50,
        })

        mmm = WeatherAwareMMM()
        X = mmm._build_feature_matrix(spend_df, weather_df, ["tv", "online"])

        # Should have:
        # - 2 channels (adstocked)
        # - 2 channels (saturated)
        # - 3 weather features
        # - 2*3 = 6 interactions
        # Total: 2 + 2 + 3 + 6 = 13 features
        assert X.shape == (n_periods, 13)

    def test_fit_basic(self):
        """Test basic model fitting."""
        n_periods = 200
        spend_df = pd.DataFrame({
            "tv": np.random.rand(n_periods) * 1000,
            "online": np.random.rand(n_periods) * 500,
        })
        weather_df = pd.DataFrame({
            "temperature": np.sin(np.arange(n_periods) / 50) * 10 + 20,
            "humidity": np.ones(n_periods) * 65,
            "precipitation": np.random.rand(n_periods) * 10,
        })
        y = (
            spend_df["tv"] * 0.1
            + spend_df["online"] * 0.2
            + weather_df["temperature"] * 100
            + np.random.randn(n_periods) * 100
        )

        mmm = WeatherAwareMMM()
        result = mmm.fit(spend_df, weather_df, y)

        # Should have fitted coefficients
        assert result.coefficients is not None
        assert len(result.coefficients) > 0
        assert result.train_r2 > 0
        assert 0 <= result.train_r2 <= 1

    def test_fit_produces_valid_result(self):
        """Test that fit produces valid WeatherAwareMMResult."""
        n_periods = 150
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1000,
            "online": np.ones(n_periods) * 500,
        })
        weather_df = pd.DataFrame({
            "temperature": np.ones(n_periods) * 20,
            "humidity": np.ones(n_periods) * 65,
            "precipitation": np.zeros(n_periods),
        })
        y = np.ones(n_periods) * 10000

        mmm = WeatherAwareMMM()
        result = mmm.fit(spend_df, weather_df, y)

        assert isinstance(result, WeatherAwareMMResult)
        assert result.model_name == "weather_aware_mmm"
        assert len(result.predictions_train) == n_periods
        assert len(result.feature_names) > 0

    def test_fit_with_validation_data(self):
        """Test fitting with validation data."""
        n_train = 150
        n_val = 50

        spend_train = pd.DataFrame({
            "tv": np.random.rand(n_train) * 1000,
            "online": np.random.rand(n_train) * 500,
        })
        weather_train = pd.DataFrame({
            "temperature": np.random.rand(n_train) * 30 + 10,
            "humidity": np.ones(n_train) * 65,
            "precipitation": np.random.rand(n_train) * 10,
        })
        # Create synthetic target with weather signal
        y_train = (
            spend_train["tv"].values * 0.1 +
            spend_train["online"].values * 0.2 +
            weather_train["temperature"].values * 50 +
            np.random.randn(n_train) * 100
        )

        spend_val = pd.DataFrame({
            "tv": np.random.rand(n_val) * 1000,
            "online": np.random.rand(n_val) * 500,
        })
        weather_val = pd.DataFrame({
            "temperature": np.random.rand(n_val) * 30 + 10,
            "humidity": np.ones(n_val) * 65,
            "precipitation": np.random.rand(n_val) * 10,
        })
        y_val = (
            spend_val["tv"].values * 0.1 +
            spend_val["online"].values * 0.2 +
            weather_val["temperature"].values * 50 +
            np.random.randn(n_val) * 100
        )

        mmm = WeatherAwareMMM()
        result = mmm.fit(
            spend_train,
            weather_train,
            y_train,
            X_spend_val=spend_val,
            X_weather_val=weather_val,
            y_val=y_val,
        )

        # Val R2 should be computed (can be negative for bad models)
        assert result.val_r2 >= -1
        assert len(result.predictions_val) == n_val

    def test_extract_weather_elasticity(self):
        """Test weather elasticity extraction."""
        n_periods = 150
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1000,
        })
        weather_df = pd.DataFrame({
            "temperature": np.arange(n_periods) * 0.1,
            "humidity": np.ones(n_periods) * 65,
            "precipitation": np.zeros(n_periods),
        })
        y = weather_df["temperature"] * 100 + np.random.randn(n_periods) * 10

        mmm = WeatherAwareMMM()
        result = mmm.fit(spend_df, weather_df, y)

        elasticity = result.weather_elasticity
        assert "temperature" in elasticity or len(elasticity) > 0

    def test_estimate_channel_roas(self):
        """Test channel ROAS estimation."""
        n_periods = 150
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1000,
            "online": np.ones(n_periods) * 500,
        })
        weather_df = pd.DataFrame({
            "temperature": np.ones(n_periods) * 20,
            "humidity": np.ones(n_periods) * 65,
            "precipitation": np.zeros(n_periods),
        })
        y = spend_df["tv"] * 1.5 + spend_df["online"] * 2.0 + np.random.randn(n_periods) * 100

        mmm = WeatherAwareMMM()
        result = mmm.fit(spend_df, weather_df, y)

        assert result.channel_roas is not None
        assert len(result.channel_roas) > 0

    def test_compute_r2(self):
        """Test R² computation."""
        y_true = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        y_pred_perfect = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        y_pred_bad = np.array([3.0, 3.0, 3.0, 3.0, 3.0])  # Constant mean

        r2_perfect = WeatherAwareMMM._compute_r2(y_true, y_pred_perfect)
        r2_bad = WeatherAwareMMM._compute_r2(y_true, y_pred_bad)

        assert r2_perfect == pytest.approx(1.0)
        assert r2_bad == pytest.approx(0.0, abs=0.01)

    def test_predict_requires_fitting(self):
        """Test that predict fails before fitting."""
        mmm = WeatherAwareMMM()
        spend_df = pd.DataFrame({"tv": [1000.0]})
        weather_df = pd.DataFrame({"temperature": [20.0]})

        with pytest.raises(ValueError, match="not fitted"):
            mmm.predict(spend_df, weather_df, ["tv"])

    def test_predict_after_fitting(self):
        """Test prediction after fitting."""
        n_periods = 150
        spend_df = pd.DataFrame({
            "tv": np.random.rand(n_periods) * 1000,
            "online": np.random.rand(n_periods) * 500,
        })
        weather_df = pd.DataFrame({
            "temperature": np.random.rand(n_periods) * 30 + 10,
            "humidity": np.ones(n_periods) * 65,
            "precipitation": np.random.rand(n_periods) * 10,
        })
        y = spend_df["tv"] * 0.1 + spend_df["online"] * 0.2 + np.random.randn(n_periods) * 100

        mmm = WeatherAwareMMM()
        mmm.fit(spend_df, weather_df, y)

        # Test prediction
        spend_test = pd.DataFrame({
            "tv": [1000.0],
            "online": [500.0],
        })
        weather_test = pd.DataFrame({
            "temperature": [22.0],
            "humidity": [65.0],
            "precipitation": [5.0],
        })

        y_pred = mmm.predict(spend_test, weather_test, ["tv", "online"])
        assert len(y_pred) == 1
        assert np.isfinite(y_pred[0])

    def test_adstock_impacts_saturation(self):
        """Test that adstocking affects saturation."""
        mmm = WeatherAwareMMM(adstock_lags={"tv": 7})
        spend_df = pd.DataFrame({
            "tv": [1000.0] * 10,
        })
        weather_df = pd.DataFrame({
            "temperature": [20.0] * 10,
            "humidity": [65.0] * 10,
            "precipitation": [0.0] * 10,
        })
        y = np.arange(10, dtype=float)

        result = mmm.fit(spend_df, weather_df, y)

        # Adstocking should be in feature names
        assert any("adstocked" in fn for fn in result.feature_names)
        assert any("saturated" in fn for fn in result.feature_names)


class TestDataLoading:
    """Tests for data loading utilities."""

    def test_get_weather_columns_all_present(self):
        """Test weather column extraction when all present."""
        df = pd.DataFrame({
            "date": pd.date_range("2024-01-01", periods=10),
            "temperature": np.random.rand(10),
            "humidity": np.random.rand(10),
            "precipitation": np.random.rand(10),
            "revenue": np.random.rand(10),
        })
        cols = get_weather_columns(df)
        assert len(cols) == 3
        assert "temperature" in cols
        assert "humidity" in cols
        assert "precipitation" in cols

    def test_get_weather_columns_partial(self):
        """Test weather column extraction with partial columns."""
        df = pd.DataFrame({
            "temperature": np.random.rand(10),
            "revenue": np.random.rand(10),
        })
        cols = get_weather_columns(df)
        assert len(cols) == 1
        assert "temperature" in cols

    def test_get_weather_columns_none(self):
        """Test weather column extraction with no weather columns."""
        df = pd.DataFrame({
            "revenue": np.random.rand(10),
        })
        cols = get_weather_columns(df)
        assert len(cols) == 0

    def test_get_spend_columns_all_present(self):
        """Test spend column extraction when all present."""
        df = pd.DataFrame({
            "meta_spend": np.random.rand(10),
            "google_spend": np.random.rand(10),
            "revenue": np.random.rand(10),
        })
        cols = get_spend_columns(df)
        assert len(cols) == 2
        assert "meta_spend" in cols
        assert "google_spend" in cols

    def test_get_spend_columns_partial(self):
        """Test spend column extraction with partial columns."""
        df = pd.DataFrame({
            "meta_spend": np.random.rand(10),
            "revenue": np.random.rand(10),
        })
        cols = get_spend_columns(df)
        assert len(cols) == 1
        assert "meta_spend" in cols


class TestTenantModelTrainer:
    """Tests for TenantModelTrainer class."""

    @pytest.fixture
    def sample_tenant_df(self):
        """Create sample tenant dataframe."""
        n_days = 1000
        df = pd.DataFrame({
            "date": pd.date_range("2022-01-01", periods=n_days),
            "revenue": np.random.rand(n_days) * 100000,
            "units_sold": np.random.randint(100, 1000, n_days),
            "meta_spend": np.random.rand(n_days) * 5000,
            "google_spend": np.random.rand(n_days) * 5000,
            "temperature": np.random.rand(n_days) * 30,
            "humidity": np.random.rand(n_days) * 100,
            "precipitation": np.random.rand(n_days) * 50,
        })
        return df

    @pytest.fixture
    def temp_dir(self, tmp_path):
        """Create temporary directory for test data."""
        return tmp_path

    def test_trainer_initialization(self):
        """Test TenantModelTrainer initialization."""
        trainer = TenantModelTrainer()
        assert trainer.data_dir is not None
        assert trainer.regularization_strength == 0.01

    def test_trainer_custom_regularization(self):
        """Test trainer with custom regularization."""
        trainer = TenantModelTrainer(regularization_strength=0.1)
        assert trainer.regularization_strength == 0.1

    def test_list_tenant_files_empty(self, temp_dir):
        """Test listing tenant files in empty directory."""
        trainer = TenantModelTrainer(data_dir=temp_dir)
        files = trainer.list_tenant_files()
        assert len(files) == 0

    def test_list_tenant_files(self, temp_dir, sample_tenant_df):
        """Test listing tenant files."""
        # Create sample parquet file
        parquet_file = temp_dir / "tenant_001.parquet"
        sample_tenant_df.to_parquet(parquet_file)

        trainer = TenantModelTrainer(data_dir=temp_dir)
        files = trainer.list_tenant_files()
        assert len(files) == 1
        assert files[0].name == "tenant_001.parquet"

    def test_compute_aggregate_metrics_empty(self):
        """Test aggregate metrics with empty results."""
        metrics = TenantModelTrainer.compute_aggregate_metrics({})
        assert len(metrics) == 0

    def test_compute_aggregate_metrics(self):
        """Test aggregate metrics computation."""
        results = {
            "tenant_1": WeatherAwareMMResult(
                model_name="tenant_1",
                train_r2=0.8,
                val_r2=0.75,
                test_r2=0.70,
                weather_elasticity={},
                channel_roas={},
                coefficients={},
                predictions_train=np.array([]),
                predictions_val=np.array([]),
                predictions_test=np.array([]),
                feature_names=[],
            ),
            "tenant_2": WeatherAwareMMResult(
                model_name="tenant_2",
                train_r2=0.85,
                val_r2=0.80,
                test_r2=0.75,
                weather_elasticity={},
                channel_roas={},
                coefficients={},
                predictions_train=np.array([]),
                predictions_val=np.array([]),
                predictions_test=np.array([]),
                feature_names=[],
            ),
        }

        metrics = TenantModelTrainer.compute_aggregate_metrics(results)
        assert metrics["num_tenants"] == 2
        assert metrics["train_r2_mean"] == pytest.approx(0.825)
        assert metrics["val_r2_mean"] == pytest.approx(0.775)
        assert metrics["test_r2_mean"] == pytest.approx(0.725)
        assert metrics["pass_rate"] == 1.0  # Both pass R² >= 0.50

    def test_compute_aggregate_metrics_partial_passing(self):
        """Test aggregate metrics with partial passing models."""
        results = {
            "pass": WeatherAwareMMResult(
                model_name="pass",
                train_r2=0.8,
                val_r2=0.75,
                test_r2=0.60,
                weather_elasticity={},
                channel_roas={},
                coefficients={},
                predictions_train=np.array([]),
                predictions_val=np.array([]),
                predictions_test=np.array([]),
                feature_names=[],
            ),
            "fail": WeatherAwareMMResult(
                model_name="fail",
                train_r2=0.6,
                val_r2=0.45,
                test_r2=0.30,
                weather_elasticity={},
                channel_roas={},
                coefficients={},
                predictions_train=np.array([]),
                predictions_val=np.array([]),
                predictions_test=np.array([]),
                feature_names=[],
            ),
        }

        metrics = TenantModelTrainer.compute_aggregate_metrics(results)
        assert metrics["num_tenants"] == 2
        assert metrics["num_passing"] == 1
        assert metrics["pass_rate"] == 0.5


class TestTenantTrainingWithTimeSplit:
    """Tests for training with proper time series splits."""

    @pytest.fixture
    def sample_tenant_data(self):
        """Create sample tenant data for training."""
        n_days = 1000
        dates = pd.date_range("2022-01-01", periods=n_days)
        df = pd.DataFrame({
            "date": dates,
            "revenue": (
                np.sin(np.arange(n_days) / 100) * 50000 +
                np.random.rand(n_days) * 20000 +
                100000
            ),
            "meta_spend": np.random.rand(n_days) * 5000,
            "google_spend": np.random.rand(n_days) * 5000,
            "temperature": (
                15 + 10 * np.sin(np.arange(n_days) / 365 * 2 * np.pi) +
                np.random.rand(n_days) * 5
            ),
            "humidity": 65 + np.random.rand(n_days) * 20,
            "precipitation": np.random.rand(n_days) * 50,
        })
        return df

    def test_single_tenant_training(self, sample_tenant_data, tmp_path):
        """Test training on a single tenant."""
        # Save to parquet
        tenant_file = tmp_path / "test_tenant.parquet"
        sample_tenant_data.to_parquet(tenant_file)

        # Train
        trainer = TenantModelTrainer(data_dir=tmp_path)
        tenant_name, result = trainer.train_single_tenant(tenant_file)

        # Validate results
        assert tenant_name == "test_tenant"
        # R² can be negative when overfitting or model is worse than mean prediction
        # Just check that we have valid values
        assert isinstance(result.train_r2, (int, float))
        assert isinstance(result.val_r2, (int, float))
        assert isinstance(result.test_r2, (int, float))
        assert len(result.coefficients) > 0
        assert result.model_name == "test_tenant"
        assert len(result.predictions_train) > 0
        # Verify model is trained and has feature names
        assert len(result.feature_names) > 0


class TestCrossValidation:
    """Tests for k-fold cross-validation."""

    def test_cross_validate_basic(self):
        """Test basic cross-validation functionality."""
        n_periods = 200
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1000,
            "online": np.ones(n_periods) * 500,
        })
        weather_df = pd.DataFrame({
            "temperature": np.arange(n_periods) * 0.1 + 20,
            "humidity": np.ones(n_periods) * 65,
            "precipitation": np.random.rand(n_periods) * 5,
        })
        y = (
            spend_df["tv"].values * 0.1 +
            spend_df["online"].values * 0.2 +
            weather_df["temperature"].values * 50 +
            np.random.randn(n_periods) * 100
        )

        mmm = WeatherAwareMMM()
        cv_metrics = mmm.cross_validate(spend_df, weather_df, y, n_folds=3)

        # Validate structure
        assert isinstance(cv_metrics, CrossValidationMetrics)
        assert cv_metrics.num_folds == 3
        # First fold may be skipped if no training data, so at least 2 folds
        assert len(cv_metrics.fold_r2_scores) >= 2
        assert len(cv_metrics.fold_rmse_scores) >= 2
        assert len(cv_metrics.fold_mae_scores) >= 2

    def test_cross_validate_metrics_validity(self):
        """Test that cross-validation metrics are valid."""
        n_periods = 200
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1000,
        })
        weather_df = pd.DataFrame({
            "temperature": np.arange(n_periods) * 0.1 + 20,
        })
        y = spend_df["tv"].values * 0.1 + np.random.randn(n_periods) * 50

        mmm = WeatherAwareMMM()
        cv_metrics = mmm.cross_validate(spend_df, weather_df, y, n_folds=5)

        # Validate aggregated metrics
        assert isinstance(cv_metrics.mean_r2, float)
        assert isinstance(cv_metrics.std_r2, float)
        assert isinstance(cv_metrics.mean_rmse, float)
        assert isinstance(cv_metrics.mean_mae, float)

        # RMSE and MAE should be non-negative
        assert cv_metrics.mean_rmse >= 0
        assert cv_metrics.mean_mae >= 0

    def test_cross_validate_time_series_aware(self):
        """Test that cross-validation respects time-series ordering."""
        n_periods = 200
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1000,
        })
        weather_df = pd.DataFrame({
            "temperature": np.arange(n_periods) * 0.1 + 20,
        })
        y = spend_df["tv"].values * 0.1 + np.random.randn(n_periods) * 50

        mmm = WeatherAwareMMM()
        cv_metrics = mmm.cross_validate(spend_df, weather_df, y, n_folds=4)

        # Validate fold details (may have fewer folds if first fold skipped)
        assert len(cv_metrics.fold_details) >= 1
        for fold_detail in cv_metrics.fold_details:
            assert fold_detail["train_size"] > 0
            assert fold_detail["test_size"] > 0

        # Train size should increase or stay same as fold progresses (time-series aware)
        for i in range(1, len(cv_metrics.fold_details)):
            prev_train = cv_metrics.fold_details[i - 1]["train_size"]
            curr_train = cv_metrics.fold_details[i]["train_size"]
            assert curr_train >= prev_train

    def test_cross_validate_data_length_mismatch(self):
        """Test that CV fails with mismatched data lengths."""
        spend_df = pd.DataFrame({"tv": [1000.0] * 100})
        weather_df = pd.DataFrame({"temperature": [20.0] * 50})  # Wrong length
        y = np.ones(100)

        mmm = WeatherAwareMMM()
        with pytest.raises(ValueError, match="length mismatch"):
            mmm.cross_validate(spend_df, weather_df, y)

    def test_cross_validate_invalid_folds(self):
        """Test that CV fails with invalid fold count."""
        spend_df = pd.DataFrame({"tv": np.ones(100) * 1000})
        weather_df = pd.DataFrame({"temperature": np.ones(100) * 20})
        y = np.ones(100)

        mmm = WeatherAwareMMM()
        with pytest.raises(ValueError, match="n_folds must be >= 2"):
            mmm.cross_validate(spend_df, weather_df, y, n_folds=1)

    def test_cross_validate_elasticity_aggregation(self):
        """Test that weather elasticity is properly aggregated across folds."""
        n_periods = 150
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1000,
        })
        weather_df = pd.DataFrame({
            "temperature": np.arange(n_periods) * 0.1 + 20,
            "humidity": np.ones(n_periods) * 65,
        })
        y = (
            weather_df["temperature"].values * 50 +
            spend_df["tv"].values * 0.1 +
            np.random.randn(n_periods) * 100
        )

        mmm = WeatherAwareMMM(weather_features=["temperature", "humidity"])
        cv_metrics = mmm.cross_validate(spend_df, weather_df, y, n_folds=3)

        # Elasticity should be tracked per fold
        assert "temperature" in cv_metrics.weather_elasticity
        assert len(cv_metrics.weather_elasticity["temperature"]) <= 3

    def test_cross_validate_roas_aggregation(self):
        """Test that channel ROAS is properly aggregated across folds."""
        n_periods = 150
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1000,
            "online": np.ones(n_periods) * 500,
        })
        weather_df = pd.DataFrame({
            "temperature": np.ones(n_periods) * 20,
        })
        y = (
            spend_df["tv"].values * 1.5 +
            spend_df["online"].values * 2.0 +
            np.random.randn(n_periods) * 100
        )

        mmm = WeatherAwareMMM()
        cv_metrics = mmm.cross_validate(spend_df, weather_df, y, n_folds=3)

        # ROAS should be tracked per fold
        assert "tv" in cv_metrics.channel_roas
        assert "online" in cv_metrics.channel_roas

    def test_compute_rmse(self):
        """Test RMSE computation."""
        y_true = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        y_pred = np.array([1.0, 2.0, 3.0, 4.0, 5.0])

        rmse = WeatherAwareMMM._compute_rmse(y_true, y_pred)
        assert rmse == pytest.approx(0.0)

    def test_compute_mae(self):
        """Test MAE computation."""
        y_true = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        y_pred = np.array([1.5, 2.5, 2.5, 4.5, 5.5])

        mae = WeatherAwareMMM._compute_mae(y_true, y_pred)
        assert mae == pytest.approx(0.5)

    def test_tenant_trainer_cv_single(self, tmp_path):
        """Test training single tenant with cross-validation."""
        # Create sample tenant data
        n_days = 200
        sample_data = pd.DataFrame({
            "date": pd.date_range(start="2022-01-01", periods=n_days, freq="D"),
            "meta_spend": np.random.rand(n_days) * 5000,
            "google_spend": np.random.rand(n_days) * 3000,
            "temperature_celsius": np.random.rand(n_days) * 30,
            "relative_humidity_percent": np.random.rand(n_days) * 100,
            "precipitation_mm": np.random.rand(n_days) * 10,
            "revenue_usd": np.random.rand(n_days) * 50000,
        })

        # Save to parquet
        tenant_file = tmp_path / "test_tenant.parquet"
        sample_data.to_parquet(tenant_file)

        # Train with CV
        trainer = TenantModelTrainer(data_dir=tmp_path)
        tenant_name, cv_metrics = trainer.train_single_tenant_with_cv(
            tenant_file,
            n_folds=3,
        )

        # Validate results
        assert tenant_name == "test_tenant"
        assert isinstance(cv_metrics, CrossValidationMetrics)
        assert cv_metrics.num_folds == 3
        assert isinstance(cv_metrics.mean_r2, float)
        assert len(cv_metrics.fold_details) >= 1

    def test_cv_aggregate_metrics(self, tmp_path):
        """Test aggregate metrics computation for CV results."""
        # Create multiple tenants
        for i in range(2):
            n_days = 200
            sample_data = pd.DataFrame({
                "date": pd.date_range(start="2022-01-01", periods=n_days, freq="D"),
                "meta_spend": np.random.rand(n_days) * 5000,
                "google_spend": np.random.rand(n_days) * 3000,
                "temperature_celsius": np.random.rand(n_days) * 30,
                "relative_humidity_percent": np.random.rand(n_days) * 100,
                "precipitation_mm": np.random.rand(n_days) * 10,
                "revenue_usd": np.random.rand(n_days) * 50000,
            })
            tenant_file = tmp_path / f"tenant_{i}.parquet"
            sample_data.to_parquet(tenant_file)

        # Train all with CV
        trainer = TenantModelTrainer(data_dir=tmp_path)
        results = trainer.train_all_tenants_with_cv(n_folds=3)

        # Compute aggregates
        metrics = trainer.compute_cv_aggregate_metrics(results)

        # Validate aggregate metrics
        assert metrics["num_tenants"] == 2
        assert metrics["num_folds"] == 3
        assert isinstance(metrics["mean_r2_across_tenants"], float)
        assert isinstance(metrics["mean_rmse_across_tenants"], float)
        assert "pass_rate" in metrics


class TestModelValidation:
    """Tests for model validation against objective thresholds."""

    def create_mock_cv_results(self):
        """Create mock CV results for testing."""
        results = {
            "passing_model_1": CrossValidationMetrics(
                model_name="passing_model_1",
                fold_r2_scores=[0.55, 0.60, 0.58, 0.62],
                fold_rmse_scores=[100.0, 95.0, 98.0, 93.0],
                fold_mae_scores=[80.0, 75.0, 78.0, 73.0],
                mean_r2=0.5875,
                std_r2=0.03,
                mean_rmse=96.5,
                mean_mae=76.5,
                num_folds=4,
                feature_names=["spend", "temp", "humidity"],
                weather_elasticity={
                    "temperature": [1.0, 1.1, 0.9, 1.05],
                    "humidity": [-0.5, -0.6, -0.4, -0.55],
                },
                channel_roas={"meta": [5.0, 5.2, 4.8, 5.1], "google": [3.0, 3.1, 2.9, 3.0]},
            ),
            "passing_model_2": CrossValidationMetrics(
                model_name="passing_model_2",
                fold_r2_scores=[0.50, 0.55, 0.52],
                fold_rmse_scores=[110.0, 105.0, 108.0],
                fold_mae_scores=[90.0, 85.0, 88.0],
                mean_r2=0.523,
                std_r2=0.02,
                mean_rmse=107.67,
                mean_mae=87.67,
                num_folds=3,
                feature_names=["spend", "temp"],
                weather_elasticity={
                    "temperature": [1.2, 1.1, 1.15],
                    "humidity": [-0.7, -0.6, -0.65],
                },
                channel_roas={"meta": [6.0, 5.8, 5.9], "google": [2.5, 2.6, 2.55]},
            ),
            "failing_model_1": CrossValidationMetrics(
                model_name="failing_model_1",
                fold_r2_scores=[0.30, 0.35, 0.32, 0.38],
                fold_rmse_scores=[200.0, 195.0, 198.0, 193.0],
                fold_mae_scores=[160.0, 155.0, 158.0, 153.0],
                mean_r2=0.3375,
                std_r2=0.03,
                mean_rmse=196.5,
                mean_mae=156.5,
                num_folds=4,
                feature_names=["spend"],
                weather_elasticity={
                    "temperature": [0.5, 0.6, 0.4, 0.55],
                    "humidity": [-0.2, -0.3, -0.1, -0.25],
                },
                channel_roas={"meta": [2.0, 2.2, 1.8, 2.1], "google": [1.0, 1.1, 0.9, 1.0]},
            ),
            "failing_model_2": CrossValidationMetrics(
                model_name="failing_model_2",
                fold_r2_scores=[0.10, 0.15, 0.12],
                fold_rmse_scores=[250.0, 245.0, 248.0],
                fold_mae_scores=[200.0, 195.0, 198.0],
                mean_r2=0.123,
                std_r2=0.02,
                mean_rmse=247.67,
                mean_mae=197.67,
                num_folds=3,
                feature_names=["spend", "temp", "humidity", "precip"],
                weather_elasticity={
                    "temperature": [0.1, 0.15, 0.12],
                    "humidity": [-0.05, -0.1, -0.08],
                },
                channel_roas={"meta": [1.0, 1.1, 0.95], "google": [0.5, 0.6, 0.55]},
            ),
        }
        return results

    def test_validate_models_basic(self):
        """Test basic validation against R² threshold."""
        cv_results = self.create_mock_cv_results()

        validation_results = validate_models_against_thresholds(cv_results, r2_threshold=0.50)

        assert len(validation_results) == 4
        assert validation_results["passing_model_1"].passes_threshold is True
        assert validation_results["passing_model_2"].passes_threshold is True
        assert validation_results["failing_model_1"].passes_threshold is False
        assert validation_results["failing_model_2"].passes_threshold is False

    def test_validate_models_preserves_metrics(self):
        """Test that validation preserves original metrics."""
        cv_results = self.create_mock_cv_results()
        validation_results = validate_models_against_thresholds(cv_results)

        for tenant_name, cv_metric in cv_results.items():
            result = validation_results[tenant_name]
            assert result.mean_r2 == cv_metric.mean_r2
            assert result.num_folds == cv_metric.num_folds

    def test_validate_models_computes_mean_elasticity(self):
        """Test that mean weather elasticity is computed correctly."""
        cv_results = self.create_mock_cv_results()
        validation_results = validate_models_against_thresholds(cv_results)

        passing = validation_results["passing_model_1"]
        # Mean of [1.0, 1.1, 0.9, 1.05] ≈ 1.0125
        assert abs(passing.weather_elasticity["temperature"] - 1.0125) < 0.01
        # Mean of [-0.5, -0.6, -0.4, -0.55] = -0.5125
        assert abs(passing.weather_elasticity["humidity"] - (-0.5125)) < 0.01

    def test_validate_models_computes_mean_roas(self):
        """Test that mean channel ROAS is computed correctly."""
        cv_results = self.create_mock_cv_results()
        validation_results = validate_models_against_thresholds(cv_results)

        passing = validation_results["passing_model_1"]
        # Mean of [5.0, 5.2, 4.8, 5.1] = 5.025
        assert abs(passing.channel_roas["meta"] - 5.025) < 0.01
        # Mean of [3.0, 3.1, 2.9, 3.0] = 3.0
        assert abs(passing.channel_roas["google"] - 3.0) < 0.01

    def test_validate_models_custom_threshold(self):
        """Test validation with custom R² threshold."""
        cv_results = self.create_mock_cv_results()

        # With higher threshold, fewer models pass
        results_strict = validate_models_against_thresholds(cv_results, r2_threshold=0.55)
        passing_count = sum(1 for r in results_strict.values() if r.passes_threshold)
        assert passing_count < 2  # Only passing_model_1 should pass

        # With lower threshold, more models pass
        results_lenient = validate_models_against_thresholds(cv_results, r2_threshold=0.10)
        passing_count = sum(1 for r in results_lenient.values() if r.passes_threshold)
        assert passing_count == 4  # All models pass

    def test_summarize_validation_results(self):
        """Test summary computation across validation results."""
        cv_results = self.create_mock_cv_results()
        validation_results = validate_models_against_thresholds(cv_results)

        summary = summarize_validation_results(validation_results)

        assert summary["total_models"] == 4
        assert summary["passing_models"] == 2
        assert summary["failing_models"] == 2
        assert abs(summary["pass_rate"] - 0.5) < 0.01
        assert summary["threshold"] == 0.50
        assert "mean_r2_all" in summary
        assert "passing_model_names" in summary
        assert "failing_model_names" in summary

    def test_summarize_validation_includes_passing_names(self):
        """Test that summary includes correct model names."""
        cv_results = self.create_mock_cv_results()
        validation_results = validate_models_against_thresholds(cv_results)
        summary = summarize_validation_results(validation_results)

        assert set(summary["passing_model_names"]) == {
            "passing_model_1",
            "passing_model_2",
        }
        assert set(summary["failing_model_names"]) == {
            "failing_model_1",
            "failing_model_2",
        }

    def test_summarize_empty_results(self):
        """Test summarization with empty results."""
        summary = summarize_validation_results({})
        assert summary == {}

    def test_export_validation_results(self, tmp_path):
        """Test exporting validation results to JSON."""
        cv_results = self.create_mock_cv_results()
        validation_results = validate_models_against_thresholds(cv_results)

        output_file = tmp_path / "validation_results.json"
        export_validation_results(validation_results, output_file)

        assert output_file.exists()

        # Load and verify contents
        with open(output_file) as f:
            data = json.load(f)

        assert "summary" in data
        assert "results" in data
        assert data["summary"]["total_models"] == 4
        assert "passing_model_1" in data["results"]

    def test_load_cv_results_from_json(self, tmp_path):
        """Test loading CV results from JSON file."""
        # Create sample JSON data
        sample_data = {
            "summary": {"num_tenants": 1},
            "results": {
                "test_model": {
                    "model_name": "test_model",
                    "fold_r2_scores": [0.5, 0.55],
                    "fold_rmse_scores": [100.0, 95.0],
                    "fold_mae_scores": [80.0, 75.0],
                    "mean_r2": 0.525,
                    "std_r2": 0.035,
                    "mean_rmse": 97.5,
                    "mean_mae": 77.5,
                    "num_folds": 2,
                    "feature_names": ["spend", "temp"],
                    "weather_elasticity": {"temperature": [1.0, 1.1]},
                    "channel_roas": {"meta": [5.0, 5.1]},
                    "fold_details": [],
                }
            },
        }

        json_file = tmp_path / "cv_results.json"
        with open(json_file, "w") as f:
            json.dump(sample_data, f)

        # Load CV results
        cv_results = load_cv_results_from_json(json_file)

        assert "test_model" in cv_results
        assert cv_results["test_model"].mean_r2 == 0.525
        assert cv_results["test_model"].num_folds == 2

    def test_validation_result_dataclass(self):
        """Test ModelValidationResult dataclass."""
        result = ModelValidationResult(
            tenant_name="test_model",
            mean_r2=0.55,
            passes_threshold=True,
            r2_threshold=0.50,
            num_folds=5,
            weather_elasticity={"temperature": 1.0, "humidity": -0.5},
            channel_roas={"meta": 5.0, "google": 3.0},
        )

        assert result.tenant_name == "test_model"
        assert result.passes_threshold is True
        assert result.mean_r2 == 0.55
        assert result.r2_threshold == 0.50

    def test_validation_edge_cases(self):
        """Test validation with edge case R² values."""
        # R² exactly at threshold
        edge_results = {
            "exactly_at_threshold": CrossValidationMetrics(
                model_name="exactly_at_threshold",
                fold_r2_scores=[0.50],
                fold_rmse_scores=[100.0],
                fold_mae_scores=[80.0],
                mean_r2=0.50,
                std_r2=0.0,
                mean_rmse=100.0,
                mean_mae=80.0,
                num_folds=1,
                feature_names=["spend"],
                weather_elasticity={},
                channel_roas={},
            ),
        }

        validation_results = validate_models_against_thresholds(edge_results, r2_threshold=0.50)
        assert validation_results["exactly_at_threshold"].passes_threshold is True

    def test_validation_with_negative_r2(self):
        """Test validation handles negative R² scores."""
        neg_results = {
            "negative_r2": CrossValidationMetrics(
                model_name="negative_r2",
                fold_r2_scores=[-0.1, -0.05, -0.08],
                fold_rmse_scores=[200.0, 195.0, 198.0],
                fold_mae_scores=[160.0, 155.0, 158.0],
                mean_r2=-0.077,
                std_r2=0.025,
                mean_rmse=197.67,
                mean_mae=157.67,
                num_folds=3,
                feature_names=["spend"],
                weather_elasticity={},
                channel_roas={},
            ),
        }

        validation_results = validate_models_against_thresholds(neg_results)
        assert validation_results["negative_r2"].passes_threshold is False
        assert validation_results["negative_r2"].mean_r2 < 0
