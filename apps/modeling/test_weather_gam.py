"""Tests for weather-aware GAM implementation."""

import numpy as np
import pandas as pd
import pytest
from datetime import datetime, timedelta

from apps.modeling.weather_gam import WeatherGAMModel, train_weather_gam

@pytest.fixture
def sample_data():
    """Generate synthetic data for testing."""
    np.random.seed(42)
    n_samples = 100

    # Generate dates
    dates = [datetime(2024, 1, 1) + timedelta(days=i) for i in range(n_samples)]

    # Generate features
    temp_c = 20 + 10 * np.sin(np.linspace(0, 4*np.pi, n_samples)) + np.random.normal(0, 2, n_samples)
    precip_mm = np.random.exponential(5, n_samples)
    facebook_spend = 100 + 50 * np.random.random(n_samples)
    google_spend = 150 + 75 * np.random.random(n_samples)

    # Generate target with non-linear effects and interactions
    base_revenue = 1000
    temp_effect = -0.5 * (temp_c - 22)**2  # Optimal temperature around 22°C
    precip_effect = -10 * np.log1p(precip_mm)
    spend_effect = 2 * np.sqrt(facebook_spend) + 1.5 * np.sqrt(google_spend)

    # Add weather-spend interactions
    temp_spend_interaction = 0.1 * temp_c * (facebook_spend + google_spend)

    net_revenue = (base_revenue + temp_effect + precip_effect + spend_effect +
                  temp_spend_interaction + np.random.normal(0, 50, n_samples))

    return pd.DataFrame({
        'date': dates,
        'temp_c': temp_c,
        'precip_mm': precip_mm,
        'facebook_spend': facebook_spend,
        'google_spend': google_spend,
        'net_revenue': net_revenue
    })

def test_model_initialization():
    """Test model initialization with valid features."""
    features = ['temp_c', 'precip_mm', 'facebook_spend']
    model = WeatherGAMModel(features=features)

    assert model.features == features
    assert model.source == "linear"
    assert model.coefficients is None
    assert model.gam is None

def test_weather_feature_identification():
    """Test correct identification of weather features."""
    features = ['temp_c', 'facebook_spend', 'precip_mm', 'other_metric']
    model = WeatherGAMModel(features=features)

    weather_features = model._identify_weather_features()
    assert 'temp_c' in weather_features
    assert 'precip_mm' in weather_features
    assert 'facebook_spend' not in weather_features
    assert 'other_metric' not in weather_features

def test_marketing_feature_identification():
    """Test correct identification of marketing features."""
    features = ['temp_c', 'facebook_spend', 'google_conversions', 'other_metric']
    model = WeatherGAMModel(features=features)

    marketing_features = model._identify_marketing_features()
    assert 'facebook_spend' in marketing_features
    assert 'google_conversions' in marketing_features
    assert 'temp_c' not in marketing_features
    assert 'other_metric' not in marketing_features

def test_data_requirements_check():
    """Test data requirements validation."""
    features = ['temp_c', 'facebook_spend']
    model = WeatherGAMModel(features=features)

    # Test with sufficient data
    df = pd.DataFrame({
        'temp_c': np.random.normal(20, 5, 50),
        'facebook_spend': np.random.random(50) * 100,
        'net_revenue': np.random.random(50) * 1000
    })
    assert model._check_data_requirements(df) is True

    # Test with insufficient rows
    small_df = df.head(10)
    assert model._check_data_requirements(small_df) is False

    # Test with non-numeric feature
    df_bad = df.copy()
    df_bad['temp_c'] = 'invalid'
    assert model._check_data_requirements(df_bad) is False

    # Test with constant feature
    df_bad = df.copy()
    df_bad['temp_c'] = 20.0
    assert model._check_data_requirements(df_bad) is False

def test_model_fitting_gam(sample_data):
    """Test GAM model fitting with sufficient data."""
    features = ['temp_c', 'precip_mm', 'facebook_spend', 'google_spend']
    model = WeatherGAMModel(features=features)

    model.fit(sample_data)

    assert model.source == "gam"
    assert model.gam is not None
    assert set(model.coefficients.keys()) == set(features)
    assert all(isinstance(v, float) for v in model.coefficients.values())

def test_model_fitting_linear():
    """Test linear fallback with insufficient data."""
    features = ['temp_c', 'facebook_spend']
    model = WeatherGAMModel(features=features)

    # Create small dataset
    df = pd.DataFrame({
        'temp_c': np.random.normal(20, 5, 20),
        'facebook_spend': np.random.random(20) * 100,
        'net_revenue': np.random.random(20) * 1000
    })

    model.fit(df)

    assert model.source == "linear"
    assert model.gam is None
    assert set(model.coefficients.keys()) == set(features)

def test_model_prediction(sample_data):
    """Test model prediction functionality."""
    features = ['temp_c', 'precip_mm', 'facebook_spend', 'google_spend']
    model = WeatherGAMModel(features=features)

    # Fit model
    model.fit(sample_data)

    # Generate predictions
    predictions = model.predict(sample_data)

    assert len(predictions) == len(sample_data)
    assert isinstance(predictions, np.ndarray)
    assert not np.any(np.isnan(predictions))

def test_feature_importance(sample_data):
    """Test feature importance calculation."""
    features = ['temp_c', 'precip_mm', 'facebook_spend', 'google_spend']
    model = WeatherGAMModel(features=features)

    # Fit model
    model.fit(sample_data)

    # Get feature importance
    importance = model.get_feature_importance()

    assert set(importance.keys()) == set(features)
    assert all(isinstance(v, float) for v in importance.values())
    assert np.isclose(sum(importance.values()), 1.0)

def test_roas_metrics(sample_data):
    """Test ROAS and elasticity calculations."""
    features = ['temp_c', 'precip_mm', 'facebook_spend', 'google_spend']
    model = WeatherGAMModel(features=features)

    # Fit model
    model.fit(sample_data)

    # Check ROAS metrics
    assert 'facebook_spend' in model.mean_roas
    assert 'google_spend' in model.mean_roas
    assert 'facebook_spend' in model.elasticity
    assert 'google_spend' in model.elasticity
    assert model.base_roas > 0

def test_missing_target_column():
    """Test error handling for missing target column."""
    features = ['temp_c', 'facebook_spend']
    model = WeatherGAMModel(features=features)

    df = pd.DataFrame({
        'temp_c': np.random.normal(20, 5, 50),
        'facebook_spend': np.random.random(50) * 100,
        'wrong_target': np.random.random(50) * 1000
    })

    with pytest.raises(ValueError, match="Target column 'net_revenue' not found"):
        model.fit(df)

def test_train_weather_gam(mocker):
    """Test the training function with mocked feature builder."""
    # Mock FeatureBuilder
    mock_df = pd.DataFrame({
        'temp_c': np.random.normal(20, 5, 50),
        'precip_mm': np.random.exponential(5, 50),
        'facebook_spend': np.random.random(50) * 100,
        'net_revenue': np.random.random(50) * 1000
    })

    mock_feature_builder = mocker.Mock()
    mock_feature_builder.build_features.return_value = mock_df
    mocker.patch('apps.modeling.weather_gam.FeatureBuilder',
                 return_value=mock_feature_builder)

    # Train model
    model = train_weather_gam(
        tenant_id="test_tenant",
        start=datetime(2024, 1, 1),
        end=datetime(2024, 3, 1)
    )

    assert isinstance(model, WeatherGAMModel)
    assert model.features == ['facebook_spend', 'temp_c', 'precip_mm']
    assert model.source in ["gam", "linear"]