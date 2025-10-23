"""Test suite for DMA-first geographic aggregation."""

import pytest
import json
from pathlib import Path

@pytest.fixture
def mock_crosswalk_data(tmp_path: Path) -> Path:
    """Create a mock DMA crosswalk file."""
    crosswalk = tmp_path / "dma_county_crosswalk.csv"
    crosswalk.write_text("""state_abbr,state_fips,county_fips,county_name,dma_code,dma_name
CA,06,06075,San Francisco,807,San Francisco-Oakland-San Jose
NY,36,36061,New York,501,New York
""")
    return crosswalk


@pytest.fixture
def mock_county_geometry(tmp_path: Path) -> Path:
    """Create a mock county geometry file."""
    geojson = tmp_path / "counties.geojson"
    geojson.write_text("""{
      "type": "FeatureCollection",
      "features": [
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [[
              [-122.419, 37.775],
              [-122.419, 37.785],
              [-122.409, 37.785],
              [-122.409, 37.775],
              [-122.419, 37.775]
            ]]
          },
          "properties": {
            "STATE": "CA",
            "NAME": "San Francisco"
          },
          "id": "06075"
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [[
              [-74.006, 40.712],
              [-74.006, 40.722],
              [-73.996, 40.722],
              [-73.996, 40.712],
              [-74.006, 40.712]
            ]]
          },
          "properties": {
            "STATE": "NY",
            "NAME": "New York"
          },
          "id": "36061"
        }
      ]
    }""")
    return geojson
import polars as pl
import numpy as np
from datetime import date

from shared.services.weather_taxonomy import WeatherGeographyService


def test_weather_geography_service_no_geohash():
    """Test behavior when frame has no geohash column."""
    frame = pl.DataFrame({
        "date": [date(2024, 1, 1)],
        "value": [1.0],
    })

    service = WeatherGeographyService()
    result = service.aggregate_frame(frame)

    # Should return original frame unchanged
    assert result.schema == frame.schema
    assert result.height == frame.height


def test_weather_geography_service_dma_level(mock_crosswalk_data, mock_county_geometry):
    """Test successful DMA-level aggregation."""
    frame = pl.DataFrame({
        "date": [date(2024, 1, 1)] * 2,
        "geohash": ["9q8yykc", "dr5reg"],  # SF and NYC
        "value": [1.0, 2.0],
    })

    service = WeatherGeographyService(
        geocoded_ratio=0.6,  # Above DMA threshold
        weather_coverage=0.9,  # Above DMA threshold
    )
    result = service.aggregate_frame(frame)

    assert "geo_level" in result.columns
    assert "geo_scope" in result.columns
    assert "dma_code" in result.columns
    assert "state_abbr" in result.columns

    # Check SF geohash resolution
    sf_row = result.filter(pl.col("geohash") == "9q8yykc").to_dict(as_series=False)
    assert sf_row["geo_level"][0] == "dma"
    assert sf_row["geo_scope"][0] == "DMA:807"
    assert sf_row["dma_code"][0] == "807"
    assert sf_row["state_abbr"][0] == "CA"

    # Check NYC geohash resolution
    nyc_row = result.filter(pl.col("geohash") == "dr5reg").to_dict(as_series=False)
    assert nyc_row["geo_level"][0] == "dma"
    assert nyc_row["geo_scope"][0] == "DMA:501"
    assert nyc_row["dma_code"][0] == "501"
    assert nyc_row["state_abbr"][0] == "NY"


def test_weather_geography_service_state_fallback(mock_crosswalk_data, mock_county_geometry):
    """Test fallback to state-level when DMA thresholds not met."""
    frame = pl.DataFrame({
        "date": [date(2024, 1, 1)] * 2,
        "geohash": ["9q8yykc", "dr5reg"],  # SF and NYC
        "value": [1.0, 2.0],
    })

    service = WeatherGeographyService(
        geocoded_ratio=0.3,  # Above state threshold
        weather_coverage=0.8,  # Above state threshold
    )
    result = service.aggregate_frame(frame)

    # Check SF geohash resolution
    sf_row = result.filter(pl.col("geohash") == "9q8yykc").to_dict(as_series=False)
    # Should be state level since geocoded_ratio is above STATE_MIN but below DMA_MIN
    assert sf_row["geo_level"][0] == "state"
    assert sf_row["geo_scope"][0] == "STATE:CA"
    assert sf_row["dma_code"][0] is None
    assert sf_row["state_abbr"][0] == "CA"

    # Check NYC geohash resolution
    nyc_row = result.filter(pl.col("geohash") == "dr5reg").to_dict(as_series=False)
    # Should be state level since geocoded_ratio is above STATE_MIN but below DMA_MIN
    assert nyc_row["geo_level"][0] == "state"
    assert nyc_row["geo_scope"][0] == "STATE:NY"
    assert nyc_row["dma_code"][0] is None
    assert nyc_row["state_abbr"][0] == "NY"


def test_weather_geography_service_global_fallback(mock_crosswalk_data, mock_county_geometry):
    """Test fallback to global when coverage thresholds not met."""
    frame = pl.DataFrame({
        "date": [date(2024, 1, 1)] * 2,
        "geohash": ["9q8yykc", "dr5reg"],  # SF and NYC
        "value": [1.0, 2.0],
    })

    service = WeatherGeographyService(
        geocoded_ratio=0.2,  # Below state threshold
        weather_coverage=0.6,  # Below state threshold
    )
    result = service.aggregate_frame(frame)

    # Check SF geohash resolution
    sf_row = result.filter(pl.col("geohash") == "9q8yykc").to_dict(as_series=False)
    assert sf_row["geo_level"][0] == "global"
    assert sf_row["geo_scope"][0] == "GLOBAL"
    assert sf_row["dma_code"][0] is None
    assert sf_row["state_abbr"][0] is None

    # Check NYC geohash resolution
    nyc_row = result.filter(pl.col("geohash") == "dr5reg").to_dict(as_series=False)
    assert nyc_row["geo_level"][0] == "global"
    assert nyc_row["geo_scope"][0] == "GLOBAL"
    assert nyc_row["dma_code"][0] is None
    assert nyc_row["state_abbr"][0] is None


def test_weather_geography_service_pandas_integration(mock_crosswalk_data, mock_county_geometry):
    """Test pandas DataFrame integration."""
    import pandas as pd

    df = pd.DataFrame({
        "date": [date(2024, 1, 1)] * 2,
        "geohash": ["9q8yykc", "dr5reg"],  # SF and NYC
        "value": [1.0, 2.0],
    })

    service = WeatherGeographyService(
        geocoded_ratio=0.6,  # Above DMA threshold
        weather_coverage=0.9,  # Above DMA threshold
    )
    result = service.aggregate_pandas(df)

    assert isinstance(result, pd.DataFrame)
    assert "geo_level" in result.columns
    assert "geo_scope" in result.columns
    assert "dma_code" in result.columns
    assert "state_abbr" in result.columns

    # Check SF geohash resolution
    sf_row = result[result["geohash"] == "9q8yykc"].iloc[0]
    assert sf_row["geo_level"] == "dma"
    assert sf_row["geo_scope"] == "DMA:807"
    assert sf_row["dma_code"] == "807"
    assert sf_row["state_abbr"] == "CA"