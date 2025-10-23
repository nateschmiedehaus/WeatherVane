"""Test module imports."""
import pytest
import sys
print("Python path:", sys.path)

def test_import():
    """Test that we can import the module."""
    from shared.feature_store.weather_budget_constraints import (
        WeatherBudgetConstraint,
        calculate_weather_budget_multiplier,
    )
    assert True