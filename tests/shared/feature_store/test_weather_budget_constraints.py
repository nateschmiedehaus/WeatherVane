"""Test weather budget constraints."""
import sys
from pathlib import Path

# Add project root to Python path
ROOT = str(Path(__file__).resolve().parent.parent.parent.parent)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import polars as pl
import pytest

from shared.feature_store.weather_budget_constraints import (
    WeatherBudgetConstraint,
    calculate_weather_budget_multiplier,
)